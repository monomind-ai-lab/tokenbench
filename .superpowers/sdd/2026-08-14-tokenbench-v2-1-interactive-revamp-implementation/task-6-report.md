# Task 6 — Leaderboard Overview, Category Routes, and Vertical Index

## RED evidence

Command:

```text
npx vitest run src/benchmarks/v21-leaderboards.test.ts src/frontend/charts/leaderboard-vertical-chart.test.tsx src/pages/leaderboards-page.test.tsx 'functions/leaderboards/[[path]].test.ts'
```

Result: failed as expected before the implementation. Vitest could not resolve the absent V2.1 category facade, vertical chart, or category Pages Function. The added overview test also failed because the V2.1 overview region did not exist.

Additional RED checks covered the new canonical static entries, Cards/Table compare-action parity, and legacy nested SSR redirects/noindex support route before their respective implementations.

## GREEN evidence

Command:

```text
npx vitest run src/benchmarks/v21-leaderboards.test.ts src/frontend/charts/leaderboard-vertical-chart.test.tsx src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx 'functions/leaderboards/[[path]].test.ts' src/routing/routes.test.ts
```

Result: 6 test files passed; 95 tests passed; 0 failed.

Command:

```text
npm run lint
```

Result: `tsc --noEmit` completed with exit code 0.

Command:

```text
git diff --check
```

Result: completed with no whitespace errors.

## Delivered behavior

- Canonical V2.1 category definitions and Top 20 projections, including explicit unavailable Math and SLA states rather than borrowed scores.
- Seven-card overview with definition, source version, evidence state, timestamped compact model lists, profile links, and canonical category links.
- V2.1 category pages with a 0–100 Chart.js vertical index, integer in-bar labels, 55-degree chart labels, provider color/text, reasoning markers, Cards/Table parity, compare actions, and methodology/evidence.
- Canonical category static routes; equivalent legacy nested routes redirect; non-equivalent source lenses remain noindex support routes.
- Category SSR reads the active complete snapshot, renders the default Top 20 before JavaScript, embeds validated initial data, and uses a noindex 503 document when no valid revision is available. The client hook reuses the embedded envelope without an initial duplicate request.

## Fix round 1 — honest overview loading state

### RED evidence

Command:

```text
npx vitest run src/pages/leaderboards-page.test.tsx -t 'shows an overview loading skeleton without unavailable category copy before the summary resolves'
```

Result: failed as expected before the production change. With the summary request held pending, the overview could not find `Loading leaderboard overview` and rendered the category unavailable copy instead.

### GREEN evidence

Command:

```text
npx vitest run src/pages/leaderboards-page.test.tsx -t 'shows an overview loading skeleton without unavailable category copy before the summary resolves'
```

Result: 1 test passed. The overview now exposes an accessible `Loading leaderboard overview` skeleton while the summary request remains pending and does not show category-level unavailable copy.

Command:

```text
npx vitest run src/pages/leaderboards-page.test.tsx -t 'V2.1 overview|overview loading'
```

Result: 2 focused overview tests passed.

Command:

```text
npx vitest run src/benchmarks/v21-leaderboards.test.ts src/frontend/charts/leaderboard-vertical-chart.test.tsx src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx 'functions/leaderboards/[[path]].test.ts' src/routing/routes.test.ts
```

Result: 6 test files passed; 96 tests passed; 0 failed.

Command:

```text
npm run lint
```

Result: `tsc --noEmit` completed with exit code 0.

### Delivered behavior

- The V2.1 overview renders the labeled loading skeleton until the summary resolves.
- Overview cards, including true missing-category evidence, render only for resolved ready or stale summary states.
