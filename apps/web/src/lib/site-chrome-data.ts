import {
  projectPopularModelsV1,
  type PopularModelsV1ViewModel,
} from "../../../../src/frontend/popular-models-v1";

import type { SiteChromeTopModel } from "../components/site-chrome";
import type { LeaderboardDataSnapshot } from "./ui-data.server";

export type SiteChromeData = Readonly<{
  topModels: readonly SiteChromeTopModel[];
  topModelsLabel: string;
}>;

export type SiteChromeDataMode = "evidence" | "production" | "unconfigured";

function scoreLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function publishedLabel(effectiveAt: string | null): string {
  if (effectiveAt === null) return "Published ranking";
  const date = new Date(effectiveAt);
  if (Number.isNaN(date.valueOf())) return "Published ranking";
  return `Published ${new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date)}`;
}

/**
 * Builds the shared-menu ranking from the accepted rankings envelope only.
 * Rows without an accepted rank or identity are omitted; array position never
 * becomes a rank and unavailable data never falls back to local constants.
 */
export function projectSiteChromeData(
  snapshot: LeaderboardDataSnapshot,
): SiteChromeData {
  const view = projectPopularModelsV1(snapshot.envelope, snapshot.error);
  return projectSiteChromePopularModels(view, snapshot.mode);
}

/**
 * Keeps the shared navigation on the same ordered Popular Models view as the
 * directory route. In production that order is the verified weekly popularity
 * order; a benchmark source rank is never substituted for it.
 */
export function projectSiteChromePopularModels(
  view: PopularModelsV1ViewModel,
  mode: SiteChromeDataMode,
): SiteChromeData {
  const topModels = view.models
    .filter(
      (model) =>
        model.rank !== null &&
        model.name !== null &&
        model.provider !== null,
    )
    .slice(0, 10)
    .map((model) => ({
      modelId: model.slug ?? model.id,
      name: model.name as string,
      provider: model.provider as string,
      rank: model.rank as number,
      score: scoreLabel(model.overallScore),
    }));

  return {
    topModels,
    topModelsLabel:
      mode === "evidence"
        ? "Preview-only ranking"
        : mode === "production"
          ? publishedLabel(view.effectiveAt)
          : "Ranking unavailable",
  };
}
