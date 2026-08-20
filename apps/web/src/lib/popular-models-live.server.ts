import "server-only";

import { projectPopularModelsV1, type PopularModelsV1ViewModel } from "@tokenbench/frontend/popular-models-v1";

import { loadLeaderboardRankings } from "@/lib/ui-data.server";
import { createProductionUiDataAdapter } from "@/lib/ui-data-production.server";
import {
  POPULAR_MODELS_LIVE_LIMIT,
  loadPopularModelsLiveDirectory,
  projectPopularModelsLive,
  projectPopularModelsLiveWithStrict,
  resolvePopularModelsDataPath,
} from "@/lib/popular-models-live";

export type PopularModelsDataMode = "evidence" | "production" | "unconfigured";

/** Shared server result for the route and any server-rendered weekly-model UI. */
export interface PopularModelsDataResult {
  readonly dataMode: PopularModelsDataMode;
  readonly viewModel: PopularModelsV1ViewModel;
}

function liveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("TOKENBENCH_UI_DATA_BASE_URL"))
    return "The live Popular Models data service is not configured for this environment.";
  return "The live Popular Models directory could not complete this request.";
}

const STRICT_PRODUCTION_LEADERBOARD_QUERY = {
  operation: "leaderboard",
  releaseId: null,
  filters: {
    organizationIds: [],
    openWeights: "all",
    excludeDerivativeFinetunes: false,
  },
  limit: POPULAR_MODELS_LIVE_LIMIT,
  cursor: null,
} as const;

async function loadStrictProductionLeaderboard(
  fetchImpl: typeof fetch,
): Promise<PopularModelsV1ViewModel | null> {
  const envelope = await createProductionUiDataAdapter(fetchImpl).rankings(
    STRICT_PRODUCTION_LEADERBOARD_QUERY,
  );
  if (envelope.data === null) return null;
  return projectPopularModelsV1(envelope);
}

/**
 * Selects one explicit data path. Local evidence stays on the retained strict
 * v1 adapter; production and explicit HTTP mode load the legacy weekly
 * directory and the strict HTTP leaderboard concurrently, never evidence.
 */
export async function loadPopularModelsData(
  fetchImpl: typeof fetch = fetch,
): Promise<PopularModelsDataResult> {
  const path = resolvePopularModelsDataPath(
    process.env.TOKENBENCH_UI_DATA_MODE,
    process.env.NODE_ENV,
  );

  if (path === "evidence") {
    const snapshot = await loadLeaderboardRankings();
    return {
      dataMode: snapshot.mode,
      viewModel: projectPopularModelsV1(snapshot.envelope, snapshot.error),
    };
  }

  if (path === "unconfigured")
    return {
      dataMode: "unconfigured",
      viewModel: projectPopularModelsLive(
        null,
        "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before requesting Popular Models data.",
      ),
    };

  const [weeklyResult, strictResult] = await Promise.allSettled([
    loadPopularModelsLiveDirectory(
      process.env.TOKENBENCH_UI_DATA_BASE_URL,
      fetchImpl,
    ),
    loadStrictProductionLeaderboard(fetchImpl),
  ]);

  if (weeklyResult.status === "rejected") {
    return {
      dataMode: "production",
      // Never expose the strict benchmark rank as a Popular Models rank when
      // the weekly popularity source cannot be verified.
      viewModel: projectPopularModelsLive(null, liveErrorMessage(weeklyResult.reason)),
    };
  }

  return {
    dataMode: "production",
    viewModel: projectPopularModelsLiveWithStrict(
      weeklyResult.value,
      strictResult.status === "fulfilled" ? strictResult.value : null,
    ),
  };
}
