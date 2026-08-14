import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { buildCalculatorEvidenceLineItems, buildCalculatorSnapshot, calculatorCsv, formatCurrencyMicroDollars } from '../../src/frontend/calculator-state';
import type { CatalogResponse, ModelOffer, PlanOffer } from '../../src/catalog/contracts';
import { SITE_CONFIG } from '../../src/brand/site-config';
import { FRONTEND_ASSETS } from '../../src/routing/frontend-assets';
import { metadataForRoute } from '../../src/seo/metadata';
import { headMarkup, staticChrome } from '../../src/seo/static-page';
import { escapeHtmlAttribute, escapeHtmlText, serializeJsonForScript } from '../_shared/html';
import { readPublishedCatalog } from '../api/catalog';

const PATHNAME = '/cost/calculator/';

interface CalculatorQuery {
  readonly workload: { readonly conversationsPerDay: number; readonly messagesPerConversation: number; readonly inputTokensPerMessage: number; readonly outputTokensPerMessage: number; readonly activeDaysPerMonth: number };
  readonly providerId: string | null;
  readonly planId: string | null;
  readonly modelIds: readonly string[];
  readonly submitted: boolean;
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (value === null) return fallback;
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) throw new Error('invalid input');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error('invalid input');
  return parsed;
}

function optionalId(value: string | null): string | null {
  if (value === null) return null;
  return /^[a-zA-Z0-9:_-]{1,160}$/u.test(value) ? value : null;
}

function parseQuery(request: Request): CalculatorQuery {
  const search = new URL(request.url).searchParams;
  const providerId = optionalId(search.get('provider'));
  const planId = optionalId(search.get('plan'));
  const modelIds = (search.get('models') ?? '').split(',').filter(Boolean).map(optionalId).filter((value): value is string => value !== null).slice(0, 3);
  const relevantKeys = ['c', 'm', 'i', 'o', 'd', 'provider', 'plan', 'models', 'weights'];
  return {
    workload: {
      conversationsPerDay: boundedInteger(search.get('c'), 10, 0, 10_000),
      messagesPerConversation: boundedInteger(search.get('m'), 8, 0, 1_000),
      inputTokensPerMessage: boundedInteger(search.get('i'), 750, 0, 1_000_000),
      outputTokensPerMessage: boundedInteger(search.get('o'), 250, 0, 1_000_000),
      activeDaysPerMonth: boundedInteger(search.get('d'), 25, 0, 31),
    },
    providerId,
    planId,
    modelIds,
    submitted: relevantKeys.some((key) => search.has(key)),
  };
}

function selectedOffer(catalog: CatalogResponse, query: CalculatorQuery): ModelOffer | null {
  const requested = query.modelIds.map((id) => catalog.modelOffers.find((offer) => offer.id === id)).find((offer): offer is ModelOffer => Boolean(offer));
  if (requested) return requested;
  return catalog.modelOffers.find((offer) => offer.providerId === query.providerId && offer.route === 'direct_provider')
    ?? catalog.modelOffers.find((offer) => offer.route === 'direct_provider')
    ?? catalog.modelOffers[0]
    ?? null;
}

function selectedPlan(catalog: CatalogResponse, query: CalculatorQuery, offer: ModelOffer | null): PlanOffer | undefined {
  return catalog.plans.find((plan) => plan.id === query.planId)
    ?? catalog.plans.find((plan) => plan.providerId === (query.providerId ?? offer?.providerId));
}

function effectiveAt(catalog: CatalogResponse, offer: ModelOffer | null): string | null {
  if (!offer) return null;
  return catalog.provenance.find((source) => source.id === offer.sourceId)?.observedAt ?? null;
}

function sourceLink(catalog: CatalogResponse, offer: ModelOffer | null): string {
  const source = offer ? catalog.provenance.find((item) => item.id === offer.sourceId) : undefined;
  return source ? `<a href="${escapeHtmlAttribute(source.sourceUrl)}">Open published pricing source</a>` : 'Unavailable';
}

function CalculatorMarkup({ catalog, query }: { readonly catalog: CatalogResponse; readonly query: CalculatorQuery }) {
  const offer = selectedOffer(catalog, query);
  const plan = selectedPlan(catalog, query, offer);
  const snapshot = buildCalculatorSnapshot({
    modelOffers: offer ? [offer] : [],
    selectedModelIds: offer ? [offer.id] : [],
    modelMixBasisPoints: offer ? { [offer.id]: 10_000 } : {},
    workload: query.workload,
    selectedPlan: plan,
    calculationTimestamp: catalog.freshness.checkedAt,
  });
  const rows = buildCalculatorEvidenceLineItems(snapshot, offer, effectiveAt(catalog, offer));
  const csv = calculatorCsv(rows);
  const sourceRows = rows.filter((row) => row.kind === 'source_price').map((row) => `<div><dt>${escapeHtmlText(row.label)}</dt><dd>${escapeHtmlText(formatCurrencyMicroDollars(row.valueMicroDollars))} per 1M tokens · effective ${escapeHtmlText(row.priceEffectiveAt ?? 'Unavailable')}</dd></div>`).join('');
  const derivedRows = rows.filter((row) => row.kind === 'derived_cost').map((row) => `<div><dt>${escapeHtmlText(row.label)}</dt><dd>${escapeHtmlText(formatCurrencyMicroDollars(row.valueMicroDollars))}</dd></div>`).join('');
  const assumptions = rows.filter((row) => row.kind === 'assumption').map((row) => `<li>${escapeHtmlText(row.assumption ?? 'Unavailable')}</li>`).join('');
  const fields = [
    ['c', 'Conversations per day', 0, 10_000, query.workload.conversationsPerDay],
    ['m', 'Messages per conversation', 0, 1_000, query.workload.messagesPerConversation],
    ['i', 'Input tokens per message', 0, 1_000_000, query.workload.inputTokensPerMessage],
    ['o', 'Output tokens per message', 0, 1_000_000, query.workload.outputTokensPerMessage],
    ['d', 'Active days per month', 0, 31, query.workload.activeDaysPerMonth],
  ].map(([name, label, min, max, value]) => `<label>${label} <input name="${name}" type="number" min="${min}" max="${max}" value="${value}"></label>`).join('');
  const html = `<header class="calculator-intro"><h1>Cost Simulator</h1><p>Estimate a concrete monthly scenario from complete, route-specific published API price dimensions. Missing price dimensions remain unavailable; they are never zero.</p></header><form method="get" action="${PATHNAME}"><fieldset><legend>Scenario inputs</legend>${fields}</fieldset><button type="submit">Simulate cost</button></form><section aria-labelledby="published-source-prices-heading"><h2 id="published-source-prices-heading">Published source prices</h2>${offer ? `<p>${escapeHtmlText(`${offer.displayName} · ${offer.route}`)}</p>` : '<p><strong>Unavailable</strong> — no published model route is available.</p>'}<dl>${sourceRows}</dl><p>${sourceLink(catalog, offer)}</p></section><section aria-labelledby="scenario-result-heading"><h2 id="scenario-result-heading">Scenario result</h2>${snapshot.apiEquivalentCost ? `<p>Derived API monthly total: <strong>${escapeHtmlText(formatCurrencyMicroDollars(snapshot.apiEquivalentCost.apiCostMicroDollars))}</strong></p>` : '<p><strong>Unavailable</strong> — select a complete published input/output price route before calculating.</p>'}${plan ? `<p>Subscription monthly fee: <strong>${escapeHtmlText(formatCurrencyMicroDollars(plan.monthlyCostMicroDollars))}</strong></p>` : '<p>Subscription monthly fee: <strong>Unavailable</strong></p>'}<dl>${derivedRows}</dl></section><section aria-labelledby="calculation-assumptions-heading"><h2 id="calculation-assumptions-heading">Calculation assumptions</h2><ul>${assumptions}</ul><p>Calculation timestamp: ${escapeHtmlText(snapshot.calculationTimestamp)}</p></section><p><a download="tokenbench-cost-scenario.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(csv)}">Download CSV audit rows</a></p>${query.submitted ? '<p>Submitted scenario shown above. The canonical URL remains the base Cost Simulator route.</p>' : ''}`;
  return createElement('main', { id: 'page-content', className: 'content-stack calculator-page', tabIndex: -1, dangerouslySetInnerHTML: { __html: html } });
}

function documentFor(catalog: CatalogResponse, query: CalculatorQuery): string {
  const metadata = metadataForRoute({ kind: 'calculator' });
  const root = renderToString(createElement(CalculatorMarkup, { catalog, query }));
  const initialData = { query, revision: catalog.revision, effectiveAt: catalog.freshness.checkedAt };
  return `<!doctype html><html lang="en" data-theme="${SITE_CONFIG.defaultTheme}"><head>${headMarkup(metadata, [])}<link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}"></head><body><div id="root">${staticChrome(root, 'calculator')}</div><script id="cost-calculator-initial-data" type="application/json">${serializeJsonForScript(initialData)}</script><script type="module" src="${FRONTEND_ASSETS.script}"></script></body></html>`;
}

function unavailableDocument(): string {
  const base = metadataForRoute({ kind: 'calculator' });
  const title = `Cost Simulator temporarily unavailable | ${SITE_CONFIG.name}`;
  return `<!doctype html><html lang="en"><head><title>${escapeHtmlText(title)}</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="${escapeHtmlAttribute(base.canonical)}"></head><body><main><h1>Cost Simulator temporarily unavailable</h1><p>Published pricing evidence cannot be read right now. No estimate is shown; try again when a published catalog is available.</p><a href="/cost/">Choose another cost tool</a></main></body></html>`;
}

export async function onRequestGet({ request, env }: { request: Request; env: { readonly CATALOG_DB?: Parameters<typeof readPublishedCatalog>[0] } }): Promise<Response> {
  if (new URL(request.url).pathname !== PATHNAME) return new Response(null, { status: 301, headers: { Location: PATHNAME } });
  let query: CalculatorQuery;
  try { query = parseQuery(request); } catch { return new Response('Invalid cost calculator request', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  if (!env.CATALOG_DB) return new Response(unavailableDocument(), { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, follow' } });
  try {
    const catalog = await readPublishedCatalog(env.CATALOG_DB);
    if (!catalog) throw new Error('no published catalog');
    return new Response(documentFor(catalog, query), { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'index, follow' } });
  } catch {
    return new Response(unavailableDocument(), { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, follow' } });
  }
}
