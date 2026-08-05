import type { BenchmarkSourceId } from './contracts';

/**
 * This intentionally contains no inferred aliases. Add an entry only when an
 * accepted source artifact and its fixture prove the exact identifier.
 */
export const MODEL_ALIASES: Record<BenchmarkSourceId, Readonly<Record<string, string>>> = {
  benchlm: {},
  lmarena: {},
  litellm: {},
  openrouter: {},
};

export const EXACT_MODEL_ALIASES = MODEL_ALIASES;

/** Returns a canonical key only for a byte-for-byte reviewed source ID. */
export function resolveCanonicalModelKey(sourceId: BenchmarkSourceId, sourceModelId: string): string | null {
  return EXACT_MODEL_ALIASES[sourceId][sourceModelId] ?? null;
}

/**
 * Keeps unmatched evidence isolated rather than guessing a cross-source model
 * identity. Encoding preserves delimiter boundaries without changing source
 * spelling or case.
 */
export function sourceSpecificModelKey(sourceId: BenchmarkSourceId, sourceModelId: string): string {
  return `source:${sourceId}:${encodeURIComponent(sourceModelId)}`;
}

/** Uses a reviewed alias when present; otherwise preserves source isolation. */
export function resolvedModelKey(sourceId: BenchmarkSourceId, sourceModelId: string): string {
  return resolveCanonicalModelKey(sourceId, sourceModelId) ?? sourceSpecificModelKey(sourceId, sourceModelId);
}
