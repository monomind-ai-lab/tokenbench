import { describe, expect, it } from 'vitest';
import {
  sourceArtifactKey,
  sourceManifestKey,
  writeCandidateEvidence,
  type CandidateEvidenceBody,
  type CandidateEvidenceBucket,
} from './candidate-evidence';

const alpha = new TextEncoder().encode('alpha');
const beta = new TextEncoder().encode('beta');

function manifest() {
  return {
    schemaVersion: 1 as const,
    domain: 'benchmark' as const,
    sourceId: 'livebench',
    attemptId: 'attempt-1',
    upstreamRevision: 'livebench-2026-06-25',
    releaseId: '2026-06-25',
    licenseId: 'Apache-2.0' as const,
    observedAt: '2026-08-17T00:17:00.000Z',
    parserVersion: 'livebench-v1',
    artifacts: [
      {
        artifactId: 'z-last.csv',
        upstreamUrl: 'https://livebench.ai/z-last.csv',
        r2Key: sourceArtifactKey('benchmark', 'livebench', 'attempt-1', 'z-last.csv'),
        contentType: 'text/csv',
        byteLength: beta.byteLength,
        contentHash: 'sha256:f44e64e75f3948e9f73f8dfa94721c4ce8cbb4f265c4790c702b2d41cfbf2753' as const,
        upstreamBlobId: null,
      },
      {
        artifactId: 'a-first.csv',
        upstreamUrl: 'https://livebench.ai/a-first.csv',
        r2Key: sourceArtifactKey('benchmark', 'livebench', 'attempt-1', 'a-first.csv'),
        contentType: 'text/csv',
        byteLength: alpha.byteLength,
        contentHash: 'sha256:8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8' as const,
        upstreamBlobId: null,
      },
    ],
  };
}

interface RecordedWrite {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly contentType: string | undefined;
}

function capturedBytes(value: CandidateEvidenceBody): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error('candidate evidence writes must use Uint8Array bodies');
  return value.slice();
}

function bucket(existingManifest = false, afterValidation?: () => void) {
  const calls: string[] = [];
  const writes: RecordedWrite[] = [];
  const fake: CandidateEvidenceBucket = {
    async get(key) {
      calls.push(`get:${key}`);
      afterValidation?.();
      return existingManifest ? { key } : null;
    },
    async put(key, value, options) {
      calls.push(`put:${key}`);
      writes.push({
        key,
        bytes: capturedBytes(value),
        contentType: options?.httpMetadata?.contentType,
      });
    },
  };
  return { calls, fake, writes };
}

describe('candidate evidence writer', () => {
  it('refuses an existing manifest before any artifact write', async () => {
    const value = manifest();
    const { calls, fake } = bucket(true);

    await expect(writeCandidateEvidence(fake, value, [
      { artifactId: 'z-last.csv', bytes: beta },
      { artifactId: 'a-first.csv', bytes: alpha },
    ])).rejects.toThrow(/manifest already exists/i);

    expect(calls).toEqual([
      `get:${sourceManifestKey(value.domain, value.sourceId, value.attemptId)}`,
    ]);
  });

  it('validates every artifact before touching the bucket', async () => {
    const { calls, fake } = bucket();

    await expect(writeCandidateEvidence(fake, manifest(), [
      { artifactId: 'z-last.csv', bytes: beta },
      { artifactId: 'a-first.csv', bytes: new TextEncoder().encode('wrong') },
    ])).rejects.toThrow(/bytes do not match/i);

    expect(calls).toEqual([]);
  });

  it('rejects an incomplete artifact set before touching the bucket', async () => {
    const { calls, fake } = bucket();

    await expect(writeCandidateEvidence(fake, manifest(), [
      { artifactId: 'z-last.csv', bytes: beta },
    ])).rejects.toThrow(/complete artifact set/i);

    expect(calls).toEqual([]);
  });

  it('writes verified artifacts in manifest order and a single manifest last', async () => {
    const value = manifest();
    const { calls, fake, writes } = bucket();

    await writeCandidateEvidence(fake, value, [
      { artifactId: 'a-first.csv', bytes: alpha },
      { artifactId: 'z-last.csv', bytes: beta },
    ]);

    expect(calls).toEqual([
      `get:${sourceManifestKey(value.domain, value.sourceId, value.attemptId)}`,
      `put:${value.artifacts[0].r2Key}`,
      `put:${value.artifacts[1].r2Key}`,
      `put:${sourceManifestKey(value.domain, value.sourceId, value.attemptId)}`,
    ]);
    expect(writes.map((write) => write.key)).toEqual([
      'evidence/benchmark/livebench/attempt-1/artifacts/z-last.csv',
      'evidence/benchmark/livebench/attempt-1/artifacts/a-first.csv',
      'evidence/benchmark/livebench/attempt-1/manifest.json',
    ]);
    expect(writes.map((write) => new TextDecoder().decode(write.bytes))).toEqual([
      'beta',
      'alpha',
      expect.any(String),
    ]);
    expect(writes.map((write) => write.contentType)).toEqual([
      'text/csv',
      'text/csv',
      'application/json',
    ]);
    expect(JSON.parse(new TextDecoder().decode(writes[2].bytes))).toEqual(value);
  });

  it('writes immutable byte snapshots after caller mutation between validation and persistence', async () => {
    const zLast = beta.slice();
    const aFirst = alpha.slice();
    const { fake, writes } = bucket(false, () => {
      zLast.fill('x'.charCodeAt(0));
      aFirst.fill('y'.charCodeAt(0));
    });

    await writeCandidateEvidence(fake, manifest(), [
      { artifactId: 'z-last.csv', bytes: zLast },
      { artifactId: 'a-first.csv', bytes: aFirst },
    ]);

    expect(writes.slice(0, 2).map((write) => new TextDecoder().decode(write.bytes))).toEqual([
      'beta',
      'alpha',
    ]);
  });
});
