import { describe, expect, it } from 'vitest';
import { sourceManifestDigest, validateSourceManifest } from './source-contracts';
import { sourceArtifactKey, sourceManifestKey } from '../../workers/_shared/candidate-evidence';

const sha256 = (value: string) => `sha256:${value}`;

function validManifest() {
  return {
    schemaVersion: 1 as const,
    domain: 'benchmark' as const,
    sourceId: 'livebench',
    attemptId: 'attempt-1',
    upstreamRevision: 'livebench-2026-06-25',
    releaseId: '2026-06-25',
    licenseId: 'CDLA-Permissive-2.0' as const,
    observedAt: '2026-08-17T00:17:00.000Z',
    parserVersion: 'livebench-v1',
    artifacts: [{
      artifactId: 'table.csv',
      upstreamUrl: 'https://livebench.ai/table.csv',
      r2Key: 'evidence/benchmark/livebench/attempt-1/artifacts/table.csv',
      contentType: 'text/csv',
      byteLength: 5,
      contentHash: sha256('8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8'),
      upstreamBlobId: null,
    }],
  };
}

describe('source evidence contracts', () => {
  it('uses attempt-owned immutable R2 keys', () => {
    expect(sourceArtifactKey('benchmark', 'livebench', 'attempt-1', 'table.csv'))
      .toBe('evidence/benchmark/livebench/attempt-1/artifacts/table.csv');
    expect(sourceManifestKey('benchmark', 'livebench', 'attempt-1'))
      .toBe('evidence/benchmark/livebench/attempt-1/manifest.json');
  });

  it('requires one pinned upstream revision and verified artifacts', () => {
    expect(() => validateSourceManifest({
      ...validManifest(),
      upstreamRevision: '',
    })).toThrow(/upstream revision/i);
    expect(() => validateSourceManifest({
      ...validManifest(),
      artifacts: [],
    })).toThrow(/artifacts/i);
  });

  it.each([
    ['path traversal', '../table.csv'],
    ['nested path', 'nested/table.csv'],
  ])('rejects %s in artifact IDs', (_caseName, artifactId) => {
    expect(() => validateSourceManifest({
      ...validManifest(),
      artifacts: [{
        ...validManifest().artifacts[0],
        artifactId,
        r2Key: `evidence/benchmark/livebench/attempt-1/artifacts/${artifactId}`,
      }],
    })).toThrow(/artifact id/i);
  });

  it.each([
    ['non-HTTPS upstream URL', 'http://livebench.ai/table.csv'],
    ['malformed upstream URL', 'not-a-url'],
  ])('rejects a %s', (_caseName, upstreamUrl) => {
    expect(() => validateSourceManifest({
      ...validManifest(),
      artifacts: [{ ...validManifest().artifacts[0], upstreamUrl }],
    })).toThrow(/https URL/i);
  });

  it('rejects malformed hashes and mixed-attempt keys', () => {
    expect(() => validateSourceManifest({
      ...validManifest(),
      artifacts: [{ ...validManifest().artifacts[0], contentHash: 'sha256:not-a-digest' }],
    })).toThrow(/sha256/i);
    expect(() => validateSourceManifest({
      ...validManifest(),
      artifacts: [{
        ...validManifest().artifacts[0],
        r2Key: 'evidence/benchmark/livebench/attempt-2/artifacts/table.csv',
      }],
    })).toThrow(/attempt-owned key/i);
  });

  it('hashes the exact immutable manifest JSON', async () => {
    await expect(sourceManifestDigest(validateSourceManifest(validManifest())))
      .resolves.toBe('sha256:1ca863b5eca3a4db6edd4e723cedb83ab80226414fce5d89390a8bfc7bb2d414');
  });
});
