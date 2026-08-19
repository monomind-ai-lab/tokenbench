# TokenBench Next rebuild — data pipeline readiness

Checked: 2026-08-19

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
| Next pages using the validated gateway | Leaderboard children wired; remaining Next surfaces pending | all 14 child leaderboard routes use the strict rankings adapter; local design evidence is explicit and production has no fixture fallback |
| Current BenchLM/catalog APIs | Healthy but legacy | focused API/contract suite passes; response shapes predate UI contract v1 |
| LiveBench ingestion cadence/source/checkpoint contracts | Ready on this branch | accepted producer foundations plus six-hour discovery cadence |
| LiveBench artifact discovery/parser/publication worker | Ready locally, not deployed | canonical release-list selection, commit-pinned four-artifact retrieval, bounded parsing, R2 evidence, bulk D1 staging/validation, monotonic current pointer |
| `rankings` GET | Production-capable after migration and first ingestion | pinned LiveBench global-average projection, task economics, filters, bounded pagination, ETag |
| Custom `rankings` POST | LiveBench capability ranking ready | active release publishes its exact category dimension-set revision; submitted weights are echoed and applied exactly; unavailable route/runtime SLA filters make candidates ineligible rather than inventing facts |
| `models`, `profile`, `comparison` v1 | Benchmark-backed partial responses ready | LiveBench capability/economics are real; catalog routes, runtime, and lifecycle remain explicitly unavailable |
| `lifecycle`, `subscription` | Contract-valid unavailable responses only | no fixture fallback; source joins/calculators still need implementation |
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
composition boundary rather than copying or redesigning the accepted contract.
The production transport can now exercise real LiveBench-backed rankings,
models, profiles, and comparisons after local D1 ingestion. Pages must still
treat catalog-route, runtime, lifecycle, and subscription fields as unavailable
until their own sources are joined. Custom category weights are available;
route/runtime SLA filters remain explicitly ineligible until those facts join.
Any component that currently
displays invented scores, prices, TTFT, throughput, uptime, lifecycle events, or
subscription facts must be rewired to the gateway or labeled as a design fixture
before production.

## Remaining data work before production

1. Join reviewed canonical catalog identities and provider-route pricing to the
   source-only LiveBench configurations; do not guess model mappings.
2. Add independently revisioned runtime observations for TTFT, throughput, and
   uptime, then publish coherent mixed-source projection tuples.
3. Materialize the lifecycle source and subscription catalog/calculator instead
   of returning explicit unavailable envelopes; extend custom rankings with the
   independently sourced catalog/runtime dimensions.
4. Continue wiring the remaining Next route families through the production
   HTTP-only composition. The leaderboard child family is complete; its local
   evidence mode is explicit, development-only, and never a production fallback.
5. Exercise the shared HTTP transport through a local Next preview, then obtain
   separate authorization for any deployment or cutover.

## Verification receipt

- Clean dependency install: 0 audited vulnerabilities.
- Accepted preview gateway: 7 files, 43 tests passed.
- Catalog and benchmark full-cycle ingestion: 2 tests passed.
- Leaderboard boundary refactor: 8 files, 152 tests passed.
- Final LiveBench storage/discovery/projection/API regression slice: 58 tests passed.
- Repository-wide test run after integration: 190 files and 2,083 tests passed.
- The current upstream LiveBench release was retrieved and projected locally:
  44 leaderboard rows with schema-valid partial evidence envelopes.
- Root TypeScript, both worker TypeScript projects, generated Worker binding
  checks, migration sequence through `0014`, Next ESLint, and the Next
  production build passed after integration.
- No deployment, endpoint activation, or live infrastructure change occurred.
