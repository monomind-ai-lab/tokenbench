import {
  BENCHMARK_SOURCE_IDS,
  isCanonicalIsoTimestamp,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkSourceId,
} from "@tokenbench/benchmarks/contracts";
import { isModelSlugRouteSafe } from "@tokenbench/benchmarks/model-directory";
import {
  LEADERBOARD_DEFINITIONS,
  type LeaderboardDefinition,
  type LeaderboardEntry,
} from "@tokenbench/benchmarks/leaderboards";
import {
  createLeaderboardQueryCapabilities,
  hasValidLeaderboardQueryGrammar,
  LEADERBOARD_EVIDENCE_STATUSES,
  LEADERBOARD_SORT_ORDER,
  LEADERBOARD_SOURCE_TYPES,
  type LeaderboardQueryCapabilities,
} from "@tokenbench/benchmarks/leaderboard-query";
import {
  blendedCostPerMillion,
  isPrimaryHostedRoute,
  isWorkloadProfile,
  type WorkloadProfile,
} from "@tokenbench/benchmarks/value";
import type {
  CachePricing,
  EvidenceValue,
  ModelAccess,
  ModelCapability,
  PreviewModel,
  Provenance,
  RankingData,
  RankingEntry,
  RoutePricing,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";
import type { LeaderboardKey } from "@tokenbench/routing/leaderboard-routes";

/** The API maximum supplies a complete route result for the current detail UI. */
export const LEADERBOARD_ROUTE_LIVE_LIMIT = 200;
const LEADERBOARD_OPAQUE_CURSOR_MAX_LENGTH = 2_048;

export interface LeaderboardRouteFreshness {
  readonly status: "fresh" | "stale";
  readonly checkedAt: string;
  readonly message?: string;
}

export interface LeaderboardRouteAttribution {
  readonly sourceId: string;
  readonly label: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface LeaderboardRoutePageResult {
  readonly key: LeaderboardKey;
  readonly profile: WorkloadProfile;
  readonly definition: LeaderboardDefinition;
  readonly entries: readonly LeaderboardEntry[];
  readonly pagination: {
    readonly limit: number;
    readonly total: number;
    readonly nextCursor: string | null;
  };
  readonly capabilities: ReturnType<typeof createLeaderboardQueryCapabilities>;
}

export interface LeaderboardRouteApiEnvelope<T> {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: LeaderboardRouteFreshness;
  readonly attribution: readonly LeaderboardRouteAttribution[];
  readonly data: T;
}

export type LeaderboardRouteLiveEnvelope = LeaderboardRouteApiEnvelope<LeaderboardRoutePageResult>;

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new TypeError(`Published leaderboard response ${message}.`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sourceId(value: unknown): value is BenchmarkSourceId {
  return typeof value === "string" && (BENCHMARK_SOURCE_IDS as readonly string[]).includes(value);
}

function nullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function nullableNonNegativeFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function nullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) > 0);
}

function nullableStringArray(value: unknown): value is readonly string[] | null {
  return value === null || (Array.isArray(value) && value.every(nonEmptyString));
}

/**
 * Cursors belong to the published endpoint. The server can retain a bounded,
 * non-control-string receipt and pass it back verbatim, but must not decode or
 * reconstruct its format locally.
 */
function isOpaqueLeaderboardCursor(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= LEADERBOARD_OPAQUE_CURSOR_MAX_LENGTH
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => sameJsonValue(item, right[index]));
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  const leftRecord = left as JsonRecord;
  const rightRecord = right as JsonRecord;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key]));
}

function containsAll(actual: readonly unknown[], expected: readonly unknown[]): boolean {
  return expected.every((value) => actual.some((candidate) => sameJsonValue(candidate, value)));
}

/**
 * A paginated API publishes capabilities for the complete route, so an
 * individual page may expose providers or price values that do not occur in
 * that page's rows. Validate the complete-route receipt as a typed superset;
 * the merged result is recomputed from every validated page below.
 */
function pageCapabilitiesCoverEntries(
  value: unknown,
  expected: LeaderboardQueryCapabilities,
): boolean {
  if (!recordOrFalse(value)) return false;
  const capabilities = value as JsonRecord;
  const priceValues = capabilities.priceValues;
  const sorts = capabilities.sorts;
  const providers = capabilities.providers;
  const sourceTypes = capabilities.sourceTypes;
  const evidenceStatuses = capabilities.evidenceStatuses;
  if (!Array.isArray(priceValues)
    || priceValues.some((price) => typeof price !== "number" || !Number.isFinite(price) || price < 0)
    || new Set(priceValues).size !== priceValues.length
    || !Array.isArray(sorts)
    || !sorts.every((sort) => LEADERBOARD_SORT_ORDER.includes(sort))
    || !Array.isArray(providers)
    || !providers.every(nonEmptyString)
    || !Array.isArray(sourceTypes)
    || !sourceTypes.every((sourceType) => LEADERBOARD_SOURCE_TYPES.includes(sourceType))
    || !Array.isArray(evidenceStatuses)
    || !evidenceStatuses.every((status) => LEADERBOARD_EVIDENCE_STATUSES.includes(status))) {
    return false;
  }
  return capabilities.dataReady === true
    && capabilities.defaultProfile === expected.defaultProfile
    && capabilities.defaultSort === expected.defaultSort
    && capabilities.supportsProfile === expected.supportsProfile
    && capabilities.supportsEstimated === expected.supportsEstimated
    && capabilities.supportsLifecycle === false
    && capabilities.priceMode === expected.priceMode
    && typeof capabilities.supportsPrice === "boolean"
    && (expected.supportsPrice !== true || capabilities.supportsPrice === true)
    && sameJsonValue(capabilities.metricKeys, expected.metricKeys)
    && containsAll(priceValues, expected.priceValues ?? [])
    && containsAll(sorts, expected.sorts)
    && containsAll(providers, expected.providers ?? [])
    && containsAll(sourceTypes, expected.sourceTypes ?? [])
    && containsAll(evidenceStatuses, expected.evidenceStatuses ?? []);
}

function isBenchmarkModel(value: unknown): value is BenchmarkModel {
  if (!recordOrFalse(value)) return false;
  const model = value as JsonRecord;
  return ["modelKey", "slug", "name", "creator", "sourceModelId", "sourceArtifactId"]
    .every((key) => nonEmptyString(model[key]))
    && (model.sourceType === "Proprietary" || model.sourceType === "Open Weight" || model.sourceType === "Unknown")
    && (model.evidenceStatus === "supported" || model.evidenceStatus === "estimated" || model.evidenceStatus === "source_only")
    && typeof model.rankingEligible === "boolean"
    && sourceId(model.sourceId)
    && nullablePositiveInteger(model.contextWindowTokens);
}

function recordOrFalse(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBenchmarkMetric(value: unknown): value is BenchmarkMetric {
  if (!recordOrFalse(value)) return false;
  const metric = value as JsonRecord;
  return ["modelKey", "metricKey", "category", "sourceModelId", "sourceArtifactId"]
    .every((key) => nonEmptyString(metric[key]))
    && isCanonicalIsoTimestamp(metric.sourceUpdatedAt)
    && typeof metric.value === "number"
    && Number.isFinite(metric.value)
    && nullablePositiveInteger(metric.rank)
    && (metric.rankFieldSize === undefined || nullablePositiveInteger(metric.rankFieldSize))
    && (metric.unit === "score" || metric.unit === "arena_score" || metric.unit === "rank" || metric.unit === "usd_per_million_tokens" || metric.unit === "tokens")
    && sourceId(metric.sourceId)
    && (metric.methodology === "benchlm_raw_composite" || metric.methodology === "bradley_terry" || metric.methodology === "ips")
    && typeof metric.rankingEligible === "boolean";
}

function isBenchmarkPriceCheck(value: unknown): value is BenchmarkPriceCheck {
  if (!recordOrFalse(value)) return false;
  const price = value as JsonRecord;
  return ["modelKey", "providerId", "routeId", "sourceModelId", "sourceArtifactId"]
    .every((key) => nonEmptyString(price[key]))
    && sourceId(price.sourceId)
    && (price.verificationStatus === "primary" || price.verificationStatus === "corroborating" || price.verificationStatus === "conflict")
    && nullableNonNegativeFiniteNumber(price.inputUsdPerMillion)
    && nullableNonNegativeFiniteNumber(price.cachedInputUsdPerMillion)
    && nullableNonNegativeFiniteNumber(price.outputUsdPerMillion)
    && nullablePositiveInteger(price.contextWindowTokens)
    && (price.maxOutputTokens === undefined || nullablePositiveInteger(price.maxOutputTokens))
    && (price.inputModalities === undefined || nullableStringArray(price.inputModalities))
    && (price.outputModalities === undefined || nullableStringArray(price.outputModalities));
}

function isExpectedDefinition(value: unknown, key: LeaderboardKey): value is LeaderboardDefinition {
  if (!recordOrFalse(value)) return false;
  const expected = LEADERBOARD_DEFINITIONS[key];
  const expectedSourceId = "sourceId" in expected ? expected.sourceId : undefined;
  const expectedUserSortable = "userSortable" in expected ? expected.userSortable : undefined;
  return value.kind === expected.kind
    && value.sourceId === expectedSourceId
    && value.defaultSort === expected.defaultSort
    && Array.isArray(value.metricKeys)
    && value.metricKeys.length === expected.metricKeys.length
    && value.metricKeys.every((metricKey, index) => metricKey === expected.metricKeys[index])
    && value.userSortable === expectedUserSortable;
}

function isMetricForDefinition(metric: BenchmarkMetric, definition: LeaderboardDefinition): boolean {
  if (!definition.metricKeys.includes(metric.metricKey)) return false;
  switch (definition.kind) {
    case "benchlm":
    case "value":
      return metric.sourceId === "benchlm"
        && metric.metricKey.startsWith("benchlm:")
        && metric.methodology === "benchlm_raw_composite"
        && metric.unit === "score";
    case "lmarena":
      return metric.sourceId === "lmarena"
        && metric.metricKey.startsWith("lmarena:")
        && metric.methodology === "bradley_terry"
        && metric.unit === "arena_score";
    case "multimodal":
      return (metric.sourceId === "benchlm"
        && metric.metricKey.startsWith("benchlm:")
        && metric.methodology === "benchlm_raw_composite"
        && metric.unit === "score")
        || (metric.sourceId === "lmarena"
          && metric.metricKey.startsWith("lmarena:")
          && metric.methodology === "bradley_terry"
          && metric.unit === "arena_score");
    case "pricing-context":
      return false;
  }
}

function priceMatchesSelectedRoute(entry: LeaderboardEntry, profile: WorkloadProfile): boolean {
  const price = entry.primaryPrice;
  if (price === null
    || price.modelKey !== entry.model.modelKey
    || !isPrimaryHostedRoute(price, entry.model.sourceId)
    || price.inputUsdPerMillion === null
    || price.outputUsdPerMillion === null
    || entry.blendedCostPerMillion === null) {
    return false;
  }
  const expected = blendedCostPerMillion(price.inputUsdPerMillion, price.outputUsdPerMillion, profile);
  const scale = Math.max(1, Math.abs(expected), Math.abs(entry.blendedCostPerMillion));
  return Math.abs(expected - entry.blendedCostPerMillion) <= Number.EPSILON * 8 * scale
    && entry.contextWindowTokens === price.contextWindowTokens;
}

function isLeaderboardEntryForRoute(
  value: unknown,
  definition: LeaderboardDefinition,
  profile: WorkloadProfile,
): value is LeaderboardEntry {
  if (!recordOrFalse(value)) return false;
  const entry = value as JsonRecord;
  if (!isBenchmarkModel(entry.model)
    || !(entry.metric === null || isBenchmarkMetric(entry.metric))
    || !Array.isArray(entry.metrics)
    || !entry.metrics.every(isBenchmarkMetric)
    || !(entry.primaryPrice === null || isBenchmarkPriceCheck(entry.primaryPrice))
    || !nullableFiniteNumber(entry.blendedCostPerMillion)
    || !nullablePositiveInteger(entry.contextWindowTokens)
    || !nullablePositiveInteger(entry.sourceRank)
    || typeof entry.onValueFrontier !== "boolean") {
    return false;
  }

  const candidate = entry as unknown as LeaderboardEntry;
  if (definition.kind === "pricing-context") {
    return candidate.metric === null
      && candidate.metrics.length === 0
      && candidate.sourceRank === null
      && candidate.onValueFrontier === false
      && priceMatchesSelectedRoute(candidate, profile);
  }

  const metric = candidate.metric;
  if (metric === null
    || metric.modelKey !== candidate.model.modelKey
    || !isMetricForDefinition(metric, definition)
    || candidate.metrics.length === 0
    || !sameJsonValue(candidate.metrics[0], metric)
    || !candidate.metrics.every((item) => item.modelKey === candidate.model.modelKey && isMetricForDefinition(item, definition))
    || (candidate.model.evidenceStatus !== "estimated" && candidate.sourceRank !== metric.rank)
    || (candidate.model.evidenceStatus === "estimated" && candidate.sourceRank !== null)) {
    return false;
  }
  if (metric.sourceId === "benchlm" && candidate.model.sourceId !== "benchlm") return false;
  if (metric.sourceId === "lmarena" && (metric.rank === null || candidate.model.evidenceStatus === "estimated")) return false;
  if (candidate.primaryPrice !== null && !isPrimaryHostedRoute(candidate.primaryPrice, candidate.model.sourceId)) return false;

  if (definition.kind === "value") return priceMatchesSelectedRoute(candidate, profile);
  return definition.kind !== "multimodal" || candidate.onValueFrontier === false;
}

function isFreshness(value: unknown): value is LeaderboardRouteFreshness {
  if (!recordOrFalse(value)) return false;
  return (value.status === "fresh" || value.status === "stale")
    && isCanonicalIsoTimestamp(value.checkedAt)
    && (value.message === undefined || nonEmptyString(value.message));
}

function isAttribution(value: unknown): value is LeaderboardRouteAttribution {
  if (!recordOrFalse(value)) return false;
  if (!sourceId(value.sourceId)
    || !nonEmptyString(value.label)
    || !nonEmptyString(value.url)
    || !isCanonicalIsoTimestamp(value.updatedAt)) {
    return false;
  }
  try {
    const url = new URL(value.url);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function sourceIdsForEntry(entry: LeaderboardEntry): readonly BenchmarkSourceId[] {
  return [
    entry.model.sourceId,
    ...(entry.metric === null ? [] : [entry.metric.sourceId]),
    ...entry.metrics.map((metric) => metric.sourceId),
    ...(entry.primaryPrice === null ? [] : [entry.primaryPrice.sourceId]),
  ];
}

function responseSourcesCoverEntries(
  attribution: readonly LeaderboardRouteAttribution[],
  entries: readonly LeaderboardEntry[],
): boolean {
  if (attribution.length === 0) return false;
  const present = new Set(attribution.map((source) => source.sourceId));
  return entries.every((entry) => sourceIdsForEntry(entry).every((id) => present.has(id)));
}

/**
 * Builds the same per-key API request grammar that the existing leaderboard
 * client uses. The detail UI filters locally, so only its workload profile is
 * sent; this preserves a complete source field for the client-side controls.
 */
export function leaderboardRouteLiveEndpoint(key: LeaderboardKey, profile: WorkloadProfile, cursor: string | null = null): string {
  if (!isWorkloadProfile(profile)) throw new TypeError("Leaderboard profile is unsupported.");
  const definition = LEADERBOARD_DEFINITIONS[key];
  const parameters = new URLSearchParams({ profile });
  if (!hasValidLeaderboardQueryGrammar(parameters, definition)) {
    throw new TypeError("Leaderboard profile does not match the route query grammar.");
  }
  parameters.set("limit", String(LEADERBOARD_ROUTE_LIVE_LIMIT));
  if (cursor !== null) {
    if (!isOpaqueLeaderboardCursor(cursor)) throw new TypeError("Leaderboard cursor is invalid.");
    parameters.set("cursor", cursor);
  }
  return `/api/benchmarks/leaderboards/${encodeURIComponent(key)}?${parameters.toString()}`;
}

/**
 * Accepts one route-matched published page. The server loader follows the
 * opaque cursor and merges every validated page before projection.
 */
export function parseLeaderboardRouteLiveEnvelope(
  candidate: unknown,
  key: LeaderboardKey,
  profile: WorkloadProfile,
): LeaderboardRouteLiveEnvelope {
  if (!isWorkloadProfile(profile)) fail("uses an unsupported workload profile");
  const envelope = record(candidate, "envelope");
  if (!nonEmptyString(envelope.revision)
    || !isCanonicalIsoTimestamp(envelope.publishedAt)
    || !isFreshness(envelope.freshness)
    || !Array.isArray(envelope.attribution)
    || !envelope.attribution.every(isAttribution)) {
    fail("has invalid publication metadata");
  }

  const data = record(envelope.data, "data");
  if (data.key !== key || data.profile !== profile || !isExpectedDefinition(data.definition, key)) {
    fail("does not match the requested route");
  }
  if (!Array.isArray(data.entries)) fail("does not contain leaderboard entries");
  const definition = LEADERBOARD_DEFINITIONS[key];
  const entries = data.entries as readonly unknown[];
  if (!entries.every((entry) => isLeaderboardEntryForRoute(entry, definition, profile))) {
    fail("contains invalid route entries");
  }
  const typedEntries = entries as readonly LeaderboardEntry[];
  if (new Set(typedEntries.map((entry) => entry.model.modelKey)).size !== typedEntries.length) {
    fail("contains duplicate model identities");
  }
  const pagination = record(data.pagination, "data.pagination");
  if (pagination.limit !== LEADERBOARD_ROUTE_LIVE_LIMIT
    || !Number.isSafeInteger(pagination.total)
    || (pagination.total as number) < 0
    || (pagination.total as number) > 4_096
    || !(pagination.nextCursor === null || isOpaqueLeaderboardCursor(pagination.nextCursor))
    || (pagination.total as number) < typedEntries.length) {
    fail("has invalid leaderboard pagination");
  }
  const expectedCapabilities = createLeaderboardQueryCapabilities(definition, typedEntries);
  if (!pageCapabilitiesCoverEntries(data.capabilities, expectedCapabilities)) {
    fail("has capabilities that do not match the published route entries");
  }
  const attribution = envelope.attribution as readonly LeaderboardRouteAttribution[];
  if (!responseSourcesCoverEntries(attribution, typedEntries)) {
    fail("is missing source attribution for a displayed fact");
  }
  return envelope as unknown as LeaderboardRouteLiveEnvelope;
}

export function mergeLeaderboardRouteLiveEnvelopes(
  pages: readonly LeaderboardRouteLiveEnvelope[],
): LeaderboardRouteLiveEnvelope {
  const first = pages[0];
  if (first === undefined) fail("has no pages to merge");
  const entries = pages.flatMap((page) => page.data.entries);
  const attribution = [...new Map(pages
    .flatMap((page) => page.attribution)
    .map((source) => [`${source.sourceId}\u0000${source.url}\u0000${source.updatedAt}`, source] as const))
    .values()];
  const expectedTotal = first.data.pagination.total;
  if (pages.some((page) => (
    page.revision !== first.revision
    || page.publishedAt !== first.publishedAt
    || page.data.key !== first.data.key
    || page.data.profile !== first.data.profile
    || page.data.pagination.total !== expectedTotal
  ))) fail("changed while paginated results were loading");
  if (entries.length !== expectedTotal || new Set(entries.map((entry) => entry.model.modelKey)).size !== entries.length) {
    fail("did not yield one complete unique paginated result");
  }
  return {
    ...first,
    attribution,
    data: {
      ...first.data,
      entries,
      pagination: { limit: LEADERBOARD_ROUTE_LIVE_LIMIT, total: expectedTotal, nextCursor: null },
      capabilities: createLeaderboardQueryCapabilities(first.data.definition, entries),
    },
  };
}

function toProvenance(
  source: LeaderboardRouteAttribution,
  envelope: LeaderboardRouteLiveEnvelope,
): Provenance {
  return {
    id: `${source.sourceId}:${envelope.revision}`,
    label: source.label,
    kind: "accepted_pipeline",
    effectiveAt: source.updatedAt,
    note: `${envelope.freshness.status} published revision ${envelope.revision}; checked ${envelope.freshness.checkedAt}; ${source.url}`,
  };
}

function sourceProvenance(
  envelope: LeaderboardRouteLiveEnvelope,
  id: BenchmarkSourceId,
): Provenance {
  const source = envelope.attribution.find((candidate) => candidate.sourceId === id);
  if (!source) throw new TypeError(`Published leaderboard response is missing ${id} attribution.`);
  return toProvenance(source, envelope);
}

function available<T>(value: T, provenance: Provenance): EvidenceValue<T> {
  return { availability: "available", value, provenance };
}

function unavailable<T>(reason: string, provenance?: Provenance): EvidenceValue<T> {
  return provenance === undefined
    ? { availability: "unavailable", reason }
    : { availability: "unavailable", reason, provenance };
}

function accessFor(model: BenchmarkModel, provenance: Provenance): EvidenceValue<ModelAccess> {
  if (model.sourceType === "Open Weight") return available("Open weights", provenance);
  if (model.sourceType === "Proprietary") return available("Proprietary", provenance);
  return unavailable("The published model source does not declare weight access.", provenance);
}

function capabilityFor(
  entry: LeaderboardEntry,
  envelope: LeaderboardRouteLiveEnvelope,
): EvidenceValue<ModelCapability> {
  const metric = entry.metric;
  if (metric === null) return unavailable("This route publishes pricing and context, not a capability score.");
  const provenance = sourceProvenance(envelope, metric.sourceId);
  return available({
    compositeScore: metric.value,
    radar: entry.metrics.map((candidate) => ({
      key: candidate.metricKey,
      label: candidate.category,
      percentile: candidate.value,
      rank: candidate.rank,
      fieldSize: candidate.rankFieldSize ?? null,
    })),
  }, provenance);
}

function nullableNumberEvidence(
  value: number | null,
  reason: string,
  provenance: Provenance,
): EvidenceValue<number> {
  return value === null ? unavailable(reason, provenance) : available(value, provenance);
}

function routePricingFor(
  entry: LeaderboardEntry,
  envelope: LeaderboardRouteLiveEnvelope,
): EvidenceValue<RoutePricing> {
  const price = entry.primaryPrice;
  if (price === null || price.inputUsdPerMillion === null || price.outputUsdPerMillion === null) {
    return unavailable("No complete selected-route price is published for this model.");
  }
  const provenance = sourceProvenance(envelope, price.sourceId);
  const cache: EvidenceValue<CachePricing> = price.cachedInputUsdPerMillion === null
    ? unavailable("No published cache price is available for this route.", provenance)
    : available({
      readUsdPerMillion: available(price.cachedInputUsdPerMillion, provenance),
      writeUsdPerMillion: unavailable("The published route does not declare a cache-write price.", provenance),
    }, provenance);
  return available({
    route: price.routeId,
    inputUsdPerMillion: price.inputUsdPerMillion,
    outputUsdPerMillion: price.outputUsdPerMillion,
    contextWindowTokens: nullableNumberEvidence(
      entry.contextWindowTokens,
      "The selected route does not publish a context window.",
      provenance,
    ),
    maxOutputTokens: nullableNumberEvidence(
      price.maxOutputTokens ?? null,
      "The selected route does not publish a maximum output limit.",
      provenance,
    ),
    inputModalities: price.inputModalities ?? [],
    outputModalities: price.outputModalities ?? [],
    blendedUsdPerMillion: nullableNumberEvidence(
      entry.blendedCostPerMillion,
      "No published workload-blended route price is available.",
      provenance,
    ),
    longContextInputUsdPerMillion: unavailable(
      "The published route does not declare a long-context input price.",
      provenance,
    ),
    cache,
  }, provenance);
}

function modelFor(entry: LeaderboardEntry, envelope: LeaderboardRouteLiveEnvelope): PreviewModel {
  const modelProvenance = sourceProvenance(envelope, entry.model.sourceId);
  const metricProvenance = entry.metric === null
    ? modelProvenance
    : sourceProvenance(envelope, entry.metric.sourceId);
  return {
    // Public links must use the published canonical route slug, but only when
    // this row proves the exact source-key identity that maps to it. A similar
    // display name or source-model ID is not enough to normalize safely.
    id: entry.model.modelKey === `source:${entry.model.sourceId}:${entry.model.sourceModelId}`
      && isModelSlugRouteSafe(entry.model.slug)
      ? entry.model.slug
      : entry.model.modelKey,
    identity: available({
      slug: entry.model.slug,
      name: entry.model.name,
      provider: entry.model.creator,
    }, modelProvenance),
    access: accessFor(entry.model, modelProvenance),
    benchmark: unavailable("This endpoint does not publish a reusable benchmark-release receipt.", metricProvenance),
    capability: capabilityFor(entry, envelope),
    routePricing: routePricingFor(entry, envelope),
    taskEconomics: unavailable("This endpoint does not publish task-economics evidence.", metricProvenance),
    runtime: unavailable("This endpoint does not publish runtime evidence.", metricProvenance),
    lifecycle: unavailable("This endpoint does not publish lifecycle evidence.", modelProvenance),
  };
}

/**
 * Adapts only declared per-key endpoint fields to the existing detail-page
 * contract. Null remains unavailable evidence; ranks and Pareto membership
 * remain server-published rather than being calculated from row position.
 */
export function projectLeaderboardRouteLiveEnvelope(
  envelope: LeaderboardRouteLiveEnvelope,
): UiDataContractV1<RankingData> {
  const models: readonly RankingEntry[] = envelope.data.entries.map((entry) => {
    const rankProvenance = entry.metric === null
      ? sourceProvenance(envelope, entry.model.sourceId)
      : sourceProvenance(envelope, entry.metric.sourceId);
    return {
      model: modelFor(entry, envelope),
      rank: nullableNumberEvidence(
        entry.sourceRank,
        "No published source rank is available for this route row.",
        rankProvenance,
      ),
      ...(entry.sourceRank === null ? {} : { sourceRank: entry.sourceRank }),
      aggregate: {
        costPerSuccessfulEvaluationUsd: unavailable(
          "This endpoint does not publish cost per successful evaluation.",
          rankProvenance,
        ),
        meanOutputTokens: unavailable(
          "This endpoint does not publish mean output tokens.",
          rankProvenance,
        ),
        pareto: entry.onValueFrontier,
      },
    };
  });
  const reason = envelope.freshness.status === "stale"
    ? envelope.freshness.message ?? "Published benchmark data is stale."
    : undefined;
  return {
    contractVersion: "ui-data-contract/v1",
    status: envelope.freshness.status === "fresh" ? "available" : "partial",
    ...(reason === undefined ? {} : { reason }),
    fetchedAt: envelope.freshness.checkedAt,
    effectiveAt: envelope.publishedAt,
    data: {
      models,
      total: envelope.data.pagination?.total,
      nextCursor: envelope.data.pagination?.nextCursor,
    },
    provenance: envelope.attribution.map((source) => toProvenance(source, envelope)),
  };
}
