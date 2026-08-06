import {
  compareUtf8Binary,
  type BenchmarkPriceCheck,
  type BenchmarkSourceId,
  type BenchmarkSourceRecord,
} from './contracts';
import type { PriceRoute } from '../catalog/contracts';

const ROUTER_PRICE_ROUTES = ['openrouter', 'opencode_zen'] as const satisfies readonly PriceRoute[];

/** Source artifact IDs are source-scoped in the benchmark contract. */
export function comparisonPriceSourceArtifactIdentity(sourceId: BenchmarkSourceId, artifactId: string): string {
  return `${sourceId}\u0000${artifactId}`;
}

function resolvedSource(
  price: BenchmarkPriceCheck,
  sourcesByArtifactId: ReadonlyMap<string, BenchmarkSourceRecord>,
): BenchmarkSourceRecord | null {
  const source = sourcesByArtifactId.get(comparisonPriceSourceArtifactIdentity(price.sourceId, price.sourceArtifactId))
    ?? sourcesByArtifactId.get(price.sourceArtifactId);
  return source?.sourceId === price.sourceId && Number.isFinite(Date.parse(source.observedAt)) ? source : null;
}

function isKnownRouter(price: BenchmarkPriceCheck): boolean {
  return ROUTER_PRICE_ROUTES.some((route) => price.providerId === route
    || price.routeId === route
    || price.routeId.startsWith(`${route}:`)
    || price.routeId.endsWith(`:${route}`));
}

function comparePriceRoutes(
  left: BenchmarkPriceCheck,
  right: BenchmarkPriceCheck,
  sourcesByArtifactId: ReadonlyMap<string, BenchmarkSourceRecord>,
): number {
  const primaryOrder = Number(right.verificationStatus === 'primary') - Number(left.verificationStatus === 'primary');
  if (primaryOrder !== 0) return primaryOrder;
  const routerOrder = Number(isKnownRouter(left)) - Number(isKnownRouter(right));
  if (routerOrder !== 0) return routerOrder;
  const observedAtOrder = Date.parse(resolvedSource(right, sourcesByArtifactId)!.observedAt)
    - Date.parse(resolvedSource(left, sourcesByArtifactId)!.observedAt);
  if (observedAtOrder !== 0) return observedAtOrder;
  return compareUtf8Binary(left.routeId, right.routeId);
}

/**
 * Returns source-backed, non-conflicting route facts in the order comparison
 * pages use for their default route. It leaves callers' price arrays intact.
 */
export function comparisonPriceRoutes(
  modelKey: string,
  prices: readonly BenchmarkPriceCheck[],
  sourcesByArtifactId: ReadonlyMap<string, BenchmarkSourceRecord>,
): readonly BenchmarkPriceCheck[] {
  return prices
    .filter((price) => price.modelKey === modelKey
      && price.verificationStatus !== 'conflict'
      && resolvedSource(price, sourcesByArtifactId) !== null)
    .slice()
    .sort((left, right) => comparePriceRoutes(left, right, sourcesByArtifactId));
}

export function defaultComparisonPriceRoute(
  modelKey: string,
  prices: readonly BenchmarkPriceCheck[],
  sourcesByArtifactId: ReadonlyMap<string, BenchmarkSourceRecord>,
): BenchmarkPriceCheck | null {
  return comparisonPriceRoutes(modelKey, prices, sourcesByArtifactId)[0] ?? null;
}
