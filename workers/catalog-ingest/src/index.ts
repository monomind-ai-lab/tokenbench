import type { ModelOffer, PlanOffer, SourceProvenance } from '../../../src/catalog/contracts';
import { validateCatalogResponse } from '../../../src/catalog/validation';

type BoundStatement = unknown;
interface D1Database { prepare(sql: string): { bind(...values: unknown[]): BoundStatement }; batch(statements: BoundStatement[]): Promise<unknown> }
interface R2Bucket { put(key: string, value: string, options?: { httpMetadata?: { contentType: string } }): Promise<unknown> }

export interface IngestEnv { CATALOG_DB: D1Database; SOURCE_SNAPSHOTS: R2Bucket }
export interface ParsedSource { source: SourceProvenance; plans: PlanOffer[]; modelOffers: ModelOffer[] }

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/models';

function microDollarsPerMillion(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`${label} pricing is required`);
  const [whole, fraction = ''] = value.split('.');
  if (fraction.slice(12).replace(/0/g, '') !== '') throw new Error(`${label} pricing exceeds micro-dollar precision`);
  const scaled = BigInt(whole) * 1_000_000_000_000n + BigInt(fraction.padEnd(12, '0'));
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
  const modelOffers = (payload as { data: unknown[] }).data.map((entry): ModelOffer => {
    if (!entry || typeof entry !== 'object') throw new Error(`${label} model must be an object`);
    const model = entry as { id?: unknown; name?: unknown; pricing?: Record<string, unknown> };
    if (typeof model.id !== 'string' || !model.id || typeof model.name !== 'string' || !model.name) throw new Error(`${label} model id and name are required`);
    const pricing = model.pricing;
    if (!pricing) throw new Error(`${label} model pricing is required`);
    const providerId = model.id.includes('/') ? model.id.split('/')[0] : source.providerId;
    const input = pricing.prompt ?? pricing.input;
    const output = pricing.completion ?? pricing.output;
    const cached = pricing.input_cache_read ?? pricing.cached_input;
    return {
      id: `${providerId}:${model.id}:${route}`, providerId, displayName: model.name, modelId: model.id,
      pricingBasis: route === 'openrouter' ? 'openrouter' : 'opencode_zen', route,
      currency: 'USD', unit: 'micro_dollars_per_million_tokens',
      inputMicroDollarsPerMillion: microDollarsPerMillion(input, label),
      ...(cached === undefined ? {} : { cachedInputMicroDollarsPerMillion: microDollarsPerMillion(cached, label) }),
      outputMicroDollarsPerMillion: microDollarsPerMillion(output, label), sourceId,
    };
  });
  return { source, plans: [], modelOffers };
}

export function parseOpenRouterModels(payload: unknown, observedAt: string): ParsedSource {
  return parseModels(payload, observedAt, 'openrouter', 'openrouter-models', 'OpenRouter');
}

export function parseOpenCodeModels(payload: unknown, observedAt: string): ParsedSource {
  return parseModels(payload, observedAt, 'opencode_zen', 'opencode-zen', 'OpenCode');
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
    db.prepare("INSERT INTO source_records (revision, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key) SELECT ?, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key FROM source_records WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND id != ?").bind(revision, source.source.id),
    db.prepare("INSERT INTO plan_offers (revision, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, source_id) SELECT ?, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, source_id FROM plan_offers WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND source_id != ?").bind(revision, source.source.id),
    db.prepare("INSERT INTO model_offers (revision, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, output_micro_dollars_per_million, source_id) SELECT ?, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, output_micro_dollars_per_million, source_id FROM model_offers WHERE revision = (SELECT revision FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1) AND source_id != ?").bind(revision, source.source.id),
    db.prepare('INSERT INTO source_records (revision, id, provider_id, source_url, observed_at, source_kind, confidence, snapshot_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, source.source.id, source.source.providerId, source.source.sourceUrl, source.source.observedAt, source.source.sourceKind, source.source.confidence, snapshotKey),
  ];
  for (const plan of source.plans) statements.push(db.prepare('INSERT INTO plan_offers (revision, id, provider_id, display_name, monthly_cost_micro_dollars, currency, entitlement_json, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, plan.id, plan.providerId, plan.displayName, plan.monthlyCostMicroDollars, plan.currency, JSON.stringify(plan.entitlement), plan.sourceId));
  for (const model of source.modelOffers) statements.push(db.prepare('INSERT INTO model_offers (revision, id, provider_id, display_name, model_id, pricing_basis, route, currency, unit, input_micro_dollars_per_million, cached_input_micro_dollars_per_million, output_micro_dollars_per_million, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(revision, model.id, model.providerId, model.displayName, model.modelId, model.pricingBasis, model.route, model.currency, model.unit, model.inputMicroDollarsPerMillion, model.cachedInputMicroDollarsPerMillion ?? null, model.outputMicroDollarsPerMillion, model.sourceId));
  statements.push(
    db.prepare("UPDATE catalog_revisions SET publication_state = 'superseded' WHERE publication_state = 'published'").bind(),
    db.prepare("UPDATE catalog_revisions SET publication_state = 'published' WHERE revision = ?").bind(revision),
    db.prepare('INSERT INTO catalog_publication_state (singleton, active_revision, updated_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET active_revision = excluded.active_revision, updated_at = excluded.updated_at').bind(revision, now),
    db.prepare('INSERT INTO source_refresh_state (source_id, last_success_at, last_revision, last_error) VALUES (?, ?, ?, NULL) ON CONFLICT(source_id) DO UPDATE SET last_success_at = excluded.last_success_at, last_revision = excluded.last_revision, last_error = NULL').bind(source.source.id, now, revision),
  );
  await db.batch(statements);
  return { revision, snapshotKey };
}

async function refresh(url: string, parse: (payload: unknown, observedAt: string) => ParsedSource, env: IngestEnv): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog source ${url} returned ${response.status}`);
  const now = new Date().toISOString();
  const rawPayload = await response.json();
  await publishValidatedSource({ db: env.CATALOG_DB, snapshots: env.SOURCE_SNAPSHOTS, source: parse(rawPayload, now), rawPayload, now });
}

const subscriptionSources: Record<string, SourceProvenance> = {
  alibaba: { id: 'alibaba-subscription', providerId: 'alibaba', sourceUrl: 'https://www.alibabacloud.com/campaign/ai-scene-coding', observedAt: '', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  anthropic: { id: 'anthropic-subscription', providerId: 'anthropic', sourceUrl: 'https://www.anthropic.com/pricing', observedAt: '', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  deepseek: { id: 'deepseek-api', providerId: 'deepseek', sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing', observedAt: '', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  xai: { id: 'xai-subscription', providerId: 'xai', sourceUrl: 'https://x.ai/pricing', observedAt: '', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  kimi: { id: 'kimi-api', providerId: 'kimi', sourceUrl: 'https://kimi.com/help/kimi-api/api-pricing', observedAt: '', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  openai: { id: 'openai-subscription', providerId: 'openai', sourceUrl: 'https://openai.com/chatgpt/pricing/', observedAt: '', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
  zai: { id: 'zai-subscription', providerId: 'zai', sourceUrl: 'https://z.ai/subscribe', observedAt: '', sourceKind: 'manual_manifest', confidence: 'manual_verified' },
};

async function refreshManual(providerId: string, env: IngestEnv): Promise<void> {
  const now = new Date().toISOString();
  const source = subscriptionSources[providerId];
  if (!source) throw new Error(`No manual manifest for ${providerId}`);
  await publishValidatedSource({ db: env.CATALOG_DB, snapshots: env.SOURCE_SNAPSHOTS, source: { source: { ...source, observedAt: now }, plans: [], modelOffers: [] }, rawPayload: { providerId, records: [] }, now });
}

export default {
  async scheduled(controller: { cron: string }, env: IngestEnv, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    if (controller.cron === '0 */6 * * *') ctx.waitUntil(refresh(OPENROUTER_URL, parseOpenRouterModels, env));
    else if (controller.cron === '30 */6 * * *') ctx.waitUntil(refresh(OPENCODE_URL, parseOpenCodeModels, env));
    else {
      const hour = new Date().getUTCHours();
      ctx.waitUntil(refreshManual(Object.keys(subscriptionSources)[Math.floor(hour / 3) % Object.keys(subscriptionSources).length], env));
    }
  },
};
