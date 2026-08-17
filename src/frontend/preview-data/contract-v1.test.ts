import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseUiDataContractV1, type UiDataContractV1Method } from './contract-v1';

const contractRoot = resolve(process.cwd(), 'contracts/ui-data-contract/v1');

function readExample<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(contractRoot, 'examples', `${name}.json`), 'utf8')) as T;
}

const examples = {
  models: readExample<unknown>('models'),
  profile: readExample<unknown>('profile'),
  lifecycle: readExample<unknown>('lifecycle'),
  rankings: readExample<unknown>('rankings'),
  comparison: readExample<unknown>('comparison'),
  subscription: readExample<unknown>('subscription'),
  mixedSource: readExample<unknown>('mixed-source'),
  unsupportedVersion: readExample<unknown>('unsupported-version'),
};

const methods: readonly UiDataContractV1Method[] = [
  'models',
  'profile',
  'lifecycle',
  'rankings',
  'comparison',
  'subscription',
];

describe('parseUiDataContractV1', () => {
  it.each(methods)(
    'parses the proposed %s example without a page-specific transformation',
    (method) => {
      const parsed = parseUiDataContractV1(examples[method], method);

      expect(parsed.contractVersion).toBe('ui-data-contract/v1');
      expect(parsed).toEqual(examples[method]);
    },
  );

  it('preserves mixed-source and unavailable evidence verbatim', () => {
    const parsed = parseUiDataContractV1(examples.mixedSource, 'rankings');

    expect(parsed.effectiveAt).toBeNull();
    expect(new Set(parsed.provenance.map((source) => source.effectiveAt)).size).toBeGreaterThan(1);
    expect(JSON.stringify(parsed)).toContain('No approved source');
  });

  it('rejects unsupported versions and invalid UTC timestamps', () => {
    expect(() => parseUiDataContractV1(examples.unsupportedVersion, 'models'))
      .toThrow(/Unsupported UI data contract version/);
    expect(() => parseUiDataContractV1({
      ...readExample<Record<string, unknown>>('models'),
      fetchedAt: '2026-08-17T12:00:00+08:00',
    }, 'models')).toThrow(/UTC ISO-8601 timestamp/);
    expect(() => parseUiDataContractV1({
      ...readExample<Record<string, unknown>>('models'),
      fetchedAt: '2026-02-30T00:00:00.000Z',
    }, 'models')).toThrow(/UTC ISO-8601 timestamp/);
  });

  it('rejects envelope fields not declared by the proposed schema', () => {
    expect(() => parseUiDataContractV1({
      ...readExample<Record<string, unknown>>('models'),
      cacheNamespace: 'internal-only',
    }, 'models')).toThrow(/undeclared envelope field/);
  });

  it('rejects unavailable evidence with an empty reason', () => {
    const comparison = readExample<Record<string, unknown>>('comparison');
    const data = comparison.data as { unavailableModelIds: unknown[] };

    expect(() => parseUiDataContractV1({
      ...comparison,
      data: {
        ...data,
        unavailableModelIds: [{ availability: 'unavailable', reason: '' }],
      },
    }, 'comparison')).toThrow(/non-empty reason/);
  });
});
