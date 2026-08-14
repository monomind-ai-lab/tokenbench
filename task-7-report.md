# Task 7 — SLA and Custom Leaderboards

## RED evidence

Command:

```text
npx vitest run src/frontend/sla-leaderboard.test.tsx src/frontend/custom-leaderboard.test.tsx src/benchmarks/custom-leaderboard.test.ts
```

Result: failed as expected because the three new production modules could not be resolved. The follow-up page/SSR RED run also failed in the prior unavailable-category branch, proving that SLA/custom source evidence had not yet been rendered by the canonical facade.

## GREEN evidence

Command:

```text
npx vitest run src/frontend/sla-leaderboard.test.tsx src/frontend/custom-leaderboard.test.tsx src/benchmarks/custom-leaderboard.test.ts src/pages/leaderboards-page.test.tsx 'functions/leaderboards/[[path]].test.ts'
```

Result: 5 test files passed; 40 tests passed; 0 failed. This covers SLA boundaries and incomplete evidence, zero-sum refusal, exact six-domain contribution totals, Apply-only share state, canonical page projection, and no-JS SSR results.

Command:

```text
npm run lint
git diff --check
```

Result: `tsc --noEmit` emitted no diagnostics after the final type-guard fixes, and `git diff --check` completed without whitespace errors.

## Delivered behavior

- SLA uses the published TTFT and throughput values verbatim, keeps a missing value incomplete, offers paired range/number controls, previews drafts locally, and only updates browser/share analytics state when Apply is used. Cards, eligibility and per-metric tables, dual horizontal bars, source timestamps, conditions, compare actions, and inspection are all available together.
- Custom ranking accepts only six bounded integer weights, rejects a zero sum, normalizes throughput across the eligible published set, lists each weighted contribution, and excludes only records missing a positively weighted domain. Equalize/reset, a sum indicator, and a validated share URL are available without a server-side mutation.
- The canonical Pages Function serves bounded GET submissions for `/leaderboards/sla/` and `/leaderboards/custom/`, embeds read-only published evidence for SSR/hydration, retains canonical base URLs, and makes no production data mutations.
