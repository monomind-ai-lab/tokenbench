export const BENCHMARK_SOURCE_IDS = ['benchlm', 'lmarena', 'litellm', 'openrouter'] as const;
/** Bump when derived benchmark records or their public route semantics change. */
export const BENCHMARK_DERIVATION_SCHEMA_VERSION = '1';

export type BenchmarkSourceId = typeof BENCHMARK_SOURCE_IDS[number];
export type EvidenceStatus = 'supported' | 'estimated' | 'source_only';
export type MetricUnit = 'score' | 'arena_score' | 'rank' | 'usd_per_million_tokens' | 'tokens';
export type BenchmarkMethodology = 'benchlm_raw_composite' | 'bradley_terry' | 'ips';
export type BenchmarkLicenseId = 'MIT' | 'CC-BY-4.0' | 'OpenRouter-ToS';
export type BenchmarkPublicationState = 'pending' | 'published' | 'superseded' | 'failed';

/**
 * Matches SQLite BINARY ordering for UTF-8 text, including model keys that
 * contain non-ASCII code points. Comparison-pair persistence and SSR must
 * share this rule so their canonical A/B orientation cannot drift.
 */
export function compareUtf8Binary(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] < rightBytes[index] ? -1 : 1;
  }
  return leftBytes.length === rightBytes.length ? 0 : leftBytes.length < rightBytes.length ? -1 : 1;
}

/**
 * Immutable revision metadata. `catalogRevision` and `openrouterContentHash`
 * bind price-route evidence to the exact sanitized catalog revision used when
 * this benchmark revision was published.
 */
export interface BenchmarkRevision {
  revision: string;
  generatedAt: string;
  publishedAt: string | null;
  checkedAt: string;
  publicationState: BenchmarkPublicationState;
  contentHash: string;
  catalogRevision: string;
  openrouterContentHash: string;
}

export interface BenchmarkModel {
  modelKey: string;
  slug: string;
  name: string;
  creator: string;
  sourceType: 'Proprietary' | 'Open Weight' | 'Unknown';
  reasoningType: string | null;
  releaseDate: string | null;
  contextWindowTokens: number | null;
  evidenceStatus: EvidenceStatus;
  rankingEligible: boolean;
  confidenceLower: number | null;
  confidenceUpper: number | null;
  benchmarkCount: number;
  sourceId: BenchmarkSourceId;
  sourceModelId: string;
  sourceArtifactId: string;
}

export interface BenchmarkMetric {
  modelKey: string;
  metricKey: string;
  category: string;
  value: number;
  rank: number | null;
  lower: number | null;
  upper: number | null;
  voteCount: number | null;
  unit: MetricUnit;
  sourceId: BenchmarkSourceId;
  sourceUpdatedAt: string;
  sourceModelId: string;
  sourceArtifactId: string;
  rankingEligible: boolean;
  methodology: BenchmarkMethodology;
  observationCount: number | null;
  sessionCount: number | null;
}

/** One immutable upstream artifact, never an aggregate source summary. */
export interface BenchmarkSourceRecord {
  sourceId: BenchmarkSourceId;
  artifactId: string;
  sourceUrl: string;
  observedAt: string;
  etag: string | null;
  lastModified: string | null;
  upstreamRevision: string | null;
  schemaVersion: string | null;
  snapshotKey: string;
  /** SHA-256 of the exact sanitized snapshot bytes referenced by snapshotKey. */
  contentHash: string;
  /** SHA-256 of the original upstream response before allowlist projection. */
  originalContentHash: string;
  licenseId: BenchmarkLicenseId;
  attributionText: string;
}

export interface BenchmarkPriceCheck {
  modelKey: string;
  sourceId: BenchmarkSourceId;
  providerId: string;
  inputUsdPerMillion: number | null;
  cachedInputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  contextWindowTokens: number | null;
  verificationStatus: 'primary' | 'corroborating' | 'conflict';
  routeId: string;
  sourceModelId: string;
  canonicalSlug: string | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  inputModalities: readonly string[] | null;
  outputModalities: readonly string[] | null;
  supportedParameters: readonly string[] | null;
  sourceArtifactId: string;
}

export interface ComparisonSeed {
  pairSlug: string;
  modelAKey: string;
  modelBKey: string;
  sourceId: BenchmarkSourceId;
  sourceArtifactId: string;
  sourceModelAId: string;
  sourceModelBId: string;
  featuredRank: number | null;
}

export interface BenchmarkComparisonPair {
  pairSlug: string;
  modelAKey: string;
  modelBKey: string;
  indexable: boolean;
  eligibilityReason: string;
  featuredRank: number | null;
  sharedMetricCount: number;
}

const COMPARISON_PAIR_ROUTE_UNSAFE = /[\u0000-\u001f\u007f/]/;

export interface ResolvedComparisonPair {
  readonly modelA: BenchmarkModel;
  readonly modelB: BenchmarkModel;
  readonly canonicalPairSlug: string;
}

export type ComparisonPairSlugResolver = (pairSlug: string) => ResolvedComparisonPair | null;

/**
 * Only public, single-segment comparison routes may be indexed. Literal
 * query and fragment characters are allowed because callers encode them,
 * while slashes, controls, and unencodable surrogate values are not.
 */
export function isComparisonPairRouteSafe(pairSlug: string): boolean {
  if (pairSlug.length === 0 || COMPARISON_PAIR_ROUTE_UNSAFE.test(pairSlug)) return false;
  try {
    encodeURIComponent(pairSlug);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a route exactly as the Pages handler does. Model slugs may include
 * `-vs-`, so every separator is considered and ambiguity is rejected.
 */
export function createComparisonPairSlugResolver(models: readonly BenchmarkModel[]): ComparisonPairSlugResolver {
  const modelsBySlug = new Map<string, BenchmarkModel>();
  for (const model of models) {
    if (modelsBySlug.has(model.slug)) return () => null;
    modelsBySlug.set(model.slug, model);
  }

  return (pairSlug) => {
    if (!isComparisonPairRouteSafe(pairSlug)) return null;
    const candidates: Array<{ readonly left: BenchmarkModel; readonly right: BenchmarkModel }> = [];
    let splitAt = pairSlug.indexOf('-vs-');
    while (splitAt >= 0) {
      const left = modelsBySlug.get(pairSlug.slice(0, splitAt));
      const right = modelsBySlug.get(pairSlug.slice(splitAt + 4));
      if (left && right && left.modelKey !== right.modelKey) candidates.push({ left, right });
      splitAt = pairSlug.indexOf('-vs-', splitAt + 1);
    }
    if (candidates.length !== 1) return null;

    const candidate = candidates[0];
    const [modelA, modelB] = compareUtf8Binary(candidate.left.modelKey, candidate.right.modelKey) < 0
      ? [candidate.left, candidate.right]
      : [candidate.right, candidate.left];
    return {
      modelA,
      modelB,
      canonicalPairSlug: `${modelA.slug}-vs-${modelB.slug}`,
    };
  };
}

export function resolveComparisonPairSlug(
  models: readonly BenchmarkModel[],
  pairSlug: string,
): ResolvedComparisonPair | null {
  return createComparisonPairSlugResolver(models)(pairSlug);
}

/**
 * Indexable persistence is only valid when the exact public route resolves to
 * the same canonical models. Nonindexable rows intentionally remain usable as
 * internal/utility pair records even if no public route can serve them.
 */
export function validateIndexableComparisonPairRoute(
  models: readonly BenchmarkModel[],
  pair: BenchmarkComparisonPair,
  resolvePairSlug: ComparisonPairSlugResolver = createComparisonPairSlugResolver(models),
): void {
  if (!pair.indexable) return;
  if (!isComparisonPairRouteSafe(pair.pairSlug)) {
    fail('indexable pairSlug must be a route-safe URL segment');
  }
  const resolved = resolvePairSlug(pair.pairSlug);
  if (!resolved) fail(`indexable comparison pair ${pair.pairSlug} must resolve uniquely through the comparison route`);
  if (resolved.modelA.modelKey !== pair.modelAKey
    || resolved.modelB.modelKey !== pair.modelBKey
    || resolved.canonicalPairSlug !== pair.pairSlug) {
    fail(`indexable comparison pair ${pair.pairSlug} must use its active models' canonical route`);
  }
}

export interface NormalizedSourceBatch {
  sources: BenchmarkSourceRecord[];
  models: BenchmarkModel[];
  metrics: BenchmarkMetric[];
  priceChecks: BenchmarkPriceCheck[];
  comparisonSeeds: ComparisonSeed[];
}

const sourceLicenses: Record<BenchmarkSourceId, BenchmarkLicenseId> = {
  benchlm: 'MIT',
  lmarena: 'CC-BY-4.0',
  litellm: 'MIT',
  openrouter: 'OpenRouter-ToS',
};

function fail(message: string): never {
  throw new Error(message);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${name} must be a non-empty string`);
}

function requireBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') fail(`${name} must be a boolean`);
}

function requireFiniteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${name} must be a finite number`);
}

function requireNonNegativeFiniteNumber(value: unknown, name: string): asserts value is number {
  requireFiniteNumber(value, name);
  if (value < 0) fail(`${name} must be a non-negative finite number`);
}

function requireNonNegativeInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${name} must be a non-negative integer`);
}

function requireNullableNonNegativeInteger(value: unknown, name: string): void {
  if (value === null) return;
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${name} must be a non-negative integer or null`);
}

function requireNullablePositiveInteger(value: unknown, name: string): void {
  if (value === null) return;
  if (!Number.isInteger(value) || (value as number) < 1) fail(`${name} must be a positive integer or null`);
}

function requireNullableNonNegativeFiniteNumber(value: unknown, name: string): void {
  if (value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${name} must be a finite number or null`);
  if (value < 0) fail(`${name} must be a non-negative finite number or null`);
}

function requireNullableString(value: unknown, name: string): void {
  if (value === null) return;
  requireString(value, name);
}

function requireSha256(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(`${name} must be a sha256: digest`);
  }
}

function requireIsoTimestamp(value: unknown, name: string): void {
  requireString(value, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${name} must be a finite ISO timestamp`);
  }
}

function requireHttpsUrl(value: unknown, name: string): void {
  requireString(value, name);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') fail(`${name} must be an https URL`);
  } catch {
    fail(`${name} must be an https URL`);
  }
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, '');
}

function assertNoProhibitedText(value: string, name: string): void {
  if (compact(value).includes('artificialanalysis')) {
    fail(`${name} contains prohibited Artificial Analysis data`);
  }
}

function assertNoProhibitedIdentifier(value: string, name: string): void {
  assertNoProhibitedText(value, name);
  const identifierParts = value.trim().toLowerCase().split(/[:/]/);
  if (identifierParts.some((part) => /^aa(?:[-_]|$)/.test(part))) {
    fail(`${name} contains a prohibited Artificial Analysis identifier`);
  }
}

function requireIdentifier(value: unknown, name: string): asserts value is string {
  requireString(value, name);
  assertNoProhibitedText(value, name);
}

function requireBenchmarkIdentifier(value: unknown, name: string): asserts value is string {
  requireString(value, name);
  assertNoProhibitedIdentifier(value, name);
}

function requireBenchmarkDefinitionKey(value: unknown, name: string): asserts value is string {
  requireBenchmarkIdentifier(value, name);
  const namespaceParts = value.trim().toLowerCase().split(/[:/]/);
  if (namespaceParts.some((part) => part.startsWith('aa'))) {
    fail(`${name} contains a prohibited Artificial Analysis identifier`);
  }
}

function requireSourceId(value: unknown, name: string): asserts value is BenchmarkSourceId {
  requireIdentifier(value, name);
  if (/^aa(?:[-_:]|$)/i.test(value)) fail(`${name} contains a prohibited Artificial Analysis identifier`);
  if (!(BENCHMARK_SOURCE_IDS as readonly string[]).includes(value)) fail(`${name} is invalid`);
}

function requireNullableStringArray(value: unknown, name: string): void {
  if (value === null) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    fail(`${name} must be an array of non-empty strings or null`);
  }
  value.forEach((item, index) => assertNoProhibitedText(item, `${name}[${index}]`));
}

function requireNullableInterval(
  lower: unknown,
  upper: unknown,
  name: string,
  lowerName: string,
  upperName: string,
  allowNegative = false,
): void {
  if (lower === null && upper === null) return;
  if (typeof lower !== 'number' || !Number.isFinite(lower) || typeof upper !== 'number' || !Number.isFinite(upper)) {
    fail(`${name} confidence bounds must both be null or finite numbers`);
  }
  if (!allowNegative && lower < 0) fail(`${lowerName} must be a non-negative finite number`);
  if (!allowNegative && upper < 0) fail(`${upperName} must be a non-negative finite number`);
  if (lower > upper) fail(`${lowerName} must be less than or equal to ${upperName}`);
}

function artifactIdentity(sourceId: BenchmarkSourceId, artifactId: string): string {
  return `${sourceId}\u0000${artifactId}`;
}

function requireKnownArtifact(
  sourceArtifacts: Set<string>,
  sourceId: BenchmarkSourceId,
  artifactId: unknown,
  name: string,
): void {
  requireIdentifier(artifactId, `${name}.sourceArtifactId`);
  if (!sourceArtifacts.has(artifactIdentity(sourceId, artifactId))) {
    fail(`${name}.sourceArtifactId must refer to a source artifact for ${sourceId}`);
  }
}

function validateSourceRecord(value: unknown, index: number, sourceArtifacts: Set<string>): BenchmarkSourceRecord {
  const name = `sources[${index}]`;
  const source = requireRecord(value, name) as unknown as BenchmarkSourceRecord;
  requireSourceId(source.sourceId, `${name}.sourceId`);
  requireBenchmarkIdentifier(source.artifactId, `${name}.artifactId`);
  requireHttpsUrl(source.sourceUrl, `${name}.sourceUrl`);
  assertNoProhibitedText(source.sourceUrl, `${name}.sourceUrl`);
  requireIsoTimestamp(source.observedAt, `${name}.observedAt`);
  for (const key of ['etag', 'lastModified', 'upstreamRevision', 'schemaVersion'] as const) {
    requireNullableString(source[key], `${name}.${key}`);
    if (source[key] !== null) assertNoProhibitedText(source[key], `${name}.${key}`);
  }
  for (const key of ['snapshotKey', 'attributionText'] as const) {
    requireString(source[key], `${name}.${key}`);
    assertNoProhibitedText(source[key], `${name}.${key}`);
  }
  requireSha256(source.contentHash, `${name}.contentHash`);
  requireSha256(source.originalContentHash, `${name}.originalContentHash`);
  if (!['MIT', 'CC-BY-4.0', 'OpenRouter-ToS'].includes(source.licenseId)) fail(`${name}.licenseId is invalid`);
  if (source.licenseId !== sourceLicenses[source.sourceId]) fail(`${name}.licenseId does not match ${source.sourceId}`);

  const identity = artifactIdentity(source.sourceId, source.artifactId);
  if (sourceArtifacts.has(identity)) fail(`Duplicate source artifact: ${source.sourceId}/${source.artifactId}`);
  sourceArtifacts.add(identity);
  return source;
}

function validateModel(
  value: unknown,
  index: number,
  sourceArtifacts: Set<string>,
): BenchmarkModel {
  const name = `models[${index}]`;
  const model = requireRecord(value, name) as unknown as BenchmarkModel;
  for (const key of ['modelKey', 'slug', 'sourceModelId'] as const) requireIdentifier(model[key], `${name}.${key}`);
  for (const key of ['name', 'creator'] as const) {
    requireString(model[key], `${name}.${key}`);
    assertNoProhibitedText(model[key], `${name}.${key}`);
  }
  if (!['Proprietary', 'Open Weight', 'Unknown'].includes(model.sourceType)) fail(`${name}.sourceType is invalid`);
  requireNullableString(model.reasoningType, `${name}.reasoningType`);
  if (model.reasoningType !== null) assertNoProhibitedText(model.reasoningType, `${name}.reasoningType`);
  requireNullableString(model.releaseDate, `${name}.releaseDate`);
  requireNullablePositiveInteger(model.contextWindowTokens, `${name}.contextWindowTokens`);
  if (!['supported', 'estimated', 'source_only'].includes(model.evidenceStatus)) fail(`${name}.evidenceStatus is invalid`);
  requireBoolean(model.rankingEligible, `${name}.rankingEligible`);
  requireNullableInterval(
    model.confidenceLower,
    model.confidenceUpper,
    name,
    `${name}.confidenceLower`,
    `${name}.confidenceUpper`,
  );
  requireNonNegativeInteger(model.benchmarkCount, `${name}.benchmarkCount`);
  requireSourceId(model.sourceId, `${name}.sourceId`);
  requireKnownArtifact(sourceArtifacts, model.sourceId, model.sourceArtifactId, name);
  return model;
}

function validateMetric(
  value: unknown,
  index: number,
  sourceArtifacts: Set<string>,
  modelKeys: Set<string>,
): BenchmarkMetric {
  const name = `metrics[${index}]`;
  const metric = requireRecord(value, name) as unknown as BenchmarkMetric;
  for (const key of ['modelKey', 'sourceModelId'] as const) requireIdentifier(metric[key], `${name}.${key}`);
  requireBenchmarkDefinitionKey(metric.metricKey, `${name}.metricKey`);
  requireBenchmarkIdentifier(metric.category, `${name}.category`);
  if (!modelKeys.has(metric.modelKey)) fail(`${name}.modelKey must refer to a model`);
  if (!['benchlm_raw_composite', 'bradley_terry', 'ips'].includes(metric.methodology)) fail(`${name}.methodology is invalid`);
  // Agent Arena's IPS estimator is centered around zero, so valid scores and
  // confidence bounds may be negative. Capability and Arena-rating metrics may not.
  const allowsSignedScores = metric.methodology === 'ips';
  requireFiniteNumber(metric.value, `${name}.value`);
  if (!allowsSignedScores && metric.value < 0) {
    fail(`${name}.value must be a non-negative finite number`);
  }
  requireNullablePositiveInteger(metric.rank, `${name}.rank`);
  requireNullableInterval(
    metric.lower,
    metric.upper,
    name,
    `${name}.lower`,
    `${name}.upper`,
    allowsSignedScores,
  );
  requireNullableNonNegativeInteger(metric.voteCount, `${name}.voteCount`);
  if (!['score', 'arena_score', 'rank', 'usd_per_million_tokens', 'tokens'].includes(metric.unit)) fail(`${name}.unit is invalid`);
  requireSourceId(metric.sourceId, `${name}.sourceId`);
  requireIsoTimestamp(metric.sourceUpdatedAt, `${name}.sourceUpdatedAt`);
  requireKnownArtifact(sourceArtifacts, metric.sourceId, metric.sourceArtifactId, name);
  requireBoolean(metric.rankingEligible, `${name}.rankingEligible`);
  requireNullableNonNegativeInteger(metric.observationCount, `${name}.observationCount`);
  requireNullableNonNegativeInteger(metric.sessionCount, `${name}.sessionCount`);
  if (metric.methodology === 'benchlm_raw_composite' && metric.sourceId !== 'benchlm') {
    fail(`${name}.methodology benchlm_raw_composite requires sourceId benchlm`);
  }
  if ((metric.methodology === 'bradley_terry' || metric.methodology === 'ips') && metric.sourceId !== 'lmarena') {
    fail(`${name}.methodology ${metric.methodology} requires sourceId lmarena`);
  }
  if (metric.methodology !== 'bradley_terry' && metric.voteCount !== null) {
    fail(`${name}.voteCount is only valid for bradley_terry`);
  }
  if (metric.methodology !== 'ips' && (metric.observationCount !== null || metric.sessionCount !== null)) {
    fail(`${name}.observationCount and ${name}.sessionCount are only valid for ips`);
  }
  return metric;
}

function validatePriceCheck(
  value: unknown,
  index: number,
  sourceArtifacts: Set<string>,
  modelKeys: Set<string>,
): BenchmarkPriceCheck {
  const name = `priceChecks[${index}]`;
  const price = requireRecord(value, name) as unknown as BenchmarkPriceCheck;
  for (const key of ['modelKey', 'providerId', 'routeId', 'sourceModelId'] as const) requireIdentifier(price[key], `${name}.${key}`);
  if (!modelKeys.has(price.modelKey)) fail(`${name}.modelKey must refer to a model`);
  requireSourceId(price.sourceId, `${name}.sourceId`);
  requireNullableNonNegativeFiniteNumber(price.inputUsdPerMillion, `${name}.inputUsdPerMillion`);
  requireNullableNonNegativeFiniteNumber(price.cachedInputUsdPerMillion, `${name}.cachedInputUsdPerMillion`);
  requireNullableNonNegativeFiniteNumber(price.outputUsdPerMillion, `${name}.outputUsdPerMillion`);
  requireNullablePositiveInteger(price.contextWindowTokens, `${name}.contextWindowTokens`);
  if (!['primary', 'corroborating', 'conflict'].includes(price.verificationStatus)) fail(`${name}.verificationStatus is invalid`);
  requireNullableString(price.canonicalSlug, `${name}.canonicalSlug`);
  if (price.canonicalSlug !== null) assertNoProhibitedIdentifier(price.canonicalSlug, `${name}.canonicalSlug`);
  requireNullablePositiveInteger(price.maxInputTokens, `${name}.maxInputTokens`);
  requireNullablePositiveInteger(price.maxOutputTokens, `${name}.maxOutputTokens`);
  for (const key of ['inputModalities', 'outputModalities', 'supportedParameters'] as const) {
    requireNullableStringArray(price[key], `${name}.${key}`);
  }
  requireKnownArtifact(sourceArtifacts, price.sourceId, price.sourceArtifactId, name);
  return price;
}

function validateComparisonSeed(
  value: unknown,
  index: number,
  sourceArtifacts: Set<string>,
  modelsByKey: Map<string, BenchmarkModel>,
): ComparisonSeed {
  const name = `comparisonSeeds[${index}]`;
  const seed = requireRecord(value, name) as unknown as ComparisonSeed;
  for (const key of ['pairSlug', 'modelAKey', 'modelBKey', 'sourceModelAId', 'sourceModelBId'] as const) {
    requireIdentifier(seed[key], `${name}.${key}`);
  }
  const modelA = modelsByKey.get(seed.modelAKey);
  const modelB = modelsByKey.get(seed.modelBKey);
  if (!modelA || !modelB) fail(`${name} model keys must refer to models`);
  if (compareUtf8Binary(seed.modelAKey, seed.modelBKey) >= 0) fail(`${name}.modelAKey must sort before ${name}.modelBKey`);
  if (seed.pairSlug !== `${modelA.slug}-vs-${modelB.slug}`) fail(`${name}.pairSlug must use canonical model slugs`);
  requireSourceId(seed.sourceId, `${name}.sourceId`);
  requireKnownArtifact(sourceArtifacts, seed.sourceId, seed.sourceArtifactId, name);
  requireNullablePositiveInteger(seed.featuredRank, `${name}.featuredRank`);
  return seed;
}

/**
 * Rejects unsafe or incomplete evidence before a source parser can publish it.
 * The original batch is returned so deliberate nulls and literal zero prices
 * remain distinguishable to every later derivation.
 */
export function validateNormalizedSourceBatch(value: unknown): NormalizedSourceBatch {
  const batch = requireRecord(value, 'benchmark batch') as unknown as NormalizedSourceBatch;
  if (!Array.isArray(batch.sources) || !Array.isArray(batch.models) || !Array.isArray(batch.metrics)
    || !Array.isArray(batch.priceChecks) || !Array.isArray(batch.comparisonSeeds)) {
    fail('benchmark batch collections must be arrays');
  }

  const sourceArtifacts = new Set<string>();
  batch.sources.forEach((source, index) => validateSourceRecord(source, index, sourceArtifacts));

  const modelsByKey = new Map<string, BenchmarkModel>();
  const slugs = new Set<string>();
  batch.models.forEach((record, index) => {
    const model = validateModel(record, index, sourceArtifacts);
    if (modelsByKey.has(model.modelKey)) fail(`Duplicate model key: ${model.modelKey}`);
    if (slugs.has(model.slug)) fail(`Duplicate model slug: ${model.slug}`);
    modelsByKey.set(model.modelKey, model);
    slugs.add(model.slug);
  });
  const modelKeys = new Set(modelsByKey.keys());

  const metricIdentities = new Set<string>();
  batch.metrics.forEach((record, index) => {
    const metric = validateMetric(record, index, sourceArtifacts, modelKeys);
    const identity = `${metric.modelKey}\u0000${metric.metricKey}`;
    if (metricIdentities.has(identity)) fail(`Duplicate metric identity: ${metric.modelKey}/${metric.metricKey}`);
    metricIdentities.add(identity);
  });

  const priceIdentities = new Set<string>();
  batch.priceChecks.forEach((record, index) => {
    const price = validatePriceCheck(record, index, sourceArtifacts, modelKeys);
    const identity = `${price.modelKey}\u0000${price.sourceId}\u0000${price.providerId}\u0000${price.routeId}`;
    if (priceIdentities.has(identity)) {
      fail(`Duplicate price-check identity: ${price.modelKey}/${price.sourceId}/${price.providerId}/${price.routeId}`);
    }
    priceIdentities.add(identity);
  });

  const pairSlugs = new Set<string>();
  const pairIdentities = new Set<string>();
  batch.comparisonSeeds.forEach((record, index) => {
    const seed = validateComparisonSeed(record, index, sourceArtifacts, modelsByKey);
    if (pairSlugs.has(seed.pairSlug)) fail(`Duplicate comparison pair slug: ${seed.pairSlug}`);
    const identity = `${seed.modelAKey}\u0000${seed.modelBKey}`;
    if (pairIdentities.has(identity)) fail(`Duplicate comparison identity: ${seed.modelAKey}/${seed.modelBKey}`);
    pairSlugs.add(seed.pairSlug);
    pairIdentities.add(identity);
  });

  return batch;
}

/**
 * Enforces the minimum persistence invariant for derived comparison rows.
 * Publication must additionally enforce supported models, ranking eligibility,
 * safe shared categories, prohibited-metric rejection, and reviewed seeding.
 */
export function validateBenchmarkComparisonPair(value: unknown): BenchmarkComparisonPair {
  const pair = requireRecord(value, 'comparison pair') as unknown as BenchmarkComparisonPair;
  for (const key of ['pairSlug', 'modelAKey', 'modelBKey'] as const) {
    requireIdentifier(pair[key], key);
  }
  if (compareUtf8Binary(pair.modelAKey, pair.modelBKey) >= 0) fail('modelAKey must sort before modelBKey');
  requireBoolean(pair.indexable, 'indexable');
  requireString(pair.eligibilityReason, 'eligibilityReason');
  assertNoProhibitedText(pair.eligibilityReason, 'eligibilityReason');
  requireNullablePositiveInteger(pair.featuredRank, 'featuredRank');
  requireNonNegativeInteger(pair.sharedMetricCount, 'sharedMetricCount');
  if (pair.indexable && pair.sharedMetricCount < 2) {
    fail('sharedMetricCount must be at least 2 when indexable');
  }
  if (pair.indexable && !isComparisonPairRouteSafe(pair.pairSlug)) {
    fail('indexable pairSlug must be a route-safe URL segment');
  }
  return pair;
}
