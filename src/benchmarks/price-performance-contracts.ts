import {
  isCanonicalIsoTimestamp,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceId,
  type EvidenceStatus,
} from './contracts';
import { isModelSlugRouteSafe } from './model-directory';

export const PRICE_PERFORMANCE_SCORE_LANES = [
  'overall',
  'agentic',
  'coding',
  'reasoning',
  'knowledge',
  'multimodal',
  'mathematics',
  'multilingual',
  'instruction-following',
] as const;

export type PricePerformanceScoreLane = typeof PRICE_PERFORMANCE_SCORE_LANES[number];

export const PRICE_PERFORMANCE_COST_BASES = ['output', 'blended-3-1'] as const;
export type PricePerformanceCostBasis = typeof PRICE_PERFORMANCE_COST_BASES[number];

/** Short aliases used by projection callers that do not need the feature prefix. */
export type CostBasis = PricePerformanceCostBasis;
export type ScoreLane = PricePerformanceScoreLane;

export const PRICE_PERFORMANCE_VARIANT_MODES = ['one-per-family', 'all-variants'] as const;
export type PricePerformanceVariantMode = typeof PRICE_PERFORMANCE_VARIANT_MODES[number];

export const PRICE_PERFORMANCE_STATUSES = ['current', 'archived'] as const;
export type PricePerformanceStatus = typeof PRICE_PERFORMANCE_STATUSES[number];

export interface PricePerformanceRoute {
  readonly sourceId: BenchmarkPriceCheck['sourceId'];
  readonly providerId: string;
  readonly routeId: string;
  readonly sourceModelId: string;
  readonly canonicalSlug: string | null;
  readonly sourceArtifactId: string;
  readonly inputUsdPerMillion: number | null;
  readonly cachedInputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  readonly contextWindowTokens: number | null;
  readonly verificationStatus: BenchmarkPriceCheck['verificationStatus'];
  readonly maxInputTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly inputModalities: readonly string[] | null;
  readonly outputModalities: readonly string[] | null;
  readonly supportedParameters: readonly string[] | null;
}

export interface PricePerformancePoint {
  readonly modelKey: string;
  readonly slug: string;
  readonly displayName: string;
  readonly creator: string;
  readonly familyId: string | null;
  readonly status: PricePerformanceStatus;
  readonly sourceType: BenchmarkModel['sourceType'];
  readonly evidenceStatus: EvidenceStatus;
  readonly scores: Readonly<Record<PricePerformanceScoreLane, number | null>>;
  readonly route: PricePerformanceRoute;
}

export interface PricePerformancePointView extends PricePerformancePoint {
  readonly scoreLane: PricePerformanceScoreLane;
  readonly costBasis: PricePerformanceCostBasis;
  readonly score: number;
  readonly selectedCost: number;
  readonly scorePerDollar: number | null;
  readonly frontier: boolean;
}

export interface PricePerformanceProjection {
  readonly points: readonly PricePerformancePoint[];
}

export interface PricePerformanceStatusRecord {
  readonly modelKey: string;
  readonly status: PricePerformanceStatus;
}

export interface PricePerformanceProjectionInput {
  readonly models: readonly BenchmarkModel[];
  readonly metrics: readonly BenchmarkMetric[];
  readonly priceChecks: readonly BenchmarkPriceCheck[];
  readonly statusByModelKey?: ReadonlyMap<string, PricePerformanceStatus>
    | Readonly<Record<string, PricePerformanceStatus>>;
  readonly directoryRecords?: readonly PricePerformanceStatusRecord[];
}

export type PricePerformanceInput = PricePerformanceProjectionInput;

export interface PricePerformanceSelectionOptions {
  readonly lane?: PricePerformanceScoreLane;
  readonly costBasis?: PricePerformanceCostBasis;
}

export interface PricePerformanceFilters extends PricePerformanceSelectionOptions {
  readonly creator?: string | readonly string[] | null;
  readonly sourceType?: BenchmarkModel['sourceType'] | readonly BenchmarkModel['sourceType'][] | null;
  readonly evidenceStatus?: EvidenceStatus | readonly EvidenceStatus[] | null;
  readonly status?: PricePerformanceStatus | readonly PricePerformanceStatus[] | null;
  readonly priceBand?:
    | readonly [number | null | undefined, number | null | undefined]
    | { readonly min?: number | null; readonly max?: number | null }
    | null;
  readonly variants?: PricePerformanceVariantMode;
}

export interface PricePerformanceCapabilities {
  readonly scoreLanes: readonly PricePerformanceScoreLane[];
  readonly costBases: readonly PricePerformanceCostBasis[];
  readonly creators: readonly string[];
  readonly sourceTypes: readonly BenchmarkModel['sourceType'][];
  readonly evidenceStatuses: readonly EvidenceStatus[];
  readonly statuses: readonly PricePerformanceStatus[];
}

export interface PricePerformanceAttribution {
  readonly sourceId: BenchmarkSourceId;
  readonly label: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface PricePerformanceEnvelopeData {
  readonly scoreMethodology: Readonly<Record<PricePerformanceScoreLane, string>>;
  readonly costDefinitions: {
    readonly output: 'Published output USD per one million tokens' | string;
    readonly blended3To1: '(3 × input USD/M + output USD/M) / 4' | string;
  };
  readonly capabilities: PricePerformanceCapabilities;
  readonly points: readonly PricePerformancePoint[];
}

export interface PricePerformanceEnvelope {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly attribution: readonly PricePerformanceAttribution[];
  readonly data: PricePerformanceEnvelopeData;
}

const SOURCE_IDS = new Set<BenchmarkSourceId>(['benchlm', 'lmarena', 'litellm', 'openrouter']);
const EVIDENCE_STATUSES = new Set<EvidenceStatus>(['supported', 'estimated', 'source_only']);
const SOURCE_TYPES = new Set<BenchmarkModel['sourceType']>(['Proprietary', 'Open Weight', 'Unknown']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && isCanonicalIsoTimestamp(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (!isText(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isNullableText(value: unknown): value is string | null {
  return value === null || isText(value);
}

function isNullableFiniteNonNegative(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) > 0);
}

function isUniqueKnownValues<T extends string>(value: unknown, allowed: ReadonlySet<T>): value is readonly T[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<T>();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item as T) || seen.has(item as T)) return false;
    seen.add(item as T);
  }
  return true;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function parseRoute(value: unknown): PricePerformanceRoute | null {
  if (!isRecord(value)
    || !SOURCE_IDS.has(value.sourceId as BenchmarkSourceId)
    || !isText(value.providerId)
    || !isText(value.routeId)
    || !isText(value.sourceModelId)
    || !isNullableText(value.canonicalSlug)
    || (value.canonicalSlug !== null && !isModelSlugRouteSafe(value.canonicalSlug))
    || !isText(value.sourceArtifactId)
    || !isNullableFiniteNonNegative(value.inputUsdPerMillion)
    || !isNullableFiniteNonNegative(value.cachedInputUsdPerMillion)
    || !isNullableFiniteNonNegative(value.outputUsdPerMillion)
    || value.inputUsdPerMillion === null
    || value.outputUsdPerMillion === null
    || !isNullablePositiveInteger(value.contextWindowTokens)
    || value.verificationStatus !== 'primary'
    || !isNullablePositiveInteger(value.maxInputTokens)
    || !isNullablePositiveInteger(value.maxOutputTokens)
    || !(value.inputModalities === null || (Array.isArray(value.inputModalities) && value.inputModalities.every(isText)))
    || !(value.outputModalities === null || (Array.isArray(value.outputModalities) && value.outputModalities.every(isText)))
    || !(value.supportedParameters === null || (Array.isArray(value.supportedParameters) && value.supportedParameters.every(isText)))) {
    return null;
  }
  return {
    sourceId: value.sourceId as BenchmarkPriceCheck['sourceId'],
    providerId: value.providerId,
    routeId: value.routeId,
    sourceModelId: value.sourceModelId,
    canonicalSlug: value.canonicalSlug as string | null,
    sourceArtifactId: value.sourceArtifactId,
    inputUsdPerMillion: value.inputUsdPerMillion,
    cachedInputUsdPerMillion: value.cachedInputUsdPerMillion as number | null,
    outputUsdPerMillion: value.outputUsdPerMillion,
    contextWindowTokens: value.contextWindowTokens as number | null,
    verificationStatus: 'primary',
    maxInputTokens: value.maxInputTokens as number | null,
    maxOutputTokens: value.maxOutputTokens as number | null,
    inputModalities: value.inputModalities as readonly string[] | null,
    outputModalities: value.outputModalities as readonly string[] | null,
    supportedParameters: value.supportedParameters as readonly string[] | null,
  };
}

function parsePoint(value: unknown): PricePerformancePoint | null {
  if (!isRecord(value)
    || !isText(value.modelKey)
    || !isModelSlugRouteSafe(value.slug)
    || !isText(value.displayName)
    || !isText(value.creator)
    || !isNullableText(value.familyId)
    || !PRICE_PERFORMANCE_STATUSES.includes(value.status as PricePerformanceStatus)
    || !SOURCE_TYPES.has(value.sourceType as BenchmarkModel['sourceType'])
    || !EVIDENCE_STATUSES.has(value.evidenceStatus as EvidenceStatus)
    || !isRecord(value.scores)) return null;

  const scoreKeys = PRICE_PERFORMANCE_SCORE_LANES;
  if (!hasExactKeys(value.scores, scoreKeys)) return null;
  const scores = {} as Record<PricePerformanceScoreLane, number | null>;
  let scoreCount = 0;
  for (const lane of scoreKeys) {
    if (!isNullableFiniteNonNegative(value.scores[lane])) return null;
    scores[lane] = value.scores[lane] as number | null;
    if (scores[lane] !== null) scoreCount += 1;
  }
  if (scoreCount === 0) return null;

  const route = parseRoute(value.route);
  if (!route) return null;
  return {
    modelKey: value.modelKey,
    slug: value.slug,
    displayName: value.displayName,
    creator: value.creator,
    familyId: value.familyId as string | null,
    status: value.status as PricePerformanceStatus,
    sourceType: value.sourceType as BenchmarkModel['sourceType'],
    evidenceStatus: value.evidenceStatus as EvidenceStatus,
    scores,
    route,
  };
}

function parseAttribution(value: unknown): readonly PricePerformanceAttribution[] | null {
  if (!Array.isArray(value)) return null;
  const result: PricePerformanceAttribution[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !SOURCE_IDS.has(item.sourceId as BenchmarkSourceId)
      || !isText(item.label)
      || !isHttpsUrl(item.url)
      || !isTimestamp(item.updatedAt)) return null;
    result.push({
      sourceId: item.sourceId as BenchmarkSourceId,
      label: item.label,
      url: item.url,
      updatedAt: item.updatedAt,
    });
  }
  return result;
}

function parseCapabilities(value: unknown): PricePerformanceCapabilities | null {
  if (!isRecord(value)
    || !isUniqueKnownValues(value.scoreLanes, new Set(PRICE_PERFORMANCE_SCORE_LANES))
    || value.scoreLanes.length !== PRICE_PERFORMANCE_SCORE_LANES.length
    || !isUniqueKnownValues(value.costBases, new Set(PRICE_PERFORMANCE_COST_BASES))
    || value.costBases.length !== PRICE_PERFORMANCE_COST_BASES.length
    || !Array.isArray(value.creators)
    || value.creators.some((creator) => !isText(creator))
    || !isUniqueKnownValues(value.sourceTypes, new Set(['Proprietary', 'Open Weight', 'Unknown']))
    || !isUniqueKnownValues(value.evidenceStatuses, new Set(['supported', 'estimated', 'source_only']))
    || !isUniqueKnownValues(value.statuses, new Set(['current', 'archived']))) return null;
  const creatorSet = new Set(value.creators as string[]);
  if (creatorSet.size !== value.creators.length) return null;
  return {
    scoreLanes: [...value.scoreLanes] as PricePerformanceScoreLane[],
    costBases: [...value.costBases] as PricePerformanceCostBasis[],
    creators: [...value.creators] as string[],
    sourceTypes: [...value.sourceTypes] as BenchmarkModel['sourceType'][],
    evidenceStatuses: [...value.evidenceStatuses] as EvidenceStatus[],
    statuses: [...value.statuses] as PricePerformanceStatus[],
  };
}

function parseScoreMethodology(value: unknown): Readonly<Record<PricePerformanceScoreLane, string>> | null {
  if (!isRecord(value) || !hasExactKeys(value, PRICE_PERFORMANCE_SCORE_LANES)) return null;
  const result = {} as Record<PricePerformanceScoreLane, string>;
  for (const lane of PRICE_PERFORMANCE_SCORE_LANES) {
    if (!isText(value[lane])) return null;
    result[lane] = value[lane];
  }
  return result;
}

/** Strictly validates the complete SSR-to-browser price-performance envelope. */
export function parsePricePerformanceEnvelope(value: unknown): PricePerformanceEnvelope | null {
  if (!isRecord(value)
    || !isText(value.revision)
    || !isTimestamp(value.publishedAt)
    || !isRecord(value.freshness)
    || (value.freshness.status !== 'fresh' && value.freshness.status !== 'stale')
    || !isTimestamp(value.freshness.checkedAt)
    || (value.freshness.message !== undefined && !isText(value.freshness.message))
    || !isRecord(value.data)) return null;

  const attribution = parseAttribution(value.attribution);
  const scoreMethodology = parseScoreMethodology(value.data.scoreMethodology);
  const costDefinitions = value.data.costDefinitions;
  const capabilities = parseCapabilities(value.data.capabilities);
  const rawPoints = value.data.points;
  if (!attribution
    || !scoreMethodology
    || !isRecord(costDefinitions)
    || costDefinitions.output !== 'Published output USD per one million tokens'
    || costDefinitions.blended3To1 !== '(3 × input USD/M + output USD/M) / 4'
    || !capabilities
    || !Array.isArray(rawPoints)) return null;

  const points: PricePerformancePoint[] = [];
  const modelKeys = new Set<string>();
  const slugs = new Set<string>();
  for (const rawPoint of rawPoints) {
    const point = parsePoint(rawPoint);
    if (!point || modelKeys.has(point.modelKey) || slugs.has(point.slug)) return null;
    modelKeys.add(point.modelKey);
    slugs.add(point.slug);
    points.push(point);
  }

  return {
    revision: value.revision,
    publishedAt: value.publishedAt,
    freshness: {
      status: value.freshness.status,
      checkedAt: value.freshness.checkedAt,
      ...(value.freshness.message === undefined ? {} : { message: value.freshness.message as string }),
    },
    attribution,
    data: {
      scoreMethodology,
      costDefinitions: {
        output: costDefinitions.output,
        blended3To1: costDefinitions.blended3To1,
      },
      capabilities,
      points,
    },
  };
}

export const parsePricePerformanceProjectionEnvelope = parsePricePerformanceEnvelope;

export function isPricePerformanceEnvelope(value: unknown): value is PricePerformanceEnvelope {
  return parsePricePerformanceEnvelope(value) !== null;
}
