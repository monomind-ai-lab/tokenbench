# Task 11 — Cross-Page QA, Impeccable Corrections, and Build Restoration

## Outcome

Restored the V2.1 static-generation/build contract and completed the bounded cross-page QA correction batch. The implementation replaces unsafe hydration of non-isomorphic generated article shells, supplies factual metadata for owned leaderboard routes, keeps generated ownership explicit, corrects the audited compact targets/eyebrows/side-tab treatments, preserves print evidence, and adds deterministic responsive browser coverage.

Commit: recorded in the Task 11 handoff because this report is committed with the implementation and cannot safely self-reference its future commit SHA.

## RED → GREEN evidence

- **Hydration:** temporarily retaining `hydrateRoot` for non-isomorphic article shells made `src/main.test.tsx` fail **5** checks. Reinstating the route-specific `createRoot` replacement returned its focused suite to **28/28** passing.
- **Static generation:** temporarily withholding leaderboard route metadata made the static generator fail **8** checks at `metadata.h1`. Supplying the category/SLA/custom metadata and ownership treatment returned the focused static-generator suite to **23/23** passing.
- **Compact chart containment:** the Models Pareto CSS containment assertion was added and observed RED before the min-width/grid and compact-heading corrections; the final CSS contract is **6/6** passing.
- **Final required matrix:** `npx vitest run scripts/generate-static-pages.test.ts src/index.css.test.ts src/pages/articles-page.test.tsx src/pages/insights-page.test.tsx src/frontend/guides-page.test.tsx src/frontend/app-shell.test.tsx src/routing/routes.test.ts src/seo/metadata.test.ts` — **8 files, 103 tests passed**.

## Browser and visual confirmation

- `env -u FORCE_COLOR -u NO_COLOR npx playwright test browser-tests/responsive-browser.ts --grep 'V2.1 release contract'` — **2/2 passed in 45.7s**.
- The release contract confirms the representative Articles, Guides, Insights, Cost calculator/breakeven, Models, Leaderboards, Compare, and canonical pair surfaces across 320, 375, 768, 1024, and 1440 widths and light/dark themes: one visible H1/main, no document overflow, compact navigation, changed target sizes, keyboard focus, deterministic fallback states, and no console/page errors.
- The same pass confirms print behavior: written/table evidence remains while menus and interactive-only controls do not print. Passing Playwright runs do not retain screenshots; the deterministic browser assertions are the recorded confirmation evidence.

## Final verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed (`tsc --noEmit`) |
| `npm run build` | Passed; generated **52** crawlable fixed pages |
| `git diff --check` | Passed |

## Scoped files

- Static generation and ownership: `.gitignore`, `scripts/generate-static-pages.ts`, `scripts/generate-static-pages.test.ts`, `scripts/generate-guide-pages.ts`.
- Runtime, route, metadata, and SSR contract: `src/main.tsx`, `src/main.test.tsx`, `src/App.tsx`, `src/routing/routes.ts`, `src/seo/metadata.ts`, `src/seo/metadata.test.ts`, and the affected page components/tests.
- Audit and responsive corrections: `src/index.css`, `src/index.css.test.ts`, `src/v21-eyebrow-contract.test.ts`, affected editorial/chart components/tests, and `browser-tests/responsive-browser.ts`.

## Generated-file exclusion and residual risk

- `index.html`, `public/sitemaps/static.xml`, and untracked legacy `articles/` pages were intentionally preserved but not staged: they are generated or pre-existing user work outside this commit.
- Build emits only Vite's existing large-chunk advisory (`main.js` is over 500 kB after minification). It is not a release-blocking error and no broad code-splitting rewrite was included in this bounded QA batch.
- No production resources, deployment, domains, D1/R2, migrations, stash, or external credentials were changed.
