/**
 * Shared cadence contracts for the checkpointed ingestion coordinators.
 *
 * These are pure, framework-free helpers shared by the catalog and benchmark
 * Workers. They define the scheduled cadences, the freshness windows that
 * distinguish a previous feature ("fresh") from a merely usable one ("valid
 * but stale"), and the cadence keys used to decide when a new cycle is due.
 */

export const CATALOG_CRON = '20 0 * * *';
export const BENCHMARK_CRON = '15 2 * * SUN';

/** Catalog evidence is fresh for 36 hours. */
export const CATALOG_FRESHNESS_WINDOW_MS = 36 * 60 * 60 * 1_000;

/** Benchmark-derived evidence is fresh for exactly 8 days. */
export const BENCHMARK_FRESHNESS_WINDOW_MS = 8 * 24 * 60 * 60 * 1_000;

export const BENCHMARK_STALE_MESSAGE =
  'Published weekly benchmark evidence has not refreshed within 8 days.';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * UTC calendar-day key for a catalog cycle, e.g. `2026-08-12`. The boundary is
 * the start of the UTC day, so any instant on 12 August (including 23:59:59Z)
 * maps to `2026-08-12`.
 */
export function catalogCadenceKey(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** UTC ISO-8601 week-year key, independent of the Sunday Cron fire time. */
export function benchmarkCadenceKey(timestamp: string): string {
  const date = new Date(timestamp);
  const thursday = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const isoDay = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDay);

  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstIsoDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstIsoDay);
  const week = Math.round(
    (thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000),
  ) + 1;
  return `${isoYear}-W${pad2(week)}`;
}

/**
 * A new cycle is due when no cycle for the requested cadence key has
 * completed. Cadence keys sort chronologically, so only a strictly newer key
 * than the last completed one starts a cycle; a missing last-completed key is
 * always due.
 */
export function cycleDue(lastCompletedKey: string | null, nextKey: string): boolean {
  return lastCompletedKey === null || nextKey > lastCompletedKey;
}
