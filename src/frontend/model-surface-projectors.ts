import type {
  CompareData,
  EvidenceValue,
  LifecycleData,
  LifecycleModel,
  ModelDirectoryData,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  UiDataContractV1,
} from "./preview-data/contracts";

export type ModelSurfaceMode = "preview" | "published";

export type ModelSurfaceAxis = Readonly<{
  key: string;
  label: string;
  percentile: number | null;
  rank: number | null;
  fieldSize: number | null;
}>;

export type SurfaceModel = Readonly<{
  id: string;
  name: string;
  provider: string | null;
  access: string | null;
  benchmarkReleaseOn: string | null;
  capabilityScore: number | null;
  capabilityAxes: readonly ModelSurfaceAxis[];
  route: string | null;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  cacheReadUsdPerMillion: number | null;
  cacheWriteUsdPerMillion: number | null;
  longContextInputUsdPerMillion: number | null;
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
  inputModalities: readonly string[];
  outputModalities: readonly string[];
  ttftP50Seconds: number | null;
  outputTokensPerSecond: number | null;
  runtimeConditions: string | null;
  lifecycleStatus: string | null;
  sunsetOn: string | null;
  costUsdPerSuccessfulTask: number | null;
  workload: string | null;
  color: string;
}>;

export type SurfaceLifecycleRow = Readonly<{
  id: string;
  name: string;
  provider: string | null;
  lifecycleStatus: string | null;
  sunsetOn: string | null;
  replacementId: string | null;
  migrationNote: string | null;
  daysToSunset: number | null;
  color: string;
}>;

export type SurfaceEnvelope<T> = Readonly<{
  data: T | null;
  mode: ModelSurfaceMode;
  provenance: readonly Provenance[];
  status: UiDataContractV1<unknown>["status"];
}>;

export type SurfaceComparison = Readonly<{
  models: readonly (SurfaceModel | null)[];
  unavailableIds: readonly string[];
}>;

export type SurfaceComparisonQuery = Readonly<{
  requestedIds: readonly string[];
  valid: boolean;
}>;

const ROUTE_SAFE_SLUG = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;

/** Preserves the submitted order and never deduplicates or substitutes IDs. */
export function parseSurfaceComparisonQuery(
  models: string | readonly string[] | undefined,
): SurfaceComparisonQuery {
  if (models === undefined) return { requestedIds: [], valid: true };
  if (typeof models !== "string") return { requestedIds: [], valid: false };
  const parts = models.split(",").map((value) => value.trim());
  const requestedIds = parts.filter(Boolean);
  return {
    requestedIds,
    valid:
      parts.length <= 4 &&
      parts.every((value) => value.length > 0 && ROUTE_SAFE_SLUG.test(value)) &&
      new Set(parts).size === parts.length,
  };
}

function value<T>(evidence: EvidenceValue<T>): T | null {
  return evidence.availability === "available" ? evidence.value : null;
}

function mode(provenance: readonly Provenance[]): ModelSurfaceMode {
  return provenance.some((source) => source.kind === "illustrative_prototype")
    ? "preview"
    : "published";
}

/** A deterministic visual treatment, never an evidence claim. */
export function modelSurfaceColor(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 58% 51%)`;
}

/**
 * Finds the non-dominated points from supplied capability/price pairs only.
 * Records missing either observation are deliberately excluded: they are not
 * assigned a synthetic zero, infinity, or frontier status.
 */
export function surfaceParetoModelIds(
  models: readonly SurfaceModel[],
): ReadonlySet<string> {
  const comparable = models.filter(
    (model) =>
      model.inputUsdPerMillion !== null &&
      model.capabilityScore !== null &&
      Number.isFinite(model.inputUsdPerMillion) &&
      Number.isFinite(model.capabilityScore),
  );

  return new Set(
    comparable
      .filter(
        (candidate) =>
          !comparable.some(
            (other) =>
              other.id !== candidate.id &&
              (other.inputUsdPerMillion as number) <=
                (candidate.inputUsdPerMillion as number) &&
              (other.capabilityScore as number) >=
                (candidate.capabilityScore as number) &&
              ((other.inputUsdPerMillion as number) <
                (candidate.inputUsdPerMillion as number) ||
                (other.capabilityScore as number) >
                  (candidate.capabilityScore as number)),
          ),
      )
      .map((model) => model.id),
  );
}

export function projectSurfaceModel(model: PreviewModel): SurfaceModel {
  const identity = value(model.identity);
  const route = value(model.routePricing);
  const cache = route === null ? null : value(route.cache);
  const capability = value(model.capability);
  const runtime = value(model.runtime);
  const lifecycle = value(model.lifecycle);
  const taskEconomics = value(model.taskEconomics);
  const benchmark = value(model.benchmark);

  return {
    id: identity?.slug ?? model.id,
    name: identity?.name ?? model.id,
    provider: identity?.provider ?? null,
    access: value(model.access),
    benchmarkReleaseOn: benchmark?.releaseOn ?? null,
    capabilityScore: capability?.compositeScore ?? null,
    capabilityAxes:
      capability?.radar.map((axis) => ({
        key: axis.key,
        label: axis.label,
        percentile: axis.percentile,
        rank: axis.rank,
        fieldSize: axis.fieldSize,
      })) ?? [],
    route: route?.route ?? null,
    inputUsdPerMillion: route?.inputUsdPerMillion ?? null,
    outputUsdPerMillion: route?.outputUsdPerMillion ?? null,
    cacheReadUsdPerMillion:
      cache === null ? null : value(cache.readUsdPerMillion),
    cacheWriteUsdPerMillion:
      cache === null ? null : value(cache.writeUsdPerMillion),
    longContextInputUsdPerMillion:
      route?.longContextInputUsdPerMillion === undefined
        ? null
        : value(route.longContextInputUsdPerMillion),
    contextWindowTokens:
      route === null ? null : value(route.contextWindowTokens),
    maxOutputTokens: route === null ? null : value(route.maxOutputTokens),
    inputModalities: route?.inputModalities ?? [],
    outputModalities: route?.outputModalities ?? [],
    ttftP50Seconds: runtime?.ttftP50Seconds ?? null,
    outputTokensPerSecond: runtime?.outputTokensPerSecond ?? null,
    runtimeConditions: runtime?.conditions ?? null,
    lifecycleStatus: lifecycle?.status ?? null,
    sunsetOn: lifecycle === null ? null : value(lifecycle.sunsetOn),
    costUsdPerSuccessfulTask: taskEconomics?.costUsdPerSuccessfulTask ?? null,
    workload: taskEconomics?.workload ?? null,
    color: modelSurfaceColor(identity?.slug ?? model.id),
  };
}

function surfaceEnvelope<T, U>(
  envelope: UiDataContractV1<T>,
  data: U | null,
): SurfaceEnvelope<U> {
  return {
    data,
    mode: mode(envelope.provenance),
    provenance: envelope.provenance,
    status: envelope.status,
  };
}

export function projectSurfaceDirectory(
  envelope: UiDataContractV1<ModelDirectoryData>,
): SurfaceEnvelope<readonly SurfaceModel[]> {
  return surfaceEnvelope(
    envelope,
    envelope.data === null
      ? null
      : envelope.data.models.map(projectSurfaceModel),
  );
}

export function projectSurfaceProfile(
  envelope: UiDataContractV1<PreviewModelProfileData>,
): SurfaceEnvelope<SurfaceModel> {
  return surfaceEnvelope(
    envelope,
    envelope.data === null ? null : projectSurfaceModel(envelope.data.model),
  );
}

function daysBetween(asOf: string, sunset: string | null): number | null {
  if (sunset === null || !/^\d{4}-\d{2}-\d{2}$/.test(sunset)) return null;
  const start = Date.parse(asOf);
  const end = Date.parse(`${sunset}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - start) / 86_400_000));
}

function projectSurfaceLifecycleRow(
  model: LifecycleModel,
  asOf: string,
): SurfaceLifecycleRow {
  const identity = value(model.identity);
  const lifecycle = value(model.lifecycle);
  const replacement = value(model.replacement);
  const sunsetOn = lifecycle === null ? null : value(lifecycle.sunsetOn);
  const id = identity?.slug ?? model.modelId;
  return {
    id,
    name: identity?.name ?? model.modelId,
    provider: identity?.provider ?? null,
    lifecycleStatus: lifecycle?.status ?? null,
    sunsetOn,
    replacementId: replacement?.modelId ?? null,
    migrationNote: replacement?.migrationNote ?? null,
    daysToSunset: daysBetween(asOf, sunsetOn),
    color: modelSurfaceColor(id),
  };
}

export function projectSurfaceLifecycle(
  envelope: UiDataContractV1<LifecycleData>,
  asOf: string,
): SurfaceEnvelope<readonly SurfaceLifecycleRow[]> {
  return surfaceEnvelope(
    envelope,
    envelope.data === null
      ? null
      : envelope.data.models.map((model) =>
          projectSurfaceLifecycleRow(model, asOf),
        ),
  );
}

export function projectSurfaceComparison(
  envelope: UiDataContractV1<CompareData>,
  requestedIds: readonly string[],
): SurfaceEnvelope<SurfaceComparison> {
  if (envelope.data === null) return surfaceEnvelope(envelope, null);
  const surfaced = envelope.data.models.map(projectSurfaceModel);
  const byId = new Map(surfaced.map((model) => [model.id, model]));
  const models = requestedIds.map((id) => byId.get(id) ?? null);
  return surfaceEnvelope(envelope, {
    models,
    unavailableIds: requestedIds.filter((id, index) => models[index] === null),
  });
}

export function surfaceModeLabel(modeValue: ModelSurfaceMode): string {
  return modeValue === "preview"
    ? "Preview-only · not verified"
    : "Published data";
}
