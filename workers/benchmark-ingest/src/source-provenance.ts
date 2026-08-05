/**
 * Transport/evidence facts are collected by the scheduled Worker, not inferred
 * by source normalizers. `contentHash` names the exact sanitized bytes written
 * to R2; `originalContentHash` keeps the upstream response traceable without
 * mistaking raw data for the persisted projection.
 */
export interface ArtifactProvenance {
  etag: string | null;
  lastModified: string | null;
  upstreamRevision: string | null;
  schemaVersion: string | null;
  snapshotKey: string;
  contentHash: string;
  originalContentHash: string;
}

export function requireArtifactProvenance(
  value: ArtifactProvenance | undefined,
  sourceName: string,
): ArtifactProvenance {
  if (!value || typeof value !== 'object') throw new Error(`${sourceName} provenance is required`);
  return value;
}
