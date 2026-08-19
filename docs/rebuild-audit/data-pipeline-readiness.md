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
only the acceptance SHA/provenance note to `ACCEPTANCE.md`.

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
| Deterministic preview evidence transport | Ready and integrated in the prior React preview | explicit retained evidence selection |
| HTTP transport with no fallback | Ready but not selected | `src/frontend/preview-data/http-transport.ts` |
| Next pages using the validated gateway | Not wired | current Next pages still import local fixture arrays |
| Current BenchLM/catalog APIs | Healthy but legacy | focused API/contract suite passes; response shapes predate UI contract v1 |
| LiveBench ingestion cadence/source/checkpoint contracts | Implemented on accepted producer branch | producer source contracts and tests |
| LiveBench artifact discovery/parser/publication worker | Not present in the accepted producer tree | implementation remains plan-only |
| Contracted lifecycle/rankings/comparison/subscription HTTP endpoints | Not present on current rebuild branch | do not activate HTTP mode yet |
| Deployment/cutover | Not authorized | no live infrastructure changes |

The accepted artifacts are contract fixtures: their revisions are `fixture-*` and
their source URLs use `example.com`. They prove the boundary, not production data.

## Frontend decision

Adapt the existing `src/frontend/preview-data` gateway into Next server data
composition rather than copying or redesigning the accepted contract. Continue
section-by-section design against its explicit evidence transport, then replace
transport mode—not page contracts—when the LiveBench-backed HTTP producer is
integrated. Any component that currently displays invented scores, prices, TTFT,
throughput, uptime, lifecycle events, or subscription facts must be rewired to
the gateway or labeled as a design fixture before production.

## Remaining data work before production

1. Port only the additive LiveBench source, identity, checkpoint, and producer
   pieces still needed by MM4P `main`; do not overwrite the newer BenchLM path.
2. Implement the actual LiveBench release discovery, licensed immutable snapshot,
   parser, normalization, identity review, and atomic publication flow.
3. Materialize the six contracted endpoints from one coherent revision tuple.
4. Run accepted schema/runtime validation and request-echo checks on every response.
5. Exercise the shared HTTP transport through Next in local preview, then obtain separate
   authorization for any deployment or cutover.

## Verification receipt

- Clean dependency install: 0 audited vulnerabilities.
- Accepted preview gateway: 7 files, 43 tests passed.
- Catalog and benchmark full-cycle ingestion: 2 tests passed.
- Leaderboard boundary refactor: 8 files, 152 tests passed.
- Root TypeScript, both worker TypeScript projects, legacy production build,
  Next ESLint, and Next production build passed.
- Repository-wide test run: 1,798/1,799 passed under four-worker contention.
  The sole 200-page LMArena safety-cap test exceeded its 60-second suite timeout;
  the exact test passed alone in 47.2 seconds (1 passed, 70 skipped).
- No deployment, endpoint activation, or live infrastructure change occurred.
