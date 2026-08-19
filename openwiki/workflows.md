# Key workflows

## 1. Publish catalog evidence

The catalog Worker (`workers/catalog-ingest/`) begins a daily Durable Object coordinated cycle (cron `20 0 * * *`). Automated inputs are OpenRouter Models and OpenCode Zen; reviewed manual subscription manifests enter the same validated pipeline. The Worker writes evidence to R2, stages a complete immutable D1 catalog revision plus materialized responses, then atomically advances the catalog and cache pointers.

A failed fetch, validation, R2, or D1 step records an error and leaves the previous valid revision public. A valid revision can become stale; stale last-good is still served with labeling. Unavailable means no valid revision exists. See the detailed publication rules in [`docs/catalog-deployment.md`](../docs/catalog-deployment.md).

**When changing:** inspect `workers/catalog-ingest/src/`, catalog migrations, `functions/api/catalog.ts`, catalog validation, and colocated tests. Keep provider adapters serial/bounded and do not widen `AUTOMATED_SOURCE_IDS` without source review.

## 2. Publish benchmark evidence and leaderboards

The benchmark Worker (`workers/benchmark-ingest/`) starts weekly on `15 2 * * SUN`. It freezes the active catalog revision, obtains only approved evidence, creates immutable R2 snapshots, stages normalized benchmark/model/profile/comparison facts and cache projections, then moves publication pointers in one final guarded D1 transaction.

The workflow is checkpointed: a SQLite Durable Object runs bounded steps and persists cycle/step receipts in D1. It retries each source artifact at most three times, persists retry timing, and preserves last-good publication on expiry/failure. Benchmark freshness is eight days. A cache-only republish exists for materialized response corrections; it cannot change cohort membership, profile snapshots, or persisted ranks (`workers/benchmark-ingest/wrangler.toml`).

`src/benchmarks/` contains projections and derived decision logic; `functions/api/benchmarks*` and nested leaderboard/model handlers expose it. Leaderboard routes now live in `src/routing/leaderboard-routes.ts` so shared API/worker/route consumers have a focused dependency.

**When changing:** distinguish upstream evidence, normalized facts, derived ranks/projections, cached response bodies, and browser rendering. A cache fix is not evidence republishing.

## 3. Serve published data safely

Pages APIs first use a complete active materialized response, then bounded reconstruction from the active revision, then a complete historical response for the exact normalized endpoint/query. Failure returns explicit unavailable; an unfiltered cached response must never stand in for a filtered/cursor request. ETag/`If-None-Match` is part of the published contract.

Dynamic model, comparison, and sitemap routes use targeted D1 reads. Canonical comparison pairs and model profile semantics matter for redirects, `noindex`, and 404 behavior. Use `docs/catalog-deployment.md`'s API table and recovery section as the detailed release contract.

## 4. Next rebuild integration

The preservation contract (`docs/rebuild-audit/PRESERVATION_CONTRACT.md`) requires all published route families and interactive sections to survive the Next rebuild: filters, charts, URL state, actions, themes, language selector, responsive behavior, SEO/no-JS usefulness, and newsletter/global shell.

The accepted `contracts/ui-data-contract/v1` and existing `src/frontend/preview-data/` gateway are the integration boundary. The readiness audit directs engineers to adapt that gateway to Next server data composition, use deterministic evidence transport during UI reconstruction, and replace transport mode—not page contracts—when HTTP producer endpoints are ready.

Current gaps are material:

- Next pages still use local fixture arrays in places.
- Current root API shapes predate UI contract v1.
- Contracted lifecycle/rankings/comparison/subscription HTTP endpoints are not yet present on the rebuild branch.
- No deployment/cutover is authorized.

Do not solve this by silently falling back to fixtures in production. Preserve contract validation, request echoes, explicit availability, and revision separation.

## 5. Newsletter and generated content

The newsletter endpoint is browser-form-only: `POST /api/newsletter/subscribe` requires same-origin JSON, uses Brevo double opt-in, separates cheatsheet and optional alert consent, and does not reveal address existence. Its configuration is private binding configuration; never expose keys in `VITE_*` variables.

Root generation scripts create static pages, preview documents, and monthly-cheatsheet artifacts. Draft campaign creation does not authorize sending or scheduling. The operational boundaries are in `README.md` and `docs/tokenbench-deployment.md`.
