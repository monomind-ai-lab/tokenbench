import "server-only";

import type { WorkloadProfile } from "@tokenbench/benchmarks/value";
import type { LeaderboardKey } from "@tokenbench/routing/leaderboard-routes";

import {
  leaderboardRouteLiveEndpoint,
  mergeLeaderboardRouteLiveEnvelopes,
  parseLeaderboardRouteLiveEnvelope,
  projectLeaderboardRouteLiveEnvelope,
} from "@/lib/leaderboard-route-live";
import type { LeaderboardDataSnapshot } from "@/lib/ui-data.server";

function productionBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL is not configured.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL must use HTTP or HTTPS.");
  }
  return url.toString();
}

function unavailable(mode: LeaderboardDataSnapshot["mode"], error: string): LeaderboardDataSnapshot {
  return { mode, envelope: null, error };
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message.includes("TOKENBENCH_UI_DATA_BASE_URL")) {
    return "The published leaderboard endpoint is not configured for this environment.";
  }
  return "The published leaderboard response was unavailable or invalid for this route.";
}

/**
 * Production-only per-key route loader. It intentionally imports neither the
 * strict-v1 production adapter nor preview evidence, so a failed endpoint
 * cannot turn into a generic LiveBench result or a local fixture fallback.
 */
export async function loadLeaderboardRouteLiveSnapshot(
  key: LeaderboardKey,
  profile: WorkloadProfile,
): Promise<LeaderboardDataSnapshot> {
  const configuredMode = process.env.TOKENBENCH_UI_DATA_MODE;
  if (configuredMode !== "http" && process.env.NODE_ENV !== "production") {
    return unavailable(
      "unconfigured",
      "Choose TOKENBENCH_UI_DATA_MODE=http or evidence before requesting leaderboard data.",
    );
  }

  try {
    const baseUrl = productionBaseUrl(process.env.TOKENBENCH_UI_DATA_BASE_URL);
    const pages = [];
    let cursor: string | null = null;
    for (let pageIndex = 0; pageIndex < 32; pageIndex += 1) {
      const endpoint = new URL(leaderboardRouteLiveEndpoint(key, profile, cursor), baseUrl);
      const response = await fetch(endpoint, { cache: "no-store", headers: { accept: "application/json" } });
      if (response.status === 404 || response.status === 503) {
        return unavailable("production", "No published leaderboard projection is available for this route.");
      }
      if (!response.ok) return unavailable("production", `The published leaderboard request failed (${response.status}).`);
      let candidate: unknown;
      try {
        candidate = await response.json();
      } catch {
        return unavailable("production", "The published leaderboard response was not valid JSON.");
      }
      const page = parseLeaderboardRouteLiveEnvelope(candidate, key, profile);
      pages.push(page);
      cursor = page.data.pagination.nextCursor;
      if (cursor === null) break;
    }
    if (cursor !== null) return unavailable("production", "The published leaderboard exceeded the bounded pagination limit.");
    const envelope = mergeLeaderboardRouteLiveEnvelopes(pages);
    return {
      mode: "production",
      envelope: projectLeaderboardRouteLiveEnvelope(envelope),
      error: null,
    };
  } catch (error) {
    return unavailable("production", safeError(error));
  }
}
