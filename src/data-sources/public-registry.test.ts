import { describe, expect, it } from 'vitest';
import {
  PUBLIC_DATA_SOURCES,
  SUBSCRIPTION_DATA_SOURCES,
  SUBSCRIPTION_SOURCE_CONFIGS,
} from './public-registry';

describe('public data-source registry', () => {
  it('keeps the public subscription list on the exact crawler allowlist', () => {
    expect(SUBSCRIPTION_DATA_SOURCES.map(({ id, url }) => ({ sourceId: id, url })))
      .toEqual(SUBSCRIPTION_SOURCE_CONFIGS.map(({ sourceId, url }) => ({ sourceId, url })));
    expect(SUBSCRIPTION_SOURCE_CONFIGS).toHaveLength(7);
  });

  it('uses unique source identities and public HTTPS evidence links', () => {
    expect(new Set(PUBLIC_DATA_SOURCES.map((source) => source.id)).size).toBe(PUBLIC_DATA_SOURCES.length);
    for (const source of PUBLIC_DATA_SOURCES) {
      expect(new URL(source.url).protocol).toBe('https:');
      expect(source.role.length).toBeGreaterThan(20);
      expect(source.publicationRule.length).toBeGreaterThan(20);
    }
  });
});
