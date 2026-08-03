# Task 2 implementation report: responsive accessible frontend

## Executive summary

Task 2 replaces the monolithic calculator page with a modular React frontend that consumes Task 1's verified catalog contracts and `/api/catalog`. The implementation keeps calculator state and all displayed values derived from the current catalog and user selections, while adding cache/revalidation states, evidence links, recommendation caveats, responsive layouts, light/dark theme persistence, and an operable language selector. The full verification suite is green: 8 test files and 42 tests pass, TypeScript lint passes, and the Vite production build completes successfully.

## Scope and preserved boundaries

The implementation was confined to Task 2 frontend, test, tooling, and documentation surfaces:

- `src/App.tsx` and `src/index.css`
- `src/frontend/` application modules and frontend tests
- `src/test/setup.ts`
- `package.json`, `package-lock.json`, and `vite.config.ts` for the DOM test harness
- this report and the Task 2 agent record

The concurrent Task 1 catalog contracts, calculator helpers, bootstrap data, validation, API function, ingestion worker, migrations, and deployment configuration were not edited or reverted. The `.codebase-memory/` persistence output and ignored `dist/` build output are intentionally excluded from the commit.

## Requirements delivered

### Modular application structure

- `app-shell.tsx` owns landmarks, sticky compact header, navigation, language control, theme toggle, catalog status strip, and retry affordance.
- `calculator-controls.tsx` owns provider, plan, model, usage, presets, input-share, and proportional model-mix controls.
- `calculator-state.ts` owns selection transitions, even redistribution, workload presets, grouped pricing-basis offers, snapshot derivation, and display formatting.
- `results-dashboard.tsx` renders API-equivalent value, blended API cost, break-even, conditional maximum plan value, and a derived trend chart.
- `comparison.tsx` keeps subscription, direct-provider, OpenRouter, and OpenCode Zen pricing identities separate, with semantic desktop tables and compact mobile offer cards.
- `recommendation.tsx` delegates cost-first plan selection to the existing Task 1 helper and adds stale/bootstrap, variable-limit, access, and manual-source caveats.
- `ui.tsx` centralizes cards, empty states, loading skeletons, status banners, evidence links, confidence labels, and date formatting.

### Catalog loading and provenance

- `catalog-cache.ts` stores a small versioned localStorage entry, sends `If-None-Match` for cached ETags, handles `304 Not Modified`, and records a fresh/stale/bootstrap freshness state.
- `use-catalog.ts` exposes loading, ready, and error phases, retry behavior, last successful refresh time, cache status, and actionable notices to the shell.
- Network failure never invents prices: a cached verified catalog is marked stale; without cache, only the checked-in verified bootstrap is shown with an explicit unavailable/bootstrap notice.
- All comparison and recommendation surfaces use catalog provenance for official evidence links and confidence labels.

### Calculator behavior

- Provider and plan selection remain stable while model selections and workload settings change.
- Selecting multiple models redistributes the model mix evenly, and editing a mix preserves the other selected shares through the existing calculator helper.
- Balanced, input-heavy, and output-heavy presets update only the corresponding workload inputs; the monthly token input remains editable.
- Every metric, chart point, comparison cell, and recommendation is calculated from current selection state and catalog offers. Supplied design-reference sample values are not used as result constants.

### Responsive and accessible UI

- The blue/neutral visual system supports light and dark themes with explicit focus-visible styling and reduced-motion behavior.
- The compact header becomes a two-row layout below 768px; controls and results stack at compact widths; comparison tables become cards below 768px.
- Tablet layout switches to two-column controls at 768px; desktop uses a sticky controls column and a 4:8 results grid from 1024px; wide layouts center within a 1440px maximum width.
- Inputs, buttons, navigation links, and evidence links use at least 44px interaction heights. Fieldsets, legends, labels, landmarks, heading hierarchy, table captions, and table scopes are present.
- The real browser harness covers 320, 375, 768, 1024, and 1440px layout boundaries, document-level overflow, compact header bounds, and keyboard focusability for primary controls.

## Test-first evidence

The frontend tests were authored before the corresponding production modules. The initial focused run failed with module-not-found errors for the not-yet-created calculator-state, catalog-cache, and responsive modules. Production behavior was then implemented in small increments until the focused tests passed, followed by the app-shell integration coverage and the full suite.

Added test coverage includes:

- `calculator-state.test.ts`: initial selection, model toggle/even redistribution, workload presets, and derived metric calculation.
- `catalog-cache.test.ts`: fresh response/ETag storage, conditional revalidation/304 handling, and explicit bootstrap fallback.
- `app-shell.test.tsx`: derived metrics, separated pricing bases, evidence links, model/preset editing, language/theme persistence, retry after failure, compact mobile cards, and keyboard focus.
- `responsive-harness.test.ts`: layout boundary contract coverage for all five acceptance viewport widths.
- `browser-tests/responsive-browser.ts`: real local-Chrome viewport coverage for all five widths, document overflow, compact header bounds, card/table modes, responsive control/result grids, 44px range geometry, and keyboard focus-visible navigation.

## Verification

Commands were run from `/Users/darenmini/projects/.codex-worktrees/ai-plan-responsive`:

```text
rtk npm test -- --reporter=dot
  8 test files passed; 42 tests passed with `NODE_OPTIONS=--no-experimental-webstorage`.

rtk npm run lint
  tsc --noEmit passed.

rtk npm run build
  Vite production build passed; 45 modules transformed.

rtk git diff --check
  passed.

rtk npm run test:browser
  6 Playwright tests passed in local Chrome: 320, 375, 768, 1024, and
  1440px viewport modes plus keyboard Tab/focus-visible coverage.
```

The Node 25 `--localstorage-file` warnings are eliminated by disabling experimental global webstorage only for the Vitest process; no unrelated warning suppression is used. Playwright writes any runner output to `/tmp/ai-plan-responsive-playwright-results`, leaving generated screenshots/traces outside the repository.

The required codebase change audit was run before staging with `detect_changes(scope=working_tree, base_branch=main, depth=3)`. It reported 22 branch-level changed files and no impacted symbols; its list includes the existing Task 1 branch deltas because the graph comparison is against `main`, while the Task 2 working diff contains only the frontend/tooling/test/report surfaces listed above.

## Round 1 review fixes

Terra review task `task_c3b8f56a8323` identified six blocking gaps; all are covered by red regressions followed by green verification:

1. Replaced the arithmetic-only responsive test with a repeatable Playwright browser harness. The harness launches local Chrome, sets 320/375/768/1024/1440px viewports, asserts `document.documentElement.scrollWidth <= clientWidth`, checks compact/table/card/grid modes, verifies compact header bounds, and checks 44px range geometry.
2. Removed programmatic `.focus()` assertions from `app-shell.test.tsx`. Playwright now tabs from the document body and verifies that the language select, theme button, and evidence links become `:focus-visible` with a 3px outline.
3. Changed every range input to `min-height: 44px; height: 44px`, with both DOM-style and real-browser geometry assertions.
4. Removed `.app-shell` page-level overflow masking and tightened compact nav/action widths, gaps, and typography; real browser checks pass at 320px and 375px.
5. Updated the `test` script to run Vitest with `NODE_OPTIONS=--no-experimental-webstorage`; final npm test output is warning-free.
6. On a 304 response, `catalog-cache.ts` now refreshes catalog `checkedAt`, persists refreshed `fetchedAt`, and stores the response/current ETag. The new regression confirms reloads retain the refreshed metadata.

TDD evidence for this round: the focused cache/range regressions failed before implementation, the first browser run failed the range geometry at every viewport, and the final focused, full Vitest, lint, build, and six-test browser suites passed. No Task 1 catalog/domain/worker files, `.codebase-memory/`, `dist/`, screenshots, or traces were staged.

The pre-commit `detect_changes(scope=working_tree, base_branch=main, depth=3)` audit returned 41 branch-level changed files and no impacted symbols; the list includes the pre-existing Task 1 branch deltas, while the staged fix paths below are limited to Task 2 frontend/test/tooling/report files.

## Handoff

The original implementation commit is titled `feat: rebuild responsive accessible calculator frontend`; the Round 1 fix commit is titled `fix: close Task 2 responsive review blockers`. The coordinator can verify the exact final commit with `git rev-parse HEAD`; both commits intentionally exclude `.codebase-memory/`, `dist/`, generated screenshots/traces, and all Task 1 catalog/API/worker files.
