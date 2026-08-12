import {
  type BenchmarkComparisonPair,
  type BenchmarkMetric,
  type BenchmarkModel,
  type ComparisonSeed,
  type NormalizedSourceBatch,
  compareUtf8Binary,
  createComparisonPairSlugResolver,
  isComparisonPairRouteSafe,
  validateBenchmarkComparisonPair,
  validateIndexableComparisonPairRoute,
} from '../../../src/benchmarks/contracts';
import { COMPARISON_ALLOWLIST } from '../../../src/benchmarks/comparison-allowlist';

function normalizedEvidenceText(value: unknown): string {
  return JSON.stringify(value)
    .normalize('NFKC')
    .replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}_-]/gu, '')
    .toLowerCase();
}

function safeBenchLmCategories(
  metrics: readonly BenchmarkMetric[],
  modelKey: string,
): Map<string, BenchmarkMetric> {
  return new Map(metrics
    .filter((metric) => metric.modelKey === modelKey && metric.sourceId === 'benchlm'
      && metric.metricKey.startsWith('benchlm:category:') && metric.rankingEligible
      && Number.isFinite(metric.value) && !normalizedEvidenceText(metric).includes('artificialanalysis'))
    .map((metric) => [metric.category, metric]));
}

function editorialSeeds(models: readonly BenchmarkModel[]): ComparisonSeed[] {
  const bySlug = new Map(models.map((model) => [model.slug, model]));
  return COMPARISON_ALLOWLIST.flatMap((pairSlug) => {
    const [leftSlug, rightSlug] = pairSlug.split('-vs-');
    const left = bySlug.get(leftSlug);
    const right = bySlug.get(rightSlug);
    if (!left || !right || left.modelKey === right.modelKey) return [];
    const [modelA, modelB] = compareUtf8Binary(left.modelKey, right.modelKey) < 0
      ? [left, right]
      : [right, left];
    return [{
      pairSlug: `${modelA.slug}-vs-${modelB.slug}`,
      modelAKey: modelA.modelKey,
      modelBKey: modelB.modelKey,
      sourceId: 'benchlm',
      sourceArtifactId: 'comparisons',
      sourceModelAId: modelA.sourceModelId,
      sourceModelBId: modelB.sourceModelId,
      featuredRank: null,
    }];
  });
}

/** Exact production comparison-pair derivation shared by both ingestion paths. */
export function deriveComparisonPairs(batch: NormalizedSourceBatch): BenchmarkComparisonPair[] {
  const byKey = new Map(batch.models.map((model) => [model.modelKey, model]));
  const resolvePairSlug = createComparisonPairSlugResolver(batch.models);
  const records = new Map<string, BenchmarkComparisonPair>();
  for (const seed of [...batch.comparisonSeeds, ...editorialSeeds(batch.models)]) {
    const left = byKey.get(seed.modelAKey);
    const right = byKey.get(seed.modelBKey);
    if (!left || !right || left.modelKey === right.modelKey) continue;
    const [modelA, modelB] = compareUtf8Binary(left.modelKey, right.modelKey) < 0
      ? [left, right]
      : [right, left];
    const pairSlug = `${modelA.slug}-vs-${modelB.slug}`;
    const overall = batch.metrics.filter((metric) => (
      metric.metricKey === 'benchlm:overall:raw' && metric.rankingEligible
    ));
    const bothOverall = overall.some((metric) => metric.modelKey === modelA.modelKey)
      && overall.some((metric) => metric.modelKey === modelB.modelKey);
    const categoriesA = safeBenchLmCategories(batch.metrics, modelA.modelKey);
    const categoriesB = safeBenchLmCategories(batch.metrics, modelB.modelKey);
    const sharedMetricCount = [...categoriesA.keys()].filter((category) => categoriesB.has(category)).length;
    const qualityEligible = modelA.evidenceStatus === 'supported' && modelB.evidenceStatus === 'supported'
      && modelA.rankingEligible && modelB.rankingEligible && bothOverall && sharedMetricCount >= 2;
    const resolved = resolvePairSlug(pairSlug);
    const routeEligible = isComparisonPairRouteSafe(pairSlug)
      && resolved !== null
      && resolved.modelA.modelKey === modelA.modelKey
      && resolved.modelB.modelKey === modelB.modelKey
      && resolved.canonicalPairSlug === pairSlug;
    const indexable = qualityEligible && routeEligible;
    const eligibilityReason = !qualityEligible
      ? 'quality-gates-not-met'
      : routeEligible
        ? 'supported-safe-shared-benchlm-categories'
        : 'route-ineligible';
    const pair = validateBenchmarkComparisonPair({
      pairSlug,
      modelAKey: modelA.modelKey,
      modelBKey: modelB.modelKey,
      indexable,
      eligibilityReason,
      featuredRank: seed.featuredRank,
      sharedMetricCount,
    });
    validateIndexableComparisonPairRoute(batch.models, pair, resolvePairSlug);
    records.set(`${pair.modelAKey}\u0000${pair.modelBKey}`, pair);
  }
  return [...records.values()].sort((left, right) => compareUtf8Binary(left.pairSlug, right.pairSlug));
}
