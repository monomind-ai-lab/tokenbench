/**
 * Editorial pairs are opt-in. The initial set is deliberately empty until a
 * reviewed canonical pair can satisfy the same quality gates as a source seed.
 */
export const COMPARISON_ALLOWLIST: readonly string[] = [];

export function isEditorialComparisonPair(pairSlug: string): boolean {
  return COMPARISON_ALLOWLIST.includes(pairSlug);
}
