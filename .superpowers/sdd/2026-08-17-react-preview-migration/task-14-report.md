# Task 14 — React preview delivery cutover and QA

## Status

Complete. Every manifest preview route is delivered as a direct React document. No deployment or live HTTP transport was enabled.

## Cutover

- All `previewRoutes` now declare `delivery: 'react'`, including `/llm-price-performance/`.
- Removed the Vite prototype delivery plugin, `scripts/make-it-yours-preview.ts`, copied `prototypes/ui-revamp-3/` documents/assets, and their obsolete script tests.
- Added `scripts/preview-final-cutover.test.ts`, which builds an isolated output and checks direct HTML, shared shell, no-JavaScript content, preserved redirects, no SPA catch-all, and no prototype runtime assets for every manifest route.
- Removed the legacy `functions/llm-price-performance.ts` Pages Function. It had intercepted the static React document and returned a 503 legacy error page. The local Vite middleware no longer intercepts that document either; the production/static unavailable page is now the single delivery owner.
- Production Playwright now verifies every manifest and generated article document served by Pages has shared header/footer and an H1, and does not reference prototype assets. Source/fixture-only browser suites remain Vite-only instead of asserting the deleted prototype DOM against Pages output.
- Fixed a real 320px Home overflow by wrapping the seven-column model preview table in an internal horizontal-scroll region.

## Deferred remediation

- Fixture clock is pinned at `2026-08-16T00:00:00.000Z`.
- Versioned asset URLs normalize an existing query string instead of appending a second `?v=`.
- Incomplete Compare query state retains static payload order.
- Make It Yours says `Reset default weights`.
- Subscription completions use a request gate so unmounted or superseded requests cannot commit.
- Subscription calculator regressions cover 1 seat/0 tokens and 50 seats/300M tokens.

## Verification

- Focused cutover regression suite — 97 tests passed before the final Pages handler cleanup.
- `npm test` — PASS: 169 files, 1,798 tests.
- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm run test:browser:production` — PASS: 6 Pages artifact checks passed; 95 Vite fixture/prototype-only tests intentionally skipped.
- `git diff --check` — PASS.
- Built-output scan found no prototype asset files or references. `/cost*` and `/guides/*` redirect rules remain preserved.

## Audit

- The prior high `nanoid` finding is remediated with the narrow `3.3.18` override.
- `npm audit --json` now reports only `happy-dom@17.6.3` (one critical direct development dependency). The available fix is `20.11.2`, a breaking major upgrade, so it is deferred pending separate compatibility evidence.

## Advisory

Vite continues to warn that `assets/main.js` is 1.09 MB minified. Route-level lazy loading is the appropriate follow-up; it is outside this cutover's safe scope.

## Scope and ownership

Known unrelated changes remain uncommitted: the Task 7 report, `index.html`, generated/untracked page directories, and `test-results/`. The Task 14 commit contains only the cutover implementation, tests, and this report.

## Fix round 1 — query-truthful Pages documents and test-runtime remediation

### Root cause and red evidence

- Static Vite output cannot vary by request query. It served Alpha/default comparison evidence for `/model-profile?model=beta` and `/compare?models=beta,alpha` when JavaScript was disabled.
- The retained-evidence adapter already rejected those requests correctly; the regression was the static document boundary, not the request-correlation gate.
- Added focused manifest/document tests and a JavaScript-disabled Pages test. Before the fix, the focused unit run and Pages browser test failed by rendering the default Alpha/profile and Alpha/Beta/Gamma comparison evidence.
- The first Pages Function implementation imported the entire route manifest. `wrangler pages dev` then returned 500 because Ajv's runtime schema compiler is not permitted in the Worker isolate. This was reproduced by the production browser test.

### Green implementation and tests

- Added narrow `/functions/model-profile.ts` and `/functions/compare.ts` handlers backed only by compile-time retained evidence artifacts.
- The Worker helper preserves the existing exact request-correlation behavior: `model=alpha` and `models=alpha,beta,gamma` render accepted evidence; unsupported `model=beta` and reordered `models=beta,alpha` render explicit unavailable contracts.
- Kept the normal adapter's full accepted-contract validation by deferring its Ajv import. Pages Functions use the same pure mapper and correlation gate over prevalidated committed artifacts, avoiding dynamic Worker compilation.
- Added direct handler tests for both accepted and unavailable branches; focused suite: 5 files, 47 tests passed.
- Expanded the Pages production no-JavaScript matrix to cover every manifest route, every generated article's title/dek/article landmark, shared header/footer, asset bans, default profile/compare documents, the two query regressions, hydration truthfulness, and preserved redirects.
- `npm run test:browser:production` passed: 8 Pages assertions passed; 95 source-only fixture/prototype assertions skipped by design.

### Test environment security remediation

- Changed Vitest from `happy-dom` to the already-installed `jsdom@26.1.0`; removed `happy-dom` from `package.json` and the lockfile, then pruned the extraneous local package.
- jsdom exposed cross-realm `TextEncoder`/`Uint8Array`, Blob-text, and canvas gaps. The shared test setup restores Node binary primitives and provides a safe no-context canvas shim; the export test uses a `FileReader` fallback. No application behavior was changed for this compatibility work.
- `npm ls happy-dom jsdom` now lists jsdom only.
- `npm audit --json` reports 0 vulnerabilities (including 0 high and 0 critical).

### Final verification and review

- `npm test` — PASS: 170 files, 1,803 tests.
- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm run test:browser:production` — PASS: 8 passed, 95 skipped.
- `npm audit --json` — PASS: 0 vulnerabilities.
- `git diff --check` — PASS.
- Built-output scan found no prototype asset paths. Its sole `data.js` textual match is embedded Ajv source text inside `assets/contract-v1-*.js`, not a served asset reference.
- Self-review: Pages handlers make no HTTP, D1/R2, environment, or fallback-data calls; request matching remains exact; the unrelated Task 7 report, `index.html`, generated page directories, and `test-results/` remain outside scope.

### Remaining advisory

Vite still warns that `assets/main.js` is approximately 917 KB minified (253 KB gzip). Route-level lazy loading is a separate performance follow-up and was not included in this narrowly scoped fix.
