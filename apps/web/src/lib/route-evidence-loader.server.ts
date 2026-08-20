import "server-only";

import type {
  CompareData,
  PreviewModelProfileData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

import { createDesignEvidenceDataAdapter } from "@/lib/ui-data-preview.server";
import { createProductionUiDataAdapter } from "@/lib/ui-data-production.server";

export type RouteEvidenceDataMode = "evidence" | "production" | "unconfigured";

export type RouteEvidenceSnapshot<T> = Readonly<{
  mode: RouteEvidenceDataMode;
  envelope: UiDataContractV1<T> | null;
  error: string | null;
}>;

function unavailable<T>(mode: RouteEvidenceDataMode, error: string): RouteEvidenceSnapshot<T> {
  return { mode, envelope: null, error };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")) {
    return "The published evidence service is not configured for this environment.";
  }
  return "The requested evidence record could not be loaded.";
}

async function loadEvidenceSnapshot<T>(operation: () => Promise<UiDataContractV1<T>>): Promise<RouteEvidenceSnapshot<T>> {
  try {
    return { mode: "evidence", envelope: await operation(), error: null };
  } catch (error) {
    return unavailable("evidence", errorMessage(error));
  }
}

async function loadProductionSnapshot<T>(operation: () => Promise<UiDataContractV1<T>>): Promise<RouteEvidenceSnapshot<T>> {
  try {
    return { mode: "production", envelope: await operation(), error: null };
  } catch (error) {
    return unavailable("production", errorMessage(error));
  }
}

/**
 * Route pages never fall back from the published service to preview evidence.
 * Preview evidence is an explicit local-development mode and is labelled by
 * the page as non-production evidence.
 */
export async function loadRouteEvidenceProfile(slug: string): Promise<RouteEvidenceSnapshot<PreviewModelProfileData>> {
  const configuredMode = process.env.TOKENBENCH_UI_DATA_MODE;
  if (configuredMode === "evidence") {
    if (process.env.NODE_ENV === "production") {
      return unavailable("unconfigured", "Preview-only evidence is disabled in production builds.");
    }
    const adapter = createDesignEvidenceDataAdapter();
    return loadEvidenceSnapshot(() => adapter.profile(slug));
  }

  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return unavailable("unconfigured", "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading route evidence.");
  }

  const adapter = createProductionUiDataAdapter();
  return loadProductionSnapshot(() => adapter.profile(slug));
}

export async function loadRouteEvidenceComparison(
  modelIds: readonly [string, string],
): Promise<RouteEvidenceSnapshot<CompareData>> {
  const configuredMode = process.env.TOKENBENCH_UI_DATA_MODE;
  if (configuredMode === "evidence") {
    if (process.env.NODE_ENV === "production") {
      return unavailable("unconfigured", "Preview-only evidence is disabled in production builds.");
    }
    const adapter = createDesignEvidenceDataAdapter();
    return loadEvidenceSnapshot(() => adapter.comparison({ modelIds }));
  }

  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return unavailable("unconfigured", "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading route evidence.");
  }

  const adapter = createProductionUiDataAdapter();
  return loadProductionSnapshot(() => adapter.comparison({ modelIds }));
}
