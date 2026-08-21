import "server-only";

import type { CatalogResponse } from "@tokenbench/catalog/contracts";
import { validateCatalogResponse } from "@tokenbench/catalog/validation";
import { parseModelDirectoryEnvelope } from "@tokenbench/frontend/model-directory-contracts";
import { parseModelProfileViewModel, type ModelProfileViewModel } from "@tokenbench/frontend/model-profile-contracts";
import {
  projectPublishedComparison,
  projectPublishedLifecycle,
  projectPublishedModelDirectory,
  projectPublishedModelProfile,
  projectPublishedRanking,
  mergePublishedComparisonSource,
  mergePublishedModelDirectorySources,
  mergePublishedProfileSource,
} from "@tokenbench/frontend/published-model-compatibility";
import type {
  CompareData,
  LifecycleData,
  ModelDirectoryData,
  PreviewModelProfileData,
  RankingData,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

import { loadCurrentLiveBenchRanking } from "@/lib/livebench-upstream.server";

function publishedBaseUrl(): URL {
  const configured = process.env.TOKENBENCH_UI_DATA_BASE_URL;
  if (configured === undefined || configured.trim().length === 0) {
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL is not configured.");
  }
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("TOKENBENCH_UI_DATA_BASE_URL must use HTTP or HTTPS.");
  }
  return url;
}

async function publishedJson(path: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(new URL(path, publishedBaseUrl()), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new TypeError(`Published endpoint returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new TypeError("Published endpoint did not return JSON.");
  }
  return response.json();
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function loadPublishedCatalog(fetchImpl: typeof fetch = fetch): Promise<CatalogResponse> {
  return validateCatalogResponse(await publishedJson("/api/catalog", fetchImpl));
}

export async function loadPublishedModelDirectory(
  limit = 100,
  fetchImpl: typeof fetch = fetch,
): Promise<UiDataContractV1<ModelDirectoryData>> {
  const [directory, ranking] = await Promise.all([
    publishedDirectorySource(limit, fetchImpl).then(projectPublishedModelDirectory),
    loadCurrentLiveBenchRanking().catch(() => null),
  ]);
  return mergePublishedModelDirectorySources(directory, ranking);
}

async function publishedDirectorySource(limit: number, fetchImpl: typeof fetch) {
  const candidate = parseModelDirectoryEnvelope(await publishedJson(`/api/benchmarks/models?limit=${limit}`, fetchImpl));
  if (candidate === null) throw new TypeError("Published model directory failed validation.");
  return candidate;
}

export async function loadPublishedModelDirectoryAndRanking(
  limit = 100,
  fetchImpl: typeof fetch = fetch,
): Promise<Readonly<{
  models: UiDataContractV1<ModelDirectoryData>;
  rankings: UiDataContractV1<RankingData>;
  rankedModelIds: readonly string[];
}>> {
  const candidate = await publishedDirectorySource(limit, fetchImpl);
  const ranking = await loadCurrentLiveBenchRanking().catch(() => null);
  return {
    models: mergePublishedModelDirectorySources(projectPublishedModelDirectory(candidate), ranking),
    rankings: projectPublishedRanking(candidate),
    rankedModelIds: candidate.data.models
      .filter((entry) => entry.weeklyRank !== null)
      .slice()
      .sort((left, right) => (left.weeklyRank as number) - (right.weeklyRank as number))
      .map((entry) => entry.canonicalSlug),
  };
}

async function publishedProfile(
  slug: string,
  fetchImpl: typeof fetch,
  allowMissing: boolean,
): Promise<ModelProfileViewModel | null> {
  const response = await fetchImpl(new URL(`/api/benchmarks/models/${encodeURIComponent(slug)}`, publishedBaseUrl()), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new TypeError(`Published profile returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new TypeError("Published profile did not return JSON.");
  const body = record(await response.json());
  const data = record(body?.data);
  if (body === null || data === null) throw new TypeError("Published profile envelope is malformed.");
  const candidate = parseModelProfileViewModel({
    revision: body.revision,
    publishedAt: body.publishedAt,
    freshness: body.freshness,
    attribution: body.attribution,
    ...data,
  });
  if (candidate === null) throw new TypeError("Published model profile failed validation.");
  return candidate;
}

export async function loadPublishedModelProfile(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UiDataContractV1<PreviewModelProfileData>> {
  const candidate = await publishedProfile(slug, fetchImpl, false);
  if (candidate === null) throw new TypeError("Published model profile is unavailable.");
  return mergePublishedProfileSource(projectPublishedModelProfile(candidate), await loadCurrentLiveBenchRanking().catch(() => null));
}

export async function loadPublishedModelComparison(
  modelIds: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<UiDataContractV1<CompareData>> {
  const profiles = await Promise.all(modelIds.map((id) => publishedProfile(id, fetchImpl, true)));
  const comparison = projectPublishedComparison(
    profiles.filter((profile): profile is ModelProfileViewModel => profile !== null),
    modelIds,
  );
  return mergePublishedComparisonSource(comparison, await loadCurrentLiveBenchRanking().catch(() => null));
}

export async function loadPublishedLifecycle(
  query: { readonly asOf: string; readonly horizonDays: number },
  fetchImpl: typeof fetch = fetch,
): Promise<UiDataContractV1<LifecycleData>> {
  return projectPublishedLifecycle(await loadPublishedCatalog(fetchImpl), query);
}
