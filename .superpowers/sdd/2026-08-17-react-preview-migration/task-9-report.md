# Task 9 — React preview Compare workbench

## Implementation summary

- Replaced only the preview `/compare?models=` manifest route with `PreviewComparePage`; the canonical runtime-only `/compare/:pair` route remains registered to its existing SSR component and payload.
- Added bounded 2–4 model comparison state that removes blanks and duplicates while preserving the first requested order. Unknown fixture IDs remain selected and are explicitly reported as unavailable rather than silently dropped.
- Used `PreviewDataAdapter.comparison` for result data and the preview directory adapter only to populate the Add a model picker.
- Preserved the reviewed workbench structure: `Review result`, selected count, a single selected-model link per chip, one Add a model picker, icon-only copy/PNG/CSV actions, centered radar with legend spacing, exact capability table, Decision deltas title/subtitle, cost/TTFT/TPS charts, itemized semantic table, and focused/scrolled results.
- Reused `PopularChartCanvas`, whose React effect destroys Chart.js instances on cleanup. The capability and decision matrices are native semantic alternatives for chart data.

## Query and export behavior

- `models=` keeps the first nonblank instance of each ID, in query order, capped at four; serialization emits one canonical comma-separated query value.
- Add and remove preserve the relative order of retained models.
- CSV receives the exact capability rows followed by the exact decision rows used to render the tables. It preserves model-column order and quotes CSV-sensitive/formula-like cells.
- PNG export omits action controls from the captured result region; copy uses the canonical browser URL.

## Files changed

- `src/pages/preview-compare-page.tsx`
- `src/pages/preview-compare-page.test.tsx`
- `src/frontend/preview-workbench/compare-state.ts`
- `src/frontend/preview-workbench/compare-state.test.ts`
- `src/frontend/preview-workbench/compare-export-actions.ts`
- `src/frontend/preview-workbench/compare-export-actions.test.ts`
- `src/preview/route-manifest.tsx`
- `src/preview/route-manifest.test.tsx`
- `src/index.css`

## RED / GREEN evidence

RED command:

```text
npm test -- src/pages/preview-compare-page.test.tsx src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.test.ts
```

RED result: 3 suites failed as expected because `preview-compare-page`, `compare-state`, and `compare-export-actions` did not exist.

Focused GREEN command:

```text
npm test -- src/pages/preview-compare-page.test.tsx src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.test.ts src/preview/route-manifest.test.tsx
```

GREEN result: 4 files, 29 tests passed.

Regression command:

```text
npm test -- src/pages/preview-compare-page.test.tsx src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.test.ts src/frontend/comparison-radar.test.tsx src/frontend/model-pair-picker.test.tsx src/frontend/comparison-page.test.tsx src/frontend/comparison-contracts.test.ts src/preview/client-resolver.test.tsx src/preview/route-manifest.test.tsx src/preview/route-document.test.tsx
```

Regression result: 10 files, 119 tests passed.

## Lint and build

```text
npm run lint
```

Result: passed (`tsc --noEmit`).

```text
npm run build
```

Result: passed. The generated React preview includes `dist/compare/index.html`; Vite reported its existing advisory that the main chunk exceeds 500 kB after minification.

## Self-review

- Confirmed the manifest changes only the preview `/compare` entry; `previewRuntimeRoutes` still owns the exact existing comparison-detail SSR component/payload.
- Confirmed direct query hydration starts from static-compatible empty state, then applies the query and refreshes adapter data after hydration.
- Confirmed unavailable selected IDs remain counted, chip-visible, and status-visible.
- Confirmed chart values have native tables as a semantic alternative and CSV shares the displayed-row ordering.
- Confirmed `git diff --check` is clean. Generated `articles/`, `model-lifecycle/`, `model-profile/`, `test-results/`, and the pre-existing Task 7 report modification are excluded from this task's commit.

## Concerns

- Preview fixtures currently expose two approved comparison models; the React state and picker support up to four whenever the adapter provides them. Representative fixture expansion remains deferred to Task 12.
- Production build is successful with the existing Vite large-main-chunk advisory; this task does not alter bundling strategy.

## Fix round 1/5 — static default and unavailable selections

### Implementation

- Static `/compare` generation now always requests the existing representative fixture pair `gpt-4o,deepseek-v3`. The page derives its first controlled state from the validated static payload order, so the server document and first hydration tree are substantive and identical.
- Only a valid normalized two-to-four `?models=` query replaces that initial state after hydration. A missing or one-ID query retains the static default and is canonically normalized through the existing history replacement path.
- The result projection now builds ordered comparison columns from every selected ID. IDs absent from adapter data receive the stable header `Unavailable model (<id>)` and `Unavailable — No approved fixture for <id>` values in capability, economics, and decision tables.
- The economics section now includes a native exact-value matrix beneath its charts. CSV uses the same capability/economics/decision row arrays in displayed order, and PNG export captures these matrices, including unavailable columns.

### RED / GREEN evidence

Initial RED command:

```text
npm test -- src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.test.ts src/pages/preview-compare-page.test.tsx src/preview/client-resolver.test.tsx src/preview/route-manifest.test.tsx scripts/preview-build-routes.test.ts
```

RED result: 6 intended behavior failures: missing `compareStateFromQuery`, empty static comparison payload/tree, static hydration missing the default matrix, and unknown IDs filtered from selected columns.

Payload-authority RED command:

```text
npm test -- src/pages/preview-compare-page.test.tsx
```

RED result: the static page rendered `GPT-4o vs DeepSeek V3` even when the validated static payload ordered `DeepSeek V3, GPT-4o`.

GREEN command:

```text
npm test -- src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.test.ts src/pages/preview-compare-page.test.tsx src/preview/client-resolver.test.tsx src/preview/route-manifest.test.tsx scripts/preview-build-routes.test.ts
```

GREEN result: 6 files, 52 tests passed.

```text
npm run lint
npm run build
```

Result: both passed. Generated `dist/compare/index.html` was inspected and contains `Review result`, the representative pair title, exact capability matrix, economics, and Decision deltas. Vite emitted the existing large-main-chunk advisory.

### Fix self-review

- `/compare/:pair` remains exclusively in `previewRuntimeRoutes` with the unchanged SSR component and payload.
- The no-JavaScript document contains native capability, economics, and decision tables; charts are supplemental.
- The direct-query client resolver test verifies the first hydrated markup remains the default static comparison, while the page test verifies post-hydration query order and URL normalization.
- The unavailable-order test verifies `unknown-model,deepseek-v3,gpt-4o` in chips, all semantic headers, CSV content, and the exact DOM handed to PNG export.
