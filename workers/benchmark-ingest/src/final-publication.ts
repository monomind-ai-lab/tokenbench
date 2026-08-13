import type { ActiveBenchmarkSnapshot } from '../../../functions/_shared/benchmark-db';
import { weekStartUtc, directoryRecordFromModel, selectPopularModelRanks } from '../../../src/benchmarks/model-directory';
import type { BenchmarkCandidateManifestV1 } from './candidate-storage';
import { listRequiredBenchmarkCachePartitions } from './cache-partitions';
import {
  joinPublicLeaderboardRows,
  publicLeaderboardFromSnapshot,
  type BenchLmPublicLeaderboard,
} from './benchlm-public-leaderboard';

type BoundStatement = {
  bind(...values: unknown[]): BoundStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export interface PublicationD1Database {
  prepare(sql: string): BoundStatement;
  batch(statements: BoundStatement[]): Promise<unknown>;
}

export interface CandidateValidationReceipt {
  readonly modelCount: number;
  readonly profileCount: number;
  readonly rankCount: number;
  readonly cacheKeyCount: number;
  readonly cacheRevision: string;
}

export interface PublishCandidateInput {
  readonly db: PublicationD1Database;
  readonly cycleId: string;
  readonly cadenceKey: string;
  readonly revision: string;
  readonly cacheRevision: string;
  readonly manifestHash: string;
  readonly snapshot: ActiveBenchmarkSnapshot;
  readonly checkedAt: string;
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * The exact weekly Popular Models rank rows, for both publication and its
 * validation receipt.
 *
 * Source ranks are preserved verbatim and never renumbered. `selectPopularModelRanks`
 * applies the only transformations the storage layer requires: it drops ranks
 * outside 1..100 (`benchmark_popular_model_ranks.rank` is
 * `CHECK (rank BETWEEN 1 AND 100)`) and keeps one model per rank
 * (`PRIMARY KEY (week_start, rank)`), deterministically in source-rank then
 * binary model-key order.
 *
 * Taking the first 100 leaderboard rows and trusting their raw `rank` instead
 * would abort the single publication batch whenever upstream published a
 * duplicate or out-of-range rank, and would let the expected rank count
 * overstate what is actually representable.
 */
function weeklyPopularModelRanks(
  snapshot: ActiveBenchmarkSnapshot,
  leaderboard: BenchLmPublicLeaderboard,
  weekStart: string,
): readonly { readonly weekStart: string; readonly rank: number; readonly modelKey: string }[] {
  const identities = snapshot.models.map((model) => ({
    sourceModelId: model.sourceModelId,
    modelKey: model.modelKey,
    name: model.name,
    creator: model.creator,
  }));
  return selectPopularModelRanks(weekStart, joinPublicLeaderboardRows(identities, leaderboard)
    .map(({ modelKey, score }) => ({ modelKey, rank: score.overallRank })));
}

async function count(
  db: PublicationD1Database,
  sql: string,
  ...values: unknown[]
): Promise<number> {
  const row = await db.prepare(sql).bind(...values).first<{ n: number }>();
  if (!row || !Number.isSafeInteger(row.n) || row.n < 0) fail('candidate validation returned an invalid count');
  return row.n;
}

export function benchmarkCandidateCacheRevision(snapshot: ActiveBenchmarkSnapshot, cycleId: string): string {
  const suffix = snapshot.revision.checkedAt.replace(/[^0-9]/g, '');
  if (!suffix || !/^[0-9a-z-]+$/i.test(cycleId)) fail('benchmark candidate cache revision inputs are invalid');
  return `${snapshot.revision.revision}+cache-${suffix}-${cycleId}`;
}

/** Validate every attempt-owned D1 surface before the sole public transaction. */
export async function validateCompleteBenchmarkCandidate(input: {
  readonly db: PublicationD1Database;
  readonly cycleId: string;
  readonly revision: string;
  readonly cacheRevision: string;
  readonly snapshot: ActiveBenchmarkSnapshot;
  readonly manifest: BenchmarkCandidateManifestV1;
  readonly manifestHash: string;
}): Promise<CandidateValidationReceipt> {
  const { db, cycleId, revision, cacheRevision, snapshot, manifest } = input;
  if (!/^sha256:[a-f0-9]{64}$/.test(input.manifestHash)) fail('candidate manifest hash is invalid');
  if (manifest.cycleId !== cycleId || manifest.frozenCatalogRevision !== snapshot.revision.catalogRevision) {
    fail('candidate manifest ownership or frozen catalog revision is invalid');
  }
  const owner = await db.prepare(`SELECT publication_state AS state, publication_attempt_id AS attempt,
      catalog_revision AS catalogRevision, content_hash AS contentHash
    FROM benchmark_revisions WHERE revision = ?`).bind(revision)
    .first<{ state: string; attempt: string | null; catalogRevision: string; contentHash: string }>();
  const unchangedActive = owner?.state === 'published' && revision === manifest.previousBenchmarkRevision;
  if (!owner || (!unchangedActive && (owner.state !== 'pending' || owner.attempt !== cycleId))
    || owner.catalogRevision !== manifest.frozenCatalogRevision
    || owner.contentHash !== snapshot.revision.contentHash) {
    fail('candidate pending revision ownership or metadata is invalid');
  }
  const activeCatalog = await db.prepare('SELECT active_revision AS revision FROM catalog_publication_state WHERE singleton = 1')
    .bind().first<{ revision: string }>();
  if (activeCatalog?.revision !== manifest.frozenCatalogRevision) fail('frozen catalog revision changed during benchmark cycle');

  const modelCount = await count(db, 'SELECT COUNT(*) AS n FROM benchmark_models WHERE revision = ?', revision);
  const profileCount = await count(db, 'SELECT COUNT(*) AS n FROM benchmark_model_profile_snapshots WHERE revision = ?', revision);
  const membershipCount = await count(db, 'SELECT COUNT(*) AS n FROM benchmark_model_revision_membership WHERE revision = ?', revision);
  if (modelCount !== snapshot.models.length || profileCount !== modelCount || membershipCount !== modelCount) {
    fail('candidate model/profile membership is incomplete');
  }

  const leaderboard = publicLeaderboardFromSnapshot(snapshot);
  const weekStart = weekStartUtc(input.snapshot.revision.checkedAt);
  // Derived from the exact rank set publication will insert, not from the raw
  // leaderboard length: out-of-range and duplicate source ranks are not
  // representable, so counting rows would overstate the receipt.
  const expectedRanks = weeklyPopularModelRanks(snapshot, leaderboard, weekStart).length;

  const requiredCacheKeys = listRequiredBenchmarkCachePartitions(snapshot);
  const cacheRows = await db.prepare(`SELECT cache_key AS cacheKey, variant, chunk_index AS chunkIndex, etag, body
    FROM api_response_entries WHERE scope = 'benchmarks' AND revision = ?
    ORDER BY cache_key, variant, chunk_index`).bind(cacheRevision)
    .all<{ cacheKey: string; variant: string; chunkIndex: number; etag: string; body: string }>();
  const groups = new Map<string, typeof cacheRows.results>();
  for (const row of cacheRows.results) {
    const key = `${row.cacheKey}\u0000${row.variant}`;
    const rows = groups.get(key) ?? [];
    rows.push(row);
    groups.set(key, rows);
  }
  for (const cacheKey of requiredCacheKeys) {
    for (const variant of ['fresh', 'stale'] as const) {
      const rows = groups.get(`${cacheKey}\u0000${variant}`) ?? [];
      if (rows.length === 0 || rows.some((row, index) => row.chunkIndex !== index || !row.etag || !row.body)) {
        fail(`candidate cache ${cacheKey}/${variant} is incomplete`);
      }
      try {
        JSON.parse(rows.map((row) => row.body).join(''));
      } catch {
        fail(`candidate cache ${cacheKey}/${variant} is invalid JSON`);
      }
    }
  }
  if (groups.size !== requiredCacheKeys.length * 2) fail('candidate cache contains foreign or unexpected groups');
  return { modelCount, profileCount, rankCount: expectedRanks, cacheKeyCount: requiredCacheKeys.length, cacheRevision };
}

function directoryStatements(input: PublishCandidateInput): BoundStatement[] {
  const rows = input.snapshot.models.map((model) => directoryRecordFromModel(
    model,
    input.revision,
    input.checkedAt,
  ));
  const statements: BoundStatement[] = [];
  for (let offset = 0; offset < rows.length; offset += 500) {
    const payload = JSON.stringify(rows.slice(offset, offset + 500));
    statements.push(input.db.prepare(`INSERT INTO benchmark_model_directory
      (model_key, canonical_slug, display_name, creator, source_type, reasoning_type, family_id, variant_id,
       first_seen_revision, first_seen_at, last_seen_revision, last_seen_at, latest_profile_revision,
       status, source_id, source_model_id, updated_at)
    SELECT json_extract(row.value, '$.modelKey'), json_extract(row.value, '$.canonicalSlug'),
      json_extract(row.value, '$.displayName'), json_extract(row.value, '$.creator'),
      json_extract(row.value, '$.sourceType'), json_extract(row.value, '$.reasoningType'),
      json_extract(row.value, '$.familyId'), json_extract(row.value, '$.variantId'),
      json_extract(row.value, '$.firstSeenRevision'), json_extract(row.value, '$.firstSeenAt'),
      json_extract(row.value, '$.lastSeenRevision'), json_extract(row.value, '$.lastSeenAt'),
      json_extract(row.value, '$.latestProfileRevision'), 'current', json_extract(row.value, '$.sourceId'),
      json_extract(row.value, '$.sourceModelId'), json_extract(row.value, '$.updatedAt')
    FROM json_each(?) AS row
    WHERE true
    ON CONFLICT(model_key) DO UPDATE SET display_name = excluded.display_name, creator = excluded.creator,
      source_type = excluded.source_type, reasoning_type = excluded.reasoning_type,
      family_id = excluded.family_id, variant_id = excluded.variant_id,
      last_seen_revision = excluded.last_seen_revision, last_seen_at = excluded.last_seen_at,
      latest_profile_revision = excluded.latest_profile_revision, status = 'current',
      source_id = excluded.source_id, source_model_id = excluded.source_model_id,
      updated_at = excluded.updated_at`).bind(payload));
  }
  return statements;
}

/** Move both public pointers in one guarded D1 transaction. */
export async function publishBenchmarkCandidate(input: PublishCandidateInput): Promise<'published' | 'unchanged'> {
  const active = await input.db.prepare(`SELECT benchmark_revisions.revision AS revision,
      benchmark_revisions.content_hash AS contentHash
    FROM benchmark_publication_state
    JOIN benchmark_revisions ON benchmark_revisions.revision = benchmark_publication_state.active_revision
    WHERE benchmark_publication_state.singleton = 1`).bind()
    .first<{ revision: string; contentHash: string }>();
  const unchanged = active?.revision === input.revision && active.contentHash === input.snapshot.revision.contentHash;
  const statements: BoundStatement[] = [];
  if (!unchanged) {
    statements.push(
      input.db.prepare("UPDATE benchmark_revisions SET publication_state = 'superseded' WHERE publication_state = 'published'").bind(),
      input.db.prepare(`UPDATE benchmark_revisions SET publication_state = 'published', published_at = ?
        WHERE revision = ? AND publication_state = 'pending' AND publication_attempt_id = ?`).bind(
        input.checkedAt, input.revision, input.cycleId,
      ),
    );
  } else {
    statements.push(input.db.prepare('UPDATE benchmark_revisions SET checked_at = ? WHERE revision = ?')
      .bind(input.checkedAt, input.revision));
  }
  const leaderboard = publicLeaderboardFromSnapshot(input.snapshot);
  const weekStart = weekStartUtc(input.checkedAt);
  const ranks = weeklyPopularModelRanks(input.snapshot, leaderboard, weekStart);
  const existingWeek = await input.db.prepare(`SELECT COUNT(ranks.rank) AS rankCount
    FROM benchmark_popular_model_weeks AS week
    LEFT JOIN benchmark_popular_model_ranks AS ranks ON ranks.week_start = week.week_start
    WHERE week.week_start = ?
    GROUP BY week.week_start`).bind(weekStart).first<{ rankCount: number }>();
  const existingRankCount = existingWeek?.rankCount ?? 0;
  if (!Number.isSafeInteger(existingRankCount) || existingRankCount < 0 || existingRankCount > ranks.length) {
    fail('published weekly model snapshot has an invalid rank count');
  }
  const replaceIncompleteWeek = existingWeek !== null && existingRankCount < ranks.length;
  const createWeek = existingWeek === null;
  statements.push(
    ...directoryStatements(input),
    input.db.prepare(`UPDATE benchmark_model_directory SET status = 'archived', updated_at = ?
      WHERE status = 'current' AND NOT EXISTS (
        SELECT 1 FROM benchmark_model_revision_membership membership
        WHERE membership.revision = ? AND membership.model_key = benchmark_model_directory.model_key
      )`).bind(input.checkedAt, input.revision),
  );
  if (replaceIncompleteWeek) {
    statements.push(
      input.db.prepare('DELETE FROM benchmark_popular_model_ranks WHERE week_start = ?').bind(weekStart),
      input.db.prepare(`UPDATE benchmark_popular_model_weeks SET benchmark_revision = ?, source_snapshot_id = ?,
        methodology_version = ?, generated_at = ? WHERE week_start = ?`).bind(
        input.revision, leaderboard.sourceSnapshotId, leaderboard.methodologyVersion, input.checkedAt, weekStart,
      ),
    );
  } else if (createWeek) {
    statements.push(input.db.prepare(`INSERT INTO benchmark_popular_model_weeks
      (week_start, benchmark_revision, source_snapshot_id, methodology_version, generated_at)
      VALUES (?, ?, ?, ?, ?)`).bind(
      weekStart, input.revision, leaderboard.sourceSnapshotId, leaderboard.methodologyVersion, input.checkedAt,
    ));
  }
  if (replaceIncompleteWeek || createWeek) {
    statements.push(input.db.prepare(`INSERT INTO benchmark_popular_model_ranks (week_start, rank, model_key)
      SELECT json_extract(row.value, '$.weekStart'), json_extract(row.value, '$.rank'),
        json_extract(row.value, '$.modelKey') FROM json_each(?) AS row`).bind(JSON.stringify(ranks)));
  }
  if (!unchanged) {
    statements.push(input.db.prepare(`INSERT INTO benchmark_publication_state (singleton, active_revision, updated_at)
      VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET
      active_revision = excluded.active_revision, updated_at = excluded.updated_at`).bind(input.revision, input.checkedAt));
  }
  statements.push(
    input.db.prepare(`INSERT INTO api_response_publication_state (scope, active_revision, updated_at)
      VALUES ('benchmarks', ?, ?) ON CONFLICT(scope) DO UPDATE SET
      active_revision = excluded.active_revision, updated_at = excluded.updated_at`).bind(input.cacheRevision, input.checkedAt),
    input.db.prepare(`UPDATE ingestion_cycles SET state = 'published', phase = 'receipt', updated_at = ?,
      completed_at = ?, final_revision = ?, result_json = ?
      WHERE scope = 'benchmarks' AND cycle_id = ? AND cadence_key = ?`).bind(
      input.checkedAt,
      input.checkedAt,
      input.revision,
      JSON.stringify({ manifestHash: input.manifestHash, cacheRevision: input.cacheRevision }),
      input.cycleId,
      input.cadenceKey,
    ),
    input.db.prepare(`INSERT INTO ingestion_cycle_steps
      (scope, cycle_id, phase, cursor, status, attempt, started_at, completed_at, output_count, error_code)
      VALUES ('benchmarks', ?, 'publish', 0, 'completed', 1, ?, ?, 1, NULL)
      ON CONFLICT(scope, cycle_id, phase, cursor) DO UPDATE SET status = 'completed',
        completed_at = excluded.completed_at, output_count = excluded.output_count, error_code = NULL`).bind(
      input.cycleId, input.checkedAt, input.checkedAt,
    ),
  );
  const refreshPayload = JSON.stringify(input.snapshot.sources.map((source) => ({
    sourceId: source.sourceId,
    artifactId: source.artifactId,
  })));
  statements.push(input.db.prepare(`INSERT INTO benchmark_refresh_state
    (source_id, artifact_id, last_success_at, last_revision, last_error)
    SELECT json_extract(row.value, '$.sourceId'), json_extract(row.value, '$.artifactId'), ?, ?, NULL
    FROM json_each(?) AS row WHERE true
    ON CONFLICT(source_id, artifact_id) DO UPDATE SET last_success_at = excluded.last_success_at,
      last_revision = excluded.last_revision, last_error = NULL`).bind(
    input.checkedAt, input.revision, refreshPayload,
  ));
  await input.db.batch(statements);
  return unchanged ? 'unchanged' : 'published';
}
