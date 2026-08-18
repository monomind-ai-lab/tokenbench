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
