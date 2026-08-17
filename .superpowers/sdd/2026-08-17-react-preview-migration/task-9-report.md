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
