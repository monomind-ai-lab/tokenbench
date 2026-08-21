import "server-only";

import type {
  CompareData,
  ModelDirectoryData,
  RankingData,
  SubscriptionData,
} from "@tokenbench/frontend/preview-data/contracts";

import {
  loadHomeDataFromAdapter,
  unavailableHomeData,
  type HomeDataSnapshot,
  type HomeOperationSnapshot,
} from "@/lib/home-data";
import {
  loadPublishedCatalog,
  loadPublishedModelComparison,
  loadPublishedModelDirectoryAndRanking,
} from "@/lib/published-compatibility.server";
import { projectPublishedHomeSubscription } from "@/lib/published-subscription.server";
import { createDesignEvidenceDataAdapter } from "@/lib/ui-data-preview.server";

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

  const directory = await loadPublishedModelDirectoryAndRanking(100).then(
    (value) => ({ value, error: null }),
    () => ({ value: null, error: "The published model directory could not be loaded." }),
  );
  const catalog = await loadPublishedCatalog().then(
    (value) => ({ value, error: null }),
    () => ({ value: null, error: "The published provider catalog could not be loaded." }),
  );
  const operation = <T>(envelope: HomeOperationSnapshot<T>["envelope"], error: string | null): HomeOperationSnapshot<T> => ({ envelope, error });
  const models = operation<ModelDirectoryData>(directory.value?.models ?? null, directory.error);
  const rankings = operation<RankingData>(directory.value?.rankings ?? null, directory.error);
  const comparisonIds = directory.value?.rankedModelIds.slice(0, 3) ?? [];
  const comparison = comparisonIds.length < 2
    ? operation<CompareData>(null, directory.error ?? "At least two published model profiles are required for comparison.")
    : await loadPublishedModelComparison(comparisonIds).then(
      (envelope) => operation<CompareData>(envelope, null),
      () => operation<CompareData>(null, "The published comparison profiles could not be loaded."),
    );
  const subscription = catalog.value === null
    ? operation<SubscriptionData>(null, catalog.error)
    : operation<SubscriptionData>(projectPublishedHomeSubscription(catalog.value), null);
  return { mode: "production", models, rankings, comparison, subscription };
}
