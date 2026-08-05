import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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

function loadFixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

const observedAt = '2026-08-05T00:00:00.000Z';
const standardFixture = loadFixture<{ rows: DatasetViewerRow<StandardArenaRow>[] }>('../test-fixtures/lmarena/text_style_control.json');
const agentFixture = loadFixture<{ rows: DatasetViewerRow<AgentArenaRow>[] }>('../test-fixtures/lmarena/agent.json');

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
    const batch = parseLmArenaSubset('text_style_control', standardFixture.rows, observedAt);
    const metric = batch.metrics[0];

    expect(batch.sources).toEqual([expect.objectContaining({
      sourceId: 'lmarena',
      artifactId: 'text_style_control-latest-overall',
      sourceUrl: 'https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=0&length=100',
      licenseId: 'CC-BY-4.0',
      attributionText: 'Arena ratings from LMArena',
    })]);
    expect(batch.models[0]).toMatchObject({
      modelKey: 'source:lmarena:claude-fable-5',
      evidenceStatus: 'source_only',
      rankingEligible: true,
      sourceArtifactId: 'text_style_control-latest-overall',
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
    const batch = parseLmArenaSubset('agent', agentFixture.rows, observedAt);
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

    const metric = parseLmArenaSubset('agent', [row], observedAt).metrics[0];

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

    const metric = parseLmArenaSubset('text_style_control', [row], observedAt).metrics[0];

    expect(metric.lower).toBeNull();
    expect(metric.upper).toBeNull();
  });

  it('keeps an explicitly unknown upstream license unknown', () => {
    const batch = parseLmArenaSubset('text_style_control', [{
      ...standardFixture.rows[0].row,
      license: 'Unknown',
    }], observedAt);

    expect(batch.models[0].sourceType).toBe('Unknown');
  });

  it('preserves a source category for future filtered views without inventing a new route', () => {
    const row = { ...standardFixture.rows[0].row, category: 'creative_writing' };

    const metric = parseLmArenaSubset('text_style_control', [row], observedAt).metrics[0];

    expect(metric).toMatchObject({
      category: 'creative_writing',
      metricKey: 'lmarena:text_style_control:creative_writing',
    });
  });

  it('rejects truncated Dataset Viewer records rather than publishing incomplete evidence', () => {
    expect(() => parseLmArenaSubset('text_style_control', [{
      ...standardFixture.rows[0],
      truncated_cells: ['rating'],
    }], observedAt)).toThrow(/truncated/i);
  });

  it('rejects count fields that belong to the other Arena methodology', () => {
    expect(() => parseLmArenaSubset('text_style_control', [{
      ...standardFixture.rows[0].row,
      observation_count: 2,
    }], observedAt)).toThrow(/does not accept agent counts/i);
    expect(() => parseLmArenaSubset('agent', [{
      ...agentFixture.rows[0].row,
      vote_count: 2,
    }], observedAt)).toThrow(/does not accept vote counts/i);
  });

  it('rejects an Arena subset that is not on the reviewed allowlist', () => {
    expect(() => parseLmArenaSubset('speech_to_text', standardFixture.rows, observedAt)).toThrow(/not accepted/i);
  });
});
