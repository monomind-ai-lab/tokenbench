import {
  BENCHMARK_SOURCE_IDS,
  compareUtf8Binary,
  createComparisonPairSlugResolver,
  isComparisonPairRouteSafe,
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
import { matchesIfNoneMatch } from './entity-tag';
import {
  BENCHMARK_FRESHNESS_WINDOW_MS,
  BENCHMARK_STALE_MESSAGE,
} from '../../src/ingestion/cadence';

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

export interface IndexableComparisonSitemapEntry {
  readonly pairSlug: string;
  readonly publishedAt: string;
}

const ACTIVE_REVISION_QUERY = `
  SELECT revisions.*
  FROM benchmark_publication_state AS publication
  INNER JOIN benchmark_revisions AS revisions ON revisions.revision = publication.active_revision
  WHERE publication.singleton = 1
    AND revisions.publication_state = 'published'
  LIMIT 1
`;

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
    // Revisions written before the raw_value migration have no column value;
    // absent diagnostics read as null rather than an invalid undefined.
    rawValue: (row.raw_value ?? null) as number | null,
    rank: row.rank as number | null,
    // Revisions written before the rank_field_size migration have no column
    // value; an absent exact cohort size reads as null so the profile reports
    // the field as unavailable rather than inventing a denominator.
    rankFieldSize: (row.rank_field_size ?? null) as number | null,
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
  const digest = await subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
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

async function readActiveBenchmarkRevision(db: D1Database): Promise<BenchmarkRevision | null> {
  const revisionRows = await all<unknown>(db, ACTIVE_REVISION_QUERY);
  if (revisionRows.length === 0) return null;
  if (revisionRows.length !== 1) fail('active benchmark revision query returned multiple rows');
  return mapRevision(revisionRows[0]);
}

function sortedSources(sources: readonly BenchmarkSourceRecord[]): readonly BenchmarkSourceRecord[] {
  return sources.slice().sort((left, right) => {
    const sourceOrder = compareText(left.sourceId, right.sourceId);
    return sourceOrder !== 0 ? sourceOrder : compareText(left.artifactId, right.artifactId);
  });
}

function sortedModels(models: readonly BenchmarkModel[]): readonly BenchmarkModel[] {
  return models.slice().sort((left, right) => compareText(left.slug, right.slug) || compareText(left.modelKey, right.modelKey));
}

function sortedMetrics(metrics: readonly BenchmarkMetric[]): readonly BenchmarkMetric[] {
  return metrics.slice().sort((left, right) => compareText(left.modelKey, right.modelKey) || compareText(left.metricKey, right.metricKey));
}

function sortedPriceChecks(priceChecks: readonly BenchmarkPriceCheck[]): readonly BenchmarkPriceCheck[] {
  return priceChecks.slice().sort((left, right) => compareText(left.modelKey, right.modelKey)
    || compareText(left.sourceId, right.sourceId)
    || compareText(left.providerId, right.providerId)
    || compareText(left.routeId, right.routeId));
}

function sortedComparisonPairs(pairs: readonly BenchmarkComparisonPair[]): readonly BenchmarkComparisonPair[] {
  return pairs.slice().sort((left, right) => compareText(left.pairSlug, right.pairSlug));
}

function uniqueEvidenceReferences(references: readonly EvidenceReference[]): readonly EvidenceReference[] {
  const byIdentity = new Map<string, EvidenceReference>();
  for (const reference of references) {
    byIdentity.set(artifactIdentity(reference.sourceId, reference.sourceArtifactId), reference);
  }
  return [...byIdentity.values()].sort((left, right) => compareText(
    artifactIdentity(left.sourceId, left.sourceArtifactId),
    artifactIdentity(right.sourceId, right.sourceArtifactId),
  ));
}

async function readSourcesForEvidence(
  db: D1Database,
  revision: string,
  references: readonly EvidenceReference[],
): Promise<readonly BenchmarkSourceRecord[]> {
  const wanted = uniqueEvidenceReferences(references);
  if (wanted.length === 0) return [];
  const evidenceJson = JSON.stringify(wanted.map((reference) => ({
    sourceId: reference.sourceId,
    sourceArtifactId: reference.sourceArtifactId,
  })));
  const rows = await all<unknown>(
    db,
    `WITH revision_scope AS (
      SELECT ? AS revision
    ),
    requested_evidence AS (
      SELECT
        json_extract(value, '$.sourceId') AS source_id,
        json_extract(value, '$.sourceArtifactId') AS artifact_id
      FROM json_each(?)
    )
    SELECT sources.*
    FROM requested_evidence AS evidence
    CROSS JOIN revision_scope
    INNER JOIN benchmark_source_records AS sources
      ON sources.revision = revision_scope.revision
      AND sources.source_id = evidence.source_id
      AND sources.artifact_id = evidence.artifact_id
    `,
    revision,
    evidenceJson,
  );
  assertRevisionRows(rows, revision, 'targeted benchmark sources');
  const wantedIdentities = new Set(wanted.map((reference) => artifactIdentity(reference.sourceId, reference.sourceArtifactId)));
  const sourcesByIdentity = new Map<string, BenchmarkSourceRecord>();
  for (const source of rows.map(mapSource)) {
    const identity = artifactIdentity(source.sourceId, source.artifactId);
    if (!wantedIdentities.has(identity)) continue;
    if (sourcesByIdentity.has(identity)) fail('targeted benchmark evidence has duplicate source attribution');
    sourcesByIdentity.set(identity, source);
  }
  if (sourcesByIdentity.size !== wantedIdentities.size) fail('targeted benchmark evidence is missing source attribution');
  return sortedSources([...sourcesByIdentity.values()]);
}

function validateTargetedFacts(
  sources: readonly BenchmarkSourceRecord[],
  models: readonly BenchmarkModel[],
  metrics: readonly BenchmarkMetric[],
  priceChecks: readonly BenchmarkPriceCheck[],
): void {
  validateNormalizedSourceBatch({
    sources: [...sources],
    models: [...models],
    metrics: [...metrics],
    priceChecks: [...priceChecks],
    comparisonSeeds: [],
  });
}

function emptyTargetedSnapshot(revision: BenchmarkRevision): ActiveBenchmarkSnapshot {
  return {
    revision,
    sources: [],
    models: [],
    metrics: [],
    priceChecks: [],
    comparisonPairs: [],
  };
}

function modelEvidenceReferences(models: readonly BenchmarkModel[]): readonly EvidenceReference[] {
  return models.map((model) => ({ sourceId: model.sourceId, sourceArtifactId: model.sourceArtifactId }));
}

function metricEvidenceReferences(metrics: readonly BenchmarkMetric[]): readonly EvidenceReference[] {
  return metrics.map((metric) => ({ sourceId: metric.sourceId, sourceArtifactId: metric.sourceArtifactId }));
}

function priceEvidenceReferences(priceChecks: readonly BenchmarkPriceCheck[]): readonly EvidenceReference[] {
  return priceChecks.map((priceCheck) => ({ sourceId: priceCheck.sourceId, sourceArtifactId: priceCheck.sourceArtifactId }));
}

/**
 * Reads the single model detail route without materializing every active
 * benchmark fact. Publication-time validation still guards the full revision;
 * this reader validates only the evidence it is about to display.
 */
export async function readActiveBenchmarkModelSnapshot(
  db: D1Database,
  slug: string,
): Promise<ActiveBenchmarkSnapshot | null> {
  const activeRevision = await readActiveBenchmarkRevision(db);
  if (!activeRevision) return null;
  const revision = activeRevision.revision;
  const modelRows = await all<unknown>(
    db,
    'SELECT * FROM benchmark_models WHERE revision = ? AND slug = ? LIMIT 2',
    revision,
    slug,
  );
  assertRevisionRows(modelRows, revision, 'targeted benchmark models');
  const matchedModels = modelRows.map(mapModel).filter((model) => model.slug === slug);
  if (matchedModels.length === 0) return emptyTargetedSnapshot(activeRevision);
  if (matchedModels.length !== 1) fail('targeted benchmark model query returned duplicate slugs');
  const model = matchedModels[0];

  const [metricRows, priceRows, pairRows] = await Promise.all([
    all<unknown>(db, 'SELECT * FROM benchmark_metrics WHERE revision = ? AND model_key = ?', revision, model.modelKey),
    all<unknown>(db, 'SELECT * FROM benchmark_price_checks WHERE revision = ? AND model_key = ?', revision, model.modelKey),
    all<unknown>(
      db,
      'SELECT * FROM benchmark_comparison_pairs WHERE revision = ? AND (model_a_key = ? OR model_b_key = ?)',
      revision,
      model.modelKey,
      model.modelKey,
    ),
  ]);
  assertRevisionRows(metricRows, revision, 'targeted benchmark metrics');
  assertRevisionRows(priceRows, revision, 'targeted benchmark price checks');
  assertRevisionRows(pairRows, revision, 'targeted benchmark comparison pairs');
  const metrics = sortedMetrics(metricRows.map(mapMetric).filter((metric) => metric.modelKey === model.modelKey));
  const priceChecks = sortedPriceChecks(priceRows.map(mapPriceCheck).filter((priceCheck) => priceCheck.modelKey === model.modelKey));
  const comparisonPairs = sortedComparisonPairs(pairRows
    .map(mapComparisonPair)
    .filter((pair) => pair.modelAKey === model.modelKey || pair.modelBKey === model.modelKey));
  comparisonPairs.forEach(validateBenchmarkComparisonPair);
  const sources = await readSourcesForEvidence(db, revision, [
    ...modelEvidenceReferences([model]),
    ...metricEvidenceReferences(metrics),
    ...priceEvidenceReferences(priceChecks),
  ]);
  validateTargetedFacts(sources, [model], metrics, priceChecks);
  return {
    revision: activeRevision,
    sources,
    models: [model],
    metrics,
    priceChecks,
    comparisonPairs,
  };
}

const MAX_COMPARISON_ROUTE_CANDIDATES = 64;

function comparisonRouteCandidateSlugs(pairSlug: string): readonly string[] {
  const candidates = new Set<string>();
  let splitAt = pairSlug.indexOf('-vs-');
  while (splitAt >= 0) {
    const left = pairSlug.slice(0, splitAt);
    const right = pairSlug.slice(splitAt + 4);
    if (left.length > 0 && right.length > 0) {
      candidates.add(left);
      candidates.add(right);
    }
    if (candidates.size > MAX_COMPARISON_ROUTE_CANDIDATES) return [];
    splitAt = pairSlug.indexOf('-vs-', splitAt + 1);
  }
  return [...candidates].sort(compareText);
}

function uniqueModels(models: readonly BenchmarkModel[]): readonly BenchmarkModel[] {
  const byKey = new Map<string, BenchmarkModel>();
  for (const model of models) byKey.set(model.modelKey, model);
  return sortedModels([...byKey.values()]);
}

function validateTargetedComparisonPairs(
  pairs: readonly BenchmarkComparisonPair[],
  models: readonly BenchmarkModel[],
): void {
  const modelsByKey = new Map(models.map((model) => [model.modelKey, model]));
  for (const pair of pairs) {
    validateBenchmarkComparisonPair(pair);
    const modelA = modelsByKey.get(pair.modelAKey);
    const modelB = modelsByKey.get(pair.modelBKey);
    if (!modelA || !modelB) fail(`targeted comparison pair ${pair.pairSlug} is missing its model evidence`);
    if (pair.indexable && pair.pairSlug !== `${modelA.slug}-vs-${modelB.slug}`) {
      fail(`targeted indexable comparison pair ${pair.pairSlug} is not canonical`);
    }
  }
}

/**
 * Returns only the models that can resolve this route, the two displayed
 * models' evidence, and at most six directly related comparison records.
 */
export async function readActiveComparisonSnapshot(
  db: D1Database,
  pairSlug: string,
): Promise<ActiveBenchmarkSnapshot | null> {
  const activeRevision = await readActiveBenchmarkRevision(db);
  if (!activeRevision) return null;
  const revision = activeRevision.revision;
  const routeCandidates = comparisonRouteCandidateSlugs(pairSlug);
  if (routeCandidates.length === 0) return emptyTargetedSnapshot(activeRevision);
  const candidatePlaceholders = routeCandidates.map(() => '?').join(', ');
  const candidateRows = await all<unknown>(
    db,
    `SELECT * FROM benchmark_models WHERE revision = ? AND slug IN (${candidatePlaceholders})`,
    revision,
    ...routeCandidates,
  );
  assertRevisionRows(candidateRows, revision, 'targeted comparison route models');
  const candidateSlugs = new Set(routeCandidates);
  const routeModels = uniqueModels(candidateRows.map(mapModel).filter((model) => candidateSlugs.has(model.slug)));
  const resolvePairSlug = createComparisonPairSlugResolver(routeModels);
  const resolved = resolvePairSlug(pairSlug);
  if (!resolved) {
    const sources = await readSourcesForEvidence(db, revision, modelEvidenceReferences(routeModels));
    validateTargetedFacts(sources, routeModels, [], []);
    return {
      revision: activeRevision,
      sources,
      models: routeModels,
      metrics: [],
      priceChecks: [],
      comparisonPairs: [],
    };
  }
  const currentModelKeys = [resolved.modelA.modelKey, resolved.modelB.modelKey] as const;
  const [metricRows, priceRows, currentPairRows, relatedPairRows] = await Promise.all([
    all<unknown>(
      db,
      'SELECT * FROM benchmark_metrics WHERE revision = ? AND model_key IN (?, ?)',
      revision,
      ...currentModelKeys,
    ),
    all<unknown>(
      db,
      'SELECT * FROM benchmark_price_checks WHERE revision = ? AND model_key IN (?, ?)',
      revision,
      ...currentModelKeys,
    ),
    all<unknown>(
      db,
      'SELECT * FROM benchmark_comparison_pairs WHERE revision = ? AND pair_slug = ? AND model_a_key = ? AND model_b_key = ? LIMIT 1',
      revision,
      resolved.canonicalPairSlug,
      resolved.modelA.modelKey,
      resolved.modelB.modelKey,
    ),
    all<unknown>(
      db,
      `SELECT * FROM benchmark_comparison_pairs
       WHERE revision = ?
         AND indexable = 1
         AND (model_a_key = ? OR model_b_key = ? OR model_a_key = ? OR model_b_key = ?)
         AND NOT (model_a_key = ? AND model_b_key = ?)
       ORDER BY CASE WHEN featured_rank IS NULL THEN 1 ELSE 0 END ASC, featured_rank ASC, pair_slug COLLATE BINARY ASC
       LIMIT 6`,
      revision,
      resolved.modelA.modelKey,
      resolved.modelA.modelKey,
      resolved.modelB.modelKey,
      resolved.modelB.modelKey,
      resolved.modelA.modelKey,
      resolved.modelB.modelKey,
    ),
  ]);
  assertRevisionRows(metricRows, revision, 'targeted comparison metrics');
  assertRevisionRows(priceRows, revision, 'targeted comparison price checks');
  assertRevisionRows(currentPairRows, revision, 'targeted current comparison pair');
  assertRevisionRows(relatedPairRows, revision, 'targeted related comparison pairs');
  const metrics = sortedMetrics(metricRows.map(mapMetric).filter((metric) => currentModelKeys.includes(metric.modelKey)));
  const priceChecks = sortedPriceChecks(priceRows.map(mapPriceCheck).filter((priceCheck) => currentModelKeys.includes(priceCheck.modelKey)));
  const currentPairs = currentPairRows
    .map(mapComparisonPair)
    .filter((pair) => pair.pairSlug === resolved.canonicalPairSlug
      && pair.modelAKey === resolved.modelA.modelKey
      && pair.modelBKey === resolved.modelB.modelKey);
  if (currentPairs.length > 1) fail('targeted current comparison pair query returned multiple records');
  const relatedPairs = relatedPairRows
    .map(mapComparisonPair)
    .filter((pair) => pair.indexable
      && (pair.modelAKey === resolved.modelA.modelKey
        || pair.modelBKey === resolved.modelA.modelKey
        || pair.modelAKey === resolved.modelB.modelKey
        || pair.modelBKey === resolved.modelB.modelKey)
      && !(pair.modelAKey === resolved.modelA.modelKey && pair.modelBKey === resolved.modelB.modelKey));
  const relatedModelKeys = [...new Set(relatedPairs.flatMap((pair) => [pair.modelAKey, pair.modelBKey]))]
    .filter((modelKey) => !currentModelKeys.includes(modelKey));
  const relatedModelRows = relatedModelKeys.length === 0
    ? []
    : await all<unknown>(
      db,
      `SELECT * FROM benchmark_models WHERE revision = ? AND model_key IN (${relatedModelKeys.map(() => '?').join(', ')})`,
      revision,
      ...relatedModelKeys,
    );
  assertRevisionRows(relatedModelRows, revision, 'targeted related comparison models');
  const relatedModelKeySet = new Set(relatedModelKeys);
  const relatedModels = relatedModelRows.map(mapModel).filter((model) => relatedModelKeySet.has(model.modelKey));
  if (relatedModels.length !== relatedModelKeys.length) fail('targeted related comparison is missing a model');
  const models = uniqueModels([...routeModels, ...relatedModels]);
  const comparisonPairs = sortedComparisonPairs([...currentPairs, ...relatedPairs]);
  validateTargetedComparisonPairs(comparisonPairs, models);
  const sources = await readSourcesForEvidence(db, revision, [
    ...modelEvidenceReferences(models),
    ...metricEvidenceReferences(metrics),
    ...priceEvidenceReferences(priceChecks),
  ]);
  validateTargetedFacts(sources, models, metrics, priceChecks);
  return {
    revision: activeRevision,
    sources,
    models,
    metrics,
    priceChecks,
    comparisonPairs,
  };
}

/** Reads the dynamic sitemap in one bounded publication-pointer query. */
export async function readActiveIndexableComparisonSitemapEntries(
  db: D1Database,
): Promise<readonly IndexableComparisonSitemapEntry[]> {
  const rows = await all<unknown>(db, `
    WITH RECURSIVE
      active_pairs AS (
        SELECT pairs.revision, pairs.pair_slug, pairs.model_a_key, pairs.model_b_key, revisions.published_at
        FROM benchmark_publication_state AS publication
        INNER JOIN benchmark_revisions AS revisions
          ON revisions.revision = publication.active_revision
        INNER JOIN benchmark_comparison_pairs AS pairs
          ON pairs.revision = revisions.revision
        WHERE publication.singleton = 1
          AND revisions.publication_state = 'published'
          AND pairs.indexable = 1
      ),
      separators(revision, pair_slug, split_at) AS (
        SELECT revision, pair_slug, instr(pair_slug, '-vs-')
        FROM active_pairs
        UNION ALL
        SELECT revision, pair_slug,
          CASE
            WHEN instr(substr(pair_slug, split_at + 4), '-vs-') = 0 THEN 0
            ELSE split_at + 3 + instr(substr(pair_slug, split_at + 4), '-vs-')
          END
        FROM separators
        WHERE split_at > 0
      ),
      route_resolutions AS (
        SELECT separators.revision, separators.pair_slug, COUNT(*) AS resolved_count
        FROM separators
        INNER JOIN benchmark_models AS left_model
          ON left_model.revision = separators.revision
          AND left_model.slug = substr(separators.pair_slug, 1, separators.split_at - 1)
        INNER JOIN benchmark_models AS right_model
          ON right_model.revision = separators.revision
          AND right_model.slug = substr(separators.pair_slug, separators.split_at + 4)
        WHERE separators.split_at > 0
          AND left_model.model_key <> right_model.model_key
        GROUP BY separators.revision, separators.pair_slug
      )
    SELECT active_pairs.pair_slug,
      active_pairs.published_at,
      active_pairs.model_a_key,
      active_pairs.model_b_key,
      model_a.slug AS model_a_slug,
      model_b.slug AS model_b_slug,
      COALESCE(route_resolutions.resolved_count, 0) AS resolved_count
    FROM active_pairs
    LEFT JOIN benchmark_models AS model_a
      ON model_a.revision = active_pairs.revision AND model_a.model_key = active_pairs.model_a_key
    LEFT JOIN benchmark_models AS model_b
      ON model_b.revision = active_pairs.revision AND model_b.model_key = active_pairs.model_b_key
    LEFT JOIN route_resolutions
      ON route_resolutions.revision = active_pairs.revision AND route_resolutions.pair_slug = active_pairs.pair_slug
    ORDER BY active_pairs.pair_slug COLLATE BINARY ASC
  `);
  const entries = rows.map((value, index) => {
    const row = asRecord(value, `targeted comparison sitemap entry[${index}]`);
    const pairSlug = requireNonBlankString(row.pair_slug, `targeted comparison sitemap entry[${index}].pair_slug`);
    if (!isComparisonPairRouteSafe(pairSlug)) fail(`targeted comparison sitemap entry ${pairSlug} is not route-safe`);
    const modelAKey = requireNonBlankString(row.model_a_key, `targeted comparison sitemap entry[${index}].model_a_key`);
    const modelBKey = requireNonBlankString(row.model_b_key, `targeted comparison sitemap entry[${index}].model_b_key`);
    const modelASlug = requireNonBlankString(row.model_a_slug, `targeted comparison sitemap entry[${index}].model_a_slug`);
    const modelBSlug = requireNonBlankString(row.model_b_slug, `targeted comparison sitemap entry[${index}].model_b_slug`);
    if (compareUtf8Binary(modelAKey, modelBKey) >= 0
      || pairSlug !== `${modelASlug}-vs-${modelBSlug}`
      || row.resolved_count !== 1) {
      fail(`targeted comparison sitemap entry ${pairSlug} is not a unique canonical route`);
    }
    return {
      pairSlug,
      publishedAt: requireTimestamp(row.published_at, `targeted comparison sitemap entry[${index}].published_at`),
    } satisfies IndexableComparisonSitemapEntry;
  });
  return entries.sort((left, right) => compareText(left.pairSlug, right.pairSlug));
}

/**
 * Reads exactly the revision selected by benchmark_publication_state. There is
 * deliberately no newest-revision fallback: an incomplete or unpublished
 * revision is never safe to expose.
 */
export async function readActiveBenchmarkSnapshot(db: D1Database): Promise<ActiveBenchmarkSnapshot | null> {
  const activeRevision = await readActiveBenchmarkRevision(db);
  if (!activeRevision) return null;
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
  const resolvePairSlug = createComparisonPairSlugResolver(models);
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
    validateIndexableComparisonPairRoute(models, pair, resolvePairSlug);
  });

  return {
    revision: activeRevision,
    sources: sortedSources(sources),
    models: sortedModels(models),
    metrics: sortedMetrics(metrics),
    priceChecks: sortedPriceChecks(priceChecks),
    comparisonPairs: sortedComparisonPairs(comparisonPairs),
  };
}

export function freshnessFor(revision: BenchmarkRevision, now: number): BenchmarkFreshness {
  const isStale = now - Date.parse(revision.checkedAt) > BENCHMARK_FRESHNESS_WINDOW_MS;
  return isStale
    ? {
      status: 'stale',
      checkedAt: revision.checkedAt,
      message: BENCHMARK_STALE_MESSAGE,
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
  return matchesIfNoneMatch(request, etag);
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
