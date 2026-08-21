import "server-only";

import { projectPopularModelsV1, type PopularModelsV1ViewModel } from "@tokenbench/frontend/popular-models-v1";
import {
  parsePricePerformanceEnvelope,
  type PricePerformanceEnvelope,
} from "@tokenbench/benchmarks/price-performance-contracts";
import type { LeaderboardKey } from "@tokenbench/routing/leaderboard-routes";

import {
  leaderboardRouteLiveEndpoint,
  mergeLeaderboardRouteLiveEnvelopes,
  parseLeaderboardRouteLiveEnvelope,
  type LeaderboardRouteLiveEnvelope,
} from "@/lib/leaderboard-route-live";
import { loadLeaderboardRankings } from "@/lib/ui-data.server";
import { loadCurrentLiveBenchRanking } from "@/lib/livebench-upstream.server";
import {
  POPULAR_MODELS_CATEGORY_LEADERBOARD_KEYS,
  loadPopularModelsLiveDirectory,
  projectPopularModelsLive,
  projectPopularModelsLiveWithPublishedCategories,
  resolvePopularModelsDataPath,
  type PopularModelsCategoryLeaderboardSource,
} from "@/lib/popular-models-live";

export type PopularModelsDataMode = "evidence" | "production" | "unconfigured";

/** Shared server result for the route and any server-rendered weekly-model UI. */
export interface PopularModelsDataResult {
  readonly dataMode: PopularModelsDataMode;
  readonly viewModel: PopularModelsV1ViewModel;
}

const POPULAR_MODELS_CATEGORY_MAX_PAGES = 32;

function publishedBaseUrl(value: string | undefined): string {
  if (!value?.trim())
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL is not configured.");
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.search ||
    url.hash
  )
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL must be an HTTP(S) service URL.");
  return url.toString();
}

/**
 * Reuses the canonical route parser and opaque-cursor merge semantics. Every
 * category fetch is bounded and sequential per cursor chain; callers start
 * the small fixed set of independent category chains concurrently.
 */
async function loadPopularModelsCategoryLeaderboard(
  baseUrl: string,
  key: LeaderboardKey,
  fetchImpl: typeof fetch,
): Promise<LeaderboardRouteLiveEnvelope> {
  const pages: LeaderboardRouteLiveEnvelope[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < POPULAR_MODELS_CATEGORY_MAX_PAGES; pageIndex += 1) {
    const endpoint = new URL(
      leaderboardRouteLiveEndpoint(key, "balanced", cursor),
      baseUrl,
    );
    const response = await fetchImpl(endpoint, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok)
      throw new Error(`Published ${key} category leaderboard returned HTTP ${response.status}.`);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Published ${key} category leaderboard returned invalid JSON.`);
    }
    const page = parseLeaderboardRouteLiveEnvelope(payload, key, "balanced");
    pages.push(page);
    const nextCursor = page.data.pagination.nextCursor;
    if (nextCursor !== null && seenCursors.has(nextCursor))
      throw new Error(`Published ${key} category leaderboard repeated an opaque cursor.`);
    if (nextCursor !== null) seenCursors.add(nextCursor);
    cursor = nextCursor;
    if (cursor === null) return mergeLeaderboardRouteLiveEnvelopes(pages);
  }
  throw new Error(`Published ${key} category leaderboard exceeded its pagination bound.`);
}

/**
 * A failed supplementary category source must not discard the verified weekly
 * directory. Return only independently validated successes—there is no local
 * fallback—and let the projector retain unavailable fields for the rest.
 */
export async function loadPopularModelsCategoryLeaderboardSources(
  configuredBaseUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly PopularModelsCategoryLeaderboardSource[]> {
  const baseUrl = publishedBaseUrl(configuredBaseUrl);
  const settled = await Promise.allSettled(
    POPULAR_MODELS_CATEGORY_LEADERBOARD_KEYS.map(async (key) => ({
      key,
      envelope: await loadPopularModelsCategoryLeaderboard(baseUrl, key, fetchImpl),
    })),
  );
  return settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

async function loadPopularModelsPricePerformance(
  configuredBaseUrl: string | undefined,
  fetchImpl: typeof fetch,
): Promise<PricePerformanceEnvelope> {
  const endpoint = new URL("/api/benchmarks/price-performance", publishedBaseUrl(configuredBaseUrl));
  const response = await fetchImpl(endpoint, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Published price-performance projection returned HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Published price-performance projection returned invalid JSON.");
  }
  const envelope = parsePricePerformanceEnvelope(payload);
  if (envelope === null)
    throw new Error("Published price-performance projection did not match its typed contract.");
  return envelope;
}

function liveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("TOKENBENCH_UI_DATA_BASE_URL"))
    return "The live Popular Models data service is not configured for this environment.";
  return "The live Popular Models directory could not complete this request.";
}

async function loadStrictProductionLeaderboard(): Promise<PopularModelsV1ViewModel | null> {
  const envelope = await loadCurrentLiveBenchRanking();
  if (envelope.data === null) return null;
  return projectPopularModelsV1(envelope);
}

/**
 * Selects one explicit data path. Local evidence stays on the retained strict
 * v1 adapter; production and explicit HTTP mode load the legacy weekly
 * directory, strict HTTP leaderboard, and bounded source receipts
 * concurrently, never evidence.
 */
export async function loadPopularModelsData(
  fetchImpl: typeof fetch = fetch,
): Promise<PopularModelsDataResult> {
  const path = resolvePopularModelsDataPath(
    process.env.TOKENBENCH_UI_DATA_MODE,
    process.env.NODE_ENV,
  );

  if (path === "evidence") {
    const snapshot = await loadLeaderboardRankings();
    return {
      dataMode: snapshot.mode,
      viewModel: projectPopularModelsV1(snapshot.envelope, snapshot.error),
    };
  }

  if (path === "unconfigured")
    return {
      dataMode: "unconfigured",
      viewModel: projectPopularModelsLive(
        null,
        "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before requesting Popular Models data.",
      ),
    };

  const [weeklyResult, strictResult, categoryResult, pricePerformanceResult] = await Promise.allSettled([
    loadPopularModelsLiveDirectory(
      process.env.TOKENBENCH_UI_DATA_BASE_URL,
      fetchImpl,
    ),
    loadStrictProductionLeaderboard(),
    loadPopularModelsCategoryLeaderboardSources(
      process.env.TOKENBENCH_UI_DATA_BASE_URL,
      fetchImpl,
    ),
    loadPopularModelsPricePerformance(
      process.env.TOKENBENCH_UI_DATA_BASE_URL,
      fetchImpl,
    ),
  ]);

  if (weeklyResult.status === "rejected") {
    return {
      dataMode: "production",
      // Never expose the strict benchmark rank as a Popular Models rank when
      // the weekly popularity source cannot be verified.
      viewModel: projectPopularModelsLive(null, liveErrorMessage(weeklyResult.reason)),
    };
  }

  return {
    dataMode: "production",
    viewModel: projectPopularModelsLiveWithPublishedCategories(
      weeklyResult.value,
      strictResult.status === "fulfilled" ? strictResult.value : null,
      categoryResult.status === "fulfilled" ? categoryResult.value : [],
      pricePerformanceResult.status === "fulfilled"
        ? pricePerformanceResult.value
        : null,
    ),
  };
}
