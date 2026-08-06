# Task 4 report — visual leaderboard index

## Scope delivered

- Replaced the static leaderboard directory opening with the exact `Model leaderboards` H1 and approved description.
- Added decision-ready previews before the full directory for BenchAlign, Agent, Coding, Reasoning, Multimodal, and Knowledge.
- Each populated preview exposes rank, provider mark and name, score/unit, supported-evidence label, semantic update time, and a full benchmark link. Empty categories explicitly say `No supported ranking is published.`
- BenchAlign cards are visibly and textually marked as rankings; the other five cards are marked as evidence lenses rather than BenchAlign rankings.
- Kept the full directory grouped and used concise navigation labels, without repeating `AI model` in its card titles.
- Added the BenchAlign methodology link, loading/stale/unavailable handling, and supported-only summary rendering. No artwork slot or estimated badge was introduced.
- Aligned crawlable static metadata and generated HTML with the exact directory H1 and description.

Home and `progress.md` were not modified.

## TDD evidence

1. Added `src/pages/leaderboards-page.test.tsx` before implementation and ran:

   ```sh
   npm test -- src/pages/leaderboards-page.test.tsx
   ```

   It failed against the prior static `AI model leaderboards` directory.

2. Updated the existing directory label expectation before changing production code, then ran:

   ```sh
   npm test -- src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx
   ```

   It failed because the previous directory did not provide the required H1 or decision previews.

3. Added stale, empty, and loading expectations; temporarily removed each matching branch to confirm RED, then restored the smallest implementation and confirmed GREEN.

4. Added static-shell metadata and generated-page expectations before changing their implementation; the old `AI model leaderboards` static H1 failed, then passed after the update.

## Final verification

Passed:

```sh
npm test -- src/pages/leaderboards-page.test.tsx src/frontend/leaderboard-table.test.tsx src/frontend/use-benchmarks.test.ts src/seo/metadata.test.ts scripts/generate-static-pages.test.ts
# 5 files, 123 tests passed

npm run lint

npm run build
```

The build regenerated the crawlable directory and completed successfully. The generated `/leaderboards/` shell contains the exact H1 and approved description.

Manual in-app browser review used a valid published-summary fixture and confirmed:

- 1440px: three preview columns, full cards, distinction between ranking and lens cards, and no horizontal overflow in dark and light themes.
- 375px: one preview column, readable card facts and method link, and no horizontal overflow in dark and light themes.
- Semantic review: six named preview regions, provider marks plus textual providers, `time[datetime]` update values, full-view links, and the full directory after the previews.

The focused static-runtime Playwright case was also run for the leaderboard route. The broad browser harness currently stops first at an unrelated calculator-range control assertion at 320px.

## Known unrelated baseline failures

The full `npm test` run reports four failures in `src/frontend/comparison-page.test.tsx`. Those tests expect the older compare-hub heading and controls (`Compare AI models`), while the checked-in comparison component renders `Compare models side by side`; no comparison source or test files are part of this task.

## Files changed

- `src/pages/leaderboards-page.tsx`
- `src/pages/leaderboards-page.test.tsx`
- `src/frontend/leaderboard-table.test.tsx`
- `src/index.css`
- `src/seo/metadata.ts`
- `src/seo/metadata.test.ts`
- `scripts/generate-static-pages.ts`
- `scripts/generate-static-pages.test.ts`
- `browser-tests/responsive-browser.ts`
