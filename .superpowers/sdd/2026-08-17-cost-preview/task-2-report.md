# Task 2 implementation report — breakeven calculator

## Delivered scope

- Added `prototypes/ui-revamp-3/cost-breakeven.html`, a static preview document that uses relative `styles.css`, `data.js`, `common.js`, and `cost-breakeven.js` asset references for the later Pages bundle rewrite.
- Added `prototypes/ui-revamp-3/cost-breakeven.js`, which calls the shared `setupShell()`, uses `TB_MODELS` price fixtures, and draws through the shared `chart()` helper. Chart.js is optional: the exact semantic evidence table is rendered independently and remains available if the helper detects no Chart runtime.
- Added `scripts/cost-breakeven-preview.test.ts`, covering the page contract in JSDOM with a narrow shell/chart adapter. The adapter keeps this page test independent from concurrent shared-shell changes while exercising the production calculator document and runtime.

## Interaction and calculation contract

- Seats are clamped to 1–50. Subscription price defaults to `$20` per seat each month. The selected-volume slider is constrained to 0–300M monthly tokens.
- The dynamically populated fixture model selector includes DeepSeek V3, Claude 3.5 Sonnet, and GPT-4o when their usable input/output pricing fields are present.
- Effective API cost combines the selected input/output mix, cache-read/cache-write proportions (falling back to regular input price when a fixture lacks a cache rate), and an optional 1.5× long-context planning multiplier.
- SaaS and API curves are sampled at 0, 25, 50, 100, 150, 200, 250, and 300M tokens. The same cent-rounded values are sent to Chart.js and the semantic table. A dashed crossover dataset, shaded API region, selected-volume marker, and plain-language lower-cost outcome accompany the curves.
- Text and code workload estimation uses 4 and 3 characters per token respectively; users can apply that estimate to the volume marker.
- State is serialized through `URLSearchParams`, invalid shared model IDs fall back to the default fixture, and numeric shared values are normalized to supported ranges.
- Copy-link, CSV, and print actions include accessible live status. Formula, cent/crossover rounding, fixture source, effective date (`2026-08-15`), assumptions, and an ISO calculation timestamp are visible in the page.

## TDD and verification

1. Wrote `scripts/cost-breakeven-preview.test.ts` before either production file existed.
2. Ran `npm test -- scripts/cost-breakeven-preview.test.ts` and observed the expected RED result: 4/4 tests failed because the preview document/runtime did not exist.
3. Implemented the static document and runtime. A chart/table parity assertion then exposed binary floating-point differences at 150M, 250M, and 300M; calculation outputs now round currency curve points to cents once, before both rendering paths consume them.
4. Added a URL-normalization test before correcting invalid shared model IDs; it failed with an empty selected value as expected, then passed after model validation was added.
5. Final verification:

   ```text
   npm test -- scripts/cost-breakeven-preview.test.ts
   Test Files  1 passed (1)
   Tests       8 passed (8)
   ```

   `git diff --check` was also clean for the three implementation/test files.

## Review fix round

- Added explicit cache-read/cache-write fallback disclosures to the selected-price evidence row, formula, and assumptions whenever a fixture lacks a cache rate; the effective rate continues to use the standard input price and now explains that substitution at every audit surface.
- Added a zero-SaaS branch so the output says SaaS is equal at 0M and lower for positive token volumes, without describing an impossible negative/“below 0M” API region.
- Added the live `Preparing print view…` status update before invoking `window.print()`.
- Added regression tests for all three review findings. The pre-fix run was RED at 3 failing tests; the post-fix focused run is GREEN at 8/8.

## Integration handoff

The page intentionally retains asset-relative references. Task 3 must add `cost-breakeven.html` to its Pages copy routes, copy `cost-breakeven.js` to `ui-revamp-3-assets`, and include that filename in its shared-asset URL rewrite so `/cost/breakeven` resolves all four assets after bundling.
