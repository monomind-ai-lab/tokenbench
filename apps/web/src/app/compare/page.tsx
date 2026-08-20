import type { Metadata } from "next";

import { CompareWorkbenchPage } from "@/components/compare-workbench-page";
import { loadModelSurfaceComparison, loadModelSurfaceDirectory } from "@/lib/model-surface-data.server";
import { parseSurfaceComparisonQuery, projectSurfaceComparison, projectSurfaceDirectory } from "@tokenbench/frontend/model-surface-projectors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare AI Models",
  description: "Compare two to four AI models across capability, runtime, token economics, context capacity, and source provenance.",
  alternates: { canonical: "/compare/" },
};

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ models?: string | string[] }> }) {
  const query = await searchParams;
  const comparisonQuery = parseSurfaceComparisonQuery(query.models);
  const { requestedIds, valid: validRequest } = comparisonQuery;
  const [directorySnapshot, comparisonSnapshot] = await Promise.all([
    loadModelSurfaceDirectory(),
    validRequest && requestedIds.length >= 2 ? loadModelSurfaceComparison(requestedIds) : Promise.resolve(null),
  ]);
  const directory = directorySnapshot.envelope === null ? null : projectSurfaceDirectory(directorySnapshot.envelope);
  const comparison = comparisonSnapshot?.envelope === null || comparisonSnapshot === null
    ? null
    : projectSurfaceComparison(comparisonSnapshot.envelope, requestedIds);
  const sources = new Map((directory?.provenance ?? []).map((source) => [source.id, source]));
  for (const source of comparison?.provenance ?? []) sources.set(source.id, source);
  const mode = comparison?.mode ?? directory?.mode ?? "published";
  const status = comparison?.status ?? directory?.status ?? "unavailable";
  return <CompareWorkbenchPage candidates={directory?.data ?? []} comparison={comparison?.data ?? null} mode={mode} requestedIds={requestedIds} sources={[...sources.values()]} status={status} validRequest={validRequest} />;
}
