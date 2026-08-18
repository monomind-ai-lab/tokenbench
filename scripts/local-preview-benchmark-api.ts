import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  LOCAL_MODEL_SLUG_ALIASES,
  localModelDirectoryEnvelope,
  localModelProfile,
} from '../browser-tests/model-directory-fixtures';
import {
  attributionForAllSources,
  benchmarkEnvelope,
  decodeOpaqueValue,
  encodeOpaqueValue,
  type ActiveBenchmarkSnapshot,
} from '../functions/_shared/benchmark-db';
import {
  buildBenchmarkSummaryData,
  type BenchmarkProjectionSnapshot,
} from '../src/benchmarks/api-projections';
import { buildPricePerformanceProjection } from '../src/benchmarks/price-performance';
import type { PricePerformanceEnvelope } from '../src/benchmarks/price-performance-contracts';
import {
  validateNormalizedSourceBatch,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkRevision,
  type BenchmarkSourceRecord,
} from '../src/benchmarks/contracts';
import {
  createLeaderboardQueryCapabilities,
  filterLeaderboardEntries,
  hasValidLeaderboardQueryEncoding,
  leaderboardQueryToSearchParams,
  parseLeaderboardQuery,
  type LeaderboardQueryState,
} from '../src/benchmarks/leaderboard-query';
import { isValidLeaderboardCursor } from '../src/benchmarks/leaderboard-cursor';
import { leaderboardCsv } from '../src/benchmarks/leaderboard-csv';
import {
  DEFAULT_MODEL_DIRECTORY_QUERY,
  modelDirectoryQueryFromSearch,
  type ModelDirectoryQueryState,
} from '../src/frontend/model-directory-state';
import { buildLeaderboard, LEADERBOARD_DEFINITIONS, type LeaderboardResult } from '../src/benchmarks/leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../src/routing/routes';
import { renderModelDirectoryDocument } from '../functions/models/index';
import {
  renderModelProfileDocument,
  renderModelProfileStatusDocument,
} from '../functions/models/[slug]';
import {
  PRICE_PERFORMANCE_ARCHIVED_LIMIT,
  pricePerformanceEnvelopeData,
} from '../functions/_shared/price-performance-db';

const SAMPLE_TIMESTAMP = '2000-01-01T00:00:00.000Z';
const SAMPLE_REVISION_ID = 'local-sample-preview-r1';
const LOCAL_PREVIEW_STATE_HEADER = 'x-tokenbench-preview-state';
const MODEL_DIRECTORY_PARAMETERS = new Set(['q', 'creator', 'sourceType', 'evidenceStatus', 'status', 'limit', 'cursor']);

/** Visible on every local response and in the existing stale-data UI state. */
export const LOCAL_SAMPLE_NOTICE = 'LOCAL SAMPLE PREVIEW — synthetic rows for local UI review only. They are not current TokenBench rankings or a published D1 revision; live data requires Cloudflare Pages with CATALOG_DB.';

function sha256(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

const SAMPLE_SOURCES: readonly BenchmarkSourceRecord[] = [
  {
    sourceId: 'benchlm',
    artifactId: 'local-sample-benchlm',
    sourceUrl: 'https://tokenbench.local/local-sample/benchlm',
    observedAt: SAMPLE_TIMESTAMP,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: 'local-sample-v1',
    snapshotKey: 'local-sample/benchlm.json',
    contentHash: sha256('a'),
    originalContentHash: sha256('b'),
    licenseId: 'MIT',
    attributionText: 'LOCAL SAMPLE data — not a published BenchLM ranking.',
  },
  {
    sourceId: 'lmarena',
    artifactId: 'local-sample-lmarena',
    sourceUrl: 'https://tokenbench.local/local-sample/lmarena',
    observedAt: SAMPLE_TIMESTAMP,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: 'local-sample-v1',
    snapshotKey: 'local-sample/lmarena.json',
    contentHash: sha256('c'),
    originalContentHash: sha256('d'),
    licenseId: 'CC-BY-4.0',
    attributionText: 'LOCAL SAMPLE data — not a published LMArena ranking.',
  },
  {
    sourceId: 'openrouter',
    artifactId: 'local-sample-openrouter',
    sourceUrl: 'https://tokenbench.local/local-sample/openrouter',
    observedAt: SAMPLE_TIMESTAMP,
    etag: null,
    lastModified: null,
    upstreamRevision: null,
    schemaVersion: 'local-sample-v1',
    snapshotKey: 'local-sample/openrouter.json',
    contentHash: sha256('e'),
    originalContentHash: sha256('f'),
    licenseId: 'OpenRouter-ToS',
    attributionText: 'LOCAL SAMPLE pricing — not a published OpenRouter route.',
  },
];

function benchLmModel(modelKey: string, slug: string, name: string, scoreCount: number, creator = 'LOCAL SAMPLE Labs'): BenchmarkModel {
  return {
    modelKey,
    slug,
    name,
    creator,
    sourceType: 'Proprietary',
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 128_000,
    evidenceStatus: 'supported',
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: scoreCount,
    sourceId: 'benchlm',
    sourceModelId: modelKey,
    sourceArtifactId: 'local-sample-benchlm',
  };
}

const SAMPLE_ATLAS = benchLmModel('local-sample:atlas', 'sample-atlas', 'Sample Atlas', 6);
const SAMPLE_ORBIT = benchLmModel('local-sample:orbit', 'sample-orbit', 'Sample Orbit', 6);
const SAMPLE_GPT_56_SOL = benchLmModel('openai:gpt-5-6-sol', 'gpt-5-6-sol', 'GPT-5.6 Sol', 2, 'OpenAI');
const SAMPLE_CANVAS: BenchmarkModel = {
  modelKey: 'local-sample:canvas',
  slug: 'sample-canvas',
  name: 'Sample Canvas',
  creator: 'LOCAL SAMPLE Media Lab',
  sourceType: 'Proprietary',
  reasoningType: null,
  releaseDate: null,
  contextWindowTokens: null,
  evidenceStatus: 'source_only',
  rankingEligible: true,
  confidenceLower: null,
  confidenceUpper: null,
  benchmarkCount: 8,
  sourceId: 'lmarena',
  sourceModelId: 'local-sample:canvas',
  sourceArtifactId: 'local-sample-lmarena',
};

function benchLmMetric(
  model: BenchmarkModel,
  metricKey: string,
  category: string,
  value: number,
  rank: number | null = null,
  rankFieldSize: number | null = null,
): BenchmarkMetric {
  return {
    modelKey: model.modelKey,
    metricKey,
    category,
    value,
    rawValue: null,
    rank,
    rankFieldSize,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: SAMPLE_TIMESTAMP,
    sourceModelId: model.sourceModelId,
    sourceArtifactId: 'local-sample-benchlm',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
}

function lmArenaMetric(metricKey: string, category: string, value: number): BenchmarkMetric {
  return {
    modelKey: SAMPLE_CANVAS.modelKey,
    metricKey,
    category,
    value,
    rawValue: null,
    rank: 1,
    rankFieldSize: null,
    lower: null,
    upper: null,
    voteCount: 1,
    unit: 'arena_score',
    sourceId: 'lmarena',
    sourceUpdatedAt: SAMPLE_TIMESTAMP,
    sourceModelId: SAMPLE_CANVAS.sourceModelId,
    sourceArtifactId: 'local-sample-lmarena',
    rankingEligible: true,
    methodology: 'bradley_terry',
    observationCount: null,
    sessionCount: null,
  };
}

function samplePrice(model: BenchmarkModel, input: number, output: number): BenchmarkPriceCheck {
  return {
    modelKey: model.modelKey,
    sourceId: 'openrouter',
    providerId: 'local-sample',
    inputUsdPerMillion: input,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: output,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: `local-sample:${model.slug}`,
    sourceModelId: model.modelKey,
    canonicalSlug: model.slug,
    maxInputTokens: 120_000,
    maxOutputTokens: 8_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['tools'],
    sourceArtifactId: 'local-sample-openrouter',
  };
}

const SAMPLE_BATCH = validateNormalizedSourceBatch({
  sources: SAMPLE_SOURCES,
  models: [SAMPLE_ATLAS, SAMPLE_ORBIT, SAMPLE_GPT_56_SOL, SAMPLE_CANVAS],
  metrics: [
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:overall:raw', 'overall', 94, 1),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:coding', 'coding', 97, 1),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:agentic', 'agentic', 95),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:reasoning', 'reasoning', 93),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:knowledge', 'knowledge', 92),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:multimodalGrounded', 'multimodalGrounded', 90),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:overall:raw', 'overall', 91, 2),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:coding', 'coding', 89, 2),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:agentic', 'agentic', 90),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:reasoning', 'reasoning', 88),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:knowledge', 'knowledge', 87),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:multimodalGrounded', 'multimodalGrounded', 86),
    benchLmMetric(SAMPLE_GPT_56_SOL, 'benchlm:overall:raw', 'overall', 81.48, 3),
    benchLmMetric(SAMPLE_GPT_56_SOL, 'benchlm:category:coding', 'coding', 77.95, 3),
    lmArenaMetric('lmarena:text_style_control:overall', 'text-style-control', 1_000),
    lmArenaMetric('lmarena:vision_style_control:overall', 'vision-style-control', 999),
    lmArenaMetric('lmarena:document_style_control:overall', 'document-style-control', 998),
    lmArenaMetric('lmarena:text_to_image:overall', 'text-to-image', 997),
    lmArenaMetric('lmarena:image_edit:overall', 'image-editing', 996),
    lmArenaMetric('lmarena:text_to_video:overall', 'text-to-video', 995),
    lmArenaMetric('lmarena:image_to_video:overall', 'image-to-video', 994),
    lmArenaMetric('lmarena:video_edit:overall', 'video-editing', 993),
  ],
  priceChecks: [
    samplePrice(SAMPLE_ATLAS, 2, 8),
    samplePrice(SAMPLE_ORBIT, 1, 4),
    samplePrice(SAMPLE_GPT_56_SOL, 1.5, 10),
  ],
  comparisonSeeds: [],
});

const SAMPLE_REVISION: BenchmarkRevision = {
  revision: SAMPLE_REVISION_ID,
  generatedAt: SAMPLE_TIMESTAMP,
  publishedAt: SAMPLE_TIMESTAMP,
  checkedAt: SAMPLE_TIMESTAMP,
  publicationState: 'published',
  contentHash: sha256('1'),
  catalogRevision: 'local-sample-catalog-r1',
  openrouterContentHash: sha256('2'),
};

const SAMPLE_SNAPSHOT: ActiveBenchmarkSnapshot = {
  revision: SAMPLE_REVISION,
  sources: SAMPLE_BATCH.sources,
  models: SAMPLE_BATCH.models,
  metrics: SAMPLE_BATCH.metrics,
  priceChecks: SAMPLE_BATCH.priceChecks,
  comparisonPairs: [],
};

const SAMPLE_FRESHNESS = {
  status: 'fresh' as const,
  checkedAt: SAMPLE_TIMESTAMP,
  message: LOCAL_SAMPLE_NOTICE,
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface SamplePaginationRequest {
  readonly limit: number;
  readonly cursor: string | null;
  readonly filters: URLSearchParams;
}

interface SampleCursorRequest {
  readonly key: LeaderboardKey;
  readonly profile: LeaderboardQueryState['profile'];
  readonly limit: number;
  readonly includeEstimated: boolean;
  readonly filterIdentity: string;
}

interface SampleCursorPayload {
  readonly v: 1;
  readonly r: string;
  readonly k: LeaderboardKey;
  readonly p: LeaderboardQueryState['profile'];
  readonly l: number;
  readonly e: boolean;
  readonly f?: string;
  readonly o: number;
}

interface SampleFilteredLeaderboard {
  readonly leaderboard: LeaderboardResult;
  readonly entries: readonly LeaderboardResult['entries'][number][];
  readonly capabilities: ReturnType<typeof createLeaderboardQueryCapabilities>;
  readonly filters: LeaderboardQueryState;
}

function isLeaderboardKey(value: string): value is LeaderboardKey {
  return Object.prototype.hasOwnProperty.call(LEADERBOARD_ROUTES, value)
    && Object.prototype.hasOwnProperty.call(LEADERBOARD_DEFINITIONS, value);
}

function oneQueryValue(parameters: URLSearchParams, name: string): string | null {
  const values = parameters.getAll(name);
  if (values.length > 1) throw new Error(`duplicate ${name}`);
  return values[0] ?? null;
}

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  if (!/^[1-9]\d*$/u.test(value)) throw new Error('invalid limit');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > MAX_LIMIT) throw new Error('invalid limit');
  return limit;
}

function paginationRequest(url: URL): SamplePaginationRequest | null {
  try {
    if (!hasValidLeaderboardQueryEncoding(url.search)) return null;
    const limit = parseLimit(oneQueryValue(url.searchParams, 'limit'));
    const cursor = oneQueryValue(url.searchParams, 'cursor');
    if (cursor !== null && cursor !== '' && !isValidLeaderboardCursor(cursor)) return null;
    const includeEstimated = oneQueryValue(url.searchParams, 'includeEstimated');
    if (includeEstimated !== null && includeEstimated !== '1') return null;
    if (includeEstimated !== null && url.searchParams.has('estimated')) return null;
    const filters = new URLSearchParams(url.searchParams);
    filters.delete('limit');
    filters.delete('cursor');
    filters.delete('includeEstimated');
    if (includeEstimated === '1') filters.set('estimated', '1');
    return { limit, cursor: cursor || null, filters };
  } catch {
    return null;
  }
}

function localFilterState(key: LeaderboardKey, filters: LeaderboardQueryState): LeaderboardQueryState {
  return key === 'multimodal-vision-documents'
    && filters.sort === LEADERBOARD_DEFINITIONS[key].defaultSort
    ? { ...filters, preserveSourceLensOrder: true }
    : filters;
}

function sampleFilteredLeaderboard(key: LeaderboardKey, parameters: URLSearchParams): SampleFilteredLeaderboard | null {
  if (!hasValidLeaderboardQueryEncoding(parameters.toString())) return null;
  const definition = LEADERBOARD_DEFINITIONS[key];
  const preflight = parseLeaderboardQuery(
    parameters,
    definition,
    createLeaderboardQueryCapabilities(definition),
    'api-preflight',
  );
  if (!preflight.ok) return null;
  const leaderboard = buildLeaderboard(
    key,
    SAMPLE_SNAPSHOT.models,
    SAMPLE_SNAPSHOT.metrics,
    SAMPLE_SNAPSHOT.priceChecks,
    preflight.state.profile,
  );
  const capabilities = createLeaderboardQueryCapabilities(definition, leaderboard.entries);
  const parsed = parseLeaderboardQuery(parameters, definition, capabilities, 'api');
  if (!parsed.ok) return null;
  const filters = localFilterState(key, parsed.state);
  return {
    leaderboard,
    entries: filterLeaderboardEntries(leaderboard.entries, filters),
    capabilities,
    filters,
  };
}

function filterIdentity(filters: LeaderboardQueryState, key: LeaderboardKey): string {
  const canonical = leaderboardQueryToSearchParams(filters);
  canonical.delete('profile');
  canonical.delete('estimated');
  if (filters.sort === LEADERBOARD_DEFINITIONS[key].defaultSort) canonical.delete('sort');
  const value = canonical.toString();
  return value === '' ? '' : `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function cursorFor(request: SampleCursorRequest, offset: number): string {
  const payload: SampleCursorPayload = {
    v: 1,
    r: SAMPLE_REVISION_ID,
    k: request.key,
    p: request.profile,
    l: request.limit,
    e: request.includeEstimated,
    ...(request.filterIdentity ? { f: request.filterIdentity } : {}),
    o: offset,
  };
  const cursor = encodeOpaqueValue(payload);
  if (!isValidLeaderboardCursor(cursor)) throw new Error('sample cursor exceeds the public boundary');
  return cursor;
}

function offsetFromCursor(cursor: string, request: SampleCursorRequest): number | null {
  try {
    if (!isValidLeaderboardCursor(cursor)) return null;
    const decoded = decodeOpaqueValue(cursor);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    const value = decoded as Partial<SampleCursorPayload>;
    if (value.v !== 1
      || value.r !== SAMPLE_REVISION_ID
      || value.k !== request.key
      || value.p !== request.profile
      || value.l !== request.limit
      || value.e !== request.includeEstimated
      || !((value.f === undefined && request.filterIdentity === '') || value.f === request.filterIdentity)
      || !Number.isSafeInteger(value.o)
      || value.o === undefined
      || value.o < 1
      || value.o % request.limit !== 0
      || cursorFor(request, value.o) !== cursor) return null;
    return value.o;
  } catch {
    return null;
  }
}

function sampleLeaderboardResponse(key: LeaderboardKey, url: URL): unknown | null {
  const pagination = paginationRequest(url);
  if (!pagination) return null;
  const sample = sampleFilteredLeaderboard(key, pagination.filters);
  if (!sample) return null;
  const request: SampleCursorRequest = {
    key,
    profile: sample.filters.profile,
    limit: pagination.limit,
    includeEstimated: sample.filters.includeEstimated,
    filterIdentity: filterIdentity(sample.filters, key),
  };
  const offset = pagination.cursor === null ? 0 : offsetFromCursor(pagination.cursor, request);
  if (offset === null || (pagination.cursor !== null && offset >= sample.entries.length)) return null;
  const entries = sample.entries.slice(offset, offset + pagination.limit);
  const nextOffset = offset + entries.length;
  const nextCursor = nextOffset < sample.entries.length ? cursorFor(request, nextOffset) : null;
  return benchmarkEnvelope(SAMPLE_SNAPSHOT, SAMPLE_FRESHNESS, attributionForAllSources(SAMPLE_SNAPSHOT), {
    ...sample.leaderboard,
    entries,
    capabilities: sample.capabilities,
    pagination: {
      limit: pagination.limit,
      total: sample.entries.length,
      nextCursor,
    },
  });
}

function sampleCsvResponse(key: LeaderboardKey, url: URL): string | null {
  if (!hasValidLeaderboardQueryEncoding(url.search)) return null;
  const sample = sampleFilteredLeaderboard(key, url.searchParams);
  return sample ? leaderboardCsv(sample.leaderboard, sample.filters) : null;
}

function sampleSummaryResponse(): unknown {
  const snapshot: BenchmarkProjectionSnapshot = SAMPLE_SNAPSHOT;
  return benchmarkEnvelope(
    SAMPLE_SNAPSHOT,
    SAMPLE_FRESHNESS,
    attributionForAllSources(SAMPLE_SNAPSHOT),
    buildBenchmarkSummaryData(snapshot),
  );
}

function samplePricePerformanceResponse(includeArchived: boolean): PricePerformanceEnvelope {
  const projection = buildPricePerformanceProjection({
    models: SAMPLE_SNAPSHOT.models,
    metrics: SAMPLE_SNAPSHOT.metrics,
    priceChecks: SAMPLE_SNAPSHOT.priceChecks,
  });
  const familyPoints = projection.points.map((point) => point.modelKey === SAMPLE_ATLAS.modelKey || point.modelKey === SAMPLE_ORBIT.modelKey
    ? { ...point, familyId: 'local-sample:shared-family' }
    : point);
  const orbit = familyPoints.find((point) => point.modelKey === SAMPLE_ORBIT.modelKey);
  const gpt = familyPoints.find((point) => point.modelKey === SAMPLE_GPT_56_SOL.modelKey);
  if (!orbit || !gpt) throw new Error('local price-performance fixtures are incomplete');
  const zeroPrice = {
    ...orbit,
    modelKey: 'local-sample:zero-price',
    slug: 'sample-zero-price',
    displayName: 'Sample Zero Price',
    familyId: 'local-sample:zero-price',
    route: {
      ...orbit.route,
      routeId: 'local-sample:zero-price',
      sourceModelId: 'local-sample:zero-price',
      canonicalSlug: 'sample-zero-price',
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    },
  };
  const archived = {
    ...gpt,
    modelKey: 'local-sample:archived-sol',
    slug: 'sample-archived-sol',
    displayName: 'Sample Archived Sol',
    familyId: 'local-sample:archived-sol',
    status: 'archived' as const,
    route: {
      ...gpt.route,
      routeId: 'local-sample:archived-sol',
      sourceModelId: 'local-sample:archived-sol',
      canonicalSlug: 'sample-archived-sol',
    },
  };
  const points = includeArchived
    ? [...familyPoints, zeroPrice, archived]
    : [...familyPoints, zeroPrice];
  return benchmarkEnvelope(
    SAMPLE_SNAPSHOT,
    SAMPLE_FRESHNESS,
    attributionForAllSources(SAMPLE_SNAPSHOT),
    pricePerformanceEnvelopeData(
      points,
      includeArchived ? { hasMore: false, limit: PRICE_PERFORMANCE_ARCHIVED_LIMIT } : undefined,
    ),
  );
}

function writeJson(response: ServerResponse, status: number, body: unknown, headOnly: boolean): void {
  const payload = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-TokenBench-Preview-Data', 'local-sample');
  response.end(headOnly ? undefined : payload);
}

function localizeSsrAssets(document: string): string {
  return document
    .replaceAll('/assets/tokenbench.css', '/src/index.css')
    .replaceAll('/assets/main.js', '/src/main.tsx');
}

function writeHtml(
  response: ServerResponse,
  status: number,
  body: string,
  headOnly: boolean,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.statusCode = status;
  response.setHeader('Cache-Control', status >= 500 ? 'no-store' : 'public, max-age=0, must-revalidate');
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('X-TokenBench-Preview-Data', 'local-sample');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(headOnly ? undefined : localizeSsrAssets(body));
}

function writeRedirect(response: ServerResponse, status: 301 | 308, location: string): void {
  response.statusCode = status;
  response.setHeader('Cache-Control', 'public, max-age=3600');
  response.setHeader('Location', location);
  response.end();
}

function localModelDirectoryRequest(url: URL): {
  readonly query: ModelDirectoryQueryState;
  readonly limit: number;
} | null {
  for (const [key] of url.searchParams) {
    if (!MODEL_DIRECTORY_PARAMETERS.has(key) || url.searchParams.getAll(key).length !== 1) return null;
  }
  const limitValue = url.searchParams.get('limit');
  const limit = limitValue === null ? 100 : Number(limitValue);
  if (!/^[1-9]\d{0,2}$/.test(limitValue ?? '100') || !Number.isSafeInteger(limit) || limit > 100) return null;
  if (url.searchParams.has('cursor')) return null;
  const query = modelDirectoryQueryFromSearch(url.searchParams);
  const canonicalSearch = url.searchParams.get('q');
  if (canonicalSearch !== null && canonicalSearch.trim().length > 80) return null;
  return { query, limit };
}

function serveLocalModelDocument(
  url: URL,
  response: ServerResponse,
  headOnly: boolean,
): boolean {
  if (url.pathname === '/models') {
    writeRedirect(response, 301, '/models/');
    return true;
  }
  if (url.pathname === '/models/') {
    const parsed = localModelDirectoryRequest(url) ?? { query: DEFAULT_MODEL_DIRECTORY_QUERY, limit: 100 };
    const envelope = localModelDirectoryEnvelope(parsed.query, parsed.limit);
    writeHtml(response, 200, renderModelDirectoryDocument(envelope, { ...parsed.query, limit: parsed.limit, cursor: null }), headOnly, {
      'X-Robots-Tag': 'index, follow',
    });
    return true;
  }
  const match = /^\/models\/([^/]+)\/?$/u.exec(url.pathname);
  if (!match) return false;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]!);
  } catch {
    writeHtml(response, 404, renderModelProfileStatusDocument(404, null), headOnly, { 'X-Robots-Tag': 'noindex, follow' });
    return true;
  }
  const canonicalAlias = LOCAL_MODEL_SLUG_ALIASES.get(slug);
  if (canonicalAlias) {
    writeRedirect(response, 308, `/models/${canonicalAlias}/`);
    return true;
  }
  const profile = localModelProfile(slug);
  if (!profile) {
    writeHtml(response, 404, renderModelProfileStatusDocument(404, slug), headOnly, { 'X-Robots-Tag': 'noindex, follow' });
    return true;
  }
  if (!url.pathname.endsWith('/')) {
    writeRedirect(response, 308, `/models/${profile.directory.canonicalSlug}/`);
    return true;
  }
  writeHtml(response, 200, renderModelProfileDocument(profile), headOnly, { 'X-Robots-Tag': 'index, follow' });
  return true;
}

function methodologyHeader(key: LeaderboardKey): string {
  switch (LEADERBOARD_DEFINITIONS[key].kind) {
    case 'benchlm':
    case 'value':
      return 'benchlm_raw_composite';
    case 'lmarena':
      return 'bradley_terry';
    case 'pricing-context':
      return 'openrouter_price_route';
    case 'multimodal':
      return 'benchlm_raw_composite,bradley_terry';
  }
}

function writeCsv(response: ServerResponse, key: LeaderboardKey, body: string, headOnly: boolean): void {
  const filename = `tokenbench-${key}-${SAMPLE_TIMESTAMP.slice(0, 10)}-${SAMPLE_REVISION_ID}.csv`;
  response.statusCode = 200;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.setHeader('Vary', 'Accept-Encoding');
  response.setHeader('X-TokenBench-Freshness', 'stale');
  response.setHeader('X-TokenBench-Methodology', methodologyHeader(key));
  response.setHeader('X-TokenBench-Preview-Data', 'local-sample');
  response.setHeader('X-TokenBench-Published-At', SAMPLE_TIMESTAMP);
  response.setHeader('X-TokenBench-Revision', SAMPLE_REVISION_ID);
  response.end(headOnly ? undefined : body);
}

function localPreviewMiddleware(request: IncomingMessage, response: ServerResponse, next: () => void): void {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  const isModelDocument = url.pathname === '/models' || url.pathname === '/models/' || /^\/models\/[^/]+\/?$/u.test(url.pathname);
  if (!isModelDocument && url.pathname !== '/api/benchmarks' && !url.pathname.startsWith('/api/benchmarks/')) {
    next();
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    writeJson(response, 405, { error: 'Method not allowed' }, false);
    return;
  }
  const headOnly = method === 'HEAD';
  if (isModelDocument && serveLocalModelDocument(url, response, headOnly)) return;
  const previewState = request.headers[LOCAL_PREVIEW_STATE_HEADER];
  if (previewState === '503') {
    writeJson(response, 503, { error: 'Local preview benchmark refresh unavailable.' }, headOnly);
    return;
  }
  if (previewState === 'corrupt-cache') {
    writeJson(response, 200, { revision: 'local-corrupt-cache-row', data: null }, headOnly);
    return;
  }
  if (url.pathname === '/api/benchmarks') {
    writeJson(response, 200, sampleSummaryResponse(), headOnly);
    return;
  }
  if (url.pathname === '/api/benchmarks/models') {
    const parsed = localModelDirectoryRequest(url);
    writeJson(
      response,
      parsed === null ? 400 : 200,
      parsed === null ? { error: 'Invalid sample model directory request' } : localModelDirectoryEnvelope(parsed.query, parsed.limit),
      headOnly,
    );
    return;
  }
  if (url.pathname === '/api/benchmarks/price-performance') {
    const keys = [...url.searchParams.keys()];
    const includeArchivedValues = url.searchParams.getAll('includeArchived');
    const valid = keys.every((key) => key === 'includeArchived')
      && includeArchivedValues.length <= 1
      && (includeArchivedValues.length === 0 || includeArchivedValues[0] === '1');
    writeJson(
      response,
      valid ? 200 : 400,
      valid ? samplePricePerformanceResponse(includeArchivedValues[0] === '1') : { error: 'Invalid sample price-performance request' },
      headOnly,
    );
    return;
  }
  const csvMatch = /^\/api\/benchmarks\/leaderboards\/([^/]+)\/csv$/u.exec(url.pathname);
  if (csvMatch && isLeaderboardKey(csvMatch[1]!)) {
    const body = sampleCsvResponse(csvMatch[1]!, url);
    if (body === null) writeJson(response, 400, { error: 'Invalid sample leaderboard request' }, headOnly);
    else writeCsv(response, csvMatch[1]!, body, headOnly);
    return;
  }
  const match = /^\/api\/benchmarks\/leaderboards\/([^/]+)$/u.exec(url.pathname);
  if (match && isLeaderboardKey(match[1]!)) {
    const body = sampleLeaderboardResponse(match[1]!, url);
    writeJson(response, body === null ? 400 : 200, body ?? { error: 'Invalid sample leaderboard request' }, headOnly);
    return;
  }
  writeJson(response, 404, { error: 'Benchmark API route not found' }, headOnly);
}

/**
 * Serves a structural local-only sample to Vite dev/preview. Cloudflare Pages
 * never loads Vite configuration, and `vite build` does not import this file.
 */
export function localPreviewBenchmarkApi(): Plugin {
  return {
    name: 'tokenbench-local-sample-benchmark-api',
    configureServer(server) {
      server.middlewares.use(localPreviewMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(localPreviewMiddleware);
    },
  };
}
