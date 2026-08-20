import "server-only";

import {
  ACCEPTED_CUSTOM_RANKING_QUERY,
  type RankingData,
  type UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import { createEvidencePreviewDataComposition } from "@tokenbench/frontend/preview-data/composition-evidence";

import { createProductionUiDataAdapter } from "@/lib/ui-data-production.server";

export type MakeItYoursDataMode = "evidence" | "production" | "unconfigured";

export interface MakeItYoursRankingSnapshot {
  readonly mode: MakeItYoursDataMode;
  readonly envelope: UiDataContractV1<RankingData> | null;
  readonly error: string | null;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The custom ranking request failed.";
  if (error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")) {
    return "The production custom-ranking service is not configured for this environment.";
  }
  return "The verified custom-ranking service could not complete this request.";
}

/**
 * This route deliberately submits the accepted custom-ranking request intact.
 * Preview mode reads the retained accepted custom-ranking envelope that
 * matches this query; it never substitutes an illustrative fixture for a
 * missing production response.
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
      return {
        mode: "evidence",
        envelope: await createEvidencePreviewDataComposition({
          rankings: "mixed-source",
        }).rankings(
          ACCEPTED_CUSTOM_RANKING_QUERY,
        ),
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
      error: "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before requesting a custom ranking.",
    };
  }

  try {
    return {
      mode: "production",
      envelope: await createProductionUiDataAdapter().rankings(
        ACCEPTED_CUSTOM_RANKING_QUERY,
      ),
      error: null,
    };
  } catch (error) {
    return { mode: "production", envelope: null, error: safeErrorMessage(error) };
  }
}
