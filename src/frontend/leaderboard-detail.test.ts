import { describe, expect, it } from 'vitest';
import { createEvidencePreviewDataComposition } from './preview-data/composition-evidence';
import { LEADERBOARD_ROUTES } from '../routing/leaderboard-routes';
import {
  leaderboardDetailDefinition,
  leaderboardKeyFromSegments,
  parseLeaderboardFilters,
  projectLeaderboardRows,
  serializeLeaderboardFilters,
} from './leaderboard-detail';

describe('Next leaderboard detail projection', () => {
  it('resolves every published child route and rejects unknown paths', () => {
    for (const [key, route] of Object.entries(LEADERBOARD_ROUTES)) {
      const segments = route.pathname.replace(/^\/leaderboards\//u, '').replace(/\/$/u, '').split('/');
      expect(leaderboardKeyFromSegments(segments)).toBe(key);
    }
    expect(leaderboardKeyFromSegments(['llm', 'not-published'])).toBeNull();
  });

  it('normalizes route defaults and serializes only meaningful URL state', () => {
    const definition = leaderboardDetailDefinition('llm-value');
    const defaults = parseLeaderboardFilters(definition, {});
    expect(defaults).toMatchObject({ profile: 'balanced', sort: 'pareto-score-desc', view: 'list' });
    expect(serializeLeaderboardFilters(definition, defaults)).toBe('');
    expect(serializeLeaderboardFilters(definition, {
      ...defaults,
      access: 'open',
      profile: 'inputHeavy',
      view: 'cards',
    })).toBe('access=open&profile=inputHeavy&view=cards');
  });

  it('projects only exact source lenses and computes the disclosed value frontier', async () => {
    const envelope = await createEvidencePreviewDataComposition().rankings({});
    const overallDefinition = leaderboardDetailDefinition('llm-overall');
    const overallFilters = parseLeaderboardFilters(overallDefinition, {});
    const overall = projectLeaderboardRows(overallDefinition, envelope, overallFilters);
    const codingDefinition = leaderboardDetailDefinition('llm-coding');
    const coding = projectLeaderboardRows(codingDefinition, envelope, parseLeaderboardFilters(codingDefinition, {}));
    const valueDefinition = leaderboardDetailDefinition('llm-value');
    const value = projectLeaderboardRows(valueDefinition, envelope, parseLeaderboardFilters(valueDefinition, {}));
    const preferenceDefinition = leaderboardDetailDefinition('llm-human-preference');
    const preference = projectLeaderboardRows(preferenceDefinition, envelope, parseLeaderboardFilters(preferenceDefinition, {}));

    expect(overall.map((row) => row.metric)).toEqual([90, 85, 80]);
    expect(coding.map((row) => [row.metric, row.rank])).toEqual([[91, 1], [86, 2], [81, 3]]);
    expect(value).toHaveLength(3);
    expect(value.filter((row) => row.frontier).map((row) => row.id)).toEqual(['alpha']);
    expect(preference).toEqual([]);
  });
});

