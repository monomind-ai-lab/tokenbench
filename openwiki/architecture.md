# Architecture

## Production-oriented root system

```text
scheduled catalog/benchmark Workers
  -> immutable source snapshots (R2)
  -> complete, revisioned D1 facts + materialized API responses
  -> atomic active publication pointers
  -> Cloudflare Pages Functions / APIs
  -> Vite-generated static/SSR HTML + React hydration in the browser
```

The root `package.json` defines the operational build: `predev`/`prebuild` generate pages, then Vite serves or builds. `vite.config.ts` combines fixed route entries with generated preview documents, uses stable asset names for Pages Functions, and excludes its local synthetic API plugin from production builds.

### Browser routing and rendering

- `src/main.tsx` delegates startup to `startPreviewRoute` in `src/preview/client-resolver.tsx`.
- `src/preview/route-manifest.tsx` is the central declaration for preview route matching, metadata/JSON-LD, payload parsing, output paths, shell, and delivery mode.
- `scripts/generate-preview-documents.ts` server-renders manifest routes via `src/preview/route-document.tsx` and embeds initial JSON.
- The client resolver prioritizes dynamic runtime routes, validates embedded payloads before hydration, preserves server HTML if a payload is malformed, and only client-mounts declared routes without embedded data.
- `src/routing/routes.ts` owns durable route matching, redirects, slash normalization, and static Vite inputs. `src/routing/leaderboard-routes.ts`, introduced at HEAD, owns leaderboard route metadata separately.

This is a hybrid static/SSR/hydration architecture—not a conventional SPA router. Preserve its SSR evidence behavior when changing a route.

### API and runtime presentation boundary

`functions/` is the Cloudflare Pages Functions surface. It serves catalog and benchmark endpoints under `functions/api/`, plus dynamic comparison/model pages, articles, newsletter, privacy, methodology, and sitemap functions. API consumers use root frontend hooks/caches (for example `src/frontend/use-catalog.ts`, `src/frontend/use-benchmarks.ts`, `src/frontend/*-cache.ts`) and validate response envelopes before rendering.

Pages request paths favor materialized responses or bounded indexed D1 reads to stay inside CPU limits; they must not rebuild a full fact graph or fetch a benchmark provider during a browser request.

## Data plane

The same bindings are used by Pages and both Workers:

- D1 binding `CATALOG_DB`: published revisioned catalog and benchmark facts, durable model directory/profile data, ingestion receipts, and response-cache pointers.
- R2 binding `SOURCE_SNAPSHOTS`: immutable upstream or sanitized evidence snapshots and hashes.

Bindings are declared in root `wrangler.toml` and worker-specific Wrangler files. Root migrations are append-only and establish the revision/publication/cache model (`migrations/0001_catalog.sql`, `0004_benchmarks.sql`, `0005_api_response_cache.sql`, `0009_model_directory.sql`, `0010_ingestion_cycles.sql`).

The cache is not incidental: API response bodies are revision-scoped, structurally checked, ETag-capable, and chunked for D1 limits. Publication ownership triggers prevent an API cache pointer from referring to a different underlying revision.

## Separate Next rebuild

`apps/web/` is a Next 16 App Router implementation introduced at current HEAD. Route entrypoints under `apps/web/src/app/` delegate to large reusable components; `site-chrome.tsx`, `preview-shell.tsx`, charts, result actions, model/compare workbenches, and subscription simulator are the main UI pieces. `next.config.ts` explicitly treats the repository root as the tracing/Turbopack root because shared contracts belong there.

The rebuild is intentionally separate from root Vite tooling. Its current `model-catalog.ts` and `subscription-simulator.ts` contain local arrays used for design/rebuild surfaces. The authoritative readiness assessment requires replacing that presentation data with the existing validated gateway and eventual HTTP composition before production. See [Key workflows](workflows.md#next-rebuild-integration) and [Domain concepts](domain.md#ui-contract-and-rebuild-boundary).

## Change guidance

- **Route/document change:** update the relevant manifest/routing source, route tests, document/resolver tests, and static-generation checks.
- **API response change:** trace schema/contract, materialization, Pages Function, client validator/cache, and stale/unavailable behavior together.
- **New data surface:** establish source rights/provenance first, preserve revision boundaries, then add normalized data, cache materialization, endpoint, and UI—not a direct browser fetch.
- **Next feature:** preserve the existing route/section/interactivity contract before additive visual work; do not make fixture values appear authoritative.
