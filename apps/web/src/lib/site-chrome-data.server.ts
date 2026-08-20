import "server-only";

import { loadPopularModelsData } from "@/lib/popular-models-live.server";
import { projectSiteChromePopularModels } from "@/lib/site-chrome-data";

export async function loadSiteChromeData() {
  const popularModels = await loadPopularModelsData();
  return projectSiteChromePopularModels(
    popularModels.viewModel,
    popularModels.dataMode,
  );
}
