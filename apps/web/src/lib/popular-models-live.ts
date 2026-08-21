import {
  parseModelDirectoryEnvelope,
  type ModelDirectoryEntry,
  type ModelDirectoryEnvelope,
} from "@tokenbench/frontend/model-directory-contracts";
import {
  POPULAR_MODELS_CATEGORY_SLOTS,
  popularModelsCategorySlotKey,
  type PopularModelV1,
  type PopularModelsRoutePricingV1,
  type PopularModelsV1ViewModel,
} from "@tokenbench/frontend/popular-models-v1";

/** The deployed directory endpoint's documented maximum page size. */
export const POPULAR_MODELS_LIVE_LIMIT = 100;

export type PopularModelsDataPath = "evidence" | "live" | "unconfigured";

/**
 * Evidence remains an explicitly local-only strict-v1 preview. Every deployed
 * HTTP path uses the weekly directory endpoint; a production evidence request
 * becomes unavailable instead of falling through to either source.
 */
export function resolvePopularModelsDataPath(
  configuredMode: string | undefined,
  nodeEnv: string | undefined,
): PopularModelsDataPath {
  if (configuredMode === "evidence")
    return nodeEnv === "production" ? "unconfigured" : "evidence";
  if (configuredMode === "http" || nodeEnv === "production") return "live";
  return "unconfigured";
}

function liveDirectoryUrl(baseUrl: string | undefined): string {
  const normalized = baseUrl?.trim().replace(/\/+$/u, "") ?? "";
  if (!normalized)
    throw new Error("TOKENBENCH_UI_DATA_BASE_URL is not configured.");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("TOKENBENCH_UI_DATA_BASE_URL is not a valid URL.");
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("TOKENBENCH_UI_DATA_BASE_URL is not a valid service URL.");

  return `${normalized}/api/benchmarks/models?limit=${POPULAR_MODELS_LIVE_LIMIT}`;
}

/**
 * Fetches the deployed legacy directory representation deliberately without
 * the strict ui-data-contract/v1 media type. The parser is the SSR boundary.
 */
export async function loadPopularModelsLiveDirectory(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelDirectoryEnvelope> {
  const response = await fetchImpl(liveDirectoryUrl(baseUrl), {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`The live Popular Models directory returned HTTP ${response.status}.`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The live Popular Models directory returned invalid JSON.");
  }
  const envelope = parseModelDirectoryEnvelope(payload);
  if (envelope === null)
    throw new Error("The live Popular Models directory did not match its typed contract.");
  return envelope;
}

function accessFor(
  entry: ModelDirectoryEntry,
): Pick<PopularModelV1, "access" | "accessUnavailableReason"> {
  if (entry.sourceType === "Proprietary")
    return { access: "Proprietary", accessUnavailableReason: null };
  if (entry.sourceType === "Open Weight")
    return { access: "Open weights", accessUnavailableReason: null };
  return {
    access: null,
    accessUnavailableReason:
      "The live directory reports this model's access type as unknown.",
  };
}

function sourceCategoryAxes(entry: ModelDirectoryEntry): PopularModelV1["axes"] {
  const category = entry.strongestCategory;
  if (
    category === null ||
    popularModelsCategorySlotKey(category.key, category.label) === null
  )
    return [];

  return [
    {
      // Keep the source key. The immutable UI slots resolve it through the
      // existing aliases rather than creating a category from a label.
      key: category.key,
      label: category.label,
      // This field is the generic displayed category measurement in the
      // existing view contract. Use the source score, never a synthesized 0
      // or the distinct source percentile.
      percentile: category.score,
      rank: category.rank,
      fieldSize: category.fieldSize,
    },
  ];
}

function routePricingFor(entry: ModelDirectoryEntry): PopularModelsRoutePricingV1 {
  const price = entry.representativePrice;
  if (price === null)
    return {
      availability: "unavailable",
      reason: "The live directory did not publish a representative route price.",
    };

  return {
    availability: "available",
    route: price.routeId,
    inputUsdPerMillion: price.inputUsdPerMillion,
    outputUsdPerMillion: price.outputUsdPerMillion,
    // The directory publishes separate input/output prices, but not this
    // aggregate. Do not manufacture a 50/50 price from those values.
    blendedUsdPerMillion: null,
    contextWindowTokens: price.contextWindowTokens,
    contextWindowUnavailableReason:
      price.contextWindowTokens === null
        ? "The live directory did not publish a context window for this route."
        : null,
    maxOutputTokens: price.maxOutputTokens,
    maxOutputUnavailableReason:
      price.maxOutputTokens === null
        ? "The live directory did not publish a maximum output length for this route."
        : null,
    // The target view contract has no nullable modality state. An empty list
    // therefore means the directory omitted that field; it is not a claim
    // that the route supports no modalities.
    inputModalities: price.inputModalities ?? [],
    outputModalities: price.outputModalities ?? [],
  };
}

function mapDirectoryEntry(entry: ModelDirectoryEntry): PopularModelV1 {
  return {
    // Client navigation and comparison use the canonical route slug. The
    // source-specific model key remains a join key only and must never leak
    // into a public URL.
    id: entry.canonicalSlug,
    slug: entry.canonicalSlug,
    name: entry.displayName,
    provider: entry.creator,
    identityUnavailableReason: null,
    ...accessFor(entry),
    rank: entry.weeklyRank,
    rankUnavailableReason:
      entry.weeklyRank === null
        ? "The weekly popularity snapshot did not publish a rank for this model."
        : null,
    overallScore: entry.overallScore,
    capabilityUnavailableReason:
      entry.overallScore === null
        ? "The live directory did not publish an overall score for this model."
        : null,
    axes: sourceCategoryAxes(entry),
    subtasks: [],
    benchmarkUnavailableReason:
      "The live directory does not publish benchmark subtask rows.",
    aggregate: null,
    taskEconomics: [],
    taskEconomicsUnavailableReason:
      "The live directory does not publish task-level economics.",
    runtimeUnavailableReason:
      "The live directory does not publish runtime observations.",
    routePricing: routePricingFor(entry),
  };
}

function compareWeeklyRank(
  left: { readonly model: PopularModelV1; readonly sourceIndex: number },
  right: { readonly model: PopularModelV1; readonly sourceIndex: number },
): number {
  if (left.model.rank !== null && right.model.rank !== null)
    return left.model.rank - right.model.rank || left.sourceIndex - right.sourceIndex;
  if (left.model.rank !== null) return -1;
  if (right.model.rank !== null) return 1;
  return left.sourceIndex - right.sourceIndex;
}

function weeklyModels(
  entries: readonly ModelDirectoryEntry[],
  map: (entry: ModelDirectoryEntry) => PopularModelV1,
): readonly PopularModelV1[] {
  return entries
    .map((entry, sourceIndex) => ({ model: map(entry), sourceIndex }))
    .sort(compareWeeklyRank)
    .map(({ model }) => model);
}

function strictModelIndex(
  models: readonly PopularModelV1[],
): ReadonlyMap<string, PopularModelV1> {
  const index = new Map<string, PopularModelV1>();
  const ambiguous = new Set<string>();
  const add = (key: string | null, model: PopularModelV1) => {
    if (key === null || ambiguous.has(key)) return;
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, model);
      return;
    }
    if (existing !== model) {
      index.delete(key);
      ambiguous.add(key);
    }
  };
  for (const model of models) {
    add(model.id, model);
    add(model.slug, model);
  }
  return index;
}

function matchingStrictModel(
  entry: ModelDirectoryEntry,
  index: ReadonlyMap<string, PopularModelV1>,
): PopularModelV1 | null {
  const matches = new Set(
    [
      index.get(entry.canonicalSlug),
      index.get(entry.modelKey),
      // Both producers retain the upstream source model ID. This exact join
      // recovers benchmark categories/economics without name matching.
      index.get(entry.sourceModelId),
    ].filter(
      (model): model is PopularModelV1 => model !== undefined,
    ),
  );
  return matches.size === 1 ? [...matches][0]! : null;
}

function mergedWeeklyModel(
  entry: ModelDirectoryEntry,
  strictModel: PopularModelV1 | null,
): PopularModelV1 {
  const weekly = mapDirectoryEntry(entry);
  if (strictModel === null) return weekly;
  return {
    ...strictModel,
    // Popularity identity comes from the weekly directory. Its source rank is
    // the only rank the Popular Models surface displays.
    id: weekly.id,
    slug: weekly.slug,
    name: weekly.name,
    provider: weekly.provider,
    identityUnavailableReason: weekly.identityUnavailableReason,
    access: weekly.access,
    accessUnavailableReason: weekly.accessUnavailableReason,
    rank: weekly.rank,
    rankUnavailableReason: weekly.rankUnavailableReason,
  };
}

function unavailableView(
  reason: string,
  envelope: ModelDirectoryEnvelope | null = null,
): PopularModelsV1ViewModel {
  return {
    sourceStatus: "unavailable",
    unavailableReason: reason,
    fetchedAt: null,
    effectiveAt: envelope?.data.week?.generatedAt ?? envelope?.publishedAt ?? null,
    // Legacy attribution is not shaped as strict-v1 provenance. Do not invent
    // a provenance kind, note, or receipt id from it.
    provenance: [],
    release: null,
    taxonomy: [],
    total: null,
    totalUnavailableReason:
      "No live Popular Models directory total is available.",
    pagination: {
      availability: "unavailable",
      reason: "No live Popular Models directory pagination receipt is available.",
    },
    categories: POPULAR_MODELS_CATEGORY_SLOTS,
    models: [],
  };
}

/**
 * Projects the typed weekly directory into the existing Popular Models view.
 * It retains the exact weekly rank and every representable source value, while
 * explicitly leaving unsupported strict-v1 facts unavailable.
 */
export function projectPopularModelsLive(
  envelope: ModelDirectoryEnvelope | null,
  loaderError: string | null = null,
): PopularModelsV1ViewModel {
  if (envelope === null)
    return unavailableView(
      loaderError ?? "No verified live Popular Models directory is available.",
    );

  const models = weeklyModels(envelope.data.models, mapDirectoryEntry);

  return {
    // A valid legacy envelope is intentionally partial: it has no strict-v1
    // release, taxonomy, task economics, runtime, or provenance receipt.
    sourceStatus: "partial",
    unavailableReason: loaderError,
    fetchedAt: null,
    effectiveAt: envelope.data.week?.generatedAt ?? envelope.publishedAt,
    provenance: [],
    release: null,
    taxonomy: [],
    total: null,
    totalUnavailableReason:
      "The live directory does not publish a total weekly row count.",
    pagination: {
      availability: "available",
      nextCursor: envelope.data.nextCursor,
    },
    categories: POPULAR_MODELS_CATEGORY_SLOTS,
    models,
  };
}

/**
 * Combines the weekly popularity source with a strict production leaderboard.
 * The weekly source is authoritative for rows, identity, access, and rank;
 * strict data is used only for an exact canonical-slug/model-id match.
 */
export function projectPopularModelsLiveWithStrict(
  weeklyEnvelope: ModelDirectoryEnvelope | null,
  strictView: PopularModelsV1ViewModel | null,
  weeklyError: string | null = null,
): PopularModelsV1ViewModel {
  if (weeklyEnvelope === null)
    return projectPopularModelsLive(null, weeklyError);
  if (
    strictView === null ||
    strictView.sourceStatus === "unavailable" ||
    strictView.models.length === 0
  )
    return projectPopularModelsLive(weeklyEnvelope);

  const index = strictModelIndex(strictView.models);
  let includesUnmatchedWeeklyModel = false;
  const models = weeklyModels(weeklyEnvelope.data.models, (entry) => {
    const strictModel = matchingStrictModel(entry, index);
    if (strictModel === null) includesUnmatchedWeeklyModel = true;
    return mergedWeeklyModel(entry, strictModel);
  });

  return {
    // These fields are retained only from the strict leaderboard receipt.
    ...strictView,
    sourceStatus:
      strictView.sourceStatus === "available" && !includesUnmatchedWeeklyModel
        ? "available"
        : "partial",
    categories: POPULAR_MODELS_CATEGORY_SLOTS,
    models,
  };
}
