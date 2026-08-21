# Immutable-to-Next UX parity backlog

Audit date: 2026-08-21
Immutable authority: `https://8bf19b96.tokenbench-27t.pages.dev/`
Next review build: `http://127.0.0.1:3101/`

## Purpose and decision boundary

This document records interaction, structure, responsive behavior, and visual details that are still weaker or absent in the Next.js rebuild. The immutable deployment remains authoritative for route and feature coverage. The new component tokens may restyle a preserved surface, but they may not silently remove an input, result, chart, exact-data disclosure, URL state, or user flow.

Three newer user decisions intentionally supersede the immutable presentation:

1. Leaderboard detail result fields show the first **10** rows after the active filter and sort. The source receipt continues to report the complete published row count and source ranks remain unchanged.
2. Repeated source-credit/methodology blocks move to the dedicated `/data-sources/` page. Result pages retain a compact receipt and link to that registry.
3. Reader-facing and exported numeric values use at most two decimal places. Full precision remains in stored source facts and calculations; a positive sub-cent value is rendered as `<$0.01`, not zero.

These are approved overrides, not parity defects.

## Final implementation checkpoint — 2026-08-21

This checkpoint supersedes the older “Next gaps” wording in the historical ledger below. The ledger remains useful as the audit trail; current implementation state is:

| Surface | Implemented in the final local review build |
| --- | --- |
| Global shell | Transparent MonoMind mark, compact shared header/footer, bounded Models/Leaderboards/Articles menus, searchable two-column language picker, dark/light persistence, focus/dismissal behavior, and marketing form on every non-transactional page. |
| Home | Six preserved sections, factual model/filter surface, source-rank snapshot, Chart.js capability view when enough accepted axes exist with exact fallback otherwise, interactive subscription result, and research links. General methodology stays on `/data-sources/`. |
| Models/profile/lifecycle | Factual weekly directory + strict/source joins, route-safe profile links, catalog anchor, exact cache/limit price fields, capability visualization/fallback, runtime-only-when-observed charts, workload line items, lifecycle monitor, limitations, and provenance. |
| Popular Models | Exact three-section structure, original one-row filters and fixed category strip, complete weekly rows/ranks, exact typed category enrichment, sortable 13-column master table, cards/list URL state, row evidence drawers, insights, ordered comparison, Chart.js panels that omit genuinely missing series, and exact matrices. |
| Make It Yours | Seven source-driven dimensions, URL-backed exact weight/filter matrix, searchable providers and model tray, three Chart.js panels, semantic result/SLA/economics tables, cards/list output, and explicit exclusion reasons for incomplete facts. |
| Leaderboards | All 14 routes, featured workbenches, category icons, supported filters, first-ten approved result presentation, complete receipt count, per-lens charts including cost-versus-score where exact pairs exist, compact source receipt, related lenses, and `/data-sources/` link. |
| Compare | Searchable two-to-four ordered selection, valid quick pairs, route-safe query handoff, capability/runtime/price Chart.js panels, exact desktop tables, mobile metric cards, decisions, actions, and provenance. |
| Subscribe vs API | Seven reviewed provider slots, exact plan/model/route bindings, separately priced standard/cache-read/cache-write/output lines, full-width desktop evidence tables, mobile cards, breakeven chart/table, exact formula disclosure, URL state, and exports. |
| Articles | Six substantive guides, two clearly labeled prototype insights, immutable-style cover and channel tabs, URL-backed topic/search/sort including shortest read, fully linked title/CTA areas, #9dabff secondary hierarchy, evidence blocks where the immutable article supplied them, sticky/collapsed contents, and shared shell/footer. |
| Resilience | Global loading skeleton and retryable error boundary; unavailable facts remain explicit; production mode has no fixture fallback. |

Current factual limitations, not UI omissions:

- No independently revisioned route-runtime observation source is active, so TTFT, throughput, and uptime remain unobserved instead of synthesized.
- The canonical sources publish no data-analysis lane for the weekly Popular Models identities; knowledge is not relabeled as data analysis.
- A cache-write rate becomes available only where the catalog source publishes it and migration `0016` has been applied and re-ingested.
- Lifecycle is currently an honest empty result because no qualifying active catalog expiration facts are published; no model age/name inference is used.
- New producer behavior and migrations `0016`/`0017` are verified locally but require separate deployment authorization.

Additional facts that could add user value are listed separately in `docs/rebuild-audit/future-data-value-opportunities-2026-08-21.md`; none are silently added by this checkpoint.

## Audit method and coverage

- Inspected the immutable and Next DOM at desktop size, including headings, sections, forms, buttons, inputs, tables, disclosures, canvases, action links, and URL state.
- Rechecked representative responsive routes at a real 390 × 844 mobile viewport: home, models, Popular Models, one leaderboard child, compare, Subscribe vs API, and articles.
- Exercised category/filter state, comparison removal, subscription input state, article filters/sort, and route query persistence where available.
- Compared the following route families: home, models, profile, lifecycle, Popular Models, Make It Yours, leaderboard directory and child, compare, Subscribe vs API, articles and article details, tools, and price-performance.
- Dynamic `/models/<slug>/`, `/compare/<pair>`, all 14 leaderboard children, `/cost`, `/guides/`, and guide redirects were checked against their shared implementation contracts even when one representative route was used for visual inspection.

This is a preservation backlog, not a request to copy fixture data. Any item must consume accepted source data or render an honest unavailable state.

## Cross-site findings

### Global shell

Already strong in Next:

- Transparent MonoMind/TokenBench mark with no white backing swatch.
- Compact sticky desktop navigation, bounded menus, outside-click and Escape dismissal.
- Models mega menu, three-column Leaderboards mega menu, vertically stacked Articles menu with descriptions.
- Dark/light persistence and searchable two-column language selector.
- Latest shell and the marketing form on article detail pages as well as directory/workbench pages.
- Footer form remains visible in both themes and on mobile.

Still to preserve or verify:

- The immutable mobile menu is a simple vertical route list with clear current-route state. Test the Next menu with long translations and 200% zoom; no item may clip or become unreachable.
- Menu triggers must return focus after Escape and after a destination is selected. Add explicit focus-return tests.
- The top-model menu must keep accepted rank and popularity order. Never infer rank from array position, and do not let a delayed menu response move layout.
- Add `Data sources` to the sitemap/route registry and keep its footer link on all non-transactional pages.
- Continue using one global shell. Do not reintroduce the historical full-width Articles strip or page-specific headers.

### Result actions and URL state

The immutable site consistently places Copy link, Download image, and Export CSV with each result section. Next has the shared action component, but acceptance must be route-specific:

- Copy must include the current canonical query and ordered comparison selection.
- PNG must target the result section, not the whole page or a clipped horizontal scroller.
- CSV must include the current filter/sort scope and a small receipt (release/timestamp/source state) where the contract exposes one.
- Default parameters may be omitted, but reopening the URL must reconstruct the same state.
- Back/forward must restore controls without reordering selected models.
- Disabled/unavailable actions need an explanation; silently inert controls are not acceptable.

### Visual language

The immutable implementation is more vibrant because it uses primary `#1111ff` and secondary `#9dabff` as a hierarchy rather than applying blue everywhere. Preserve these nuances:

- Primary blue: selected tabs, main CTAs, frontier/selected data roles, focus rings, and high-value hero gradients.
- Secondary blue: article metadata, secondary links, disclosure CTAs, small evidence labels, and selected-card support text.
- Provider colors remain data colors. Do not relabel OpenAI, Anthropic, Google, or another provider as the MonoMind brand color.
- Dark pages need three discernible surface elevations: page, inset/muted, and actionable card/popover. An opacity-only `bg-card/35` surface cannot be the sole boundary of a control.
- Preserve compact mono eyebrows, thin separators, dense evidence tables, modest radii, and clear section rhythm. Avoid turning every section into an oversized floating card.
- Hover, selected, focus-visible, unavailable, warning, and frontier states must be distinguishable without color alone.

### Responsive behavior

Immutable behavior uses horizontal scroll only where the content is intrinsically matrix-like. It frequently replaces desktop tables with mobile cards.

Observed Next regressions:

- Home: immutable hides/reflows its comparison table on mobile; Next exposes an 810 px table in a 348 px scroller. Replace it with mobile evidence cards.
- Compare: immutable hides/reflows the two exact tables on mobile; Next keeps 560 px and 760 px tables in scrollers. Provide mobile metric cards while retaining labelled table scrollers as a progressive enhancement.
- Popular Models: category strips and exact matrices correctly use contained horizontal scroll. Keep this intentional.
- Subscribe vs API: both implementations scroll three dense tables on mobile. A compact mobile line-item card design would improve usability, but it must not remove exact rows.
- Every mobile result action must remain at least 44 × 44 px and wrap as a group without obscuring the section heading.
- No route may introduce document-level horizontal overflow; scrollers must be labelled, focusable, and contained.

## Route-by-route preservation ledger

### `/` — home

Immutable structure:

1. Evidence-led hero.
2. Discover & Filter Models with All/Open-weight/Low-latency/High-throughput controls and an exact comparison table.
3. Popular Model Insights with four ranked cards.
4. Head-to-Head Capability & Economics with a six-domain chart and paired economics.
5. Subscription vs Pay-As-You-Go with an interactive volume control.
6. Methodological Research & Analysis with three article entries.

Next status and gaps:

- Section order and primary CTAs are preserved.
- The current model table is richer but degrades to horizontal desktop-table scrolling on mobile; implement mobile cards.
- The immutable head-to-head surface included a real capability visualization. Next currently exposes comparison facts but no chart canvas on the landing page. Restore a Chart.js capability view plus exact-data fallback.
- The immutable comparison presented four named models in its exact table. The Next snapshot may return fewer; render every accepted row up to the intended landing bound and disclose the scope rather than filling constants.
- Keep the interactive subscription sample tied to a validated domain. If calculation data is unavailable, retain the control slot but disable it with a reason.
- Do not add a long methodology/source-credit section back to home. Use a small `/data-sources/` link instead.
- Preserve the three research entries and ensure their entire title rows are links.

Acceptance flow: apply a model filter → table/cards update; move the subscription control → summary and chart update; follow comparison/article CTAs; copyable result sections never contain fixture-only claims in production.

### `/models/` — workbench

Immutable structure:

- Price–performance frontier with Frontier only and Log price scale toggles.
- Two-to-four quick comparison picker and ordered tray.
- Catalog search, access filter, sort, reset, card/list toggle, per-card Compare action, profile links.
- Lifecycle/retirement context and release timeline.

Next status and gaps:

- Structure is present and current data coverage is larger than the immutable fixture.
- The frontier is a custom plotted surface rather than the requested Chart.js implementation. Migrate it while keeping keyboard-accessible point links and null omission.
- Preserve the immutable add-model search and compact ordered tray; a long native select is not an equivalent picker.
- Card and list modes need an explicit visible toggle at desktop and mobile, with query/state preservation where the current route supports it.
- Selected models must remain selected through search, access, provider, and sort changes.
- Catalog cards need clear profile and selection actions without nested interactive elements.
- The immutable catalog anchor is `#catalog`; the Next canonical anchor is `#model-catalog`. Keep existing menu links consistent and optionally support the old anchor as an alias.
- The timeline must use actual release/lifecycle facts. Do not infer dates from name order or catalog position.

### `/model-profile?model=<id>` — rich profile

Immutable profile carried:

- Hero metrics and compare action.
- Six-domain radar plus an Exact capability values disclosure.
- TTFT and throughput history charts with measurement metadata.
- Identity, route limits, access, lifecycle, and sunset information.
- Endpoint/itemized price table including cache read, cache write, long-context, max-output, and availability fields.
- Interactive workload-cost example.
- History, conflicts, limitations, and provenance.

Next gaps (high priority):

- The current route has no Chart.js canvases; capability and runtime are reduced to static rows/blocks. Restore the radar and both runtime charts when accepted observations exist.
- Restore the exact capability disclosure even when the visual chart is available.
- Expand the endpoint table from the current five columns to the immutable evidence dimensions. Missing cache-write or runtime facts stay unavailable.
- Keep the workload slider, but add the immutable itemized input/output/cache calculation rather than only a total.
- Reintroduce a concise limitations/conflicts section. Provenance alone does not explain incompatible timestamps, ambiguous routes, or absent metrics.
- Copy/PNG/CSV should export the requested profile only and include the selected route identity.
- Invalid and source-only IDs need distinct states: not found, identity-only, and data temporarily unavailable.

### `/models/<slug>/` — generated profile

This additive Next route has no direct immutable equivalent. It may remain if it preserves:

- Canonical model identity and source ledger.
- Exact route-attributed pricing/specifications.
- Unavailable axes rather than zero.
- Links into ordered comparison.

Do not let it become a second, contradictory source of truth. Decide whether it canonicalizes to the rich query profile or becomes the canonical SEO route, then make breadcrumbs, menu links, sitemap entries, and JSON-LD consistent.

### `/model-lifecycle/`

Immutable behavior:

- Retirement watchlist, All/90/60 horizon, cards/table toggle, release timeline, evidence boundary.

Next status and gaps:

- Horizon and view controls are present. Keep them URL-restorable if links can be shared.
- Data must come from reviewed lifecycle facts (OpenRouter or another explicitly chosen lifecycle producer), not model age or name inference.
- Cards and list need the same successor, retirement, status, and source timestamp facts.
- Restore migration-path actions when a reviewed successor exists.
- Move general source credits to `/data-sources/`, but keep event-specific source and last-updated information on each alert.
- The Models-menu “Model catalog” link must land on `#model-catalog`; it must not behave as a dead route from Lifecycle.

### `/popular-models/`

Immutable sections:

1. Leaderboard with one-row search/provider/open-weight/finetune/provider-visibility controls, fixed category tags, expandable rows, sortable columns, category winners, and cost/task.
2. Insights with Quality vs Cost and Cost ranking.
3. Compare popular models with a two-to-four tray, three economics charts, radar, decision matrix, exact capability, and exact published-data matrix.

Next status and remaining gaps:

- The three-section structure, fixed category slots, source rank, expanded evidence, insights, ordered comparison, and URL state are present.
- Restore a visible Cards/List toggle for the main result field. Responsive CSS alone does not satisfy the preserved interaction.
- The immutable page had six chart canvases across insights and comparison. Next currently exposes three canvases and static/table replacements for some visuals. Use Chart.js for radar and remaining visual panels while keeping exact tables.
- Provider picker must retain search, multi-select, count, clear, outside-click, and Escape behavior.
- Pagination/next-cursor must be visible when the accepted receipt exceeds the loaded 100 rows; “100 of 100” must not imply total coverage when a cursor exists.
- Keep category controls horizontally scrolling on small screens. Never stack them.
- Keep comparison actions in the top-right header rail on desktop and below the title on mobile.
- Category aliases may populate fixed slots, but absent axes render unavailable and never disappear.

### `/make-it-yours/`

Immutable behavior:

- Capability weight matrix, access and searchable provider filters, TTFT/TPS SLA controls, share/export actions.
- Weighted-score chart, two separate SLA charts, score/cost charts, quick comparison, semantic tables, cards/list output.

Next gaps:

- Current source data introduces seven capability axes instead of the immutable six. This is acceptable only as a source-driven extension: preserve every immutable axis and label the new Instruction following axis; do not renormalize hidden weights.
- Restore searchable multi-provider selection. A single large select without search is a usability regression.
- Immutable had five canvases; Next currently has three. Restore separate TTFT and throughput Chart.js views, including exact measurement tables.
- Add-model search and ordered two-to-four tray should match Models/Compare interactions.
- Keep all weights, filters, SLA thresholds, outside-SLA option, view, and ordered selection reconstructible from the URL.
- Client re-ranking must use the exact submitted weight/filter matrix over accepted rows; missing category/runtime/cost facts stay explicit.

### `/leaderboards/` — directory

Immutable directory included decision-ready picks, named methodology cards, complete Language/Multimodal/Media groups, related leaderboards, and the MonoMind CTA.

Next status and gaps:

- The redesigned directory grouping is useful, but current DOM coverage is substantially smaller (19 route links versus 49 in the immutable directory snapshot).
- Restore the decision-ready featured lens cards and short methodology descriptions.
- Ensure all 14 registered child routes appear exactly once in the taxonomy and all category links have an icon.
- Keep Popular Models and Make It Yours as featured ranking workbenches, not ordinary category routes.
- Restore the related-lens/consultation close if absent after the category directory.
- Directory cards must state what decision the metric answers, not just repeat the category name.

### `/leaderboards/<lens>/` — all 14 child routes

New approved behavior implemented across the shared component:

- Reader-facing result charts, cards/list, and CSV use the first ten rows after current filters and sort.
- Receipt retains complete published row count and source ranks.
- `Effective at` is renamed `Last updated`.
- Repeated methodology/source cards are removed in favor of `/data-sources/`.
- Popular Models and Make It Yours are featured above related category routes.

Remaining immutable regressions:

- Coding immutable included both Score comparison and Cost versus score; current category route only renders Score comparison. Restore the second chart only for rows with both accepted score and price.
- Immutable filters included provider multi-select, evidence state, price range, estimated toggle, and source-supported sort capabilities. Next currently offers search, one provider select, access, and sort. Reintroduce supported filters without fabricating unavailable dimensions.
- Immutable exposed previous/next pagination for long results. With the new top-ten view, provide deliberate page/“show next ten” behavior only if the product wants access beyond the first ten; do not silently discard a source cursor.
- Result tables need compact column widths and vertically centered cells. Mobile must use cards, not a hidden desktop table that becomes inaccessible.
- Charts, tables, filters, actions, and related routes must adapt per lens. Pricing/value/human-preference/media cannot inherit a coding label or unsupported control.
- The source name stays out of hero marketing copy, but the compact receipt and `/data-sources/` registry must preserve attribution.

### `/compare/`

Immutable behavior:

- Searchable add-model picker, two-to-four ordered tray, quick-pair presets.
- Four charts across capability/runtime/economics.
- Exact capability and runtime/route economics tables.
- Decision deltas and source/freshness note.
- Copy/PNG/CSV.

Next gaps (high priority):

- Current route has no Chart.js canvases. Restore capability radar and runtime/economics charts from accepted pair data.
- The native select can contain hundreds of options. Replace it with the shared searchable model picker and keep keyboard selection predictable.
- Restore quick-pair presets using valid current model IDs, not immutable fixture slugs.
- Keep capability and economics tables, but render mobile metric cards instead of forcing 560/760 px scrollers.
- Add exact cache, maximum-output, lifecycle, and source-time fields when supplied.
- Decision-delta prose must compare only compatible available facts and suppress differences that round to the same displayed value.
- Removing a model already updates the ordered `models=` query. Keep minimum-two messaging and prevent duplicates/fifth selection.

### `/compare/<pair>`

Keep the additive static-pair route only if it preserves the same evidence vocabulary and offers:

- Pair switcher/search.
- Canonical link back to `/compare?models=...`.
- Exact metric and route provenance.
- A clear pair-not-found state.

Do not maintain a second comparison calculation with different rounding or missing-value behavior.

### `/subscribe-vs-api/`

The design is approved. Immutable interactions to preserve:

- Provider/plan selection, one-to-four model mix, ratios totaling 100%.
- Conversation/message/day and token inputs.
- Cache-read/cache-write allocation and long-context buffer.
- Character estimate helper and content type.
- Seat and token-volume controls.
- Summary, breakeven chart/table, source-price table, derived line items, method, and export/share/print/reset.

Current source-backed extension:

- Seven provider slots—OpenAI, Anthropic, Google, xAI, Z.ai, Perplexity, Microsoft—replace the immutable three-provider fixture. Keep unavailable plans as honest slots.
- Daily official-page subscription ingestion is the source for reviewed plan and published-limit changes.

Remaining UX gaps:

- Derived line items currently collapse cache components into input/output totals. Restore separate cache-read and cache-write line detail when rates and allocations are accepted.
- Desktop source tables should fit without overflow; mobile may use a labelled scroller or cards.
- Formula and rounding need an expandable exact explanation equivalent to the immutable disclosure.
- A missing positive-allocation cache rate must block only that calculation, explain how setting the allocation to zero changes eligibility, and never substitute standard input price.
- Every input mutation must remain encoded in the canonical URL.

### `/articles/`

Next improvements already accepted:

- Vibrant immutable-style cover with `#1111ff`/`#9dabff` hierarchy.
- Six substantive guides, two clearly labelled prototypes, and 8/6/2/0 channel counts.
- Left-aligned fixed-width channel tabs, non-scrolling topic pills, compact sort, clickable title regions, and secondary-blue metadata/CTAs.

Remaining parity items:

- Immutable sort also offered `Shortest read`; Next currently has Newest, Oldest, and Title A–Z. Restore it.
- Immutable exposed Clear all filters when search/topic/channel state narrowed results. Add a visible reset only when non-default state exists.
- Search, channel, topic, and sort currently use mixed URL/local state. Decide and document canonical sharing semantics; at minimum channel stays query-backed and back/forward-safe.
- Card hover/focus should cover the title region without creating nested links.
- Prototype cards must keep disclosure anchors and never route to an unpublished article.

### `/articles/<slug>/`

Immutable detail pages included numbered sections, desktop on-page navigation, learning summary, exact illustrative tables, occasional chart/disclosure, dual decision CTAs, and related articles.

Next gaps (high priority):

- Current details preserve numbered prose and CTAs but dropped the hybrid-router illustrative chart, its exact values disclosure, and multiple decision tables.
- Cost/routing guides lost exact tables that make assumptions inspectable.
- Restore the sticky desktop “On this page” navigation where the immutable article had it; collapse it accessibly on mobile.
- Related articles need the same metadata and secondary-link treatment as the directory.
- Keep Article and Breadcrumb JSON-LD aligned with the visible canonical URL and updated title/date.
- Do not add source-credit sections to every article; link the global data-source registry where evidence is referenced.

### `/guides/` and `/guides/<slug>/`

- The guide directory may remain a focused subset if all five published guide cards and Subscribe vs API CTA are present.
- Redirects to canonical article details must preserve incoming query/fragment when meaningful and avoid redirect loops.
- Never expose empty/unpublished legacy guide paths.

### `/tools/`

Current and immutable structures are close: one decision-tool directory card leading to Subscribe vs API.

- Preserve the marketing form through the global footer.
- Add future tools only as additive cards; do not embed a duplicate calculator with divergent state.
- Card title, summary, features, and action should be one coherent keyboard path.

### `/llm-price-performance/`

Current parity is strong:

- Category/provider filters, dual price range, Pareto plot, exact leaderboard/details, and method/freshness are present.
- Next now uses Chart.js, which is an approved implementation improvement.

Remaining checks:

- Point click/keyboard activation must open a model detail with current filter context preserved where useful.
- Frontier and non-frontier states require shape plus color.
- Zero price and unavailable price must remain distinct. A literal source zero may display `$0`; missing must display `Unavailable` and must not participate in score-per-dollar division.
- “View all filtered models” disclosure must retain current filter order and not duplicate the summary table.
- Exact source/profile links need descriptive accessible names.

### `/data-sources/` — approved additive route

Initial route now lists the same source allowlist used by ingestion:

- Benchmarks: BenchLM, LiveBench, LMArena.
- Catalog/pricing: OpenRouter, OpenCode Zen, LiteLLM corroboration.
- Daily subscription sources: ChatGPT, Claude, Google AI, Grok, GLM Coding, Perplexity, Microsoft Copilot.

Future enhancement:

- Add live health fields from a safe public receipt endpoint: last successful refresh, active revision, changed/unchanged/review-required state, and last-good age.
- Do not expose R2 keys, raw hashes that are not useful to readers, internal errors, or credentials.
- Keep publisher links, source role, cadence, and publication gate readable without requiring JavaScript.

### `/cost`

- Remains redirect-only to `/subscribe-vs-api/`.
- Do not add a page, stale defaults, or duplicate calculator.

## Interaction flows that must survive final review

1. **Discover → compare:** filter Models, select 2–4 in order, open Compare, remove/add/reorder, share URL, return without losing the set.
2. **Leaderboard → profile:** change supported filters/sort, inspect top ten, switch cards/list, open a profile, return to the same state, export the visible result.
3. **Popular → compare:** filter/category-sort the master table, expand evidence, select 2–4, inspect three economics charts/radar/matrices, open full Compare with ordered IDs.
4. **Make It Yours:** change every weight and SLA filter, verify live rank, copy URL, reload exact state, export the exact submitted matrix, compare selected candidates.
5. **Subscribe vs API:** choose provider/plan/models, rebalance ratios, edit workload/cache/seats/volume, inspect summary/breakeven/raw/derived/method, reload URL, export/print.
6. **Lifecycle:** change horizon/view, inspect event and successor, open affected model, retain event source and last-updated fact.
7. **Articles:** choose channel/topic/search/sort, clear filters, open title/card CTA, use on-page navigation, follow related article, return to preserved directory state.
8. **Global shell:** open each mega menu, dismiss by Escape/outside/link, search language in two columns, switch theme, navigate mobile menu, submit footer validation.

## Data and contract dependencies that affect UX parity

- The frontend cannot replace missing strict endpoints with fixture data. If the production origin lacks a required v1 envelope, the missing endpoint is a producer task, not permission to remove the UI.
- Long per-key leaderboard sources must support cursor traversal or a deliberate bounded first-page contract. Rejecting a valid 200-row page because total is larger leaves human-preference/pricing-context falsely unavailable.
- Popular Models may merge weekly popularity identity/order with exact strict enrichment only by reviewed model identity. A benchmark rank is never a popularity rank.
- Profile/compare need route, cache, runtime, lifecycle, and provenance facts from the same accepted identity/revision join.
- Subscription calculation requires exact plan/model/route bindings. Positive cache allocations require their own rates.
- Null is not zero. “Unavailable”, “not published”, “not verified”, and “no matching row” are different user states and should not collapse into a generic empty card.

## Two-decimal presentation acceptance

- No reader-facing text, chart tooltip, axis label, table cell, card value, downloadable CSV number, or generated comparison sentence may show more than two decimal places.
- Integers and one-decimal source values do not need zero padding.
- Positive values below one cent render `<$0.01`; they never render `$0`.
- URL state may use fixed precision where required for deterministic reconstruction.
- SVG/canvas geometry may retain higher internal coordinate precision because it is not a displayed fact.
- Calculations and persisted evidence retain original precision; rounding happens only at the reader/export boundary.

## Prioritized implementation queue

### P0 — restore decision completeness

1. Profile radar/runtime charts, exact disclosure, full route price matrix, and limitations.
2. Compare radar/runtime/economics charts, searchable picker, quick pairs, mobile exact-value cards.
3. Coding/compatible leaderboard score-versus-cost chart and supported filter capabilities.
4. Home mobile result cards and head-to-head chart.
5. Article detail exact tables/disclosures/on-page navigation.

### P1 — close interaction gaps

1. Popular Models card/list toggle, remaining Chart.js panels, and cursor disclosure.
2. Make It Yours provider search, SLA charts, and shared model picker.
3. Leaderboard directory featured methodology cards and complete route taxonomy.
4. Article Shortest read and conditional Clear filters.
5. Mobile cards for Compare and Subscribe exact tables.

### P2 — polish and resilience

1. Focus return and keyboard tests for menus/pickers/disclosures.
2. 200% zoom and long-translation checks.
3. Dynamic data-source health receipts.
4. Consistent skeletons that reserve layout without pretending data exists.
5. Cross-route screenshot/DOM regression suite in light/dark at desktop, tablet, and 390 px.

## Final human-review gate

Do not call the rebuild complete until a human can review every route family with production-like data and verify:

- All immutable sections or explicit approved replacements are present.
- Every required control changes the intended result.
- Charts and tables agree, including unavailable values.
- Query URLs reconstruct the same state.
- Copy/PNG/CSV operate on the visible result.
- Dark/light/mobile/keyboard behavior is coherent.
- No source name, rank, timestamp, price, lifecycle fact, or subscription limit is inferred from array order or design fixtures.
- The dedicated data-sources page carries source credit without stripping result-level last-updated and scope receipts.
