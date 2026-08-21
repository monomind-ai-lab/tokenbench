import {
  parseModelDirectoryEnvelope,
  type ModelDirectoryEntry,
  type ModelDirectoryEnvelope,
} from "@tokenbench/frontend/model-directory-contracts";
import type { Provenance } from "@tokenbench/frontend/preview-data/contracts";
import type {
  PricePerformanceEnvelope,
  PricePerformancePoint,
  PricePerformanceScoreLane,
} from "@tokenbench/benchmarks/price-performance-contracts";
import type { LeaderboardKey } from "@tokenbench/routing/leaderboard-routes";
import {
  POPULAR_MODELS_CATEGORY_SLOTS,
  popularModelsCategorySlotKey,
  type PopularModelV1,
  type PopularModelsAxisV1,
  type PopularModelsRoutePricingV1,
  type PopularModelsV1ViewModel,
} from "@tokenbench/frontend/popular-models-v1";
import type { LeaderboardRouteLiveEnvelope } from "@/lib/leaderboard-route-live";

/** The deployed directory endpoint's documented maximum page size. */
export const POPULAR_MODELS_LIVE_LIMIT = 100;

/**
 * These are the complete published BenchLM route receipts currently exposed
 * by the canonical endpoint. The UI has no semantic substitute for an absent
 * route: e.g. knowledge is fetched and validated but is never projected as
 * data analysis.
 */
export const POPULAR_MODELS_CATEGORY_LEADERBOARD_KEYS = [
  "llm-overall",
  "llm-agentic",
  "llm-coding",
  "llm-reasoning",
  "llm-knowledge",
] as const satisfies readonly LeaderboardKey[];

export interface PopularModelsCategoryLeaderboardSource {
  readonly key: (typeof POPULAR_MODELS_CATEGORY_LEADERBOARD_KEYS)[number];
  readonly envelope: LeaderboardRouteLiveEnvelope;
}

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
  const occupiedSlots = new Set<string>();
  return entry.categories.flatMap((category) => {
    const slot = popularModelsCategorySlotKey(category.key, category.label);
    // Keep the source key. The immutable UI slots resolve it through the
    // existing aliases rather than creating a category from a label. Retain
    // source order if distinct source keys resolve to the same fixed slot.
    if (slot === null || occupiedSlots.has(slot)) return [];
    occupiedSlots.add(slot);
    return [{
      key: category.key,
      label: category.label,
      // This field is the generic displayed category measurement in the
      // existing view contract. Use the source score, never a synthesized 0
      // or the distinct source percentile.
      percentile: category.score,
      rank: category.rank,
      fieldSize: category.fieldSize,
    }];
  });
}

type PublishedIdentity = {
  readonly modelKey: string;
  readonly sourceModelId: string;
  readonly canonicalSlug: string;
};

type TaggedAxis = {
  readonly axis: PopularModelsAxisV1;
  readonly sourceKey: string;
  readonly priority: number;
};

type TaggedNumber = {
  readonly value: number;
  readonly sourceKey: string;
  readonly priority: number;
};

interface PublishedModelFacts {
  readonly axes: ReadonlyMap<string, TaggedAxis>;
  readonly overallScore: TaggedNumber | null;
}

interface PublishedFactsIndex {
  readonly facts: ReadonlyMap<string, PublishedModelFacts>;
  readonly provenance: ReadonlyMap<string, readonly Provenance[]>;
}

function publishedIdentityKey(identity: PublishedIdentity): string {
  // JSON keeps arbitrary upstream separators from making a collision between
  // the three independently published identity fields.
  return JSON.stringify([
    identity.modelKey,
    identity.sourceModelId,
    identity.canonicalSlug,
  ]);
}

function uniqueWeeklyIdentityKeys(
  entries: readonly ModelDirectoryEntry[],
): ReadonlySet<string> {
  const unique = new Set<string>();
  const ambiguous = new Set<string>();
  for (const entry of entries) {
    const key = publishedIdentityKey(entry);
    if (ambiguous.has(key)) continue;
    if (unique.has(key)) {
      unique.delete(key);
      ambiguous.add(key);
    } else {
      unique.add(key);
    }
  }
  return unique;
}

function categorySourceKey(
  source: PopularModelsCategoryLeaderboardSource,
): string {
  return `popular-models-category:${source.key}:${source.envelope.revision}`;
}

function categorySourceProvenance(
  source: PopularModelsCategoryLeaderboardSource,
): readonly Provenance[] {
  const { envelope } = source;
  return envelope.attribution.map((attribution) => ({
    id: `${categorySourceKey(source)}:${attribution.sourceId}:${attribution.url}:${attribution.updatedAt}`,
    label: attribution.label,
    kind: "accepted_pipeline",
    effectiveAt: attribution.updatedAt,
    url: attribution.url,
    note: `Published ${source.key} leaderboard revision ${envelope.revision}; checked ${envelope.freshness.checkedAt}`,
  }));
}

function pricePerformanceSourceKey(envelope: PricePerformanceEnvelope): string {
  return `popular-models-price-performance:${envelope.revision}`;
}

function pricePerformanceProvenance(
  envelope: PricePerformanceEnvelope,
): readonly Provenance[] {
  const sourceKey = pricePerformanceSourceKey(envelope);
  return envelope.attribution.map((attribution) => ({
    id: `${sourceKey}:${attribution.sourceId}:${attribution.url}:${attribution.updatedAt}`,
    label: attribution.label,
    kind: "accepted_pipeline",
    effectiveAt: attribution.updatedAt,
    url: attribution.url,
    note: `Published price-performance revision ${envelope.revision}; checked ${envelope.freshness.checkedAt}`,
  }));
}

function categoryEntryIdentity(
  entry: LeaderboardRouteLiveEnvelope["data"]["entries"][number],
): string | null {
  const metric = entry.metric;
  // The typed parser validates each field separately. Require the category
  // metric to agree with its model before it can join the weekly directory.
  if (
    metric === null ||
    metric.modelKey !== entry.model.modelKey ||
    metric.sourceId !== entry.model.sourceId ||
    metric.sourceModelId !== entry.model.sourceModelId
  )
    return null;
  return publishedIdentityKey({
    modelKey: entry.model.modelKey,
    sourceModelId: entry.model.sourceModelId,
    canonicalSlug: entry.model.slug,
  });
}

function categoryAxis(
  metric: NonNullable<LeaderboardRouteLiveEnvelope["data"]["entries"][number]["metric"]>,
): { readonly slot: string; readonly axis: PopularModelsAxisV1 } | null {
  const slot = popularModelsCategorySlotKey(metric.metricKey, metric.category);
  if (slot === null) return null;
  return {
    slot,
    axis: {
      // Keep the source metric key and category label; fixed UI slots resolve
      // these through their explicit published aliases.
      key: metric.metricKey,
      label: metric.category,
      percentile: metric.value,
      rank: metric.rank,
      fieldSize: metric.rankFieldSize ?? null,
    },
  };
}

const PRICE_PERFORMANCE_AXIS_SLOTS: readonly {
  readonly lane: PricePerformanceScoreLane;
  readonly slot: string;
  readonly metricKey: string;
  readonly label: string;
}[] = [
  { lane: "agentic", slot: "agentic-coding", metricKey: "benchlm:category:agentic", label: "Agentic" },
  { lane: "coding", slot: "coding", metricKey: "benchlm:category:coding", label: "Coding" },
  { lane: "reasoning", slot: "reasoning", metricKey: "benchlm:category:reasoning", label: "Reasoning" },
  { lane: "mathematics", slot: "mathematics", metricKey: "benchlm:category:math", label: "Mathematics" },
  // The source calls this lane `multilingual`; the fixed workbench has one
  // explicit language slot. This is a declared lane-to-slot registry, never a
  // match derived from model names or score labels.
  { lane: "multilingual", slot: "language", metricKey: "benchlm:category:multilingual", label: "Multilingual" },
  { lane: "instruction-following", slot: "instruction-following", metricKey: "benchlm:category:instructionFollowing", label: "Instruction following" },
];

function pricePerformancePointIdentity(point: PricePerformancePoint): string | null {
  // Price-performance retains the same model key, upstream source model ID,
  // and canonical slug. All three must agree with the directory; a route with
  // no canonical identity is not a safe Popular Models join candidate.
  if (
    point.route.canonicalSlug === null ||
    point.route.canonicalSlug !== point.slug
  )
    return null;
  return publishedIdentityKey({
    modelKey: point.modelKey,
    sourceModelId: point.route.sourceModelId,
    canonicalSlug: point.slug,
  });
}

function mutableFacts(
  facts: Map<string, {
    axes: Map<string, TaggedAxis>;
    overallScore: TaggedNumber | null;
    ambiguousAxes: Set<string>;
    overallAmbiguous: boolean;
  }>,
  identity: string,
) {
  const existing = facts.get(identity);
  if (existing !== undefined) return existing;
  const created = {
    axes: new Map<string, TaggedAxis>(),
    overallScore: null,
    ambiguousAxes: new Set<string>(),
    overallAmbiguous: false,
  };
  facts.set(identity, created);
  return created;
}

function addAxisFact(
  target: ReturnType<typeof mutableFacts>,
  slot: string,
  axis: TaggedAxis,
): void {
  if (target.ambiguousAxes.has(slot)) return;
  const existing = target.axes.get(slot);
  if (existing === undefined) {
    target.axes.set(slot, axis);
    return;
  }
  if (existing.priority > axis.priority) return;
  if (existing.priority < axis.priority) {
    target.axes.set(slot, axis);
    return;
  }
  if (existing.priority === axis.priority) {
    target.axes.delete(slot);
    target.ambiguousAxes.add(slot);
  }
}

function addOverallFact(
  target: ReturnType<typeof mutableFacts>,
  score: TaggedNumber,
): void {
  if (target.overallAmbiguous) return;
  if (target.overallScore === null) {
    target.overallScore = score;
    return;
  }
  if (target.overallScore.priority > score.priority) return;
  if (target.overallScore.priority < score.priority) {
    target.overallScore = score;
    return;
  }
  if (target.overallScore.priority === score.priority) {
    target.overallScore = null;
    target.overallAmbiguous = true;
  }
}

function indexPublishedFacts(
  entries: readonly ModelDirectoryEntry[],
  categorySources: readonly PopularModelsCategoryLeaderboardSource[],
  pricePerformance: PricePerformanceEnvelope | null,
): PublishedFactsIndex {
  const uniqueIdentities = uniqueWeeklyIdentityKeys(entries);
  const facts = new Map<string, ReturnType<typeof mutableFacts>>();
  const provenance = new Map<string, readonly Provenance[]>();

  for (const source of categorySources) {
    const sourceKey = categorySourceKey(source);
    provenance.set(sourceKey, categorySourceProvenance(source));
    for (const entry of source.envelope.data.entries) {
      const identity = categoryEntryIdentity(entry);
      if (identity === null || !uniqueIdentities.has(identity) || entry.metric === null)
        continue;

      const target = mutableFacts(facts, identity);
      if (source.key === "llm-overall") {
        addOverallFact(target, {
          value: entry.metric.value,
          sourceKey,
          // Direct category receipts retain rank and field-size evidence, so
          // they take precedence over the value-only price-performance lens.
          priority: 2,
        });
        continue;
      }
      const axis = categoryAxis(entry.metric);
      if (axis !== null)
        addAxisFact(target, axis.slot, {
          axis: axis.axis,
          sourceKey,
          priority: 2,
        });
    }
  }

  if (pricePerformance !== null) {
    const sourceKey = pricePerformanceSourceKey(pricePerformance);
    provenance.set(sourceKey, pricePerformanceProvenance(pricePerformance));
    for (const point of pricePerformance.data.points) {
      const identity = pricePerformancePointIdentity(point);
      if (identity === null || !uniqueIdentities.has(identity)) continue;

      const target = mutableFacts(facts, identity);
      if (point.scores.overall !== null)
        addOverallFact(target, {
          value: point.scores.overall,
          sourceKey,
          priority: 1,
        });
      for (const mapping of PRICE_PERFORMANCE_AXIS_SLOTS) {
        const value = point.scores[mapping.lane];
        if (value === null) continue;
        addAxisFact(target, mapping.slot, {
          sourceKey,
          priority: 1,
          axis: {
            // Use the fixed slot key for the declared multilingual -> language
            // registry above. Other source metric keys retain their direct key.
            key: mapping.slot === "language" ? mapping.slot : mapping.metricKey,
            label: mapping.label,
            percentile: value,
            // This endpoint intentionally publishes score lanes, not category
            // ranking receipts. Never use its point order as a rank.
            rank: null,
            fieldSize: null,
          },
        });
      }
    }
  }

  return {
    facts: new Map(
      [...facts].map(([identity, value]) => [
        identity,
        { axes: value.axes, overallScore: value.overallScore },
      ]),
    ),
    provenance,
  };
}

function mergePublishedAxes(
  weeklyAxes: readonly PopularModelsAxisV1[],
  publishedAxes: ReadonlyMap<string, TaggedAxis>,
): readonly PopularModelsAxisV1[] {
  if (publishedAxes.size === 0) return weeklyAxes;
  const weeklySlots = new Set(
    weeklyAxes
      .map((axis) => popularModelsCategorySlotKey(axis.key, axis.label))
      .filter((slot): slot is string => slot !== null),
  );
  return [
    ...weeklyAxes.filter((axis) => {
      const slot = popularModelsCategorySlotKey(axis.key, axis.label);
      const published = slot === null ? undefined : publishedAxes.get(slot);
      // A direct per-key leaderboard receipt supplies the richer category
      // rank/field-size fact. The price-performance projection has only a
      // value, so it fills an absent weekly slot and never overwrites one.
      return published === undefined || published.priority < 2;
    }),
    ...[...publishedAxes.entries()]
      .filter(([slot, fact]) => !weeklySlots.has(slot) || fact.priority >= 2)
      .map(([, fact]) => fact.axis),
  ];
}

function mergeWeeklyModelWithPublishedFacts(
  entry: ModelDirectoryEntry,
  facts: PublishedModelFacts | undefined,
  appliedSourceKeys: Set<string>,
): PopularModelV1 {
  const weekly = mapDirectoryEntry(entry);
  if (facts === undefined) return weekly;

  for (const fact of facts.axes.values()) appliedSourceKeys.add(fact.sourceKey);
  const overallScore = weekly.overallScore ?? facts.overallScore?.value ?? null;
  if (weekly.overallScore === null && facts.overallScore !== null)
    appliedSourceKeys.add(facts.overallScore.sourceKey);

  return {
    ...weekly,
    overallScore,
    capabilityUnavailableReason:
      overallScore === null
        ? weekly.capabilityUnavailableReason
        : null,
    axes: mergePublishedAxes(weekly.axes, facts.axes),
  };
}

function mergedProvenance(
  base: readonly Provenance[],
  facts: PublishedFactsIndex,
  appliedSourceKeys: ReadonlySet<string>,
): readonly Provenance[] {
  const byId = new Map<string, Provenance>();
  for (const source of base) byId.set(source.id, source);
  for (const key of appliedSourceKeys) {
    for (const source of facts.provenance.get(key) ?? []) byId.set(source.id, source);
  }
  return [...byId.values()];
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

function legacyDirectoryProvenance(
  envelope: ModelDirectoryEnvelope,
): readonly Provenance[] {
  return envelope.attribution.map((source) => ({
    id: `model-directory:${envelope.revision}:${source.sourceId}:${source.url}:${source.updatedAt}`,
    label: source.label,
    kind: "accepted_pipeline",
    effectiveAt: source.updatedAt,
    note: `Published model-directory revision ${envelope.revision}; checked ${envelope.freshness.checkedAt}; ${source.url}`,
  }));
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
    // release, taxonomy, task economics, or runtime receipt. Its published
    // attribution and freshness remain factual provenance rather than being
    // dropped just because the strict media type is not negotiated yet.
    sourceStatus: "partial",
    unavailableReason: loaderError,
    fetchedAt: envelope.freshness.checkedAt,
    effectiveAt: envelope.data.week?.generatedAt ?? envelope.publishedAt,
    provenance: legacyDirectoryProvenance(envelope),
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
 * Combines the weekly popularity source with exact published category facts.
 * The weekly directory remains the only authority for rows and weekly rank.
 * Strict LiveBench retains priority when its identity joins exactly; category
 * and price-performance facts fill only rows that have no strict match.
 */
export function projectPopularModelsLiveWithPublishedCategories(
  weeklyEnvelope: ModelDirectoryEnvelope | null,
  strictView: PopularModelsV1ViewModel | null,
  categorySources: readonly PopularModelsCategoryLeaderboardSource[],
  pricePerformance: PricePerformanceEnvelope | null,
  weeklyError: string | null = null,
): PopularModelsV1ViewModel {
  if (weeklyEnvelope === null)
    return projectPopularModelsLive(null, weeklyError);
  const strictUsable =
    strictView !== null &&
    strictView.sourceStatus !== "unavailable" &&
    strictView.models.length > 0;
  const index = strictUsable ? strictModelIndex(strictView!.models) : null;
  const facts = indexPublishedFacts(
    weeklyEnvelope.data.models,
    categorySources,
    pricePerformance,
  );
  const appliedSourceKeys = new Set<string>();
  let includesUnmatchedWeeklyModel = false;
  const models = weeklyModels(weeklyEnvelope.data.models, (entry) => {
    const strictModel = index === null ? null : matchingStrictModel(entry, index);
    if (strictModel !== null) return mergedWeeklyModel(entry, strictModel);
    if (strictUsable) includesUnmatchedWeeklyModel = true;
    return mergeWeeklyModelWithPublishedFacts(
      entry,
      facts.facts.get(publishedIdentityKey(entry)),
      appliedSourceKeys,
    );
  });

  const base = strictUsable
    ? strictView!
    : projectPopularModelsLive(weeklyEnvelope);

  return {
    ...base,
    sourceStatus:
      strictUsable && base.sourceStatus === "available" && !includesUnmatchedWeeklyModel
        ? "available"
        : "partial",
    provenance: mergedProvenance(
      [
        ...legacyDirectoryProvenance(weeklyEnvelope),
        ...(strictUsable ? strictView!.provenance : []),
      ],
      facts,
      appliedSourceKeys,
    ),
    categories: POPULAR_MODELS_CATEGORY_SLOTS,
    models,
  };
}

/**
 * Backward-compatible strict-only entry point. Production uses the broader
 * published-category adapter above; this remains useful to focused callers
 * that have no category receipts to supply.
 */
export function projectPopularModelsLiveWithStrict(
  weeklyEnvelope: ModelDirectoryEnvelope | null,
  strictView: PopularModelsV1ViewModel | null,
  weeklyError: string | null = null,
): PopularModelsV1ViewModel {
  return projectPopularModelsLiveWithPublishedCategories(
    weeklyEnvelope,
    strictView,
    [],
    null,
    weeklyError,
  );
}
