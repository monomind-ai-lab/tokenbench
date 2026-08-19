import { describe, expect, it, vi } from 'vitest';
import { discoverLiveBenchRelease, type LiveBenchDiscoveryState } from './livebench-discovery';

const initialState: LiveBenchDiscoveryState = {
  etag: '"ref-1"',
  headCommit: 'a'.repeat(40),
  fingerprint: `sha256:${'0'.repeat(64)}`,
  verifiedIsoWeek: '2026-W34',
};
const RELEASE_CONTROL_0625 = 'export const RELEASES = ["2026-06-25"];';
const RELEASE_CONTROL_0701 = 'export const RELEASES = ["2026-06-25", "2026-07-01"];';
const RELEASE_CONTROL_0625_BLOB = '81889f6652e0e6dac043e5c57d338ec479e93cbe';
const RELEASE_CONTROL_0701_BLOB = '39a6ca0b502205d65196a20dd12a359060fd3b79';
const SUPPORTED_COMPUTE_BLOB = '7bb8f5e8021ed0a7220d5891fd4cec7dccb9a39f';
const SUPPORTED_AVERAGING_BLOB = '8048d175739ea66e8069711ff6e572c684cfc75b';

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
}

function githubTree(entries: readonly [string, string][]) {
  return {
    truncated: false,
    tree: entries.map(([path, sha]) => ({ path, type: 'blob', sha })),
  };
}

function completeTree(
  release = '2026-06-25',
  modelLinksBlob = '4'.repeat(40),
  computeBlob = SUPPORTED_COMPUTE_BLOB,
  averagingBlob = SUPPORTED_AVERAGING_BLOB,
  releaseControlBlob = RELEASE_CONTROL_0625_BLOB,
): readonly [string, string][] {
  const sourceRelease = release.replaceAll('-', '_');
  return [
    [`public/table_${sourceRelease}.csv`, '1'.repeat(40)],
    [`public/categories_${sourceRelease}.json`, '2'.repeat(40)],
    [`public/cost_${sourceRelease}.csv`, '3'.repeat(40)],
    ['src/Table/modelLinks.js', modelLinksBlob],
    ['src/lib/compute.js', computeBlob],
    ['src/Table/Averaging.js', averagingBlob],
    ['src/lib/constants.js', releaseControlBlob],
  ];
}

describe('discoverLiveBenchRelease', () => {
  it('returns unchanged on a 304 without reading the tree', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304 }));

    await expect(discoverLiveBenchRelease({
      previous: initialState,
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl,
    })).resolves.toMatchObject({ status: 'unchanged', state: initialState });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstRequest = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstRequest[1].headers).toMatchObject({ 'If-None-Match': '"ref-1"' });
  });

  it('rejects a newest release missing its matching cost artifact', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'b'.repeat(40) } }, { headers: { etag: '"ref-2"' } }))
      .mockResolvedValueOnce(jsonResponse(githubTree([
        ['public/table_2026_07_01.csv', '1'.repeat(40)],
        ['public/categories_2026_07_01.json', '2'.repeat(40)],
        ['src/Table/modelLinks.js', '3'.repeat(40)],
        ['src/lib/compute.js', '4'.repeat(40)],
        ['src/Table/Averaging.js', '5'.repeat(40)],
        ['src/lib/constants.js', RELEASE_CONTROL_0701_BLOB],
      ])))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0701));

    await expect(discoverLiveBenchRelease({
      previous: initialState,
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl,
    })).resolves.toMatchObject({ status: 'incomplete_upstream_release', releaseId: '2026-07-01' });
  });

  it('uses one immutable commit for all descriptor URLs and ignores unrelated commit changes', async () => {
    const head = 'b'.repeat(40);
    const firstFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: head } }, { headers: { etag: '"ref-2"' } }))
      .mockResolvedValueOnce(jsonResponse(githubTree(completeTree())))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0625));
    const first = await discoverLiveBenchRelease({
      previous: { ...initialState, fingerprint: null },
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl: firstFetch,
    });
    expect(first).toMatchObject({ status: 'changed', release: { commit: head, releaseId: '2026-06-25' } });
    if (first.status !== 'changed') throw new Error('expected changed');
    expect(first.release.artifacts.every((artifact) => artifact.rawUrl.includes(`/${head}/`))).toBe(true);

    const secondFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'c'.repeat(40) } }, { headers: { etag: '"ref-3"' } }))
      .mockResolvedValueOnce(jsonResponse(githubTree(completeTree())))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0625));
    await expect(discoverLiveBenchRelease({
      previous: first.state,
      checkedAt: '2026-08-18T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl: secondFetch,
    })).resolves.toMatchObject({ status: 'unchanged', state: { headCommit: 'c'.repeat(40) } });
  });

  it('treats a changed model-links blob as a new release descriptor', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'b'.repeat(40) } }))
      .mockResolvedValueOnce(jsonResponse(githubTree(completeTree('2026-06-25', '9'.repeat(40)))))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0625));

    await expect(discoverLiveBenchRelease({
      previous: initialState,
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl,
    })).resolves.toMatchObject({ status: 'changed' });
  });

  it('blocks an unreviewed methodology change instead of silently applying the old projection', async () => {
    const firstFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'b'.repeat(40) } }))
      .mockResolvedValueOnce(jsonResponse(githubTree(completeTree())))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0625));
    const first = await discoverLiveBenchRelease({
      previous: { ...initialState, fingerprint: null },
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl: firstFetch,
    });
    if (first.status !== 'changed') throw new Error('expected changed');
    const secondFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'c'.repeat(40) } }))
      .mockResolvedValueOnce(jsonResponse(githubTree(completeTree('2026-06-25', '4'.repeat(40), '7'.repeat(40)))))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0625));
    await expect(discoverLiveBenchRelease({
      previous: first.state,
      checkedAt: '2026-08-18T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl: secondFetch,
    })).rejects.toThrow(/methodology.*reviewed/i);
  });

  it('selects only the canonical RELEASES entry and ignores an unlisted complete bundle', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'b'.repeat(40) } }))
      .mockResolvedValueOnce(jsonResponse(githubTree([
        ...completeTree('2026-06-25'),
        ...completeTree('2026-07-01').slice(0, 3),
      ])))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0625));

    await expect(discoverLiveBenchRelease({
      previous: { ...initialState, fingerprint: null },
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl,
    })).resolves.toMatchObject({ status: 'changed', release: { releaseId: '2026-06-25' } });

    const invalidShaFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'not-a-sha' } }));
    await expect(discoverLiveBenchRelease({
      previous: initialState,
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: false,
      fetchImpl: invalidShaFetch,
    })).rejects.toThrow(/SHA/i);
  });

  it('forces a weekly tree verification even when conditional discovery would return 304', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'b'.repeat(40) } }))
      .mockResolvedValueOnce(jsonResponse(githubTree(completeTree())))
      .mockResolvedValueOnce(new Response(RELEASE_CONTROL_0625));

    await discoverLiveBenchRelease({
      previous: initialState,
      checkedAt: '2026-08-17T06:17:00.000Z',
      forceWeeklyVerification: true,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const firstRequest = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstRequest[1].headers).not.toHaveProperty('If-None-Match');
  });
});
