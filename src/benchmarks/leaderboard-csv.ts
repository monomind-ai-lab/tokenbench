import type { BenchmarkMetric } from './contracts';
import type { LeaderboardEntry, LeaderboardResult } from './leaderboards';
import { filterLeaderboardEntries, type LeaderboardQueryState } from './leaderboard-query';

/** Spreadsheet programs can skip leading whitespace and controls before parsing a formula. */
const FORMULA_PREFIX = /^[\u0000-\u0020\uFEFF]*[=+\-@]/u;
export const LEADERBOARD_CSV_MAX_CELL_BYTES = 64 * 1024;
export const LEADERBOARD_CSV_MAX_ROW_BYTES = 256 * 1024;
export const LEADERBOARD_CSV_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const UTF8_ENCODER = new TextEncoder();

function csvLiteral(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  return String(value);
}

/** Escapes a UTF-8 CSV field with RFC 4180-compatible quoting. */
export function csvCell(value: unknown): string {
  const literal = csvLiteral(value);
  const formulaSafe = typeof value === 'string' && FORMULA_PREFIX.test(literal) ? `'${literal}` : literal;
  const escaped = /[",\r\n]/u.test(formulaSafe)
    ? `"${formulaSafe.replace(/"/gu, '""')}"`
    : formulaSafe;
  if (UTF8_ENCODER.encode(escaped).byteLength > LEADERBOARD_CSV_MAX_CELL_BYTES) {
    throw new RangeError('CSV cell exceeds the byte limit');
  }
  return escaped;
}

function serializedCsvRow(values: readonly unknown[]): string {
  const row = values.map(csvCell).join(',');
  if (UTF8_ENCODER.encode(row).byteLength > LEADERBOARD_CSV_MAX_ROW_BYTES) {
    throw new RangeError('CSV row exceeds the byte limit');
  }
  return row;
}

function metricForKey(entry: LeaderboardEntry, metricKey: string): BenchmarkMetric | null {
  return entry.metrics.find((metric) => metric.metricKey === metricKey) ?? null;
}

function metricColumnPrefix(metricKey: string): string {
  return metricKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function isEstimated(entry: LeaderboardEntry): boolean {
  return entry.model.evidenceStatus === 'estimated';
}

function metricColumns(entry: LeaderboardEntry): readonly unknown[] {
  return [
    entry.metric?.value ?? null,
    entry.metric?.unit ?? null,
    entry.metric?.metricKey ?? null,
    entry.metric?.methodology ?? null,
  ];
}

function identityColumns(entry: LeaderboardEntry): readonly unknown[] {
  return [entry.model.modelKey, entry.model.slug, entry.model.sourceType];
}

function priceColumns(entry: LeaderboardEntry): readonly unknown[] {
  return [entry.blendedCostPerMillion, entry.contextWindowTokens];
}

function csvHeaders(result: LeaderboardResult): readonly string[] {
  const common = ['rank', 'model', 'provider', 'evidence_status'];
  const metric = ['score', 'unit', 'metric_key', 'methodology'];
  const identity = ['model_key', 'slug', 'source_type'];
  const price = ['price_usd_per_million', 'context_window_tokens'];
  switch (result.definition.kind) {
    case 'benchlm':
      return [...common, ...metric, 'source_rank', ...price, ...identity];
    case 'lmarena':
      return [...common, ...metric, 'source_rank', ...price, ...identity];
    case 'value':
      return [
        ...common,
        ...metric,
        'value_frontier',
        'workload_profile',
        'price_usd_per_million',
        'input_usd_per_million',
        'output_usd_per_million',
        'context_window_tokens',
        'route_id',
        ...identity,
      ];
    case 'pricing-context':
      return [
        ...common,
        'workload_profile',
        'route_id',
        'input_usd_per_million',
        'cached_input_usd_per_million',
        'output_usd_per_million',
        'price_usd_per_million',
        'context_window_tokens',
        ...identity,
      ];
    case 'multimodal':
      return [
        ...common,
        ...metric,
        'source_rank',
        ...result.definition.metricKeys.flatMap((metricKey) => {
          const prefix = metricColumnPrefix(metricKey);
          return [
            `${prefix}_score`,
            `${prefix}_unit`,
            `${prefix}_methodology`,
            `${prefix}_source_rank`,
          ];
        }),
        ...price,
        ...identity,
      ];
  }
}

function csvRow(
  result: LeaderboardResult,
  entry: LeaderboardEntry,
  rank: number | null,
): readonly unknown[] {
  const common = [rank, entry.model.name, entry.model.creator, entry.model.evidenceStatus];
  const metric = metricColumns(entry);
  const identity = identityColumns(entry);
  const price = priceColumns(entry);
  const primaryPrice = entry.primaryPrice;
  switch (result.definition.kind) {
    case 'benchlm':
      return [...common, ...metric, entry.sourceRank, ...price, ...identity];
    case 'lmarena':
      return [...common, ...metric, entry.sourceRank, ...price, ...identity];
    case 'value':
      return [
        ...common,
        ...metric,
        entry.onValueFrontier,
        result.profile,
        entry.blendedCostPerMillion,
        primaryPrice?.inputUsdPerMillion ?? null,
        primaryPrice?.outputUsdPerMillion ?? null,
        entry.contextWindowTokens,
        primaryPrice?.routeId ?? null,
        ...identity,
      ];
    case 'pricing-context':
      return [
        ...common,
        result.profile,
        primaryPrice?.routeId ?? null,
        primaryPrice?.inputUsdPerMillion ?? null,
        primaryPrice?.cachedInputUsdPerMillion ?? null,
        primaryPrice?.outputUsdPerMillion ?? null,
        entry.blendedCostPerMillion,
        entry.contextWindowTokens,
        ...identity,
      ];
    case 'multimodal':
      return [
        ...common,
        ...metric,
        entry.sourceRank,
        ...result.definition.metricKeys.flatMap((metricKey) => {
          const lens = metricForKey(entry, metricKey);
          return [
            lens?.value ?? null,
            lens?.unit ?? null,
            lens?.methodology ?? null,
            lens?.rank ?? null,
          ];
        }),
        ...price,
        ...identity,
      ];
  }
}

/**
 * Serializes the complete filtered/sorted result rather than a visible page.
 * Estimated rows are exported only when opted in and are deliberately
 * unranked, matching the UI’s winner rules.
 */
export function leaderboardCsv(result: LeaderboardResult, filters: LeaderboardQueryState): string {
  const entries = filterLeaderboardEntries(result.entries, filters);
  let rankedPosition = 0;
  let outputBytes = 0;
  const rows: string[] = [];
  const appendRow = (row: string): void => {
    outputBytes += UTF8_ENCODER.encode(row).byteLength + 2;
    if (outputBytes > LEADERBOARD_CSV_MAX_OUTPUT_BYTES) {
      throw new RangeError('CSV output exceeds the byte limit');
    }
    rows.push(row);
  };
  appendRow(serializedCsvRow(csvHeaders(result)));
  for (const entry of entries) {
    // BenchLM rows carry their published source rank; a filtered row position
    // is never exported as a rank. Other kinds keep their existing position
    // column, which LMArena must not change.
    const rank = result.definition.kind === 'benchlm'
      ? entry.sourceRank
      : (isEstimated(entry) ? null : ++rankedPosition);
    appendRow(serializedCsvRow(csvRow(result, entry, rank)));
  }
  return rows.join('\r\n').concat('\r\n');
}
