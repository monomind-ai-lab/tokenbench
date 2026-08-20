import {
  ACCEPTED_SUBSCRIPTION_QUERY,
  type CompareData,
  type CompareQuery,
  type ModelDirectoryData,
  type ModelDirectoryQuery,
  type PreviewDataAdapter,
  type RankingData,
  type RankingQuery,
  type SubscriptionData,
  type UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

export type HomeDataMode = "evidence" | "production" | "unconfigured";

export type HomeOperationSnapshot<T> = Readonly<{
  envelope: UiDataContractV1<T> | null;
  error: string | null;
}>;

export type HomeDataSnapshot = Readonly<{
  mode: HomeDataMode;
  models: HomeOperationSnapshot<ModelDirectoryData>;
  rankings: HomeOperationSnapshot<RankingData>;
  comparison: HomeOperationSnapshot<CompareData>;
  subscription: HomeOperationSnapshot<SubscriptionData>;
}>;

/** The retained models evidence accepts this normalized request exactly. */
export const HOME_EVIDENCE_MODELS_QUERY = {
  cursor: null,
  limit: 3,
} as const satisfies ModelDirectoryQuery;

/** The retained leaderboard evidence accepts this normalized request exactly. */
export const HOME_RANKINGS_QUERY = {
  cursor: null,
  filters: {
    excludeDerivativeFinetunes: false,
    openWeights: "all",
    organizationIds: [],
  },
  limit: 50,
  operation: "leaderboard",
  releaseId: null,
} as const satisfies RankingQuery;

/** The retained comparison evidence accepts this ordered request exactly. */
export const HOME_EVIDENCE_COMPARISON_QUERY = {
  modelIds: ["alpha", "beta", "gamma"],
} as const satisfies CompareQuery;

const HOME_PRODUCTION_MODELS_QUERY = {
  cursor: null,
  limit: 4,
} as const satisfies ModelDirectoryQuery;

function unavailable<T>(error: string): HomeOperationSnapshot<T> {
  return { envelope: null, error };
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")) {
    return "Published Home data is not configured for this environment.";
  }
  return "The requested Home data could not be loaded.";
}

async function capture<T>(operation: () => Promise<UiDataContractV1<T>>): Promise<HomeOperationSnapshot<T>> {
  try {
    return { envelope: await operation(), error: null };
  } catch (error) {
    return unavailable(safeError(error));
  }
}

function productionComparisonQuery(
  rankings: HomeOperationSnapshot<RankingData>,
): CompareQuery | null {
  const ids = Array.from(
    new Set(
      (rankings.envelope?.data?.models ?? [])
        .map((entry) => ({
          id: entry.model.id,
          rank:
            entry.sourceRank ??
            (entry.rank.availability === "available" ? entry.rank.value : null),
        }))
        .filter(
          (entry): entry is { id: string; rank: number } =>
            entry.id.length > 0 &&
            entry.rank !== null &&
            Number.isFinite(entry.rank),
        )
        .sort((left, right) => left.rank - right.rank)
        .map((entry) => entry.id),
    ),
  ).slice(0, 3);
  return ids.length >= 2 ? { modelIds: ids } : null;
}

/**
 * Calls only the adapter that the caller supplies. This is intentionally pure
 * so the server-only mode selection can be tested without importing either
 * production HTTP or retained evidence code.
 */
export async function loadHomeDataFromAdapter(
  mode: Exclude<HomeDataMode, "unconfigured">,
  adapter: PreviewDataAdapter,
): Promise<HomeDataSnapshot> {
  const modelsQuery = mode === "evidence" ? HOME_EVIDENCE_MODELS_QUERY : HOME_PRODUCTION_MODELS_QUERY;
  const subscriptionQuery = mode === "evidence" ? ACCEPTED_SUBSCRIPTION_QUERY : { operation: "catalog" as const };
  const [models, rankings, subscription] = await Promise.all([
    capture(() => adapter.models(modelsQuery)),
    capture(() => adapter.rankings(HOME_RANKINGS_QUERY)),
    capture(() => adapter.subscription(subscriptionQuery)),
  ]);

  const comparisonQuery = mode === "evidence"
    ? HOME_EVIDENCE_COMPARISON_QUERY
    : productionComparisonQuery(rankings);
  const comparison = comparisonQuery === null
    ? unavailable<CompareData>("At least two accepted model records are required for a dynamic comparison.")
    : await capture(() => adapter.comparison(comparisonQuery));

  return { mode, models, rankings, comparison, subscription };
}

export function unavailableHomeData(error: string): HomeDataSnapshot {
  return {
    mode: "unconfigured",
    models: unavailable(error),
    rankings: unavailable(error),
    comparison: unavailable(error),
    subscription: unavailable(error),
  };
}
