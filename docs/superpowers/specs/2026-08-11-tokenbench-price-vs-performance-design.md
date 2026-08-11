# TokenBench Price vs Performance

**Date:** 2026-08-11  
**Status:** Approved design, pending written-spec review  
**Release:** 4 of 4

## Outcome

`/llm-price-performance/` helps visitors inspect the relationship between current public benchmark evidence and direct API price. It renders a source-backed scatter chart, a Pareto efficiency frontier, and an accessible ranked table without declaring a universal winner.

The page follows the useful interaction model of [BenchLM's Price vs Performance page](https://benchlm.ai/llm-price-performance) while using TokenBench's corrected score, price, provenance, fallback, accessibility, and SEO contracts.

## Data eligibility

A chart point requires:

- a current or explicitly included archived durable model record;
- a public score for the selected overall/category lane;
- a valid non-negative direct API input and output price for the selected route;
- complete score and price source attribution;
- compatible units and methodology identity.

Missing scores or prices are unavailable, not zero. A zero price is accepted only when the source explicitly publishes zero and the UI identifies it; ratio metrics for zero cost are excluded or labelled not finite rather than shown as infinity.

The default view includes current models only and one representative per model family to control overplotting. A visible `All model variants` control includes every eligible current variant. Archived models require an explicit filter.

## Score axis

The score selector supports:

- overall;
- agentic;
- coding;
- reasoning;
- knowledge;
- multimodal;
- mathematics;
- multilingual;
- instruction following.

Overall and categories use the canonical public source lane approved in Release 1. Categories that are measured but non-rankable can appear only when the source value is publicly displayable and the page labels the state. Missing categories do not create points.

## Cost basis

The default cost basis is output price per one million tokens.

The `3:1 blended` basis represents three input tokens for every output token:

```text
blendedPrice3to1 = (3 × inputPrice + outputPrice) / 4
```

Cached-input, batch, subscription, and routing discounts are outside the base chart. Route selection is explicit when a model has multiple direct API prices. The point and table expose the chosen provider/route and link its source.

## Filters and URL state

The page supports:

- score axis;
- output-only or 3:1 blended cost;
- creator/provider;
- source type;
- price band;
- evidence status;
- one-per-family or all variants;
- current or archived state.

Normalized filter state is shareable in the URL. Invalid or obsolete values fall back to defaults and replace the URL with the normalized encoding. Filter parameter pages are canonicalized to the base route and are not emitted in sitemaps.

## Scatter chart

The x-axis is selected USD price per million tokens and the y-axis is the selected score. Log scaling may be offered when the eligible price range makes linear inspection unusable; the active scale is visible and encoded in share state.

Each point provides:

- model and creator;
- score and score lane;
- price and cost basis;
- provider/route;
- evidence status;
- link to the model profile.

Hover is supplemental. Keyboard focus and touch activation expose the same details. The chart has axis titles, tick labels, legend, visible focus, non-color point differentiation where statuses differ, and a screen-reader summary.

## Pareto efficiency frontier

A model is Pareto-efficient when no other eligible point has both an equal-or-higher score and equal-or-lower cost with at least one strict improvement.

The algorithm:

1. removes ineligible and non-finite points;
2. orders by cost ascending, score descending, and canonical model key for deterministic ties;
3. walks the order while retaining points whose score strictly exceeds the highest prior score;
4. groups exact score/cost ties consistently so equivalent points receive the same frontier state.

Frontier styling is an analytical aid, not a recommendation. The page explains that latency, context, tool support, safety, reliability, and workload fit remain outside this two-dimensional view.

## Value table

An accessible table mirrors the filtered chart and provides at least:

- model;
- public score;
- selected cost;
- score per dollar where finite;
- provider/route;
- evidence status;
- frontier status;
- model-profile link.

The default ranked summary shows ten low-cost score leaders using deterministic ordering. `scorePerDollar = score / selectedCost` is labelled a narrow comparison aid. It is not used as a universal recommendation.

At mobile widths, cards may replace the wide table only when they preserve every decision fact and accessible relationship.

## Server contract and fallback

The API joins the active corrected score projection with validated price checks and durable model identity. It returns one envelope containing:

- revision, publication, and freshness;
- score methodology and cost-basis definitions;
- available filter capabilities;
- eligible point records;
- source attribution.

The server materializes the default view and may derive bounded filtered views from the complete validated projection. It follows the shared fresh cache → active revision → stale materialized response sequence. The browser follows with its last validated local envelope. A refresh failure never clears an already valid chart/table.

## SEO and initial HTML

The initial response includes substantive explanatory copy, the default top table, source/methodology context, update time, and links without requiring client JavaScript.

Metadata includes:

- unique title and description;
- canonical `/llm-price-performance/`;
- Open Graph and Twitter metadata;
- `WebPage` and `Dataset` JSON-LD describing the score/cost comparison, methodology version, source attribution, and modification date.

The base page is indexed. Filter URLs canonicalize to the base and use intentional robots behavior that prevents low-value duplicate indexing.

## Error behavior

- No eligible point for one category shows a category-specific empty result without clearing filter controls or source context.
- One invalid model/price record is excluded and logged; it cannot invalidate unrelated valid points unless revision integrity is compromised.
- Chart rendering failure leaves the accessible table visible.
- Stale data displays the last valid revision and checked time.
- Unknown query values normalize safely.

## Acceptance criteria

- Output-only and 3:1 formulas have exact unit tests, including zero, decimal, and large bounded prices.
- Pareto tests cover dominance, equal cost, equal score, exact ties, deterministic order, missing facts, and zero price.
- Overall and each category use the same public score contract as Leaderboards and model profiles.
- GPT-5.6 Sol coding point uses `77.95` internally and displays `78.0`.
- One-per-family and all-variants modes include the correct deterministic records.
- Every chart point has keyboard/touch details and a profile link.
- The accessible table contains equivalent values and frontier state.
- Filtering updates the normalized share URL without creating sitemap entries.
- Initial HTML contains substantive default data, H1, metadata, canonical, and JSON-LD.
- Fresh, stale-server, stale-browser, category-empty, chart-failure/table-fallback, desktop, mobile, and no-horizontal-overflow tests pass.

## Deployment gate

Run score/price join tests, frontier and formula tests, API contracts, accessibility tests, TypeScript, build, and desktop/mobile browser suites. Deploy Pages and any required benchmark projection changes. Verify the default and coding views, both cost bases, filters, frontier, table parity, multiple model links, metadata, structured data, source links, stale fallback, console, and responsive behavior. This release completes the progressive suite only after the live checks pass.

