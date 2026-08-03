import { BOOTSTRAP_CATALOG } from '../../src/catalog/bootstrap';
import type { CatalogResponse, ModelOffer, PlanOffer, SourceProvenance } from '../../src/catalog/contracts';
import { validateCatalogResponse } from '../../src/catalog/validation';

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
interface SourceRow { id: string; provider_id: string; source_url: string; observed_at: string; source_kind: SourceProvenance['sourceKind']; confidence: SourceProvenance['confidence']; snapshot_key: string | null }
interface PlanRow { id: string; provider_id: string; display_name: string; monthly_cost_micro_dollars: number; currency: 'USD'; entitlement_json: string; source_id: string }
interface ModelRow { id: string; provider_id: string; display_name: string; model_id: string; pricing_basis: ModelOffer['pricingBasis']; route: ModelOffer['route']; currency: 'USD'; unit: ModelOffer['unit']; input_micro_dollars_per_million: number; cached_input_micro_dollars_per_million: number | null; output_micro_dollars_per_million: number; source_id: string }

async function all<T>(db: D1Database, query: string, revision: string): Promise<T[]> {
  return (await db.prepare(query).bind(revision).all()).results as T[];
}

export async function readPublishedCatalog(db: D1Database): Promise<CatalogResponse | null> {
  const revisions = await all<RevisionRow>(db,
    "SELECT revision, published_at, checked_at FROM catalog_revisions WHERE publication_state = 'published' ORDER BY published_at DESC LIMIT 1", '');
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
      sourceKind: source.source_kind, confidence: source.confidence, ...(source.snapshot_key ? { snapshotKey: source.snapshot_key } : {}),
    })),
    plans: plans.map((plan): PlanOffer => ({
      id: plan.id, providerId: plan.provider_id, displayName: plan.display_name,
      monthlyCostMicroDollars: plan.monthly_cost_micro_dollars, currency: plan.currency,
      pricingBasis: 'subscription', route: 'subscription', entitlement: JSON.parse(plan.entitlement_json), sourceId: plan.source_id,
    })),
    modelOffers: models.map((model): ModelOffer => ({
      id: model.id, providerId: model.provider_id, displayName: model.display_name, modelId: model.model_id,
      pricingBasis: model.pricing_basis, route: model.route, currency: model.currency, unit: model.unit,
      inputMicroDollarsPerMillion: model.input_micro_dollars_per_million,
      ...(model.cached_input_micro_dollars_per_million === null ? {} : { cachedInputMicroDollarsPerMillion: model.cached_input_micro_dollars_per_million }),
      outputMicroDollarsPerMillion: model.output_micro_dollars_per_million, sourceId: model.source_id,
    })),
  });
}

function filterByProvider(catalog: CatalogResponse, providerId: string | null): CatalogResponse {
  if (!providerId) return catalog;
  const plans = catalog.plans.filter((offer) => offer.providerId === providerId);
  const modelOffers = catalog.modelOffers.filter((offer) => offer.providerId === providerId);
  const sourceIds = new Set([...plans, ...modelOffers].map((offer) => offer.sourceId));
  return { ...catalog, plans, modelOffers, provenance: catalog.provenance.filter((source) => source.providerId === providerId || sourceIds.has(source.id)) };
}

export async function onRequestGet({ request, env }: { request: Request; env: Env }): Promise<Response> {
  let catalog = BOOTSTRAP_CATALOG;
  if (env.CATALOG_DB) {
    try {
      catalog = await readPublishedCatalog(env.CATALOG_DB) ?? BOOTSTRAP_CATALOG;
    } catch {
      catalog = { ...BOOTSTRAP_CATALOG, freshness: { ...BOOTSTRAP_CATALOG.freshness, message: 'Published catalog unavailable; serving checked-in bootstrap source records.' } };
    }
  }
  const filtered = filterByProvider(catalog, new URL(request.url).searchParams.get('provider'));
  const etag = `"${filtered.revision}"`;
  const headers = new Headers({
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    ETag: etag,
    Vary: 'Accept-Encoding',
  });
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return Response.json(filtered, { headers });
}
