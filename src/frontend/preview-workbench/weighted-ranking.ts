export const WEIGHTED_RANKING_CAPABILITIES = ['agentic', 'coding', 'reasoning', 'math', 'multimodal', 'throughput'] as const;

export type WeightedRankingCapability = typeof WEIGHTED_RANKING_CAPABILITIES[number];
export type WeightedRankingAccess = 'all' | 'open' | 'closed';

export interface WeightedRankingWeights extends Readonly<Record<WeightedRankingCapability, number>> {}

export interface WeightedRankingFilters {
  readonly access: WeightedRankingAccess;
  readonly providers: readonly string[];
  readonly maxTtft: number;
  readonly minThroughput: number;
  readonly showOutsideSla: boolean;
}

export interface WeightedRankingModel {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly access: 'Proprietary' | 'Open weights';
  readonly cost: number;
  readonly ttft: number;
  readonly throughput: number;
  readonly scores?: Partial<Record<WeightedRankingCapability, number | null>>;
  readonly agentic?: number | null;
  readonly coding?: number | null;
  readonly reasoning?: number | null;
  readonly math?: number | null;
  readonly multimodal?: number | null;
}

export interface WeightedRankingRow extends WeightedRankingModel {
  readonly score: number;
  readonly meetsSla: boolean;
  readonly frontier: boolean;
}

export interface WeightedRankingResult {
  readonly valid: boolean;
  readonly reason: string | null;
  /** Candidates after provider and access filters, before the SLA visibility switch. */
  readonly candidates: readonly WeightedRankingRow[];
  /** One ordered result is deliberately shared by every weighted chart and table. */
  readonly rows: readonly WeightedRankingRow[];
  readonly chartRows: readonly WeightedRankingRow[];
  readonly tableRows: readonly WeightedRankingRow[];
  readonly frontier: readonly WeightedRankingRow[];
}

export type WeightValidation =
  | { readonly valid: true; readonly reason: null }
  | { readonly valid: false; readonly reason: 'At least one capability weight must be greater than zero.' };

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function scoreFor(model: WeightedRankingModel, capability: WeightedRankingCapability): number | null {
  const explicit = model.scores?.[capability] ?? model[capability];
  if (finite(explicit)) return explicit;
  if (capability === 'throughput' && finite(model.throughput)) return Math.min(100, model.throughput / 120 * 100);
  return null;
}

/** Keeps zero-weight recovery explicit so no visual component needs to infer an invalid score. */
export function validateWeights(weights: WeightedRankingWeights): WeightValidation {
  return WEIGHTED_RANKING_CAPABILITIES.some((capability) => finite(weights[capability]) && weights[capability] > 0)
    ? { valid: true, reason: null }
    : { valid: false, reason: 'At least one capability weight must be greater than zero.' };
}

export function weightedScore(model: WeightedRankingModel, weights: WeightedRankingWeights): number | null {
  let weightedTotal = 0;
  let activeWeight = 0;
  for (const capability of WEIGHTED_RANKING_CAPABILITIES) {
    const weight = weights[capability];
    const score = scoreFor(model, capability);
    if (!finite(weight) || weight <= 0 || score === null) continue;
    weightedTotal += score * weight;
    activeWeight += weight;
  }
  return activeWeight > 0 ? weightedTotal / activeWeight : null;
}

export function meetsWeightedRankingSla(model: Pick<WeightedRankingModel, 'ttft' | 'throughput'>, filters: Pick<WeightedRankingFilters, 'maxTtft' | 'minThroughput'>): boolean {
  return finite(model.ttft) && finite(model.throughput) && model.ttft <= filters.maxTtft && model.throughput >= filters.minThroughput;
}

function matchesFilters(model: WeightedRankingModel, filters: WeightedRankingFilters): boolean {
  const openWeight = model.access === 'Open weights';
  const accessMatches = filters.access === 'all'
    || (filters.access === 'open' && openWeight)
    || (filters.access === 'closed' && !openWeight);
  return accessMatches && (filters.providers.length === 0 || filters.providers.includes(model.provider));
}

function orderRows(rows: readonly WeightedRankingRow[]): readonly WeightedRankingRow[] {
  return rows.slice().sort((left, right) => right.score - left.score || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function weightedFrontier(rows: readonly WeightedRankingRow[]): readonly WeightedRankingRow[] {
  let bestScore = Number.NEGATIVE_INFINITY;
  return rows.slice()
    .sort((left, right) => left.cost - right.cost || right.score - left.score || left.id.localeCompare(right.id))
    .filter((row) => {
      if (row.score <= bestScore) return false;
      bestScore = row.score;
      return true;
    });
}

/**
 * Calculates the ranked source of truth once. Rendering code only consumes its
 * ordered rows, preventing the chart and semantic table from drifting apart.
 */
export function buildWeightedRanking(input: {
  readonly models: readonly WeightedRankingModel[];
  readonly weights: WeightedRankingWeights;
  readonly filters: WeightedRankingFilters;
}): WeightedRankingResult {
  const validation = validateWeights(input.weights);
  if (!validation.valid) {
    return { valid: false, reason: validation.reason, candidates: [], rows: [], chartRows: [], tableRows: [], frontier: [] };
  }

  const candidates = orderRows(input.models
    .filter((model) => matchesFilters(model, input.filters))
    .flatMap((model) => {
      const score = weightedScore(model, input.weights);
      return score === null ? [] : [{ ...model, score, meetsSla: meetsWeightedRankingSla(model, input.filters), frontier: false }];
    }));
  const rows = input.filters.showOutsideSla ? candidates : candidates.filter((row) => row.meetsSla);
  const frontierIds = new Set(weightedFrontier(rows).map((row) => row.id));
  const orderedRows = rows.map((row) => ({ ...row, frontier: frontierIds.has(row.id) }));

  return {
    valid: true,
    reason: null,
    candidates,
    rows: orderedRows,
    chartRows: orderedRows,
    tableRows: orderedRows,
    frontier: orderedRows.filter((row) => row.frontier),
  };
}
