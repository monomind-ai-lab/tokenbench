# TokenBench catalog and benchmark deployment

This document describes the TokenBench data plane and its release controls. It
does not authorize remote commands, dashboard changes, or production data
changes. Follow [the deployment runbook](tokenbench-deployment.md) for the
required local evidence and explicit authorization checkpoints.

## Components and bindings

The checked-in Wrangler files are the source of truth for binding names and
resource configuration:

| Component | Configuration | Role | Required bindings |
| --- | --- | --- | --- |
| Cloudflare Pages | [../wrangler.toml](../wrangler.toml) | Serves the built site and Pages APIs. | CATALOG_DB, SOURCE_SNAPSHOTS |
| Catalog ingestion Worker | [../workers/catalog-ingest/wrangler.toml](../workers/catalog-ingest/wrangler.toml) | Publishes catalog revisions from approved sources and reviewed manifests. | CATALOG_DB, SOURCE_SNAPSHOTS |
| Benchmark ingestion Worker | [../workers/benchmark-ingest/wrangler.toml](../workers/benchmark-ingest/wrangler.toml) | Publishes benchmark revisions and comparison eligibility from approved evidence. | CATALOG_DB, SOURCE_SNAPSHOTS |

All three components must bind the same approved D1 database and R2 bucket
under the exact names CATALOG_DB and SOURCE_SNAPSHOTS. Do not create divergent
dashboard-only bindings, copy credentials into this document, or change a
resource identifier without a reviewed configuration change. The authenticated
operator must verify the deployed binding names before enabling or changing
schedules.

## Database migrations

The root migration sequence is append-only. Migration
[../migrations/0004_benchmarks.sql](../migrations/0004_benchmarks.sql) adds the
benchmark revision, source record, model, metric, price-check, comparison-pair,
refresh-state, and active-publication tables. It depends on the existing catalog
revision tables and must be applied to the same D1 database used by Pages and
both Workers.

Run local migration checks during development. An explicitly authorized
production operator may apply the remote migration from the repository root:

~~~sh
npx wrangler d1 migrations apply ai-plan-catalog --remote
~~~

Migration [../migrations/0005_api_response_cache.sql](../migrations/0005_api_response_cache.sql)
adds revisioned API-response bodies, atomic scope pointers, and targeted
comparison indexes. Response bodies are split on Unicode boundaries below D1's
row limit. Fresh and stale variants are written completely before the pointer
moves; only the active and immediately previous cache revisions are retained.

Before deploying changed Pages or ingestion code, record operator-approved
evidence that both 0004_benchmarks.sql and 0005_api_response_cache.sql appear
exactly once in remote migration history. Do not attempt a destructive schema
rollback. If a later correction is necessary, use an approved additive
migration and preserve the original migration record.

Both ingestion Workers require Workers Paid for their scheduled publication
query budget. This is separate from Pages request-time CPU: Pages APIs use raw
materialized responses or bounded targeted readers so normal requests do not
rebuild the full fact graph.

## Scheduled ingestion

| Worker | Cron | Work performed | Operational constraint |
| --- | --- | --- | --- |
| tokenbench-catalog-ingest | 0 */6 * * * | Refreshes the approved OpenRouter model catalog. | Only sources named in AUTOMATED_SOURCE_IDS may refresh automatically. |
| tokenbench-catalog-ingest | 30 */6 * * * | Refreshes the approved OpenCode Zen catalog. | Only sources named in AUTOMATED_SOURCE_IDS may refresh automatically. |
| tokenbench-catalog-ingest | 0 */3 * * * | Rotates the reviewed manual subscription manifest. | Unverified providers remain provenance-only. |
| tokenbench-benchmark-ingest | 15 */12 * * * | Refreshes LMArena, LiteLLM, and catalog-correlated route evidence twice daily; BenchLM completes at most one successful upstream check per UTC day. | This Worker is scheduled-only; its fetch handler intentionally returns 405. |

The automated OpenRouter and OpenCode source fetches remain at four runs per
day. That cadence should be reduced only after observed rate limiting (notably
HTTP 429), a provider policy change, or sustained source errors attributable to
request frequency. Ordinary 5xx failures do not justify slowing the catalog.
LMArena stays at two runs per day; if it becomes unstable, reduce its fetch
concurrency before reducing freshness cadence. Manual-manifest rotations do not
make external provider requests.

On later benchmark runs in a UTC day, the Worker rehydrates all five
hash-verified immutable BenchLM projections from R2 instead of calling
BenchLM. A conditional D1 daily-check lease allows only one overlapping
invocation to make the upstream check; a 15-minute abandoned lease can be
reclaimed. Before completing that lease, the owner persists any new immutable
evidence plus a hash-checked manifest for the complete five-artifact bundle. A
failure before that verified persistence releases the lease for a retry; a
later LMArena, LiteLLM, or publication failure does not reopen the completed
BenchLM check or cause a same-day refetch. A successful 304 likewise persists a
daily manifest and advances BenchLM check freshness without publishing a new
content revision.

An overlapping lease loser checks for the owner every 500 ms for at most 10
seconds, then rehydrates the owner's exact completed manifest. If the owner
releases the lease, the waiter may claim it and perform the check itself. This
bound leaves enough of the Workers Paid 1,000-query invocation allowance for a
maximum-size benchmark publication and its failure cleanup. If neither handoff
completes in that bound, the waiter fails before fetching downstream sources or
publishing, so it cannot supersede the winner with stale BenchLM projections.
LMArena and LiteLLM otherwise continue to refresh on both scheduled runs.

There is no public HTTP endpoint for a benchmark refresh. A controlled refresh
must use an authorized Cloudflare scheduling or dashboard mechanism, not a
browser request to the Worker. Record the mechanism, time, operator, and result
in the deployment runbook.

From the repository root, the corresponding deployment commands are:

~~~sh
npx wrangler deploy --config workers/catalog-ingest/wrangler.toml
npx wrangler deploy --config workers/benchmark-ingest/wrangler.toml
~~~

Run either command only with explicit Cloudflare deployment authorization. A
catalog Worker deployment is required when its implementation or configuration
changes; a benchmark Worker deployment is required before relying on benchmark
publication behavior from a changed build.

## Publication and integrity invariants

Catalog ingestion validates an approved source or reviewed manual manifest,
writes raw evidence to R2, and then publishes a D1 revision atomically. A fetch,
validation, R2, or D1 failure records an actionable source refresh error while
the last published catalog revision remains active.

Benchmark ingestion follows the same publication boundary:

1. It reads the active catalog revision, fetches only approved source artifacts,
   and validates source, license, and data-contract rules.
2. It writes immutable evidence snapshots and content-hash metadata to R2
   before publication. A completed BenchLM daily check also leaves an immutable
   five-artifact manifest that later same-day attempts can verify and rehydrate;
   this source-check record is not itself a benchmark content publication.
3. It stages a complete benchmark revision, related records, and materialized
   responses in D1 batches capped below the platform RPC limit. One final D1
   transaction switches both publication pointers only after staging succeeds.
4. It records a failure in benchmark_refresh_state without replacing a previous
   published revision.

Because R2 evidence is immutable and precedes the atomic D1 pointer switch, a
later source or publication failure can leave unreferenced evidence or a
completed BenchLM daily manifest. That is expected and safe: the last complete
benchmark revision remains active, while the next same-day attempt reuses the
verified BenchLM manifest instead of issuing another BenchLM request.

Each successful publisher also materializes the public response layer. Catalog
responses are keyed by the checked-in subscription-manifest revision and use a
catalog-pointer compare-and-set so overlapping cron runs cannot move the cache
backward. Benchmark publication materializes summary, default first pages, and
complete ordered pagination projections under an attempt-unique inactive cache
revision. Database triggers require the response-cache pointer to match the
active published benchmark revision. An unchanged refresh rebuilds freshness
variants without changing the content revision. A failed, stale, or overlapping
publication leaves both prior complete pointers active.

LMArena Dataset Viewer remains the primary transport. If it exhausts retries
for a timeout, 408, 429, or 5xx response, the Worker may use the official Hub
Parquet fallback pinned to one verified dataset commit. The fallback preserves
the same subset, split, category, schema, attribution, immutable R2 evidence,
and atomic D1 publication rules. It does not run for authorization, schema,
size, or validation failures.

Post-refresh verification must confirm an active published benchmark revision,
expected source records, reachable R2 snapshot keys, and empty last_error values
for the refreshed artifacts. A failed or incomplete refresh is not eligible for
Pages deployment evidence.

Source permissions, required attribution, safe projections, and the prohibition
on Artificial Analysis data are defined in
[data-sources.md](data-sources.md). Do not widen an ingestion allowlist or add
browser scraping without the separate review described there.

## Pages APIs and comparison delivery

The browser reads published data through Pages APIs:

| Surface | Release contract |
| --- | --- |
| GET /api/catalog | Active catalog revision and its response validators. |
| GET /api/benchmarks | Benchmark summary, source availability, leaderboard availability, and compare-directory data for the active benchmark revision. |
| GET /api/benchmarks/leaderboards/:key | Raw materialized default page plus bounded materialized pagination for every valid limit and cursor, with source attribution and ETag support. |
| GET /api/benchmarks/models/:slug | Targeted evidence, metrics, route pricing facts, and related comparison pairs for one known model. |
| /compare/:pair/ | A Pages Function target for canonical, server-rendered comparison pages. Valid non-indexable pairs remain useful with noindex,follow; reverse pairs redirect and invalid pairs return 404. |
| /sitemaps/comparisons.xml | A dynamic sitemap target containing only canonical, indexable comparison pairs. |

Catalog, summary, and leaderboard cache hits do not parse or validate the full
published fact graph. Model, comparison, and sitemap requests use indexed,
targeted D1 reads. The comparison route and dynamic sitemap are release dependencies, not evidence
that a currently unchecked-out build is production-ready. They must be tested
against the integrated Pages Function implementation before deployment. A
matching If-None-Match header on a published benchmark API response must produce
304; no browser flow may make an upstream benchmark-provider request.

## Ordered release checks

1. Run the complete local gate and two documented UX/UI audit passes from the
   integrated tree.
2. Obtain authorization to commit and push the validated release.
3. Obtain separate authorization and target confirmation for the remote D1
   migration; verify 0004_benchmarks.sql and 0005_api_response_cache.sql once.
4. Deploy any changed ingestion Worker. For benchmark changes, run one approved
   controlled refresh and verify revision, source, R2, and refresh-state
   integrity before deploying Pages.
5. Build and deploy Pages only after the database and Worker checks succeed:

   ~~~sh
   npm run build
   npx wrangler pages deploy dist --project-name tokenbench
   ~~~

6. With separate domain-change authorization, attach the canonical TokenBench
   domain, detach only the approved legacy custom domain, and remove its exact
   DNS record while retaining the legacy Pages project.
7. Run the production smoke checks and record real results, deployment
   identifiers, and any rollback decision in the runbook.

The canonical production origin is https://tokenbench.monomind.one. The legacy
ai-plans.monomind.one custom domain and its exact DNS record must be absent after
cutover; the underlying legacy Pages project remains available at its pages.dev
hostname.
