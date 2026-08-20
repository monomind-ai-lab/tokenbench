import {
  buildUiDataContractV1Envelope,
  type DataWarning,
  type EvidenceValue,
  type SourceAttribution,
} from '../../../src/pipeline/ui-data-contract-v1-core';
import {
  normalizeLifecycleRequest,
  SAFE_MODEL_SLUG,
  validateModelMethodData,
  type LifecycleData,
  type LifecycleProjectionItem,
  type LifecycleRequest,
} from '../../../src/pipeline/ui-data-contract-v1-models';
import {
  buildUnavailableUiDataEnvelope,
  jsonUiDataResponse,
} from '../../_shared/livebench-v1-api';

interface D1Statement {
  bind(...values: unknown[]): { all<T = unknown>(): Promise<{ results: T[] }> };
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface CatalogLifecycleContextRow {
  revision: string;
  checked_at: string;
  source_url: string;
  observed_at: string;
}

interface CatalogLifecycleModelRow {
  id: string;
  provider_id: string;
  display_name: string;
  model_id: string;
  expiration_date: string;
}

const PROJECTION_METHODOLOGY = 'endpoint-catalog-expiration-v1';
const DAY_MS = 24 * 60 * 60 * 1_000;

async function all<T>(db: D1Database, query: string, ...values: unknown[]): Promise<T[]> {
  return (await db.prepare(query).bind(...values).all<T>()).results;
}

function safeModelSlug(modelId: string): string {
  if (SAFE_MODEL_SLUG.test(modelId)) return modelId;
  const normalized = modelId
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/gu, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, '')
    .slice(0, 160);
  if (!SAFE_MODEL_SLUG.test(normalized)) throw new Error(`Catalog model ID ${modelId} cannot produce a safe public slug`);
  return normalized;
}

function available<T>(value: T, sourceRef: string): EvidenceValue<T> {
  return { availability: 'available', value, sourceRefs: [sourceRef] };
}

function unavailable<T>(reason: string, sourceRef: string): EvidenceValue<T> {
  return { availability: 'unavailable', value: null, reason, sourceRefs: [sourceRef] };
}

function buildLifecycleData(input: {
  readonly request: LifecycleRequest;
  readonly rows: readonly CatalogLifecycleModelRow[];
  readonly source: SourceAttribution;
}): { readonly data: LifecycleData; readonly warnings: readonly DataWarning[] } {
  const asOfMs = Date.parse(input.request.asOf);
  const earliestMs = asOfMs - input.request.horizonDays * DAY_MS;
  const latestMs = asOfMs + input.request.horizonDays * DAY_MS;
  const slugs = new Set<string>();
  const models: LifecycleProjectionItem[] = [];

  for (const row of input.rows) {
    const effectiveAt = `${row.expiration_date}T00:00:00.000Z`;
    const effectiveMs = Date.parse(effectiveAt);
    if (effectiveMs < earliestMs || effectiveMs > latestMs) continue;
    const slug = safeModelSlug(row.model_id);
    if (slugs.has(slug)) throw new Error(`Catalog lifecycle slug collision for ${slug}`);
    slugs.add(slug);
    const replacementReason = 'The catalog does not publish a replacement model for this lifecycle event.';
    models.push({
      identity: {
        configurationId: row.id,
        slug,
        displayName: row.display_name,
        organization: row.provider_id,
      },
      status: available(effectiveMs <= asOfMs ? 'retired' : 'sunset_scheduled', input.source.sourceRef),
      events: [{
        eventId: `expiration:${slug}:${row.expiration_date}`,
        eventType: 'expiration',
        effectiveAt,
        observedAt: input.source.observedAt,
        confidence: 'official',
      }],
      replacement: unavailable(replacementReason, input.source.sourceRef),
    });
  }
  models.sort((left, right) => (
    left.events[0]!.effectiveAt.localeCompare(right.events[0]!.effectiveAt)
      || left.identity.slug.localeCompare(right.identity.slug)
  ));
  const warnings = models.map((_, index): DataWarning => ({
    code: 'lifecycle_replacement_unavailable',
    fieldGroup: `/data/models/${index}/replacement`,
    state: 'unknown',
    message: 'The catalog does not publish a replacement model for this lifecycle event.',
  }));
  const data: LifecycleData = {
    asOf: input.request.asOf,
    horizonDays: input.request.horizonDays,
    models,
  };
  validateModelMethodData('lifecycle', data, input.request, [input.source]);
  return { data, warnings };
}

function unavailableResponse(request: LifecycleRequest, fetchedAt: string): Response {
  return jsonUiDataResponse(buildUnavailableUiDataEnvelope({
    method: 'lifecycle',
    request,
    fetchedAt,
    reason: 'No verified endpoint lifecycle metadata is available.',
  }), 404);
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env?: { CATALOG_DB?: D1Database };
}): Promise<Response> {
  const fetchedAt = new Date().toISOString();
  let normalized: LifecycleRequest;
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== 'asOf' && key !== 'horizonDays')) {
      throw new Error('unknown lifecycle parameter');
    }
    if (url.searchParams.getAll('asOf').length !== 1 || url.searchParams.getAll('horizonDays').length !== 1) {
      throw new Error('duplicate or missing lifecycle parameter');
    }
    normalized = normalizeLifecycleRequest({
      asOf: url.searchParams.get('asOf'),
      horizonDays: Number(url.searchParams.get('horizonDays')),
    });
  } catch {
    return jsonUiDataResponse({ error: { code: 'invalid_request', message: 'The lifecycle request is invalid.' } }, 400);
  }
  const db = env?.CATALOG_DB;
  if (!db) return unavailableResponse(normalized, fetchedAt);

  try {
    const contexts = await all<CatalogLifecycleContextRow>(db, `
      SELECT revisions.revision, revisions.checked_at, sources.source_url, sources.observed_at
      FROM catalog_publication_state AS publication
      INNER JOIN catalog_revisions AS revisions
        ON revisions.revision = publication.active_revision
      INNER JOIN source_records AS sources
        ON sources.revision = revisions.revision
       AND sources.id = 'openrouter-models'
      WHERE publication.singleton = 1
        AND revisions.publication_state = 'published'
      LIMIT 1`);
    const context = contexts[0];
    if (!context) return unavailableResponse(normalized, fetchedAt);
    const rows = await all<CatalogLifecycleModelRow>(db, `
      SELECT id, provider_id, display_name, model_id, expiration_date
      FROM model_offers
      WHERE revision = ?
        AND source_id = 'openrouter-models'
        AND expiration_date IS NOT NULL
      ORDER BY expiration_date ASC, model_id ASC`, context.revision);
    const source: SourceAttribution = {
      sourceRef: `catalog:${context.revision}:endpoint-lifecycle`,
      fieldGroup: '/data',
      sourceId: 'openrouter-models',
      sourceRevision: context.revision,
      label: 'Endpoint catalog lifecycle metadata',
      url: context.source_url,
      licenseId: 'OpenRouter-ToS',
      observedAt: context.observed_at,
      effectiveAt: context.observed_at,
    };
    const { data, warnings } = buildLifecycleData({ request: normalized, rows, source });
    return jsonUiDataResponse(buildUiDataContractV1Envelope({
      method: 'lifecycle',
      request: normalized,
      status: warnings.length === 0 ? 'available' : 'partial',
      reason: null,
      fetchedAt,
      data,
      revisions: {
        projection: `${PROJECTION_METHODOLOGY}:${context.revision}`,
        catalog: context.revision,
        benchmark: null,
        runtimeObservationSet: null,
        projectionMethodology: PROJECTION_METHODOLOGY,
      },
      freshness: {
        catalogObservedAt: context.checked_at,
        runtimeObservedAt: null,
        benchmarkReleasedAt: null,
        benchmarkCheckedAt: null,
      },
      sources: [source],
      warnings,
    }), 200, `"${PROJECTION_METHODOLOGY}:${context.revision}:${normalized.asOf}:${normalized.horizonDays}"`);
  } catch {
    return jsonUiDataResponse({
      error: {
        code: 'lifecycle_projection_failed',
        message: 'Published lifecycle metadata could not be projected.',
      },
    }, 503);
  }
}
