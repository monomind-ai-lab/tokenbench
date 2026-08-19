# Testing and change checks

## Root Vite/Cloudflare application

Run the smallest relevant suite first, then the normal root gates:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

Additional focused checks from `package.json`:

```bash
npm run test:ingestion:cycles
npm run lint:workers
npm run types:workers:check
npm run test:browser:local-preview
npm run test:browser:production
```

- `npm test` runs Vitest with up to four workers.
- `npm run build` first generates test-cheatsheet/static pages, then invokes Vite.
- Browser tests use Playwright configurations for standard, local-preview, provider marks, production assets, and mockups.
- Production browser mode builds first; local-preview runs against the synthetic local benchmark API and does not validate Pages runtime behavior.

## Test locations by concern

- **Routing/static delivery:** `src/routing/*.test.ts`, `src/preview/*test.tsx`, `scripts/*preview*.test.ts`, `scripts/generate-static-pages.test.ts`.
- **Frontend data behavior:** `src/frontend/**/*test.ts(x)`, including caches, adapters, gateway, contracts, request gate, and preview workbench state.
- **Domain/projections:** `src/catalog/*.test.ts`, `src/benchmarks/*.test.ts`, page tests under `src/pages/`.
- **Pages APIs:** `functions/**/*.test.ts` and endpoint-adjacent tests.
- **Ingestion/publication:** `workers/catalog-ingest/src/*test.ts`, `workers/benchmark-ingest/src/*test.ts`, especially full-cycle/cache partition/model-directory tests.
- **Browser/responsive behavior:** `browser-tests/responsive-browser.ts` and Playwright config files.

## Change-oriented checks

| Change | Minimum checks to consider |
| --- | --- |
| Route/SSR/hydration behavior | routing + route-manifest/document/client-resolver tests; static generation; browser route coverage |
| Catalog/benchmark API | endpoint + projection/cache tests; contract validation; exact filtered/cursor fallback behavior |
| Ingestion or migrations | relevant worker tests, `test:ingestion:cycles`, worker type/lint checks, local D1 migration gate |
| Model directory/profile | model-directory/profile tests and local-preview browser grep described in `docs/catalog-deployment.md` |
| Next rebuild component/page | from `apps/web/`: `npm run lint` and `npm run build`; also validate preservation requirements and fixture labeling |
| UI-data composition | `npm test -- src/frontend/preview-data/composition.test.ts`; verify preview-only evidence mode, an explicit HTTP(S) production base URL, and propagation of production transport failure without fixture fallback |
| Release candidate | root tests/lint/build, appropriate browser suite(s), `git diff --check`, `git status --short`; follow deployment runbook evidence |

## Known validation context

The current rebuild readiness receipt says root TypeScript, worker TypeScript, legacy Vite production build, Next ESLint, and Next production build had passed at audit time. It also records one historical full-suite timeout in a large LMArena safety-cap test under four-worker contention, while the exact test passed alone. Treat that as a signal to reproduce targeted failures rather than blindly increasing timeouts.

No test command authorizes infrastructure or data mutation. Keep test fixtures, preview evidence, and synthetic local APIs visibly distinct from published data.
