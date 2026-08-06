import type { BenchmarkProjectionSnapshot } from '../benchmarks/api-projections';
import {
  isCanonicalIsoTimestamp,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkRevision,
} from '../benchmarks/contracts';
import { DECISION_PICK_CATEGORIES } from '../benchmarks/decision-picks';
import { buildLeaderboard, type LeaderboardEntry } from '../benchmarks/leaderboards';
import { primaryHostedPriceForModel } from '../benchmarks/value';
import type { CatalogResponse } from '../catalog/contracts';
import type { LeaderboardKey } from '../routing/routes';
import type { RevisionChanges } from './revision-diff';

export type FrozenBenchmarkSnapshot = BenchmarkProjectionSnapshot & { readonly revision: BenchmarkRevision };

export interface CheatsheetEvidenceLens {
  readonly metricKey: string;
  readonly score: number;
  readonly scoreUnit: string;
  readonly methodology: BenchmarkMetric['methodology'];
  readonly methodologyLabel: string;
  readonly sourceRank: number | null;
}

export interface CheatsheetEntry {
  readonly rank: number;
  readonly modelKey: string;
  readonly name: string;
  readonly provider: string;
  readonly score: number;
  readonly scoreUnit: string;
  readonly methodology: BenchmarkMetric['methodology'];
  readonly methodologyLabel: string;
  readonly sourceRank: number | null;
  readonly lenses: readonly CheatsheetEvidenceLens[];
  readonly evidenceStatus: 'supported';
  readonly routeId: string | null;
  readonly inputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  readonly contextWindowTokens: number | null;
}

export interface CheatsheetCategory {
  readonly key: LeaderboardKey;
  readonly label: string;
  readonly status: 'validated-ranking' | 'evidence-lens';
  readonly positionLabel: 'TokenBench category rank' | 'Evidence position';
  readonly methodLabel: string;
  readonly entries: readonly CheatsheetEntry[];
}

export interface CheatsheetDocument {
  readonly revision: string;
  readonly catalogRevision: string;
  readonly generatedAt: string;
  readonly publishedAt: string;
  readonly categories: readonly CheatsheetCategory[];
}

export interface SubjectPreview {
  readonly subject: string;
  readonly previewText: string;
}

const MAX_ENTRIES_PER_CATEGORY = 10;
const FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/u;
const PDF_DATE_PREFIXES = [
  new TextEncoder().encode('/CreationDate'),
  new TextEncoder().encode('/ModDate'),
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPositiveSafeInteger(value: number | null): value is number {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeFinite(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function assertFrozenInputs(snapshot: FrozenBenchmarkSnapshot, catalog: CatalogResponse): readonly BenchmarkPriceCheck[] {
  if (!snapshot || !snapshot.revision || typeof snapshot.revision.revision !== 'string' || snapshot.revision.revision.length === 0) {
    throw new TypeError('benchmark snapshot must include a revision');
  }
  if (snapshot.revision.publicationState !== 'published') {
    throw new RangeError('benchmark snapshot must be published');
  }
  if (!isCanonicalIsoTimestamp(snapshot.revision.generatedAt) || !isCanonicalIsoTimestamp(snapshot.revision.publishedAt)) {
    throw new RangeError('benchmark snapshot must include canonical frozen timestamps');
  }
  if (!catalog || typeof catalog.revision !== 'string' || catalog.revision !== snapshot.revision.catalogRevision) {
    throw new RangeError('catalog revision must match the benchmark revision');
  }
  if (catalog.freshness.status !== 'fresh') {
    throw new RangeError('OpenRouter catalog must be fresh before publishing prices');
  }

  const catalogSources = catalog.provenance.filter((source) => source.id === 'openrouter-models'
    && source.providerId === 'openrouter');
  if (catalogSources.length !== 1) {
    throw new RangeError('OpenRouter catalog provenance must contain one verified source');
  }
  const [catalogSource] = catalogSources;
  if (catalogSource.reviewStatus !== 'verified'
    || !catalogSource.snapshotKey
    || catalogSource.contentHash !== snapshot.revision.openrouterContentHash) {
    throw new RangeError('OpenRouter catalog hash and verified snapshot must match the benchmark revision');
  }

  const benchmarkSources = snapshot.sources.filter((source) => source.sourceId === 'openrouter');
  if (benchmarkSources.length !== 1) {
    throw new RangeError('OpenRouter benchmark provenance must contain one source');
  }
  const [benchmarkSource] = benchmarkSources;
  const expectedArtifactId = `catalog:${catalog.revision}`;
  if (benchmarkSource.artifactId !== expectedArtifactId
    || benchmarkSource.upstreamRevision !== catalog.revision) {
    throw new RangeError('OpenRouter source artifact and upstream revision must match the catalog revision');
  }
  if (benchmarkSource.contentHash !== snapshot.revision.openrouterContentHash) {
    throw new RangeError('OpenRouter source content hash must match the benchmark revision');
  }
  if (benchmarkSource.snapshotKey !== catalogSource.snapshotKey) {
    throw new RangeError('OpenRouter source snapshot key must match catalog provenance');
  }

  const openRouterPrices = snapshot.priceChecks.filter((price) => price.sourceId === 'openrouter');
  if (openRouterPrices.some((price) => price.providerId !== 'openrouter'
    || price.sourceArtifactId !== expectedArtifactId)) {
    throw new RangeError('OpenRouter price source artifact must match the catalog revision');
  }
  return openRouterPrices;
}

function methodologyLabel(methodology: BenchmarkMetric['methodology']): string {
  switch (methodology) {
    case 'benchlm_raw_composite':
      return 'BenchLM raw composite';
    case 'bradley_terry':
      return 'LMArena Bradley-Terry';
    case 'ips':
      return 'IPS estimate';
  }
}

function categoryMethodLabel(key: LeaderboardKey): string {
  if (key === 'llm-overall' || key === 'llm-agentic' || key === 'llm-coding') return 'BenchLM raw composite';
  if (key === 'multimodal-vision-documents') return 'BenchLM and LMArena evidence lenses';
  return 'BenchLM category evidence';
}

function candidateEntry(entry: LeaderboardEntry): entry is LeaderboardEntry & { readonly metric: BenchmarkMetric } {
  return entry.model.evidenceStatus === 'supported'
    && entry.metric !== null
    && entry.metric.modelKey === entry.model.modelKey
    && entry.metric.rankingEligible
    && Number.isFinite(entry.metric.value);
}

function evidenceLenses(entry: LeaderboardEntry & { readonly metric: BenchmarkMetric }): readonly CheatsheetEvidenceLens[] {
  const metrics = entry.metrics.length > 0 ? entry.metrics : [entry.metric];
  const seen = new Set<string>();
  return metrics.flatMap((metric) => {
    if (seen.has(metric.metricKey) || !Number.isFinite(metric.value)) return [];
    seen.add(metric.metricKey);
    return [{
      metricKey: metric.metricKey,
      score: metric.value,
      scoreUnit: metric.unit,
      methodology: metric.methodology,
      methodologyLabel: methodologyLabel(metric.methodology),
      sourceRank: metric.sourceId === 'lmarena' && isPositiveSafeInteger(metric.rank) ? metric.rank : null,
    }];
  });
}

function priceFacts(
  prices: readonly BenchmarkPriceCheck[],
  model: BenchmarkModel,
): Pick<CheatsheetEntry,
  'routeId' | 'inputUsdPerMillion' | 'outputUsdPerMillion' | 'contextWindowTokens'
> {
  const modelContext = isPositiveSafeInteger(model.contextWindowTokens) ? model.contextWindowTokens : null;
  const hostedPrice = primaryHostedPriceForModel(model.modelKey, prices, 'outputHeavy');
  if (!hostedPrice) {
    return {
      routeId: null,
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
      contextWindowTokens: modelContext,
    };
  }

  const { price } = hostedPrice;
  const inputUsdPerMillion = isNonNegativeFinite(price.inputUsdPerMillion) ? price.inputUsdPerMillion : null;
  const outputUsdPerMillion = isNonNegativeFinite(price.outputUsdPerMillion) ? price.outputUsdPerMillion : null;
  if (inputUsdPerMillion === null || outputUsdPerMillion === null) {
    return {
      routeId: null,
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
      contextWindowTokens: modelContext,
    };
  }
  return {
    routeId: price.routeId,
    inputUsdPerMillion,
    outputUsdPerMillion,
    contextWindowTokens: isPositiveSafeInteger(price.contextWindowTokens) ? price.contextWindowTokens : modelContext,
  };
}

function categoryEntries(
  snapshot: FrozenBenchmarkSnapshot,
  prices: readonly BenchmarkPriceCheck[],
  key: LeaderboardKey,
): readonly CheatsheetEntry[] {
  const leaderboard = buildLeaderboard(key, snapshot.models, snapshot.metrics, prices, 'balanced');
  const seenModels = new Set<string>();
  const entries: CheatsheetEntry[] = [];

  for (const entry of leaderboard.entries) {
    if (!candidateEntry(entry) || seenModels.has(entry.model.modelKey)) continue;
    seenModels.add(entry.model.modelKey);
    const facts = priceFacts(prices, entry.model);
    entries.push({
      rank: entries.length + 1,
      modelKey: entry.model.modelKey,
      name: entry.model.name,
      provider: entry.model.creator,
      score: entry.metric.value,
      scoreUnit: entry.metric.unit,
      methodology: entry.metric.methodology,
      methodologyLabel: methodologyLabel(entry.metric.methodology),
      sourceRank: entry.sourceRank,
      lenses: evidenceLenses(entry),
      evidenceStatus: 'supported',
      ...facts,
    });
    if (entries.length === MAX_ENTRIES_PER_CATEGORY) break;
  }
  return entries;
}

/**
 * Builds a small, frozen fact projection. It intentionally obtains category
 * order from the already-published decision-pick registry and obtains rank
 * order from the leaderboard derivation rather than recreating either rule.
 */
export function buildCheatsheet(snapshot: FrozenBenchmarkSnapshot, catalog: CatalogResponse): CheatsheetDocument {
  const verifiedOpenRouterPrices = assertFrozenInputs(snapshot, catalog);
  return {
    revision: snapshot.revision.revision,
    catalogRevision: snapshot.revision.catalogRevision,
    generatedAt: snapshot.revision.generatedAt,
    publishedAt: snapshot.revision.publishedAt,
    categories: DECISION_PICK_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      status: category.status === 'benchalign' ? 'validated-ranking' : 'evidence-lens',
      positionLabel: category.status === 'benchalign' ? 'TokenBench category rank' : 'Evidence position',
      methodLabel: categoryMethodLabel(category.key),
      entries: categoryEntries(snapshot, verifiedOpenRouterPrices, category.key),
    })),
  };
}

function unavailable(value: string | number | null): string | number {
  return value === null ? 'Unavailable' : value;
}

/**
 * Escapes a CSV cell and makes formula-looking text literal before it reaches
 * spreadsheet software. The function is exported so future factual exports
 * can share the same injection boundary without copying it.
 */
export function csvCell(value: string | number | null): string {
  const literal = String(unavailable(value));
  const formulaSafe = FORMULA_PREFIX.test(literal) ? `'${literal}` : literal;
  return /[",\r\n]/u.test(formulaSafe) ? `"${formulaSafe.replace(/"/gu, '""')}"` : formulaSafe;
}

/** Renders one deterministic RFC-4180-compatible fact table. */
export function renderCheatsheetCsv(document: CheatsheetDocument): string {
  const header = [
    'revision', 'generated_at', 'category_key', 'category_label', 'category_status', 'position_label', 'category_position',
    'model_key', 'model_name', 'provider', 'metric_key', 'score', 'score_unit', 'methodology', 'source_rank',
    'route_id', 'input_usd_per_million', 'output_usd_per_million', 'context_window_tokens', 'evidence_status',
  ];
  const rows = document.categories.flatMap((category) => category.entries.flatMap((entry) => entry.lenses.map((lens) => [
    document.revision,
    document.generatedAt,
    category.key,
    category.label,
    category.status,
    category.positionLabel,
    entry.rank,
    entry.modelKey,
    entry.name,
    entry.provider,
    lens.metricKey,
    lens.score,
    lens.scoreUnit,
    lens.methodologyLabel,
    lens.sourceRank,
    entry.routeId,
    entry.inputUsdPerMillion,
    entry.outputUsdPerMillion,
    entry.contextWindowTokens,
    entry.evidenceStatus,
  ].map(csvCell).join(','))));
  return [header.map(csvCell).join(','), ...rows].join('\r\n').concat('\r\n');
}

function htmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function displayUsd(value: number | null): string {
  return value === null ? 'Unavailable' : `$${value.toString()}`;
}

function displayContext(value: number | null): string {
  return value === null ? 'Unavailable' : value.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

function displayLenses(entry: CheatsheetEntry): string {
  return entry.lenses.map((lens) => {
    const sourceRank = lens.sourceRank === null ? '' : `; source rank ${lens.sourceRank}`;
    return `<span class="lens"><code>${htmlEscape(lens.metricKey)}</code>: ${htmlEscape(lens.score)} ${htmlEscape(lens.scoreUnit)}<br><span class="method-detail">${htmlEscape(lens.methodologyLabel)}${htmlEscape(sourceRank)}</span></span>`;
  }).join('<br>');
}

function categoryTable(category: CheatsheetCategory): string {
  const rows = category.entries.map((entry) => `<tr>
    <td>${htmlEscape(entry.rank)}</td>
    <th scope="row" data-model-key="${htmlEscape(entry.modelKey)}">${htmlEscape(entry.name)}<br><span class="provider">${htmlEscape(entry.provider)}</span></th>
    <td>${displayLenses(entry)}</td>
    <td>${htmlEscape(entry.routeId ?? 'Unavailable')}</td>
    <td>${htmlEscape(displayUsd(entry.inputUsdPerMillion))}</td>
    <td>${htmlEscape(displayUsd(entry.outputUsdPerMillion))}</td>
    <td>${htmlEscape(displayContext(entry.contextWindowTokens))}</td>
  </tr>`).join('\n');
  const empty = '<tr><td colspan="7">Unavailable - no supported rows in this frozen revision.</td></tr>';
  const headingId = `category-${category.key}`;
  const statusLabel = category.status === 'validated-ranking'
    ? 'Validated TokenBench category ranking'
    : 'Evidence lens - not a validated TokenBench category rank';
  return `<section class="category" aria-labelledby="${htmlEscape(headingId)}">
  <h2 id="${htmlEscape(headingId)}">${htmlEscape(category.label)}</h2>
  <p class="method"><strong>Status:</strong> ${htmlEscape(statusLabel)}</p>
  <p class="method"><strong>Method:</strong> ${htmlEscape(category.methodLabel)}</p>
  <table>
    <caption>${htmlEscape(category.label)}</caption>
    <thead><tr>
      <th scope="col">${htmlEscape(category.positionLabel)}</th>
      <th scope="col">Model / provider</th>
      <th scope="col">Score / method</th>
      <th scope="col">Pricing route</th>
      <th scope="col">Input / 1M</th>
      <th scope="col">Output / 1M</th>
      <th scope="col">Context window</th>
    </tr></thead>
    <tbody>${rows || empty}</tbody>
  </table>
</section>`;
}

/** Renders self-contained semantic A4 HTML with no remote resources. */
export function renderCheatsheetHtml(document: CheatsheetDocument): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>TokenBench monthly cheatsheet - ${htmlEscape(document.revision)}</title>
<style>
  :root { color: #172033; background: #fff; font-family: Arial, sans-serif; }
  @page { size: A4; margin: 13mm; }
  body { margin: 0; font-size: 10pt; line-height: 1.35; }
  header { border-bottom: 2px solid #172033; margin-bottom: 12pt; padding-bottom: 8pt; }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  h2 { font-size: 13pt; margin: 0; }
  .metadata, .method { margin: 4pt 0; }
  .category { break-inside: avoid; margin: 14pt 0; }
  table { border-collapse: collapse; font-size: 8.5pt; table-layout: fixed; width: 100%; }
  caption { caption-side: top; font-weight: 700; text-align: left; padding: 2pt 0; }
  th, td { border: 1px solid #9aa4b4; overflow-wrap: anywhere; padding: 3pt; text-align: left; vertical-align: top; }
  th { background: #e9edf4; }
  .provider, .method-detail { color: #3b4659; font-weight: 400; }
  @media print { body { color: #000; } a { color: inherit; text-decoration: none; } }
</style>
</head>
<body>
<main aria-labelledby="cheatsheet-title">
  <header>
    <h1 id="cheatsheet-title">TokenBench monthly LLM API cost &amp; benchmark cheatsheet</h1>
    <p class="metadata">Frozen benchmark revision: <strong>${htmlEscape(document.revision)}</strong></p>
    <p class="metadata">Catalog revision: <strong>${htmlEscape(document.catalogRevision)}</strong></p>
    <p class="metadata">Generated: <time datetime="${htmlEscape(document.generatedAt)}">${htmlEscape(document.generatedAt)}</time></p>
    <p class="metadata">Prices are exact route-specific USD per 1M tokens. Missing facts remain <strong>Unavailable</strong>.</p>
  </header>
  ${document.categories.map(categoryTable).join('\n')}
</main>
</body>
</html>
`;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function changeSummary(changes: RevisionChanges): string {
  const newModels = plural(changes.newModels.length, 'new model');
  const priceDrops = plural(changes.priceDrops.length, 'verified price drop');
  if (changes.newModels.length > 0 && changes.priceDrops.length > 0) return `${newModels} and ${priceDrops}`;
  if (changes.newModels.length > 0) return newModels;
  if (changes.priceDrops.length > 0) return priceDrops;
  return 'no new models or verified price drops';
}

function monthLabel(generatedAt: string): string {
  const date = new Date(generatedAt);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Produces a small, deterministic factual subject/preview set for a campaign draft. */
export function subjectPreviewSet(document: CheatsheetDocument, changes: RevisionChanges): readonly SubjectPreview[] {
  const month = monthLabel(document.generatedAt);
  const summary = changeSummary(changes);
  return [
    {
      subject: `TokenBench ${month}: ${summary}`,
      previewText: `Frozen benchmark revision ${document.revision} with validated ranks, evidence lenses, per-1M rates, and context windows.`,
    },
    {
      subject: `TokenBench ${month} monthly model cheatsheet`,
      previewText: `Frozen benchmark revision ${document.revision}: ${summary}.`,
    },
  ];
}

function changedModelItems(changes: RevisionChanges): string {
  if (changes.newModels.length === 0) return '<li>Unavailable - no newly published model identities in this revision.</li>';
  return changes.newModels
    .slice()
    .sort((left, right) => compareText(left.modelKey, right.modelKey))
    .map((fact) => `<li><code>${htmlEscape(fact.modelKey)}</code></li>`)
    .join('');
}

function priceDropItems(changes: RevisionChanges): string {
  if (changes.priceDrops.length === 0) return '<li>Unavailable - no verified route price drops in this revision.</li>';
  return changes.priceDrops
    .slice()
    .sort((left, right) => compareText(left.modelKey, right.modelKey)
      || compareText(left.providerId, right.providerId)
      || compareText(left.routeId, right.routeId))
    .map((fact) => `<li><code>${htmlEscape(fact.modelKey)}</code> via <code>${htmlEscape(fact.routeId)}</code>: input ${htmlEscape(displayUsd(fact.previousInputUsdPerMillion))} → ${htmlEscape(displayUsd(fact.currentInputUsdPerMillion))}; output ${htmlEscape(displayUsd(fact.previousOutputUsdPerMillion))} → ${htmlEscape(displayUsd(fact.currentOutputUsdPerMillion))}.</li>`)
    .join('');
}

/** Renders self-contained campaign HTML exclusively from typed frozen facts. */
export function renderNewsletterHtml(document: CheatsheetDocument, changes: RevisionChanges): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'"><title>TokenBench monthly cheatsheet</title></head>
<body>
  <main>
    <h1>TokenBench monthly LLM API cost &amp; benchmark cheatsheet</h1>
    <p>Frozen benchmark revision <strong>${htmlEscape(document.revision)}</strong>, paired with catalog revision <strong>${htmlEscape(document.catalogRevision)}</strong>.</p>
    <p>This edition records ${htmlEscape(changeSummary(changes))}.</p>
    <h2>New model identities</h2>
    <ul>${changedModelItems(changes)}</ul>
    <h2>Verified route price drops</h2>
    <ul>${priceDropItems(changes)}</ul>
    <p>The attached cheatsheet lists supported category positions, route-specific per-1M USD rates, and declared context windows. Missing facts remain Unavailable.</p>
  </main>
</body>
</html>
`;
}

function bytesStartWith(bytes: Uint8Array, offset: number, prefix: Uint8Array): boolean {
  if (offset + prefix.length > bytes.length) return false;
  return prefix.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = '';
  for (let index = start; index < end; index += 1) value += String.fromCharCode(bytes[index]);
  return value;
}

function pdfDate(frozenGeneratedAt: string, useZulu: boolean): string {
  const date = new Date(frozenGeneratedAt);
  const part = [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
    date.getUTCHours().toString().padStart(2, '0'),
    date.getUTCMinutes().toString().padStart(2, '0'),
    date.getUTCSeconds().toString().padStart(2, '0'),
  ].join('');
  return `D:${part}${useZulu ? 'Z' : "+00'00'"}`;
}

/**
 * Rewrites only fixed-length PDF date values, preserving all object and xref
 * offsets. Binary bytes never pass through a UTF-8 string conversion.
 */
export function normalizePdfMetadata(bytes: Uint8Array, frozenGeneratedAt: string): Uint8Array {
  if (!isCanonicalIsoTimestamp(frozenGeneratedAt)) throw new RangeError('frozenGeneratedAt must be a canonical ISO timestamp');
  const normalized = bytes.slice();
  for (let index = 0; index < normalized.length; index += 1) {
    const prefix = PDF_DATE_PREFIXES.find((candidate) => bytesStartWith(normalized, index, candidate));
    if (!prefix) continue;
    let cursor = index + prefix.length;
    while (cursor < normalized.length && (normalized[cursor] === 0x20 || normalized[cursor] === 0x09)) cursor += 1;
    if (normalized[cursor] !== 0x28) continue;
    const start = cursor + 1;
    let end = start;
    while (end < normalized.length && normalized[end] !== 0x29) end += 1;
    if (end === normalized.length) continue;
    const existing = ascii(normalized, start, end);
    if (!/^D:\d{14}(?:Z|[+\-]\d{2}'\d{2}')$/u.test(existing)) continue;
    const replacement = pdfDate(frozenGeneratedAt, existing.endsWith('Z'));
    if (replacement.length !== existing.length) continue;
    for (let replacementIndex = 0; replacementIndex < replacement.length; replacementIndex += 1) {
      normalized[start + replacementIndex] = replacement.charCodeAt(replacementIndex);
    }
    index = end;
  }
  return normalized;
}
