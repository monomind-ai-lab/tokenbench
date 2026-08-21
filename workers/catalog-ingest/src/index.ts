import type { ModelOffer, PlanOffer, SourceProvenance } from '../../../src/catalog/contracts';
import { buildManualSubscriptionSource as buildManifest, buildManualSubscriptionSources as buildManifests, MANUAL_SUBSCRIPTION_PROVIDER_IDS } from '../../../src/catalog/manual-manifests';
import { validateCatalogResponse } from '../../../src/catalog/validation';
import {
  catalogApiCacheProjections,
  mergeManualSubscriptionPlans,
  readPublishedCatalog,
} from '../../../functions/api/catalog';
import { splitApiResponseBody } from '../../../src/cache/api-response-chunks';

type BoundStatement = unknown;
export interface D1Database {
  prepare(sql: string): { bind(...values: unknown[]): BoundStatement };
  batch(statements: BoundStatement[]): Promise<unknown>;
}
interface R2Bucket {
  put(
    key: string,
    value: string | ArrayBufferView,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>
}

export interface IngestEnv {
  CATALOG_DB: D1Database;
  SOURCE_SNAPSHOTS: R2Bucket;
  AUTOMATED_SOURCE_IDS?: string;
  AUTOMATED_SUBSCRIPTION_SOURCE_IDS?: string;
  INGEST_COORDINATOR?: {
    getByName(name: string): {
      start(input: { scheduledTime: number; force?: boolean }): Promise<unknown>;
    };
  };
}
export interface ParsedSource { source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] }
export interface PreparedCatalogSource {
  readonly parsed: ParsedSource;
  readonly projectedBytes: Uint8Array;
  readonly originalContentHash: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
}
export interface PreparedOpenCodeModels {
  readonly payload: unknown;
  readonly projectedBytes: Uint8Array;
  readonly etag: string | null;
  readonly lastModified: string | null;
}
export interface PreparedOpenCodePricing {
  readonly pricingHtml: string;
  readonly projectedBytes: Uint8Array;
  readonly etag: string | null;
  readonly lastModified: string | null;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const OPENCODE_URL = 'https://opencode.ai/zen/v1/models';
const OPENCODE_PRICING_URL = 'https://opencode.ai/docs/zen/';
const MAX_CATALOG_RESPONSE_BYTES = 8 * 1024 * 1024;

const OPENROUTER_IDENTITY_FIELDS = [
  'id', 'canonical_slug', 'name', 'created', 'context_length',
] as const;
const OPENROUTER_TRAILING_FIELDS = [
  'per_request_limits', 'supported_parameters', 'expiration_date', 'knowledge_cutoff',
] as const;
const OPENROUTER_ARCHITECTURE_FIELDS = [
  'modality', 'input_modalities', 'output_modalities', 'tokenizer', 'instruct_type',
] as const;
const OPENROUTER_PRICING_FIELDS = [
  'prompt', 'completion', 'input_cache_read', 'input_cache_write',
] as const;
const OPENROUTER_TOP_PROVIDER_FIELDS = [
  'context_length', 'max_completion_tokens', 'is_moderated',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function binaryCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRecordFields(
  source: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(fields.flatMap((field) => Object.prototype.hasOwnProperty.call(source, field)
    ? [[field, source[field]]]
    : []));
}

function assertNoArtificialAnalysis(value: unknown): void {
  const serialized = JSON.stringify(value)
    .normalize('NFKC')
    .replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}_-]/gu, '')
    .toLowerCase();
  if (serialized.includes('artificialanalysis')) {
    throw new Error('OpenRouter projection contains prohibited Artificial Analysis data');
  }
}

/**
 * The catalog is an evidence boundary: only this stable `{data:[...]}`
 * projection may be parsed, hashed, or written to R2 for OpenRouter.
 */
export function projectOpenRouterModelsPayload(payload: unknown): { data: Record<string, unknown>[] } {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('OpenRouter payload must contain data');
  }

  const data = payload.data.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`OpenRouter model ${index} must be an object`);
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`OpenRouter model ${index} id is required for projection`);
    }
    const projected = projectRecordFields(entry, OPENROUTER_IDENTITY_FIELDS);
    for (const [field, fields] of [
      ['architecture', OPENROUTER_ARCHITECTURE_FIELDS],
      ['pricing', OPENROUTER_PRICING_FIELDS],
      ['top_provider', OPENROUTER_TOP_PROVIDER_FIELDS],
    ] as const) {
      if (!Object.prototype.hasOwnProperty.call(entry, field)) continue;
      if (!isRecord(entry[field])) throw new Error(`OpenRouter model ${index}.${field} must be an object`);
      projected[field] = projectRecordFields(entry[field], fields);
    }
    Object.assign(projected, projectRecordFields(entry, OPENROUTER_TRAILING_FIELDS));
    assertNoArtificialAnalysis(projected);
    return projected;
  }).sort((left, right) => binaryCompare(String(left.id), String(right.id)));

  return { data };
}

function microDollarsPerMillion(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`${label} pricing is required`);
  const [whole, fraction = ''] = value.split('.');
  const significantFraction = fraction.replace(/0+$/, '');
  if (significantFraction.length > 12) throw new Error(`${label} pricing exceeds micro-dollar precision`);
  const scaled = BigInt(whole) * 1_000_000_000_000n + BigInt(significantFraction.padEnd(12, '0'));
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} pricing is too large`);
  return Number(scaled);
}

function canonicalOpenRouterProviderId(modelId: string): string {
  const owner = (modelId.includes('/') ? modelId.split('/')[0] : 'openrouter').replace(/^~/, '');
  const aliases: Record<string, string> = {
    qwen: 'alibaba',
    'x-ai': 'xai',
    moonshotai: 'kimi',
    'z-ai': 'zai',
  };
  return aliases[owner] ?? owner;
}

function parseModels(
  payload: unknown,
  observedAt: string,
  route: ModelOffer['route'],
  sourceId: string,
  label: string,
): ParsedSource {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) throw new Error(`${label} payload must contain data`);
  const source: SourceProvenance = {
    id: sourceId, providerId: route === 'openrouter' ? 'openrouter' : 'opencode',
    sourceUrl: route === 'openrouter' ? OPENROUTER_URL : OPENCODE_URL, observedAt,
    sourceKind: 'official_json', confidence: 'official',
  };
  const modelOffers = (payload as { data: unknown[] }).data.flatMap((entry): ModelOffer[] => {
    if (!entry || typeof entry !== 'object') throw new Error(`${label} model must be an object`);
    const model = entry as { id?: unknown; name?: unknown; pricing?: Record<string, unknown>; context_length?: unknown; expiration_date?: unknown; top_provider?: { max_completion_tokens?: unknown } };
    if (typeof model.id !== 'string' || !model.id || typeof model.name !== 'string' || !model.name) throw new Error(`${label} model id and name are required`);
    const pricing = model.pricing;
    if (!pricing) throw new Error(`${label} model pricing is required`);
    const providerId = route === 'openrouter' ? canonicalOpenRouterProviderId(model.id) : source.providerId;
    const input = pricing.prompt ?? pricing.input;
    const output = pricing.completion ?? pricing.output;
    const cached = pricing.input_cache_read ?? pricing.cached_input;
    const cacheWrite = pricing.input_cache_write ?? pricing.cache_write;
    const expirationDate = model.expiration_date === null || model.expiration_date === undefined
      ? null
      : typeof model.expiration_date === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(model.expiration_date)
        && new Date(`${model.expiration_date}T00:00:00.000Z`).toISOString().slice(0, 10) === model.expiration_date
          ? model.expiration_date
          : (() => { throw new Error(`${label} model expiration_date must be a valid calendar date or null`); })();
    if (input === '-1' && output === '-1' && model.id.startsWith('openrouter/')) return [];
    return [{
      id: `${providerId}:${model.id}:${route}`, providerId, displayName: model.name, modelId: model.id,
      pricingBasis: route === 'openrouter' ? 'openrouter' : 'opencode_zen', route,
      currency: 'USD', unit: 'micro_dollars_per_million_tokens',
      inputMicroDollarsPerMillion: microDollarsPerMillion(input, label),
      ...(cached === undefined ? {} : { cachedInputMicroDollarsPerMillion: microDollarsPerMillion(cached, label) }),
      ...(cacheWrite === undefined ? {} : { cacheWriteMicroDollarsPerMillion: microDollarsPerMillion(cacheWrite, label) }),
      outputMicroDollarsPerMillion: microDollarsPerMillion(output, label), sourceId,
      ...(Number.isInteger(model.context_length) && (model.context_length as number) >= 0 ? { contextWindowTokens: model.context_length as number } : {}),
      ...(Number.isInteger(model.top_provider?.max_completion_tokens) && (model.top_provider?.max_completion_tokens as number) >= 0 ? { maxOutputTokens: model.top_provider?.max_completion_tokens as number } : {}),
      availability: expirationDate !== null && expirationDate <= observedAt.slice(0, 10) ? 'deprecated' : 'available',
      ...(expirationDate === null ? {} : { expirationDate }),
    }];
  });
  if (modelOffers.length === 0) throw new Error(`${label} payload must contain at least one model offer`);
  return { source, plans: [], modelOffers };
}

export function parseOpenRouterModels(payload: unknown, observedAt: string): ParsedSource {
  return parseModels(payload, observedAt, 'openrouter', 'openrouter-models', 'OpenRouter');
}

function decodeHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function htmlTables(html: string): string[][][] {
  return Array.from(html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi), ([, table]) =>
    Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), ([, row]) =>
      Array.from(row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi), ([, cell]) => decodeHtml(cell))),
  );
}

function dollarsPerMillionToMicroDollars(value: string, label: string): number {
  if (value === 'Free') return 0;
  const match = /^\$(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`${label} price is invalid`);
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > 6) throw new Error(`${label} price exceeds micro-dollar precision`);
  const result = BigInt(match[1]) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} price is too large`);
  return Number(result);
}

export function parseOpenCodeCatalog(modelsPayload: unknown, pricingHtml: string, observedAt: string): ParsedSource {
  if (!modelsPayload || typeof modelsPayload !== 'object' || !Array.isArray((modelsPayload as { data?: unknown }).data)) throw new Error('OpenCode payload must contain data');
  const endpointIds = new Set((modelsPayload as { data: unknown[] }).data.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof (entry as { id?: unknown }).id !== 'string' || !(entry as { id: string }).id) throw new Error('OpenCode model id is required');
    return (entry as { id: string }).id;
  }));
  const tables = htmlTables(pricingHtml);
  const modelTable = tables.find((table) => table[0]?.map((cell) => cell.toUpperCase()).join('|') === 'MODEL|MODEL ID|ENDPOINT|AI SDK PACKAGE');
  const pricingTable = tables.find((table) => table[0]?.map((cell) => cell.toUpperCase()).join('|') === 'MODEL|INPUT|OUTPUT|CACHED READ|CACHED WRITE');
  if (!modelTable || !pricingTable) throw new Error('OpenCode pricing tables are required');
  const idsByName = new Map(modelTable.slice(1).map((row) => [row[0], row[1]]));
  const modelOffers = pricingTable.slice(1).flatMap((row): ModelOffer[] => {
    const [displayName, input, output, cachedInput] = row;
    const modelId = idsByName.get(displayName);
    // The pricing page also lists deprecated IDs and context-tiered rows. The current
    // calculator only publishes exact, currently available one-rate matches.
    if (!modelId || !endpointIds.has(modelId)) return [];
    return [{
      id: `opencode:${modelId}:opencode_zen`, providerId: 'opencode', displayName, modelId,
      pricingBasis: 'opencode_zen', route: 'opencode_zen', currency: 'USD',
      unit: 'micro_dollars_per_million_tokens',
      inputMicroDollarsPerMillion: dollarsPerMillionToMicroDollars(input, 'OpenCode input'),
      ...(cachedInput === '-' ? {} : { cachedInputMicroDollarsPerMillion: dollarsPerMillionToMicroDollars(cachedInput, 'OpenCode cached input') }),
      outputMicroDollarsPerMillion: dollarsPerMillionToMicroDollars(output, 'OpenCode output'),
      availability: 'available', sourceId: 'opencode-zen',
    }];
  });
  if (modelOffers.length === 0) throw new Error('OpenCode pricing tables contain no exact available offers');
  return {
    source: {
      id: 'opencode-zen', providerId: 'opencode', sourceUrl: OPENCODE_PRICING_URL, observedAt,
      sourceKind: 'official_html', confidence: 'official', parserVersion: 'zen-docs-v1',
      evidenceLocator: 'Models pricing table', reviewStatus: 'verified',
    },
    plans: [], modelOffers,
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readBoundedResponseBytes(response: Response, label: string): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_CATALOG_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeds ${MAX_CATALOG_RESPONSE_BYTES} byte limit`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_CATALOG_RESPONSE_BYTES) {
        await reader.cancel('payload too large');
        throw new Error(`${label} response exceeds ${MAX_CATALOG_RESPONSE_BYTES} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function parseBoundedJsonResponse(response: Response, label: string): Promise<{ bytes: Uint8Array; payload: unknown }> {
  const bytes = await readBoundedResponseBytes(response, label);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} response is not valid UTF-8`);
  }
  try {
    return { bytes, payload: JSON.parse(text) };
  } catch {
    throw new Error(`${label} response is not valid JSON`);
  }
}

function responseValidators(response: Response): Pick<PreparedCatalogSource, 'etag' | 'lastModified'> {
  return {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

export async function prepareOpenRouterSource(
  response: Response,
  observedAt: string,
): Promise<PreparedCatalogSource> {
  if (!response.ok) throw new Error(`Catalog source ${OPENROUTER_URL} returned ${response.status}`);
  const { bytes, payload } = await parseBoundedJsonResponse(response, 'OpenRouter');
  const projectedPayload = projectOpenRouterModelsPayload(payload);
  const projectedBytes = new TextEncoder().encode(JSON.stringify(projectedPayload));
  return {
    parsed: parseOpenRouterModels(projectedPayload, observedAt),
    projectedBytes,
    originalContentHash: `sha256:${await sha256(bytes)}`,
    ...responseValidators(response),
  };
}

export async function prepareOpenCodeModels(response: Response): Promise<PreparedOpenCodeModels> {
  if (!response.ok) throw new Error(`Catalog source ${OPENCODE_URL} returned ${response.status}`);
  const { bytes, payload } = await parseBoundedJsonResponse(response, 'OpenCode models');
  return { payload, projectedBytes: bytes, ...responseValidators(response) };
}

export async function prepareOpenCodePricing(response: Response): Promise<PreparedOpenCodePricing> {
  if (!response.ok) throw new Error(`Catalog source ${OPENCODE_PRICING_URL} returned ${response.status}`);
  const projectedBytes = await readBoundedResponseBytes(response, 'OpenCode pricing');
  let pricingHtml: string;
  try {
    pricingHtml = new TextDecoder('utf-8', { fatal: true }).decode(projectedBytes);
  } catch {
    throw new Error('OpenCode pricing response is not valid UTF-8');
  }
  return { pricingHtml, projectedBytes, ...responseValidators(response) };
}

export function combineOpenCodeSource(
  models: PreparedOpenCodeModels,
  pricing: PreparedOpenCodePricing,
  observedAt: string,
): PreparedCatalogSource {
  return {
    parsed: parseOpenCodeCatalog(models.payload, pricing.pricingHtml, observedAt),
    projectedBytes: new TextEncoder().encode(JSON.stringify({
      models: models.payload,
      pricingHtml: pricing.pricingHtml,
    })),
    originalContentHash: null,
    etag: models.etag ?? pricing.etag,
    lastModified: models.lastModified ?? pricing.lastModified,
  };
}

function hasAll(statement: BoundStatement): statement is { all(): Promise<{ results: unknown[] }> } {
  return Boolean(statement) && typeof statement === 'object'
    && typeof (statement as { all?: unknown }).all === 'function';
}

/**
 * Publish every catalog response body and then move one cache pointer. The
 * response cache is deliberately a second transaction: if materialization
 * fails after a catalog refresh, Pages keeps serving the previous complete
 * cache revision instead of exposing a partial response set.
 */
export async function publishCatalogApiCache(db: D1Database, now: string): Promise<void> {
  const probe = db.prepare('SELECT active_revision FROM catalog_publication_state WHERE singleton = 1').bind();
  // Lightweight test doubles and older local schemas may not expose D1 reads.
  // Production D1 always does; migration rollout can therefore remain safe.
  if (!hasAll(probe)) return;

  const catalog = await readPublishedCatalog(db as Parameters<typeof readPublishedCatalog>[0]);
  if (!catalog) throw new Error('Cannot materialize catalog API cache without a published catalog');
  const expectedCatalogRevision = catalog.revision;
  const response = mergeManualSubscriptionPlans(catalog);
  const projections = catalogApiCacheProjections(response);
  if (projections.length === 0) throw new Error('Catalog API cache contains no projections');

  const scope = 'catalog';
  const revision = response.revision;
  const statements: BoundStatement[] = [
    db.prepare(`INSERT INTO api_response_revisions
      (scope, revision, checked_at, published_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(scope, revision) DO UPDATE SET
        checked_at = excluded.checked_at,
        published_at = excluded.published_at,
        created_at = excluded.created_at`).bind(
      scope,
      revision,
      response.freshness.checkedAt,
      response.publishedAt,
      now,
    ),
    db.prepare('DELETE FROM api_response_entries WHERE scope = ? AND revision = ?').bind(scope, revision),
  ];
  const variants = projections.flatMap((projection) => ([
    ['fresh', projection.etagFresh, projection.bodyFresh],
    ['stale', projection.etagStale, projection.bodyStale],
  ] as const).flatMap(([variant, etag, body]) => splitApiResponseBody(body).map((chunk, chunkIndex) => [
    scope, revision, projection.cacheKey, variant, chunkIndex, etag, chunk,
  ] as const)));
  // D1 permits 100 bound parameters per query. Fourteen seven-column rows keep
  // each statement under that ceiling and the ingestion Worker's query budget.
  for (let offset = 0; offset < variants.length; offset += 14) {
    const chunk = variants.slice(offset, offset + 14);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    statements.push(db.prepare(`INSERT INTO api_response_entries
      (scope, revision, cache_key, variant, chunk_index, etag, body)
      VALUES ${placeholders}`).bind(...chunk.flat()));
  }
  statements.push(db.prepare(`INSERT INTO api_response_publication_state
    (scope, active_revision, updated_at)
    SELECT ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM catalog_publication_state
      WHERE singleton = 1 AND active_revision = ?
    )
    ON CONFLICT(scope) DO UPDATE SET
      active_revision = excluded.active_revision,
      updated_at = excluded.updated_at
    WHERE EXISTS (
      SELECT 1 FROM catalog_publication_state
      WHERE singleton = 1 AND active_revision = ?
    )`).bind(scope, revision, now, expectedCatalogRevision, expectedCatalogRevision));
  statements.push(db.prepare(`DELETE FROM api_response_revisions
    WHERE scope = ? AND revision NOT IN (
      SELECT revisions.revision
      FROM api_response_revisions AS revisions
      LEFT JOIN api_response_publication_state AS publication
        ON publication.scope = revisions.scope
      WHERE revisions.scope = ?
      ORDER BY (revisions.revision = publication.active_revision) DESC,
        revisions.created_at DESC,
        revisions.revision DESC
      LIMIT 2
    )`).bind(scope, scope));
  await db.batch(statements);
}

export async function publishValidatedSource({
  db, snapshots, source, rawPayload, originalPayloadBytes, now,
}: {
  db: D1Database;
  snapshots: R2Bucket;
  source: ParsedSource;
  rawPayload: unknown;
  originalPayloadBytes?: Uint8Array;
  now: string;
}): Promise<{ revision: string; snapshotKey: string }> {
  const catalog = {
    revision: 'validation', publishedAt: now, freshness: { status: 'fresh' as const, checkedAt: now },
    provenance: [source.source], plans: source.plans, modelOffers: source.modelOffers,
  };
  validateCatalogResponse(catalog);
  const snapshotPayload = source.source.id === 'openrouter-models'
    ? projectOpenRouterModelsPayload(rawPayload)
    : rawPayload;
  const raw = JSON.stringify(snapshotPayload);
  const projectedBytes = new TextEncoder().encode(raw);
  const hash = await sha256(projectedBytes);
  let originalContentHash: string | null = null;
  if (source.source.id === 'openrouter-models') {
    if (!originalPayloadBytes) throw new Error('OpenRouter exact upstream bytes are required');
    originalContentHash = `sha256:${await sha256(originalPayloadBytes)}`;
  }
  const snapshotKey = `${source.source.id}/${now.slice(0, 10)}/${hash}.json`;
  await snapshots.put(snapshotKey, projectedBytes, {
    httpMetadata: { contentType: 'application/json' },
    ...(originalContentHash === null ? {} : { customMetadata: { original_content_hash: originalContentHash } }),
  });

  const revision = `rev_${now.replace(/[-:.TZ]/g, '')}_${hash.slice(0, 12)}`;
  const statements: BoundStatement[] = [
    db.prepare('INSERT INTO catalog_revisions (revision, published_at, checked_at, publication_state) VALUES (?, ?, ?, ?)').bind(revision, now, now, 'pending'),
    db.prepare("INSERT INTO source_records (revision, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key, content_hash, parser_version, evidence_locator, review_status) SELECT ?, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key, content_hash, parser_version, evidence_locator, review_status FROM source_records WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND id != ?").bind(revision, source.source.id),
    db.prepare("INSERT INTO plan_offers (revision, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, entitlement_evidence_json, billing_cycle, annual_cost_micro_dollars, annual_effective_monthly_cost_micro_dollars, supported_model_ids_json, source_id) SELECT ?, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, entitlement_evidence_json, billing_cycle, annual_cost_micro_dollars, annual_effective_monthly_cost_micro_dollars, supported_model_ids_json, source_id FROM plan_offers WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND source_id != ?").bind(revision, source.source.id),
    db.prepare("INSERT INTO model_offers (revision, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, cache_write_micro_dollars_per_million, output_micro_dollars_per_million, context_window_tokens, max_output_tokens, availability, expiration_date, source_id) SELECT ?, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, cache_write_micro_dollars_per_million, output_micro_dollars_per_million, context_window_tokens, max_output_tokens, availability, expiration_date, source_id FROM model_offers WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND source_id != ?").bind(revision, source.source.id),
    db.prepare('INSERT INTO source_records (revision, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key, content_hash, parser_version, evidence_locator, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, source.source.id, source.source.providerId, source.source.sourceUrl, source.source.observedAt, source.source.sourceKind, source.source.confidence, snapshotKey, source.source.contentHash ?? `sha256:${hash}`, source.source.parserVersion ?? 'adapter-v1', source.source.evidenceLocator ?? null, source.source.reviewStatus ?? 'verified'),
  ];
  for (const plan of source.plans) statements.push(db.prepare('INSERT INTO plan_offers (revision, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, entitlement_evidence_json, billing_cycle, annual_cost_micro_dollars, annual_effective_monthly_cost_micro_dollars, supported_model_ids_json, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, plan.id, plan.providerId, plan.displayName, plan.monthlyCostMicroDollars, plan.currency, JSON.stringify(plan.entitlement), JSON.stringify(plan.entitlementEvidence), plan.billingCycle ?? null, plan.annualCostMicroDollars ?? null, plan.annualEffectiveMonthlyCostMicroDollars ?? null, plan.supportedModelIds ? JSON.stringify(plan.supportedModelIds) : null, plan.sourceId));
  for (const model of source.modelOffers) statements.push(db.prepare('INSERT INTO model_offers (revision, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, cache_write_micro_dollars_per_million, output_micro_dollars_per_million, context_window_tokens, max_output_tokens, availability, expiration_date, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, model.id, model.providerId, model.displayName, model.modelId, model.pricingBasis, model.route, model.currency, model.unit, model.inputMicroDollarsPerMillion, model.cachedInputMicroDollarsPerMillion ?? null, model.cacheWriteMicroDollarsPerMillion ?? null, model.outputMicroDollarsPerMillion, model.contextWindowTokens ?? null, model.maxOutputTokens ?? null, model.availability ?? null, model.expirationDate ?? null, model.sourceId));
  statements.push(
    db.prepare("UPDATE catalog_revisions SET publication_state = 'superseded' WHERE publication_state = 'published'").bind(),
    db.prepare("UPDATE catalog_revisions SET publication_state = 'published' WHERE revision = ?").bind(revision),
    db.prepare('INSERT INTO catalog_publication_state (singleton, active_revision, updated_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET active_revision = excluded.active_revision, updated_at = excluded.updated_at').bind(revision, now),
    db.prepare('INSERT INTO source_refresh_state (source_id, last_success_at, last_revision, last_error) VALUES (?, ?, ?, NULL) ON CONFLICT(source_id) DO UPDATE SET last_success_at = excluded.last_success_at, last_revision = excluded.last_revision, last_error = NULL').bind(source.source.id, now, revision),
  );
  await db.batch(statements);
  await publishCatalogApiCache(db, now);
  return { revision, snapshotKey };
}

export async function recordRefreshFailure(db: D1Database, sourceId: string, error: unknown, now: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.batch([db.prepare('INSERT INTO source_refresh_state (source_id, last_success_at, last_revision, last_error) VALUES (?, NULL, NULL, ?) ON CONFLICT(source_id) DO UPDATE SET last_error = excluded.last_error').bind(sourceId, message.slice(0, 1_000))]);
}

export function buildManualSubscriptionSource(providerId: string, observedAt: string): ParsedSource {
  return buildManifest(providerId, observedAt);
}

export function buildManualSubscriptionSources(providerId: string, observedAt: string): ParsedSource[] {
  return buildManifests(providerId, observedAt);
}

export { CatalogIngestCoordinator } from './coordinator';
export default {
  async scheduled(
    controller: { scheduledTime?: number },
    env: IngestEnv,
    _ctx?: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    if (!env.INGEST_COORDINATOR) throw new Error('Catalog ingest coordinator binding is required');
    const coordinator = env.INGEST_COORDINATOR.getByName('daily-catalog');
    await coordinator.start({ scheduledTime: controller.scheduledTime ?? Date.now() });
  },
  fetch(): Response {
    return new Response('Method Not Allowed', { status: 405 });
  },
};
