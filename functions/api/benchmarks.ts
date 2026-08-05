import { BENCHMARK_SOURCE_IDS, type BenchmarkSourceId } from '../../src/benchmarks/contracts';
import { buildLeaderboard, LEADERBOARD_DEFINITIONS } from '../../src/benchmarks/leaderboards';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from '../../src/routing/routes';
import {
  attributionForAllSources,
  benchmarkEnvelope,
  etagForBenchmarkResponse,
  jsonBenchmarkResponse,
  matchesExactEtag,
  notModifiedBenchmarkResponse,
  readActiveBenchmarkSnapshot,
  unavailableBenchmarkResponse,
  type ActiveBenchmarkSnapshot,
  type BenchmarkApiEnv,
} from '../_shared/benchmark-db';

interface SourceAvailability {
  readonly sourceId: BenchmarkSourceId;
  readonly available: boolean;
  readonly updatedAt: string | null;
  readonly artifacts: readonly {
    readonly artifactId: string;
    readonly url: string;
    readonly updatedAt: string;
  }[];
}

interface RouteAvailability {
  readonly key: LeaderboardKey;
  readonly kind: typeof LEADERBOARD_DEFINITIONS[LeaderboardKey]['kind'];
  readonly metricKeys: readonly string[];
  readonly available: boolean;
  readonly supportsEstimated: boolean;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasBenchLmEvidenceLens(definition: typeof LEADERBOARD_DEFINITIONS[LeaderboardKey]): boolean {
  return ('sourceId' in definition && definition.sourceId === 'benchlm') || definition.kind === 'multimodal';
}

function sourceAvailability(snapshot: ActiveBenchmarkSnapshot): readonly SourceAvailability[] {
  return BENCHMARK_SOURCE_IDS.map((sourceId) => {
    const records = snapshot.sources.filter((source) => source.sourceId === sourceId);
    return {
      sourceId,
      available: records.length > 0,
      updatedAt: records.length === 0 ? null : records.map((record) => record.observedAt).sort(compareText).at(-1)!,
      artifacts: records.map((record) => ({
        artifactId: record.artifactId,
        url: record.sourceUrl,
        updatedAt: record.observedAt,
      })),
    };
  });
}

function routeAvailability(snapshot: ActiveBenchmarkSnapshot): readonly RouteAvailability[] {
  return (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
    .slice()
    .sort(compareText)
    .map((key) => {
      const definition = LEADERBOARD_DEFINITIONS[key];
      const result = buildLeaderboard(key, snapshot.models, snapshot.metrics, snapshot.priceChecks, 'balanced');
      return {
        key,
        kind: definition.kind,
        metricKeys: definition.metricKeys,
        available: result.entries.length > 0,
        supportsEstimated: hasBenchLmEvidenceLens(definition),
      };
    });
}

export async function onRequestGet({ request, env }: { request: Request; env: BenchmarkApiEnv }): Promise<Response> {
  if (!env.CATALOG_DB) return unavailableBenchmarkResponse();

  try {
    const snapshot = await readActiveBenchmarkSnapshot(env.CATALOG_DB);
    if (!snapshot) return unavailableBenchmarkResponse();

    const etag = etagForBenchmarkResponse(snapshot.revision.revision, { endpoint: 'benchmarks' });
    if (matchesExactEtag(request, etag)) return notModifiedBenchmarkResponse(etag);

    return jsonBenchmarkResponse(
      benchmarkEnvelope(snapshot, attributionForAllSources(snapshot), {
        sources: sourceAvailability(snapshot),
        routes: routeAvailability(snapshot),
      }),
      200,
      etag,
    );
  } catch {
    return unavailableBenchmarkResponse();
  }
}
