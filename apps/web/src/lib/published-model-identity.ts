import { isModelSlugRouteSafe } from "@tokenbench/benchmarks/model-directory";
import type { ModelDirectoryEnvelope } from "@tokenbench/frontend/model-directory-contracts";

function isSourcePrefixedModelId(value: string): boolean {
  return value.startsWith("source:");
}

/**
 * A source-prefixed model key is not safe to put into a public model route.
 * Resolve it only when the published directory explicitly ties that exact key
 * to one route-safe canonical slug. This deliberately does not use display
 * names, aliases, or partial source-model-ID matching.
 */
export function normalizePublishedModelIds(
  requestedIds: readonly string[],
  directories: readonly ModelDirectoryEnvelope[],
): readonly string[] {
  const requestedSourceIds = new Set(requestedIds.filter(isSourcePrefixedModelId));
  if (requestedSourceIds.size === 0) return requestedIds;

  const mappings = new Map<string, string | null>();
  for (const directory of directories) {
    for (const entry of directory.data.models) {
      if (!requestedSourceIds.has(entry.modelKey)) continue;
      // The producer's exact identity receipt is the complete source key plus
      // its source components. Do not infer a route ID from a display name or
      // a merely similar upstream model ID.
      if (
        entry.modelKey !== `source:${entry.sourceId}:${entry.sourceModelId}`
        || !isModelSlugRouteSafe(entry.canonicalSlug)
      ) {
        mappings.set(entry.modelKey, null);
        continue;
      }
      const existing = mappings.get(entry.modelKey);
      if (existing === undefined) mappings.set(entry.modelKey, entry.canonicalSlug);
      else if (existing !== entry.canonicalSlug) mappings.set(entry.modelKey, null);
    }
  }

  // Distinct requested source identities must not silently collapse into one
  // route identity. Leaving both source keys untouched keeps their ordered
  // request semantics explicit instead of guessing which canonical route wins.
  const targetCounts = new Map<string, number>();
  for (const id of requestedIds) {
    const target = mappings.get(id);
    if (target !== undefined && target !== null) {
      targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
    }
  }

  return requestedIds.map((id) => {
    const target = mappings.get(id);
    return target === undefined || target === null || targetCounts.get(target) !== 1
      ? id
      : target;
  });
}

export function hasSourcePrefixedModelId(ids: readonly string[]): boolean {
  return ids.some(isSourcePrefixedModelId);
}
