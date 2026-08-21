import "server-only";

import {
  ACCEPTED_CUSTOM_RANKING_QUERY,
  type PreviewDataAdapter,
  type RankingData,
  type RankingQuery,
  type UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import { createEvidencePreviewDataComposition } from "@tokenbench/frontend/preview-data/composition-evidence";
import { mergePublishedRankingDirectorySource } from "@tokenbench/frontend/published-model-compatibility";

import { projectMakeItYoursModels } from "@/lib/make-it-yours-projector";
import { loadCurrentLiveBenchRanking } from "@/lib/livebench-upstream.server";
import { loadPublishedModelDirectory } from "@/lib/published-compatibility.server";

export type MakeItYoursDataMode = "evidence" | "production" | "unconfigured";

export interface MakeItYoursRankingSnapshot {
  readonly mode: MakeItYoursDataMode;
  readonly envelope: UiDataContractV1<RankingData> | null;
  readonly error: string | null;
}

/**
 * The production producer currently owns the published leaderboard contract,
 * not a stable custom-ranking POST contract. This request
 * deliberately omits fixture-only dimension revisions and weights so the HTTP
 * transport selects the valid leaderboard GET operation.
 */
export const PUBLISHED_CANDIDATE_LEADERBOARD_QUERY = {
  operation: "leaderboard",
  releaseId: null,
  filters: {
    organizationIds: [],
    openWeights: "all",
    excludeDerivativeFinetunes: false,
  },
  limit: 100,
  cursor: null,
} as const satisfies RankingQuery;

function safeErrorMessage(error: unknown, mode: "evidence" | "production"): string {
  if (!(error instanceof Error)) {
    return mode === "production"
      ? "The published leaderboard request failed."
      : "The retained custom-ranking evidence could not be loaded.";
  }
  if (error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")) {
    return "The production leaderboard service is not configured for this environment.";
  }
  return mode === "production"
    ? "The verified leaderboard service could not complete this request."
    : "The retained custom-ranking evidence could not be loaded.";
}

function producerCapabilityUnavailable(
  envelope: UiDataContractV1<RankingData>,
): string | null {
  const projection = projectMakeItYoursModels(envelope);
  if (projection.models.length > 0 || projection.unavailableCount === 0) return null;
  return "Producer capability unavailable: the published rows do not include every category score and aggregate evaluation-cost fact required for client-side re-ranking.";
}

/**
 * Evidence keeps its retained exact custom request. Production requests only
 * source-published leaderboard candidates, then the workbench applies its
 * published category weights and filters locally to complete candidate facts.
 */
export async function loadMakeItYoursRankingFromAdapter(
  mode: "evidence" | "production",
  adapter: Pick<PreviewDataAdapter, "rankings">,
): Promise<MakeItYoursRankingSnapshot> {
  const query = mode === "evidence"
    ? ACCEPTED_CUSTOM_RANKING_QUERY
    : PUBLISHED_CANDIDATE_LEADERBOARD_QUERY;

  try {
    const envelope = await adapter.rankings(query);
    return {
      mode,
      envelope,
      error: mode === "production" ? producerCapabilityUnavailable(envelope) : null,
    };
  } catch (error) {
    return { mode, envelope: null, error: safeErrorMessage(error, mode) };
  }
}

/**
 * Preview mode reads the retained exact custom-ranking envelope. Production
 * never posts that fixture request or treats it as a fallback for live data.
 */
export async function loadMakeItYoursRanking(): Promise<MakeItYoursRankingSnapshot> {
  const configuredMode = process.env.TOKENBENCH_UI_DATA_MODE;

  if (configuredMode === "evidence") {
    if (process.env.NODE_ENV === "production") {
      return {
        mode: "unconfigured",
        envelope: null,
        error: "Retained design evidence is disabled in production builds.",
      };
    }

    try {
      return loadMakeItYoursRankingFromAdapter(
        "evidence",
        createEvidencePreviewDataComposition({ rankings: "mixed-source" }),
      );
    } catch {
      return {
        mode: "evidence",
        envelope: null,
        error: "The retained custom-ranking evidence could not be loaded.",
      };
    }
  }

  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return {
      mode: "unconfigured",
      envelope: null,
      error: "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before requesting a custom ranking.",
    };
  }

  try {
    const [benchmark, directory] = await Promise.all([
      loadCurrentLiveBenchRanking(),
      loadPublishedModelDirectory(100).catch(() => null),
    ]);
    const envelope = mergePublishedRankingDirectorySource(benchmark, directory);
    return {
      mode: "production",
      envelope,
      error: producerCapabilityUnavailable(envelope),
    };
  } catch {
    return {
      mode: "production",
      envelope: null,
      error: "The production leaderboard service is not configured for this environment.",
    };
  }
}
