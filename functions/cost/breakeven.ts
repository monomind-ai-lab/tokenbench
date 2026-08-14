import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { buildBreakevenResult, type BreakevenScenario } from '../../src/frontend/breakeven-state';
import { SITE_CONFIG } from '../../src/brand/site-config';
import { FRONTEND_ASSETS } from '../../src/routing/frontend-assets';
import { metadataForRoute } from '../../src/seo/metadata';
import { headMarkup, staticChrome } from '../../src/seo/static-page';
import { escapeHtmlAttribute, escapeHtmlText, serializeJsonForScript } from '../_shared/html';
import { readPublishedCatalog } from '../api/catalog';

const PATHNAME = '/cost/breakeven/';

function number(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (value === null) return fallback;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) throw new Error('invalid input');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error('invalid input');
  return parsed;
}

function scenarioFor(request: Request): BreakevenScenario {
  const params = new URL(request.url).searchParams;
  const inputShare = number(params.get('input'), 50, 0, 100) / 100;
  return {
    seats: Math.round(number(params.get('seats'), 1, 1, 50)),
    feePerSeat: number(params.get('fee'), 20, 0, 100_000),
    maxTokensMillions: number(params.get('volume'), 300, 0, 300),
    inputShare,
    inputPricePerMillion: params.has('input_price') ? number(params.get('input_price'), 0, 0, 100_000) : null,
    outputPricePerMillion: params.has('output_price') ? number(params.get('output_price'), 0, 0, 100_000) : null,
    capacityTokens: null,
  };
}

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function BreakevenMarkup({ scenario }: { readonly scenario: BreakevenScenario }) {
  const result = buildBreakevenResult(scenario);
  const fields = [
    ['seats', 'Seats', 1, 50, scenario.seats], ['fee', 'Fee per seat (USD/month)', 0, 100_000, scenario.feePerSeat],
    ['volume', 'Displayed monthly token domain (0–300M)', 0, 300, scenario.maxTokensMillions], ['input', 'Input share (%)', 0, 100, scenario.inputShare * 100],
    ['input_price', 'Published input price (USD/1M)', 0, 100_000, scenario.inputPricePerMillion ?? ''], ['output_price', 'Published output price (USD/1M)', 0, 100_000, scenario.outputPricePerMillion ?? ''],
  ].map(([name, label, min, max, value]) => `<label>${label} <input name="${name}" type="number" min="${min}" max="${max}" step="0.000001" value="${value}"></label>`).join('');
  const resultMarkup = result.kind === 'available'
    ? `<section aria-labelledby="breakeven-result-heading"><h2 id="breakeven-result-heading">Fee result</h2><p>Subscription fee: <strong>${usd(result.subscriptionFee)}</strong></p><p>${escapeHtmlText(result.message)}</p><p>Formula: seats × fee per seat = subscription fee; API curve = tokens × (input share × input price + output share × output price). Rounding is display-only.</p></section><section aria-labelledby="breakeven-prices-heading"><h2 id="breakeven-prices-heading">Published source prices</h2><dl><div><dt>Input</dt><dd>${usd(scenario.inputPricePerMillion ?? 0)} per 1M tokens</dd></div><div><dt>Output</dt><dd>${usd(scenario.outputPricePerMillion ?? 0)} per 1M tokens</dd></div><div><dt>Effective time</dt><dd>Submitted source-price scenario; verify provider source before purchase.</dd></div></dl></section><section class="breakeven-table-scroll" role="region" aria-label="Exact breakeven values" tabindex="0"><table aria-label="Breakeven cost samples"><caption>Breakeven cost samples</caption><thead><tr><th scope="col">Monthly tokens</th><th scope="col">Metered API cost</th><th scope="col">Subscription fee</th><th scope="col">Lower cost</th></tr></thead><tbody>${result.points.map((point) => `<tr><th scope="row">${point.tokensMillions}M</th><td>${usd(point.apiCost)}</td><td>${usd(point.subscriptionCost)}</td><td>${point.cheaper === 'api' ? 'API' : point.cheaper === 'subscription' ? 'Subscription' : 'Equal'}</td></tr>`).join('')}</tbody></table></section>`
    : `<section><h2>Fee result</h2><p><strong>Unavailable</strong> — ${result.reason === 'partial_prices' ? 'complete input and output source prices are required and missing dimensions are not zero.' : 'check the seats, mix, fee, and displayed domain.'}</p></section>`;
  const html = `<header class="calculator-intro"><h1>Breakeven Calculator</h1><p>Find a seat-fee crossover against complete published API input and output price dimensions. A crossover does not create subscription-capacity evidence.</p></header><form method="get" action="${PATHNAME}" aria-label="Breakeven form"><fieldset><legend>Fee crossover controls</legend>${fields}</fieldset><button type="submit">Calculate breakeven</button></form>${resultMarkup}<section aria-labelledby="capacity-evidence-heading"><h2 id="capacity-evidence-heading">Subscription capacity evidence</h2><p><strong>Unavailable</strong></p><p>No included tokens are inferred from the fee crossover. A separately verified entitlement is required.</p></section>`;
  return createElement('main', { id: 'page-content', className: 'content-stack calculator-page', tabIndex: -1, dangerouslySetInnerHTML: { __html: html } });
}

function documentFor(scenario: BreakevenScenario): string {
  const metadata = metadataForRoute({ kind: 'breakeven' });
  const root = renderToString(createElement(BreakevenMarkup, { scenario }));
  return `<!doctype html><html lang="en" data-theme="${SITE_CONFIG.defaultTheme}"><head>${headMarkup(metadata, [])}<link rel="stylesheet" href="${FRONTEND_ASSETS.stylesheet}"></head><body><div id="root">${staticChrome(root, 'calculator')}</div><script id="cost-breakeven-initial-data" type="application/json">${serializeJsonForScript(scenario)}</script><script type="module" src="${FRONTEND_ASSETS.script}"></script></body></html>`;
}

function unavailableDocument(): string {
  const base = metadataForRoute({ kind: 'breakeven' });
  return `<!doctype html><html lang="en"><head><title>${escapeHtmlText(`Breakeven Calculator temporarily unavailable | ${SITE_CONFIG.name}`)}</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="${escapeHtmlAttribute(base.canonical)}"></head><body><main><h1>Breakeven Calculator temporarily unavailable</h1><p>Published pricing evidence cannot be read right now. No crossover has been inferred.</p><a href="/cost/">Choose another cost tool</a></main></body></html>`;
}

export async function onRequestGet({ request, env }: { request: Request; env: { readonly CATALOG_DB?: Parameters<typeof readPublishedCatalog>[0] } }): Promise<Response> {
  if (new URL(request.url).pathname !== PATHNAME) return new Response(null, { status: 301, headers: { Location: PATHNAME } });
  let scenario: BreakevenScenario;
  try { scenario = scenarioFor(request); } catch { return new Response('Invalid breakeven request', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  if (!env.CATALOG_DB) return new Response(unavailableDocument(), { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, follow' } });
  try {
    // Read-only catalog access is intentionally retained even when a submitted
    // scenario supplies prices: it confirms a published revision exists.
    const catalog = await readPublishedCatalog(env.CATALOG_DB);
    if (!catalog) throw new Error('no published catalog');
    return new Response(documentFor(scenario), { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'index, follow' } });
  } catch {
    return new Response(unavailableDocument(), { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, follow' } });
  }
}
