# TokenBench Free-Tier Checkpointed Ingestion Design

**Date:** 2026-08-12  
**Status:** Approved for implementation planning  
**Scope:** Catalog and benchmark ingestion cadence, orchestration, publication safety, freshness, operations, and production cutover

## Decision

Replace both monolithic ingestion schedules with checkpointed Durable Object
coordinators. The catalog cycle runs once daily. The complete benchmark cycle
runs once weekly. Each Durable Object alarm performs one bounded, idempotent
unit of work, persists its checkpoint, and schedules the next unit. A guarded
final transaction remains the only operation allowed to move a public D1 or API
cache pointer.

This design keeps TokenBench on Cloudflare Workers Free without weakening the
existing last-good-data contract. The production website continues serving the
current complete revision while a new cycle is collecting, retrying, staging,
or failing.

## Why the current shape fails

The benchmark scheduled handler currently performs all of these operations in
one invocation:

1. read the active catalog and benchmark revision;
2. fetch or rehydrate six BenchLM artifacts;
3. fetch and normalize LiteLLM pricing;
4. fetch all LMArena subsets or its parquet fallback;
5. merge facts and derive comparisons;
6. prepare 4,420 durable model profiles;
7. materialize every benchmark API response, including price performance;
8. stage D1 rows and commit both publication pointers.

The work succeeds in a local runtime but the deployed Free Cron consistently
terminates at exactly 10 ms CPU. Cloudflare documents the same 10 ms Free limit
for both HTTP and Cron invocations and recommends processing expensive work in
smaller requests. Waiting on upstream or D1 does not count as CPU, but parsing,
validation, projection, sorting, hashing, and serialization do.

Adding more Cron expressions would not solve the compute boundary. Free
accounts permit only five Cron triggers, and every standard scheduled handler
would retain the same 10 ms limit.

## Considered approaches

### 1. Durable Object alarms with durable checkpoints — selected

Each existing ingestion Worker receives one SQLite-backed Durable Object class.
Its scheduled handler only calls a singleton object to start a due cycle. The
object executes one bounded step per alarm and records progress before setting
the next alarm.

Advantages:

- available on Workers Free;
- a Durable Object request has a materially larger CPU allowance than a Free
  standard Worker request;
- serialized execution prevents overlapping owners by construction;
- alarms naturally resume after restarts and are delivered at least once;
- only two account Cron triggers are required;
- no external runner, secret-bearing public endpoint, or paid service is
  required.

Costs:

- requires Durable Object migrations and generated binding types;
- every step must be explicitly idempotent;
- publication logic must be decomposed into bounded phases.

### 2. Many source-specific Cron triggers — rejected

This is simpler but retains the 10 ms CPU limit, consumes the five-trigger Free
allowance, and does not solve profile or cache materialization.

### 3. Cloudflare Queues — rejected for this revision

Queues have a useful Free allocation and would separate delivery, but a queue
consumer still needs a compute surface for parsing and projection. Adding
Queues would introduce message retention and duplicate-delivery concerns
without replacing the coordinator. A future high-volume system may use a Queue
behind the same step contract.

### 4. GitHub Actions or another external runner — retained as emergency-only

An external runner avoids Workers CPU limits but adds credentials, another
availability boundary, and external scheduling. The controlled local runner
remains an operator recovery path, not normal production architecture.

## Architecture

### Catalog coordinator

`CatalogIngestCoordinator` lives with `workers/catalog-ingest` and binds to the
existing D1 and R2 resources. The Worker exposes no public refresh endpoint.
Its one daily Cron starts the singleton coordinator if the current UTC day has
not completed.

The daily catalog cycle performs these steps:

1. claim a cycle ID and freeze the prior active catalog revision;
2. fetch and validate OpenRouter pricing/models conditionally;
3. fetch and validate OpenCode Zen conditionally;
4. refresh one rotating manual-provider projection from stored evidence without
   upstream network I/O;
5. stage a complete candidate revision and materialized catalog responses;
6. validate staged counts, source identities, cache chunk continuity, and
   revision hashes;
7. move the catalog and catalog-cache pointers in one guarded transaction;
8. write a cycle receipt and retain the prior last-good revision.

The checked-in catalog schedules change from three expressions to one:

```toml
crons = ["20 0 * * *"]
```

This is 00:20 UTC daily. Conditional source requests remain mandatory, so an
unchanged day updates checked freshness without inventing a new content
revision.

### Benchmark coordinator

`BenchmarkIngestCoordinator` lives with `workers/benchmark-ingest` and uses the
same D1/R2 bindings as the existing benchmark Worker. Its weekly Cron starts a
singleton cycle only when no current-week cycle has completed.

The checked-in benchmark schedule becomes:

```toml
crons = ["15 2 * * SUN"]
```

This is Sunday 02:15 UTC. A production deployment also triggers one controlled
cycle immediately, so cutover does not wait for Sunday.

The weekly cycle freezes the active catalog revision at its start and then
advances through these phases:

1. **Acquire** — allocate an attempt-unique cycle ID, record the frozen catalog
   revision, active benchmark revision, and source validators.
2. **Retrieve BenchLM** — process one of the six artifacts per step using
   conditional headers. Persist projected bytes and provenance to immutable R2
   candidate paths. All six must describe one valid BenchLM bundle before the
   phase completes.
3. **Retrieve LiteLLM** — fetch, bound, validate, project, hash, and store its
   pricing snapshot in one step.
4. **Retrieve LMArena** — resolve one upstream revision, then fetch one bounded
   subset or parquet page per step. All pages must share that frozen upstream
   revision.
5. **Normalize** — rebuild one source bundle per step from exact R2 candidate
   bytes and write canonical normalized slices back to an attempt-specific R2
   manifest. No active source row changes here.
6. **Derive** — merge normalized slices, calculate the content hash and revision
   ID, and derive comparison/price-performance inputs. Large deterministic
   collections are emitted as bounded R2 partitions rather than retained in
   Durable Object memory.
7. **Stage facts** — insert the pending benchmark revision and its models,
   metrics, prices, sources, and comparisons in fixed-size D1 batches. Every
   statement remains attempt-owned and inactive.
8. **Stage model directory** — generate durable profiles and weekly rankings in
   fixed-size model batches. The initial target is 100 profiles per alarm;
   production CPU observations may lower, but never dynamically raise, this
   checked-in maximum without a release.
9. **Stage API cache** — materialize a bounded group of cache keys per step,
   including fresh and stale variants. Each cache body must pass runtime
   validation and chunk-continuity checks before its completion marker is set.
10. **Validate candidate** — verify every required source, fact partition,
    directory/profile, ranking, cache key, ETag, and count. Recompute the final
    manifest hash from immutable partitions.
11. **Publish** — move the benchmark pointer first and its matching cache
    pointer second inside the existing guarded D1 transaction. This is the only
    visible state transition.
12. **Receipt and cleanup** — record observed counts/timestamps, retain the
    previous revision under current retention rules, and remove only inactive
    rows and candidate objects owned by the completed attempt.

## Coordinator state

Each coordinator stores compact control state in its own SQLite-backed Durable
Object. Large payloads never live in Durable Object storage.

Required control fields:

- schema version;
- cycle ID and cadence key (`YYYY-MM-DD` or ISO week);
- state: `idle`, `running`, `retry_wait`, `ready_to_publish`, `published`,
  `failed`, or `expired`;
- phase and zero-based cursor;
- frozen input revisions and upstream revisions;
- attempt-owned R2 manifest keys;
- retry count and next retry time;
- started, updated, completed, and expires timestamps;
- sanitized failure code and source/artifact identity;
- final revision, counts, and publication receipt.

The coordinator mirrors a bounded operator receipt into D1 after each phase and
on terminal state. Public application handlers never depend on the in-progress
receipt; it exists for monitoring and deployment evidence.

## Step contract and idempotency

Every alarm handles at most one `IngestionStep`:

```ts
interface IngestionStep {
  cycleId: string;
  phase: IngestionPhase;
  cursor: number;
  frozenInputs: FrozenInputRevisions;
}
```

A step must either:

- observe that its completion marker already exists and advance without
  repeating side effects;
- write all attempt-owned output and its completion marker, persist the next
  cursor, then set the next alarm; or
- persist a retry/failure state without moving any public pointer.

R2 candidate keys include the cycle ID, source, phase, and content hash. D1
pending rows include the existing publication attempt owner. Duplicate alarm
delivery therefore converges on the same candidate instead of duplicating or
publishing partial data.

No step may depend on module-level mutable state. All promises are awaited.
External responses remain bounded, and six simultaneous outbound connections
is a hard maximum; the selected design normally uses one per step.

## Timing and retries

- Successful steps schedule the next alarm 15 seconds later. This keeps the
  cycle moving while giving logs and D1/R2 state a clear boundary.
- A transient upstream failure retries the same cursor after 1, 5, then 30
  minutes unless a valid `Retry-After` or provider reset header requires a later
  alarm. Provider reset times are persisted without the current ten-second cap.
- A retrieval alarm makes one upstream attempt. It never nests an in-invocation
  retry loop, including for HTTP 429. OpenCode model and pricing retrieval is
  serialized rather than issued as a two-request burst.
- Three failed attempts mark the cycle `failed`. The next regular cadence may
  start a new cycle; operators may start a controlled cycle sooner.
- Catalog cycles expire after 12 hours. Benchmark cycles expire after 24 hours.
- Expiration and failure never supersede or delete the active revision.
- A source bundle is never mixed across upstream revisions merely to finish a
  cycle. A changing upstream revision restarts only that source phase with a
  fresh attempt-owned manifest.

With current production cardinality, the benchmark cycle is expected to finish
within roughly two hours, but this is not a release claim. Cutover records the
observed start and publication timestamps. If a bounded step approaches its
runtime limit, its fixed batch size is reduced before production enablement.

## Cadence and freshness semantics

The product must distinguish **valid** from **fresh**:

- A complete published revision remains valid until another complete revision
  replaces it. Retrieval failure never makes its facts invalid.
- Catalog evidence is fresh for 36 hours, matching a daily schedule plus grace.
- Benchmark, model-profile, leaderboard, comparison, and price-performance
  evidence is fresh for 8 days, matching a weekly schedule plus a one-day grace
  period.
- After 8 days the same last-good evidence remains available and is labeled
  stale with its checked timestamp and source attribution.
- “Unavailable” is reserved for a cold system with no valid published revision,
  not a failed refresh.

The weekly benchmark bundle intentionally includes its LiteLLM and BenchLM
price routes so scores, prices, comparisons, profiles, and price-performance
remain one atomic evidence revision. Daily OpenRouter/OpenCode catalog pricing
continues to serve the Subscribe vs API calculator independently.

All 36-hour benchmark constants and user-facing copy must be replaced through
one shared cadence policy module. Catalog freshness stays separate.

## Production data availability

Production already has a valid last-good benchmark revision:
`benchmark_178962c49298646d1c7ff155a87f2074`, published at
`2026-08-11T23:24:51.463Z`. This revision remains live throughout migration and
the first checkpointed cycle.

Cutover is complete only after:

1. both Durable Object migrations and Workers are deployed;
2. one immediate catalog cycle and one immediate benchmark cycle are started;
3. the benchmark cycle reaches `published` or `unchanged` without an active
   pointer gap;
4. the canonical APIs return the new checked timestamp and exact 304 behavior;
5. Home, leaderboards, models, comparison, and price-performance surfaces show
   data with cadence-aware freshness;
6. the observed cycle duration and Worker invocation outcomes are written to
   the deployment receipt.

If the first cycle fails, the website still has valid last-good data. The
release report must say that the new weekly cycle failed and identify the
retained revision; it must not claim that production data is unavailable.

## Observability

Every step emits one structured log containing only:

- coordinator and cycle ID;
- cadence key;
- phase and cursor;
- status;
- source/artifact identity;
- attempt count;
- elapsed wall time;
- output row/object counts;
- sanitized error code.

Logs never include source payloads, model prompts, response bodies, secrets, or
unbounded provider messages.

D1 receipts support these operator questions without reading the Durable Object
directly:

- Which cycle is active?
- Which phase/cursor completed last?
- How long has it been running?
- What revision is still public?
- Did any standard Worker, Durable Object, D1, or R2 operation fail?
- When did the last daily catalog and weekly benchmark cycle publish?

## Security

- Keep both Workers scheduled-only. Their public `fetch` handlers continue to
  return 405.
- The immediate cutover cycle uses the existing controlled Wrangler scheduled
  test path with production bindings; no permanent public refresh route is
  added.
- No secret is added to source or Wrangler configuration.
- Attempt IDs use `crypto.randomUUID()`.
- Error and receipt strings are bounded and content-free.
- Existing source allowlists, payload bounds, exact-byte hashes, attribution,
  and Artificial Analysis exclusion remain unchanged.

## Data model and configuration changes

1. Add one D1 migration containing bounded catalog and benchmark cycle receipt
   tables plus indexes for latest cadence/status lookup. These rows are
   operational metadata, not publication authority.
2. Add one SQLite-backed Durable Object class and migration entry to each
   ingestion Worker.
3. Generate binding types with `wrangler types`; do not extend hand-written
   environment interfaces for the new Durable Object bindings.
4. Reduce catalog Cron triggers from three to one and benchmark Cron triggers
   from twice daily to weekly.
5. Extract shared cadence/freshness constants and reusable checkpoint types.
6. Preserve existing D1/R2 resources and public API contracts.

## Testing strategy

### Unit and state-machine tests

- each state/phase transition and terminal state;
- duplicate alarms before and after each completion marker;
- restart from every persisted cursor;
- transient retry sequence and permanent failure;
- full `Retry-After`/rate-limit reset persistence, no nested 429 retry, jittered
  alarms, and serialized OpenCode requests;
- cycle expiry and next-cadence recovery;
- source revision change during LMArena/BenchLM collection;
- bounded profile/cache batches;
- old or foreign attempt cleanup rejection;
- no pointer movement before final validation;
- one guarded pointer commit after validation;
- daily versus weekly due decisions across UTC boundaries;
- 36-hour catalog and 8-day benchmark freshness boundaries.

### Integration tests

- Miniflare scheduled handler starts the correct singleton and returns within
  the Free Cron CPU envelope;
- alarms execute against fake D1/R2/upstream bindings and resume after process
  restart;
- a full synthetic cycle produces the same public snapshot as the current
  monolithic function;
- unchanged input updates checked freshness without changing content revision;
- failed candidate leaves all public APIs on the previous complete revision;
- generated Wrangler types and config schema agree with every binding.

### Release verification

- full Vitest, TypeScript, build, local-preview browser, and responsive browser
  suites;
- dry-run the complete state machine locally with production-sized fixtures;
- deploy both Workers and confirm exactly two total TokenBench Cron triggers;
- trigger one controlled immediate cycle and monitor every invocation outcome;
- verify no 1102, no invalid cache groups, no incomplete profiles, and no pointer
  gap;
- verify canonical API ETags, scores, model counts, SEO, stale fallback, and
  responsive surfaces;
- record actual cycle duration and the active revision in the production
  receipt.

## Rollout and rollback

1. Apply the receipt-table migration.
2. Deploy the catalog Worker with its coordinator but leave the existing Cron
   schedule until a controlled synthetic cycle passes.
3. Deploy the benchmark Worker with its coordinator and run a production-sized
   no-publish validation against immutable active snapshots.
4. Enable the one-daily and one-weekly schedules.
5. Trigger immediate controlled catalog and benchmark cycles.
6. Keep the previous Worker versions and schedules as rollback targets until
   the first complete checkpointed cycle publishes.
7. If a coordinator or alarm fails, roll back Worker code and schedule without
   deleting Durable Object, D1 receipt, pending revision, or R2 candidate data.
   The active last-good revision remains untouched.

## Acceptance criteria

- No normal catalog or benchmark refresh requires a paid Worker or external
  runner.
- Standard Cron handlers perform only due-check/dispatch work and do not exceed
  the observed Free CPU ceiling.
- Exactly one daily catalog and one weekly benchmark Cron are configured.
- A complete production-sized weekly cycle runs with zero 1102 outcomes.
- Every step is bounded, resumable, idempotent, and attempt-owned.
- Public D1 and API cache pointers move only after all required evidence and
  projections validate.
- The canonical site always serves the last complete revision during refresh
  and failure.
- Catalog freshness is 36 hours; benchmark freshness is 8 days.
- The first immediate post-deploy cycle has an observed production receipt with
  start time, completion time, revision, counts, and invocation outcomes.

## Primary platform references

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
