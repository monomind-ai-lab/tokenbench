# Task 1 — Cost simulator page report

## Status

Complete. The preview-only monthly cost simulator is implemented in the assigned `ui-revamp-3` worktree scope.

## Delivered

- `prototypes/ui-revamp-3/cost-calculator.html`
  - Provides the `/cost/calculator` static document with the `#monthly-cost-calculator` landmark.
  - Uses path-relative `styles.css`, `data.js`, `common.js`, and `cost-calculator.js` references for the route copier.
  - Includes labelled subscription tier, model, workload, token, cache-share, and long-context controls.
  - Contains separate source-price and derived-monthly semantic tables, API/SaaS summary values, disclosures, timestamp, and accessible action controls.

- `prototypes/ui-revamp-3/cost-calculator.js`
  - Uses `TB_MODELS` plus the existing `setupShell` runtime helper and exposes `window.renderPage`.
  - Calculates monthly messages, a declared long-context input buffer, cache-read/cache-write/standard-input allocation, and output cost from per-million-token fixture rates.
  - Clearly discloses source-rate availability; unavailable cache-write rates use standard-input price only as a labelled derived assumption.
  - Serializes valid scenario values with `URLSearchParams`, restores valid shared values, produces a CSV, invokes print, and copies the share URL with live status feedback.

- `scripts/cost-calculator-preview.test.ts`
  - Exercises the real static document/runtime in JSDOM.
  - Covers required controls and evidence tables, hand-derived deterministic API math (including long-context behavior), URL round trip, CSV generation, and print/copy-link actions.

## TDD evidence

1. RED: `npm test -- scripts/cost-calculator-preview.test.ts` failed 5/5 because the calculator document and script did not exist.
2. GREEN: after implementation, the same focused suite passed 5/5.
3. Hardening RED/GREEN: restored the simple unquoted CSV header and added an immediate copy-pending announcement; the focused suite failed on both expectations and then passed 5/5 after the runtime update.

## Verification

- `npm test -- scripts/cost-calculator-preview.test.ts`
  - 1 test file passed; 5 tests passed.

## Self-review notes

- No Chart.js dependency is required by this page; the native semantic tables are the primary and complete result surface.
- The long-context behavior is explicitly a `+50%` input-token scenario buffer rather than an invented provider price tier.
- Fixture `released` dates are shown only as model-record dates. Price-effective time remains explicitly `Unavailable in the fixture`.
- The cost hub, route copier, shared styling, common-shell route map, and browser integration tests remain Task 3/4 work and were not changed.

## Concerns

- Subscription tier amounts and all `TB_MODELS` prices are illustrative preview fixtures. They must not be treated as current commercial pricing.
- The root integration must copy the document and script and rewrite asset paths for `/cost/calculator`; this task deliberately left copier/shared-style files untouched.
