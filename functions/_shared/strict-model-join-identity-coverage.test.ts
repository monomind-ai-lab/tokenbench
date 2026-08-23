import { describe, expect, it } from 'vitest';

import {
  readStrictModelJoinIdentityCoverage,
  type StrictModelJoinD1Database,
} from './strict-model-join';

function db(row: Record<string, unknown> | null): StrictModelJoinD1Database {
  return {
    prepare: () => ({
      bind: () => ({
        all: async <T,>() => ({ results: (row === null ? [] : [row]) as T[] }),
      }),
    }),
  };
}

const REVISION = 'livebench_2026_08_23';

describe('readStrictModelJoinIdentityCoverage', () => {
  it('reports ok when the join actually yields routes', async () => {
    const result = await readStrictModelJoinIdentityCoverage({
      db: db({ staged: 120, bound: 60, verified: 60 }),
      liveBenchRevision: REVISION,
      joinedRoutes: 59,
    });
    expect(result.status).toBe('ok');
    expect(result.joinedRoutes).toBe(59);
  });

  it('separates "nothing staged" from "staged but never reviewed"', async () => {
    const nothingStaged = await readStrictModelJoinIdentityCoverage({
      db: db({ staged: 0, bound: 0, verified: 0 }),
      liveBenchRevision: REVISION,
      joinedRoutes: 0,
    });
    expect(nothingStaged.status).toBe('no-livebench-configurations-staged');

    // The live situation: the refresh stages every configuration with a null
    // canonical binding, so the INNER JOIN can never match.
    const neverReviewed = await readStrictModelJoinIdentityCoverage({
      db: db({ staged: 4455, bound: 0, verified: 0 }),
      liveBenchRevision: REVISION,
      joinedRoutes: 0,
    });
    expect(neverReviewed.status).toBe('identity-review-never-run');
    expect(neverReviewed.stagedConfigurations).toBe(4455);
  });

  it('distinguishes review that ran but verified nothing from review that did not reach the catalog', async () => {
    const noneVerified = await readStrictModelJoinIdentityCoverage({
      db: db({ staged: 4455, bound: 12, verified: 0 }),
      liveBenchRevision: REVISION,
      joinedRoutes: 0,
    });
    expect(noneVerified.status).toBe('identity-review-produced-no-verified-matches');

    const verifiedButUnjoined = await readStrictModelJoinIdentityCoverage({
      db: db({ staged: 4455, bound: 12, verified: 12 }),
      liveBenchRevision: REVISION,
      joinedRoutes: 0,
    });
    expect(verifiedButUnjoined.status).toBe('verified-matches-do-not-reach-catalog');
  });

  it('treats a missing or malformed count row as zero rather than throwing', async () => {
    const missing = await readStrictModelJoinIdentityCoverage({
      db: db(null),
      liveBenchRevision: REVISION,
      joinedRoutes: 0,
    });
    expect(missing.stagedConfigurations).toBe(0);
    expect(missing.status).toBe('no-livebench-configurations-staged');

    const malformed = await readStrictModelJoinIdentityCoverage({
      db: db({ staged: null, bound: 'x', verified: undefined }),
      liveBenchRevision: REVISION,
      joinedRoutes: 0,
    });
    expect(malformed.status).toBe('no-livebench-configurations-staged');
  });

  it('never reports ok merely because rows are verified; only real joined routes count', async () => {
    const result = await readStrictModelJoinIdentityCoverage({
      db: db({ staged: 100, bound: 100, verified: 100 }),
      liveBenchRevision: REVISION,
      joinedRoutes: 0,
    });
    expect(result.status).not.toBe('ok');
  });
});
