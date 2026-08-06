# Task 4 report — Verified comparison price-route selection

## Status

Completed from base `32ef227` on `feat/tokenbench-compare-pricing`.

## Scope

- Added a pure comparison route selector that returns every source-backed,
  non-conflicting route and selects a default without requiring input, cached,
  or output rates to be present.
- Applied the specified precedence: primary verification, non-router catalog
  route identifiers, newest referenced source observation, then UTF-8 binary
  route ID.
- Preserved source identity as `sourceId + sourceArtifactId`, so equal artifact
  names from different sources cannot overwrite each other.
- Projected the selected route ID and complete published route facts into SSR,
  and made hydration rederive the same source-backed order before accepting the
  payload.
- Added focused SSR, targeted D1, contract, and pure-selection coverage. Canonical
  redirects and noindex handling remain covered by the existing route tests.

## TDD evidence

Initial focused baseline:

```text
npm test -- src/frontend/comparison-contracts.test.ts functions/compare/'[pair]'.test.ts functions/compare/'[pair]'.targeted.test.ts

Test Files  3 passed (3)
Tests       34 passed (34)
```

RED 1 — selected route and source-artifact filtering:

```text
Test Files  2 failed | 1 passed (3)
Tests       2 failed | 34 passed (36)
```

The SSR payload retained an unresolved artifact and had no selected route; the
hydration parser accepted a selected route that did not exist in its group.

GREEN 1:

```text
Test Files  3 passed (3)
Tests       36 passed (36)
```

RED 2 — precedence by source observation and router fallback:

```text
Test Files  2 failed | 2 passed (4)
Tests       3 failed | 37 passed (40)
```

The selector sorted by route ID before `observedAt`, and hydration accepted only
the prior generic price ordering.

GREEN 2:

```text
Test Files  4 passed (4)
Tests       40 passed (40)
```

RED 3 — source-scoped artifact identity:

```text
Test Files  2 failed (2)
Tests       2 failed | 4 passed (6)
```

Two sources sharing an artifact ID caused the direct route to be dropped.

Final GREEN verification:

```text
npm test -- src/benchmarks/comparison-pricing.test.ts src/frontend/comparison-contracts.test.ts functions/compare/'[pair]'.test.ts functions/compare/'[pair]'.targeted.test.ts

Test Files  4 passed (4)
Tests       42 passed (42)

npm run lint

tsc --noEmit
```

## Full-suite note

`npm test` currently has 5 failures outside this task's diff:

- Four `src/frontend/comparison-page.test.tsx` assertions still expect the
  previous compare-hub heading/revision/options behavior.
- One `src/frontend/app-shell.test.tsx` assertion still expects the previous
  calculator result heading.

The run otherwise reports 54 passing test files and 640 passing tests. These
files are not owned or modified by Task 4, so they remain a residual baseline
issue rather than being changed in this scoped task.

## Self-review

- Route sorting copies its input and uses explicit source observations, so it
  does not depend on caller order or invent a timestamp on a price check.
- Only `primary` and `corroborating` source-backed evidence is retained;
  conflicting, missing, and source-mismatched artifacts are excluded.
- Partial `null` rates and all published context, limit, modality, parameter,
  provider, route, and verification fields pass through unchanged.
- The SSR and hydration boundaries share the same selector, including the
  source-scoped identity key; forged selected IDs and reordered route arrays are
  rejected before hydration.
- `git diff --check` passed. Changes are limited to the Task 4 files and this
  requested report; `progress.md` and Task 5 files were not modified.
