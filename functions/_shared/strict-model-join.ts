import {
  buildUiDataContractV1Envelope,
  type DataWarning,
  type EvidenceValue,
  type SourceAttribution,
  type UiDataContractV1Envelope,
} from '../../src/pipeline/ui-data-contract-v1-core';
import type {
  LifecycleEvent,
  RouteFact,
} from '../../src/pipeline/ui-data-contract-v1-models';
import {
  readActiveBenchmarkSnapshot,
  type ActiveBenchmarkSnapshot,
  type D1Database as BenchmarkD1Database,
} from './benchmark-db';
import type { BenchmarkSourceRecord } from '../../src/benchmarks/contracts';

/**
 * Catalog facts may join a LiveBench row only through an already-reviewed
 * canonical configuration and an exact active directory/source-model identity.
 * No slug, display-name, provider, or price similarity is a join key.
 */
export interface StrictModelJoinRouteInput {
  readonly liveBenchConfigurationId: string;
  readonly canonicalConfigurationId: string | null;
  readonly liveBenchIdentityMatchKind: 'exact' | 'reviewed' | 'proposal';
  readonly liveBenchIdentityReviewStatus: 'verified' | 'needs_review' | 'rejected';
  readonly canonicalModelKey: string | null;
  readonly directoryModelKey: string;
  readonly directoryCanonicalSlug: string;
  readonly directorySourceModelId: string;
  readonly routeId: string;
  readonly providerId: string;
  readonly catalogModelId: string;
  readonly availability: 'available' | 'limited' | 'deprecated' | null;
  readonly inputMicroDollarsPerMillion: number;
  readonly cacheReadMicroDollarsPerMillion: number | null;
  readonly cacheWriteMicroDollarsPerMillion: number | null;
  readonly outputMicroDollarsPerMillion: number;
  readonly contextWindowTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly expirationDate: string | null;
  readonly source: SourceAttribution;
  readonly inputModalities?: readonly string[] | null;
  readonly outputModalities?: readonly string[] | null;
  readonly modalitySource?: SourceAttribution | null;
}

export interface StrictModelJoinModel {
  readonly configurationId: string;
  readonly routes: readonly RouteFact[];
  readonly selectedRoute: RouteFact | null;
  readonly selectedRoutePolicy: string;
  readonly lifecycleStatus: EvidenceValue<'current' | 'sunset_scheduled' | 'retired'>;
  readonly lifecycleEvents: readonly LifecycleEvent[];
  readonly replacement: EvidenceValue<{ readonly modelSlug: string; readonly migrationNote: string }>;
}

export interface StrictModelJoin {
  readonly catalogRevision: string | null;
  readonly catalogObservedAt: string | null;
  readonly modalityBenchmarkRevision: string | null;
  readonly sources: readonly SourceAttribution[];
  readonly modelsByConfigurationId: ReadonlyMap<string, StrictModelJoinModel>;
}

export interface StrictModelJoinD1Database {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
    };
  };
}

interface ActiveCatalogContext {
  readonly revision: string;
  readonly checked_at: string;
}

interface CatalogJoinRow {
  readonly configuration_id: unknown;
  readonly canonical_configuration_id: unknown;
  readonly identity_match_kind: unknown;
  readonly identity_review_status: unknown;
  readonly canonical_model_key: unknown;
  readonly directory_model_key: unknown;
  readonly canonical_slug: unknown;
  readonly directory_source_model_id: unknown;
  readonly route_id: unknown;
  readonly provider_id: unknown;
  readonly catalog_model_id: unknown;
  readonly availability: unknown;
  readonly input_micro_dollars_per_million: unknown;
  readonly cached_input_micro_dollars_per_million: unknown;
  readonly cache_write_micro_dollars_per_million: unknown;
  readonly output_micro_dollars_per_million: unknown;
  readonly context_window_tokens: unknown;
  readonly max_output_tokens: unknown;
  readonly expiration_date: unknown;
  readonly source_id: unknown;
  readonly source_url: unknown;
  readonly source_observed_at: unknown;
}

const ACTIVE_CATALOG_CONTEXT_SQL = `
  SELECT revisions.revision, revisions.checked_at
  FROM catalog_publication_state AS publication
  INNER JOIN catalog_revisions AS revisions
    ON revisions.revision = publication.active_revision
  WHERE publication.singleton = 1
    AND revisions.publication_state = 'published'
  LIMIT 1
`;

/*
 * The two equality predicates at the end are intentional. They bind the
 * reviewed canonical configuration to the active durable directory row, then
 * bind that row's exact source model ID to the active catalog offer. Do not
 * replace them with a slug/name/organization comparison.
 */
const ACTIVE_EXACT_ROUTE_ROWS_SQL = `
  SELECT
    livebench.configuration_id,
    livebench.canonical_configuration_id,
    livebench.identity_match_kind,
    livebench.identity_review_status,
    canonical.canonical_model_key,
    directory.model_key AS directory_model_key,
    directory.canonical_slug,
    directory.source_model_id AS directory_source_model_id,
    offers.id AS route_id,
    offers.provider_id,
    offers.model_id AS catalog_model_id,
    offers.availability,
    offers.input_micro_dollars_per_million,
    offers.cached_input_micro_dollars_per_million,
    offers.cache_write_micro_dollars_per_million,
    offers.output_micro_dollars_per_million,
    offers.context_window_tokens,
    offers.max_output_tokens,
    offers.expiration_date,
    sources.id AS source_id,
    sources.source_url,
    sources.observed_at AS source_observed_at
  FROM livebench_model_configurations AS livebench
  INNER JOIN model_configurations AS canonical
    ON canonical.configuration_id = livebench.canonical_configuration_id
  INNER JOIN benchmark_model_directory AS directory
    ON directory.model_key = canonical.canonical_model_key
   AND directory.status = 'current'
  INNER JOIN model_offers AS offers
    ON offers.revision = ?
   AND offers.model_id = directory.source_model_id
  INNER JOIN source_records AS sources
    ON sources.revision = offers.revision
   AND sources.id = offers.source_id
  WHERE livebench.revision = ?
    AND livebench.canonical_configuration_id IS NOT NULL
    AND livebench.identity_review_status = 'verified'
    AND livebench.identity_match_kind IN ('exact', 'reviewed')
    AND canonical.canonical_model_key IS NOT NULL
    AND directory.model_key = canonical.canonical_model_key
    AND offers.model_id = directory.source_model_id
  ORDER BY livebench.configuration_id ASC, offers.provider_id ASC, offers.id ASC
`;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : nonBlank(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  if (value === null) return null;
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))) return null;
  const canonical = new Date(value).toISOString();
  return value === canonical || value === canonical.replace(/\.000Z$/u, 'Z') ? value : null;
}

function canonicalCalendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? value
    : null;
}

function available<T>(value: T, sourceRef: string): EvidenceValue<T> {
  return { availability: 'available', value, sourceRefs: [sourceRef] };
}

function unavailable<T>(reason: string, sourceRef: string): EvidenceValue<T> {
  return { availability: 'unavailable', value: null, reason, sourceRefs: [sourceRef] };
}

function routeStatus(value: StrictModelJoinRouteInput['availability']): RouteFact['status'] {
  return value ?? 'unavailable';
}

function modalities(value: readonly string[] | null | undefined): RouteFact['inputModalities'] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<RouteFact['inputModalities'][number]>(['text', 'image', 'audio', 'video', 'file']);
  const values = value.filter((candidate): candidate is RouteFact['inputModalities'][number] => (
    typeof candidate === 'string' && allowed.has(candidate as RouteFact['inputModalities'][number])
  ));
  return [...new Set(values)].sort(compareText);
}

function routeFromInput(input: StrictModelJoinRouteInput): RouteFact | null {
  const routeId = nonBlank(input.routeId);
  const providerId = nonBlank(input.providerId);
  const inputPrice = nonNegativeInteger(input.inputMicroDollarsPerMillion);
  const outputPrice = nonNegativeInteger(input.outputMicroDollarsPerMillion);
  if (!routeId || !providerId || inputPrice === null || outputPrice === null) return null;
  const cacheRead = input.cacheReadMicroDollarsPerMillion === null
    ? null
    : nonNegativeInteger(input.cacheReadMicroDollarsPerMillion);
  const cacheWrite = input.cacheWriteMicroDollarsPerMillion === null
    ? null
    : nonNegativeInteger(input.cacheWriteMicroDollarsPerMillion);
  const sourceRef = input.source.sourceRef;
  return {
    routeId,
    providerId,
    status: routeStatus(input.availability),
    inputMicroDollarsPerMillion: available(inputPrice, sourceRef),
    outputMicroDollarsPerMillion: available(outputPrice, sourceRef),
    cacheReadMicroDollarsPerMillion: cacheRead === null
      ? unavailable('No exact reviewed cache-read rate is available for this catalog route.', sourceRef)
      : available(cacheRead, sourceRef),
    cacheWriteMicroDollarsPerMillion: cacheWrite === null
      ? unavailable('No authoritative cache-write rate is available for this catalog route.', sourceRef)
      : available(cacheWrite, sourceRef),
    contextWindowTokens: input.contextWindowTokens === null
      ? unavailable('No exact reviewed context-window value is available for this catalog route.', sourceRef)
      : (() => {
        const value = positiveIntegerOrNull(input.contextWindowTokens);
        return value === null
          ? unavailable('No exact reviewed context-window value is available for this catalog route.', sourceRef)
          : available(value, sourceRef);
      })(),
    maxOutputTokens: input.maxOutputTokens === null
      ? unavailable('No exact reviewed maximum-output value is available for this catalog route.', sourceRef)
      : (() => {
        const value = positiveIntegerOrNull(input.maxOutputTokens);
        return value === null
          ? unavailable('No exact reviewed maximum-output value is available for this catalog route.', sourceRef)
          : available(value, sourceRef);
      })(),
    inputModalities: modalities(input.inputModalities),
    outputModalities: modalities(input.outputModalities),
    ttftP50Ms: unavailable('No authoritative runtime latency observation is available for this route.', sourceRef),
    tpsP50: unavailable('No authoritative runtime throughput observation is available for this route.', sourceRef),
    uptimeBasisPoints: unavailable('No authoritative runtime availability observation is available for this route.', sourceRef),
    runtimeObservation: unavailable('No authoritative runtime observation window is available for this route.', sourceRef),
    // A base offer is not evidence of a priced tier boundary.
    pricingTiers: [],
  };
}

function exactReviewedIdentity(input: StrictModelJoinRouteInput): boolean {
  return input.canonicalConfigurationId !== null
    && (input.liveBenchIdentityMatchKind === 'exact' || input.liveBenchIdentityMatchKind === 'reviewed')
    && input.liveBenchIdentityReviewStatus === 'verified'
    && input.canonicalModelKey !== null
    && input.canonicalModelKey === input.directoryModelKey
    && input.directorySourceModelId === input.catalogModelId;
}

function uniqueSources(sources: readonly SourceAttribution[]): readonly SourceAttribution[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.sourceRef)) return false;
    seen.add(source.sourceRef);
    return true;
  });
}

function expirationEvents(
  inputs: readonly StrictModelJoinRouteInput[],
): readonly LifecycleEvent[] {
  const events = new Map<string, LifecycleEvent>();
  for (const input of inputs) {
    const expirationDate = canonicalCalendarDate(input.expirationDate);
    if (!expirationDate) continue;
    const routeId = nonBlank(input.routeId);
    const observedAt = canonicalTimestamp(input.source.observedAt);
    if (!routeId || !observedAt) continue;
    const event: LifecycleEvent = {
      eventId: `catalog-expiration:${routeId}:${expirationDate}`,
      eventType: 'expiration',
      effectiveAt: `${expirationDate}T00:00:00.000Z`,
      observedAt,
      confidence: 'official',
    };
    events.set(event.eventId, event);
  }
  return [...events.values()].sort((left, right) => (
    compareText(left.effectiveAt, right.effectiveAt) || compareText(left.eventId, right.eventId)
  ));
}

function lifecycleFor(
  routes: readonly RouteFact[],
  inputs: readonly StrictModelJoinRouteInput[],
  asOf: string,
): Pick<StrictModelJoinModel, 'lifecycleStatus' | 'lifecycleEvents' | 'replacement'> {
  const sourceRef = routes[0]?.inputMicroDollarsPerMillion.sourceRefs[0];
  if (!sourceRef) {
    // This function is only called for an exact catalog join, but keep the
    // boundary explicit if malformed input somehow reaches it.
    throw new Error('strict model join lifecycle requires a catalog route source');
  }
  const lifecycleEvents = expirationEvents(inputs);
  const publishedExpirationDates = inputs.map((input) => canonicalCalendarDate(input.expirationDate));
  const effectiveTimes = [...new Set(lifecycleEvents.map((event) => event.effectiveAt))];
  const replacement = unavailable<{ readonly modelSlug: string; readonly migrationNote: string }>(
    'The exact reviewed catalog route does not publish a replacement model.',
    sourceRef,
  );
  if (effectiveTimes.length === 0) {
    return {
      lifecycleStatus: unavailable('No exact reviewed catalog lifecycle fact is available for this model.', sourceRef),
      lifecycleEvents,
      replacement,
    };
  }
  if (
    publishedExpirationDates.some((date) => date === null) ||
    effectiveTimes.length !== 1
  ) {
    return {
      lifecycleStatus: unavailable(
        'Exact reviewed catalog routes do not all publish one matching lifecycle date; no model-level status is inferred.',
        sourceRef,
      ),
      lifecycleEvents,
      replacement,
    };
  }
  return {
    lifecycleStatus: available(
      Date.parse(effectiveTimes[0]!) <= Date.parse(asOf) ? 'retired' : 'sunset_scheduled',
      sourceRef,
    ),
    lifecycleEvents,
    replacement,
  };
}

/** Creates a join only from explicit, reviewed, exact route input rows. */
export function buildStrictModelJoin(input: {
  readonly catalogRevision: string | null;
  readonly catalogObservedAt: string | null;
  readonly modalityBenchmarkRevision?: string | null;
  readonly asOf: string;
  readonly routes: readonly StrictModelJoinRouteInput[];
}): StrictModelJoin {
  const grouped = new Map<string, StrictModelJoinRouteInput[]>();
  // A caller without an active catalog revision has no route-fact authority,
  // even if an accidental in-memory row is supplied.
  for (const route of input.catalogRevision === null ? [] : input.routes) {
    if (!exactReviewedIdentity(route)) continue;
    const routes = grouped.get(route.liveBenchConfigurationId) ?? [];
    routes.push(route);
    grouped.set(route.liveBenchConfigurationId, routes);
  }

  const modelsByConfigurationId = new Map<string, StrictModelJoinModel>();
  const sources: SourceAttribution[] = [];
  for (const [configurationId, routeInputs] of grouped) {
    const valid = routeInputs
      .map((route) => ({ input: route, fact: routeFromInput(route) }))
      .filter((candidate): candidate is { input: StrictModelJoinRouteInput; fact: RouteFact } => candidate.fact !== null)
      .sort((left, right) => compareText(left.fact.providerId, right.fact.providerId)
        || compareText(left.fact.routeId, right.fact.routeId));
    if (valid.length === 0) continue;
    const routes = valid.map((candidate) => candidate.fact);
    const selectedRoute = routes[0]!;
    const lifecycle = lifecycleFor(routes, valid.map((candidate) => candidate.input), input.asOf);
    modelsByConfigurationId.set(configurationId, {
      configurationId,
      routes,
      selectedRoute,
      selectedRoutePolicy: 'First exact reviewed catalog route in stable provider and route-ID order.',
      ...lifecycle,
    });
    valid.forEach(({ input: route }) => {
      sources.push(route.source);
      if ((modalities(route.inputModalities).length > 0 || modalities(route.outputModalities).length > 0)
        && route.modalitySource !== null && route.modalitySource !== undefined) {
        sources.push(route.modalitySource);
      }
    });
  }
  return {
    catalogRevision: input.catalogRevision,
    catalogObservedAt: input.catalogRevision === null ? null : input.catalogObservedAt,
    modalityBenchmarkRevision: input.catalogRevision === null
      ? null
      : input.modalityBenchmarkRevision ?? null,
    sources: uniqueSources(sources),
    modelsByConfigurationId,
  };
}

function catalogSource(input: {
  readonly catalogRevision: string;
  readonly sourceId: string;
  readonly url: string;
  readonly observedAt: string;
}): SourceAttribution {
  return {
    sourceRef: `catalog:${input.catalogRevision}:${input.sourceId}`,
    fieldGroup: '/data',
    sourceId: input.sourceId,
    sourceRevision: input.catalogRevision,
    label: `Active catalog source ${input.sourceId}`,
    url: input.url,
    licenseId: input.sourceId.includes('openrouter') ? 'OpenRouter-ToS' : 'provider-terms',
    observedAt: input.observedAt,
    effectiveAt: input.observedAt,
  };
}

function sourceIdentity(sourceId: string, artifactId: string): string {
  return `${sourceId}\u0000${artifactId}`;
}

function benchmarkSource(
  snapshot: ActiveBenchmarkSnapshot,
  source: BenchmarkSourceRecord,
): SourceAttribution {
  return {
    sourceRef: `benchmark:${snapshot.revision.revision}:${source.sourceId}:${source.artifactId}`,
    fieldGroup: '/data',
    sourceId: source.sourceId,
    sourceRevision: snapshot.revision.revision,
    label: source.attributionText,
    url: source.sourceUrl,
    licenseId: source.licenseId,
    observedAt: source.observedAt,
    effectiveAt: source.observedAt,
  };
}

function priceModalities(
  snapshot: ActiveBenchmarkSnapshot | null,
  catalogRevision: string,
  row: Omit<StrictModelJoinRouteInput, 'inputModalities' | 'outputModalities' | 'modalitySource'>,
): Pick<StrictModelJoinRouteInput, 'inputModalities' | 'outputModalities' | 'modalitySource'> {
  if (snapshot === null || snapshot.revision.catalogRevision !== catalogRevision) return {};
  const sourceByIdentity = new Map(snapshot.sources.map((source) => [
    sourceIdentity(source.sourceId, source.artifactId),
    source,
  ]));
  const matches = snapshot.priceChecks.filter((price) => (
    price.modelKey === row.directoryModelKey
    && price.routeId === row.routeId
    && price.providerId === row.providerId
    && price.sourceModelId === row.catalogModelId
    && price.verificationStatus === 'primary'
  ));
  if (matches.length !== 1) return {};
  const price = matches[0]!;
  const source = sourceByIdentity.get(sourceIdentity(price.sourceId, price.sourceArtifactId));
  if (!source) return {};
  return {
    inputModalities: price.inputModalities,
    outputModalities: price.outputModalities,
    modalitySource: benchmarkSource(snapshot, source),
  };
}

async function all<T>(db: StrictModelJoinD1Database, sql: string, ...values: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...values).all<T>()).results;
}

/**
 * Why the strict join produced no routes.
 *
 * The join is an INNER JOIN through `model_configurations` gated on
 * `identity_review_status = 'verified'`. When identity review has never been
 * run, it returns zero rows and an empty leaderboard is indistinguishable from
 * "this source published nothing" -- the failure is real but silent, and it
 * looks like missing upstream data rather than a missing internal step.
 *
 * This reports which link in the chain is empty. It never relaxes the gate:
 * an unreviewed proposal must not become a published fact, so the remedy is
 * always to run identity review, never to widen the join.
 */
export interface StrictModelJoinIdentityCoverage {
  /** LiveBench configurations staged for this revision. */
  readonly stagedConfigurations: number;
  /** Of those, how many carry a canonical configuration binding. */
  readonly boundToCanonical: number;
  /** Of those, how many have cleared identity review and so reach the join. */
  readonly verified: number;
  /** Rows the full join actually yields once catalog and directory are applied. */
  readonly joinedRoutes: number;
  /**
   * Machine-readable reason an operator can act on. `ok` means the join is
   * working; every other value names the step that has not run.
   */
  readonly status:
    | 'ok'
    | 'no-livebench-configurations-staged'
    | 'identity-review-never-run'
    | 'identity-review-produced-no-verified-matches'
    | 'verified-matches-do-not-reach-catalog';
}

const IDENTITY_COVERAGE_SQL = `
  SELECT
    COUNT(*) AS staged,
    SUM(CASE WHEN canonical_configuration_id IS NOT NULL THEN 1 ELSE 0 END) AS bound,
    SUM(CASE WHEN canonical_configuration_id IS NOT NULL
              AND identity_review_status = 'verified' THEN 1 ELSE 0 END) AS verified
  FROM livebench_model_configurations
  WHERE revision = ?
`;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export async function readStrictModelJoinIdentityCoverage(input: {
  readonly db: StrictModelJoinD1Database;
  readonly liveBenchRevision: string;
  readonly joinedRoutes: number;
}): Promise<StrictModelJoinIdentityCoverage> {
  const rows = await all<{ staged: unknown; bound: unknown; verified: unknown }>(
    input.db,
    IDENTITY_COVERAGE_SQL,
    input.liveBenchRevision,
  );
  const row = rows[0];
  const stagedConfigurations = count(row?.staged);
  const boundToCanonical = count(row?.bound);
  const verified = count(row?.verified);
  const joinedRoutes = count(input.joinedRoutes);

  const status: StrictModelJoinIdentityCoverage['status'] = joinedRoutes > 0
    ? 'ok'
    : stagedConfigurations === 0
      ? 'no-livebench-configurations-staged'
      : boundToCanonical === 0
        ? 'identity-review-never-run'
        : verified === 0
          ? 'identity-review-produced-no-verified-matches'
          : 'verified-matches-do-not-reach-catalog';

  return { stagedConfigurations, boundToCanonical, verified, joinedRoutes, status };
}

/**
 * Reads only the active catalog revision and active, exact-reviewed canonical
 * bindings. It deliberately has no bootstrap, historical-profile, alias, or
 * name-matching fallback.
 */
export async function readStrictModelJoin(input: {
  readonly db: StrictModelJoinD1Database;
  readonly liveBenchRevision: string;
  readonly asOf: string;
}): Promise<StrictModelJoin> {
  const catalogRows = await all<ActiveCatalogContext>(input.db, ACTIVE_CATALOG_CONTEXT_SQL);
  if (catalogRows.length > 1) throw new Error('active catalog context query returned multiple rows');
  const catalog = catalogRows[0];
  if (!catalog) {
    return buildStrictModelJoin({
      catalogRevision: null,
      catalogObservedAt: null,
      asOf: input.asOf,
      routes: [],
    });
  }
  const revision = nonBlank(catalog.revision);
  const checkedAt = canonicalTimestamp(catalog.checked_at);
  if (!revision || !checkedAt) throw new Error('active catalog context is invalid');

  const [rows, snapshot] = await Promise.all([
    all<CatalogJoinRow>(input.db, ACTIVE_EXACT_ROUTE_ROWS_SQL, revision, input.liveBenchRevision),
    readActiveBenchmarkSnapshot(input.db as unknown as BenchmarkD1Database),
  ]);
  const routes = rows.flatMap((row): StrictModelJoinRouteInput[] => {
    const configurationId = nonBlank(row.configuration_id);
    const canonicalConfigurationId = nullableString(row.canonical_configuration_id);
    const canonicalModelKey = nullableString(row.canonical_model_key);
    const directoryModelKey = nonBlank(row.directory_model_key);
    const directoryCanonicalSlug = nonBlank(row.canonical_slug);
    const directorySourceModelId = nonBlank(row.directory_source_model_id);
    const routeId = nonBlank(row.route_id);
    const providerId = nonBlank(row.provider_id);
    const catalogModelId = nonBlank(row.catalog_model_id);
    const sourceId = nonBlank(row.source_id);
    const sourceUrl = nonBlank(row.source_url);
    const observedAt = canonicalTimestamp(row.source_observed_at);
    const inputPrice = nonNegativeInteger(row.input_micro_dollars_per_million);
    const outputPrice = nonNegativeInteger(row.output_micro_dollars_per_million);
    if (!configurationId || !canonicalConfigurationId || !canonicalModelKey || !directoryModelKey
      || !directoryCanonicalSlug || !directorySourceModelId || !routeId || !providerId
      || !catalogModelId || !sourceId || !sourceUrl || !observedAt
      || inputPrice === null || outputPrice === null) return [];
    const availability = row.availability === 'available' || row.availability === 'limited' || row.availability === 'deprecated'
      ? row.availability
      : row.availability === null ? null : null;
    const base: Omit<StrictModelJoinRouteInput, 'inputModalities' | 'outputModalities' | 'modalitySource'> = {
      liveBenchConfigurationId: configurationId,
      canonicalConfigurationId,
      liveBenchIdentityMatchKind: row.identity_match_kind === 'exact' || row.identity_match_kind === 'reviewed'
        ? row.identity_match_kind
        : 'proposal',
      liveBenchIdentityReviewStatus: row.identity_review_status === 'verified'
        || row.identity_review_status === 'needs_review'
        || row.identity_review_status === 'rejected'
        ? row.identity_review_status
        : 'needs_review',
      canonicalModelKey,
      directoryModelKey,
      directoryCanonicalSlug,
      directorySourceModelId,
      routeId,
      providerId,
      catalogModelId,
      availability,
      inputMicroDollarsPerMillion: inputPrice,
      cacheReadMicroDollarsPerMillion: row.cached_input_micro_dollars_per_million === null
        ? null
        : nonNegativeInteger(row.cached_input_micro_dollars_per_million),
      cacheWriteMicroDollarsPerMillion: row.cache_write_micro_dollars_per_million === null
        || row.cache_write_micro_dollars_per_million === undefined
        ? null
        : nonNegativeInteger(row.cache_write_micro_dollars_per_million),
      outputMicroDollarsPerMillion: outputPrice,
      contextWindowTokens: row.context_window_tokens === null ? null : positiveIntegerOrNull(row.context_window_tokens),
      maxOutputTokens: row.max_output_tokens === null ? null : positiveIntegerOrNull(row.max_output_tokens),
      expirationDate: nullableString(row.expiration_date),
      source: catalogSource({ catalogRevision: revision, sourceId, url: sourceUrl, observedAt }),
    };
    return [{ ...base, ...priceModalities(snapshot, revision, base) }];
  });
  return buildStrictModelJoin({
    catalogRevision: revision,
    catalogObservedAt: checkedAt,
    modalityBenchmarkRevision: snapshot?.revision.catalogRevision === revision ? snapshot.revision.revision : null,
    asOf: input.asOf,
    routes,
  });
}

function unavailableWarnings(value: unknown): DataWarning[] {
  const warnings: DataWarning[] = [];
  const walk = (current: unknown, path: string): void => {
    if (Array.isArray(current)) {
      current.forEach((entry, index) => walk(entry, `${path}/${index}`));
      return;
    }
    if (!current || typeof current !== 'object') return;
    const record = current as Record<string, unknown>;
    if (record.availability === 'unavailable' && record.value === null) {
      warnings.push({
        code: 'strict_model_join_field_unavailable',
        fieldGroup: path,
        state: 'unknown',
        message: typeof record.reason === 'string' && record.reason.trim().length > 0
          ? record.reason
          : 'This strict model-join field is unavailable.',
      });
      return;
    }
    Object.entries(record).forEach(([key, nested]) => walk(nested, `${path}/${key}`));
  };
  walk(value, '/data');
  return warnings;
}

function sourcesForEnvelope(
  liveBenchSource: SourceAttribution,
  join: StrictModelJoin,
): readonly SourceAttribution[] {
  return uniqueSources([liveBenchSource, ...join.sources]);
}

export interface StrictModelJoinEnvelopeContext {
  readonly revision: string;
  readonly releasedAt: string;
  readonly checkedAt: string;
  readonly source: SourceAttribution;
}

/** Builds a mixed-source envelope without ever flattening source timestamps. */
export function buildStrictModelJoinEnvelope<
  M extends 'models' | 'profile' | 'comparison' | 'rankings',
  R,
  D extends object,
>(input: {
  readonly method: M;
  readonly request: R;
  readonly data: D;
  readonly context: StrictModelJoinEnvelopeContext;
  readonly join: StrictModelJoin;
  readonly fetchedAt: string;
}): UiDataContractV1Envelope<M, R, D> {
  const warnings = unavailableWarnings(input.data);
  const sources = sourcesForEnvelope(input.context.source, input.join);
  return buildUiDataContractV1Envelope({
    method: input.method,
    request: input.request,
    status: warnings.length === 0 ? 'available' : 'partial',
    reason: null,
    fetchedAt: input.fetchedAt,
    data: input.data,
    revisions: {
      projection: [
        'strict-model-join-v1',
        input.context.revision,
        input.join.catalogRevision ?? 'no-catalog',
        input.join.modalityBenchmarkRevision ?? 'no-route-modalities',
        input.method,
      ].join(':'),
      catalog: input.join.catalogRevision,
      benchmark: input.context.revision,
      runtimeObservationSet: null,
      projectionMethodology: 'livebench-canonical-catalog-strict-model-join-v1',
    },
    freshness: {
      catalogObservedAt: input.join.catalogObservedAt,
      runtimeObservedAt: null,
      benchmarkReleasedAt: input.context.releasedAt,
      benchmarkCheckedAt: input.context.checkedAt,
    },
    sources,
    warnings,
  });
}
