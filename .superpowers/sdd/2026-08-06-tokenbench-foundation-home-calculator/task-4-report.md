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
