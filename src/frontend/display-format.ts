export const MAX_DISPLAY_FRACTION_DIGITS = 2;

function displayPrecision(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_DISPLAY_FRACTION_DIGITS, Math.trunc(value)));
}

/**
 * Formats a reader-facing number without changing the underlying fact used by
 * calculations. TokenBench intentionally caps presentation precision at two
 * decimal places across pages and exports.
 */
export function formatDisplayNumber(
  value: number,
  options: Readonly<{
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }> = {},
): string {
  const maximumFractionDigits = displayPrecision(
    options.maximumFractionDigits ?? MAX_DISPLAY_FRACTION_DIGITS,
  );
  const minimumFractionDigits = Math.min(
    maximumFractionDigits,
    displayPrecision(options.minimumFractionDigits ?? 0),
  );
  return new Intl.NumberFormat(options.locale ?? 'en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/** Keeps a non-zero sub-cent cost visibly non-zero while honoring the cap. */
export function formatDisplayUsd(value: number): string {
  if (value > 0 && value < 0.01) return '<$0.01';
  return `$${formatDisplayNumber(value)}`;
}

/** Use only at reader/export boundaries; source values remain full precision. */
export function roundDisplayValue(value: number): number {
  return Number(value.toFixed(MAX_DISPLAY_FRACTION_DIGITS));
}
