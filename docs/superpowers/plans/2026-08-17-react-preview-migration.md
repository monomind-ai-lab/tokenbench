# React Preview Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prototype-delivered navigation and footer destinations with React-owned, deep-linkable pages while preserving the approved UI, route behavior, semantic fallbacks, and legacy redirects.

**Architecture:** A typed preview-route manifest becomes the single source for URLs, metadata, shell configuration, static data, page factories, and transitional `prototype | react` delivery. Build-time React rendering and browser hydration use the same page tree. Data-heavy pages consume `ui-data-contract/v1` through a narrow adapter, so frontend work can proceed against representative fixtures while the D1/R2 pipeline evolves independently.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, React DOM server rendering/hydration, Chart.js 4 where retained, Vitest, Testing Library, Playwright, Cloudflare Pages/Functions.

## Global Constraints

- Work only in `/Users/daren/AgentWorkSpace/tokenbench/.worktrees/ui-revamp-3`; preserve all unrelated dirty-worktree changes.
- In-scope routes are `/`, `/models`, `/model-profile?model=:slug`, `/model-lifecycle`, `/popular-models/`, `/make-it-yours/`, `/compare`, `/subscribe-vs-api`, `/articles`, current `/articles/:slug/` pages, and `/llm-price-performance/`.
- Legacy `/cost*`, `/guides/*`, and other out-of-scope compatibility routes remain redirects; never create duplicate React pages for them.
- Keep the approved design tokens, global navigation/footer, theme/language behavior, Google Translate suppression, current query keys, exports, semantic result tables, and no-JavaScript content.
- Never expose D1 rows, R2 objects, ingestion internals, or prototype globals to page components.
- Do not publish unlicensed LiveBench data. Unsupported or stale facts render explicit availability, provenance, and effective-time states.
- A route remains `delivery: 'prototype'` until its React behavior, accessibility, metadata, direct-load, and responsive parity gates pass.
- Do not deploy unless the user explicitly requests deployment after QA.

---

### Task 1: Make the typed preview manifest authoritative

**Files:**
- Create: `src/preview/route-types.ts`
- Create: `src/preview/route-manifest.tsx`
- Create: `src/preview/route-manifest.test.tsx`
- Modify: `src/routing/routes.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/frontend/app-shell.tsx`

**Interfaces:**
- Produces: `PreviewRouteId`, `PreviewRouteMatch`, `PreviewRoute`, `matchPreviewRoute(url)`, `previewStaticEntries()`, and typed `previewPaths` link helpers.
- Consumes: `PageMetadata`, `SiteNavigationPage`, `GUIDES`, and existing React page factories that already exist.

- [ ] **Step 1: Write failing manifest and link-ownership tests**

```tsx
it.each([
  ['https://tokenbench.test/', 'home'],
  ['https://tokenbench.test/model-profile?model=gpt-4o', 'model-profile'],
  ['https://tokenbench.test/articles?channel=guides', 'articles'],
  ['https://tokenbench.test/subscribe-vs-api?seats=12', 'subscribe-vs-api'],
])('matches %s as %s without dropping search state', (href, routeId) => {
  const match = matchPreviewRoute(new URL(href));
  expect(match?.routeId).toBe(routeId);
  expect(match?.search.toString()).toBe(new URL(href).searchParams.toString());
});

it.each(['/cost', '/cost/calculator', '/guides/track-claude-code-usage/'])(
  'does not register legacy URL %s as a preview page',
  (pathname) => expect(matchPreviewRoute(new URL(pathname, 'https://tokenbench.test'))).toBeNull(),
);
```

- [ ] **Step 2: Run the focused tests and confirm the missing-module failure**

Run: `npm test -- src/preview/route-manifest.test.tsx src/routing/routes.test.ts`

Expected: FAIL because `src/preview/route-manifest.tsx` and its exported APIs do not exist.

- [ ] **Step 3: Implement manifest types and transitional delivery**

```ts
export type PreviewRouteId =
  | 'home' | 'models' | 'model-profile' | 'model-lifecycle'
  | 'popular-models' | 'make-it-yours' | 'compare'
  | 'subscribe-vs-api' | 'articles' | 'article-detail'
  | 'llm-price-performance';

export interface PreviewRoute {
  readonly id: PreviewRouteId;
  readonly match: (url: URL) => PreviewRouteMatch | null;
  readonly outputPathname: string;
  readonly delivery: 'prototype' | 'react';
  readonly shell: {
    readonly activePage: SiteNavigationPage;
    readonly skipLinkTarget: string;
    readonly skipLinkLabel: string;
  };
  readonly metadata: (match: PreviewRouteMatch) => PageMetadata;
  readonly structuredData: (match: PreviewRouteMatch) => readonly unknown[];
  readonly staticData: (match: PreviewRouteMatch) => Promise<unknown | undefined>;
  readonly payload: PreviewPayloadDefinition | null;
  readonly Page: ComponentType<PreviewPageProps>;
}
```

Move current preview destinations from `PREVIEW_ROUTE_PATHS` and current prototype bundle output paths into this manifest. Generate article-detail entries from `GUIDES`. Keep every newly registered route at `delivery: 'prototype'` until its later task passes.

- [ ] **Step 4: Run route, metadata, and shell-link tests**

Run: `npm test -- src/preview/route-manifest.test.tsx src/routing/routes.test.ts src/frontend/app-shell.test.tsx`

Expected: PASS; each approved URL has one manifest owner, each article has one static entry, query/hash state survives matching, and legacy paths have no manifest page.

- [ ] **Step 5: Commit the manifest slice**

```bash
git add src/preview/route-types.ts src/preview/route-manifest.tsx src/preview/route-manifest.test.tsx src/routing/routes.ts src/routing/routes.test.ts src/frontend/app-shell.tsx
git commit -m "refactor: centralize preview route ownership"
```

**Reviewer gate:** Reject if a second preview route table remains in `app-shell.tsx`, if legacy routes enter the manifest, or if any route flips to React delivery before its page exists.

---

### Task 2: Extract one server-safe React page frame

**Files:**
- Create: `src/frontend/page-frame.tsx`
- Create: `src/frontend/page-frame.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/GuidesApp.tsx`
- Modify: `src/frontend/app-shell.tsx`
- Modify: `src/frontend/app-shell.test.tsx`

**Interfaces:**
- Consumes: `PreviewRoute['shell']`, `CatalogState`, `AppShell`, and `useSitePreferences`.
- Produces: `PageFrame({ children, shell, catalogState, contentWrapper })` for every React preview page and server render.

- [ ] **Step 1: Write the failing deterministic-shell test**

```tsx
it('renders one shared header, main target, and footer from manifest shell data', () => {
  render(<PageFrame shell={route.shell}><h1>React preview</h1></PageFrame>);
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveAttribute('id', route.shell.skipLinkTarget);
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: route.shell.skipLinkLabel })).toHaveAttribute('href', `#${route.shell.skipLinkTarget}`);
});
```

- [ ] **Step 2: Run focused tests and confirm `PageFrame` is missing**

Run: `npm test -- src/frontend/page-frame.test.tsx src/frontend/app-shell.test.tsx src/GuidesApp.test.tsx`

Expected: FAIL because `src/frontend/page-frame.tsx` does not exist.

- [ ] **Step 3: Move the private frame out of `App.tsx`**

```tsx
export function PageFrame({ children, shell, catalogState, contentWrapper = 'main' }: PageFrameProps) {
  const preferences = useSitePreferences();
  return <AppShell
    theme={preferences.theme}
    language={preferences.language}
    activePage={shell.activePage}
    skipLinkTarget={shell.skipLinkTarget}
    skipLinkLabel={shell.skipLinkLabel}
    onThemeToggle={preferences.toggleTheme}
    onLanguageChange={preferences.changeLanguage}
    catalogPhase={catalogState?.phase}
    notice={catalogState?.notice}
    error={catalogState?.error}
    onRetry={catalogState?.retry}
    contentWrapper={contentWrapper}
  >{children}</AppShell>;
}
```

Use deterministic initial preferences already supplied by `useSitePreferences` so `renderToString` and hydration agree. Preserve `contentWrapper="none"` for article layouts that already provide their own `<main>`.

- [ ] **Step 4: Run frame and existing application tests**

Run: `npm test -- src/frontend/page-frame.test.tsx src/frontend/app-shell.test.tsx src/App.test.tsx src/GuidesApp.test.tsx`

Expected: PASS with one shared shell and no duplicate header/footer markup.

- [ ] **Step 5: Commit the frame extraction**

```bash
git add src/frontend/page-frame.tsx src/frontend/page-frame.test.tsx src/App.tsx src/GuidesApp.tsx src/frontend/app-shell.tsx src/frontend/app-shell.test.tsx
git commit -m "refactor: share React preview page frame"
```

**Reviewer gate:** Reject if any new React preview page hand-builds navigation/footer HTML or bypasses `useSitePreferences`.

---

### Task 3: Define `ui-data-contract/v1` and fixture adapter

**Files:**
- Create: `src/frontend/preview-data/contracts.ts`
- Create: `src/frontend/preview-data/adapter.ts`
- Create: `src/frontend/preview-data/fixture-adapter.ts`
- Create: `src/frontend/preview-data/fixture-adapter.test.ts`
- Create: `src/frontend/preview-data/fixtures.ts`

**Interfaces:**
- Produces: `EvidenceValue<T>`, `Provenance`, `UiDataContractV1<T>`, typed page data models, and `PreviewDataAdapter` methods for models, profiles, lifecycle, rankings, comparisons, and subscriptions.
- Consumes: only licensed/manual representative facts already present in the approved preview. It never consumes DOM globals.

- [ ] **Step 1: Write failing availability, staleness, and timestamp tests**

```ts
it('preserves unavailable facts instead of inventing values', async () => {
  const result = await fixtureAdapter.lifecycle({ horizonDays: 90 });
  expect(result.contractVersion).toBe('ui-data-contract/v1');
  expect(result.data?.models[0]?.replacement).toEqual({
    availability: 'unavailable',
    reason: 'No approved replacement source',
  });
});

it('keeps fetched and mixed effective times distinct', async () => {
  const result = await fixtureAdapter.comparison({ modelIds: ['gpt-4o', 'deepseek-v3'] });
  expect(result.fetchedAt).toMatch(/Z$/);
  expect(new Set(result.provenance.map((source) => source.effectiveAt)).size).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run adapter tests and confirm missing exports**

Run: `npm test -- src/frontend/preview-data/fixture-adapter.test.ts`

Expected: FAIL because the contract and fixture adapter modules do not exist.

- [ ] **Step 3: Implement the contract and narrow adapter**

```ts
export type EvidenceValue<T> =
  | { readonly availability: 'available'; readonly value: T; readonly provenance: Provenance }
  | { readonly availability: 'unavailable'; readonly reason: string; readonly provenance?: Provenance };

export interface UiDataContractV1<T> {
  readonly contractVersion: 'ui-data-contract/v1';
  readonly status: 'available' | 'partial' | 'unavailable';
  readonly fetchedAt: string;
  readonly effectiveAt: string | null;
  readonly data: T | null;
  readonly provenance: readonly Provenance[];
}

export interface PreviewDataAdapter {
  models(query: ModelDirectoryQuery): Promise<UiDataContractV1<ModelDirectoryData>>;
  profile(slug: string): Promise<UiDataContractV1<PreviewModelProfileData>>;
  lifecycle(query: LifecycleQuery): Promise<UiDataContractV1<LifecycleData>>;
  rankings(query: RankingQuery): Promise<UiDataContractV1<RankingData>>;
  comparison(query: CompareQuery): Promise<UiDataContractV1<CompareData>>;
  subscription(query: SubscriptionQuery): Promise<UiDataContractV1<SubscriptionData>>;
}
```

Model identity/access, benchmark releases/subtasks, route/cache pricing, task economics, plans, runtime SLA, and lifecycle/replacement facts are evidence values. Fixture source labels must say `Illustrative prototype data` wherever they are not approved current facts.

- [ ] **Step 4: Run contract tests and TypeScript**

Run: `npm test -- src/frontend/preview-data/fixture-adapter.test.ts && npm run lint`

Expected: PASS; no fixture imports `prototypes/ui-revamp-3/data.js`, current unlicensed LiveBench files, D1, or R2 bindings.

- [ ] **Step 5: Commit the contract slice**

```bash
git add src/frontend/preview-data
git commit -m "feat: define preview UI data contract"
```

**Reviewer gate:** Reject if a missing fact uses zero, an empty string, or a fabricated timestamp instead of an explicit unavailable value.

---

### Task 4: Render React preview documents from the manifest

**Files:**
- Create: `src/preview/route-document.tsx`
- Create: `src/preview/route-document.test.tsx`
- Create: `scripts/generate-preview-documents.ts`
- Create: `scripts/generate-preview-documents.test.ts`
- Create: `scripts/preview-route-delivery.test.ts`
- Create: `scripts/preview-build-routes.test.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `scripts/make-it-yours-preview.ts`
- Modify: `package.json`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `PreviewRoute`, `PreviewRouteMatch`, `PageFrame`, `FRONTEND_ASSETS`, route metadata and structured data.
- Produces: `renderPreviewDocument(route, match, data)`, `generatePreviewDocuments(outputRoot)`, and `previewHtmlEntries(rootDir)`.

- [ ] **Step 1: Write failing document and file-emission tests**

```tsx
it('renders a substantive React shell with metadata and escaped data', async () => {
  const html = renderPreviewDocument(route, match, { label: '</script><script>alert(1)</script>' });
  expect(html).toContain('<header class="top-header"');
  expect(html).toContain('<footer class="app-footer"');
  expect(html).toContain('<link rel="canonical"');
  expect(html).toContain(FRONTEND_ASSETS.script);
  expect(html).not.toContain('</script><script>alert(1)</script>');
});
```

- [ ] **Step 2: Run generator tests and confirm missing renderer failure**

Run: `npm test -- src/preview/route-document.test.tsx scripts/generate-preview-documents.test.ts`

Expected: FAIL because the document renderer and generator do not exist.

- [ ] **Step 3: Implement one React document path**

```tsx
export function renderPreviewDocument(route: PreviewRoute, match: PreviewRouteMatch, data: unknown): string {
  const body = renderToString(<PageFrame shell={route.shell}><route.Page match={match} data={data} /></PageFrame>);
  return documentHtml({
    head: headMarkup(route.metadata(match), route.structuredData(match)),
    body,
    assets: FRONTEND_ASSETS,
    payload: data === undefined ? undefined : { id: route.payload?.id ?? '', value: data },
  });
}
```

`generatePreviewDocuments` writes only manifest entries whose delivery is `react`; prototype entries remain untouched. Article entries are derived from the manifest, not a second hard-coded slug list. Update the transitional copy plugin so it derives prototype outputs from manifest entries with `delivery: 'prototype'`, copies shared prototype assets only while at least one such route exists, and never deletes a manifest-generated React directory.

- [ ] **Step 4: Run document, static-page, and build-input tests**

Run: `npm test -- src/preview/route-document.test.tsx scripts/generate-preview-documents.test.ts scripts/preview-route-delivery.test.ts scripts/preview-build-routes.test.ts scripts/generate-static-pages.test.ts src/seo/static-page.test.ts`

Expected: PASS; React documents contain one shell, canonical metadata, structured data where declared, Vite assets, and a semantic body before JavaScript.

- [ ] **Step 5: Commit the document renderer**

```bash
git add src/preview/route-document.tsx src/preview/route-document.test.tsx scripts/generate-preview-documents.ts scripts/generate-preview-documents.test.ts scripts/preview-route-delivery.test.ts scripts/preview-build-routes.test.ts scripts/generate-static-pages.ts scripts/make-it-yours-preview.ts package.json vite.config.ts
git commit -m "feat: render preview routes with React"
```

**Reviewer gate:** Reject if React pages call `staticChrome`, if prototype delivery can overwrite a React route, or if payload escaping is not covered by a malicious closing-script test.

---

### Task 5: Replace page-specific browser bootstrap branches

**Files:**
- Create: `src/preview/client-resolver.tsx`
- Create: `src/preview/client-resolver.test.tsx`
- Modify: `src/main.tsx`
- Modify: `src/main.test.tsx`

**Interfaces:**
- Consumes: `matchPreviewRoute`, manifest payload parsers, and each manifest page factory.
- Produces: `startPreviewRoute(document, location)` and `HydrationResult`.

- [ ] **Step 1: Write failing hydration-policy tests**

```tsx
it('hydrates valid embedded data with the manifest page', () => {
  expect(startPreviewRoute(document, location)).toEqual({ kind: 'hydrated', routeId: 'popular-models' });
  expect(hydrateRoot).toHaveBeenCalledTimes(1);
});

it('preserves substantive HTML when an embedded payload is malformed', () => {
  payload.textContent = '{bad json';
  expect(startPreviewRoute(document, location)).toEqual({ kind: 'preserved-invalid-payload', routeId: 'popular-models' });
  expect(root.innerHTML).toContain('Server fallback');
  expect(createRoot).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run resolver tests and confirm failure**

Run: `npm test -- src/preview/client-resolver.test.tsx src/main.test.tsx`

Expected: FAIL because `startPreviewRoute` does not exist.

- [ ] **Step 3: Implement explicit hydration results**

```ts
export type HydrationResult =
  | { readonly kind: 'hydrated'; readonly routeId: PreviewRouteId }
  | { readonly kind: 'mounted'; readonly routeId: PreviewRouteId }
  | { readonly kind: 'preserved-invalid-payload'; readonly routeId: PreviewRouteId }
  | { readonly kind: 'unmatched' };
```

Valid embedded data hydrates. Missing data mounts only for routes declared client-load. Present-but-invalid data leaves the existing DOM intact. Move existing profile/comparison/model payload parsers into manifest payload definitions before deleting their special branches.

- [ ] **Step 4: Run resolver, main, guide, and existing SSR tests**

Run: `npm test -- src/preview/client-resolver.test.tsx src/main.test.tsx src/GuidesApp.test.tsx src/seo/static-page.test.ts`

Expected: PASS; `main.tsx` imports CSS and calls the resolver without a pathname switch or special Popular Models root.

- [ ] **Step 5: Commit the unified bootstrap**

```bash
git add src/preview/client-resolver.tsx src/preview/client-resolver.test.tsx src/main.tsx src/main.test.tsx
git commit -m "refactor: unify preview hydration"
```

**Reviewer gate:** Reject if malformed data causes a fetch, clears crawlable HTML, or produces a hydration warning.

---

### Task 6: Cut over Home, Popular Models, and retain Price Performance

**Files:**
- Modify: `src/pages/home-page.tsx`
- Modify: `src/pages/home-page.test.tsx`
- Modify: `src/pages/popular-models-page.tsx`
- Modify: `src/pages/popular-models-page.test.tsx`
- Modify: `src/frontend/popular-models/comparison-workspace.tsx`
- Modify: `src/frontend/popular-models/insights.tsx`
- Modify: `src/preview/route-manifest.tsx`
- Modify: `scripts/make-it-yours-preview.ts`

**Interfaces:**
- Consumes: `PreviewDataAdapter`, existing Home/Popular components, `PageFrame`, and the existing Price Performance route.
- Produces: React delivery for `home` and `popular-models`; Price Performance behavior remains unchanged.

- [ ] **Step 1: Write failing parity tests for Home and Popular Models**

```tsx
it('renders the approved home decision paths and cost preview', () => {
  render(<HomePage data={homeFixture} />);
  expect(screen.getByRole('link', { name: /explore models/i })).toHaveAttribute('href', '/models');
  expect(screen.getByRole('region', { name: /api cost preview/i })).toBeInTheDocument();
});

it('renders Popular Models directly beneath the shared shell', () => {
  render(<PopularModelsRoutePage match={match} data={rankingsFixture} />);
  expect(screen.getByRole('heading', { level: 1, name: /popular models leaderboard/i })).toBeInTheDocument();
  expect(document.querySelector('[data-popular-models-workbench]')).toBeNull();
});
```

- [ ] **Step 2: Run page tests and observe parity failures**

Run: `npm test -- src/pages/home-page.test.tsx src/pages/popular-models-page.test.tsx src/frontend/app-shell.test.tsx`

Expected: FAIL on missing approved Home sections and the hybrid Popular Models mount contract.

- [ ] **Step 3: Port approved behavior and flip two delivery flags**

Move Home filter pills/cost slider to controlled React state. Render Popular Models through `PageFrame`; retain selection, disclosures, charts, semantic tables, exports, fixture labeling, and the rule that the quick-comparison tray stays hidden below two selections. Set only `home` and `popular-models` to `delivery: 'react'`.

```tsx
<PageFrame shell={route.shell}>
  <PopularModelsPage data={data} />
</PageFrame>
```

- [ ] **Step 4: Run focused pages, build-route checks, and Price Performance tests**

Run: `npm test -- src/pages/home-page.test.tsx src/pages/popular-models-page.test.tsx src/pages/price-performance-page.test.tsx scripts/preview-build-routes.test.ts`

Expected: PASS; built Home and Popular routes contain React content and Price Performance output is unchanged.

- [ ] **Step 5: Commit the first route cutover**

```bash
git add src/pages/home-page.tsx src/pages/home-page.test.tsx src/pages/popular-models-page.tsx src/pages/popular-models-page.test.tsx src/frontend/popular-models/comparison-workspace.tsx src/frontend/popular-models/insights.tsx src/preview/route-manifest.tsx scripts/make-it-yours-preview.ts
git commit -m "feat: deliver home and popular models with React"
```

**Reviewer gate:** Reject if Price Performance changes, if illustrative ranking data loses its label, or if copied prototype HTML still owns either flipped route.

---

### Task 7: Migrate Articles index and every current detail page

**Files:**
- Create: `src/articles/content.ts`
- Create: `src/articles/content.test.ts`
- Create: `src/pages/articles-page.tsx`
- Create: `src/pages/articles-page.test.tsx`
- Create: `src/pages/article-detail-page.tsx`
- Create: `src/pages/article-detail-page.test.tsx`
- Modify: `src/guides/content.ts`
- Modify: `src/frontend/guides-page.tsx`
- Modify: `scripts/generate-guide-pages.ts`
- Modify: `scripts/generate-guide-pages.test.ts`
- Modify: `src/preview/route-manifest.tsx`

**Interfaces:**
- Produces: `Article`, `ArticleChannel`, `ARTICLE_BY_SLUG`, `ArticlesPage`, and `ArticleDetailPage`.
- Consumes: current guide content, Hybrid Router content, global Article JSON-LD and metadata contracts.

- [ ] **Step 1: Write failing index/detail route tests**

```tsx
it('filters channels without changing the article pathname', async () => {
  render(<ArticlesPage articles={ARTICLES} initialChannel="guides" />);
  await user.click(screen.getByRole('tab', { name: 'News' }));
  expect(window.location.pathname).toBe('/articles');
  expect(window.location.search).toBe('?channel=news');
});

it.each(ARTICLES)('renders $slug with breadcrumbs, related articles, and Article JSON-LD', (article) => {
  const result = renderArticleRoute(article.slug);
  expect(result.heading).toBe(article.title);
  expect(result.breadcrumbs).toEqual(['Articles', article.channelLabel, article.title]);
  expect(result.jsonLd['@type']).toBe('Article');
});
```

- [ ] **Step 2: Run article tests and confirm missing React pages**

Run: `npm test -- src/articles/content.test.ts src/pages/articles-page.test.tsx src/pages/article-detail-page.test.tsx scripts/generate-guide-pages.test.ts`

Expected: FAIL because the unified article data/pages do not exist.

- [ ] **Step 3: Implement unified content and accessible index/detail behavior**

Use a discriminated `Article` record for guides, insights, news, and Hybrid Router. Port search, channel tabs, type/sort/reset state, `history.replaceState`, breadcrumbs, Make-it-yours and Subscribe-vs-API banners, active table of contents, related articles, chart text alternative, metadata, and Article JSON-LD. Existing `/guides/:slug/` paths remain redirects.

```ts
export interface Article {
  readonly slug: string;
  readonly channel: 'guides' | 'insights' | 'news';
  readonly title: string;
  readonly description: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly sections: readonly ArticleSection[];
}
```

- [ ] **Step 4: Run article, guide, generator, and hydration tests**

Run: `npm test -- src/articles/content.test.ts src/pages/articles-page.test.tsx src/pages/article-detail-page.test.tsx src/frontend/guides-page.test.tsx src/GuidesApp.test.tsx scripts/generate-guide-pages.test.ts`

Expected: PASS for `/articles`, channel state, Hybrid Router, and every current article slug.

- [ ] **Step 5: Commit the article migration**

```bash
git add src/articles src/pages/articles-page.tsx src/pages/articles-page.test.tsx src/pages/article-detail-page.tsx src/pages/article-detail-page.test.tsx src/guides/content.ts src/frontend/guides-page.tsx scripts/generate-guide-pages.ts scripts/generate-guide-pages.test.ts src/preview/route-manifest.tsx
git commit -m "feat: migrate article pages to React"
```

**Reviewer gate:** Reject if any current article detail route is omitted, if related links target `/guides/`, or if page content requires JavaScript to be readable.

---

### Task 8: Migrate Models, query-profile, and Lifecycle

**Files:**
- Create: `src/pages/preview-models-page.tsx`
- Create: `src/pages/preview-models-page.test.tsx`
- Create: `src/pages/preview-model-profile-page.tsx`
- Create: `src/pages/preview-model-profile-page.test.tsx`
- Create: `src/pages/lifecycle-radar-page.tsx`
- Create: `src/pages/lifecycle-radar-page.test.tsx`
- Create: `src/frontend/preview-workbench/model-state.ts`
- Create: `src/frontend/preview-workbench/model-state.test.ts`
- Modify: `src/preview/route-manifest.tsx`

**Interfaces:**
- Consumes: `PreviewDataAdapter.models/profile/lifecycle`, existing model chart/radar primitives, `PageFrame`, and shared selection state.
- Produces: React delivery for `/models`, `/model-profile?model=`, and `/model-lifecycle`.

- [ ] **Step 1: Write failing URL, selection, and lifecycle tests**

```ts
it('round-trips two-to-four comparison selections', () => {
  const state = decodeModelWorkbenchState(new URLSearchParams('compare=gpt-4o,deepseek-v3'));
  expect(state.selectedModelIds).toEqual(['gpt-4o', 'deepseek-v3']);
  expect(encodeModelWorkbenchState(state).get('compare')).toBe('gpt-4o,deepseek-v3');
});

it('keeps the preview profile query URL canonical', () => {
  expect(profileHref('gpt-4o')).toBe('/model-profile?model=gpt-4o');
});
```

- [ ] **Step 2: Run focused model tests and confirm missing preview pages**

Run: `npm test -- src/pages/preview-models-page.test.tsx src/pages/preview-model-profile-page.test.tsx src/pages/lifecycle-radar-page.test.tsx src/frontend/preview-workbench/model-state.test.ts`

Expected: FAIL because the preview React page/state modules do not exist.

- [ ] **Step 3: Port page behavior behind the adapter**

Models preserves search, access/provider filters, sort, cards/table view, frontier connection line, 2–4 selection tray, and `#catalog`. Profile preserves radar, SLA bars, source/effective timestamps, `Current` next to the model name, and `/compare?models=:slug`. Lifecycle preserves horizon filters, cards, table, timeline, source facts, and explicit unavailable replacements.

```tsx
const contract = usePreviewData((adapter) => adapter.models(query));
return <EvidenceBoundary contract={contract}>
  {(data) => <ModelsWorkbench data={data} state={state} onStateChange={setState} />}
</EvidenceBoundary>;
```

- [ ] **Step 4: Run preview and reused model-contract tests**

Run: `npm test -- src/pages/preview-models-page.test.tsx src/pages/preview-model-profile-page.test.tsx src/pages/lifecycle-radar-page.test.tsx src/frontend/preview-workbench/model-state.test.ts src/frontend/model-directory-state.test.ts src/frontend/model-profile-contracts.test.ts`

Expected: PASS; each page renders exact semantic values, query state, and unavailable evidence correctly.

- [ ] **Step 5: Commit the model-family migration**

```bash
git add src/pages/preview-models-page.tsx src/pages/preview-models-page.test.tsx src/pages/preview-model-profile-page.tsx src/pages/preview-model-profile-page.test.tsx src/pages/lifecycle-radar-page.tsx src/pages/lifecycle-radar-page.test.tsx src/frontend/preview-workbench/model-state.ts src/frontend/preview-workbench/model-state.test.ts src/preview/route-manifest.tsx
git commit -m "feat: migrate model preview pages to React"
```

**Reviewer gate:** Reject if query-profile links change to `/models/:slug/`, if the quick-comparison tray appears below two models, or if unavailable lifecycle facts are inferred.

---

### Task 9: Migrate the 2–4-model Compare workbench

**Files:**
- Create: `src/pages/preview-compare-page.tsx`
- Create: `src/pages/preview-compare-page.test.tsx`
- Create: `src/frontend/preview-workbench/compare-state.ts`
- Create: `src/frontend/preview-workbench/compare-state.test.ts`
- Create: `src/frontend/preview-workbench/compare-export-actions.ts`
- Create: `src/frontend/preview-workbench/compare-export-actions.test.ts`
- Modify: `src/preview/route-manifest.tsx`

**Interfaces:**
- Consumes: `PreviewDataAdapter.comparison`, shared chart/radar primitives, URL-state helpers, and download/share primitives.
- Produces: React delivery for `/compare?models=...` without coupling to the canonical two-model comparison API.

- [ ] **Step 1: Write failing query and export tests**

```ts
it('normalizes duplicate and excess model ids to two through four selections', () => {
  expect(decodeCompareState('gpt-4o,gpt-4o,deepseek-v3,llama-3-3-70b,claude-3-5-sonnet').modelIds)
    .toEqual(['gpt-4o', 'deepseek-v3', 'llama-3-3-70b', 'claude-3-5-sonnet']);
});

it('emits exact semantic matrix rows in CSV order', () => {
  expect(compareCsv(data).split('\n')[0]).toBe('Metric,GPT-4o,DeepSeek V3');
});
```

- [ ] **Step 2: Run compare tests and confirm missing workbench modules**

Run: `npm test -- src/pages/preview-compare-page.test.tsx src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.test.ts`

Expected: FAIL because the preview Compare modules do not exist.

- [ ] **Step 3: Port picker, charts, matrices, and actions**

Preserve 2–4 selection, URL normalization, model removal/addition, vertically centered radar, legend spacing, exact capability table in the right panel, Decision deltas title/subtitle, TTFT/TPS/cost charts, semantic tables, copy link, CSV, and PNG. Use React lifecycle cleanup for canvas charts.

```tsx
<CompareResult
  models={contract.data.models}
  actions={<CompareActions onCopy={copyLink} onCsv={downloadCsv} onImage={downloadImage} />}
  capabilityTable={<CapabilityMatrix rows={contract.data.capabilities} />}
/>
```

- [ ] **Step 4: Run compare, radar, picker, and browser-focused tests**

Run: `npm test -- src/pages/preview-compare-page.test.tsx src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.test.ts src/frontend/model-pair-picker.test.tsx src/frontend/comparison-radar.test.tsx`

Expected: PASS with stable query URLs, accessible data alternatives, and deterministic export order.

- [ ] **Step 5: Commit Compare**

```bash
git add src/pages/preview-compare-page.tsx src/pages/preview-compare-page.test.tsx src/frontend/preview-workbench/compare-state.ts src/frontend/preview-workbench/compare-state.test.ts src/frontend/preview-workbench/compare-export-actions.ts src/frontend/preview-workbench/compare-export-actions.test.ts src/preview/route-manifest.tsx
git commit -m "feat: migrate compare workbench to React"
```

**Reviewer gate:** Reject if the page silently drops selected models, if canvas is the only result representation, or if exports disagree with the displayed table.

---

### Task 10: Migrate Make it yours

**Files:**
- Create: `src/pages/make-it-yours-page.tsx`
- Create: `src/pages/make-it-yours-page.test.tsx`
- Create: `src/frontend/preview-workbench/weighted-ranking.ts`
- Create: `src/frontend/preview-workbench/weighted-ranking.test.ts`
- Create: `src/frontend/preview-workbench/weighted-ranking-state.ts`
- Create: `src/frontend/preview-workbench/weighted-ranking-state.test.ts`
- Create: `src/frontend/preview-workbench/weighted-ranking-export.ts`
- Create: `src/frontend/preview-workbench/weighted-ranking-export.test.ts`
- Modify: `src/preview/route-manifest.tsx`

**Interfaces:**
- Consumes: `PreviewDataAdapter.rankings`, model selection state, chart adapters, and export helpers.
- Produces: deterministic `buildWeightedRanking(input)`, URL state, exports, and React delivery for `/make-it-yours/`.

- [ ] **Step 1: Write failing pure-scoring and zero-weight tests**

```ts
it('normalizes active weights before computing the weighted score', () => {
  const result = buildWeightedRanking({ models, weights: { reasoning: 2, coding: 1, knowledge: 0 }, filters });
  expect(result[0].score).toBeCloseTo((models[0].reasoning * 2 + models[0].coding) / 3, 6);
});

it('returns a recoverable validation result when every weight is zero', () => {
  expect(validateWeights(zeroWeights)).toEqual({ valid: false, reason: 'At least one capability weight must be greater than zero.' });
});
```

- [ ] **Step 2: Run weighted-ranking tests and confirm missing modules**

Run: `npm test -- src/frontend/preview-workbench/weighted-ranking.test.ts src/frontend/preview-workbench/weighted-ranking-state.test.ts src/pages/make-it-yours-page.test.tsx`

Expected: FAIL because the pure ranking/state modules and page do not exist.

- [ ] **Step 3: Port deterministic calculations before rendering**

Port six weights, reset/warning, provider/access/SLA filters, cards/table default list view, service-level exact table, weighted frontier, equal-height insight panels, reduced cheapest-first bar height, expandable summary styles/arrows, 2–4 selection tray, in-depth comparison link placement, chart keyboard selection, URL share, CSV/PNG/copy, and semantic tables.

```tsx
const ranking = useMemo(() => buildWeightedRanking({ models: data.models, weights, filters }), [data.models, weights, filters]);
return <MakeItYoursWorkbench ranking={ranking} weights={weights} filters={filters} selection={selection} />;
```

- [ ] **Step 4: Run pure math, page, export, and existing parity tests**

Run: `npm test -- src/frontend/preview-workbench/weighted-ranking.test.ts src/frontend/preview-workbench/weighted-ranking-state.test.ts src/frontend/preview-workbench/weighted-ranking-export.test.ts src/pages/make-it-yours-page.test.tsx scripts/make-it-yours-preview.test.ts`

Expected: PASS; React results and exports match the approved prototype calculations and exact semantic tables.

- [ ] **Step 5: Commit Make it yours**

```bash
git add src/pages/make-it-yours-page.tsx src/pages/make-it-yours-page.test.tsx src/frontend/preview-workbench/weighted-ranking.ts src/frontend/preview-workbench/weighted-ranking.test.ts src/frontend/preview-workbench/weighted-ranking-state.ts src/frontend/preview-workbench/weighted-ranking-state.test.ts src/frontend/preview-workbench/weighted-ranking-export.ts src/frontend/preview-workbench/weighted-ranking-export.test.ts src/preview/route-manifest.tsx
git commit -m "feat: migrate weighted leaderboard to React"
```

**Reviewer gate:** Reject if scoring reads the DOM, if weights are not normalized deterministically, or if table and chart ordering diverge.

---

### Task 11: Migrate Subscribe vs API and crossover analysis

**Files:**
- Create: `src/pages/subscribe-vs-api-page.tsx`
- Create: `src/pages/subscribe-vs-api-page.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/catalog/contracts.ts`
- Modify: `src/catalog/subscription-api-calculator.ts`
- Modify: `src/catalog/subscription-api-calculator.test.ts`
- Modify: `src/frontend/calculator-share-state.ts`
- Modify: `src/frontend/calculator-share-state.test.ts`
- Modify: `src/frontend/calculator-state.ts`
- Modify: `src/frontend/calculator-state.test.ts`
- Create: `src/frontend/crossover-chart.tsx`
- Create: `src/frontend/crossover-chart.test.tsx`
- Modify: `src/preview/route-manifest.tsx`

**Interfaces:**
- Consumes: `PreviewDataAdapter.subscription`, existing calculator engine/state, Chart.js lifecycle wrapper, and share/export helpers.
- Produces: extended workload/share state, line-item/crossover results, and React delivery for `/subscribe-vs-api`.

- [ ] **Step 1: Write failing calculation and share-state tests**

```ts
it('calculates monthly subscription and API cost for one through fifty seats', () => {
  const result = calculateSubscriptionApiResult({ ...input, seats: 12, tokenVolume: 120_000_000 });
  expect(result.monthlySubscriptionUsd).toBe(240);
  expect(result.selectedVolumeApiUsd).toBeGreaterThan(0);
});

it('round-trips cache, long-context, character estimate, seat, and token-domain inputs', () => {
  const decoded = decodeCalculatorShareState(new URLSearchParams(encodeCalculatorShareState(state)), catalog);
  expect(decoded?.state).toEqual(state);
});
```

- [ ] **Step 2: Run calculator tests and confirm missing fields/page**

Run: `npm test -- src/catalog/subscription-api-calculator.test.ts src/frontend/calculator-state.test.ts src/frontend/calculator-share-state.test.ts src/pages/subscribe-vs-api-page.test.tsx`

Expected: FAIL because seat/token-domain/cache-write/long-context fields and the page module are absent.

- [ ] **Step 3: Extend the pure engine and build the React page**

Preserve provider → plan → model mix → message workload flow. Add input/output mix, source prices, cache reads/writes, long-context tiers, text/code character estimates, 1–50 seats, 0–300M-token domain, selected-volume result, crossover point, lower-cost region, semantic result table, assumptions, timestamps, share, print, CSV, and image export. Use the copy term `Monthly subscription` everywhere; never render `SaaS`.

```ts
export interface CrossoverResult {
  readonly monthlySubscriptionUsd: number;
  readonly selectedVolumeApiUsd: number;
  readonly crossoverTokens: number | null;
  readonly domain: readonly { tokens: number; monthlySubscriptionUsd: number; apiUsd: number }[];
}
```

- [ ] **Step 4: Run calculator, page, route, and current parity tests**

Run: `npm test -- src/catalog/subscription-api-calculator.test.ts src/catalog/calculator.test.ts src/frontend/calculator-state.test.ts src/frontend/calculator-share-state.test.ts src/frontend/crossover-chart.test.tsx src/pages/subscribe-vs-api-page.test.tsx scripts/cost-calculator-preview.test.ts scripts/cost-preview-integration.test.ts`

Expected: PASS; source values remain separate from derived totals and the chart matches the semantic table at every sampled token volume.

- [ ] **Step 5: Commit Subscribe vs API**

```bash
git add src/pages/subscribe-vs-api-page.tsx src/pages/subscribe-vs-api-page.test.tsx src/App.tsx src/catalog/contracts.ts src/catalog/subscription-api-calculator.ts src/catalog/subscription-api-calculator.test.ts src/frontend/calculator-share-state.ts src/frontend/calculator-share-state.test.ts src/frontend/calculator-state.ts src/frontend/calculator-state.test.ts src/frontend/crossover-chart.tsx src/frontend/crossover-chart.test.tsx src/preview/route-manifest.tsx
git commit -m "feat: migrate subscribe versus API to React"
```

**Reviewer gate:** Reject if provider prices and derived estimates are conflated, if the semantic table disagrees with the chart, or if any visible `SaaS` wording remains.

---

### Task 12: Publish the proposed `ui-data-contract/v1` consumer package

**Files:**
- Create: `contracts/ui-data-contract/v1/schema.json`
- Create: `contracts/ui-data-contract/v1/ACCEPTANCE.md`
- Create: `contracts/ui-data-contract/v1/examples/manifest.json`
- Create: six positive method examples under `contracts/ui-data-contract/v1/examples/`
- Create: `contracts/ui-data-contract/v1/examples/mixed-source.json`
- Create: `contracts/ui-data-contract/v1/examples/unsupported-version.json`
- Create: `src/frontend/preview-data/contract-v1.ts`
- Create: `src/frontend/preview-data/contract-v1.test.ts`

**Interfaces:**
- Consumes: the existing frontend `UiDataContractV1<T>` and six `PreviewDataAdapter` result types.
- Produces: a proposed JSON Schema, deterministic consumer examples, a strict envelope/parser harness, and a pipeline sign-off checklist. It does not produce a live API adapter or claim pipeline acceptance.

- [ ] **Step 1: Write failing consumer-contract tests before creating the package**

```ts
it.each(['models', 'profile', 'lifecycle', 'rankings', 'comparison', 'subscription'] as const)(
  'parses the proposed %s example without a page-specific transformation',
  (method) => expect(parseUiDataContractV1(examples[method], method).contractVersion).toBe('ui-data-contract/v1'),
);

it('preserves mixed-source and unavailable evidence verbatim', () => {
  const parsed = parseUiDataContractV1(examples.mixedSource, 'rankings');
  expect(parsed.effectiveAt).toBeNull();
  expect(new Set(parsed.provenance.map((source) => source.effectiveAt)).size).toBeGreaterThan(1);
  expect(JSON.stringify(parsed)).toContain('No approved source');
});

it('rejects unsupported versions and invalid UTC timestamps', () => {
  expect(() => parseUiDataContractV1(examples.unsupportedVersion, 'models')).toThrow(/Unsupported UI data contract version/);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-contract failure**

Run: `npm test -- src/frontend/preview-data/contract-v1.test.ts`

Expected: FAIL because the parser, schema, and examples do not exist.

- [ ] **Step 3: Implement the proposal without changing runtime adapter selection**

The schema must use JSON Schema 2020-12, require `contractVersion`, `status`, `fetchedAt`, `effectiveAt`, `data`, and `provenance`, and reject undeclared envelope fields. Timestamp values are UTC ISO-8601 strings ending in `Z`; `effectiveAt` may be `null` only for unavailable or mixed-source envelopes. Each evidence value is either `available` with its value and provenance, or `unavailable` with a non-empty reason and optional provenance.

The manifest marks the six method examples and `mixed-source.json` as positive consumer examples and `unsupported-version.json` as an expected rejection. `ACCEPTANCE.md` must begin with `Status: PROPOSED — NOT PIPELINE ACCEPTED` and list the exact pipeline sign-off evidence: pipeline commit SHA, stable artifact path, method/query for all six responses, mixed-source behavior, unavailable reasons, invalid/unsupported-version behavior, and confirmation that D1/R2/cache internals are absent.

The examples may use the approved illustrative adapter facts, but their provenance and documentation must remain explicitly illustrative. They are contract examples, not accepted production responses.

- [ ] **Step 4: Run proposal, fixture, and type checks**

Run: `npm test -- src/frontend/preview-data/contract-v1.test.ts src/frontend/preview-data/fixture-adapter.test.ts`

Run: `npm run lint`

Expected: PASS; examples round-trip without data loss, negative examples fail for the expected reason, and no runtime page or adapter silently switches modes.

- [ ] **Step 5: Commit the consumer contract proposal**

```bash
git add contracts/ui-data-contract/v1 src/frontend/preview-data/contract-v1.ts src/frontend/preview-data/contract-v1.test.ts
git commit -m "feat: publish preview data contract proposal"
```

**Reviewer gate:** Reject if the package claims pipeline acceptance, if examples lose unavailable/provenance/effective-time evidence, if unsupported versions parse, if schema and parser disagree, or if runtime adapter selection changes before pipeline sign-off.

---

### Task 13: Accept pipeline artifacts and integrate the API adapter

**Files:**
- Replace only: `contracts/ui-data-contract/v1/` from accepted pipeline commit `413d0307fc4662a30967d8b3f9fb06f042861a0d`
- Modify: `src/frontend/preview-data/contract-v1.ts`
- Modify: `src/frontend/preview-data/contract-v1.test.ts`
- Create: `src/frontend/preview-data/gateway.ts`
- Create: `src/frontend/preview-data/gateway.test.ts`
- Create: `src/frontend/preview-data/evidence-transport.ts`
- Create: `src/frontend/preview-data/evidence-transport.test.ts`
- Create: `src/frontend/preview-data/http-transport.ts`
- Create: `src/frontend/preview-data/http-transport.test.ts`
- Create: `src/frontend/preview-data/api-adapter.ts`
- Create: `src/frontend/preview-data/api-adapter.test.ts`
- Modify: `src/frontend/preview-data/contracts.ts`
- Modify: `src/frontend/preview-data/adapter.ts`
- Modify: `src/preview/route-manifest.tsx`
- Modify: data-heavy page tests under `src/pages/`

**Interfaces:**
- Consumes: pipeline-approved producer `ac42000893fa2e15d0ae76f7f83ebcea5745f7b5` and immediate-child acceptance `413d0307fc4662a30967d8b3f9fb06f042861a0d`, which record frontend baseline `5d649d315a0bdb052e90bb96d6b7e94544f9ad31`.
- Produces: one typed gateway with an evidence transport and HTTP transport behind the existing page-facing `PreviewDataAdapter` interface. Pages receive validated view models, never raw pipeline envelopes.

- [ ] **Step 1: Verify, record, and path-sync the accepted contract tree**

Verify that `413d030^` equals producer `ac42000`, that the pipeline worktree is clean, and that its acceptance records frontend baseline `5d649d3`. Then sync only the accepted contract tree; never cherry-pick the pipeline branch:

```bash
git restore --source=413d0307fc4662a30967d8b3f9fb06f042861a0d -- contracts/ui-data-contract/v1
```

The retained tree must include the schema/meta-schema, acceptance record, manifest/schema, six primary responses, mixed-source rankings, unavailable profile, invalid timestamp, and unsupported version. Stable rejection codes are lowercase `invalid_timestamp` and `unsupported_contract_version`.

- [ ] **Step 2: Write failing gateway, transport, and page-boundary tests**

```ts
it.each(['models', 'profile', 'lifecycle', 'rankings', 'comparison', 'subscription'] as const)(
  'validates and maps accepted %s evidence through the page-facing adapter',
  async (method) => expect((await evidenceAdapter[method](queries[method])).contractVersion).toBe('ui-data-contract/v1'),
);

it('never substitutes fixture facts for an unavailable API response', async () => {
  const result = await httpAdapter.profile('missing-model');
  expect(result.status).toBe('unavailable');
  expect(result.data).toBeNull();
});

it('preserves ordered comparison slugs and exact custom ranking inputs', async () => {
  await httpAdapter.comparison({ modelIds: ['alpha', 'beta', 'gamma'] });
  await httpAdapter.rankings(customRankingQuery);
  expect(fetchRequests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('models=alpha%2Cbeta%2Cgamma') }));
  expect(fetchRequests).toContainEqual(expect.objectContaining({ body: expect.stringContaining('normalizedWeights') }));
});
```

- [ ] **Step 3: Implement the accepted parser, two transports, gateway, and view-model mapping**

Update Task 12's parser to the accepted envelope: `method`, normalized `request`, `status`, nullable `reason`, `fetchedAt`, nullable `effectiveAt`, `data`, `revisions`, `freshness`, `sources`, `warnings`, and `provenance`. Mixed-source rankings may be `status: available` with `effectiveAt: null`; preserve every source's own time. Unknown values remain null and numeric zero remains valid.

The evidence transport reads only the retained accepted artifacts for deterministic preview/tests. The HTTP transport implements the manifest's exact routes and methods under `/api/benchmarks/*`. The gateway validates every raw transport response before mapping it to the existing page-facing `PreviewDataAdapter` view models. It emits stable lowercase rejection codes and never exposes raw pipeline/storage shapes to pages.

The HTTP transport must preserve 2–4 ordered distinct comparison slugs, send the exact submitted custom-ranking weight/filter matrix, and support subscription catalog/calculate operations. A network, HTTP, invalid-contract, or unavailable response must remain explicit; production HTTP mode never falls back to evidence or fixture facts.

```ts
export function createPreviewDataGateway(transport: PreviewDataTransport): PreviewDataAdapter {
  return createValidatedPreviewDataAdapter(transport);
}
```

- [ ] **Step 4: Wire data-heavy routes to the gateway boundary and run integration tests**

Models consumes models/profile/lifecycle; Popular Models consumes leaderboard rankings; Make It Yours consumes custom rankings; Compare consumes ordered comparison; Subscribe vs API consumes subscription catalog/calculate. Static/test preview may select the evidence transport explicitly. Live HTTP activation and deployment remain Task 14 gates; page code must not require another rewrite when the transport switches.

Run: `npm test -- src/frontend/preview-data/*.test.ts src/pages/preview-models-page.test.tsx src/pages/preview-model-profile-page.test.tsx src/pages/lifecycle-radar-page.test.tsx src/pages/popular-models-page.test.tsx src/pages/preview-compare-page.test.tsx src/pages/make-it-yours-page.test.tsx src/pages/subscribe-vs-api-page.test.tsx src/preview/route-manifest.test.tsx`

Run: `npm run lint`

Run: `npm run build`

Expected: PASS for six accepted responses, mixed-source timing, unavailable profile, invalid timestamp, unsupported version, exact HTTP requests, explicit failures, and every data-heavy page boundary. No live HTTP request is made during static generation or tests unless explicitly injected.

- [ ] **Step 5: Commit accepted pipeline integration**

```bash
git add contracts/ui-data-contract/v1 src/frontend/preview-data src/pages
git add src/preview/route-manifest.tsx src/preview/route-manifest.test.tsx
git commit -m "feat: integrate accepted preview data gateway"
```

**Reviewer gate:** Reject unless producer/acceptance/baseline SHAs and paths are retained, accepted artifacts validate at both boundaries, page components receive only mapped view models, comparison/custom/subscription requests preserve exact input semantics, invalid/unavailable states never fall back silently, or live HTTP cutover/deployment occurs before Task 14.

---

### Task 14: Remove prototype delivery and complete QA

**Files:**
- Delete: `scripts/make-it-yours-preview.ts`
- Delete: obsolete prototype-only tests after their behavior has equivalent React/browser coverage
- Modify: `vite.config.ts`
- Modify: `package.json`
- Modify: `scripts/preview-build-routes.test.ts`
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `public/_redirects` only when a verified conflict exists

**Interfaces:**
- Consumes: all manifest entries at `delivery: 'react'` and accepted data contract adapters.
- Produces: a Vite/Cloudflare Pages build with no in-scope prototype documents or copied prototype runtime assets.

- [ ] **Step 1: Write failing final-cutover assertions before removing the plugin**

```ts
it('ships no prototype runtime dependencies for an in-scope route', async () => {
  const files = await readBuiltFiles('dist');
  expect(files.join('\n')).not.toMatch(/ui-revamp-3-assets|common\.js|data\.js|chart\.umd\.js/);
});

it.each(allPreviewRoutes)('emits a direct-load React document for $id', async ({ outputPathname }) => {
  expect(await fileExists(`dist${outputPathname}/index.html`)).toBe(true);
});
```

- [ ] **Step 2: Run cutover tests and confirm prototype-asset failure**

Run: `npm test -- scripts/preview-build-routes.test.ts scripts/preview-route-delivery.test.ts`

Expected: FAIL while the Vite copy plugin still emits prototype pages/assets.

- [ ] **Step 3: Remove the plugin only after every manifest route is React**

Remove the Vite plugin registration, its package/build hooks, and copied shared assets. Preserve `_redirects` entries for legacy URLs. Keep Chart.js only as a bundled dependency controlled by React effects.

```ts
expect(previewRoutes.every((route) => route.delivery === 'react')).toBe(true);
```

- [ ] **Step 4: Run the full verification gate and inspect built output**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Run: `npm run test:browser:production`

Run: `rg -n 'prototypes/ui-revamp-3|ui-revamp-3-assets|common\.js|data\.js|chart\.umd\.js' dist`

Expected: all tests/builds PASS and the final search returns no matches.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Commit the final cutover**

```bash
git add -A scripts/make-it-yours-preview.ts vite.config.ts package.json scripts browser-tests public/_redirects
git commit -m "refactor: complete React preview delivery"
```

**Reviewer gate:** Reject if Task 13 is incomplete, if any direct deep link depends on an SPA catch-all, if any legacy redirect becomes a duplicate page, if no-JavaScript content is empty, or if deployment is attempted without a separate user request.

---

## Parallel execution map

After Tasks 1–5 land and pass review, these file ownership groups can run concurrently:

- Content worker: Task 7 (`src/articles`, article page files, guide generator files).
- Model workbench worker: Task 8 (`preview-models`, query-profile, lifecycle, model state).
- Decision tools worker: Tasks 9–10 sequentially (`preview-compare`, weighted ranking workbench).
- Cost worker: Task 11 (`subscribe-vs-api`, calculator contracts/state/chart).

Task 6 owns shared Home/Popular files and should land before the four groups. Task 12 can publish the consumer contract proposal while the external pipeline continues. Task 13 waits for the pipeline's accepted artifacts and Task 12 review. Task 14 waits for every route and Task 13.

## Review protocol

Every task receives two gates before integration:

1. Specification review: confirm the task implements this plan and the approved design without widening scope.
2. Code-quality review: inspect tests, type boundaries, accessibility, cleanup, dirty-worktree isolation, and focused command output.

The orchestrating Sol agent reruns the focused tests locally after each worker handoff; worker claims are evidence, not proof.
