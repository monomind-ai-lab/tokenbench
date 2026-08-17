# Task 7 — Articles React migration report

## Status

Implemented, independently reviewed, and verified. No deployment was performed.

## Implementation summary

- Added the discriminated `Article` model (`ArticleChannel`, `ARTICLE_BY_SLUG`, canonical paths, related records) covering five source-backed guides, Hybrid Router, two clearly labelled prototype insights, and the empty News channel.
- Added typed React `ArticlesPage` and `ArticleDetailPage` implementations. The index preserves accessible channel tabs (including arrow-key navigation), query-backed channel state, topic filtering, search, sort, an always-accessible reset, and an empty state.
- Migrated all guide body content through the shared detail component and ported the substantive Hybrid Router body: evidence and architecture tables/cards, its illustrative chart text alternative and exact values, decision links, CTAs, related content, and active ToC state.
- Moved article index/detail delivery to React in the preview manifest. Static documents include shared `PageFrame` header/footer, canonical metadata, Article and BreadcrumbList JSON-LD, and validated lightweight route payloads for hydration without replacing the no-JS body.
- Removed canonical article-detail generation from the legacy guide generator; the manifest/static React document generator is now the sole owner of article documents. The legacy `/guides/` hub remains generated.
- Avoided nested main landmarks in manifest-rendered article documents; the `PageFrame` owns the single `#article-content` main landmark.

## React-delivered routes and migrated records

- `/articles`
- `/articles/hybrid-router/` — `hybrid-router`
- `/articles/track-claude-code-usage/`
- `/articles/monitor-openai-codex-usage/`
- `/articles/openrouter-guide-model-routing-cost-controls/`
- `/articles/legitimate-free-ai-api-access-credits/`
- `/articles/reduce-llm-api-costs-caching-batch-output-limits/`
- `/articles/routing-decision-record/` — prototype insight
- `/articles/model-selection-unknowns/` — prototype insight

Existing `/guides/:slug/` redirects were retained by the routing registry.

## Files changed

- Added `src/articles/content.ts`, `src/articles/content.test.ts`
- Added `src/pages/articles-page.tsx`, `src/pages/articles-page.test.tsx`
- Added `src/pages/article-detail-page.tsx`, `src/pages/article-detail-page.test.tsx`
- Updated `src/guides/content.ts`, `src/frontend/guides-page.tsx`, `src/index.css`
- Updated `src/preview/route-manifest.tsx`, `src/preview/route-manifest.test.tsx`, `src/preview/client-resolver.test.tsx`
- Updated `scripts/generate-guide-pages.ts`, `scripts/generate-guide-pages.test.ts`, `scripts/generate-preview-documents.test.ts`, `scripts/preview-build-routes.test.ts`

## TDD evidence

RED checkpoints:

- `npm test -- src/articles/content.test.ts src/pages/articles-page.test.tsx src/pages/article-detail-page.test.tsx scripts/generate-guide-pages.test.ts`
  - Failed as expected: the unified content and React page modules did not exist.
- `npm test -- src/preview/route-manifest.test.tsx`
  - Failed as expected: Articles and article-detail were prototype-delivered, insight details did not match, and prototype article bundles still existed.
- `npm test -- scripts/generate-guide-pages.test.ts`
  - Failed as expected: the legacy generator still wrote canonical article documents.
- `npm test -- scripts/generate-preview-documents.test.ts`
  - Failed as expected: manifest rendering produced two `<main>` elements; this exposed the duplicate landmark before the component fix.
- `npm test -- src/preview/client-resolver.test.tsx`
  - Failed as expected: article detail mounted rather than hydrated because its validated payload was absent.
- `npm test -- src/pages/article-detail-page.test.tsx`
  - Failed as expected: unified Article JSON-LD did not yet preserve the previous social image field.

GREEN command:

```sh
npm test -- src/articles/content.test.ts src/pages/articles-page.test.tsx src/pages/article-detail-page.test.tsx src/frontend/guides-page.test.tsx src/GuidesApp.test.tsx scripts/generate-guide-pages.test.ts src/preview/route-manifest.test.tsx scripts/generate-preview-documents.test.ts scripts/preview-build-routes.test.ts src/preview/client-resolver.test.tsx src/preview/route-document.test.tsx scripts/preview-route-delivery.test.ts
```

Result: 12 files, 61 tests passed.

## Lint and build

- `npm run lint` — passed (`tsc --noEmit`).
- `npm run build` — passed. The Vite output includes index, Hybrid Router, all five guide articles, and both prototype-insight documents. The existing warning that the shared main chunk exceeds 500 kB remains non-fatal.

## Self-review

- Confirmed every previous guide detail slug plus Hybrid Router maps to the React `article-detail` manifest route.
- Confirmed all related article cards use `/articles/:slug/`, never `/guides/`.
- Inspected generated SSR HTML for PageFrame header/footer, exactly one `main`, Article/BreadcrumbList JSON-LD, Hybrid Router’s full body and text alternative, and the validated `article-initial-data` payload.
- Confirmed no article full body was omitted; guide records reuse their approved source sections and Hybrid Router was explicitly ported.
- `git diff --check` passed. `articles/` and `test-results/` are generated/untracked and are excluded from the commit.
- Independent Task 7 diff review: approved with no critical, important, or minor findings.

## Concerns

- `npm test -- scripts/generate-static-pages.test.ts` has one known, unrelated Task 6-era failure: it expects the old exact Home string `<h1>Transparent AI Costs. Verified Benchmarks.</h1>`, while the completed React Home SSR emits `<h1 id="home-hero-heading">…</h1>`. Per coordination direction, this test was not changed for Task 7.
- No Task 7 content-conversion concerns.
