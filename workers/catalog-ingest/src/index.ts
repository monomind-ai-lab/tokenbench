import type { ModelOffer, PlanOffer, SourceProvenance } from '../../../src/catalog/contracts';
import { buildManualSubscriptionSource as buildManifest, MANUAL_SUBSCRIPTION_PROVIDER_IDS } from '../../../src/catalog/manual-manifests';
import { validateCatalogResponse } from '../../../src/catalog/validation';

type BoundStatement = unknown;
interface D1Database { prepare(sql: string): { bind(...values: unknown[]): BoundStatement }; batch(statements: BoundStatement[]): Promise<unknown> }
interface R2Bucket { put(key: string, value: string, options?: { httpMetadata?: { contentType: string } }): Promise<unknown> }

export interface IngestEnv { CATALOG_DB: D1Database; SOURCE_SNAPSHOTS: R2Bucket; AUTOMATED_SOURCE_IDS?: string }
export interface ParsedSource { source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] }
export interface RefreshDependencies {
  fetchImpl: typeof fetch;
  now: () => string;
  createAbortController: () => AbortController;
  setTimeoutImpl: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>;
  clearTimeoutImpl: (timeout: ReturnType<typeof setTimeout>) => void;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const OPENCODE_URL = 'https://opencode.ai/zen/v1/models';
const OPENCODE_PRICING_URL = 'https://opencode.ai/docs/zen/';

function isAutomatedSourceAllowlisted(env: IngestEnv, sourceId: string): boolean {
  return env.AUTOMATED_SOURCE_IDS?.split(',').map((id) => id.trim()).includes(sourceId) ?? false;
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
    const model = entry as { id?: unknown; name?: unknown; pricing?: Record<string, unknown>; context_length?: unknown; top_provider?: { max_completion_tokens?: unknown } };
    if (typeof model.id !== 'string' || !model.id || typeof model.name !== 'string' || !model.name) throw new Error(`${label} model id and name are required`);
    const pricing = model.pricing;
    if (!pricing) throw new Error(`${label} model pricing is required`);
    const providerId = model.id.includes('/') ? model.id.split('/')[0] : source.providerId;
    const input = pricing.prompt ?? pricing.input;
    const output = pricing.completion ?? pricing.output;
    const cached = pricing.input_cache_read ?? pricing.cached_input;
    if (input === '-1' && output === '-1' && model.id.startsWith('openrouter/')) return [];
    return [{
      id: `${providerId}:${model.id}:${route}`, providerId, displayName: model.name, modelId: model.id,
      pricingBasis: route === 'openrouter' ? 'openrouter' : 'opencode_zen', route,
      currency: 'USD', unit: 'micro_dollars_per_million_tokens',
      inputMicroDollarsPerMillion: microDollarsPerMillion(input, label),
      ...(cached === undefined ? {} : { cachedInputMicroDollarsPerMillion: microDollarsPerMillion(cached, label) }),
      outputMicroDollarsPerMillion: microDollarsPerMillion(output, label), sourceId,
      ...(Number.isInteger(model.context_length) && (model.context_length as number) >= 0 ? { contextWindowTokens: model.context_length as number } : {}),
      ...(Number.isInteger(model.top_provider?.max_completion_tokens) && (model.top_provider?.max_completion_tokens as number) >= 0 ? { maxOutputTokens: model.top_provider?.max_completion_tokens as number } : {}),
      availability: 'available',
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
  const modelTable = tables.find((table) => table[0]?.join('|') === 'MODEL|MODEL ID|ENDPOINT|AI SDK PACKAGE');
  const pricingTable = tables.find((table) => table[0]?.join('|') === 'MODEL|INPUT|OUTPUT|CACHED READ|CACHED WRITE');
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

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function publishValidatedSource({
  db, snapshots, source, rawPayload, now,
}: { db: D1Database; snapshots: R2Bucket; source: ParsedSource; rawPayload: unknown; now: string }): Promise<{ revision: string; snapshotKey: string }> {
  const catalog = {
    revision: 'validation', publishedAt: now, freshness: { status: 'fresh' as const, checkedAt: now },
    provenance: [source.source], plans: source.plans, modelOffers: source.modelOffers,
  };
  validateCatalogResponse(catalog);
  const raw = JSON.stringify(rawPayload);
  const hash = await sha256(raw);
  const snapshotKey = `${source.source.id}/${now.slice(0, 10)}/${hash}.json`;
  await snapshots.put(snapshotKey, raw, { httpMetadata: { contentType: 'application/json' } });

  const revision = `rev_${now.replace(/[-:.TZ]/g, '')}_${hash.slice(0, 12)}`;
  const statements: BoundStatement[] = [
    db.prepare('INSERT INTO catalog_revisions (revision, published_at, checked_at, publication_state) VALUES (?, ?, ?, ?)').bind(revision, now, now, 'pending'),
    db.prepare("INSERT INTO source_records (revision, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key, content_hash, parser_version, evidence_locator, review_status) SELECT ?, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key, content_hash, parser_version, evidence_locator, review_status FROM source_records WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND id != ?").bind(revision, source.source.id),
    db.prepare("INSERT INTO plan_offers (revision, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, billing_cycle, supported_model_ids_json, source_id) SELECT ?, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, billing_cycle, supported_model_ids_json, source_id FROM plan_offers WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND source_id != ?").bind(revision, source.source.id),
    db.prepare("INSERT INTO model_offers (revision, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, output_micro_dollars_per_million, context_window_tokens, max_output_tokens, availability, source_id) SELECT ?, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, output_micro_dollars_per_million, context_window_tokens, max_output_tokens, availability, source_id FROM model_offers WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND source_id != ?").bind(revision, source.source.id),
    db.prepare('INSERT INTO source_records (revision, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key, content_hash, parser_version, evidence_locator, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, source.source.id, source.source.providerId, source.source.sourceUrl, source.source.observedAt, source.source.sourceKind, source.source.confidence, snapshotKey, source.source.contentHash ?? `sha256:${hash}`, source.source.parserVersion ?? 'adapter-v1', source.source.evidenceLocator ?? null, source.source.reviewStatus ?? 'verified'),
  ];
  for (const plan of source.plans) statements.push(db.prepare('INSERT INTO plan_offers (revision, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, billing_cycle, supported_model_ids_json, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, plan.id, plan.providerId, plan.displayName, plan.monthlyCostMicroDollars, plan.currency, JSON.stringify(plan.entitlement), plan.billingCycle ?? null, plan.supportedModelIds ? JSON.stringify(plan.supportedModelIds) : null, plan.sourceId));
  for (const model of source.modelOffers) statements.push(db.prepare('INSERT INTO model_offers (revision, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, output_micro_dollars_per_million, context_window_tokens, max_output_tokens, availability, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, model.id, model.providerId, model.displayName, model.modelId, model.pricingBasis, model.route, model.currency, model.unit, model.inputMicroDollarsPerMillion, model.cachedInputMicroDollarsPerMillion ?? null, model.outputMicroDollarsPerMillion, model.contextWindowTokens ?? null, model.maxOutputTokens ?? null, model.availability ?? null, model.sourceId));
  statements.push(
    db.prepare("UPDATE catalog_revisions SET publication_state = 'superseded' WHERE publication_state = 'published'").bind(),
    db.prepare("UPDATE catalog_revisions SET publication_state = 'published' WHERE revision = ?").bind(revision),
    db.prepare('INSERT INTO catalog_publication_state (singleton, active_revision, updated_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET active_revision = excluded.active_revision, updated_at = excluded.updated_at').bind(revision, now),
    db.prepare('INSERT INTO source_refresh_state (source_id, last_success_at, last_revision, last_error) VALUES (?, ?, ?, NULL) ON CONFLICT(source_id) DO UPDATE SET last_success_at = excluded.last_success_at, last_revision = excluded.last_revision, last_error = NULL').bind(source.source.id, now, revision),
  );
  await db.batch(statements);
  return { revision, snapshotKey };
}

export async function recordRefreshFailure(db: D1Database, sourceId: string, error: unknown, now: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.batch([db.prepare('INSERT INTO source_refresh_state (source_id, last_success_at, last_revision, last_error) VALUES (?, NULL, NULL, ?) ON CONFLICT(source_id) DO UPDATE SET last_error = excluded.last_error').bind(sourceId, message.slice(0, 1_000))]);
}

export async function refreshSource(
  url: string,
  sourceId: string,
  parse: (payload: unknown, observedAt: string) => ParsedSource,
  env: IngestEnv,
  dependencies: RefreshDependencies = {
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    now: () => new Date().toISOString(),
    createAbortController: () => new AbortController(),
    setTimeoutImpl: (handler, timeout) => globalThis.setTimeout(handler, timeout),
    clearTimeoutImpl: (timeout) => globalThis.clearTimeout(timeout),
  },
): Promise<void> {
  const abort = dependencies.createAbortController();
  const timeout = dependencies.setTimeoutImpl(() => abort.abort('upstream timeout'), 20_000);
  try {
    const response = await dependencies.fetchImpl(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Catalog source ${url} returned ${response.status}`);
    const now = dependencies.now();
    const rawPayload = await response.json();
    await publishValidatedSource({ db: env.CATALOG_DB, snapshots: env.SOURCE_SNAPSHOTS, source: parse(rawPayload, now), rawPayload, now });
  } finally {
    dependencies.clearTimeoutImpl(timeout);
  }
}

async function refreshOpenCode(env: IngestEnv, dependencies: RefreshDependencies = {
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  now: () => new Date().toISOString(),
  createAbortController: () => new AbortController(),
  setTimeoutImpl: (handler, timeout) => globalThis.setTimeout(handler, timeout),
  clearTimeoutImpl: (timeout) => globalThis.clearTimeout(timeout),
}): Promise<void> {
  const abort = dependencies.createAbortController();
  const timeout = dependencies.setTimeoutImpl(() => abort.abort('upstream timeout'), 20_000);
  try {
    const [modelsResponse, pricingResponse] = await Promise.all([
      dependencies.fetchImpl(OPENCODE_URL, { signal: abort.signal }),
      dependencies.fetchImpl(OPENCODE_PRICING_URL, { signal: abort.signal }),
    ]);
    if (!modelsResponse.ok) throw new Error(`Catalog source ${OPENCODE_URL} returned ${modelsResponse.status}`);
    if (!pricingResponse.ok) throw new Error(`Catalog source ${OPENCODE_PRICING_URL} returned ${pricingResponse.status}`);
    const now = dependencies.now();
    const modelsPayload = await modelsResponse.json();
    const pricingHtml = await pricingResponse.text();
    await publishValidatedSource({
      db: env.CATALOG_DB, snapshots: env.SOURCE_SNAPSHOTS,
      source: parseOpenCodeCatalog(modelsPayload, pricingHtml, now),
      rawPayload: { models: modelsPayload, pricingHtml }, now,
    });
  } finally {
    dependencies.clearTimeoutImpl(timeout);
  }
}

export function buildManualSubscriptionSource(providerId: string, observedAt: string): ParsedSource {
  return buildManifest(providerId, observedAt);
}

async function refreshManual(providerId: string, env: IngestEnv): Promise<void> {
  const now = new Date().toISOString();
  const source = buildManualSubscriptionSource(providerId, now);
  await publishValidatedSource({ db: env.CATALOG_DB, snapshots: env.SOURCE_SNAPSHOTS, source, rawPayload: { providerId, plans: source.plans, modelOffers: source.modelOffers }, now });
}

export default {
  async scheduled(controller: { cron?: string }, env: IngestEnv, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    const guarded = (sourceId: string, operation: Promise<void>) => operation.catch(async (error) => recordRefreshFailure(env.CATALOG_DB, sourceId, error, new Date().toISOString()));
    const guardedAutomatedRefresh = (sourceId: string, url: string, parse: (payload: unknown, observedAt: string) => ParsedSource): Promise<void> => {
      if (!isAutomatedSourceAllowlisted(env, sourceId)) {
        return recordRefreshFailure(env.CATALOG_DB, sourceId, new Error(`${sourceId} is not allowlisted for automated refresh`), new Date().toISOString());
      }
      return guarded(sourceId, refreshSource(url, sourceId, parse, env));
    };
    const refreshRotatingManualSource = () => {
      const hour = new Date().getUTCHours();
      const providerId = MANUAL_SUBSCRIPTION_PROVIDER_IDS[Math.floor(hour / 3) % MANUAL_SUBSCRIPTION_PROVIDER_IDS.length];
      return guarded(`${providerId}-subscription`, refreshManual(providerId, env));
    };
    if (controller.cron === '0 */6 * * *') ctx.waitUntil(guardedAutomatedRefresh('openrouter-models', OPENROUTER_URL, parseOpenRouterModels));
    else if (controller.cron === '30 */6 * * *') ctx.waitUntil(isAutomatedSourceAllowlisted(env, 'opencode-zen') ? guarded('opencode-zen', refreshOpenCode(env)) : recordRefreshFailure(env.CATALOG_DB, 'opencode-zen', new Error('opencode-zen is not allowlisted for automated refresh'), new Date().toISOString()));
    else if (controller.cron === '0 */3 * * *') ctx.waitUntil(refreshRotatingManualSource());
    else {
      // Cloudflare's dashboard test event omits the configured cron expression.
      // Run sources serially so every revision copies the one published immediately before it.
      ctx.waitUntil((async () => {
        await guardedAutomatedRefresh('openrouter-models', OPENROUTER_URL, parseOpenRouterModels);
        await (isAutomatedSourceAllowlisted(env, 'opencode-zen') ? guarded('opencode-zen', refreshOpenCode(env)) : recordRefreshFailure(env.CATALOG_DB, 'opencode-zen', new Error('opencode-zen is not allowlisted for automated refresh'), new Date().toISOString()));
        await refreshRotatingManualSource();
      })());
    }
  },
};
