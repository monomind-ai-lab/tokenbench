import {
  BENCHMARK_SOURCE_IDS,
  compareUtf8Binary,
  validateBenchmarkComparisonPair,
  validateIndexableComparisonPairRoute,
  validateNormalizedSourceBatch,
  type BenchmarkComparisonPair,
  type BenchmarkLicenseId,
  type BenchmarkMetric,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
  type BenchmarkPublicationState,
  type BenchmarkRevision,
  type BenchmarkSourceId,
  type BenchmarkSourceRecord,
} from '../../src/benchmarks/contracts';

export interface D1Statement {
  bind(...values: unknown[]): { all(): Promise<{ results: unknown[] }> };
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export interface BenchmarkApiEnv {
  CATALOG_DB?: D1Database;
}

export interface BenchmarkApiAttribution {
  readonly sourceId: BenchmarkSourceId;
  readonly label: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface BenchmarkApiEnvelope<T> {
  readonly revision: string;
  readonly publishedAt: string;
  readonly freshness: {
    readonly status: 'fresh' | 'stale';
    readonly checkedAt: string;
    readonly message?: string;
  };
  readonly attribution: readonly BenchmarkApiAttribution[];
  readonly data: T;
}

export type BenchmarkFreshness = BenchmarkApiEnvelope<never>['freshness'];

export interface ActiveBenchmarkSnapshot {
  readonly revision: BenchmarkRevision;
  readonly sources: readonly BenchmarkSourceRecord[];
  readonly models: readonly BenchmarkModel[];
  readonly metrics: readonly BenchmarkMetric[];
  readonly priceChecks: readonly BenchmarkPriceCheck[];
  readonly comparisonPairs: readonly BenchmarkComparisonPair[];
}

export interface EvidenceReference {
  readonly sourceId: BenchmarkSourceId;
  readonly sourceArtifactId: string;
}

const ACTIVE_REVISION_QUERY = `
  SELECT revisions.*
  FROM benchmark_publication_state AS publication
  INNER JOIN benchmark_revisions AS revisions ON revisions.revision = publication.active_revision
  WHERE publication.singleton = 1
    AND revisions.publication_state = 'published'
  LIMIT 1
`;

const FRESHNESS_WINDOW_MS = 36 * 60 * 60 * 1000;
const CACHE_CONTROL = 'public, max-age=0, must-revalidate';

function fail(message: string): never {
  throw new Error(message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown, label: string): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  fail(`${label} must be a D1 boolean`);
}

function parseNullableStringArray(value: unknown, label: string): readonly string[] | null {
  if (value === null) return null;
  if (typeof value !== 'string') fail(`${label} must be JSON or null`);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) fail(`${label} must be a JSON array`);
    return parsed as string[];
  } catch {
    fail(`${label} must be valid JSON`);
  }
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function requireTimestamp(value: unknown, label: string): string {
  if (!isIsoTimestamp(value)) fail(`${label} must be an ISO timestamp`);
  return value;
}

function requireNonBlankString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a sha256: digest`);
  }
  return value;
}

function mapRevision(value: unknown): BenchmarkRevision {
  const row = asRecord(value, 'benchmark revision');
  const publicationState = row.publication_state as BenchmarkPublicationState;
  const publishedAt = row.published_at as string | null;
  const revision: BenchmarkRevision = {
    revision: requireNonBlankString(row.revision, 'benchmark revision.revision'),
    generatedAt: requireTimestamp(row.generated_at, 'benchmark revision.generated_at'),
    publishedAt,
    checkedAt: requireTimestamp(row.checked_at, 'benchmark revision.checked_at'),
    publicationState,
    contentHash: requireSha256(row.content_hash, 'benchmark revision.content_hash'),
    catalogRevision: requireNonBlankString(row.catalog_revision, 'benchmark revision.catalog_revision'),
    openrouterContentHash: requireSha256(row.openrouter_content_hash, 'benchmark revision.openrouter_content_hash'),
  };
  if (revision.publicationState !== 'published') fail('active benchmark revision must be published');
  if (!isIsoTimestamp(publishedAt)) fail('published benchmark revision must have a published_at timestamp');
  return revision;
}

function mapSource(value: unknown): BenchmarkSourceRecord {
  const row = asRecord(value, 'benchmark source record');
  return {
    sourceId: row.source_id as BenchmarkSourceId,
    artifactId: row.artifact_id as string,
    sourceUrl: row.source_url as string,
    observedAt: row.observed_at as string,
    etag: row.etag as string | null,
    lastModified: row.last_modified as string | null,
    upstreamRevision: row.upstream_revision as string | null,
    schemaVersion: row.schema_version as string | null,
    snapshotKey: row.snapshot_key as string,
    contentHash: row.content_hash as string,
    originalContentHash: row.original_content_hash as string,
    licenseId: row.license_id as BenchmarkLicenseId,
    attributionText: row.attribution_text as string,
  };
}

function mapModel(value: unknown): BenchmarkModel {
  const row = asRecord(value, 'benchmark model');
  return {
    modelKey: row.model_key as string,
    slug: row.slug as string,
    name: row.name as string,
    creator: row.creator as string,
    sourceType: row.source_type as BenchmarkModel['sourceType'],
    reasoningType: row.reasoning_type as string | null,
    releaseDate: row.release_date as string | null,
    contextWindowTokens: row.context_window_tokens as number | null,
    evidenceStatus: row.evidence_status as BenchmarkModel['evidenceStatus'],
    rankingEligible: asBoolean(row.ranking_eligible, 'benchmark model.ranking_eligible'),
    confidenceLower: row.confidence_lower as number | null,
    confidenceUpper: row.confidence_upper as number | null,
    benchmarkCount: row.benchmark_count as number,
    sourceId: row.source_id as BenchmarkSourceId,
    sourceModelId: row.source_model_id as string,
    sourceArtifactId: row.source_artifact_id as string,
  };
}

function mapMetric(value: unknown): BenchmarkMetric {
  const row = asRecord(value, 'benchmark metric');
  return {
    modelKey: row.model_key as string,
    metricKey: row.metric_key as string,
    category: row.category as string,
    value: row.value as number,
    rank: row.rank as number | null,
    lower: row.lower_bound as number | null,
    upper: row.upper_bound as number | null,
    voteCount: row.vote_count as number | null,
    unit: row.unit as BenchmarkMetric['unit'],
    sourceId: row.source_id as BenchmarkSourceId,
    sourceUpdatedAt: row.source_updated_at as string,
    sourceModelId: row.source_model_id as string,
    sourceArtifactId: row.source_artifact_id as string,
    rankingEligible: asBoolean(row.ranking_eligible, 'benchmark metric.ranking_eligible'),
    methodology: row.methodology as BenchmarkMetric['methodology'],
    observationCount: row.observation_count as number | null,
    sessionCount: row.session_count as number | null,
  };
}

function mapPriceCheck(value: unknown): BenchmarkPriceCheck {
  const row = asRecord(value, 'benchmark price check');
  return {
    modelKey: row.model_key as string,
    sourceId: row.source_id as BenchmarkSourceId,
    providerId: row.provider_id as string,
    inputUsdPerMillion: row.input_usd_per_million as number | null,
    cachedInputUsdPerMillion: row.cached_input_usd_per_million as number | null,
    outputUsdPerMillion: row.output_usd_per_million as number | null,
    contextWindowTokens: row.context_window_tokens as number | null,
    verificationStatus: row.verification_status as BenchmarkPriceCheck['verificationStatus'],
    routeId: row.route_id as string,
    sourceModelId: row.source_model_id as string,
    canonicalSlug: row.canonical_slug as string | null,
    maxInputTokens: row.max_input_tokens as number | null,
    maxOutputTokens: row.max_output_tokens as number | null,
    inputModalities: parseNullableStringArray(row.input_modalities_json, 'benchmark price check.input_modalities_json'),
    outputModalities: parseNullableStringArray(row.output_modalities_json, 'benchmark price check.output_modalities_json'),
    supportedParameters: parseNullableStringArray(row.supported_parameters_json, 'benchmark price check.supported_parameters_json'),
    sourceArtifactId: row.source_artifact_id as string,
  };
}

function mapComparisonPair(value: unknown): BenchmarkComparisonPair {
  const row = asRecord(value, 'benchmark comparison pair');
  return {
    pairSlug: row.pair_slug as string,
    modelAKey: row.model_a_key as string,
    modelBKey: row.model_b_key as string,
    indexable: asBoolean(row.indexable, 'benchmark comparison pair.indexable'),
    eligibilityReason: row.eligibility_reason as string,
    featuredRank: row.featured_rank as number | null,
    sharedMetricCount: row.shared_metric_count as number,
  };
}

function assertRevisionRows(rows: readonly unknown[], revision: string, label: string): void {
  rows.forEach((value, index) => {
    const row = asRecord(value, `${label}[${index}]`);
    if (row.revision !== revision) fail(`${label}[${index}] does not belong to the active revision`);
  });
}

async function all<T>(db: D1Database, query: string, ...values: unknown[]): Promise<T[]> {
  return (await db.prepare(query).bind(...values).all()).results as T[];
}

function compareText(left: string, right: string): number {
  return compareUtf8Binary(left, right);
}

function artifactIdentity(sourceId: BenchmarkSourceId, artifactId: string): string {
  return `${sourceId}\u0000${artifactId}`;
}

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('Web Crypto SHA-256 is unavailable');
  const digest = await subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

async function validateRevisionIntegrity(
  revision: BenchmarkRevision,
  sources: readonly BenchmarkSourceRecord[],
): Promise<void> {
  const openrouterSources = sources.filter((source) => source.sourceId === 'openrouter');
  if (openrouterSources.length !== 1) fail('benchmark revision must contain exactly one OpenRouter catalog source');

  const openrouter = openrouterSources[0];
  if (openrouter.artifactId !== `catalog:${revision.catalogRevision}`
    || openrouter.contentHash !== revision.openrouterContentHash
    || openrouter.upstreamRevision !== revision.catalogRevision) {
    fail('benchmark revision OpenRouter catalog source does not match its pinned catalog revision');
  }

  const artifacts = sources
    .map((source) => ({
      sourceId: source.sourceId,
      artifactId: source.artifactId,
      contentHash: source.contentHash,
    }))
    .sort((left, right) => compareText(
      artifactIdentity(left.sourceId, left.artifactId),
      artifactIdentity(right.sourceId, right.artifactId),
    ));
  const canonicalBytes = new TextEncoder().encode(JSON.stringify({
    catalogRevision: revision.catalogRevision,
    openrouterContentHash: revision.openrouterContentHash,
    artifacts,
  }));
  if (await sha256Digest(canonicalBytes) !== revision.contentHash) {
    fail('benchmark revision aggregate content hash does not match its source artifacts');
  }
}

/**
 * Reads exactly the revision selected by benchmark_publication_state. There is
 * deliberately no newest-revision fallback: an incomplete or unpublished
 * revision is never safe to expose.
 */
export async function readActiveBenchmarkSnapshot(db: D1Database): Promise<ActiveBenchmarkSnapshot | null> {
  const revisionRows = await all<unknown>(db, ACTIVE_REVISION_QUERY);
  if (revisionRows.length === 0) return null;
  if (revisionRows.length !== 1) fail('active benchmark revision query returned multiple rows');
  const activeRevision = mapRevision(revisionRows[0]);
  const revision = activeRevision.revision;

  const [sourceRows, modelRows, metricRows, priceRows, pairRows] = await Promise.all([
    all<unknown>(db, 'SELECT * FROM benchmark_source_records WHERE revision = ?', revision),
    all<unknown>(db, 'SELECT * FROM benchmark_models WHERE revision = ?', revision),
    all<unknown>(db, 'SELECT * FROM benchmark_metrics WHERE revision = ?', revision),
    all<unknown>(db, 'SELECT * FROM benchmark_price_checks WHERE revision = ?', revision),
    all<unknown>(db, 'SELECT * FROM benchmark_comparison_pairs WHERE revision = ?', revision),
  ]);

  assertRevisionRows(sourceRows, revision, 'benchmark sources');
  assertRevisionRows(modelRows, revision, 'benchmark models');
  assertRevisionRows(metricRows, revision, 'benchmark metrics');
  assertRevisionRows(priceRows, revision, 'benchmark price checks');
  assertRevisionRows(pairRows, revision, 'benchmark comparison pairs');
  if (sourceRows.length === 0) fail('published benchmark revision has no source artifacts');

  const sources = sourceRows.map(mapSource);
  const models = modelRows.map(mapModel);
  const metrics = metricRows.map(mapMetric);
  const priceChecks = priceRows.map(mapPriceCheck);
  // The existing domain validator verifies every source artifact, model,
  // metric, and price relation while preserving explicit nulls and zeroes.
  validateNormalizedSourceBatch({ sources, models, metrics, priceChecks, comparisonSeeds: [] });
  await validateRevisionIntegrity(activeRevision, sources);

  const modelsByKey = new Map(models.map((model) => [model.modelKey, model]));
  const comparisonPairs = pairRows.map(mapComparisonPair);
  comparisonPairs.forEach((pair) => {
    validateBenchmarkComparisonPair(pair);
    const modelA = modelsByKey.get(pair.modelAKey);
    const modelB = modelsByKey.get(pair.modelBKey);
    if (!modelA || !modelB) {
      fail(`comparison pair ${pair.pairSlug} refers to a model outside the active revision`);
    }
    if (pair.pairSlug !== `${modelA.slug}-vs-${modelB.slug}`) {
      fail(`comparison pair ${pair.pairSlug} does not use its active models' canonical slugs`);
    }
    validateIndexableComparisonPairRoute(models, pair);
  });

  return {
    revision: activeRevision,
    sources: sources.slice().sort((left, right) => {
      const sourceOrder = compareText(left.sourceId, right.sourceId);
      return sourceOrder !== 0 ? sourceOrder : compareText(left.artifactId, right.artifactId);
    }),
    models: models.slice().sort((left, right) => compareText(left.slug, right.slug) || compareText(left.modelKey, right.modelKey)),
    metrics: metrics.slice().sort((left, right) => compareText(left.modelKey, right.modelKey) || compareText(left.metricKey, right.metricKey)),
    priceChecks: priceChecks.slice().sort((left, right) => compareText(left.modelKey, right.modelKey)
      || compareText(left.sourceId, right.sourceId)
      || compareText(left.providerId, right.providerId)
      || compareText(left.routeId, right.routeId)),
    comparisonPairs: comparisonPairs.slice().sort((left, right) => compareText(left.pairSlug, right.pairSlug)),
  };
}

export function freshnessFor(revision: BenchmarkRevision, now: number): BenchmarkFreshness {
  const isStale = now - Date.parse(revision.checkedAt) > FRESHNESS_WINDOW_MS;
  return isStale
    ? {
      status: 'stale',
      checkedAt: revision.checkedAt,
      message: 'Published benchmark revision has not refreshed within 36 hours.',
    }
    : { status: 'fresh', checkedAt: revision.checkedAt };
}

export function benchmarkEnvelope<T>(
  snapshot: ActiveBenchmarkSnapshot,
  freshness: BenchmarkFreshness,
  attribution: readonly BenchmarkApiAttribution[],
  data: T,
): BenchmarkApiEnvelope<T> {
  if (snapshot.revision.publishedAt === null) fail('active benchmark revision has no publication timestamp');
  return {
    revision: snapshot.revision.revision,
    publishedAt: snapshot.revision.publishedAt,
    freshness,
    attribution,
    data,
  };
}

function evidenceReferenceIdentity(reference: EvidenceReference): string {
  return artifactIdentity(reference.sourceId, reference.sourceArtifactId);
}

export function attributionForEvidence(
  snapshot: ActiveBenchmarkSnapshot,
  references: readonly EvidenceReference[],
): readonly BenchmarkApiAttribution[] {
  const wanted = new Set(references.map(evidenceReferenceIdentity));
  const records = snapshot.sources.filter((source) => wanted.has(artifactIdentity(source.sourceId, source.artifactId)));
  if (records.length !== wanted.size) fail('displayed evidence is missing source attribution');
  return records.map((source) => ({
    sourceId: source.sourceId,
    label: source.attributionText,
    url: source.sourceUrl,
    updatedAt: source.observedAt,
  }));
}

export function attributionForAllSources(snapshot: ActiveBenchmarkSnapshot): readonly BenchmarkApiAttribution[] {
  return snapshot.sources.map((source) => ({
    sourceId: source.sourceId,
    label: source.attributionText,
    url: source.sourceUrl,
    updatedAt: source.observedAt,
  }));
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail('opaque value is malformed');
  const padded = `${value.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - value.length % 4) % 4)}`;
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('opaque value is malformed');
  }
}

export function encodeOpaqueValue(value: unknown): string {
  return encodeBase64Url(JSON.stringify(value));
}

export function decodeOpaqueValue(value: string): unknown {
  try {
    return JSON.parse(decodeBase64Url(value)) as unknown;
  } catch {
    fail('opaque value is malformed');
  }
}

/** The canonical ETag payload includes every body field and endpoint parameter that can change. */
export function etagForBenchmarkResponse(
  revision: BenchmarkRevision,
  freshness: BenchmarkFreshness,
  parameters: unknown,
): string {
  return `"benchmark-${encodeOpaqueValue([
    revision.revision,
    { checkedAt: revision.checkedAt, freshnessStatus: freshness.status },
    parameters,
  ])}"`;
}

export function matchesExactEtag(request: Request, etag: string): boolean {
  return request.headers.get('If-None-Match') === etag;
}

export function jsonBenchmarkResponse(body: unknown, status = 200, etag?: string): Response {
  const headers = new Headers({
    'Cache-Control': CACHE_CONTROL,
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Accept-Encoding',
  });
  if (etag) headers.set('ETag', etag);
  return Response.json(body, { status, headers });
}

export function notModifiedBenchmarkResponse(etag: string): Response {
  return new Response(null, {
    status: 304,
    headers: new Headers({
      'Cache-Control': CACHE_CONTROL,
      ETag: etag,
      Vary: 'Accept-Encoding',
    }),
  });
}

export function unavailableBenchmarkResponse(): Response {
  return jsonBenchmarkResponse({ error: 'Benchmark data unavailable' }, 503);
}

export function invalidBenchmarkRequestResponse(): Response {
  return jsonBenchmarkResponse({ error: 'Invalid benchmark request' }, 400);
}

export function modelNotFoundBenchmarkResponse(): Response {
  return jsonBenchmarkResponse({ error: 'Benchmark model not found' }, 404);
}

export const BENCHMARK_CACHE_CONTROL = CACHE_CONTROL;
export { BENCHMARK_SOURCE_IDS };
