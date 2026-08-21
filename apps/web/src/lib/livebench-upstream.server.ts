import "server-only";

import { buildLiveBenchRankingsEnvelope } from "@tokenbench/../functions/_shared/livebench-ui-data";
import { parseUiDataContractV1 } from "@tokenbench/frontend/preview-data/contract-v1";
import { mapRetainedRankingsEvidence } from "@tokenbench/frontend/preview-data/api-adapter";
import type { RankingData, RankingQuery, UiDataContractV1 } from "@tokenbench/frontend/preview-data/contracts";
import { parseLiveBenchRelease } from "@tokenbench/livebench/parser";
import type { LiveBenchArtifactId, LiveBenchReleaseBundle } from "@tokenbench/livebench/contracts";
import type { SourceAttribution } from "@tokenbench/pipeline/ui-data-contract-v1-core";
import { normalizeRankingsRequest, type LeaderboardRankingsRequest } from "@tokenbench/pipeline/ui-data-contract-v1-rankings";
import {
  discoverLiveBenchRelease,
  type LiveBenchReleaseDescriptor,
} from "@tokenbench/../workers/benchmark-ingest/src/livebench-discovery";
import { unstable_cache } from "next/cache";

const MAX_BYTES: Readonly<Record<LiveBenchArtifactId, number>> = {
  table: 4 * 1024 * 1024,
  categories: 1024 * 1024,
  cost: 8 * 1024 * 1024,
  "model-links": 1024 * 1024,
};

async function boundedBytes(url: string, maximum: number): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { Accept: "application/octet-stream", "User-Agent": "TokenBench web evidence loader" },
    cache: "no-store",
  });
  if (!response.ok) throw new TypeError(`Published benchmark artifact returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximum) throw new TypeError("Published benchmark artifact exceeds its verified size bound.");
  return bytes;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function gitBlobId(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + bytes.byteLength);
  payload.set(header);
  payload.set(bytes, header.byteLength);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-1", payload)));
}

async function retrieveBundle(descriptor: LiveBenchReleaseDescriptor, observedAt: string): Promise<LiveBenchReleaseBundle> {
  const artifacts = new Map<LiveBenchArtifactId, Uint8Array>();
  for (const artifact of descriptor.artifacts) {
    const bytes = await boundedBytes(artifact.rawUrl, MAX_BYTES[artifact.artifactId]);
    if (await gitBlobId(bytes) !== artifact.blobId) throw new TypeError(`Published ${artifact.artifactId} artifact failed immutable blob verification.`);
    artifacts.set(artifact.artifactId, bytes);
  }
  const required = (id: LiveBenchArtifactId): Uint8Array => {
    const bytes = artifacts.get(id);
    if (bytes === undefined) throw new TypeError(`Published benchmark release is missing ${id}.`);
    return bytes;
  };
  return parseLiveBenchRelease({
    releaseId: descriptor.releaseId,
    sourceCommit: descriptor.commit,
    observedAt,
    licenseEvidence: {
      licenseId: "CDLA-Permissive-2.0",
      verificationUrl: "https://github.com/LiveBench/new-livebench",
      verifiedAt: "2026-08-21T00:00:00.000Z",
    },
    tableCsv: required("table"),
    categoriesJson: required("categories"),
    costCsv: required("cost"),
    modelLinksSource: required("model-links"),
  });
}

const loadCurrentBundle = unstable_cache(async (): Promise<LiveBenchReleaseBundle> => {
  const checkedAt = new Date().toISOString();
  const discovery = await discoverLiveBenchRelease({
    previous: { etag: null, headCommit: null, fingerprint: null, verifiedIsoWeek: null },
    checkedAt,
    forceWeeklyVerification: true,
    fetchImpl: fetch,
  });
  if (discovery.status !== "changed") {
    throw new TypeError(discovery.status === "incomplete_upstream_release"
      ? `Published benchmark release ${discovery.releaseId} is incomplete.`
      : "Published benchmark discovery returned no release.");
  }
  return retrieveBundle(discovery.release, checkedAt);
}, ["tokenbench-current-livebench-bundle-v1"], { revalidate: 21_600 });

export const LIVEBENCH_WEB_RANKING_QUERY = {
  operation: "leaderboard",
  releaseId: null,
  filters: {
    organizationIds: [],
    openWeights: "all",
    excludeDerivativeFinetunes: false,
  },
  limit: 100,
  cursor: null,
} as const satisfies RankingQuery;

export async function loadCurrentLiveBenchRanking(): Promise<UiDataContractV1<RankingData>> {
  const bundle = await loadCurrentBundle();
  const fetchedAt = new Date().toISOString();
  const request = normalizeRankingsRequest(LIVEBENCH_WEB_RANKING_QUERY) as LeaderboardRankingsRequest;
  const source: SourceAttribution = {
    sourceRef: `livebench:${bundle.sourceCommit}:${bundle.releaseId}`,
    fieldGroup: "/data",
    sourceId: "livebench",
    sourceRevision: bundle.sourceCommit,
    label: `Benchmark release ${bundle.releaseId}`,
    url: `https://github.com/LiveBench/new-livebench/tree/${bundle.sourceCommit}`,
    licenseId: "CDLA-Permissive-2.0",
    observedAt: bundle.observedAt,
    effectiveAt: `${bundle.releaseId}T00:00:00.000Z`,
  };
  const raw = buildLiveBenchRankingsEnvelope({
    bundle,
    request,
    source,
    fetchedAt,
    projectionRevision: `livebench-web:${bundle.sourceCommit}:${bundle.releaseId}`,
    benchmarkRevision: bundle.sourceCommit,
    projectionMethodology: "livebench-upstream-global-average-v1",
    checkedAt: bundle.observedAt,
  });
  const accepted = parseUiDataContractV1(raw, "rankings");
  return mapRetainedRankingsEvidence(accepted, LIVEBENCH_WEB_RANKING_QUERY);
}
