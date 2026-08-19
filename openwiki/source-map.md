# Source map

## Top-level responsibilities

| Path | Responsibility | Start here when… |
| --- | --- | --- |
| `src/` | Root Vite React UI, domain calculations, routing, preview/static delivery, client data adapters | changing the current browser experience or shared decision logic |
| `functions/` | Cloudflare Pages API, SSR/dynamic routes, newsletter/privacy/sitemaps | changing public delivery or request-time behavior |
| `workers/` | Catalog/benchmark scheduled ingestion and Durable Object coordination | changing upstream evidence or publication |
| `migrations/` | Append-only D1 schema and publication/cache integrity | changing persisted data/invariants |
| `contracts/ui-data-contract/v1/` | Accepted UI boundary schema, examples, retained evidence/rejections | changing rebuild composition or evidence semantics |
| `apps/web/` | Separate Next.js App Router rebuild | rebuilding a preserved route; verify data readiness first |
| `scripts/` | Static/preview document and content generation, local preview helpers, operational utilities | changing build-time delivery or local tooling |
| `docs/` | Deployment, data-source, rebuild preservation/readiness, design evidence | checking policy or operational requirements |
| `browser-tests/` | Playwright responsive browser coverage | validating end-to-end visual/route behavior |

## Root `src/` landmarks

- `main.tsx`: browser entrypoint.
- `preview/`: manifest, server document renderer, client resolver, route types.
- `routing/`: durable routes, static entries, frontend asset references, leaderboard route metadata.
- `frontend/preview-data/`: accepted gateway/transport/contract adapter boundary.
- `frontend/preview-workbench/`: compare and weighted-ranking client state/logic.
- `catalog/`: catalog contracts, validation, calculator/subscription logic.
- `benchmarks/`: source normalization, leaderboards, projections, response cache keys, decision picks, model directory/profile logic.
- `pages/`: React route/page components; `App.tsx` retains legacy route composition and SSR/hydration exports.

## Worker and API landmarks

- `workers/_shared/checkpointed-ingestion.ts`: reusable persisted, bounded, retry-aware ingestion mechanics.
- `workers/catalog-ingest/src/index.ts`: source orchestration and catalog publication.
- `workers/benchmark-ingest/src/index.ts`: benchmark cycle orchestration; nearby modules partition cache materialization and publication work.
- `functions/_shared/`: cache reads/writes, projections, request/response helpers, shared SSR/preview support.
- `functions/api/catalog.ts`: catalog endpoint and compatibility overlay.
- `functions/api/benchmarks*.ts` plus nested `functions/api/benchmarks/`: summary, leaderboard, model and related benchmark APIs.

## Next rebuild landmarks

- `apps/web/src/app/`: thin App Router page entrypoints and metadata.
- `apps/web/src/components/`: page implementations, global chrome/shell, charts, result actions, primitives.
- `apps/web/src/lib/model-catalog.ts`, `subscription-simulator.ts`: currently local rebuild data/logic—not authoritative production integration.
- `docs/rebuild-audit/PRESERVATION_CONTRACT.md`: route/feature preservation requirements.
- `docs/rebuild-audit/ROUTE_MATRIX.md`: audit checklist by route family.
- `docs/rebuild-audit/data-pipeline-readiness.md`: authoritative integration limitations and next steps.

## Documentation to prefer over rediscovery

- Product intent and constraints: `PRODUCT.md`.
- Local development and high-level operations: `README.md`.
- Source rights, attribution, and prohibited data: `docs/data-sources.md`.
- Binding, publication, cache, migration, and API behavior: `docs/catalog-deployment.md`.
- Release authorization/checklists: `docs/tokenbench-deployment.md`.
- Design-system material: `DESIGN.md`, `.stitch/`, `resources/style-guide.json`.
