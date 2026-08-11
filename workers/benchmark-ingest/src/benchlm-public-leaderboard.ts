import type { BenchmarkModel, EvidenceStatus } from '../../../src/benchmarks/contracts';

export interface SafeBenchLmModelIdentity {
  readonly sourceModelId: string;
  readonly modelKey: string;
  readonly name: string;
  readonly creator: string;
}

export interface BenchLmPublicLeaderboardRow {
  readonly rank: number;
  readonly model: string;
  readonly creator: string;
  readonly sourceType: BenchmarkModel['sourceType'];
  readonly overallScore: number;
  readonly categoryScores: Readonly<Record<string, number | null>>;
  readonly evidenceStatus: EvidenceStatus;
  readonly methodologyVersion: string;
}

export interface BenchLmPublicLeaderboard {
  readonly lastUpdated: string;
  readonly mode: 'bench-align-v5';
  readonly methodologyVersion: string;
  readonly sourceSnapshotId: string;
  readonly approvedSnapshotId: string | null;
  readonly models: readonly BenchLmPublicLeaderboardRow[];
}

export interface PublicBenchLmScore {
  readonly modelKey: string;
  readonly overallScore: number;
  readonly overallRank: number;
  readonly categoryScores: Readonly<Record<string, number | null>>;
  readonly categoryRanks: Readonly<Record<string, number | null>>;
  readonly evidenceStatus: EvidenceStatus;
  readonly methodologyVersion: string;
  readonly sourceSnapshotId: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : requiredString(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) fail(`${label} must be a positive integer`);
  return value as number;
}

function nullableScore(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a non-negative finite number or null`);
  }
  return value;
}

function sourceType(value: unknown, label: string): BenchmarkModel['sourceType'] {
  if (value === 'Proprietary' || value === 'Open Weight' || value === 'Unknown') return value;
  if (value === 'Pending') return 'Unknown';
  return fail(`${label} must be Proprietary, Open Weight, Unknown, or Pending`);
}

function evidenceStatus(value: unknown, label: string): EvidenceStatus {
  if (value === null) return 'source_only';
  if (value === 'supported' || value === 'estimated' || value === 'source_only') return value;
  return fail(`${label} must be supported, estimated, source_only, or null`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function scoreMap(value: unknown, label: string): Readonly<Record<string, number | null>> {
  const source = record(value, label);
  return Object.freeze(Object.fromEntries(Object.entries(source)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, score]) => [key, nullableScore(score, `${label}.${key}`)])));
}

function parseRow(value: unknown, index: number, methodologyVersion: string): BenchLmPublicLeaderboardRow {
  const label = `BenchLM public leaderboard.models[${index}]`;
  const row = record(value, label);
  const rowMethodology = requiredString(row.methodologyVersion, `${label}.methodologyVersion`);
  if (rowMethodology !== methodologyVersion) fail(`${label}.methodologyVersion must match the response methodologyVersion`);
  const overallScore = nullableScore(row.overallScore, `${label}.overallScore`);
  if (overallScore === null) fail(`${label}.overallScore must be a non-negative finite number`);
  return Object.freeze({
    rank: positiveInteger(row.rank, `${label}.rank`),
    model: requiredString(row.model, `${label}.model`),
    creator: requiredString(row.creator, `${label}.creator`),
    sourceType: sourceType(row.sourceType, `${label}.sourceType`),
    overallScore,
    categoryScores: scoreMap(row.categoryScores, `${label}.categoryScores`),
    evidenceStatus: evidenceStatus(row.evidenceStatus, `${label}.evidenceStatus`),
    methodologyVersion: rowMethodology,
  });
}

export function parseBenchLmPublicLeaderboard(value: unknown): BenchLmPublicLeaderboard {
  const payload = record(value, 'BenchLM public leaderboard');
  if (payload.mode !== 'bench-align-v5') fail('BenchLM public leaderboard.mode must be bench-align-v5');
  const lastUpdated = requiredString(payload.lastUpdated, 'BenchLM public leaderboard.lastUpdated');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)
    || new Date(`${lastUpdated}T00:00:00.000Z`).toISOString().slice(0, 10) !== lastUpdated) {
    fail('BenchLM public leaderboard.lastUpdated must be a canonical UTC date');
  }
  const methodologyVersion = requiredString(
    payload.methodologyVersion,
    'BenchLM public leaderboard.methodologyVersion',
  );
  if (!Array.isArray(payload.models)) fail('BenchLM public leaderboard.models must be an array');
  return Object.freeze({
    lastUpdated,
    mode: 'bench-align-v5',
    methodologyVersion,
    sourceSnapshotId: requiredString(payload.sourceSnapshotId, 'BenchLM public leaderboard.sourceSnapshotId'),
    approvedSnapshotId: nullableString(payload.approvedSnapshotId, 'BenchLM public leaderboard.approvedSnapshotId'),
    models: Object.freeze(payload.models.map((row, index) => parseRow(row, index, methodologyVersion))),
  });
}

function normalizedIdentity(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function categoryRanks(rows: readonly BenchLmPublicLeaderboardRow[]): readonly Readonly<Record<string, number | null>>[] {
  const categories = new Set<string>();
  rows.forEach((row) => Object.keys(row.categoryScores).forEach((category) => categories.add(category)));
  const ranks = rows.map(() => ({} as Record<string, number | null>));
  for (const category of categories) {
    const ranked = rows
      .map((row, index) => ({ row, index, score: row.categoryScores[category] ?? null }))
      .filter((entry): entry is { row: BenchLmPublicLeaderboardRow; index: number; score: number } => (
        entry.row.evidenceStatus === 'supported' && entry.score !== null
      ))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    let previousScore: number | null = null;
    let currentRank = 0;
    ranked.forEach((entry, index) => {
      if (previousScore === null || entry.score !== previousScore) currentRank = index + 1;
      ranks[entry.index][category] = currentRank;
      previousScore = entry.score;
    });
    rows.forEach((row, index) => {
      if (!Object.prototype.hasOwnProperty.call(ranks[index], category)) ranks[index][category] = null;
    });
  }
  return ranks.map((rank) => Object.freeze(Object.fromEntries(
    Object.entries(rank).sort(([left], [right]) => compareText(left, right)),
  )));
}

export function joinPublicLeaderboardScores(
  models: readonly SafeBenchLmModelIdentity[],
  leaderboard: BenchLmPublicLeaderboard,
): ReadonlyMap<string, PublicBenchLmScore> {
  const ranks = categoryRanks(leaderboard.models);
  const result = new Map<string, PublicBenchLmScore>();
  leaderboard.models.forEach((row, index) => {
    const exact = models.filter((model) => model.name === row.model && model.creator === row.creator);
    const candidates = exact.length > 0 ? exact : models.filter((model) => (
      normalizedIdentity(model.name) === normalizedIdentity(row.model)
      && normalizedIdentity(model.creator) === normalizedIdentity(row.creator)
    ));
    if (candidates.length !== 1) {
      fail(`BenchLM public leaderboard identity is ambiguous or missing: ${row.creator}/${row.model}`);
    }
    const model = candidates[0];
    if (result.has(model.modelKey)) fail(`BenchLM public leaderboard repeats model identity: ${model.modelKey}`);
    result.set(model.modelKey, Object.freeze({
      modelKey: model.modelKey,
      overallScore: row.overallScore,
      overallRank: row.rank,
      categoryScores: row.categoryScores,
      categoryRanks: ranks[index],
      evidenceStatus: row.evidenceStatus,
      methodologyVersion: leaderboard.methodologyVersion,
      sourceSnapshotId: leaderboard.sourceSnapshotId,
    }));
  });
  return result;
}
