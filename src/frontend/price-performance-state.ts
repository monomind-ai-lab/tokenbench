import type { BenchmarkModel, EvidenceStatus } from '../benchmarks/contracts';
import {
  PRICE_PERFORMANCE_COST_BASES,
  PRICE_PERFORMANCE_SCORE_LANES,
  PRICE_PERFORMANCE_STATUSES,
  PRICE_PERFORMANCE_VARIANT_MODES,
  type PricePerformanceCapabilities,
  type PricePerformanceCostBasis,
  type PricePerformanceFilters,
  type PricePerformanceScoreLane,
  type PricePerformanceStatus,
  type PricePerformanceVariantMode,
} from '../benchmarks/price-performance-contracts';

export const PRICE_PERFORMANCE_SCALES = ['linear', 'log'] as const;
export type PricePerformanceScale = typeof PRICE_PERFORMANCE_SCALES[number];

export interface PricePerformanceState {
  readonly lane: PricePerformanceScoreLane;
  readonly costBasis: PricePerformanceCostBasis;
  readonly creator: string | null;
  readonly sourceType: BenchmarkModel['sourceType'] | null;
  readonly priceBand: readonly [number | null, number | null] | null;
  readonly evidenceStatus: EvidenceStatus | null;
  readonly variants: PricePerformanceVariantMode;
  readonly status: PricePerformanceStatus;
  readonly scale: PricePerformanceScale;
}

export interface DecodedPricePerformanceState {
  readonly state: PricePerformanceState;
  readonly wasNormalized: boolean;
}

export const DEFAULT_PRICE_PERFORMANCE_STATE: PricePerformanceState = {
  lane: 'overall',
  costBasis: 'output',
  creator: null,
  sourceType: null,
  priceBand: null,
  evidenceStatus: null,
  variants: 'one-per-family',
  status: 'current',
  scale: 'linear',
};

const SOURCE_TYPES = ['Proprietary', 'Open Weight', 'Unknown'] as const;
const EVIDENCE_STATUSES: readonly EvidenceStatus[] = ['supported', 'estimated', 'source_only'];
const QUERY_KEYS = ['basis', 'creator', 'evidenceStatus', 'lane', 'maxPrice', 'minPrice', 'scale', 'sourceType', 'status', 'variants'] as const;
const OBSOLETE_QUERY_KEYS: Record<string, true> = { costBasis: true, evidence: true };
const MAX_CREATOR_LENGTH = 120;
const MAX_PRICE = Number.MAX_SAFE_INTEGER;

function queryInput(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : new URLSearchParams(search.toString());
}

function hasValue<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && values.includes(value as T);
}

function finitePrice(value: string | null): number | null | undefined {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_PRICE ? parsed : undefined;
}

function normalizePriceBand(
  value: PricePerformanceState['priceBand'],
): PricePerformanceState['priceBand'] {
  if (value === null) return null;
  const minimum = value[0] ?? null;
  const maximum = value[1] ?? null;
  if (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)
    || maximum !== null && (!Number.isFinite(maximum) || maximum < 0)
    || minimum !== null && maximum !== null && minimum > maximum) {
    return null;
  }
  return minimum === null && maximum === null ? null : [minimum, maximum];
}

function samePriceBand(
  left: PricePerformanceState['priceBand'],
  right: PricePerformanceState['priceBand'],
): boolean {
  return left === right || left !== null && right !== null && left[0] === right[0] && left[1] === right[1];
}

function capabilitiesOrDefaults(capabilities?: PricePerformanceCapabilities): PricePerformanceCapabilities {
  return capabilities ?? {
    scoreLanes: [...PRICE_PERFORMANCE_SCORE_LANES],
    costBases: [...PRICE_PERFORMANCE_COST_BASES],
    creators: [],
    sourceTypes: [...SOURCE_TYPES],
    evidenceStatuses: [...EVIDENCE_STATUSES],
    statuses: [...PRICE_PERFORMANCE_STATUSES],
  };
}

function canonicalCreator(value: string | null, capabilities: PricePerformanceCapabilities): string | null {
  if (value === null || value.trim() === '' || value.length > MAX_CREATOR_LENGTH) return null;
  const creator = value.trim();
  return capabilities.creators.length === 0 || capabilities.creators.includes(creator) ? creator : null;
}

/** Returns true only when every displayed cost is finite and strictly positive. */
export function canUsePricePerformanceLogScale(costs: ReadonlyArray<number | null | undefined>): boolean {
  return costs.length > 0 && costs.every((cost) => typeof cost === 'number' && Number.isFinite(cost) && cost > 0);
}

export function normalizePricePerformanceState(
  candidate: PricePerformanceState,
  capabilities?: PricePerformanceCapabilities,
  displayedCosts?: ReadonlyArray<number | null | undefined>,
): PricePerformanceState {
  const available = capabilitiesOrDefaults(capabilities);
  const lane = available.scoreLanes.includes(candidate.lane) ? candidate.lane : DEFAULT_PRICE_PERFORMANCE_STATE.lane;
  const costBasis = available.costBases.includes(candidate.costBasis) ? candidate.costBasis : DEFAULT_PRICE_PERFORMANCE_STATE.costBasis;
  const creator = canonicalCreator(candidate.creator, available);
  const sourceType = candidate.sourceType !== null && available.sourceTypes.includes(candidate.sourceType)
    ? candidate.sourceType
    : null;
  const evidenceStatus = candidate.evidenceStatus !== null && available.evidenceStatuses.includes(candidate.evidenceStatus)
    ? candidate.evidenceStatus
    : null;
  const variants = PRICE_PERFORMANCE_VARIANT_MODES.includes(candidate.variants)
    ? candidate.variants
    : DEFAULT_PRICE_PERFORMANCE_STATE.variants;
  const status = available.statuses.includes(candidate.status)
    ? candidate.status
    : DEFAULT_PRICE_PERFORMANCE_STATE.status;
  const priceBand = normalizePriceBand(candidate.priceBand);
  const scale = candidate.scale === 'log'
    && displayedCosts !== undefined
    && canUsePricePerformanceLogScale(displayedCosts)
    ? 'log'
    : 'linear';
  return { lane, costBasis, creator, sourceType, priceBand, evidenceStatus, variants, status, scale };
}

/** Parses supported URL values and reports whether the URL had to be repaired. */
export function decodePricePerformanceState(
  search: string | URLSearchParams,
  capabilities?: PricePerformanceCapabilities,
  displayedCosts?: ReadonlyArray<number | null | undefined>,
): DecodedPricePerformanceState {
  const available = capabilitiesOrDefaults(capabilities);
  const params = queryInput(search);
  let wasNormalized = false;
  const seenKeys = new Set<string>();
  for (const key of params.keys()) {
    if (!QUERY_KEYS.includes(key as typeof QUERY_KEYS[number]) || OBSOLETE_QUERY_KEYS[key] === true || seenKeys.has(key)) {
      wasNormalized = true;
    }
    seenKeys.add(key);
  }

  const laneValue = params.get('lane');
  const lane = hasValue(available.scoreLanes, laneValue)
    ? laneValue
    : DEFAULT_PRICE_PERFORMANCE_STATE.lane;
  if (laneValue !== null && (laneValue !== lane || lane === DEFAULT_PRICE_PERFORMANCE_STATE.lane)) wasNormalized = true;

  const basisValue = params.get('basis') ?? params.get('costBasis');
  const costBasis = hasValue(available.costBases, basisValue)
    ? basisValue
    : DEFAULT_PRICE_PERFORMANCE_STATE.costBasis;
  if (basisValue !== null && (basisValue !== costBasis || costBasis === DEFAULT_PRICE_PERFORMANCE_STATE.costBasis || params.has('costBasis'))) wasNormalized = true;

  const creatorValue = params.get('creator');
  const creator = canonicalCreator(creatorValue, available);
  if (creatorValue !== null && creatorValue !== creator) wasNormalized = true;

  const sourceTypeValue = params.get('sourceType');
  const sourceType = sourceTypeValue !== null && available.sourceTypes.includes(sourceTypeValue as BenchmarkModel['sourceType'])
    ? sourceTypeValue as BenchmarkModel['sourceType']
    : null;
  if (sourceTypeValue !== null && sourceType === null) wasNormalized = true;

  const evidenceValue = params.get('evidenceStatus') ?? params.get('evidence');
  const evidenceStatus = evidenceValue !== null && available.evidenceStatuses.includes(evidenceValue as EvidenceStatus)
    ? evidenceValue as EvidenceStatus
    : null;
  if (evidenceValue !== null && (evidenceStatus === null || params.has('evidence'))) wasNormalized = true;

  const variantsValue = params.get('variants');
  const variants = hasValue(PRICE_PERFORMANCE_VARIANT_MODES, variantsValue)
    ? variantsValue
    : DEFAULT_PRICE_PERFORMANCE_STATE.variants;
  if (variantsValue !== null && (variantsValue !== variants || variants === DEFAULT_PRICE_PERFORMANCE_STATE.variants)) wasNormalized = true;

  const statusValue = params.get('status');
  const status = hasValue(available.statuses, statusValue)
    ? statusValue
    : DEFAULT_PRICE_PERFORMANCE_STATE.status;
  if (statusValue !== null && (statusValue !== status || status === DEFAULT_PRICE_PERFORMANCE_STATE.status)) wasNormalized = true;

  const scaleValue = params.get('scale');
  const scale = hasValue(PRICE_PERFORMANCE_SCALES, scaleValue) ? scaleValue : DEFAULT_PRICE_PERFORMANCE_STATE.scale;
  if (scaleValue !== null && (scaleValue !== scale || scale === DEFAULT_PRICE_PERFORMANCE_STATE.scale)) wasNormalized = true;

  const minimum = finitePrice(params.get('minPrice'));
  const maximum = finitePrice(params.get('maxPrice'));
  const priceBand = minimum !== undefined && maximum !== undefined
    ? normalizePriceBand([minimum, maximum])
    : null;
  if (params.has('minPrice') || params.has('maxPrice')) {
    if (minimum === undefined || maximum === undefined || priceBand === null && (minimum !== null || maximum !== null)) wasNormalized = true;
  }

  const candidate: PricePerformanceState = {
    lane,
    costBasis,
    creator,
    sourceType,
    priceBand,
    evidenceStatus,
    variants,
    status,
    scale,
  };
  const normalized = normalizePricePerformanceState(candidate, available, displayedCosts);
  if (normalized.scale !== scale) wasNormalized = true;
  if (normalized.creator !== creator || !samePriceBand(normalized.priceBand, priceBand)) wasNormalized = true;
  return { state: normalized, wasNormalized };
}

/** Serializes one canonical query shape; defaults remain at the base route. */
export function encodePricePerformanceState(
  state: PricePerformanceState,
  displayedCosts?: ReadonlyArray<number | null | undefined>,
): URLSearchParams {
  const normalized = normalizePricePerformanceState(state, undefined, displayedCosts);
  const values: Record<string, string> = {};
  if (normalized.costBasis !== DEFAULT_PRICE_PERFORMANCE_STATE.costBasis) values.basis = normalized.costBasis;
  if (normalized.creator) values.creator = normalized.creator;
  if (normalized.evidenceStatus) values.evidenceStatus = normalized.evidenceStatus;
  if (normalized.lane !== DEFAULT_PRICE_PERFORMANCE_STATE.lane) values.lane = normalized.lane;
  if (normalized.priceBand?.[1] !== null && normalized.priceBand?.[1] !== undefined) values.maxPrice = String(normalized.priceBand[1]);
  if (normalized.priceBand?.[0] !== null && normalized.priceBand?.[0] !== undefined) values.minPrice = String(normalized.priceBand[0]);
  if (normalized.scale !== DEFAULT_PRICE_PERFORMANCE_STATE.scale) values.scale = normalized.scale;
  if (normalized.sourceType) values.sourceType = normalized.sourceType;
  if (normalized.status !== DEFAULT_PRICE_PERFORMANCE_STATE.status) values.status = normalized.status;
  if (normalized.variants !== DEFAULT_PRICE_PERFORMANCE_STATE.variants) values.variants = normalized.variants;
  const serialized = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    if (values[key] !== undefined) serialized.set(key, values[key]!);
  }
  return serialized;
}

export function serializePricePerformanceState(
  state: PricePerformanceState,
  displayedCosts?: ReadonlyArray<number | null | undefined>,
): string {
  return encodePricePerformanceState(state, displayedCosts).toString();
}

export function pricePerformanceUrl(
  state: PricePerformanceState,
  displayedCosts?: ReadonlyArray<number | null | undefined>,
): string {
  const query = serializePricePerformanceState(state, displayedCosts);
  return query.length === 0 ? '/llm-price-performance/' : `/llm-price-performance/?${query}`;
}

export function pricePerformanceFilters(state: PricePerformanceState): PricePerformanceFilters {
  return {
    lane: state.lane,
    costBasis: state.costBasis,
    creator: state.creator,
    sourceType: state.sourceType,
    priceBand: state.priceBand,
    evidenceStatus: state.evidenceStatus,
    variants: state.variants,
    status: state.status,
  };
}
