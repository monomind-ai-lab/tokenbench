# React migration for the ui-revamp-3 preview

## Purpose

Replace the `ui-revamp-3` preview's hybrid delivery model—Vite React output
overwritten by copied prototype HTML and vanilla scripts—with React-owned pages
at every destination exposed by the current global navigation and footer. The
approved information design, interaction behavior, query URLs, and review
routes remain stable throughout the migration.

This is a preview-branch migration only. It does not deploy, change production
contracts, or create React implementations for legacy compatibility URLs.

## Scope

### In scope

The authoritative set is the current global navigation and footer map in
`src/frontend/app-shell.tsx` and `PREVIEW_ROUTE_PATHS`:

| Area | Canonical preview routes |
| --- | --- |
| Home | `/` |
| Models | `/models`, `/models#catalog`, `/model-profile?model=:slug`, `/model-lifecycle` |
| Leaderboards | `/popular-models/`, `/make-it-yours/` |
| Comparison | `/compare` |
| Cost | `/subscribe-vs-api` |
| Articles | `/articles`, its `?channel=guides|insights|news` views, `/articles/hybrid-router`, and every current `/articles/:slug/` detail page |
| Footer exploration | `/llm-price-performance/` |

The current article details are the Hybrid Router article and the published
article slugs declared in `src/guides/content.ts`. New article detail data must
enter the same React detail-page route rather than add another static template.

### Explicitly out of scope

- Legacy route implementations, including `/cost`, `/cost/calculator`, and
  `/cost/breakeven`. Existing redirects remain redirects.
- Non-linked operational or transactional pages (`/tools`, `/guides`,
  `/newsletter/confirmed`, `/welcome`) and the legacy leaderboard directory.
- Changes to the approved visual language, current URLs, production Worker
  APIs, or the deployed review build before a later deployment request.

## Chosen architecture

### One preview-route manifest

Create one typed manifest that maps each in-scope pathname to:

- a React page factory;
- its global-shell active state and accessible skip-link target;
- route-specific title, description, canonical URL, and structured data; and
- its build-time/static data source and client hydration policy.

This manifest replaces the parallel and inconsistent sources now spread across
`PREVIEW_ROUTE_PATHS`, `src/routing/routes.ts`,
`scripts/generate-guide-pages.ts`, and the `previewPageBundles` list in
`scripts/make-it-yours-preview.ts`.

Canonical preview paths and query parameter names must not change. In
particular, `/model-profile?model=:slug`, the comparison model query,
Subscribe-vs-API share state, article channels, filters, and anchors remain
valid. The manifest may normalize malformed values, but only with the current
page's documented `history.replaceState` behavior.

### React-owned static documents

At build time, render each fixture/content route through the same React page
tree using `react-dom/server`. Emit a document at its deep-link path with
route-specific `<head>` metadata, JSON-LD where applicable, a semantic body,
and the versioned Vite assets from `src/routing/frontend-assets.ts`.

At runtime, `src/main.tsx` resolves the same manifest and calls
`hydrateRoot` against matching markup. The resolver distinguishes:

- no embedded data, which permits a page's normal client-data loading state;
- valid embedded data, which hydrates without a redundant fetch; and
- malformed embedded data, which preserves the substantive server/static
  fallback rather than erasing it.

This keeps direct Cloudflare Pages deep links, route-specific SEO, and
meaningful no-JavaScript HTML. React components may control Chart.js where it
is the approved chart engine; Chart.js is not a second page runtime and must be
created/destroyed through component lifecycle hooks.

### Shared application shell

Every migrated route uses `AppShell`, `SiteHeader`, `SiteFooter`, and
`useSitePreferences`. This makes the approved navigation, footer, responsive
behavior, theme, language control, and Google Translate toolbar suppression
uniform. No prototype page may recreate that shell in inline HTML or
`common.js`.

### Page data and component boundaries

Use a preview data layer for approved fixture-driven workbenches. It exposes
typed model, pricing, ranking, article, and lifecycle data without DOM access.
React pages consume that layer through explicit props/hooks; chart and export
components receive typed view models rather than reading global data objects.

Existing production/SSR React surfaces remain reusable where their contract
matches the preview:

- keep Price Performance's React SSR/hydration path intact;
- reuse the shared AppShell, site preferences, visual primitives, catalog
  calculators, guide/article layout, and Popular Models workbench components;
- adapt existing model profile and calculator logic behind preview-route
  wrappers rather than silently redirecting preview URLs to unrelated
  production canonical URLs.

Prototype-only behavior is ported as focused React components. The required
boundaries are: `ModelsWorkbench`, `PreviewModelProfile`, `LifecycleRadar`,
`MakeItYoursWorkbench`, `PreviewCompare`, `SubscribeVsApiCalculator`,
`ArticlesIndex`, and a unified `ArticleDetail` with typed article content.
Their shared concerns are URL-state hooks, selection state, chart adapters,
download/share actions, and accessible semantic data tables.

## Behavior and accessibility requirements

- Preserve all approved controls, calculations, and results for Models,
  Make-it-yours, Compare, and Subscribe vs API—including model selection,
  filters, weighting, caching/long-context calculations, 1–50 seats,
  0–300M-token crossover, share URLs, print/CSV/PNG/copy exports, and
  equivalent semantic tables.
- Treat the existing prototype as a parity reference, not as the target
  architecture. Move its data and deterministic calculations into typed
  TypeScript modules before removing DOM-specific code.
- Charts need meaningful labels, a nearby text summary, keyboard-accessible
  controls, and a complete semantic data alternative. Canvas is never the only
  way to read a result.
- Preserve native links, proper heading order, focus restoration/announcement
  after state changes where the current flow jumps to results, and responsive
  behavior at the existing test viewports.
- Generated HTML must present useful article/page content before JavaScript
  runs. A loading placeholder is acceptable only for genuinely live data and
  must be semantic and non-destructive.

## Migration sequence

1. **Route and rendering foundation.** Add the typed preview manifest,
   server/static document renderer, route metadata, and a unified browser
   resolver. Establish a React shell test for every in-scope route. Do not
   remove the copy plugin yet.
2. **Low-risk content and existing React surfaces.** Move Home, Popular
   Models, Price Performance, the Articles index, all article details, and
   query-route wrappers for Models/Profile into manifest-rendered React pages.
3. **Shared fixture workbench foundation.** Establish typed preview data,
   URL-state, chart lifecycle, selection tray, and export utilities. Port
   Models, Lifecycle, and Compare over that foundation.
4. **Calculation workbenches.** Port Make-it-yours and Subscribe vs API,
   retaining their approved formula/output parity and semantic tables. Extend
   existing calculator domain types rather than keep a separate vanilla
   calculation engine.
5. **Cut over delivery.** Replace prototype-copy assertions with React route
   build tests. Remove `makeItYoursPreviewPlugin`, its copied JavaScript/Chart
   asset pipeline, and prototype pages only after every in-scope route passes
   behavioral, no-JS, navigation/footer, and visual regression gates.

The migration is incremental: until a vertical slice meets parity, the
prototype output for that route remains in place. This avoids a flag-day switch
and makes discrepancies reviewable on the preview branch.

## Error handling and compatibility

- Retain `_redirects` only for out-of-scope legacy paths; redirects must never
  become duplicate React pages.
- Keep no-trailing-slash preview links accepted where the global shell emits
  them, while generated documents remain available at Cloudflare Pages deep
  URLs.
- If a client API payload is unavailable, retain server/static content and use
  the established status banner/retry pattern. Do not blank the page.
- Generated route metadata and JSON-LD use the same source as the rendered
  page, preventing header/footer content or canonical URLs from diverging.

## Verification gates

Each slice must pass before the next begins:

1. Unit tests for the manifest, route metadata, query decode/encode, and pure
   calculation/data functions.
2. React tests for shell consistency, semantic table output, and client
   hydration behavior.
3. Route-level build checks: emitted deep-link file, title/canonical/JSON-LD,
   no-JavaScript content, and no copied prototype dependency.
4. Browser tests at the current responsive widths for navigation, footer,
   theme/language, charts, keyboard control, URL sharing, and exports.
5. Focused parity assertions for the existing cost and Make-it-yours preview
   test contracts before their prototype tests are retired.
6. A final build, TypeScript check, diff check, and manual review of all
   in-scope stable preview routes.

## Success criteria

- Every route in scope renders a React-owned page beneath the shared React
  shell and works on direct page load.
- No in-scope deployment document is supplied by
  `prototypes/ui-revamp-3/*` or depends on its copied JavaScript asset bundle.
- The app retains the approved visual/UI behavior, semantic alternatives,
  query state, exports, and current navigation/footer destinations.
- Legacy routes continue to redirect and are not duplicated as React pages.
- Build, type, route, and browser parity gates pass without changing the
  deployed preview until a deployment is explicitly requested.
