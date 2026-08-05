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

## Database migration

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

Before deploying benchmark code, record operator-approved evidence that
0004_benchmarks.sql appears exactly once in the remote migration history. Do
not attempt a destructive schema rollback. If a later correction is necessary,
use an approved additive migration and preserve the original migration record.

## Scheduled ingestion

| Worker | Cron | Work performed | Operational constraint |
| --- | --- | --- | --- |
| tokenbench-catalog-ingest | 0 */6 * * * | Refreshes the approved OpenRouter model catalog. | Only sources named in AUTOMATED_SOURCE_IDS may refresh automatically. |
| tokenbench-catalog-ingest | 30 */6 * * * | Refreshes the approved OpenCode Zen catalog. | Only sources named in AUTOMATED_SOURCE_IDS may refresh automatically. |
| tokenbench-catalog-ingest | 0 */3 * * * | Rotates the reviewed manual subscription manifest. | Unverified providers remain provenance-only. |
| tokenbench-benchmark-ingest | 15 */12 * * * | Refreshes approved BenchLM, LMArena, LiteLLM, and catalog-correlated route evidence. | This Worker is scheduled-only; its fetch handler intentionally returns 405. |

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
   before publication.
3. It inserts a complete benchmark revision and related records in one D1 batch,
   then switches benchmark_publication_state only after that batch succeeds.
4. It records a failure in benchmark_refresh_state without replacing a previous
   published revision.

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
| GET /api/benchmarks/leaderboards/:key | A workload-profiled, paginated leaderboard with source attribution and ETag support. |
| GET /api/benchmarks/models/:slug | Evidence, metrics, route pricing facts, and related comparison pairs for one known model. |
| /compare/:pair/ | A Pages Function target for canonical, server-rendered comparison pages. Valid non-indexable pairs remain useful with noindex,follow; reverse pairs redirect and invalid pairs return 404. |
| /sitemaps/comparisons.xml | A dynamic sitemap target containing only canonical, indexable comparison pairs. |

The comparison route and dynamic sitemap are release dependencies, not evidence
that a currently unchecked-out build is production-ready. They must be tested
against the integrated Pages Function implementation before deployment. A
matching If-None-Match header on a published benchmark API response must produce
304; no browser flow may make an upstream benchmark-provider request.

## Ordered release checks

1. Run the complete local gate and two documented UX/UI audit passes from the
   integrated tree.
2. Obtain authorization to commit and push the validated release.
3. Obtain separate authorization and target confirmation for the remote D1
   migration; verify 0004_benchmarks.sql once.
4. Deploy any changed ingestion Worker. For benchmark changes, run one approved
   controlled refresh and verify revision, source, R2, and refresh-state
   integrity before deploying Pages.
5. Build and deploy Pages only after the database and Worker checks succeed:

   ~~~sh
   npm run build
   npx wrangler pages deploy dist --project-name tokenbench
   ~~~

6. With separate domain and redirect authorization, attach the canonical
   TokenBench domain, retain the legacy hostname long enough to redirect, and
   configure the approved path-and-query-preserving 301.
7. Run the production smoke checks and record real results, deployment
   identifiers, and any rollback decision in the runbook.

The canonical production origin is https://tokenbench.monomind.one. The legacy
ai-plans.monomind.one hostname must redirect to the equivalent canonical path
and query with HTTP 301; preview and localhost hosts must not be redirected.
