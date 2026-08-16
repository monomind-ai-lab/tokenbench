# SDD ledger — plan: docs/superpowers/plans/2026-08-17-cost-preview.md

## Resolution

- Task 1 and Task 2 are dispatched in parallel because they own separate HTML, JS, and test files.
- The plan's shared `scripts/cost-preview.test.ts` ownership is resolved as two isolated files: `scripts/cost-calculator-preview.test.ts` and `scripts/cost-breakeven-preview.test.ts`; root integration will add shared route/bundle assertions only after both workers finish.
- Existing uncommitted quick-comparison changes are preserved and are out of scope for these cost workers.

## Task 1: complete

- Monthly simulator implemented and reviewed.
- Focused calculator tests pass, including URL state, validation, exports, print scope, and source/derived separation.

## Task 2: complete

- Breakeven calculator implemented and reviewed.
- Focused breakeven tests pass, including cache fallback disclosures, zero-price SaaS behavior, chart/table parity, and print status.

## Task 3: complete

- Cost hub, shared token styling, preview route copier, navigation, route contracts, and canonical exact-file outputs integrated.
- Chart.js is copied into the preview asset bundle so the breakeven chart does not require a CDN at runtime.

## Task 4: complete

- QA: production browser suite 88 passed / 7 skipped.
- QA: focused cost/navigation suite 29 passed.
- QA: lint, build, and `git diff --check` passed.
- The initial full unit run had three existing 5-second timeouts; rerunning those files with a 15-second timeout passed 167/167 tests.
- Final full unit suite with the same timeout completed 145 files / 1,666 tests passed.
- Final deployment remains to be performed after scoped commit review.
