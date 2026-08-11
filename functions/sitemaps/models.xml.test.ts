import { describe, expect, it } from 'vitest';
import { modelProfileViewModelFixture } from '../../src/frontend/model-profile-test-fixture';
import { onRequestGet } from './models.xml';

const AT = '2026-08-11T18:00:00.000Z';

function row(slug: string, status: 'current' | 'archived') {
  return {
    model_key: `benchlm:${slug}`,
    canonical_slug: slug,
    display_name: slug,
    creator: 'Provider',
    source_type: 'Proprietary',
    reasoning_type: null,
    family_id: null,
    variant_id: null,
    first_seen_revision: 'rev-1',
    first_seen_at: AT,
    last_seen_revision: 'rev-2',
    last_seen_at: AT,
    latest_profile_revision: slug === 'retained-fixture' ? 'rev-3' : 'rev-2',
    status,
    source_id: 'benchlm',
    source_model_id: `provider/${slug}`,
    updated_at: AT,
  };
}

function database() {
  const fixture = modelProfileViewModelFixture();
  const profile = (slug: string, revision: string) => JSON.stringify({
    ...fixture.profile,
    identity: { ...fixture.profile.identity, modelKey: `benchlm:${slug}`, slug, displayName: slug },
    revision: { ...fixture.profile.revision, revision },
  });
  return {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async all() {
              if (sql.includes('benchmark_model_directory')) return { results: [
                row('gpt-5-6-sol', 'current'),
                row('retained-fixture', 'archived'),
              ] };
              if (sql.includes('benchmark_model_profile_snapshots')) return { results: [
                { model_key: 'benchlm:gpt-5-6-sol', revision: 'rev-2', profile_json: profile('gpt-5-6-sol', 'rev-2'), generated_at: AT, profile_order: 1 },
                { model_key: 'benchlm:retained-fixture', revision: 'rev-3', profile_json: '{bad-json', generated_at: AT, profile_order: 1 },
                { model_key: 'benchlm:retained-fixture', revision: 'rev-2', profile_json: profile('retained-fixture', 'rev-2'), generated_at: AT, profile_order: 2 },
              ] };
              throw new Error(`Unexpected query: ${sql}`);
            },
          };
        },
      };
    },
  };
}

describe('model sitemap', () => {
  it('includes current and archived latest-valid profiles but no query URLs', async () => {
    const response = await onRequestGet({ env: { CATALOG_DB: database() } });
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://tokenbench.monomind.one/models/gpt-5-6-sol/</loc>');
    expect(xml).toContain('<loc>https://tokenbench.monomind.one/models/retained-fixture/</loc>');
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].every((match) => !match[1].includes('?'))).toBe(true);
    expect(xml.indexOf('gpt-5-6-sol')).toBeLessThan(xml.indexOf('retained-fixture'));
  });
});
