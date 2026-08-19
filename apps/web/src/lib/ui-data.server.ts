import "server-only";

import type { RankingData, UiDataContractV1 } from "@tokenbench/frontend/preview-data/contracts";

import { createDesignEvidenceDataAdapter } from "@/lib/ui-data-preview.server";
import { createProductionUiDataAdapter } from "@/lib/ui-data-production.server";

export type LeaderboardDataMode = "evidence" | "production" | "unconfigured";

export interface LeaderboardDataSnapshot {
  readonly mode: LeaderboardDataMode;
  readonly envelope: UiDataContractV1<RankingData> | null;
  readonly error: string | null;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The ranking request failed.";
  if (error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")) {
    return "The production v1 data service is not configured for this environment.";
  }
  return "The verified ranking service could not complete this request.";
}

/**
 * The data mode is always explicit. Local design evidence never becomes a
 * production fallback, and production failures remain visible to the page.
 */
export async function loadLeaderboardRankings(): Promise<LeaderboardDataSnapshot> {
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
      return {
        mode: "evidence",
        envelope: await createDesignEvidenceDataAdapter().rankings({
          operation: "leaderboard",
          releaseId: null,
          filters: {
            organizationIds: [],
            openWeights: "all",
            excludeDerivativeFinetunes: false,
          },
          limit: 50,
          cursor: null,
        }),
        error: null,
      };
    } catch (error) {
      return { mode: "evidence", envelope: null, error: safeErrorMessage(error) };
    }
  }

  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return {
      mode: "unconfigured",
      envelope: null,
      error: "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before requesting leaderboard data.",
    };
  }

  try {
    return {
      mode: "production",
      envelope: await createProductionUiDataAdapter().rankings({
        operation: "leaderboard",
        releaseId: null,
        filters: {
          organizationIds: [],
          openWeights: "all",
          excludeDerivativeFinetunes: false,
        },
        limit: 50,
        cursor: null,
      }),
      error: null,
    };
  } catch (error) {
    return { mode: "production", envelope: null, error: safeErrorMessage(error) };
  }
}

