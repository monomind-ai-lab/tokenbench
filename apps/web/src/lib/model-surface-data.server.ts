import "server-only";

import {
  type CompareData,
  type LifecycleData,
  type ModelDirectoryData,
  type PreviewModelProfileData,
  type UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import {
  EVIDENCE_LIFECYCLE_QUERY,
  EVIDENCE_MODEL_DIRECTORY_QUERY,
  productionLifecycleQuery,
  PRODUCTION_MODEL_DIRECTORY_QUERY,
} from "@tokenbench/frontend/model-surface-lifecycle-query";

import { createDesignEvidenceDataAdapter } from "@/lib/ui-data-preview.server";
import {
  loadPublishedLifecycle,
  loadPublishedModelComparison,
  loadPublishedModelDirectory,
  loadPublishedModelProfile,
} from "@/lib/published-compatibility.server";

export type ModelSurfaceDataMode = "evidence" | "production" | "unconfigured";

export type ModelSurfaceSnapshot<T> = Readonly<{
  mode: ModelSurfaceDataMode;
  envelope: UiDataContractV1<T> | null;
  error: string | null;
}>;

export type LifecycleSurfaceSnapshot = ModelSurfaceSnapshot<LifecycleData> &
  Readonly<{
    query:
      | typeof EVIDENCE_LIFECYCLE_QUERY
      | ReturnType<typeof productionLifecycleQuery>;
  }>;

function unavailable<T>(
  mode: ModelSurfaceDataMode,
  error: string,
): ModelSurfaceSnapshot<T> {
  return { mode, envelope: null, error };
}

function safeError(error: unknown): string {
  if (
    error instanceof Error &&
    error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")
  ) {
    return "Published data is not configured for this environment.";
  }
  return "The requested published data could not be loaded.";
}

async function loadEvidenceSnapshot<T>(
  request: () => Promise<UiDataContractV1<T>>,
): Promise<ModelSurfaceSnapshot<T>> {
  try {
    return { mode: "evidence", envelope: await request(), error: null };
  } catch (error) {
    return unavailable("evidence", safeError(error));
  }
}

async function loadProductionSnapshot<T>(
  request: () => Promise<UiDataContractV1<T>>,
): Promise<ModelSurfaceSnapshot<T>> {
  try {
    return { mode: "production", envelope: await request(), error: null };
  } catch (error) {
    return unavailable("production", safeError(error));
  }
}

function isEvidenceMode(): boolean {
  return process.env.TOKENBENCH_UI_DATA_MODE === "evidence";
}

function evidenceDisabledInProduction<T>(): ModelSurfaceSnapshot<T> | null {
  return process.env.NODE_ENV === "production"
    ? unavailable(
        "unconfigured",
        "Preview-only evidence is disabled in production builds.",
      )
    : null;
}

export async function loadModelSurfaceDirectory(): Promise<
  ModelSurfaceSnapshot<ModelDirectoryData>
> {
  if (isEvidenceMode()) {
    const disabled = evidenceDisabledInProduction<ModelDirectoryData>();
    if (disabled) return disabled;
    return loadEvidenceSnapshot(() =>
      createDesignEvidenceDataAdapter().models(EVIDENCE_MODEL_DIRECTORY_QUERY),
    );
  }
  if (
    process.env.TOKENBENCH_UI_DATA_MODE !== "http" &&
    process.env.NODE_ENV !== "production"
  ) {
    return unavailable(
      "unconfigured",
      "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading model data.",
    );
  }
  return loadProductionSnapshot(() => loadPublishedModelDirectory(PRODUCTION_MODEL_DIRECTORY_QUERY.limit));
}

export async function loadModelSurfaceProfile(
  slug: string,
): Promise<ModelSurfaceSnapshot<PreviewModelProfileData>> {
  if (isEvidenceMode()) {
    const disabled = evidenceDisabledInProduction<PreviewModelProfileData>();
    if (disabled) return disabled;
    return loadEvidenceSnapshot(() =>
      createDesignEvidenceDataAdapter().profile(slug),
    );
  }
  if (
    process.env.TOKENBENCH_UI_DATA_MODE !== "http" &&
    process.env.NODE_ENV !== "production"
  ) {
    return unavailable(
      "unconfigured",
      "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading model data.",
    );
  }
  return loadProductionSnapshot(() => loadPublishedModelProfile(slug));
}

export async function loadModelSurfaceLifecycle(
  asOf?: string,
): Promise<LifecycleSurfaceSnapshot> {
  if (isEvidenceMode()) {
    const disabled = evidenceDisabledInProduction<LifecycleData>();
    if (disabled) return { ...disabled, query: EVIDENCE_LIFECYCLE_QUERY };
    return {
      ...(await loadEvidenceSnapshot(() =>
        createDesignEvidenceDataAdapter().lifecycle(EVIDENCE_LIFECYCLE_QUERY),
      )),
      query: EVIDENCE_LIFECYCLE_QUERY,
    };
  }
  const query = productionLifecycleQuery(asOf);
  if (
    process.env.TOKENBENCH_UI_DATA_MODE !== "http" &&
    process.env.NODE_ENV !== "production"
  ) {
    return {
      ...unavailable(
        "unconfigured",
        "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading lifecycle data.",
      ),
      query,
    };
  }
  return {
    ...(await loadProductionSnapshot(() => loadPublishedLifecycle(query))),
    query,
  };
}

export async function loadModelSurfaceComparison(
  modelIds: readonly string[],
): Promise<ModelSurfaceSnapshot<CompareData>> {
  if (isEvidenceMode()) {
    const disabled = evidenceDisabledInProduction<CompareData>();
    if (disabled) return disabled;
    return loadEvidenceSnapshot(() =>
      createDesignEvidenceDataAdapter().comparison({ modelIds }),
    );
  }
  if (
    process.env.TOKENBENCH_UI_DATA_MODE !== "http" &&
    process.env.NODE_ENV !== "production"
  ) {
    return unavailable(
      "unconfigured",
      "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before loading comparison data.",
    );
  }
  return loadProductionSnapshot(() => loadPublishedModelComparison(modelIds));
}
