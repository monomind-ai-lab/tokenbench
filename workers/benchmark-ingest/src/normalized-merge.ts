import {
  type BenchmarkModel,
  type BenchmarkSourceRecord,
  type NormalizedSourceBatch,
  compareUtf8Binary,
  validateNormalizedSourceBatch,
} from '../../../src/benchmarks/contracts';

function sourceKey(source: Pick<BenchmarkSourceRecord, 'sourceId' | 'artifactId'>): string {
  return `${source.sourceId}\u0000${source.artifactId}`;
}

function sourcePriority(sourceId: BenchmarkSourceRecord['sourceId']): number {
  return ({ benchlm: 0, lmarena: 1, openrouter: 2, litellm: 3 } as const)[sourceId];
}

/** Reconcile independently normalized sources using the production priority rules. */
export function mergeNormalizedBatches(batches: readonly NormalizedSourceBatch[]): NormalizedSourceBatch {
  const sources = batches.flatMap((batch) => batch.sources).sort((left, right) => (
    compareUtf8Binary(sourceKey(left), sourceKey(right))
  ));
  const models = new Map<string, BenchmarkModel>();
  for (const candidate of batches.flatMap((batch) => batch.models)) {
    const previous = models.get(candidate.modelKey);
    if (!previous || sourcePriority(candidate.sourceId) < sourcePriority(previous.sourceId)
      || (candidate.sourceId === previous.sourceId
        && compareUtf8Binary(candidate.sourceArtifactId, previous.sourceArtifactId) < 0)) {
      models.set(candidate.modelKey, { ...candidate });
    } else if (candidate.sourceId === previous.sourceId && candidate.sourceModelId === previous.sourceModelId) {
      previous.benchmarkCount += candidate.benchmarkCount;
    }
  }
  const metrics = batches.flatMap((batch) => batch.metrics).sort((left, right) => compareUtf8Binary(
    `${left.modelKey}\u0000${left.metricKey}`,
    `${right.modelKey}\u0000${right.metricKey}`,
  ));
  const prices = batches.flatMap((batch) => batch.priceChecks).sort((left, right) => compareUtf8Binary(
    `${left.modelKey}\u0000${left.sourceId}\u0000${left.providerId}\u0000${left.routeId}`,
    `${right.modelKey}\u0000${right.sourceId}\u0000${right.providerId}\u0000${right.routeId}`,
  ));
  const seeds = batches.flatMap((batch) => batch.comparisonSeeds)
    .sort((left, right) => compareUtf8Binary(left.pairSlug, right.pairSlug));
  return validateNormalizedSourceBatch({
    sources,
    models: [...models.values()].sort((left, right) => compareUtf8Binary(left.modelKey, right.modelKey)),
    metrics,
    priceChecks: prices,
    comparisonSeeds: seeds,
  });
}
