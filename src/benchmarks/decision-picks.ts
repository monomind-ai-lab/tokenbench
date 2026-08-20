import type { BenchmarkPriceCheck, BenchmarkSourceRecord } from './contracts';
import type { BenchmarkProjectionSnapshot } from './api-projections';
import { buildLeaderboard, type LeaderboardEntry } from './leaderboards';
import { primaryHostedPriceForModel, type PrimaryHostedPrice } from './value';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../routing/leaderboard-routes';

export interface DecisionPickEntry {
  /** Published source rank; null when the source does not rank the row. */
  readonly rank: number | null;
  readonly modelKey: string;
  readonly slug: string;
  readonly name: string;
  readonly provider: string;
  readonly score: number;
  readonly unit: string;
  readonly evidenceStatus: 'supported';
  readonly updatedAt: string;
  readonly routePath: string;
  readonly representativePriceUsdPerMillion: number | null;
  readonly contextWindowTokens: number | null;
}

export interface DecisionPickGroup {
  readonly key: LeaderboardKey;
  readonly label: string;
  readonly status: 'benchalign' | 'evidence-lens';
  readonly entries: readonly DecisionPickEntry[];
}

export type HomeDecisionSlot<T> =
  | { readonly status: 'ready'; readonly value: T; readonly updatedAt: string }
  | { readonly status: 'unavailable' };

export interface HomeRepresentativeRate {
  readonly modelKey: string;
  readonly slug: string;
  readonly name: string;
  readonly provider: string;
  readonly evidenceStatus: 'supported';
  readonly representativePriceUsdPerMillion: number;
  readonly contextWindowTokens: number | null;
  readonly routePath: string;
}

export interface PricePerformancePoint extends HomeRepresentativeRate {
  readonly score: number;
  readonly unit: string;
  readonly updatedAt: string;
}

export interface HomeDecisionSnapshot {
  readonly benchAlignLeader: HomeDecisionSlot<DecisionPickEntry>;
  readonly valueFrontierLeader: HomeDecisionSlot<DecisionPickEntry>;
  readonly lowestVerifiedRepresentativeRate: HomeDecisionSlot<HomeRepresentativeRate>;
  readonly pricePerformancePoints: readonly PricePerformancePoint[];
}

export interface MaterializedDecisionPicks {
  readonly decisionPicks: readonly DecisionPickGroup[];
  readonly homeDecisionSnapshot: HomeDecisionSnapshot;
}

export interface DecisionPickCategory {
  readonly key: LeaderboardKey;
  readonly label: string;
  readonly status: DecisionPickGroup['status'];
}

/** Deliberate presentation order; it must not inherit object-key ordering. */
export const DECISION_PICK_CATEGORIES: readonly DecisionPickCategory[] = [
  { key: 'llm-overall', label: 'BenchAlign leaders', status: 'benchalign' },
  { key: 'llm-agentic', label: 'Agentic BenchAlign leaders', status: 'benchalign' },
  { key: 'llm-coding', label: 'Coding BenchAlign leaders', status: 'benchalign' },
  { key: 'llm-reasoning', label: 'Reasoning evidence lens', status: 'evidence-lens' },
  { key: 'multimodal-vision-documents', label: 'Vision and documents evidence lens', status: 'evidence-lens' },
  { key: 'llm-knowledge', label: 'Knowledge evidence lens', status: 'evidence-lens' },
];

function isPositiveInteger(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}

function isFiniteIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function sourceArtifactKey(sourceId: string, artifactId: string): string {
  return `${sourceId}\u0000${artifactId}`;
}

function sourceArtifactObservations(sources: readonly BenchmarkSourceRecord[]): ReadonlyMap<string, string> {
  const observations = new Map<string, string>();
  for (const source of sources) {
    if (!isFiniteIsoTimestamp(source.observedAt)) continue;
    const key = sourceArtifactKey(source.sourceId, source.artifactId);
    const current = observations.get(key);
    if (current === undefined || source.observedAt > current) observations.set(key, source.observedAt);
  }
  return observations;
}

function representativeRates(snapshot: BenchmarkProjectionSnapshot): ReadonlyMap<string, PrimaryHostedPrice | null> {
  const pricesByModel = new Map<string, BenchmarkPriceCheck[]>();
  for (const price of snapshot.priceChecks) {
    const prices = pricesByModel.get(price.modelKey);
    if (prices) prices.push(price);
    else pricesByModel.set(price.modelKey, [price]);
  }

  const rates = new Map<string, PrimaryHostedPrice | null>();
  for (const model of snapshot.models) {
    // outputHeavy is the existing named 50/50 input/output profile. It is the
    // fixed representative-rate lens, not a mutable leaderboard workload.
    rates.set(model.modelKey, primaryHostedPriceForModel(
      model.modelKey,
      pricesByModel.get(model.modelKey) ?? [],
      'outputHeavy',
      model.sourceId,
    ));
  }
  return rates;
}

function qualifyingEntry(entry: LeaderboardEntry): entry is LeaderboardEntry & { readonly metric: NonNullable<LeaderboardEntry['metric']> } {
  return entry.model.evidenceStatus === 'supported'
    && entry.metric !== null
    && entry.metric.modelKey === entry.model.modelKey
    && entry.metric.rankingEligible === true
    && Number.isFinite(entry.metric.value);
}

function projectedContextWindow(entry: LeaderboardEntry, representativeRate: PrimaryHostedPrice | null): number | null {
  if (representativeRate !== null) {
    return isPositiveInteger(representativeRate.price.contextWindowTokens)
      ? representativeRate.price.contextWindowTokens
      : null;
  }
  return isPositiveInteger(entry.contextWindowTokens) ? entry.contextWindowTokens : null;
}

interface ProjectableEntry {
  readonly entry: LeaderboardEntry & { readonly metric: NonNullable<LeaderboardEntry['metric']> };
  readonly updatedAt: string;
  readonly representativeRate: PrimaryHostedPrice | null;
}

function projectableEntries(
  entries: readonly LeaderboardEntry[],
  observations: ReadonlyMap<string, string>,
  rates: ReadonlyMap<string, PrimaryHostedPrice | null>,
): readonly ProjectableEntry[] {
  return entries
    .filter(qualifyingEntry)
    .flatMap((entry) => {
      if (!observations.has(sourceArtifactKey(entry.model.sourceId, entry.model.sourceArtifactId))) return [];
      const updatedAt = observations.get(sourceArtifactKey(entry.metric.sourceId, entry.metric.sourceArtifactId));
      if (updatedAt === undefined) return [];
      const candidateRate = rates.get(entry.model.modelKey) ?? null;
      const representativeRate = candidateRate !== null
        && observations.has(sourceArtifactKey(candidateRate.price.sourceId, candidateRate.price.sourceArtifactId))
        ? candidateRate
        : null;
      return [{ entry, updatedAt, representativeRate }];
    });
}

function decisionPickEntry(
  key: LeaderboardKey,
  candidate: ProjectableEntry,
): DecisionPickEntry {
  const { entry, updatedAt, representativeRate } = candidate;
  // The home decision pick keeps the published source rank (absolute, so ties
  // stay ties and filtering never fabricates a leader position).
  const rank = entry.sourceRank;
  return {
    rank,
    modelKey: entry.model.modelKey,
    slug: entry.model.slug,
    name: entry.model.name,
    provider: entry.model.creator,
    score: entry.metric.value,
    unit: entry.metric.unit,
    evidenceStatus: 'supported',
    updatedAt,
    routePath: LEADERBOARD_ROUTES[key].pathname,
    representativePriceUsdPerMillion: representativeRate?.blendedCostPerMillion ?? null,
    contextWindowTokens: projectedContextWindow(entry, representativeRate),
  };
}

function unavailable<T>(): HomeDecisionSlot<T> {
  return { status: 'unavailable' };
}

function ready<T>(value: T, updatedAt: string): HomeDecisionSlot<T> {
  return { status: 'ready', value, updatedAt };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rateCandidate(
  model: BenchmarkProjectionSnapshot['models'][number],
  rate: PrimaryHostedPrice | null,
  observations: ReadonlyMap<string, string>,
): { readonly model: BenchmarkProjectionSnapshot['models'][number]; readonly rate: PrimaryHostedPrice; readonly updatedAt: string } | null {
  if (model.evidenceStatus !== 'supported' || rate === null) return null;
  if (!observations.has(sourceArtifactKey(model.sourceId, model.sourceArtifactId))) return null;
  const updatedAt = observations.get(sourceArtifactKey(rate.price.sourceId, rate.price.sourceArtifactId));
  return updatedAt === undefined ? null : { model, rate, updatedAt };
}

function homeRateValue(
  candidate: NonNullable<ReturnType<typeof rateCandidate>>,
): HomeRepresentativeRate {
  return {
    modelKey: candidate.model.modelKey,
    slug: candidate.model.slug,
    name: candidate.model.name,
    provider: candidate.model.creator,
    evidenceStatus: 'supported',
    representativePriceUsdPerMillion: candidate.rate.blendedCostPerMillion,
    contextWindowTokens: isPositiveInteger(candidate.rate.price.contextWindowTokens)
      ? candidate.rate.price.contextWindowTokens
      : null,
    routePath: LEADERBOARD_ROUTES['llm-pricing-context'].pathname,
  };
}

/**
 * Builds the summary's discovery and Home projections together so materialized
 * fresh/stale response variants derive from one complete, deterministic pass.
 */
export function materializeDecisionPicks(snapshot: BenchmarkProjectionSnapshot): MaterializedDecisionPicks {
  const observations = sourceArtifactObservations(snapshot.sources);
  const rates = representativeRates(snapshot);
  const leaderboards = new Map<LeaderboardKey, ReturnType<typeof buildLeaderboard>>();

  for (const category of DECISION_PICK_CATEGORIES) {
    // `buildLeaderboard` does not append opt-in estimated rows. The explicit
    // supported and route-metric eligibility gate in projectableEntries repeats
    // that safety rule without erasing category-only evidence.
    leaderboards.set(category.key, buildLeaderboard(
      category.key,
      snapshot.models,
      snapshot.metrics,
      snapshot.priceChecks,
      'balanced',
    ));
  }
  const valueLeaderboard = buildLeaderboard(
    'llm-value',
    snapshot.models,
    snapshot.metrics,
    snapshot.priceChecks,
    'balanced',
  );

  const candidatesByKey = new Map<LeaderboardKey, readonly ProjectableEntry[]>();
  for (const category of DECISION_PICK_CATEGORIES) {
    candidatesByKey.set(category.key, projectableEntries(
      leaderboards.get(category.key)?.entries ?? [],
      observations,
      rates,
    ));
  }

  const groups = DECISION_PICK_CATEGORIES.map((category) => ({
    ...category,
    entries: (candidatesByKey.get(category.key) ?? [])
      .slice(0, 3)
      .map((candidate) => decisionPickEntry(category.key, candidate)),
  }));
  const overallCandidates = candidatesByKey.get('llm-overall') ?? [];
  const benchAlignLeader = overallCandidates[0];
  const valueLeader = projectableEntries(valueLeaderboard.entries, observations, rates)
    .find((candidate) => candidate.entry.onValueFrontier && candidate.representativeRate !== null);
  const lowestRate = snapshot.models
    .flatMap((model) => {
      const candidate = rateCandidate(model, rates.get(model.modelKey) ?? null, observations);
      return candidate ? [candidate] : [];
    })
    .sort((left, right) => {
      const priceOrder = left.rate.blendedCostPerMillion - right.rate.blendedCostPerMillion;
      if (priceOrder !== 0) return priceOrder;
      const slugOrder = compareText(left.model.slug, right.model.slug);
      return slugOrder !== 0 ? slugOrder : compareText(left.model.modelKey, right.model.modelKey);
    })[0];

  return {
    decisionPicks: groups,
    homeDecisionSnapshot: {
      benchAlignLeader: benchAlignLeader
        ? ready(decisionPickEntry('llm-overall', benchAlignLeader), benchAlignLeader.updatedAt)
        : unavailable(),
      valueFrontierLeader: valueLeader
        ? ready(decisionPickEntry('llm-value', valueLeader), valueLeader.updatedAt)
        : unavailable(),
      lowestVerifiedRepresentativeRate: lowestRate
        ? ready(homeRateValue(lowestRate), lowestRate.updatedAt)
        : unavailable(),
      pricePerformancePoints: overallCandidates.flatMap((candidate) => {
        if (candidate.representativeRate === null) return [];
        const { rank: _rank, ...point } = decisionPickEntry('llm-overall', candidate);
        return [{
          ...point,
          representativePriceUsdPerMillion: candidate.representativeRate.blendedCostPerMillion,
        } satisfies PricePerformancePoint];
      }),
    },
  };
}

/** Produces fixed, supported-only top-three category groups. */
export function decisionPicks(snapshot: BenchmarkProjectionSnapshot): readonly DecisionPickGroup[] {
  return materializeDecisionPicks(snapshot).decisionPicks;
}

/** Produces Home's supported-only, explicitly unavailable decision slots. */
export function homeDecisionSnapshot(snapshot: BenchmarkProjectionSnapshot): HomeDecisionSnapshot {
  return materializeDecisionPicks(snapshot).homeDecisionSnapshot;
}
