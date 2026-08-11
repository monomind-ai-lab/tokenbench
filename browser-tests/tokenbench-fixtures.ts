import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Frame, Page, Request, Route } from '@playwright/test';
import { readActiveBenchmarkSnapshot, type D1Database } from '../functions/_shared/benchmark-db';
import type {
  BenchmarkMetric,
  BenchmarkModel,
  BenchmarkPriceCheck,
} from '../src/benchmarks/contracts';
import { DECISION_PICK_CATEGORIES, type DecisionPickEntry } from '../src/benchmarks/decision-picks';
import type { BenchmarkApiEnvelope, BenchmarkSummaryData, LeaderboardPageResult } from '../src/frontend/use-benchmarks';
import { LEADERBOARD_ROUTES } from '../src/routing/routes';

export {
  LOCAL_MODEL_DIRECTORY_ENTRIES,
  LOCAL_MODEL_SLUG_ALIASES,
  localModelDirectoryEnvelope,
  localModelProfile,
} from './model-directory-fixtures';

export const HANDLER_COMPARISON_PATH = '/compare/alpha-vs-beta';
export const HANDLER_SPARSE_COMPARISON_PATH = '/compare/canvas-vs-alpha';

const REVISION = 'browser-benchmark-r1';
const CATALOG_REVISION = 'browser-catalog-r1';
const TIMESTAMP = '2099-01-01T00:00:00.000Z';

function sha256(character: string): string {
  return 'sha256:' + character.repeat(64);
}

const OPENROUTER_CONTENT_HASH = sha256('0');
const OPENROUTER_ARTIFACT_ID = 'catalog:' + CATALOG_REVISION;
const REVISION_CONTENT_HASH = 'sha256:' + createHash('sha256').update(JSON.stringify({
  catalogRevision: CATALOG_REVISION,
  openrouterContentHash: OPENROUTER_CONTENT_HASH,
  artifacts: [
    { sourceId: 'benchlm', artifactId: 'direct-pricing', contentHash: sha256('f') },
    { sourceId: 'benchlm', artifactId: 'models', contentHash: sha256('a') },
    { sourceId: 'lmarena', artifactId: 'text-to-image', contentHash: sha256('b') },
    { sourceId: 'openrouter', artifactId: OPENROUTER_ARTIFACT_ID, contentHash: OPENROUTER_CONTENT_HASH },
  ],
})).digest('hex');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function benchmarkModel(
  modelKey: string,
  slug: string,
  name: string,
  sourceId: BenchmarkModel['sourceId'],
  sourceArtifactId: string,
  creator: string,
): BenchmarkModel {
  return {
    modelKey,
    slug,
    name,
    creator,
    sourceType: 'Proprietary',
    reasoningType: null,
    releaseDate: null,
    contextWindowTokens: 128_000,
    evidenceStatus: sourceId === 'lmarena' ? 'source_only' : 'supported',
    rankingEligible: true,
    confidenceLower: null,
    confidenceUpper: null,
    benchmarkCount: 2,
    sourceId,
    sourceModelId: modelKey,
    sourceArtifactId,
  };
}

function benchlmMetric(modelKey: string, metricKey: string, category: string, value: number): BenchmarkMetric {
  return {
    modelKey,
    metricKey,
    category,
    value,
    rawValue: null,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score',
    sourceId: 'benchlm',
    sourceUpdatedAt: TIMESTAMP,
    sourceModelId: modelKey,
    sourceArtifactId: 'models',
    rankingEligible: true,
    methodology: 'benchlm_raw_composite',
    observationCount: null,
    sessionCount: null,
  };
}

function lmarenaMetric(modelKey: string, rank: number): BenchmarkMetric {
  return {
    modelKey,
    metricKey: 'lmarena:text_to_image:overall',
    category: 'text-to-image',
    value: 1_200 - rank,
    rawValue: null,
    rank,
    lower: null,
    upper: null,
    voteCount: 100,
    unit: 'arena_score',
    sourceId: 'lmarena',
    sourceUpdatedAt: TIMESTAMP,
    sourceModelId: modelKey,
    sourceArtifactId: 'text-to-image',
    rankingEligible: true,
    methodology: 'bradley_terry',
    observationCount: null,
    sessionCount: null,
  };
}

function lmarenaStyleMetric(modelKey: string, rank: number): BenchmarkMetric {
  return {
    ...lmarenaMetric(modelKey, rank),
    metricKey: 'lmarena:text_style_control:overall',
    category: 'text-style-control',
  };
}

function primaryPrice(modelKey: string, input: number, output: number): BenchmarkPriceCheck {
  return {
    modelKey,
    sourceId: 'openrouter',
    providerId: 'openrouter',
    inputUsdPerMillion: input,
    cachedInputUsdPerMillion: null,
    outputUsdPerMillion: output,
    contextWindowTokens: 128_000,
    verificationStatus: 'primary',
    routeId: 'openrouter:' + modelKey,
    sourceModelId: modelKey,
    canonicalSlug: null,
    maxInputTokens: 120_000,
    maxOutputTokens: 8_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['tools'],
    sourceArtifactId: OPENROUTER_ARTIFACT_ID,
  };
}

const alpha = benchmarkModel('provider:alpha', 'alpha', 'Alpha', 'benchlm', 'models', 'OpenAI');
const beta = benchmarkModel('provider:beta', 'beta', 'Beta', 'benchlm', 'models', 'Anthropic');
const gpt56Sol = benchmarkModel('openai:gpt-5-6-sol', 'gpt-5-6-sol', 'GPT-5.6 Sol', 'benchlm', 'public-leaderboard', 'OpenAI');
const canvas = benchmarkModel('lmarena:canvas', 'canvas', 'Canvas', 'lmarena', 'text-to-image', 'Canvas Labs');
const prism = benchmarkModel('lmarena:prism', 'prism', 'Prism', 'lmarena', 'text-to-image', 'Prism Labs');

const alphaCoding = benchlmMetric(alpha.modelKey, 'benchlm:category:coding', 'coding', 91);
const betaCoding = benchlmMetric(beta.modelKey, 'benchlm:category:coding', 'coding', 84);
const alphaOverall = benchlmMetric(alpha.modelKey, 'benchlm:overall:raw', 'overall', 90);
const betaOverall = benchlmMetric(beta.modelKey, 'benchlm:overall:raw', 'overall', 82);
const alphaAgentic = benchlmMetric(alpha.modelKey, 'benchlm:category:agentic', 'agentic', 87);
const betaAgentic = benchlmMetric(beta.modelKey, 'benchlm:category:agentic', 'agentic', 79);
const alphaReasoning = benchlmMetric(alpha.modelKey, 'benchlm:category:reasoning', 'reasoning', 88);
const betaReasoning = benchlmMetric(beta.modelKey, 'benchlm:category:reasoning', 'reasoning', 86);
// This shared Arena row must remain visible as published evidence without
// qualifying for the score-only BenchLM radar.
const alphaArena = lmarenaMetric(alpha.modelKey, 12);
const betaArena = lmarenaMetric(beta.modelKey, 14);
const alphaStyle = lmarenaStyleMetric(alpha.modelKey, 10);
const canvasImage = lmarenaMetric(canvas.modelKey, 1);
const canvasStyle = lmarenaStyleMetric(canvas.modelKey, 2);
const prismImage = lmarenaMetric(prism.modelKey, 2);
const alphaPrice = primaryPrice(alpha.modelKey, 2, 8);
const betaPrice = primaryPrice(beta.modelKey, 1, 4);
const alphaDirectPrice = {
  ...alphaPrice,
  sourceId: 'benchlm',
  providerId: 'alpha-direct',
  inputUsdPerMillion: 0.5,
  outputUsdPerMillion: null,
  contextWindowTokens: 64_000,
  routeId: 'direct:alpha',
  maxInputTokens: 60_000,
  sourceArtifactId: 'direct-pricing',
} satisfies BenchmarkPriceCheck;

const attribution = [
  { sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.example/data', updatedAt: TIMESTAMP },
  { sourceId: 'lmarena', label: 'Arena ratings from LMArena', url: 'https://lmarena.example/data', updatedAt: TIMESTAMP },
] as const;

export const CODING_LEADERBOARD_ENVELOPE = {
  revision: REVISION,
  publishedAt: TIMESTAMP,
  freshness: { status: 'fresh', checkedAt: TIMESTAMP },
  attribution: [attribution[0]],
  data: {
    key: 'llm-coding',
    profile: 'balanced',
    definition: {
      kind: 'benchlm',
      sourceId: 'benchlm',
      metricKeys: ['benchlm:category:coding'],
      defaultSort: 'score-desc',
    },
    entries: [
      {
        model: alpha,
        metric: alphaCoding,
        metrics: [alphaCoding],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        sourceRank: null,
        onValueFrontier: false,
      },
      {
        model: beta,
        metric: betaCoding,
        metrics: [betaCoding],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        sourceRank: null,
        onValueFrontier: false,
      },
    ],
    pagination: { limit: 50, total: 2, nextCursor: null },
    capabilities: {
      dataReady: true,
      defaultProfile: 'balanced',
      defaultSort: 'score-desc',
      supportsProfile: false,
      supportsEstimated: true,
      supportsLifecycle: false,
      priceMode: 'representative',
      supportsPrice: false,
      priceValues: [],
      metricKeys: ['benchlm:category:coding'],
      sorts: ['score-desc'],
      providers: ['Anthropic', 'OpenAI'],
      sourceTypes: ['Proprietary'],
      evidenceStatuses: ['supported'],
    },
  },
} satisfies BenchmarkApiEnvelope<LeaderboardPageResult>;

export const MEDIA_LEADERBOARD_ENVELOPE = {
  revision: REVISION,
  publishedAt: TIMESTAMP,
  freshness: { status: 'fresh', checkedAt: TIMESTAMP },
  attribution: [attribution[1]],
  data: {
    key: 'media-text-to-image',
    profile: 'balanced',
    definition: {
      kind: 'lmarena',
      sourceId: 'lmarena',
      metricKeys: ['lmarena:text_to_image:overall'],
      defaultSort: 'rank-asc',
    },
    entries: [
      {
        model: canvas,
        metric: canvasImage,
        metrics: [canvasImage],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        sourceRank: 1,
        onValueFrontier: false,
      },
      {
        model: prism,
        metric: prismImage,
        metrics: [prismImage],
        primaryPrice: null,
        blendedCostPerMillion: null,
        contextWindowTokens: null,
        sourceRank: 2,
        onValueFrontier: false,
      },
    ],
    pagination: { limit: 50, total: 2, nextCursor: null },
    capabilities: {
      dataReady: true,
      defaultProfile: 'balanced',
      defaultSort: 'rank-asc',
      supportsProfile: false,
      supportsEstimated: false,
      supportsLifecycle: false,
      priceMode: 'representative',
      supportsPrice: false,
      priceValues: [],
      metricKeys: ['lmarena:text_to_image:overall'],
      sorts: ['rank-asc'],
      providers: ['Canvas Labs', 'Prism Labs'],
      sourceTypes: ['Proprietary'],
      evidenceStatuses: ['source_only'],
    },
  },
} satisfies BenchmarkApiEnvelope<LeaderboardPageResult>;

export function comparisonDirectoryEnvelope(options: {
  readonly stale?: boolean;
  readonly empty?: boolean;
} = {}) {
  return {
    revision: REVISION,
    publishedAt: TIMESTAMP,
    freshness: options.stale
      ? { status: 'stale', checkedAt: TIMESTAMP, message: 'Published benchmark revision is stale.' }
      : { status: 'fresh', checkedAt: TIMESTAMP },
    data: {
      compareDirectory: {
        models: options.empty ? [] : [
          { slug: alpha.slug, name: alpha.name, creator: alpha.creator, sourceType: alpha.sourceType, evidenceStatus: alpha.evidenceStatus, utilitySelectable: true, metricCategories: ['agentic', 'coding', 'overall', 'reasoning'] },
          { slug: beta.slug, name: beta.name, creator: beta.creator, sourceType: beta.sourceType, evidenceStatus: beta.evidenceStatus, utilitySelectable: true, metricCategories: ['agentic', 'coding', 'overall', 'reasoning'] },
          { slug: canvas.slug, name: canvas.name, creator: canvas.creator, sourceType: canvas.sourceType, evidenceStatus: canvas.evidenceStatus, utilitySelectable: true, metricCategories: ['text-to-image'] },
        ],
        indexablePairs: options.empty ? [] : [
          { pairSlug: 'alpha-vs-beta', modelASlug: 'alpha', modelBSlug: 'beta', featuredRank: 1, sharedMetricCount: 4 },
        ],
      },
    },
  };
}

export function decisionSummaryEnvelope(): BenchmarkApiEnvelope<BenchmarkSummaryData> {
  const entry = (key: typeof DECISION_PICK_CATEGORIES[number]['key'], rank: number): DecisionPickEntry => ({
    rank,
    modelKey: `${key}-browser-model-${rank}`,
    slug: `${key}-browser-model-${rank}`,
    name: `Browser Model ${rank}`,
    provider: 'OpenAI',
    score: 92 - rank,
    unit: 'score',
    evidenceStatus: 'supported',
    updatedAt: TIMESTAMP,
    routePath: LEADERBOARD_ROUTES[key].pathname,
    representativePriceUsdPerMillion: 3,
    contextWindowTokens: 128_000,
  });
  const overallLeader: DecisionPickEntry = {
    ...entry('llm-overall', 1),
    modelKey: 'browser:alpha',
    slug: 'browser-alpha',
    name: 'Browser Alpha',
    provider: 'OpenAI',
    score: 91,
    representativePriceUsdPerMillion: 5,
  };
  const valueLeader: DecisionPickEntry = {
    ...entry('llm-value', 1),
    modelKey: 'browser:beta',
    slug: 'browser-beta',
    name: 'Browser Beta',
    provider: 'Anthropic',
    score: 86,
    representativePriceUsdPerMillion: 2.5,
  };

  return {
    revision: REVISION,
    publishedAt: TIMESTAMP,
    freshness: { status: 'fresh', checkedAt: TIMESTAMP },
    attribution: [
      {
        sourceId: 'benchlm',
        label: 'Data from BenchLM.ai',
        url: 'https://benchlm.ai/data',
        updatedAt: TIMESTAMP,
      },
      {
        sourceId: 'openrouter',
        label: 'Catalog and pricing data from OpenRouter',
        url: 'https://openrouter.ai/models',
        updatedAt: TIMESTAMP,
      },
    ],
    data: {
      representativeComparisons: [],
      decisionPicks: DECISION_PICK_CATEGORIES.map((category) => ({
        ...category,
        entries: [1, 2, 3].map((rank) => entry(category.key, rank)),
      })),
      homeDecisionSnapshot: {
        benchAlignLeader: { status: 'ready', value: overallLeader, updatedAt: TIMESTAMP },
        valueFrontierLeader: { status: 'ready', value: valueLeader, updatedAt: TIMESTAMP },
        lowestVerifiedRepresentativeRate: {
          status: 'ready',
          value: {
            modelKey: valueLeader.modelKey,
            slug: valueLeader.slug,
            name: valueLeader.name,
            provider: valueLeader.provider,
            evidenceStatus: 'supported',
            representativePriceUsdPerMillion: valueLeader.representativePriceUsdPerMillion ?? 2.5,
            contextWindowTokens: valueLeader.contextWindowTokens,
            routePath: LEADERBOARD_ROUTES['llm-pricing-context'].pathname,
          },
          updatedAt: TIMESTAMP,
        },
        pricePerformancePoints: [
          overallLeader,
          { ...valueLeader, routePath: LEADERBOARD_ROUTES['llm-overall'].pathname },
        ],
      },
    },
  };
}

const comparisonRevision = {
  revision: REVISION,
  generated_at: TIMESTAMP,
  published_at: TIMESTAMP,
  checked_at: TIMESTAMP,
  publication_state: 'published',
  content_hash: REVISION_CONTENT_HASH,
  catalog_revision: CATALOG_REVISION,
  openrouter_content_hash: OPENROUTER_CONTENT_HASH,
};

const comparisonSources = [
  {
    revision: REVISION,
    source_id: 'benchlm',
    artifact_id: 'models',
    source_url: 'https://benchlm.example/data/models.json',
    observed_at: TIMESTAMP,
    etag: null,
    last_modified: null,
    upstream_revision: 'browser-benchlm-r1',
    schema_version: '1.0',
    snapshot_key: 'benchmarks/benchlm/models.json',
    content_hash: sha256('a'),
    original_content_hash: sha256('c'),
    license_id: 'MIT',
    attribution_text: 'Data from BenchLM.ai',
  },
  {
    revision: REVISION,
    source_id: 'lmarena',
    artifact_id: 'text-to-image',
    source_url: 'https://lmarena.example/data/text-to-image',
    observed_at: TIMESTAMP,
    etag: null,
    last_modified: null,
    upstream_revision: 'browser-lmarena-r1',
    schema_version: null,
    snapshot_key: 'benchmarks/lmarena/text-to-image.json',
    content_hash: sha256('b'),
    original_content_hash: sha256('d'),
    license_id: 'CC-BY-4.0',
    attribution_text: 'Arena ratings from LMArena',
  },
  {
    revision: REVISION,
    source_id: 'benchlm',
    artifact_id: 'direct-pricing',
    source_url: 'https://benchlm.example/data/direct-pricing.json',
    observed_at: TIMESTAMP,
    etag: null,
    last_modified: null,
    upstream_revision: 'browser-direct-pricing-r1',
    schema_version: '1.0',
    snapshot_key: 'benchmarks/benchlm/direct-pricing.json',
    content_hash: sha256('f'),
    original_content_hash: sha256('6'),
    license_id: 'MIT',
    attribution_text: 'Direct pricing data from BenchLM.ai',
  },
  {
    revision: REVISION,
    source_id: 'openrouter',
    artifact_id: OPENROUTER_ARTIFACT_ID,
    source_url: 'https://openrouter.example/api/v1/models',
    observed_at: TIMESTAMP,
    etag: null,
    last_modified: null,
    upstream_revision: CATALOG_REVISION,
    schema_version: null,
    snapshot_key: 'catalog/openrouter/models.json',
    content_hash: OPENROUTER_CONTENT_HASH,
    original_content_hash: sha256('e'),
    license_id: 'OpenRouter-ToS',
    attribution_text: 'Catalog and pricing data from OpenRouter',
  },
];

function rawModel(model: BenchmarkModel) {
  return {
    revision: REVISION,
    model_key: model.modelKey,
    slug: model.slug,
    name: model.name,
    creator: model.creator,
    source_type: model.sourceType,
    reasoning_type: model.reasoningType,
    release_date: model.releaseDate,
    context_window_tokens: model.contextWindowTokens,
    evidence_status: model.evidenceStatus,
    ranking_eligible: model.rankingEligible ? 1 : 0,
    confidence_lower: model.confidenceLower,
    confidence_upper: model.confidenceUpper,
    benchmark_count: model.benchmarkCount,
    source_id: model.sourceId,
    source_model_id: model.sourceModelId,
    source_artifact_id: model.sourceArtifactId,
  };
}

function rawMetric(metric: BenchmarkMetric) {
  return {
    revision: REVISION,
    model_key: metric.modelKey,
    metric_key: metric.metricKey,
    category: metric.category,
    value: metric.value,
    rank: metric.rank,
    lower_bound: metric.lower,
    upper_bound: metric.upper,
    vote_count: metric.voteCount,
    unit: metric.unit,
    source_id: metric.sourceId,
    source_updated_at: metric.sourceUpdatedAt,
    source_model_id: metric.sourceModelId,
    source_artifact_id: metric.sourceArtifactId,
    ranking_eligible: metric.rankingEligible ? 1 : 0,
    methodology: metric.methodology,
    observation_count: metric.observationCount,
    session_count: metric.sessionCount,
  };
}

function rawPrice(price: BenchmarkPriceCheck) {
  return {
    revision: REVISION,
    model_key: price.modelKey,
    source_id: price.sourceId,
    provider_id: price.providerId,
    route_id: price.routeId,
    source_model_id: price.sourceModelId,
    canonical_slug: price.canonicalSlug,
    input_usd_per_million: price.inputUsdPerMillion,
    cached_input_usd_per_million: price.cachedInputUsdPerMillion,
    output_usd_per_million: price.outputUsdPerMillion,
    context_window_tokens: price.contextWindowTokens,
    max_input_tokens: price.maxInputTokens,
    max_output_tokens: price.maxOutputTokens,
    input_modalities_json: JSON.stringify(price.inputModalities),
    output_modalities_json: JSON.stringify(price.outputModalities),
    supported_parameters_json: JSON.stringify(price.supportedParameters),
    source_artifact_id: price.sourceArtifactId,
    verification_status: price.verificationStatus,
  };
}

export function handlerBackedComparisonDatabase(): D1Database {
  const rows = {
    revision: comparisonRevision,
    sources: comparisonSources,
    models: [rawModel(alpha), rawModel(beta), rawModel(canvas), rawModel(prism)],
    metrics: [
      rawMetric(alphaCoding),
      rawMetric(betaCoding),
      rawMetric(alphaOverall),
      rawMetric(betaOverall),
      rawMetric(alphaAgentic),
      rawMetric(betaAgentic),
      rawMetric(alphaReasoning),
      rawMetric(betaReasoning),
      rawMetric(alphaArena),
      rawMetric(betaArena),
      rawMetric(alphaStyle),
      rawMetric(canvasImage),
      rawMetric(canvasStyle),
      rawMetric(prismImage),
    ],
    prices: [rawPrice(alphaDirectPrice), rawPrice(alphaPrice), rawPrice(betaPrice)],
    pairs: [
      {
        revision: REVISION,
        pair_slug: 'alpha-vs-beta',
        model_a_key: alpha.modelKey,
        model_b_key: beta.modelKey,
        indexable: 1,
        eligibility_reason: 'Reviewed browser comparison pair with four compatible score lenses',
        featured_rank: 1,
        shared_metric_count: 4,
      },
      {
        revision: REVISION,
        pair_slug: 'canvas-vs-alpha',
        model_a_key: canvas.modelKey,
        model_b_key: alpha.modelKey,
        indexable: 1,
        eligibility_reason: 'Reviewed browser comparison pair with only non-BenchLM shared metrics',
        featured_rank: 2,
        shared_metric_count: 2,
      },
    ],
  };

  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            all: async () => {
              if (query.includes('benchmark_publication_state')) return { results: [rows.revision] };
              const revision = values[0];
              const table = query.includes('benchmark_source_records') ? rows.sources
                : query.includes('benchmark_models') ? rows.models
                  : query.includes('benchmark_metrics') ? rows.metrics
                    : query.includes('benchmark_price_checks') ? rows.prices
                      : rows.pairs;
              return { results: table.filter((row) => row.revision === revision) };
            },
          };
        },
      };
    },
  };
}

export async function fulfillJson(route: Route, value: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(value),
  });
}

export interface NewsletterSignupFixtureResponse {
  readonly status: number;
  readonly body: unknown;
  readonly delayMs?: number;
}

/**
 * Browser tests must never exercise a deployed email endpoint. This local
 * sequence fixture mimics only the public response contract while preserving
 * the component's real keyboard and form behavior.
 */
export async function stubNewsletterSignup(
  page: Page,
  origin: string,
  responses: readonly NewsletterSignupFixtureResponse[],
): Promise<void> {
  if (responses.length === 0) throw new Error('Newsletter signup fixture requires at least one response.');
  let requestIndex = 0;
  await page.route(origin + '/api/newsletter/subscribe', async (route) => {
    const response = responses[Math.min(requestIndex, responses.length - 1)]!;
    requestIndex += 1;
    if (response.delayMs !== undefined && response.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, response.delayMs));
    }
    await fulfillJson(route, response.body, response.status);
  });
}

export async function stubBenchmarkDirectory(page: Page, origin: string, value: unknown = comparisonDirectoryEnvelope(), status = 200): Promise<void> {
  await page.route(origin + '/api/benchmarks', (route) => fulfillJson(route, value, status));
}

export async function stubLeaderboard(page: Page, origin: string, key: 'llm-coding' | 'llm-overall' | 'media-text-to-image', value: unknown, status = 200): Promise<void> {
  const endpoint = origin + '/api/benchmarks/leaderboards/' + key;
  await page.route((url) => url.origin === origin && url.pathname === new URL(endpoint).pathname, (route) => fulfillJson(route, value, status));
}

interface HandlerDocument {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

type HandlerComparisonDocumentPath = typeof HANDLER_COMPARISON_PATH | typeof HANDLER_SPARSE_COMPARISON_PATH;

const HANDLER_COMPARISON_DOCUMENT_PATHS = new Set<HandlerComparisonDocumentPath>([
  HANDLER_COMPARISON_PATH,
  HANDLER_SPARSE_COMPARISON_PATH,
]);

function handlerComparisonDocumentPath(request: Request): HandlerComparisonDocumentPath | null {
  if (!request.isNavigationRequest()) return null;
  try {
    const pathname = new URL(request.url()).pathname;
    return HANDLER_COMPARISON_DOCUMENT_PATHS.has(pathname as HandlerComparisonDocumentPath)
      ? pathname as HandlerComparisonDocumentPath
      : null;
  } catch {
    return null;
  }
}

function activeHandlerComparisonDocumentPath(
  route: Route,
  page: Page,
  activeHandlerDocumentByFrame: WeakMap<Frame, HandlerComparisonDocumentPath>,
): HandlerComparisonDocumentPath | null {
  const frame = route.request().frame();
  return frame === page.mainFrame() ? activeHandlerDocumentByFrame.get(frame) ?? null : null;
}

// The browser server runs with HMR disabled (see playwright.config.ts), so the
// real source entry does not need React Refresh bootstrapping. Importing
// /@react-refresh would itself load Vite's websocket client and create
// harness-only console errors under Chromium's localhost isolation.
// Keep the source entry in the module graph so the handler document's
// DOMContentLoaded lifecycle cannot finish before React has loaded the code
// that hydrates its server-rendered comparison content.
const VITE_HANDLER_HYDRATION_ENTRY = 'import "/src/main.tsx";';

const execFile = promisify(execFileCallback);

/**
 * Playwright compiles imported TSX through its JSX inspection runtime, whose
 * element records cannot be passed to React DOM's server renderer. Render the
 * actual Pages Function in a small `tsx` child process instead, then fulfill
 * the browser request with that real handler response.
 */
async function renderHandlerBackedComparisonDocument(
  origin: string,
  path: string,
  pair: string,
): Promise<HandlerDocument> {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const fixtureModule = import.meta.url;
  const handlerModule = new URL('../functions/compare/[pair].ts', import.meta.url).href;
  const program = [
    `const fixture = await import(${JSON.stringify(fixtureModule)});`,
    `const handler = await import(${JSON.stringify(handlerModule)});`,
    `const response = await handler.onRequestGet({ request: new Request(${JSON.stringify(origin + path)}), env: { CATALOG_DB: fixture.handlerBackedComparisonDatabase() }, params: { pair: ${JSON.stringify(pair)} } });`,
    'process.stdout.write(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() }));',
  ].join('\n');
  const { stdout, stderr } = await execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', program], {
    cwd: projectRoot,
    maxBuffer: 2_000_000,
    timeout: 15_000,
  });
  if (stderr.trim()) throw new Error(`Handler-backed comparison renderer wrote to stderr: ${stderr.trim()}`);
  let document: HandlerDocument;
  try {
    document = JSON.parse(stdout) as HandlerDocument;
  } catch {
    throw new Error(`Handler-backed comparison renderer returned invalid JSON: ${stdout}`);
  }
  if (typeof document.status !== 'number' || typeof document.body !== 'string' || typeof document.headers !== 'object' || document.headers === null) {
    throw new Error('Handler-backed comparison renderer returned an invalid response shape.');
  }
  return document;
}

/**
 * The document itself is rendered by the real Pages Function against a fake
 * D1 reader. Vite source remapping remains the development default; production
 * previews can serve their generated /assets files by selecting `as-served`.
 */
export async function stubHandlerBackedComparison(
  page: Page,
  origin: string,
  options: { readonly assetMode?: 'vite-source' | 'as-served' } = {},
): Promise<void> {
  const activeHandlerDocumentByFrame = new WeakMap<Frame, HandlerComparisonDocumentPath>();
  page.on('request', (request) => {
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
    const path = handlerComparisonDocumentPath(request);
    if (path === null) activeHandlerDocumentByFrame.delete(request.frame());
    else activeHandlerDocumentByFrame.set(request.frame(), path);
  });
  const preflight = await readActiveBenchmarkSnapshot(handlerBackedComparisonDatabase());
  if (!preflight) throw new Error('Handler-backed comparison fixture has no active benchmark revision.');
  const responses = await Promise.all([
    [HANDLER_COMPARISON_PATH, 'alpha-vs-beta'] as const,
    [HANDLER_SPARSE_COMPARISON_PATH, 'canvas-vs-alpha'] as const,
  ].map(async ([path, pair]) => ({ path, response: await renderHandlerBackedComparisonDocument(origin, path, pair) })));
  for (const { path, response } of responses) {
    if (response.status !== 200) {
      throw new Error(`Handler-backed comparison fixture for ${path} returned ${response.status} after a valid D1 preflight: ${response.body}`);
    }
    await page.route(origin + path, async (route) => {
      if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) {
        activeHandlerDocumentByFrame.set(route.request().frame(), path);
      }
      await route.fulfill({
        status: response.status,
        headers: response.headers,
        body: response.body,
      });
    });
  }
  if (options.assetMode === 'as-served') return;
  // The real handler document already supplies /assets/tokenbench.css. Vite's
  // source remap imports the same stylesheet again as a JavaScript module from
  // src/main.tsx, which adds a duplicate 94KB style injection and HMR client.
  // Preserve the real stylesheet request and bypass only that duplicate module
  // request so hydration timing reflects the app rather than dev-server setup.
  await page.route(origin + '/src/index.css', async (route) => {
    const activeDocumentPath = activeHandlerComparisonDocumentPath(route, page, activeHandlerDocumentByFrame);
    if (activeDocumentPath !== null && route.request().resourceType() === 'script') {
      await route.fulfill({ contentType: 'application/javascript', body: 'export {};' });
      return;
    }
    if (activeDocumentPath !== null) {
      await route.continue();
      return;
    }
    await route.fallback();
  });
  await page.route(origin + '/assets/main.js*', async (route) => {
    if (activeHandlerComparisonDocumentPath(route, page, activeHandlerDocumentByFrame) === null) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: 'application/javascript',
      body: VITE_HANDLER_HYDRATION_ENTRY,
    });
  });
  await page.route(origin + '/assets/tokenbench.css*', async (route) => {
    if (activeHandlerComparisonDocumentPath(route, page, activeHandlerDocumentByFrame) === null) {
      await route.fallback();
      return;
    }
    await route.fulfill({ contentType: 'text/css', body: '@import url("/src/index.css");' });
  });
}

export function readyCodingLeaderboard(): BenchmarkApiEnvelope<LeaderboardPageResult> {
  return clone(CODING_LEADERBOARD_ENVELOPE) as BenchmarkApiEnvelope<LeaderboardPageResult>;
}

export function correctedPublicScoreLeaderboard(
  key: 'llm-coding' | 'llm-overall',
): BenchmarkApiEnvelope<LeaderboardPageResult> {
  const coding = key === 'llm-coding';
  const metricKey = coding ? 'benchlm:category:coding' : 'benchlm:overall:raw';
  const category = coding ? 'coding' : 'overall';
  const values = coding ? [91, 84, 77.95] : [90, 82, 81.48];
  const models = [alpha, beta, gpt56Sol] as const;
  const entries = models.map((model, index) => {
    const rank = index + 1;
    const metric = {
      ...benchlmMetric(model.modelKey, metricKey, category, values[index]!),
      rank,
      sourceArtifactId: model === gpt56Sol ? 'public-leaderboard' : 'models',
    };
    return {
      model,
      metric,
      metrics: [metric],
      primaryPrice: null,
      blendedCostPerMillion: null,
      contextWindowTokens: null,
      sourceRank: rank,
      onValueFrontier: false,
    };
  });

  return {
    revision: REVISION,
    publishedAt: TIMESTAMP,
    freshness: { status: 'fresh', checkedAt: TIMESTAMP },
    attribution: [attribution[0]],
    data: {
      key,
      profile: 'balanced',
      definition: {
        kind: 'benchlm',
        sourceId: 'benchlm',
        metricKeys: [metricKey],
        defaultSort: 'score-desc',
      },
      entries,
      pagination: { limit: 50, total: entries.length, nextCursor: null },
      capabilities: {
        dataReady: true,
        defaultProfile: 'balanced',
        defaultSort: 'score-desc',
        supportsProfile: false,
        supportsEstimated: true,
        supportsLifecycle: false,
        priceMode: 'representative',
        supportsPrice: false,
        priceValues: [],
        metricKeys: [metricKey],
        sorts: ['score-desc'],
        providers: ['Anthropic', 'OpenAI'],
        sourceTypes: ['Proprietary'],
        evidenceStatuses: ['supported'],
      },
    },
  };
}

export function readyMediaLeaderboard(): BenchmarkApiEnvelope<LeaderboardPageResult> {
  return clone(MEDIA_LEADERBOARD_ENVELOPE) as BenchmarkApiEnvelope<LeaderboardPageResult>;
}

export function readyFilterControlsLeaderboard(): BenchmarkApiEnvelope<LeaderboardPageResult> {
  const publishedRows = [
    { modelKey: 'provider:anthropic-filter', slug: 'anthropic-filter', name: 'Anthropic Filter', provider: 'Anthropic', price: 0.125 },
    { modelKey: 'provider:google-filter', slug: 'google-filter', name: 'Google Filter', provider: 'Google', price: 0.5 },
    { modelKey: 'provider:meta-filter', slug: 'meta-filter', name: 'Meta Filter', provider: 'Meta', price: 2 },
    { modelKey: 'provider:mistral-filter', slug: 'mistral-filter', name: 'Mistral Filter', provider: 'Mistral AI', price: 5 },
    { modelKey: 'provider:openai-filter', slug: 'openai-filter', name: 'OpenAI Filter', provider: 'OpenAI', price: 25 },
    { modelKey: 'provider:xai-filter', slug: 'xai-filter', name: 'xAI Filter', provider: 'xAI', price: 1000 },
  ] as const;
  const entries = publishedRows.map((row, index) => {
    const model = benchmarkModel(row.modelKey, row.slug, row.name, 'benchlm', 'models', row.provider);
    const metric = benchlmMetric(model.modelKey, 'benchlm:category:coding', 'coding', 96 - index);
    const price = primaryPrice(model.modelKey, row.price, row.price);
    return {
      model,
      metric,
      metrics: [metric],
      primaryPrice: price,
      blendedCostPerMillion: row.price,
      contextWindowTokens: price.contextWindowTokens,
      sourceRank: null,
      onValueFrontier: false,
    };
  });

  return {
    revision: REVISION,
    publishedAt: TIMESTAMP,
    freshness: { status: 'fresh', checkedAt: TIMESTAMP },
    attribution: [
      attribution[0],
      {
        sourceId: 'openrouter',
        label: 'Catalog and pricing data from OpenRouter',
        url: 'https://openrouter.example/models',
        updatedAt: TIMESTAMP,
      },
    ],
    data: {
      key: 'llm-coding',
      profile: 'balanced',
      definition: {
        kind: 'benchlm',
        sourceId: 'benchlm',
        metricKeys: ['benchlm:category:coding'],
        defaultSort: 'score-desc',
      },
      entries,
      pagination: { limit: 50, total: entries.length, nextCursor: null },
      capabilities: {
        dataReady: true,
        defaultProfile: 'balanced',
        defaultSort: 'score-desc',
        supportsProfile: false,
        supportsEstimated: true,
        supportsLifecycle: false,
        priceMode: 'representative',
        supportsPrice: true,
        priceValues: [0.125, 0.5, 2, 5, 25, 1000],
        metricKeys: ['benchlm:category:coding'],
        sorts: ['score-desc', 'price-asc'],
        providers: ['Anthropic', 'Google', 'Meta', 'Mistral AI', 'OpenAI', 'xAI'],
        sourceTypes: ['Proprietary'],
        evidenceStatuses: ['supported'],
      },
    },
  };
}

export function staleCodingLeaderboard(): BenchmarkApiEnvelope<LeaderboardPageResult> {
  const value = readyCodingLeaderboard();
  return {
    ...value,
    freshness: {
      status: 'stale',
      checkedAt: '2000-01-01T00:00:00.000Z',
      message: 'Published benchmark revision has not refreshed within 36 hours.',
    },
  };
}

export function emptyCodingLeaderboard(): BenchmarkApiEnvelope<LeaderboardPageResult> {
  const value = readyCodingLeaderboard();
  return {
    ...value,
    data: {
      ...value.data,
      entries: [],
      pagination: { limit: value.data.pagination?.limit ?? 50, total: 0, nextCursor: null },
    },
  };
}
