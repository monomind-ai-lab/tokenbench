# Final preview comparison review fix report

## Scope and outcome

This wave resolves all six Important findings from `final-branch-review.md` on
the `ui-revamp-3` preview only. It changes no production route constants,
deployments, or production data contracts. The Impeccable detector was not run:
the controller owns its single final-QA invocation.

## Root causes

1. Popular Models serialized its own fixture IDs, while the prototype Compare
   catalog normalized against a separate list and silently discarded both IDs.
2. Models wrapped the legacy renderer after it had already drawn a radar, then
   replaced that canvas; Make it yours only destroyed its radar in the visible
   branch. Both patterns could orphan Chart.js instances.
3. The production build replaces `/compare/` with the prototype, but the same
   production browser file still executed React compare-hub expectations.
4. `legend.labels.padding` controls intra-legend item spacing, not the distance
   from the last legend item to the radial scale.
5. The chip containers were 44px high, but their nested links/removal buttons
   were not independently 44px targets.
6. Prototype quick radars only exposed the decision matrix, which omits five
   of the six radar capabilities.

## Implementation by finding

1. Added a separate `TB_POPULAR_HANDOFF_MODELS` catalog containing only the
   two default Popular Models fixture identities. Populated values are copied
   from the approved Popular fixture source; unavailable prototype-only values
   remain explicitly unavailable. Compare now resolves selected IDs through the
   union catalog, preserves order, and uses the fixture's per-successful-task
   cost label rather than mislabeling it as blended per-million cost.
2. Models now suppresses the obsolete comparison renderer and owns one stored
   quick-radar instance. Models and Make it yours destroy their current radar
   unconditionally before replacing or clearing comparison DOM. Coverage uses
   a registry-aware Chart stub and proves one live radar during rerenders and
   zero after clearing.
3. Production-mode browser assertions no longer execute React compare-hub
   tests or include the React hub in the hydration matrix. The legacy hub
   remains covered in the Vite/source config; prototype `/compare` assertions
   remain production-mode coverage.
4. Added a Chart.js layout box plugin. The box is ordered immediately after
   the top legend and reserves the remaining physical space after Chart.js's
   10px legend trailing inset, producing an actual 32px last-hit-box-to-radial
   scale gap. Real local Chart.js browser coverage measures it on Models, Make
   it yours, and dedicated Compare.
5. Raised each selected-chip model link and removal button to a real 44px
   minimum target in both prototype and React CSS, including the dedicated
   Compare chips. Browser coverage measures every link/button at desktop and
   320px.
6. Added shared `comparisonCapabilityRows()` and native `<details>` semantic
   alternatives below both quick radars. They reuse `comparisonMatrix()` and
   its existing mobile metric-card representation, exposing Agentic, Coding,
   Reasoning, Math, Multimodal, and Throughput with models as columns.

## RED evidence

All behavior changes were tested before their implementation.

| Command | Expected/observed RED result |
| --- | --- |
| `npm run build && npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "hands off the default Popular Models selection\|keeps only the current prototype radar instance\|reserves a real 32px legend-to-spiderweb gap\|reuses quick comparison outside Compare\|keeps every prototype selected-model action"` | Build passed; the target suite was red: selected action bounds were below 44px and the Popular handoff arrived at `/compare` with its query removed. |
| `npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "exposes the exact six capability rows"` | Red: no `details` element containing `Exact capability values` existed in a prototype quick panel. |
| `npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "keeps only the current prototype radar instance"` | Red: expected one live radar instance, received two. |
| `npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "reserves a real 32px legend-to-spiderweb gap"` | Red under real Chart.js: expected at least 31px, received 10px. |
| `npm run build && TOKENBENCH_BROWSER_ASSET_MODE=production npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "hands off the default Popular Models selection"` | Red after the handoff implementation review: `#compare-cost-label` was absent, catching the incorrect static blended-cost label for per-task fixtures. |

## GREEN evidence

| Command | Result |
| --- | --- |
| `npm test -- src/pages/popular-models-page.test.tsx scripts/make-it-yours-preview.test.ts scripts/preview-navigation-links.test.ts` | PASS: 3 files, 11 tests. |
| `npm run build` | PASS. Vite completed successfully; only the pre-existing chunk-size advisory was emitted. |
| `TOKENBENCH_BROWSER_ASSET_MODE=production npx playwright test --config=playwright.production.config.ts browser-tests/responsive-browser.ts -g "reuses quick comparison outside Compare\|hands off the default Popular Models selection\|exposes the exact six capability rows\|keeps only the current prototype radar instance\|reserves a real 32px legend-to-spiderweb gap\|keeps every prototype selected-model action\|dedicated compare layout and route\|keeps the dedicated preview comparison responsive\|ships a raw crawlable compare hub in the Vite/source suite\|does not mount the legacy calculator"` | PASS: 8 passed, 2 intentionally skipped React hub tests in production mode. |
| `npx playwright test --config=playwright.config.ts browser-tests/responsive-browser.ts -g "ships a raw crawlable compare hub in the Vite/source suite"` | PASS: 1 Vite/source React hub test. |
| `npm run lint` | PASS: `tsc --noEmit`. |
| `git diff --check` | PASS: no whitespace errors. |

The full `npm run test:browser:production` command was also run. It reached
the full 90-test production file but remained red on inherited React-home and
source-suite assertions against the preview root (for example the React Home
CTA, home mega-menu, footer signup, and hydration-matrix Home cases). The
reviewed Compare contract itself is clean in the focused production command
above; the full-suite failures are not in the six-finding file surface and are
recorded as a residual concern for the controller.

## Files changed

- `browser-tests/responsive-browser.ts`
- `prototypes/ui-revamp-3/common.js`
- `prototypes/ui-revamp-3/compare.html`
- `prototypes/ui-revamp-3/data.js`
- `prototypes/ui-revamp-3/index.html`
- `prototypes/ui-revamp-3/make-it-yours.js`
- `prototypes/ui-revamp-3/styles.css`
- `src/index.css`

## Self-review

- The diff stays within the approved preview file map plus the explicitly
  permitted prototype fixture/catalog source.
- The Popular fixture models are not aliases: their IDs and names are exact,
  unsupported fields render as unavailable, and no new color literal was
  introduced (the two existing provider colors are reused).
- React's existing bottom-legend implementation remains untouched; prototype
  radar spacing is handled by an independent Chart.js layout plugin.
- The quick-comparison table alternative is native `details` plus real table
  semantics and retains the existing mobile metric-card view.
- The `/compare` production route is tested only as the prototype, while the
  React compare-hub test remains executable under Vite/source mode.
- No generated build artifact, production route constant, deployment command,
  or unrelated source file is included.

## Residual concerns

- The complete production browser file has existing non-Compare source/home
  expectations that do not match the preview-root workbench routing. The
  targeted `/compare` production gate and retained Vite/source React hub gate
  both pass; broader suite ownership remains for controller triage.
