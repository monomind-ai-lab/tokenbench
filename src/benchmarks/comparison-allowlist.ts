/**
 * Editorial pairs are opt-in and ordered for the Home decision surface. Each
 * still has to satisfy the runtime evidence gates in api-projections.
 */
export const COMPARISON_ALLOWLIST: readonly string[] = [
  'claude-opus-5-vs-gpt-5-6-sol',
  'gpt-5-6-sol-vs-kimi-3',
];

export function isEditorialComparisonPair(pairSlug: string): boolean {
  return COMPARISON_ALLOWLIST.includes(pairSlug);
}
