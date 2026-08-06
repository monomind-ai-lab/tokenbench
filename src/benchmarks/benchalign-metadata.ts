/** Metadata carried by BenchLM's active leaderboard source artifact. */
export interface BenchAlignSourceMetadata {
  /** Optional only while a pre-version cached summary is still in circulation. */
  readonly upstreamRevision?: string | null;
  /** Optional only while a pre-version cached summary is still in circulation. */
  readonly schemaVersion?: string | null;
}

export interface BenchAlignSourceArtifactMetadata extends BenchAlignSourceMetadata {
  readonly artifactId: string;
}

export interface BenchAlignSourceAvailability {
  readonly sourceId: string;
  readonly available: boolean;
  readonly artifacts: readonly BenchAlignSourceArtifactMetadata[];
}

function usableText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/** The BenchLM leaderboard artifact is the published source for BenchAlign output. */
export function activeBenchAlignSourceMetadata(
  sources: readonly BenchAlignSourceAvailability[] | null | undefined,
): BenchAlignSourceMetadata | null {
  const benchLm = sources?.find((source) => source.sourceId === 'benchlm' && source.available);
  const leaderboard = benchLm?.artifacts.find((artifact) => artifact.artifactId === 'leaderboard');
  return leaderboard ?? null;
}

export function publishedBenchAlignMethodVersion(
  source: BenchAlignSourceMetadata | null | undefined,
): string {
  return usableText(source?.upstreamRevision) ?? usableText(source?.schemaVersion) ?? 'Unavailable';
}
