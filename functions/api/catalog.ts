import { BOOTSTRAP_CATALOG } from '../../src/catalog/bootstrap';
import { catalogApiCacheKey, catalogApiEmptyProviderCacheKey } from '../../src/catalog/api-response-cache-keys';
import type { CatalogResponse, ModelOffer, PlanOffer, SourceProvenance } from '../../src/catalog/contracts';
import { validateCatalogResponse } from '../../src/catalog/validation';
import { cachedApiResponse, readApiResponseCache } from '../_shared/api-response-cache';

interface D1Statement {
  bind(...values: unknown[]): { all(): Promise<{ results: unknown[] }> };
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
  CATALOG_DB?: D1Database;
}

interface RevisionRow { revision: string; published_at: string; checked_at: string }
interface SourceRow { id: string; provider_id: string; source_url: string; observed_at: string; source_kind: SourceProvenance['sourceKind']; confidence: SourceProvenance['confidence']; snapshot_key: string | null; content_hash: string | null; parser_version: string | null; evidence_locator: string | null; review_status: SourceProvenance['reviewStatus'] | null }
interface PlanRow { id: string; provider_id: string; display_name: string; monthly_cost_micro_dollars: number; currency: 'USD'; entitlement_json: string; billing_cycle: PlanOffer['billingCycle'] | null; supported_model_ids_json: string | null; source_id: string }
interface ModelRow { id: string; provider_id: string; display_name: string; model_id: string; pricing_basis: ModelOffer['pricingBasis']; route: ModelOffer['route']; currency: 'USD'; unit: ModelOffer['unit']; input_micro_dollars_per_million: number; cached_input_micro_dollars_per_million: number | null; output_micro_dollars_per_million: number; context_window_tokens: number | null; max_output_tokens: number | null; availability: ModelOffer['availability'] | null; source_id: string }

async function all<T>(db: D1Database, query: string, ...values: unknown[]): Promise<T[]> {
  return (await db.prepare(query).bind(...values).all()).results as T[];
}

function parseStoredJson<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Published catalog ${field} contains invalid JSON`);
  }
}

/**
 * D1 revisions can predate a checked-in manual subscription manifest. Overlay
 * the verified monthly plans at read time so a newly deployed Pages build does
 * not hide plans until the next scheduled worker run. Models remain entirely
 * revisioned in D1; this overlay is intentionally limited to subscriptions.
 */
export function mergeManualSubscriptionPlans(catalog: CatalogResponse): CatalogResponse {
  const manualPlansById = new Map(BOOTSTRAP_CATALOG.plans.map((plan) => [plan.id, plan]));
  const plans = [
    ...manualPlansById.values(),
    ...catalog.plans.filter((plan) => !manualPlansById.has(plan.id)),
  ];
  const sourceIds = new Set([...manualPlansById.values()].map((plan) => plan.sourceId));
  const existingSourceIds = new Set(catalog.provenance.map((source) => source.id));
  const manualSources = BOOTSTRAP_CATALOG.provenance.filter((source) => sourceIds.has(source.id) && !existingSourceIds.has(source.id));
  return validateCatalogResponse({
    ...catalog,
    // Keep the upstream revision visible while making the overlay cache-keyed.
    revision: `${catalog.revision}+manual-${BOOTSTRAP_CATALOG.revision}`,
    plans,
    provenance: [...catalog.provenance, ...manualSources],
  });
}

export async function readPublishedCatalog(db: D1Database): Promise<CatalogResponse | null> {
  const revisions = await all<RevisionRow>(db,
    `SELECT revisions.revision, revisions.published_at, revisions.checked_at
      FROM catalog_publication_state AS publication
      INNER JOIN catalog_revisions AS revisions
        ON revisions.revision = publication.active_revision
      WHERE publication.singleton = 1
        AND revisions.publication_state = 'published'
      LIMIT 1`);
  const revision = revisions[0];
  if (!revision) return null;

  const [sources, plans, models] = await Promise.all([
    all<SourceRow>(db, 'SELECT * FROM source_records WHERE revision = ?', revision.revision),
    all<PlanRow>(db, 'SELECT * FROM plan_offers WHERE revision = ?', revision.revision),
    all<ModelRow>(db, 'SELECT * FROM model_offers WHERE revision = ?', revision.revision),
  ]);

  const isStale = Date.now() - Date.parse(revision.checked_at) > 24 * 60 * 60 * 1000;
  return validateCatalogResponse({
    revision: revision.revision,
    publishedAt: revision.published_at,
    freshness: isStale
      ? { status: 'stale', checkedAt: revision.checked_at, message: 'Published catalog has not refreshed within 24 hours.' }
      : { status: 'fresh', checkedAt: revision.checked_at },
    provenance: sources.map((source) => ({
      id: source.id, providerId: source.provider_id, sourceUrl: source.source_url, observedAt: source.observed_at,
      sourceKind: source.source_kind, confidence: source.confidence, ...(source.snapshot_key ? { snapshotKey: source.snapshot_key } : {}), ...(source.content_hash ? { contentHash: source.content_hash } : {}), ...(source.parser_version ? { parserVersion: source.parser_version } : {}), ...(source.evidence_locator ? { evidenceLocator: source.evidence_locator } : {}), ...(source.review_status ? { reviewStatus: source.review_status } : {}),
    })),
    plans: plans.map((plan): PlanOffer => ({
      id: plan.id, providerId: plan.provider_id, displayName: plan.display_name,
      monthlyCostMicroDollars: plan.monthly_cost_micro_dollars, currency: plan.currency,
      pricingBasis: 'subscription', route: 'subscription', entitlement: parseStoredJson<PlanOffer['entitlement']>(plan.entitlement_json, 'entitlement_json'), ...(plan.billing_cycle ? { billingCycle: plan.billing_cycle } : {}), ...(plan.supported_model_ids_json ? { supportedModelIds: parseStoredJson<string[]>(plan.supported_model_ids_json, 'supported_model_ids_json') } : {}), sourceId: plan.source_id,
    })),
    modelOffers: models.map((model): ModelOffer => ({
      id: model.id, providerId: model.provider_id, displayName: model.display_name, modelId: model.model_id,
      pricingBasis: model.pricing_basis, route: model.route, currency: model.currency, unit: model.unit,
      inputMicroDollarsPerMillion: model.input_micro_dollars_per_million,
      ...(model.cached_input_micro_dollars_per_million === null ? {} : { cachedInputMicroDollarsPerMillion: model.cached_input_micro_dollars_per_million }),
      outputMicroDollarsPerMillion: model.output_micro_dollars_per_million, ...(model.context_window_tokens === null ? {} : { contextWindowTokens: model.context_window_tokens }), ...(model.max_output_tokens === null ? {} : { maxOutputTokens: model.max_output_tokens }), ...(model.availability ? { availability: model.availability } : {}), sourceId: model.source_id,
    })),
  });
}

export function filterByProvider(catalog: CatalogResponse, providerId: string | null): CatalogResponse {
  if (!providerId) return catalog;
  const plans = catalog.plans.filter((offer) => offer.providerId === providerId);
  const modelOffers = catalog.modelOffers.filter((offer) => offer.providerId === providerId);
  const sourceIds = new Set([...plans, ...modelOffers].map((offer) => offer.sourceId));
  return { ...catalog, plans, modelOffers, provenance: catalog.provenance.filter((source) => source.providerId === providerId || sourceIds.has(source.id)) };
}

export interface CatalogApiCacheProjection {
  readonly cacheKey: string;
  readonly etagFresh: string;
  readonly etagStale: string;
  readonly bodyFresh: string;
  readonly bodyStale: string;
}

function staleCatalog(catalog: CatalogResponse): CatalogResponse {
  return {
    ...catalog,
    freshness: {
      ...catalog.freshness,
      status: 'stale',
      message: 'Published catalog has not refreshed within 24 hours; showing the last verified revision.',
    },
  };
}

/** Build immutable whole-catalog and provider-filtered bodies off the request path. */
export function catalogApiCacheProjections(catalog: CatalogResponse): readonly CatalogApiCacheProjection[] {
  const providerIds = [...new Set([
    ...catalog.plans.map((plan) => plan.providerId),
    ...catalog.modelOffers.map((offer) => offer.providerId),
  ])].sort();
  const projections = [null, ...providerIds].map((providerId) => {
    const filtered = filterByProvider(catalog, providerId);
    const freshEtag = `"${filtered.revision}"`;
    const staleEtag = `"${filtered.revision}:stale"`;
    return {
      cacheKey: catalogApiCacheKey(providerId),
      etagFresh: freshEtag,
      etagStale: staleEtag,
      bodyFresh: JSON.stringify(filtered),
      bodyStale: JSON.stringify(staleCatalog(filtered)),
    };
  });
  const empty = { ...catalog, provenance: [], plans: [], modelOffers: [] };
  projections.push({
    cacheKey: catalogApiEmptyProviderCacheKey(),
    etagFresh: `"${catalog.revision}"`,
    etagStale: `"${catalog.revision}:stale"`,
    bodyFresh: JSON.stringify(empty),
    bodyStale: JSON.stringify(staleCatalog(empty)),
  });
  return projections;
}

export async function onRequestGet({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const providerId = new URL(request.url).searchParams.get('provider');
  if (env.CATALOG_DB) {
    try {
      let cached = await readApiResponseCache(
        env.CATALOG_DB,
        'catalog',
        catalogApiCacheKey(providerId),
        24 * 60 * 60 * 1_000,
      );
      if (!cached && providerId) {
        cached = await readApiResponseCache(
          env.CATALOG_DB,
          'catalog',
          catalogApiEmptyProviderCacheKey(),
          24 * 60 * 60 * 1_000,
        );
      }
      if (cached) return cachedApiResponse(request, cached);
    } catch {
      // During migration rollout or before the first materialized publication,
      // preserve the existing verified D1/bootstrap read path below.
    }
  }
  let catalog = BOOTSTRAP_CATALOG;
  if (env.CATALOG_DB) {
    try {
      catalog = await readPublishedCatalog(env.CATALOG_DB) ?? BOOTSTRAP_CATALOG;
    } catch {
      catalog = { ...BOOTSTRAP_CATALOG, freshness: { ...BOOTSTRAP_CATALOG.freshness, message: 'Published catalog unavailable; serving checked-in bootstrap source records.' } };
    }
  }
  if (catalog !== BOOTSTRAP_CATALOG) catalog = mergeManualSubscriptionPlans(catalog);
  const filtered = filterByProvider(catalog.freshness.status === 'stale' ? staleCatalog(catalog) : catalog, providerId);
  const etag = `"${filtered.revision}${filtered.freshness.status === 'stale' ? ':stale' : ''}"`;
  const headers = new Headers({
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: etag,
    Vary: 'Accept-Encoding',
  });
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return Response.json(filtered, { headers });
}
