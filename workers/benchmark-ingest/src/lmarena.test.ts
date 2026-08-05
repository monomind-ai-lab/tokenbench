import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateNormalizedSourceBatch } from '../../../src/benchmarks/contracts';
import { LMARENA_SUBSETS, parseLmArenaSubset } from './lmarena';

interface StandardArenaRow {
  model_name: string;
  organization: string;
  license: string;
  rating: number;
  rating_lower: number | null;
  rating_upper: number | null;
  variance: number;
  vote_count: number;
  rank: number;
  category: string;
  leaderboard_publish_date: string;
}

interface AgentArenaRow {
  model_name: string;
  organization: string;
  license: string;
  score: number;
  score_ci_lower: number | null;
  score_ci_upper: number | null;
  observation_count: number;
  session_count: number;
  rank: number;
  category: string;
  leaderboard_publish_date: string;
}

interface DatasetViewerRow<T> {
  row_idx: number;
  row: T;
  truncated_cells: unknown[];
}

interface ArtifactProvenanceFixture {
  artifactId: string;
  sourceUrl: string;
  subset: string;
  split: string;
  category: string;
  offset: number;
  length: number;
  etag: string | null;
  lastModified: string | null;
  upstreamRevision: string | null;
  schemaVersion: string | null;
  snapshotKey: string;
  contentHash: string;
  originalContentHash: string;
}

function loadFixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

const observedAt = '2026-08-05T00:00:00.000Z';
const standardFixture = loadFixture<{ provenance: ArtifactProvenanceFixture; rows: DatasetViewerRow<StandardArenaRow>[] }>('../test-fixtures/lmarena/text_style_control.json');
const laterStandardFixture = loadFixture<{ provenance: ArtifactProvenanceFixture; rows: DatasetViewerRow<StandardArenaRow>[] }>('../test-fixtures/lmarena/text_style_control_page_100.json');
const agentFixture = loadFixture<{ provenance: ArtifactProvenanceFixture; rows: DatasetViewerRow<AgentArenaRow>[] }>('../test-fixtures/lmarena/agent.json');
const imageFixture = loadFixture<{ provenance: ArtifactProvenanceFixture; rows: DatasetViewerRow<StandardArenaRow>[] }>('../test-fixtures/lmarena/text_to_image.json');
const standardProvenance = standardFixture.provenance;
const agentProvenance = agentFixture.provenance;

describe('LMArena normalization', () => {
  it('locks the reviewed public Arena subsets', () => {
    expect(LMARENA_SUBSETS).toEqual([
      'text_style_control',
      'vision_style_control',
      'search_style_control',
      'document_style_control',
      'webdev',
      'agent',
      'text_to_image',
      'image_edit',
      'text_to_video',
      'image_to_video',
      'video_edit',
    ]);
  });

  it('maps standard ratings to Bradley-Terry Arena Score evidence with artifact attribution', () => {
    const batch = parseLmArenaSubset('text_style_control', standardFixture.rows, observedAt, standardProvenance);
    const metric = batch.metrics[0];

    expect(batch.sources).toEqual([expect.objectContaining({
      sourceId: 'lmarena',
      artifactId: 'text_style_control:latest:overall:rows-0-100',
      sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=0&length=100',
      snapshotKey: standardProvenance.snapshotKey,
      contentHash: standardProvenance.contentHash,
      originalContentHash: standardProvenance.originalContentHash,
      upstreamRevision: standardProvenance.upstreamRevision,
      licenseId: 'CC-BY-4.0',
      attributionText: 'Arena ratings from LMArena',
    })]);
    expect(batch.models[0]).toMatchObject({
      modelKey: 'source:lmarena:claude-fable-5',
      evidenceStatus: 'source_only',
      rankingEligible: true,
      sourceArtifactId: 'text_style_control:latest:overall:rows-0-100',
    });
    expect(metric).toMatchObject({
      metricKey: 'lmarena:text_style_control:overall',
      category: 'overall',
      value: 1508.576862666775,
      lower: 1502.750545162002,
      upper: 1514.403180171548,
      voteCount: 17799,
      rank: 1,
      unit: 'arena_score',
      methodology: 'bradley_terry',
      observationCount: null,
      sessionCount: null,
      sourceUpdatedAt: '2026-08-03T00:00:00.000Z',
    });
  });

  it('maps Agent Arena scores to IPS evidence without calling them Arena Score', () => {
    const batch = parseLmArenaSubset('agent', agentFixture.rows, observedAt, agentProvenance);
    const metric = batch.metrics[0];

    expect(metric).toMatchObject({
      metricKey: 'lmarena:agent:overall:ips',
      category: 'overall',
      value: 0.12099932361820687,
      lower: 0.10701570657993759,
      upper: 0.13498294065647615,
      rank: 1,
      voteCount: null,
      unit: 'score',
      methodology: 'ips',
      observationCount: 1845220,
      sessionCount: 19135,
    });
    expect(metric.unit).not.toBe('arena_score');
  });

  it('preserves signed IPS scores and confidence bounds from the official Agent Arena schema', () => {
    const row = {
      ...agentFixture.rows[0].row,
      model_name: 'Qwen3.7 Max',
      score: -0.0019042599988607666,
      score_ci_lower: -0.010797532242106361,
      score_ci_upper: 0.006989012244384828,
      rank: 25,
    };

    const metric = parseLmArenaSubset('agent', [row], observedAt, agentProvenance).metrics[0];

    expect(metric).toMatchObject({
      value: -0.0019042599988607666,
      lower: -0.010797532242106361,
      upper: 0.006989012244384828,
      methodology: 'ips',
    });
  });

  it('preserves missing confidence bounds as null', () => {
    const row = {
      ...standardFixture.rows[0].row,
      rating_lower: null,
      rating_upper: null,
    };

    const metric = parseLmArenaSubset('text_style_control', [row], observedAt, standardProvenance).metrics[0];

    expect(metric.lower).toBeNull();
    expect(metric.upper).toBeNull();
  });

  it('keeps an explicitly unknown upstream license unknown', () => {
    const batch = parseLmArenaSubset('text_style_control', [{
      ...standardFixture.rows[0].row,
      license: 'Unknown',
    }], observedAt, standardProvenance);

    expect(batch.models[0].sourceType).toBe('Unknown');
  });

  it('accepts a future category only when its descriptor and exact URL name that filter', () => {
    const row = { ...standardFixture.rows[0].row, category: 'creative_writing' };
    const creativeWritingArtifact = {
      ...standardProvenance,
      artifactId: 'text_style_control:latest:creative_writing:rows-0-100',
      category: 'creative_writing',
      sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27creative_writing%27&offset=0&length=100',
      snapshotKey: standardProvenance.snapshotKey.replace('/overall/', '/creative_writing/'),
    };

    const metric = parseLmArenaSubset('text_style_control', [row], observedAt, creativeWritingArtifact).metrics[0];

    expect(metric).toMatchObject({
      category: 'creative_writing',
      metricKey: 'lmarena:text_style_control:creative_writing',
    });
  });

  it('normalizes live blank and whitespace organization strings to explicit Unknown', () => {
    expect(parseLmArenaSubset(
      'text_style_control',
      laterStandardFixture.rows,
      observedAt,
      laterStandardFixture.provenance,
    ).models[0].creator).toBe('Unknown');
    expect(parseLmArenaSubset(
      'text_to_image',
      imageFixture.rows,
      observedAt,
      imageFixture.provenance,
    ).models[0].creator).toBe('Unknown');

    const whitespaceRow = { ...laterStandardFixture.rows[0].row, organization: ' \t ' };
    expect(parseLmArenaSubset(
      'text_style_control',
      [whitespaceRow],
      observedAt,
      laterStandardFixture.provenance,
    ).models[0].creator).toBe('Unknown');
  });

  it('still rejects malformed non-string organization values', () => {
    const malformedRow = { ...laterStandardFixture.rows[0].row, organization: 42 };

    expect(() => parseLmArenaSubset(
      'text_style_control',
      [malformedRow],
      observedAt,
      laterStandardFixture.provenance,
    )).toThrow(/organization.*string/i);
  });

  it('keeps exact page URLs and distinct source-artifact identities when pages merge', () => {
    const firstPage = parseLmArenaSubset('text_style_control', standardFixture.rows, observedAt, standardProvenance);
    const secondPage = parseLmArenaSubset(
      'text_style_control',
      laterStandardFixture.rows,
      observedAt,
      laterStandardFixture.provenance,
    );
    const merged = validateNormalizedSourceBatch({
      sources: [...firstPage.sources, ...secondPage.sources],
      models: [...firstPage.models, ...secondPage.models],
      metrics: [...firstPage.metrics, ...secondPage.metrics],
      priceChecks: [],
      comparisonSeeds: [],
    });

    expect(merged.sources.map(({ artifactId, sourceUrl }) => ({ artifactId, sourceUrl }))).toEqual([
      {
        artifactId: 'text_style_control:latest:overall:rows-0-100',
        sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=0&length=100',
      },
      {
        artifactId: 'text_style_control:latest:overall:rows-100-200',
        sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=100&length=100',
      },
    ]);
  });

  it('rejects a row whose category does not match its page descriptor', () => {
    const mismatchedRow = { ...standardFixture.rows[0].row, category: 'creative_writing' };

    expect(() => parseLmArenaSubset(
      'text_style_control',
      [mismatchedRow],
      observedAt,
      standardProvenance,
    )).toThrow(/row 0.*category.*descriptor/i);
  });

  it('rejects missing Hugging Face x-revision provenance', () => {
    expect(() => parseLmArenaSubset(
      'text_style_control',
      standardFixture.rows,
      observedAt,
      { ...standardProvenance, upstreamRevision: null },
    )).toThrow(/x-revision/i);
  });

  it('rejects descriptor subset and exact URL query mismatches', () => {
    expect(() => parseLmArenaSubset(
      'text_style_control',
      standardFixture.rows,
      observedAt,
      {
        ...standardProvenance,
        subset: 'vision_style_control',
        artifactId: 'vision_style_control:latest:overall:rows-0-100',
        sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=vision_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=0&length=100',
      },
    )).toThrow(/descriptor subset/i);

    expect(() => parseLmArenaSubset(
      'text_style_control',
      standardFixture.rows,
      observedAt,
      { ...standardProvenance, sourceUrl: standardProvenance.sourceUrl.replace('offset=0', 'offset=1') },
    )).toThrow(/exact official.*URL/i);

    expect(() => parseLmArenaSubset(
      'text_style_control',
      standardFixture.rows,
      observedAt,
      { ...standardProvenance, artifactId: 'text_style_control-latest-overall' },
    )).toThrow(/artifactId.*page bounds/i);
  });

  it('rejects page descriptors outside the frozen 100-row request grid', () => {
    expect(() => parseLmArenaSubset(
      'text_style_control',
      standardFixture.rows,
      observedAt,
      {
        ...standardProvenance,
        artifactId: 'text_style_control:latest:overall:rows-0-50',
        sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=0&length=50',
        length: 50,
      },
    )).toThrow(/length.*exactly 100/i);

    expect(() => parseLmArenaSubset(
      'text_style_control',
      standardFixture.rows,
      observedAt,
      {
        ...standardProvenance,
        artifactId: 'text_style_control:latest:overall:rows-50-150',
        sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=50&length=100',
        offset: 50,
      },
    )).toThrow(/offset.*multiple of 100/i);
  });

  it('rejects truncated Dataset Viewer records rather than publishing incomplete evidence', () => {
    expect(() => parseLmArenaSubset('text_style_control', [{
      ...standardFixture.rows[0],
      truncated_cells: ['rating'],
    }], observedAt, standardProvenance)).toThrow(/truncated/i);
  });

  it('rejects count fields that belong to the other Arena methodology', () => {
    expect(() => parseLmArenaSubset('text_style_control', [{
      ...standardFixture.rows[0].row,
      observation_count: 2,
    }], observedAt, standardProvenance)).toThrow(/does not accept agent counts/i);
    expect(() => parseLmArenaSubset('agent', [{
      ...agentFixture.rows[0].row,
      vote_count: 2,
    }], observedAt, agentProvenance)).toThrow(/does not accept vote counts/i);
  });

  it('rejects an Arena subset that is not on the reviewed allowlist', () => {
    expect(() => parseLmArenaSubset('speech_to_text', standardFixture.rows, observedAt, standardProvenance)).toThrow(/not accepted/i);
  });

  it('requires explicit per-artifact provenance instead of emitting a durable placeholder', () => {
    expect(() => parseLmArenaSubset('text_style_control', standardFixture.rows, observedAt, undefined as never))
      .toThrow(/provenance is required/i);
  });
});
