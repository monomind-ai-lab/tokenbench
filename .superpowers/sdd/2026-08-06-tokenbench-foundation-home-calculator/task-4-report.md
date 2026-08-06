# Task 4 report — Guided Subscribe vs API experience

## Status

Completed from base `55a7592`.

## Scope

- Reworked the dedicated calculator route into the four approved guided steps, including the approved header and collapsible semantic overview.
- Added entitlement warnings, provider/model marks, compact model-mix controls, plain-language recommendations, assumptions, and unavailable-fact explanations.
- Hydrated valid shared calculator state once after the catalog is ready; normalized recovered partial state once; kept normal interactions from mutating the address bar; added sharing and the mobile result-focus action.
- Added route-level coverage for guidance, eligibility, positive/zero/negative/unavailable recommendations, hydration, recovery, sharing, and result focus.

## TDD evidence

RED:

```text
npm test -- src/main.test.tsx src/frontend/app-shell.test.tsx

Test Files  1 failed | 1 passed (2)
Tests       8 failed | 29 passed (37)
```

The failures showed the missing approved heading/steps, recommendation copy, hydration/recovery behavior, and Share action before implementation.

GREEN:

```text
npm test -- src/main.test.tsx src/frontend/app-shell.test.tsx

Test Files  2 passed (2)
Tests       38 passed (38)
```

Focused calculator regression:

```text
npm test -- src/main.test.tsx src/frontend/calculator-state.test.ts src/catalog/calculator.test.ts

Test Files  3 passed (3)
Tests       18 passed (18)
```

Full verification:

```text
npm test

Test Files  48 passed (48)
Tests       558 passed (558)

npm run lint

tsc --noEmit
```

## Self-review

- `recommendCostFirst` eligibility gates every recommendation; variable, guardrail, credit-based, missing-plan, and unsupported-model results cannot be labelled subscription-cheaper.
- Shared state is applied only after catalog readiness behind `appliedSharedStateRef`; canonical recovery happens only for decoder-normalized state, and provider changes do not replace the URL.
- `git diff --check` passed. Changes are limited to the approved calculator/UI/test files plus this requested report.

## Review fix round 1

### Outcome and files

- `src/frontend/results-dashboard.tsx`: reused the recommendation eligibility result to gate all comparison metrics. Caveated outcomes now show a neutral “Estimated difference,” unavailable breakeven/efficiency, and no chart breakeven marker.
- `src/frontend/calculator-share-state.ts`: validates shared plan IDs with `isPaidIndividualPlan`, so catalogued free/team plans normalize to an empty selection before hydration.
- `src/frontend/app-shell.test.tsx`: covers ineligible metric presentation and free/team URL hydration/canonicalization; the existing savings-panel test now uses an explicitly eligible plan.
- `src/frontend/calculator-share-state.test.ts`: covers paid-individual normalization at the decoder boundary.
- `.superpowers/sdd/2026-08-06-tokenbench-foundation-home-calculator/task-4-report.md`: records this review-fix cycle and its verification evidence.

### RED evidence

Ineligible result metrics:

```text
npm test -- src/frontend/app-shell.test.tsx

Test Files  1 failed (1)
Tests       1 failed | 33 passed (34)
```

The new regression could not find “Estimated difference”; the ineligible rolling plan still exposed “Est. Monthly Savings,” a positive `$30.00`, `+60%` efficiency, and a `4.0M` breakeven marker.

Free/team shared plans:

```text
npm test -- src/frontend/calculator-share-state.test.ts src/frontend/app-shell.test.tsx

Test Files  2 failed (2)
Tests       4 failed | 45 passed (49)
```

Both decoder cases retained the excluded plan with `wasNormalized: false`, and both hydrated routes kept the non-canonical free/team plan query.

### GREEN evidence

Metric regression:

```text
npm test -- src/frontend/app-shell.test.tsx

Test Files  1 passed (1)
Tests       34 passed (34)
```

Decoder and hydration regressions:

```text
npm test -- src/frontend/calculator-share-state.test.ts src/frontend/app-shell.test.tsx

Test Files  2 passed (2)
Tests       49 passed (49)
```

Fresh combined verification:

```text
npm test -- src/main.test.tsx src/frontend/app-shell.test.tsx src/frontend/calculator-share-state.test.ts src/frontend/calculator-state.test.ts src/frontend/plan-filter.test.ts src/catalog/calculator.test.ts

Test Files  6 passed (6)
Tests       68 passed (68)

npm run lint

tsc --noEmit
```

### Self-review

- `comparisonAvailable` comes from the same `recommendCostFirst` caveat decision as the result sentence; raw snapshot savings, breakeven, and efficiency remain intact for calculation consumers but cannot imply savings in an ineligible UI state.
- Eligible fixed-token subscription/API/zero-difference cases retain the original savings label and values; the trend marker is hidden only when comparison eligibility is unavailable.
- Shared decoding imports the existing `isPaidIndividualPlan` predicate, preserving a single plan-eligibility boundary. Normalization keeps valid provider, model mix, input split, and token volume while clearing only free/team plan IDs.
