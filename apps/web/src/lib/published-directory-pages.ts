import type { ModelDirectoryEnvelope } from "@tokenbench/frontend/model-directory-contracts";

function sameDirectoryWeek(
  left: ModelDirectoryEnvelope["data"]["week"],
  right: ModelDirectoryEnvelope["data"]["week"],
): boolean {
  if (left === null || right === null) return left === right;
  return left.weekStart === right.weekStart
    && left.benchmarkRevision === right.benchmarkRevision
    && left.sourceSnapshotId === right.sourceSnapshotId
    && left.methodologyVersion === right.methodologyVersion
    && left.generatedAt === right.generatedAt;
}

/**
 * A directory cursor is part of one published revision. Pages must therefore
 * agree on their publication receipt before the Next surface can join them.
 * This preserves all current records without mixing revisions or accepting a
 * repeated identity as two independent models.
 */
export function mergePublishedDirectoryPages(
  pages: readonly ModelDirectoryEnvelope[],
): ModelDirectoryEnvelope {
  const first = pages[0];
  if (first === undefined) throw new TypeError("Published model directory returned no pages.");

  if (pages.some((page) => (
    page.revision !== first.revision
    || page.publishedAt !== first.publishedAt
    || page.freshness.status !== first.freshness.status
    || page.freshness.checkedAt !== first.freshness.checkedAt
    || page.freshness.message !== first.freshness.message
    || !sameDirectoryWeek(page.data.week, first.data.week)
  ))) {
    throw new TypeError("Published model directory changed while paginated results were loading.");
  }

  const entries = pages.flatMap((page) => page.data.models);
  const modelKeys = new Set<string>();
  const canonicalSlugs = new Set<string>();
  for (const entry of entries) {
    if (modelKeys.has(entry.modelKey) || canonicalSlugs.has(entry.canonicalSlug)) {
      throw new TypeError("Published model directory repeated an exact model identity.");
    }
    modelKeys.add(entry.modelKey);
    canonicalSlugs.add(entry.canonicalSlug);
  }

  const attributions = [...new Map(
    pages.flatMap((page) => page.attribution)
      .map((source) => [`${source.sourceId}\u0000${source.url}\u0000${source.updatedAt}`, source] as const),
  ).values()];
  return {
    ...first,
    attribution: attributions,
    data: { ...first.data, models: entries, nextCursor: null },
  };
}
