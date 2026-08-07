import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  attributionForAllSources,
  benchmarkEnvelope,
  type ActiveBenchmarkSnapshot,
} from '../functions/_shared/benchmark-db';
import {
  buildBenchmarkSummaryData,
  type BenchmarkProjectionSnapshot,
} from '../src/benchmarks/api-projections';
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
  parseLeaderboardQuery,
} from '../src/benchmarks/leaderboard-query';
import { buildLeaderboard, LEADERBOARD_DEFINITIONS } from '../src/benchmarks/leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../src/routing/routes';

const SAMPLE_TIMESTAMP = '2000-01-01T00:00:00.000Z';
const SAMPLE_REVISION_ID = 'local-sample-preview-r1';

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

function benchLmModel(modelKey: string, slug: string, name: string, scoreCount: number): BenchmarkModel {
  return {
    modelKey,
    slug,
    name,
    creator: 'Sample Labs',
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
const SAMPLE_CANVAS: BenchmarkModel = {
  modelKey: 'local-sample:canvas',
  slug: 'sample-canvas',
  name: 'Sample Canvas',
  creator: 'Sample Media Lab',
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

function benchLmMetric(model: BenchmarkModel, metricKey: string, category: string, value: number): BenchmarkMetric {
  return {
    modelKey: model.modelKey,
    metricKey,
    category,
    value,
    rank: null,
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
    rank: 1,
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
  models: [SAMPLE_ATLAS, SAMPLE_ORBIT, SAMPLE_CANVAS],
  metrics: [
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:overall:raw', 'overall', 94),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:coding', 'coding', 97),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:agentic', 'agentic', 95),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:reasoning', 'reasoning', 93),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:knowledge', 'knowledge', 92),
    benchLmMetric(SAMPLE_ATLAS, 'benchlm:category:multimodal', 'multimodal', 90),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:overall:raw', 'overall', 91),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:coding', 'coding', 89),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:agentic', 'agentic', 90),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:reasoning', 'reasoning', 88),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:knowledge', 'knowledge', 87),
    benchLmMetric(SAMPLE_ORBIT, 'benchlm:category:multimodal', 'multimodal', 86),
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
  status: 'stale' as const,
  checkedAt: SAMPLE_TIMESTAMP,
  message: LOCAL_SAMPLE_NOTICE,
};

function isLeaderboardKey(value: string): value is LeaderboardKey {
  return Object.prototype.hasOwnProperty.call(LEADERBOARD_ROUTES, value);
}

function parsedLimit(parameters: URLSearchParams): number | null {
  const values = parameters.getAll('limit');
  if (values.length > 1) return null;
  const value = values[0] ?? '50';
  if (!/^[1-9]\d*$/u.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit <= 200 ? limit : null;
}

function sampleLeaderboardResponse(key: LeaderboardKey, url: URL): unknown | null {
  if (!hasValidLeaderboardQueryEncoding(url.search)) return null;
  const limit = parsedLimit(url.searchParams);
  if (limit === null) return null;
  const cursors = url.searchParams.getAll('cursor');
  if (cursors.length > 1 || (cursors[0] !== undefined && cursors[0] !== '')) return null;
  const includeEstimated = url.searchParams.getAll('includeEstimated');
  if (includeEstimated.length > 1 || (includeEstimated[0] !== undefined && includeEstimated[0] !== '1')) return null;

  const definition = LEADERBOARD_DEFINITIONS[key];
  const preliminary = buildLeaderboard(key, SAMPLE_SNAPSHOT.models, SAMPLE_SNAPSHOT.metrics, SAMPLE_SNAPSHOT.priceChecks);
  const capabilities = createLeaderboardQueryCapabilities(definition, preliminary.entries);
  const filters = new URLSearchParams(url.searchParams);
  filters.delete('limit');
  filters.delete('cursor');
  filters.delete('includeEstimated');
  if (includeEstimated[0] === '1') filters.set('estimated', '1');
  const parsed = parseLeaderboardQuery(filters, definition, capabilities, 'api');
  if (!parsed.ok) return null;

  const leaderboard = buildLeaderboard(
    key,
    SAMPLE_SNAPSHOT.models,
    SAMPLE_SNAPSHOT.metrics,
    SAMPLE_SNAPSHOT.priceChecks,
    parsed.state.profile,
  );
  const entries = filterLeaderboardEntries(leaderboard.entries, parsed.state);
  return benchmarkEnvelope(SAMPLE_SNAPSHOT, SAMPLE_FRESHNESS, attributionForAllSources(SAMPLE_SNAPSHOT), {
    ...leaderboard,
    entries: entries.slice(0, limit),
    capabilities,
    pagination: {
      limit,
      total: entries.length,
      nextCursor: null,
    },
  });
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

function writeJson(response: ServerResponse, status: number, body: unknown, headOnly: boolean): void {
  const payload = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-TokenBench-Preview-Data', 'local-sample');
  response.end(headOnly ? undefined : payload);
}

function localPreviewMiddleware(request: IncomingMessage, response: ServerResponse, next: () => void): void {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  if (url.pathname !== '/api/benchmarks' && !url.pathname.startsWith('/api/benchmarks/leaderboards/')) {
    next();
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    writeJson(response, 405, { error: 'Method not allowed' }, false);
    return;
  }
  const headOnly = method === 'HEAD';
  if (url.pathname === '/api/benchmarks') {
    writeJson(response, 200, sampleSummaryResponse(), headOnly);
    return;
  }
  const match = /^\/api\/benchmarks\/leaderboards\/([^/]+)$/u.exec(url.pathname);
  if (!match || !isLeaderboardKey(match[1]!)) {
    writeJson(response, 404, { error: 'Benchmark leaderboard not found' }, headOnly);
    return;
  }
  const body = sampleLeaderboardResponse(match[1]!, url);
  writeJson(response, body === null ? 400 : 200, body ?? { error: 'Invalid sample leaderboard request' }, headOnly);
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
