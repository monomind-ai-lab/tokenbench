import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PRICE_PERFORMANCE_ARCHIVED_LIMIT,
  pricePerformanceEnvelopeData,
  readPricePerformanceProjection,
  type InvalidPricePerformancePointLog,
} from './price-performance-db';

const REVISION = 'benchmark-revision-1';
const PUBLISHED_AT = '2026-08-05T00:00:00.000Z';
const CHECKED_AT = '2026-08-05T12:00:00.000Z';
const CATALOG_REVISION = 'catalog-revision-1';

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const OPENROUTER_CONTENT_HASH = hash('1');
const OPENROUTER_ARTIFACT_ID = `catalog:${CATALOG_REVISION}`;
const REVISION_CONTENT_HASH = `sha256:${createHash('sha256').update(JSON.stringify({
  catalogRevision: CATALOG_REVISION,
  openrouterContentHash: OPENROUTER_CONTENT_HASH,
  artifacts: [
    { sourceId: 'benchlm', artifactId: 'models', contentHash: hash('c') },
    { sourceId: 'lmarena', artifactId: 'text-style-control', contentHash: hash('e') },
    { sourceId: 'openrouter', artifactId: OPENROUTER_ARTIFACT_ID, contentHash: OPENROUTER_CONTENT_HASH },
  ],
})).digest('hex')}`;

const revision = {
  revision: REVISION,
  generated_at: '2026-08-05T11:30:00.000Z',
  published_at: PUBLISHED_AT,
  checked_at: CHECKED_AT,
  publication_state: 'published',
  content_hash: REVISION_CONTENT_HASH,
  catalog_revision: CATALOG_REVISION,
  openrouter_content_hash: OPENROUTER_CONTENT_HASH,
};

const sources = [
  {
    revision: REVISION,
    source_id: 'benchlm',
    artifact_id: 'models',
    source_url: 'https://benchlm.ai/data/models.json',
    observed_at: '2026-08-05T11:00:00.000Z',
    etag: '"benchlm-models"',
    last_modified: null,
    upstream_revision: 'benchlm-r1',
    schema_version: '1.0',
    snapshot_key: 'benchmarks/benchlm/models-r1.json',
    content_hash: hash('c'),
    original_content_hash: hash('d'),
    license_id: 'MIT',
    attribution_text: 'BenchLM',
  },
  {
    revision: REVISION,
    source_id: 'lmarena',
    artifact_id: 'text-style-control',
    source_url: 'https://huggingface.co/datasets/lmarena-ai/leaderboard',
    observed_at: '2026-08-05T11:05:00.000Z',
    etag: null,
    last_modified: null,
    upstream_revision: 'arena-r1',
    schema_version: null,
    snapshot_key: 'benchmarks/lmarena/text-style-control-r1.json',
    content_hash: hash('e'),
    original_content_hash: hash('f'),
    license_id: 'CC-BY-4.0',
    attribution_text: 'LMArena',
  },
  {
    revision: REVISION,
    source_id: 'openrouter',
    artifact_id: OPENROUTER_ARTIFACT_ID,
    source_url: 'https://openrouter.ai/api/v1/models',
    observed_at: '2026-08-05T11:10:00.000Z',
    etag: '"openrouter-r1"',
    last_modified: null,
    upstream_revision: CATALOG_REVISION,
    schema_version: null,
    snapshot_key: 'catalog/openrouter/models-r1.json',
    content_hash: OPENROUTER_CONTENT_HASH,
    original_content_hash: hash('1'),
    license_id: 'OpenRouter-ToS',
    attribution_text: '[PERSON_NAME]',
  },
];

function modelRow(key: string, slug: string, name: string, creator = 'Provider') {
  return {
    revision: REVISION,
    model_key: key,
    slug,
    name,
    creator,
    source_type: 'Proprietary',
    reasoning_type: null,
    release_date: null,
    context_window_tokens: null,
    evidence_status: 'supported',
    ranking_eligible: 1,
    confidence_lower: null,
    confidence_upper: null,
    benchmark_count: 2,
    source_id: 'benchlm',
    source_model_id: `provider/${slug}`,
    source_artifact_id: 'models',
  };
}

function metricRow(modelKey: string, metricKey: string, category: string, value: number) {
  return {
    revision: REVISION,
    model_key: modelKey,
    metric_key: metricKey,
    category,
    value,
    rank: null,
    lower_bound: null,
    upper_bound: null,
    vote_count: null,
    unit: 'score',
    source_id: 'benchlm',
    source_updated_at: '2026-08-05T10:00:00.000Z',
    source_model_id: 'provider/alpha',
    source_artifact_id: 'models',
    ranking_eligible: 1,
    methodology: 'benchlm_raw_composite',
    observation_count: null,
    session_count: null,
  };
}

function priceRow(modelKey: string, slug: string, input: number | null, output: number | null) {
  return {
    revision: REVISION,
    model_key: modelKey,
    source_id: 'openrouter',
    provider_id: 'openrouter',
    route_id: `openrouter:provider/${slug}`,
    source_model_id: `provider/${slug}`,
    canonical_slug: slug,
    input_usd_per_million: input,
    cached_input_usd_per_million: null,
    output_usd_per_million: output,
    context_window_tokens: null,
    max_input_tokens: null,
    max_output_tokens: 16_000,
    input_modalities_json: JSON.stringify(['text']),
    output_modalities_json: JSON.stringify(['text']),
    supported_parameters_json: null,
    source_artifact_id: OPENROUTER_ARTIFACT_ID,
    verification_status: 'primary',
  };
}

const pairs = [
  {
    revision: REVISION,
    pair_slug: 'alpha-vs-beta',
    model_a_key: 'provider:alpha',
    model_b_key: 'provider:beta',
    indexable: 1,
    eligibility_reason: 'Reviewed comparison pair',
    featured_rank: 1,
    shared_metric_count: 2,
  },
];

function archivedDirectoryRow(key: string, slug: string, latestRevision = 'rev-3') {
  return {
    model_key: key,
    canonical_slug: slug,
    display_name: slug === 'archived-one' ? 'Archived One' : slug,
    creator: 'Provider',
    source_type: 'Proprietary',
    reasoning_type: null,
    family_id: 'family-archived',
    variant_id: null,
    first_seen_revision: 'rev-1',
    first_seen_at: NOW,
    last_seen_revision: 'rev-2',
    last_seen_at: NOW,
    latest_profile_revision: latestRevision,
    status: 'archived',
    source_id: 'benchlm',
    source_model_id: `provider/${slug}`,
    updated_at: NOW,
  };
}

function archivedSnapshotRow(key: string, slug: string, revisionValue = 'rev-3', score = 88) {
  const displayName = slug === 'archived-one' ? 'Archived One' : slug;
  const identity = {
    modelKey: key,
    slug,
    displayName,
    creator: 'Provider',
    sourceType: 'Proprietary',
    reasoningType: null,
    familyId: 'family-archived',
    variantId: null,
    releaseDate: null,
  };
  const holder = {
    identity,
    revision: { revision: revisionValue, generatedAt: NOW, publishedAt: NOW, checkedAt: NOW },
    summary: {
      overallScore: score,
      overallRank: 8,
      evidenceStatus: 'supported',
      benchmarkCount: 2,
      coverage: { benchmarkCount: 2, categoryCount: 2, rankedCategoryCount: 2, sourceCount: 1 },
      generatedAt: NOW,
      publishedAt: NOW,
      checkedAt: NOW,
      strongestEvidence: `Public overall score ${score} at source rank #8.`,
      validateBeforeChoosing: 'Validate current route pricing before choosing.',
    },
    radar: [
      { key: 'overall', label: 'Overall', percentile: 70, rank: 8, fieldSize: 31 },
      { key: 'coding', label: 'Coding', percentile: 80, rank: 7, fieldSize: 31 },
    ],
    categories: [
      {
        key: 'overall', metricKey: 'benchlm:overall:raw', label: 'Overall', score,
        rawScore: null, rank: 8, fieldSize: 31, percentile: 70, evidenceStatus: 'supported',
        benchmarkCount: 2, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
      },
      {
        key: 'coding', metricKey: 'benchlm:category:coding', label: 'Coding', score: 80,
        rawScore: null, rank: 7, fieldSize: 31, percentile: 80, evidenceStatus: 'supported',
        benchmarkCount: 2, rankingEligible: true, unit: 'score', sourceId: 'benchlm',
      },
    ],
    priceRoutes: [{
      sourceId: 'openrouter', providerId: 'openrouter', routeId: `openrouter:provider/${slug}`,
      sourceModelId: `provider/${slug}`, canonicalSlug: slug, inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: null, outputUsdPerMillion: 6, contextWindowTokens: 128_000,
      maxInputTokens: null, maxOutputTokens: 16_000, inputModalities: ['text'],
      outputModalities: ['text'], supportedParameters: ['tools'], verificationStatus: 'primary',
      sourceArtifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/models', observedAt: NOW,
    }],
    specifications: {
      contextWindowTokens: 128_000, maxInputTokens: null, maxOutputTokens: 16_000,
      inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['tools'],
      releaseDate: null, sourceType: 'Proprietary', selfHostingAvailable: null,
    },
    ledger: [{
      metricKey: 'benchlm:overall:raw', category: 'overall', benchmarkName: 'Overall',
      displayValue: score, rawValue: null, unit: 'score', rank: 8,
      bestVerifiedComparison: null, gap: null, weight: null, evidenceStatus: 'supported',
      observedAt: NOW, sourceId: 'benchlm', sourceArtifactId: 'benchlm-models',
      sourceUrl: 'https://benchlm.ai/leaderboard',
    }],
    comparisons: [],
    sources: [{
      sourceId: 'benchlm', artifactId: 'benchlm-models', sourceUrl: 'https://benchlm.ai/leaderboard',
      observedAt: NOW, attributionText: 'BenchLM public leaderboard',
    }],
  };
  return { model_key: key, revision: revisionValue, profile_json: JSON.stringify(holder), generated_at: NOW };
}

const NOW = '2026-08-05T13:00:00.000Z';

interface Rows {
  activeRevision: string | null;
  revisions: unknown[];
  sources: unknown[];
  models: unknown[];
  metrics: unknown[];
  prices: unknown[];
  pairs: unknown[];
  archivedDirectory: unknown[];
  archivedSnapshots: unknown[];
}

function rows(overrides: Partial<Rows> = {}): Rows {
  return {
    activeRevision: REVISION,
    revisions: [revision],
    sources,
    models: [
      modelRow('provider:alpha', 'alpha', 'Alpha'),
      modelRow('provider:beta', 'beta', 'Beta'),
      modelRow('provider:invalid-price', 'invalid-price', 'Invalid price'),
    ],
    metrics: [
      metricRow('provider:alpha', 'benchlm:overall:raw', 'overall', 90),
      metricRow('provider:beta', 'benchlm:overall:raw', 'overall', 80),
      metricRow('provider:invalid-price', 'benchlm:overall:raw', 'overall', 70),
    ],
    prices: [
      priceRow('provider:alpha', 'alpha', 0, 4),
      priceRow('provider:beta', 'beta', 1, 3),
      priceRow('provider:invalid-price', 'invalid-price', null, null),
    ],
    pairs,
    archivedDirectory: [
      archivedDirectoryRow('provider:archived-one', 'archived-one'),
    ],
    archivedSnapshots: [
      archivedSnapshotRow('provider:archived-one', 'archived-one'),
    ],
    ...overrides,
  };
}

function d1(data: Rows) {
  const bindings: Array<{ sql: string; values: unknown[] }> = [];
  return {
    bindings,
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          bindings.push({ sql, values });
          return {
            all: async () => {
              if (sql.includes('benchmark_publication_state') || sql.includes('FROM benchmark_revisions AS revisions ON revisions.revision')) {
                return { results: data.revisions };
              }
              if (sql.includes('benchmark_source_records')) return { results: data.sources };
              if (sql.includes('benchmark_models')) return { results: data.models };
              if (sql.includes('benchmark_metrics')) return { results: data.metrics };
              if (sql.includes('benchmark_price_checks')) return { results: data.prices };
              if (sql.includes('benchmark_comparison_pairs')) return { results: data.pairs };
              if (sql.includes('benchmark_model_directory')) return { results: data.archivedDirectory };
              if (sql.includes('benchmark_model_profile_snapshots')) return { results: data.archivedSnapshots };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

describe('readPricePerformanceProjection', () => {
  it('joins corrected metrics, complete prices, and durable slugs without losing unrelated rows', async () => {
    const projection = await readPricePerformanceProjection(d1(rows()), { includeArchived: false });
    const slugs = projection.points.map((point) => point.slug);
    expect(slugs).toContain('alpha');
    expect(slugs).toContain('beta');
    expect(projection.points.some((point) => point.slug === 'alpha')).toBe(true);
    expect(projection.points.some((point) => point.slug === 'invalid-price')).toBe(false);
  });

  it('includes retained archived profiles only when explicitly requested', async () => {
    const current = await readPricePerformanceProjection(d1(rows()), { includeArchived: false });
    expect(current.points.some((point) => point.status === 'archived')).toBe(false);

    const extended = await readPricePerformanceProjection(d1(rows()), { includeArchived: true });
    expect(extended.points.some((point) => point.status === 'archived')).toBe(true);
    const archived = extended.points.find((point) => point.status === 'archived');
    expect(archived?.slug).toBe('archived-one');
    expect(archived?.scores.overall).toBe(88);
  });

  it('bounds the archived path and reports when more records exist', async () => {
    const manyArchived = Array.from({ length: PRICE_PERFORMANCE_ARCHIVED_LIMIT + 12 }, (_, index) => (
      archivedDirectoryRow(`provider:archived-${index}`, `archived-${index}`)
    ));
    const manySnapshots = manyArchived.map((row) => (
      archivedSnapshotRow(row.model_key, row.canonical_slug)
    ));
    const projection = await readPricePerformanceProjection(d1(rows({
      archivedDirectory: manyArchived,
      archivedSnapshots: manySnapshots,
    })), { includeArchived: true });
    const archived = projection.points.filter((point) => point.status === 'archived');
    expect(archived.length).toBeLessThanOrEqual(PRICE_PERFORMANCE_ARCHIVED_LIMIT);
    expect(projection.archivedHasMore).toBe(true);
  });

  it('isolates one invalid price row with a safe log entry and advertises both statuses', async () => {
    const logs: InvalidPricePerformancePointLog[] = [];
    const projection = await readPricePerformanceProjection(d1(rows()), {
      includeArchived: false,
      log: (entry) => logs.push(entry),
    });
    expect(projection.points.some((point) => point.slug === 'invalid-price')).toBe(false);

    const invalid = logs.find((entry) => entry.modelKey === 'provider:invalid-price');
    expect(invalid).toBeDefined();
    expect(invalid?.sourceId).toBe('benchlm');
    expect(invalid?.reason).toBe('invalid-price');
    // Never leaks a route body, price, or unrelated point detail.
    expect(JSON.stringify(logs)).not.toMatch(/openrouter:provider\/invalid-price|\$|usd|body/);

    const data = pricePerformanceEnvelopeData(projection.points);
    // Status capability advertises the supported endpoint modes, not only rows present.
    expect(data.capabilities.statuses).toEqual(['current', 'archived']);
  });
});
