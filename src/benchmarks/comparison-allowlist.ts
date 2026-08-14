/**
 * Editorial pairs are opt-in and ordered for the Home decision surface. Each
 * still has to satisfy the runtime evidence gates in api-projections.
 */
export const COMPARISON_ALLOWLIST: readonly string[] = [
  'claude-opus-5-vs-gpt-5-6-sol',
  'gpt-5-6-sol-vs-kimi-3',
];

/** Reviewed copy is explicit rather than inferred from the live score rows. */
export interface EditorialComparison {
  readonly claim: string;
  readonly pairSlug: string;
  readonly effectiveDate: string;
  readonly sourceCoverage: string;
}

const EDITORIAL_COMPARISONS: readonly EditorialComparison[] = [
  {
    claim: 'Reviewed comparison of Claude Opus 5 and GPT-5.6 Sol.',
    pairSlug: 'claude-opus-5-vs-gpt-5-6-sol',
    effectiveDate: '2026-08-14',
    sourceCoverage: '4 shared published metrics',
  },
  {
    claim: 'Reviewed comparison of GPT-5.6 Sol and Kimi 3.',
    pairSlug: 'gpt-5-6-sol-vs-kimi-3',
    effectiveDate: '2026-08-14',
    sourceCoverage: '4 shared published metrics',
  },
];

export function isEditorialComparisonPair(pairSlug: string): boolean {
  return COMPARISON_ALLOWLIST.includes(pairSlug);
}

export function editorialComparisonFor(pairSlug: string): EditorialComparison | null {
  return EDITORIAL_COMPARISONS.find((comparison) => comparison.pairSlug === pairSlug) ?? null;
}
