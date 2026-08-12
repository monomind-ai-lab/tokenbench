/**
 * Shared checkpointed-ingestion contracts for the catalog and benchmark
 * coordinators: the cycle/step receipt shapes, provider rate-limit parsing,
 * retry-alarm scheduling, and legal state transitions.
 *
 * These are pure contracts with no D1/R2/Durable Object dependencies so both
 * Workers can import them and unit-test them without a runtime harness.
 */

export type IngestionScope = 'catalog' | 'benchmarks';

export type IngestionCycleState =
  | 'idle'
  | 'running'
  | 'retry_wait'
  | 'ready_to_publish'
  | 'published'
  | 'failed'
  | 'expired';

/**
 * Coordinators define their own concrete step phases (e.g. `acquire`,
 * `retrieve-openrouter`, `stage-profiles`). The shared contract treats a phase
 * as an opaque string; the durable step-receipt table stores it verbatim.
 */
export type IngestionPhase = string;

/** Immutable persisted shape of one checkpointed ingestion cycle. */
export interface IngestionCycle {
  readonly schemaVersion: 1;
  readonly scope: IngestionScope;
  readonly cycleId: string;
  readonly cadenceKey: string;
  readonly state: IngestionCycleState;
  readonly phase: IngestionPhase;
  readonly cursor: number;
  /** Upstream requests consumed in the current bounded step, from 0 to 3. */
  readonly attempt: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly nextRetryAt: string | null;
  readonly frozenCatalogRevision: string | null;
  readonly frozenBenchmarkRevision: string | null;
  readonly manifestKey: string | null;
  readonly finalRevision: string | null;
  readonly errorCode: string | null;
  readonly errorSourceId: string | null;
  readonly errorArtifactId: string | null;
}

export type IngestionStepStatus =
  | 'running'
  | 'completed'
  | 'retry_wait'
  | 'failed'
  | 'skipped';

/** Durable receipt for one bounded step execution within a cycle. */
export interface IngestionStepReceipt {
  readonly scope: IngestionScope;
  readonly cycleId: string;
  readonly phase: IngestionPhase;
  readonly cursor: number;
  readonly status: IngestionStepStatus;
  readonly attempt: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly outputCount: number | null;
  readonly errorCode: string | null;
}

/**
 * Resolve the provider's earliest retry timestamp (ms since epoch) from
 * `Retry-After` (delta-seconds or an absolute HTTP-date) or a Hugging Face
 * `RateLimit` header `t=<epoch-seconds>` reset. Returns `null` for untrusted
 * values (malformed, negative, or already passed). No ten-second cap is
 * applied: a valid long reset is honored in full so callers can persist it
 * and retry through a later alarm.
 */
export function providerRetryAt(headers: Headers, nowMs: number): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null) {
    const parsed = parseRetryAfter(retryAfter, nowMs);
    if (parsed !== null) return parsed;
  }
  const rateLimit = headers.get('ratelimit');
  if (rateLimit !== null) {
    const parsed = parseHfRateLimitReset(rateLimit, nowMs);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseRetryAfter(value: string, nowMs: number): number | null {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return nowMs + seconds * 1_000;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed) && parsed > nowMs) return parsed;
  return null;
}

function parseHfRateLimitReset(value: string, nowMs: number): number | null {
  const match = /(?:^|[\s,;])t\s*=\s*(\d+)/.exec(value);
  if (match === null) return null;
  const resetMs = Number(match[1]) * 1_000;
  if (resetMs <= nowMs) return null;
  return resetMs;
}

export const RETRY_BACKOFF_DELAYS_MS = [60_000, 300_000, 1_800_000] as const;

/**
 * Compute when the next retry alarm must fire.
 *
 * `attempt` is the 1-based number of upstream requests already consumed.
 * Failures after request one and two schedule the second and third requests;
 * failure after request three is terminal. The approved third progressive
 * delay remains exported for observability/config parity but cannot schedule a
 * fourth request. The provider reset dominates fallback before jitter is added.
 */
export function nextRetryAlarmAt(input: {
  attempt: number;
  nowMs: number;
  providerRetryAtMs: number | null;
  jitterMs: number;
}): number {
  const { attempt, nowMs, providerRetryAtMs, jitterMs } = input;
  if (!Number.isInteger(attempt) || attempt <= 0 || attempt >= 3) {
    throw new Error('retry attempt limit');
  }
  if (!Number.isFinite(jitterMs) || jitterMs < 0 || jitterMs > 15_000) {
    throw new Error('retry jitter must be between 0 and 15000 milliseconds');
  }
  const fallbackMs = RETRY_BACKOFF_DELAYS_MS[attempt - 1];
  const fallbackAt = nowMs + fallbackMs;
  const base = providerRetryAtMs === null ? fallbackAt : Math.max(fallbackAt, providerRetryAtMs);
  return base + jitterMs;
}

const LEGAL_TRANSITIONS: Record<IngestionCycleState, readonly IngestionCycleState[]> = {
  idle: ['running', 'expired'],
  running: ['running', 'retry_wait', 'ready_to_publish', 'failed', 'expired'],
  retry_wait: ['running', 'failed', 'expired'],
  ready_to_publish: ['published', 'failed', 'expired'],
  published: [],
  failed: ['expired'],
  expired: [],
};

/**
 * Guard every persisted cycle-state change. Throws when `previous` cannot
 * legally transition to `next`, so a coordinator can never publish, retry, or
 * expire a cycle out of order.
 */
export function assertCycleTransition(
  previous: IngestionCycleState,
  next: IngestionCycleState,
): void {
  if (previous === next) return;
  if (!LEGAL_TRANSITIONS[previous].includes(next)) {
    throw new Error(`illegal cycle transition: ${previous} -> ${next}`);
  }
}
