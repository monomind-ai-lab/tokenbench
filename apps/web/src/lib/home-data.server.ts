import "server-only";

import { loadHomeDataFromAdapter, unavailableHomeData, type HomeDataSnapshot } from "@/lib/home-data";
import { createDesignEvidenceDataAdapter } from "@/lib/ui-data-preview.server";
import { createProductionUiDataAdapter } from "@/lib/ui-data-production.server";

/**
 * The Home route has two explicit modes. Evidence is local preview-only, and
 * every other deployed path uses the HTTP composition with no fixture fallback.
 */
export async function loadHomeData(): Promise<HomeDataSnapshot> {
  const configuredMode = process.env.TOKENBENCH_UI_DATA_MODE;

  if (configuredMode === "evidence") {
    if (process.env.NODE_ENV === "production") {
      return unavailableHomeData("Preview-only evidence is disabled in production builds.");
    }
    return loadHomeDataFromAdapter("evidence", createDesignEvidenceDataAdapter());
  }

  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return unavailableHomeData("Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading Home data.");
  }

  return loadHomeDataFromAdapter("production", createProductionUiDataAdapter());
}
