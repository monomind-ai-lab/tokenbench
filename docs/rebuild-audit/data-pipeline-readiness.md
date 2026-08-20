# TokenBench Next rebuild — data pipeline readiness

Checked: 2026-08-21

## Authority and integration boundary

- Authoritative integrated base: MM4P `main` at
  `3eb370e8ca560c4d1946c75c4857f37610ff2451`
- Accepted UI contract: `contracts/ui-data-contract/v1`
- Frontend baseline recorded by the contract: `5d649d315a0bdb052e90bb96d6b7e94544f9ad31`
- Producer: `ac42000893fa2e15d0ae76f7f83ebcea5745f7b5`
- Acceptance: `413d0307fc4662a30967d8b3f9fb06f042861a0d`
- Acceptance is the producer's immediate child and contains retained evidence only.
- The contract and validated preview gateway were path-integrated into MM4P
  `main`; the producer branch itself remains divergent and must not be merged
  wholesale over the newer BenchLM/catalog implementation.

The retained evidence and schema are the accepted artifacts. MM4P `main` adds
only the acceptance SHA/provenance note to `ACCEPTANCE.md`. The additive v1
producer foundations have now been ported into this rebuild without replacing
the newer BenchLM/catalog pipeline.

## Contracted surfaces

| Method | Contracted transport | Rebuild surfaces |
| --- | --- | --- |
| `models` | `GET /api/benchmarks/models` | model catalog, model cards/list, price/performance discovery |
| `profile` | `GET /api/benchmarks/models/:slug` | static model profiles and profile panels |
| `lifecycle` | `GET /api/benchmarks/lifecycle` | lifecycle/retirement watch |
| `rankings` | `GET/POST /api/benchmarks/rankings` | LiveBench leaderboard and exact custom rankings |
| `comparison` | `GET /api/benchmarks/comparison` | ordered two-to-four model comparison |
| `subscription` | `GET/POST /api/benchmarks/subscription` | catalog and subscription-vs-API calculation |

The accepted evidence set also covers:

- mixed-source rankings with `status: "available"` and `effectiveAt: null`;
- an unavailable profile with explicit reason and null data;
- strict `invalid_timestamp` rejection;
- strict `unsupported_contract_version` rejection.

## Data semantics the UI must preserve

- Unknown facts use explicit unavailable evidence and `null`; they are never zero.
- LiveBench benchmark release facts carry CDLA-Permissive-2.0 attribution.
- Catalog, benchmark, runtime-observation, projection, and methodology revisions
  remain separate.
- TTFT, throughput, and uptime require a runtime observation set. LiveBench scores
  do not imply runtime performance.
- A comparison accepts exactly two to four ordered, distinct, safe model slugs.
- Custom rankings echo and apply the exact submitted weight/filter matrix.
- Subscription calculations are catalog-owned and have no benchmark dependency.
- Cache-read, cache-write, standard-input, output, tier, route, and crossover
  facts stay explicit.
- Production composition is HTTP-only. Evidence fixtures may not become a silent
  production fallback.

## Current readiness

| Layer | State | Evidence |
| --- | --- | --- |
| Accepted schema and retained evidence | Ready | `contracts/ui-data-contract/v1` |
| Validated parser, page adapter, and request-echo boundary | Ready on authoritative base | `src/frontend/preview-data` |
| Deterministic preview evidence transport | Ready and isolated from production | explicit retained evidence selection |
| HTTP transport with no fallback | Ready and sends the v1 media type | `src/frontend/preview-data/http-transport.ts` |
| Next pages using the validated gateway | Wired across the decision routes | Home, models/profile/lifecycle, compare, Popular Models, leaderboard children, subscription, Make It Yours, and price-performance use explicit server boundaries; production has no fixture fallback |
| Current BenchLM/catalog APIs | Healthy but legacy | focused API/contract suite passes; response shapes predate UI contract v1 |
| LiveBench ingestion cadence/source/checkpoint contracts | Ready on this branch | accepted producer foundations plus six-hour discovery cadence |
| LiveBench artifact discovery/parser/publication worker | Ready locally, not deployed | canonical release-list selection, commit-pinned four-artifact retrieval, bounded parsing, R2 evidence, bulk D1 staging/validation, monotonic current pointer |
| `rankings` GET | Production-capable after migration and first ingestion | pinned LiveBench global-average projection, release/taxonomy/total/cursor receipt, task economics, filters, bounded pagination, ETag |
| Custom `rankings` POST | LiveBench capability ranking ready | active release publishes its exact category dimension-set revision; submitted weights are echoed and applied exactly; unavailable route/runtime SLA filters make candidates ineligible rather than inventing facts |
| `models`, `profile`, `comparison` v1 | Strict mixed-source join implemented locally | LiveBench capability/economics plus exact reviewed canonical catalog route, pricing, modality, and expiration facts; runtime and cache-write remain explicitly unavailable |
| `lifecycle` | Production-capable after migration and catalog refresh | the endpoint catalog expiration date is revisioned and projected into scheduled/retired events; replacements remain unavailable unless published |
| `subscription` | Reviewed catalog and bounded calculation implemented | exactly seven provider slots; reviewed plan/usage limits; exact direct-route bindings; positive cache allocations require independently published rates |
| Deployment/cutover | Not authorized | no live infrastructure changes |

The retained acceptance artifacts are contract fixtures: their revisions are
`fixture-*` and their source URLs use `example.com`. They prove the boundary,
not production data. Production LiveBench projection reads only the active D1
revision built from commit-pinned source evidence.

## LiveBench implementation receipt

- Upstream repository: `LiveBench/new-livebench`
- Verified source commit: `fb3db47fd22d40740d2e6949623bd4bcca9182dd`
- Latest complete release observed: `2026-06-25`
- Parsed taxonomy: 7 categories and 23 tasks
- Parsed configurations: 44 models
- Parsed task facts: 1,012 scores and 1,012 economics rows
- Discovery follows the last entry in upstream `src/lib/constants.js#RELEASES`;
  a complete but unannounced filename bundle is not published.
- Discovery fingerprints the release control, three dated release files,
  `modelLinks.js`, and the two methodology implementations that control
  aggregation behavior.
- The reviewed `compute.js` and `Averaging.js` blobs are pinned. An upstream
  methodology change stops publication for review instead of silently applying
  stale math. The current two explicit upstream global-average overrides are
  reproduced by the projection.
- Retrieval verifies every immutable Git blob SHA before parsing, then stores a
  content-hashed source manifest and artifacts before D1 publication.
- Fact staging uses D1 `json_each()` bulk inserts. The 44 × 23 regression case
  stages 1,012 scores and 1,012 economics rows below the 50-query free-plan
  per-invocation ceiling; the SQL is also exercised against real SQLite.
- Concurrent refresh calls are single-flighted in the coordinator, and pointer
  promotion is conditional on a published candidate and a non-regressing
  timestamp. A slow older candidate cannot replace a newer active revision.
- Cold/no-source responses remain contract-valid 404 unavailable envelopes;
  D1 or projection faults return 503 and propagate through the HTTP transport.
- Custom category rankings use revision
  `livebench-<release>-benchmark-dimensions-v1`, validate that exact dimension
  set, preserve the submitted matrix, and calculate deterministic utility,
  rank, and Pareto results from the active release.
- The project-owner-validated `CDLA-Permissive-2.0` classification is
  authoritative for this integration. It is retained as attribution and
  provenance and is not an unresolved ingestion gate.
- A release missing its cost artifact is quarantined as incomplete because the
  v1 leaderboard contract requires complete task economics.

## Frontend decision

Use the existing `src/frontend/preview-data` gateway as the Next server data
composition boundary rather than copying the accepted contract. The production
transport exercises real benchmark-backed rankings/models/profiles/comparisons,
catalog-backed lifecycle events, and reviewed subscription catalog/calculation
facts after their migrations and refreshes run. Route/runtime SLA fields remain
explicitly unavailable until those independent joins exist. The Next decision
routes no longer use the hard-coded model catalog or browser-side price math as
factual fallbacks.

`/popular-models/` now loads the validated weekly directory and strict
leaderboard concurrently in HTTP mode. Weekly rows exclusively own popularity
identity, order, and displayed rank. Exact slug/model-ID matches enrich them
with the strict release, taxonomy, total, cursor, capability, aggregate
cost-per-success/mean-output/Pareto, task-economics, route, and runtime fields.
If strict data is absent the weekly result remains honestly partial; if weekly
data is absent the route is unavailable and never relabels a benchmark rank.

`TOKENBENCH_UI_DATA_MODE=evidence` is local-development-only and visibly labeled
with a source-neutral preview-data notice. `TOKENBENCH_UI_DATA_MODE=http` is the production HTTP-only
mode and has no evidence fallback; production builds reject evidence mode.

## Remaining data work before production

1. Deploy and exercise the exact reviewed canonical catalog join with the active
   LiveBench/catalog revisions. The code is ready locally; no live cutover has
   been authorized.
2. Add independently revisioned runtime observations for TTFT, throughput, and
   uptime, then publish coherent mixed-source projection tuples.
3. Add reviewed Perplexity/Microsoft subscription plan facts and independently
   sourced cache-write rates; keep positive unknown allocations unavailable.
4. Implement/activate the production custom-ranking POST surface if server-side
   custom ranking remains desired. The Next route no longer sends the retained
   fixture query in production: it GETs published candidates and re-ranks only
   candidates with all required six-axis, route-price, and runtime facts.
5. Exercise the shared HTTP transport through a local Next preview, then obtain
   separate authorization for any deployment or cutover.
6. After the first real production ranking response is wired, run a mandatory
   full cross-page review of `/popular-models/`, `/leaderboards/`, `/models/`,
   model profiles, `/compare/`, and `/model-lifecycle/`. Recheck the common
   source meanings, unavailable boundaries, shell, query behavior, actions, and
   desktop/mobile rendering before changing any route-level approval state.

## Verification receipt

- Clean dependency install: 0 audited vulnerabilities.
- Accepted preview gateway: 7 files, 43 tests passed.
- Catalog and benchmark full-cycle ingestion: 2 tests passed.
- Leaderboard boundary refactor: 8 files, 152 tests passed.
- Final LiveBench storage/discovery/projection/API regression slice: 58 tests passed.
- Repository-wide checkpoint-4 regression: 195 files and 2,119 tests passed.
- The current upstream LiveBench release was retrieved and projected locally:
  44 leaderboard rows with schema-valid partial evidence envelopes.
- Root TypeScript, both worker TypeScript projects, migration sequence through
  `0015`, Next ESLint, and the Next
  production build passed after integration.
- Checkpoint-4 focused adapter/projector/endpoint/ingester slice: 93 tests
  passed (17 Node tests and 76 Vitest tests).
- Project-local Impeccable detector returned zero findings across the eight
  data-wired decision components.
- Popular Models focused contract/adapter/transport run: 4 files and 24 tests
  passed; the shared result-action Node test passed 4 tests separately.
- Next ESLint and the Next production build passed with `/popular-models/` as a
  request-time dynamic route.
- The live weekly Popular Models projector and exact strict enrichment merge
  passed six focused tests; a missing weekly source remains unavailable.
- Per-key leaderboard HTTP projection passed four focused parser/projector
  tests and the Next production build.
- The strict catalog join and model/profile/comparison API slice passed 29
  focused tests after lifecycle aggregation was hardened against partial-route
  retirement inference.
- Local design-evidence browser check: at 390×844 the desktop table was hidden,
  equivalent result cards rendered, and the fixed category controls used a
  contained horizontal strip. At 1691×1324 all 13 master-table columns fit the
  content region without horizontal scroll. The check observed the skip link,
  single-row desktop filters, provider picker, category/sort state, row
  disclosure, labeled chart images, source-neutral copy, and ordered
  `alpha,beta,gamma` comparison handoff.
- The shared result-action test uses a `.node-test.ts` filename so root Vitest
  does not collect the Next-only alias boundary; its dedicated `tsx --test` run
  covers CSV formula hardening, UTF-8 BOM output, PNG control exclusion, and the
  accessible action group.
- No deployment, endpoint activation, or live infrastructure change occurred.
