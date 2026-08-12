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

Migration [../migrations/0009_model_directory.sql](../migrations/0009_model_directory.sql)
adds the durable model directory, immutable validated profile snapshots,
revision membership, slug aliases, and immutable weekly top-100 ownership. It
is additive and must be applied before deploying benchmark-ingest code that
publishes these records. Never deploy the publishing Worker first: an otherwise
valid benchmark publication must not fail after staging because its durable
tables are absent.

For Release 3, first apply the full migration sequence to the isolated local
preview database and run the deterministic directory/profile gate:

~~~sh
npx wrangler d1 migrations apply ai-plan-catalog --local
npm test -- src/benchmarks/model-directory.test.ts src/benchmarks/model-profile.test.ts workers/benchmark-ingest/src/model-directory-publication.test.ts
npm run test:browser:local-preview -- --grep "Popular Models|model profile|retained model"
~~~

Before the authorized remote migration, export D1 to a timestamped path outside
the repository and record the active revision/model baseline. Do not overwrite
an earlier backup:

~~~sh
: "${TOKENBENCH_D1_BACKUP_PATH:?set a new backup path outside the repository}"
npx wrangler d1 export ai-plan-catalog --remote --output "$TOKENBENCH_D1_BACKUP_PATH"
npx wrangler d1 execute ai-plan-catalog --remote --command "SELECT active_revision, updated_at FROM benchmark_publication_state WHERE singleton = 1"
npx wrangler d1 execute ai-plan-catalog --remote --command "SELECT COUNT(*) AS active_model_count FROM benchmark_models WHERE revision = (SELECT active_revision FROM benchmark_publication_state WHERE singleton = 1)"
npx wrangler d1 migrations list ai-plan-catalog --remote
npx wrangler d1 migrations apply ai-plan-catalog --remote
~~~

Stop unless migration history shows `0009_model_directory.sql` exactly once.
After the changed Worker is deployed and one authorized scheduled ingestion
finishes, record these bounded integrity checks:

~~~sh
npx wrangler d1 execute ai-plan-catalog --remote --command "SELECT status, COUNT(*) AS models FROM benchmark_model_directory GROUP BY status ORDER BY status"
npx wrangler d1 execute ai-plan-catalog --remote --command "SELECT COUNT(*) AS profiles FROM benchmark_model_profile_snapshots"
npx wrangler d1 execute ai-plan-catalog --remote --command "SELECT COUNT(*) AS missing_current_profiles FROM benchmark_model_directory AS d LEFT JOIN benchmark_model_profile_snapshots AS p ON p.model_key = d.model_key AND p.revision = d.latest_profile_revision WHERE d.status = 'current' AND p.model_key IS NULL"
npx wrangler d1 execute ai-plan-catalog --remote --command "SELECT week_start, benchmark_revision, methodology_version FROM benchmark_popular_model_weeks ORDER BY week_start DESC LIMIT 2"
npx wrangler d1 execute ai-plan-catalog --remote --command "WITH latest AS (SELECT week_start FROM benchmark_popular_model_weeks ORDER BY week_start DESC LIMIT 1) SELECT COUNT(*) AS ranked_models, MIN(rank) AS first_rank, MAX(rank) AS last_rank, COUNT(DISTINCT model_key) AS distinct_models FROM benchmark_popular_model_ranks WHERE week_start = (SELECT week_start FROM latest)"
~~~

`missing_current_profiles` must be zero. The newest week must be the one current
UTC week header, its ranks must be contiguous from 1 through
`min(100, eligible public rows)`, and `ranked_models` must equal
`distinct_models`. A mismatch leaves the prior Pages release in service while
the last good published benchmark revision remains active.

Before deploying changed Pages or ingestion code, record operator-approved
evidence that both 0004_benchmarks.sql and 0005_api_response_cache.sql appear
exactly once in remote migration history. Do not attempt a destructive schema
rollback. If a later correction is necessary, use an approved additive
migration and preserve the original migration record.

Verify the active Workers plan before every release; do not add a paid CPU limit
or change billing without separate authorization. Durable profile publication
uses native Web Crypto in bounded waves so exact SHA-256 profile hashes do not
consume the pure-JavaScript compatibility path's CPU budget. The controlled
post-deploy ingestion must still complete on the approved plan before Pages is
released. This is separate from Pages request-time CPU: Pages APIs use raw
materialized responses or bounded targeted readers so normal requests do not
rebuild the full fact graph.

### Checkpointed ingestion cycles

Migration
[../migrations/0010_ingestion_cycles.sql](../migrations/0010_ingestion_cycles.sql)
adds the shared operational receipt tables `ingestion_cycles` and
`ingestion_cycle_steps`. Both ingestion Workers (catalog and benchmark) own and
write these tables; the tables are not a Pages concern. A cycle row records one
resumable cadence run (scope, cadence key, state, cursor, attempt, expiry, retry
time, and any final revision or error identifiers). A step row records one
bounded, idempotent step within that run, keyed by (scope, cycle, phase, cursor),
so a Durable Object alarm can resume from a persisted cursor after a replay or
crash. Rows are attempt-owned and the active revision pointers are moved only by
the existing guarded final transaction. `attempt` is capped at 3 per source
artifact; catalog cycles expire after 12 hours and benchmark cycles after 24
hours.

Checkpointed ingestion keeps a strict distinction between a revision that is
valid and one that is fresh:

- A published revision is **valid** whenever a complete candidate passed
  validation and moved the pointer. A served response built from it is usable
  even when no newer cycle has finished.
- Evidence is **fresh** only within its window: 36 hours for catalog evidence
  and exactly 8 days for every benchmark-derived surface (benchmark,
  leaderboard, comparison, model-profile, and price-performance evidence).
- A refresh failure or expiration leaves the last complete revision active and
  serves it as labeled last-good evidence. "Unavailable" is reserved for a cold
  system with no valid revision at all; it is never the response for a refresh
  failure.

## Scheduled ingestion

| Worker | Cron | Work performed | Operational constraint |
| --- | --- | --- | --- |
| tokenbench-catalog-ingest | `20 0 * * *` | Starts one resumable daily catalog cycle. OpenRouter and OpenCode requests run serially in separate Durable Object alarms; reviewed manual manifests are prepared without external requests. | Only sources named in `AUTOMATED_SOURCE_IDS` may refresh automatically. |
| tokenbench-benchmark-ingest | `15 2 * * SUN` | Starts one resumable weekly benchmark cycle. Retrieval, normalization, derivation, D1 facts, 100-model profile windows, cache keys, validation, and publication are checkpointed into separate alarms. | Scheduled-only; fetch returns 405. Last-good remains public until the final guarded transaction. |

This cadence is intentionally spread across the week and day for provider and
Workers Free limits. A source artifact receives at most three requests in one
cycle. HTTP 429 is never retried in the same invocation: the coordinator stores
the complete trusted provider reset, adds 0–15 seconds jitter, and resumes via a
later alarm. Catalog cycles expire after 12 hours and benchmark cycles after 24
hours; either outcome preserves the active revision.

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

The current checkpointed flow supersedes the former overlapping monolithic
lease/polling path for normal scheduling. The old `refreshBenchmarkRevision`
export remains only as a local recovery/parity tool and is not called by the
default scheduled handler.

There is no public HTTP endpoint for a benchmark refresh. A controlled refresh
must use an authorized Cloudflare scheduling or dashboard mechanism, not a
browser request to the Worker. Record the mechanism, time, operator, and result
in the deployment runbook.

From the repository root, the corresponding deployment commands are:

~~~sh
npx wrangler deploy --config workers/catalog-ingest/wrangler.toml
npx wrangler deploy --config workers/benchmark-ingest/wrangler.toml
npm run inspect:ingestion -- --scope catalog
npm run inspect:ingestion -- --scope benchmarks
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
| GET /api/benchmarks/models | Bounded durable directory query for the current weekly top 100 plus retained-model search and filters. |
| /models/ | Canonical server-rendered weekly directory with validated browser hydration and retained-model search. |
| /models/:slug/ | Canonical server-rendered current or archived model profile; aliases redirect and unknown slugs return a true noindex 404. |
| /compare/:pair/ | A Pages Function target for canonical, server-rendered comparison pages. Valid non-indexable pairs remain useful with noindex,follow; reverse pairs redirect and invalid pairs return 404. |
| /sitemaps/comparisons.xml | A dynamic sitemap target containing only canonical, indexable comparison pairs. |
| /sitemaps/models.xml | A dynamic sitemap of current and archived models whose latest valid durable profile is readable. |

### Last-good response recovery and safe logs

Summary and leaderboard requests use the same bounded recovery order: the
complete active materialized response, a reconstruction from the active
published revision, then the newest complete historical response for that exact
endpoint and normalized query. A response with missing chunks, conflicting
metadata, an invalid body length, or an invalid ETag is never selected. Filtered
or cursor leaderboard requests are rebuilt from the validated historical
projection; an unfiltered cached body is never substituted for a filtered view.
If all three stages fail, the endpoint returns the explicit unavailable response.

The fallback controller emits only these event names:

| Event | Meaning |
| --- | --- |
| `benchmark_fresh_cache_failed` | The active materialized response could not be read or validated; active-revision reconstruction will be attempted. |
| `benchmark_active_revision_failed` | The active published revision could not be reconstructed; historical recovery will be attempted. |
| `benchmark_stale_fallback_selected` | A complete historical response was selected for the exact endpoint/query identity. |
| `benchmark_unavailable` | No complete active or historical response was available. |

The exact allowed structured fields are `event`, `endpoint`, `queryId`,
`cacheScope`, `cacheKey`, `stage`, `errorClass`, optional `activeRevision`,
optional `fallbackRevision`, `fallbackSelected`, and `correlationId`.
`correlationId` accepts only a bounded safe identifier; `queryId` is a safe
normalized identity, not a raw query string. Never add response bodies, request
bodies, email addresses, cookies, authorization values, full URLs, D1 error
messages, or other personal/provider data to these events.

Catalog, summary, and leaderboard cache hits do not parse or validate the full
published fact graph. Model, comparison, and sitemap requests use indexed,
targeted D1 reads. The comparison route and dynamic sitemap are release dependencies, not evidence
that a currently unchecked-out build is production-ready. They must be tested
against the integrated Pages Function implementation before deployment. A
matching If-None-Match header on a published benchmark API response must produce
304; no browser flow may make an upstream benchmark-provider request.

## Newsletter signup boundary

`POST /api/newsletter/subscribe` is a browser-form-only Pages Function. It
accepts only JSON from a request whose `Origin` exactly matches the request URL
origin. Missing, cross-origin, non-JSON, and oversized requests are rejected;
there is intentionally no CORS or server-to-server subscription surface. A
proxy or custom-domain configuration must preserve the browser's canonical
origin instead of rewriting it. The response never reveals whether an address
already exists in Brevo.

The footer sends every accepted address through double opt-in for the monthly
cheatsheet list. The separate model-and-price-alert list is included only when
the user checks its explicit, initially unchecked consent box. The Compare
prompt begins with that optional consent and then makes the monthly-cheatsheet
offer explicit before submission. These are independent consent scopes: the
monthly audience must never be repurposed as an alerts audience.

An authorized Pages operator configures the following Function bindings without
recording their values in source, browser bundles, logs, or this document:

| Binding group | Verification before enabling signup |
| --- | --- |
| `BREVO_API_KEY` | A restricted Brevo credential is stored only as a Pages secret and is absent from every `VITE_` value, built asset, request log, and screenshot. |
| `BREVO_CHEATSHEET_LIST_ID`, `BREVO_ALERTS_LIST_ID` | Two distinct lists exist; the monthly list is always selected and the alerts list is selected only after recorded opt-in. |
| `BREVO_DOI_TEMPLATE_ID`, `BREVO_DOI_REDIRECT_URL` | The template is Brevo's reviewed double-opt-in confirmation template, uses the verified TokenBench sender, and redirects to the reviewed confirmation URL on the canonical origin. |
| Brevo sender and unsubscribe settings | The sender is verified in Brevo and the delivered newsletter/template has the required unsubscribe or preference-management destination before any campaign draft review. |

This catalog-deployment runbook and deployment of the signup endpoint provision
nothing in Brevo: they do not create a dashboard setting, template, sender,
list, secret, or campaign. After those resources already exist, a
user-initiated browser signup may request the configured double opt-in flow; it
still cannot create Brevo configuration or a campaign. The separately
authorized campaign-draft CLI described in the deployment runbook is the only
operation here that intentionally creates or reconciles a remote Brevo draft.
A missing or invalid binding leaves signup unavailable with a generic retry
response; it must not silently collect addresses elsewhere.

### Confirmation destination and blank test PDF (Release 2)

`BREVO_DOI_REDIRECT_URL` must point to the canonical
`https://tokenbench.monomind.one/newsletter/confirmed/` path. That route is a
standalone transactional page generated as a fixed HTML entry with no site
navigation or footer chrome; it carries `noindex,follow` metadata, unique
canonical/Open Graph/Twitter values, and exactly one action (a `Start Exploring`
link to `/`). Because it is noindex, the static sitemap generation excludes it.

The post-confirmation test delivery is a deterministic, versioned blank PDF at
`public/downloads/tokenbench-cheatsheet-test-v1.pdf` (public URL
`/downloads/tokenbench-cheatsheet-test-v1.pdf`), generated by
`npm run generate:test-cheatsheet` and rewritten by `prebuild`. It is served
with `Content-Type: application/pdf` and a one-year immutable
`Cache-Control` via `public/_headers`. The welcome template/automation that
links this asset is documented in the deployment runbook; this repository
implements and verifies only the asset, the headers, and the runbook. No
subscriber identity enters the asset, the headers, or any log.

## Frozen monthly artifact boundary

The monthly cheatsheet is derived from one active benchmark revision and its
matching catalog revision. The local generator reads explicit local snapshots,
writes a fresh artifact directory, and emits a manifest containing deterministic
filenames, byte counts, and SHA-256 digests. It does not upload those artifacts
or publish a URL.

Before a release candidate is considered for publication, generate the same
frozen inputs twice into two new directories in the configured artifact root
and compare the manifests' revision, filenames, byte counts, and SHA-256
values. Treat any difference as a failed determinism check. Retain the exact
verified changes envelope and, after separately authorized publication, the
signed deployment receipt under that artifact root with the generated manifest;
the generator deliberately does not invent either input. Do not replace an
existing output directory.

The campaign-draft CLI accepts `--manifest`, `--changes`, and
`--deployment-receipt` only as local relative input paths beneath
`TOKENBENCH_NEWSLETTER_ARTIFACT_ROOT`. Its separate
`TOKENBENCH_NEWSLETTER_STATE_ROOT` is private internal state for per-dedupe
locks and verified draft receipts; it is never a CLI input location or a public
artifact source. The CLI's `--artifact-base-url` must copy the exact signed
receipt value: an already-public immutable HTTPS location whose path includes
both the manifest revision and `sha256-<canonical-manifest-hash>`, with the
manifest-listed PDF and CSV URLs matching that receipt. Remote artifact upload
is outside this command and requires a separately authorized publication job.

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

For a benchmark score or reliability release, keep the Worker/refresh/Pages
order strict and record this additional evidence before advancing:

1. Deploy the verified benchmark-ingest Worker commit.
2. Trigger exactly one existing authorized controlled refresh and record the
   resulting active revision. The Worker has no public refresh endpoint.
3. Read `/api/benchmarks` and
   `/api/benchmarks/leaderboards/llm-coding?profile=balanced&sort=score-desc&limit=50`;
   require HTTP 200 and the same revision in both envelopes.
4. Require the coding JSON row for `gpt-5-6-sol` to contain value `77.95`,
   metric rank `3`, and source rank `3`. The UI rounds that reviewed score to
   `78.0` for display.
5. Before production deployment, run the local preview's supported
   `x-tokenbench-preview-state: 503` and `corrupt-cache` fixtures and verify the
   last valid browser envelope remains visible. Do not inject failures into D1,
   delete cache rows, or use the local-only header as a production mechanism.
6. Deploy Pages only after steps 1–5 pass from the same committed tree.
7. At desktop and compact widths, validate Home, coding and overall
   leaderboards, the last-good banner, canonical/title/description metadata,
   canonical share dialog, Trust footer, and absence of horizontal overflow.
8. Inspect the four structured event names above by correlation ID and confirm
   that every record contains only the allowed fields.

The strict public-score join intentionally rejects a BenchLM public row that
has no unique catalog match. If a controlled refresh fails at that boundary,
first compare the public leaderboard identities with `models.json`; do not
weaken ambiguity checks or publish a partial mixed-source bundle during an
incident.

### Price-performance projection contract (Release 4)

`GET /api/benchmarks/price-performance` serves one validated complete
projection under materialized cache key `price-performance:complete:v1`.
The default body contains every eligible current variant, all nine corrected
public score lanes, output price, the exact 3:1 blended definition, capability
options, revision/freshness facts, and source attribution. Browser filters do
not create server cache variants. `includeArchived=1` adds only parsed
latest-valid durable profiles, is bounded to 500 archived records, and returns
`data.archived.hasMore` plus the applied limit when that extension succeeds.

Publication writes both fresh and stale complete-projection cache variants
before advancing the benchmark publication pointer. A default read follows
active cache, active-revision reconstruction, then newest complete historical
cache. An archived request additionally probes the current complete cache so a
failed archived extension returns the last valid current stale projection, not
503. Matching ETags must continue to return 304. Invalid candidate-row logs are
hard-bounded and contain only event name, model key, source ID, and reason
class; no row content or provider payload is permitted.

The browser last-good key is
`tokenbench:benchmarks:v2:price-performance:complete`. A network failure may
use only a runtime-validated cached envelope and must relabel it stale with the
stored time. It must never relabel an unvalidated payload or replace unavailable
facts with zero. During release verification record the default current point
count from the deployed API and require the same count in the materialized
fresh and stale bodies for the active revision.

The canonical production origin is https://tokenbench.monomind.one. The legacy
ai-plans.monomind.one custom domain and its exact DNS record must be absent after
cutover; the underlying legacy Pages project remains available at its pages.dev
hostname.
