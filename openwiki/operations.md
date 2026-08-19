# Operations and runbook notes

## Infrastructure boundary

Cloudflare configuration is authoritative in checked-in Wrangler files:

- Root `wrangler.toml`: Pages output `dist`, D1 `CATALOG_DB`, R2 `SOURCE_SNAPSHOTS`.
- `workers/catalog-ingest/wrangler.toml`: catalog Worker, `CatalogIngestCoordinator`, daily cron.
- `workers/benchmark-ingest/wrangler.toml`: benchmark Worker, `BenchmarkIngestCoordinator`, weekly cron and cache-only republish guidance.

Pages and both Workers must use the same approved D1 database and R2 bucket under exactly those binding names. Do not create divergent dashboard-only bindings or document credentials. The detailed deployment/runbook sources are `docs/catalog-deployment.md` and `docs/tokenbench-deployment.md`.

## Migration and deployment safety

Migrations at `migrations/` are append-only. Apply and verify them in an isolated local preview before any authorized remote action. In particular, deployment guidance requires durable model-directory tables before a publisher that writes them, and it prohibits destructive rollback. A correction should be an approved additive migration.

A local build/test is evidence of code health, **not authorization** to deploy Workers/Pages, change Cloudflare resources, attach domains, create redirects, run remote migrations, or send email. Those actions require the operator/authorization checkpoints in the runbook.

## Ingestion monitoring and recovery

Each Worker persists resumable cycle/step receipts; inspect them with:

```bash
npm run inspect:ingestion -- --scope catalog
npm run inspect:ingestion -- --scope benchmarks
```

A publication failure must leave active pointers unchanged. Verify active revision, source records, R2 snapshot reachability, and relevant error state after an authorized cycle. There is intentionally no public HTTP endpoint to trigger benchmark ingestion.

For response incidents, maintain strict recovery order: active complete materialization, active revision reconstruction, exact-query historical complete response, then unavailable. Keep logs bounded and safe: no bodies, emails, cookies, authorization data, full URLs, or raw D1 errors in structured fallback events.

## Schedules and capacity constraints

Catalog is daily at `20 0 * * *`; benchmarks weekly at `15 2 * * SUN`. Both coordinators use alarm-driven bounded steps to fit Workers limits. A source artifact gets at most three requests per cycle; rate-limit resets are persisted and resumed later with bounded jitter. Benchmark cycles freeze a catalog revision and should not overlap catalog scheduling in a way that violates that invariant.

The benchmark cache-only republish mechanism is only for projection/cache corrections. It cannot broaden the ingested cohort, regenerate immutable profiles, or revise normalized ranks—those require a complete new publication cycle.

## External integrations

- **Data:** BenchLM, LMArena, OpenRouter, LiteLLM, and OpenCode Zen each have constrained roles; see [Domain concepts](domain.md#source-policy-and-provenance).
- **Cloudflare:** Pages Functions, D1, R2, Durable Objects, scheduled Workers.
- **Newsletter:** Brevo double opt-in. Keep provider keys/list/template settings server-side (non-`VITE_` configuration); consult `.env.example` placeholders and the newsletter function, never a real `.env` file.
- **Brand assets:** Brandfetch may fill missing provider logos; it is not part of the decision-data authority.
