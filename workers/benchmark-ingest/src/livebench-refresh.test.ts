import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LiveBenchReleaseDescriptor } from '../../../src/livebench';
import {
  liveBenchGitBlobIdForTest,
  refreshLiveBenchRelease,
  retrieveLiveBenchCandidate,
} from './livebench-refresh';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(resolve(
  process.cwd(),
  `workers/benchmark-ingest/test-fixtures/livebench/${name}`,
)));

const files = {
  table: fixture('table_2026_06_25.csv'),
  categories: fixture('categories_2026_06_25.json'),
  cost: fixture('cost_2026_06_25.csv'),
  'model-links': fixture('modelLinks.js'),
};

async function descriptor(): Promise<LiveBenchReleaseDescriptor> {
  const commit = 'a'.repeat(40);
  const definitions = [
    ['table', 'public/table_2026_06_25.csv'],
    ['categories', 'public/categories_2026_06_25.json'],
    ['cost', 'public/cost_2026_06_25.csv'],
    ['model-links', 'src/Table/modelLinks.js'],
  ] as const;
  return {
    releaseId: '2026-06-25',
    commit,
    fingerprint: `sha256:${'b'.repeat(64)}`,
    artifacts: await Promise.all(definitions.map(async ([artifactId, path]) => ({
      artifactId,
      path,
      blobId: await liveBenchGitBlobIdForTest(files[artifactId]),
      rawUrl: `https://raw.githubusercontent.com/LiveBench/new-livebench/${commit}/${path}`,
    }))),
  };
}

const license = {
  licenseId: 'CDLA-Permissive-2.0' as const,
  verificationUrl: 'https://example.com/license-review',
  verifiedAt: '2026-08-19T09:00:00.000Z',
  verifiedBy: 'reviewer',
  attributionText: 'LiveBench source attribution',
};

describe('LiveBench candidate retrieval and refresh gate', () => {
  it('verifies every raw artifact against its discovered Git blob before parsing', async () => {
    const source = await descriptor();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const artifact = source.artifacts.find((candidate) => candidate.rawUrl === input.toString());
      return artifact ? new Response(files[artifact.artifactId]) : new Response(null, { status: 404 });
    });
    const candidate = await retrieveLiveBenchCandidate({
      descriptor: source,
      checkedAt: '2026-08-19T09:00:00.000Z',
      attemptId: 'attempt-1',
      license,
      fetchImpl,
    });

    expect(candidate.bundle.models).toHaveLength(2);
    expect(candidate.manifest.artifacts).toHaveLength(4);
    expect(candidate.manifest.artifacts.every((artifact) => artifact.r2Key.includes('/attempt-1/'))).toBe(true);

    const corruptedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const artifact = source.artifacts.find((candidate) => candidate.rawUrl === input.toString());
      if (!artifact) return new Response(null, { status: 404 });
      return new Response(artifact.artifactId === 'table' ? new TextEncoder().encode('corrupt') : files[artifact.artifactId]);
    });
    await expect(retrieveLiveBenchCandidate({
      descriptor: source,
      checkedAt: '2026-08-19T09:00:00.000Z',
      attemptId: 'attempt-2',
      license,
      fetchImpl: corruptedFetch,
    })).rejects.toThrow(/Git blob/i);
  });
});
