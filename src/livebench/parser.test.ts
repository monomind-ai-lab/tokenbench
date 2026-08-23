import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLiveBenchRelease } from './parser';

const fixture = (name: string): string => readFileSync(resolve(
  process.cwd(),
  `workers/benchmark-ingest/test-fixtures/livebench/${name}`,
), 'utf8');

function fixtureInput() {
  return {
    releaseId: '2026-06-25',
    sourceCommit: 'd5fcb08be7088c84616652660666b8621b683ae6',
    observedAt: '2026-08-17T00:17:00.000Z',
    licenseEvidence: {
      licenseId: 'Apache-2.0' as const,
      verificationUrl: 'https://github.com/LiveBench/LiveBench/blob/main/LICENSE',
      verifiedAt: '2026-08-17T00:00:00.000Z',
    },
    tableCsv: fixture('table_2026_06_25.csv'),
    categoriesJson: fixture('categories_2026_06_25.json'),
    costCsv: fixture('cost_2026_06_25.csv'),
    modelLinksSource: fixture('modelLinks.js'),
  };
}

describe('parseLiveBenchRelease', () => {
  it('parses one commit-pinned release without invented fields', () => {
    const release = parseLiveBenchRelease(fixtureInput());

    expect(release.releaseId).toBe('2026-06-25');
    expect(release.categories).toEqual([
      { categoryId: 'reasoning', label: 'Reasoning', taskIds: ['theory_of_mind', 'zebra_puzzle'] },
      { categoryId: 'agentic-coding', label: 'Agentic Coding', taskIds: ['javascript', 'typescript'] },
    ]);
    expect(release.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configurationId: 'smaug-agentic',
        openWeights: true,
        isDerivativeFinetune: true,
        baseConfigurationId: 'kimi-k3',
        lineageSourceUrl: 'https://huggingface.co/abacusai/Smaug-Agentic',
      }),
      expect.objectContaining({ configurationId: 'gpt-5.6-terra-max', openWeights: null }),
    ]));
    expect(release.tasks.every((task) => !('note' in task))).toBe(true);
    expect(release.taskScores).toHaveLength(8);
    expect(release.taskEconomics).toHaveLength(8);
    expect(release.taskScores.some((score) => 'multimodalScore' in score)).toBe(false);
  });

  it('accepts the upstream model-link shape with trailing object and array commas', () => {
    expect(parseLiveBenchRelease(fixtureInput()).models).toEqual(expect.arrayContaining([
      expect.objectContaining({ configurationId: 'gpt-5.6-terra-max' }),
    ]));
  });

  it('does not convert an unknown category, duplicate model, or non-finite score into a fact', () => {
    expect(() => parseLiveBenchRelease({
      ...fixtureInput(),
      categoriesJson: '{"Reasoning":["other_task"],"Agentic Coding":["javascript","typescript"]}',
    })).toThrow(/unknown task column|missing task column/i);
    expect(() => parseLiveBenchRelease({
      ...fixtureInput(),
      tableCsv: `${fixture('table_2026_06_25.csv')}smaug-agentic,1,2,3,4\n`,
    })).toThrow(/duplicate model/i);
    expect(() => parseLiveBenchRelease({
      ...fixtureInput(),
      tableCsv: fixture('table_2026_06_25.csv').replace('68.182', 'NaN'),
    })).toThrow(/finite/i);
  });

  it('rejects executable model-links input without evaluating it', () => {
    expect(() => parseLiveBenchRelease({
      ...fixtureInput(),
      modelLinksSource: 'export const modelLinks = { "gpt-5.6-terra-max": { organization: globalThis.fetch("https://example.com"), displayName: "No" } };',
    })).toThrow();
    expect(() => parseLiveBenchRelease({
      ...fixtureInput(),
      modelLinksSource: `${fixture('modelLinks.js')}\nglobalThis.fetch("https://example.com");`,
    })).toThrow(/forbidden executable/i);
  });

  it('blocks publication parsing when CDLA evidence was not independently supplied', () => {
    const input = fixtureInput();
    expect(() => parseLiveBenchRelease({
      ...input,
      licenseEvidence: undefined as unknown as typeof input.licenseEvidence,
    })).toThrow(/license evidence/i);
  });

  it('retains the complete source taxonomy fixture as seven categories', () => {
    expect(Object.keys(JSON.parse(fixture('categories_2026_06_25-full.json')))).toHaveLength(7);
  });
});
