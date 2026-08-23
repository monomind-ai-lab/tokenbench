import "server-only";

import { unstable_cache } from "next/cache";

import { loadPopularModelsData } from "@/lib/popular-models-live.server";
import { projectSiteChromePopularModels } from "@/lib/site-chrome-data";

/**
 * The root layout renders site chrome on every route, so this read is on the
 * critical path of every page in the product. Uncached it issued four upstream
 * requests per navigation, which showed up as a fixed second of latency on
 * surfaces such as Compare that a reader expects to feel interactive.
 *
 * Only the small projected menu payload is cached, and it is revalidated in the
 * background. The Popular Models route keeps reading the full uncached source
 * for itself, so nothing that is presented as evidence is served from here.
 */
const SITE_CHROME_REVALIDATE_SECONDS = 300;

const cachedSiteChromeData = unstable_cache(
  async () => {
    const popularModels = await loadPopularModelsData();
    return projectSiteChromePopularModels(
      popularModels.viewModel,
      popularModels.dataMode,
    );
  },
  ["site-chrome-popular-models"],
  { revalidate: SITE_CHROME_REVALIDATE_SECONDS, tags: ["site-chrome"] },
);

export async function loadSiteChromeData() {
  return cachedSiteChromeData();
}
