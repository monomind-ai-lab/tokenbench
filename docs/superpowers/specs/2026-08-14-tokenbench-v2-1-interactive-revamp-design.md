# TokenBench V2.1 Interactive Revamp Design

**Status:** Approved
**Branch:** `ui-revamp-2`  
**Base:** preserved `ui-revamp` commit `096bc7f`  
**Mode:** Operate  
**Primary authority:** TokenBench V2.1 Review-Aligned Revamp Plan  
**Visual and interaction reference:** TokenBench staging dashboard prototype

## Outcome

TokenBench V2.1 will be a routed, crawlable decision engine that faithfully implements the approved six-section architecture and the prototype's interactive charts, cards, tables, filters, and comparison flows. It will retain the existing React, Vite, Cloudflare Pages Functions, D1, R2, SSR, evidence validation, and calculator foundation.

The revamp is not a recolor of V1 and not a direct transplant of the prototype. The prototype is authoritative for quantitative density, page composition, chart anatomy, comparison behavior, compact cards, and terminal-like operating rhythm. Repository data contracts remain authoritative for every displayed fact.

## Approaches considered

### 1. Faithful routed reconstruction — selected

Rebuild the prototype's useful interactions as typed React components inside the existing routed architecture. Charts and tables consume the same selectors, canonical routes retain SSR, and Cloudflare data remains evidence-bound.

This is selected because it satisfies interaction fidelity without losing accessibility, SEO, provenance, or backend safety.

### 2. Direct prototype transplant — rejected

Copying the single-file Tailwind/CDN dashboard would be initially fast but would restore transient tab routing, hard-coded claims, inaccessible canvas-only charts, weak mobile behavior, and third-party runtime dependencies.

### 3. Selective V1 enhancement — rejected

Adding isolated charts to V1 would preserve stability but repeat the failure this revamp corrects: the site structure, page composition, shared comparison state, and interactive operating model would remain incomplete.

## Product and evidence boundary

- Live or build-snapshot repository data supplies model counts, prices, scores, speed, latency, lifecycle facts, sources, and timestamps.
- Prototype figures such as 384 models, −78% savings, 180 tps, named retirements, and featured pair conclusions are layout examples only until current evidence supports them.
- Unknown values display as `Not reported`; explicit contract-level unavailable states may retain `Unavailable` where that is the established vocabulary.
- Source measurements remain distinct from TokenBench calculations and user-configured scenario output.
- Estimated and source-only evidence never receives winner, reviewed, or universal-best semantics.
- The initial reviewed comparison allowlist may be empty. Popular shortcuts can select models, but featured editorial conclusions require evidence-qualified configuration.

## Information architecture

The primary navigation order is:

1. Home — `/`
2. Models — `/models`
3. Leaderboards — `/leaderboards`
4. Compare — `/compare`
5. Subscribe vs API — `/cost`
6. Articles — `/articles`

Required child routes:

- `/models/lifecycle`
- `/models/[model_name]`
- `/leaderboards/[category_name]`
- `/leaderboards/sla`
- `/leaderboards/custom`
- `/models/compare/[model_1]-vs-[model_2]`
- `/cost/calculator`
- `/cost/breakeven`
- `/articles/guides`
- `/articles/guides/[slug]`
- `/articles/insights`
- `/articles/insights/[slug]`

Every visible model identity links to its canonical profile. Arbitrary client filters retain the base route canonical. Deliberate SEO pages retain unique SSR metadata and useful initial HTML.

## Visual system

### Creative north star

**Institutional Quant Terminal.** The interface should feel like a concise research workstation: compact, analytical, direct, and designed for repeated comparison rather than marketing spectacle.

### Foundation

- Light mode is the default.
- Canvas is white `#ffffff`; secondary surfaces use `#f8fafc`.
- Crisp borders use `#e5e7eb` or the compatible slate divider `#e2e8f0`.
- Primary text uses `#0f172a`; supporting text uses `#475569`.
- Plum `#741a66` is the primary action, selection, and editorial accent.
- Provider colors are data encodings and never the sole state channel.
- Dark mode is a synchronized semantic translation, not a separate layout.

### Typography and geometry

- Primary stack: `suisseIntl, "suisseIntl Fallback", "JetBrains Mono", ui-sans-serif, system-ui, -apple-system, sans-serif`.
- Measurement and metadata stack: `"JetBrains Mono", ui-monospace, monospace`.
- Type scale: 11, 12, 14, 16, 18, 20, 24, and 30px.
- Spacing scale: 2, 6, 8, 12, 16, 20, 24, 28, and 40px.
- Radii: 8px controls, 12px panels, 24px feature callouts, and full pills only for badges or compact filters.
- Interactive targets remain at least 44×44 CSS pixels even when the visible control is compact.

### Composition

- Dense section headers, explicit control rows, charts above equivalent tables, compact card grids, and visible evidence timestamps replace large decorative heroes.
- Cards are used for model records, category previews, lifecycle alerts, inspection details, and article entries—not as indiscriminate page scaffolding.
- Quantitative labels use tabular numerals and short mono metadata.
- Light mode contains no accidental black canvas, dark chart backplate, or dark promotional block.

## Shared chart architecture

Add Chart.js as a bundled application dependency rather than a CDN script. A shared chart layer owns:

- light/dark theme colors;
- axes, grid, legend, tooltip, annotation, focus, and reduced-motion defaults;
- provider color mapping;
- chart lifecycle and theme updates;
- accessible inspection state;
- stable dataset identities;
- exact semantic-table output from the same selector.

Required chart primitives:

- price-performance scatter/Pareto chart;
- two- and three-model radar overlay;
- vertical leaderboard index;
- horizontal TTFT and throughput SLA bars;
- subscription/API breakeven lines with crossover annotation.

Canvas output never stands alone. Each chart has an accessible name, a concise written finding, keyboard-operable marks or an equivalent inspection control, and a table derived from the same normalized data.

## Shared comparison state

A typed compare store uses stable model IDs and allows two or three unique selections.

- Models, Leaderboards, model profiles, and Lifecycle can add or remove selections.
- The current selection is visible in a sticky comparison tray after two models are selected.
- The tray presents identities, removal controls, radar overlay, specification deltas, score deltas, and an action into a canonical pair result.
- Three-model exploration remains transient in the tray.
- Canonical result routes remain pairwise and use one deterministic ordering policy.
- Selection may be serialized into non-sensitive URL state where practical.
- Missing metrics remain explicit and never prevent comparison of the evidence that is available.

## Shared inspection, conversion, and observability

One keyboard-accessible inspection card is reused for Pareto points, leaderboard bars, SLA bars, lifecycle records, radar points, and equivalent table/card rows. Its contract is model, provider, selected host, input/output/cache price where available, TTFT, throughput, context, relevant capability score and methodology version, evidence state, source, measured/effective time, freshness, profile link, and compare action. The trigger exposes expanded/selected state; pointer hover is optional enhancement, focus/click is authoritative; dismissal returns focus; unavailable facts remain labeled; and the same record identity drives chart, card, and table inspection.

The Monomind AI Lab Editorial CTA is contextual and delayed. It may appear on Models after meaningful Pareto/catalog or compare-tray interaction, profiles after evidence and workload examples, Lifecycle after a supported migration result, Compare after the useful pair result, Cost after a valid scenario, Guides after actionable content, and Insights only when the topic implies deployment or optimization intent. It never replaces a page's primary decision action. CTA telemetry includes route, preceding action, stable model/content IDs, and variant, but no email, search query, share payload, or workload quantity.

A first-party event adapter owns the page events defined below and honors consent and Do Not Track policy. Runtime monitoring captures route/data failure class, chart-boundary failure, newsletter/calculation validation reason, API latency, source freshness, and Core Web Vitals without recording source-price payloads or user scenario values. Build monitoring records route generation, SSR, and asset failures. Analytics or monitoring failure never blocks a decision surface.

## Page-level surface contracts

Every route below is an independently useful decision surface, not a tab in a single dashboard. The repeated contract headings are intentional: implementation and review must be able to verify each page without inferring behavior from another route.

### Home `/`

**Primary user task.** Understand what TokenBench measures, judge whether the evidence is current enough to use, and choose the next decision tool.

**Components and features.** A compact hero contains the evidence-qualified proposition, current validated endpoint count, Models primary action, and Compare or Cost secondary action. An institutional metric bar shows Tracked Models, Max Cost Savings, Top Speed in tokens per second, and the effective snapshot time. Five preview modules represent Models, Leaderboards, Compare, Subscribe vs API, and Articles. Each preview includes one current finding or explicit unavailable state, a short explanation of the destination, and a real route link. A single-field work-email newsletter block includes consent/privacy copy and inline validation, sending, success, and failure regions.

**Interactions and state.** Preview marks or rows may open the shared inspection card. Every preview also has a clear semantic destination link; an inspection control is its sibling, never an interactive element nested inside that link. Newsletter submission validates format before transport, disables duplicate submissions while pending, preserves the address on recoverable failure, and never opens a modal. Metric or preview interaction must not imply live data when the source is a build snapshot.

**Data and evidence.** The endpoint/model count is selected from the latest complete published revision. Max savings is calculated only across comparable, current price records with its workload assumption disclosed. Top speed uses a verified throughput measurement and exposes host, conditions, and measured time. If no safe aggregate exists, the label remains and the value reads `Not reported`; prototype values such as 384, −78%, and 180 tps are never fallback constants.

**Responsive behavior.** The hero remains compact at 320px, actions stack at narrow widths, metrics reflow from one row to a two-by-two or single-column grid without a hard minimum width, and previews become one ordered column. Newsletter input and submit action stack while retaining 44px targets.

**SSR and no-JavaScript contract.** Initial HTML contains the proposition, metric labels and values/unavailable states, timestamp, all five preview headings and destination links, recent article links, consent copy, and a functioning server-addressed newsletter form or an honest unavailable message. No canvas is required to understand Home.

**States.** A stale snapshot keeps the last valid values with a visible stale notice and time. Partial data affects only its metric or preview. Empty or failed preview data produces a destination-specific explanation and link; it does not collapse the module. Newsletter failures distinguish invalid input, transport failure, rate limit, and service unavailability in an announced status region.

**Analytics.** `home_metric_viewed`, `home_preview_opened` with destination, `newsletter_submit_started`, `newsletter_submitted`, and `newsletter_submit_failed` with non-sensitive reason. Email addresses are never included in analytics.

**Acceptance checks.** All five preview links work by keyboard and pointer; snapshot-derived values match their selectors; unsupported values never render prototype constants; 320px has no horizontal page overflow; newsletter valid, invalid, pending, success, and failure states are announced; initial HTML contains the six primary route links.

**Improvement over the prototype.** Replace mouse-only module `<div>` elements and hard-coded institutional claims with semantic, evidence-qualified preview links that remain useful without JavaScript.

### Cost hub `/cost`

**Primary user task.** Choose between estimating a monthly API-versus-subscription scenario and finding a fee crossover point without confusing the two questions.

**Components and features.** The hub has a short decision guide, a Cost Simulator card, a Breakeven card, a side-by-side explanation of outputs and required inputs, shared data-freshness/source coverage, and links to relevant pricing guides. The simulator card explains line-item scenario estimation; the breakeven card explains seat-fee versus metered-API crossover and explicitly separates subscription capacity evidence.

**Interactions and state.** Each card is a full semantic link with a concise input checklist. If a non-sensitive scenario is already in shared URL state, both cards describe which values will carry forward and allow starting clean. No result is calculated on the hub.

**Data and evidence.** The hub reports the latest usable pricing effective time and number of models/hosts with complete price dimensions. It does not show a savings claim or crossover result unless a user scenario and sufficient evidence exist.

**Responsive behavior.** The two tool cards sit side by side only when their explanations remain readable; otherwise they stack in simulator-then-breakeven order. The comparison explainer becomes labeled rows rather than a clipped table.

**SSR and no-JavaScript contract.** Both tool descriptions, distinctions, source freshness, and links render in initial HTML. The route remains an explanatory hub rather than redirecting automatically.

**States.** Stale pricing shows a caution while preserving navigation. If pricing is unavailable, the tools remain reachable and their cards state that results may be limited. API failure never removes the explanation of which tool to choose.

**Analytics.** `cost_hub_tool_opened` with `calculator` or `breakeven`, `cost_hub_start_clean`, and `cost_hub_shared_state_continued` without token-volume details.

**Acceptance checks.** A first-time user can state the difference between the two tools from the initial HTML; both routes are reachable with JavaScript disabled; no capacity or included-token claim appears without entitlement evidence.

**Improvement over the prototype.** Split the prototype's single breakeven tab into an explicit decision hub and two purpose-built tools, preventing fee comparison from being mistaken for subscription capacity analysis.

### Cost Simulator `/cost/calculator`

**Primary user task.** Build an auditable monthly workload scenario and compare subscription expense with direct API expense using current source prices.

**Components and features.** Preserve the current calculator flow: subscription tier, target model, native or hosted endpoint, request/workload mix, monthly usage, input/output token split, prompt cache reads/writes, applicable long-context tiers, and text/code character-to-token estimation with disclosed factor and manual override. Results include source-price cards, normalized line items, subscription and API totals, difference/range, assumptions, missing-data notes, source links, effective timestamp, share link, print layout, CSV export, and a contextual editorial CTA after a valid result.

**Interactions and state.** Input changes update only dependent results and are debounced where calculation or chart work is expensive. Changing model or host reconciles incompatible price dimensions and asks before discarding a meaningful user override. Character counts can populate token estimates, while a user token override remains authoritative until reset. Share state uses a versioned, non-sensitive URL; print and CSV use the exact displayed scenario and include timestamp and assumptions.

**Data and evidence.** Native and hosted prices remain separate records. Input, output, cache read, cache write, long-context, currency, unit, effective time, and source are never collapsed into one unsupported blended rate. Pure selectors produce token quantities, applicable tier, source-cost line items, subscription fee, and derived totals. Missing price dimensions are excluded with an explanation rather than treated as zero.

**Responsive behavior.** Desktop uses an input/results split with a visible result summary; narrow layouts preserve input order, move the summary after the last required input, and turn wide line items into equivalent labeled cards. Sticky elements must not obscure fields or the 320px viewport.

**SSR and no-JavaScript contract.** Initial HTML contains the default scenario, all labels, current source prices or unavailable states, formula/assumptions, and a semantic default result. A native GET form can re-render a submitted scenario server-side; client enhancement adds immediate updates, sharing, and export without making the calculation canvas-dependent.

**States.** Field-level invalid, incomplete, unsupported tier, missing host price, partial cache data, stale source, conflicting sources, calculation failure, and export failure are distinct. A prior valid result may remain visible with a clear stale-to-input banner while the current scenario is incomplete.

**Analytics.** `cost_input_changed` with field category only, `cost_simulated`, `cost_share_created`, `cost_printed`, `cost_csv_exported`, `cost_validation_failed`, and conditional `editorial_cta_clicked`. Raw workload quantities and share payloads are not sent to analytics.

**Acceptance checks.** Known fixtures reproduce exact line items and totals; source prices are visually and semantically distinct from derived costs; missing cache or long-context prices never become zero; shared URLs round-trip the scenario version; print and CSV match the displayed values; the default and submitted form remain understandable without JavaScript; the editorial CTA is absent until a valid result exists.

**Improvement over the prototype.** Expand the two-control demonstration into the repository's auditable economic model while preserving the prototype's immediate feedback and compact quantitative hierarchy.

### Breakeven Calculator `/cost/breakeven`

**Primary user task.** Find the monthly token volume at which a seat-fee scenario and direct API spend are equal, then understand which option is less expensive on either side.

**Components and features.** Controls include 1–50 seats, $20 per seat per month as the editable default scenario, 0–300M monthly tokens, model, host, workload/input-output mix, caching, long-context applicability, and optional text/code character-to-token estimate. A Chart.js line chart shows the flat subscription fee and API cost curve, crossover annotation, and labeled lower-cost regions. A result summary, formula, rounding policy, source prices, effective date, assumptions, exact semantic table, separate subscription-capacity evidence panel, and contextual editorial CTA after a valid result accompany the chart.

**Interactions and state.** Seat, model, host, and workload changes update the summary, chart, table, and share state from one selector. The token-volume control supports range input plus an exact numeric field. Keyboard users can inspect each sampled point and the crossover. If the crossover is outside 0–300M, the page says so and identifies the cheaper option within the displayed domain instead of pinning a false annotation to an edge.

**Data and evidence.** Fee crossover requires a subscription fee and complete effective API price inputs; it does not require or infer included subscription tokens. Capacity coverage is calculated only from a separately verified fixed-token entitlement and is labeled independently. Price tiers, caches, and long-context rules are applied before the API curve is generated. Rounding occurs only for display, not crossover calculation.

**Responsive behavior.** Controls stack before output at narrow widths. The chart keeps a useful minimum reading height without causing horizontal page overflow; the table is always reachable directly after it. An anchored result summary may remain sticky only above tablet widths.

**SSR and no-JavaScript contract.** Initial HTML renders the default form, fee comparison result or evidence-qualified unavailable state, formula, source prices, sampled result table, and capacity-evidence status. A GET submission re-renders the scenario; Chart.js enhances the same series client-side.

**States.** Invalid seats/volume, missing model price, partial price dimensions, no crossover, crossover outside domain, stale source, conflicting source, and chart-load failure have explicit messages. Chart failure preserves the summary and table. Missing capacity evidence never suppresses an otherwise valid fee crossover.

**Analytics.** `breakeven_input_changed` with field category, `breakeven_calculated`, `breakeven_crossover_inspected`, `breakeven_share_created`, `breakeven_unavailable` with evidence reason only, and conditional `editorial_cta_clicked`.

**Acceptance checks.** Fixtures at 1 and 50 seats and domain endpoints 0 and 300M match the formula; changing input/output mix changes both table and chart identically; out-of-domain and no-crossover cases are truthful; fee and capacity results are never conflated; chart and table remain synchronized in both themes; the editorial CTA follows rather than precedes the result and sources.

**Improvement over the prototype.** Preserve the direct manipulation and crossover visual while correcting the prototype's unsupported assumption that a seat subscription has a known token capacity.

### Models directory `/models`

**Primary user task.** Discover viable models by price, performance, access, and evidence quality, inspect trade-offs, and build a two- or three-model shortlist.

**Components and features.** The page contains a Price-Performance Pareto section, catalog toolbar, Cards/Table catalog, pagination, rich inspection card, sticky comparator, and a contextual editorial CTA that appears only after meaningful Pareto/catalog or compare-tray interaction. Pareto uses a Chart.js scatter plot with blended cost per 1M tokens on X, composite quality on Y, linear/log price control, functional Frontier Only control, frontier explanation, textual/shape frontier marks, and an equivalent table. The catalog toolbar includes search, provider/access/modality/evidence filters, sort, result count, reset, and view switch. Cards and rows show model/profile identity, provider, access, core score, blended price, throughput, context, freshness, and compare action. The sticky comparator shows selected identities/removal, six-axis radar, spec deltas, score deltas, missing-data notes, clear action, and canonical-pair action.

**Interactions and state.** Search, filters, sort, pagination, and view update one shared directory query model and URL state. Pareto inspection highlights the equivalent row/card; selecting a row or mark does not replace the profile link. Compare selection accepts two or three unique stable IDs; adding a fourth requires an explicit replacement choice rather than silently dropping the oldest. Clear/reset announces the change. The comparator appears at two models and retains three-model exploration without inventing a three-model canonical page.

**Data and evidence.** Pure selectors produce eligible records, blended price under the disclosed mix, score family/version, Pareto frontier membership, sort order, page slice, and comparison deltas. Records missing a required Pareto axis remain in the catalog and in a named excluded-record list; they are not plotted at zero. Model counts distinguish total records, filtered results, and plotted results.

**Responsive behavior.** Cards are the narrow default. Filters collapse into an accessible disclosure with active-filter count; result count and reset remain visible. Table mode is available in a named focusable overflow region with sticky model identity on wide layouts, but 320px never depends on horizontal page scrolling. The comparator becomes an in-flow summary/drawer with reachable close and removal controls.

**SSR and no-JavaScript contract.** Initial HTML includes page purpose, current methodology/timestamp, default catalog page, crawlable pagination, profile links, Pareto finding, and the same Pareto data table. Controls are native links/forms where practical; client enhancement adds chart inspection, instant filtering, and sticky compare.

**States.** Loading skeletons preserve table/card geometry. Stale and prior-valid data keep content with a warning. Empty filters show active criteria and Reset. Partial records remain visible with literal missing facts. Total API failure renders a retry plus methodology and navigation; chart failure renders the table and excluded-record explanation.

**Analytics.** `catalog_searched`, `catalog_filtered`, `catalog_sorted`, `catalog_view_changed`, `pareto_scale_changed`, `pareto_frontier_toggled`, `pareto_model_inspected`, `compare_model_added`, `compare_model_removed`, `compare_tray_opened`, and conditional `editorial_cta_clicked` using stable IDs and filter categories only.

**Acceptance checks.** Chart and table use the same selector and frontier membership; linear/log and Frontier Only controls visibly work; filters, count, URL, pagination, cards, and table agree; every model identity links to its profile; compare selection rejects duplicates and handles a fourth selection explicitly; keyboard inspection exposes the same facts as pointer inspection; the editorial CTA is not present in the initial discovery path.

**Improvement over the prototype.** Make the visible but inert Frontier Only control real, replace silent FIFO comparison replacement with an intentional choice, and keep incomplete models discoverable rather than erasing them from the directory.

### Model Lifecycle Radar `/models/lifecycle`

**Primary user task.** Identify models that create near-term production risk, verify retirement evidence, and compare an affected model with a supported migration target.

**Components and features.** A lifecycle summary shows urgent retirements, announced deprecations, monitored models, and snapshot time. Status/date-horizon/provider controls organize records into Action required, Upcoming, Monitoring, and Archived groups. Each record includes model/profile link, provider, status, announcement date, retirement date, source/freshness, migration evidence, replacement/profile link, comparable cost and speed deltas, and Compare migration action. A release timeline covers recent releases and verified 2026 entries. Methodology explains lifecycle terms and what qualifies as a direct migration. A contextual editorial CTA may follow a supported migration recommendation, never an unavailable one.

**Interactions and state.** Search and filters update grouped results and URL state. Records expand to show source, evidence caveats, and delta assumptions. A migration action selects the retiring and replacement models in shared compare state; it does not label a replacement as direct or recommended without evidence. Timeline items link to profiles or relevant insights.

**Data and evidence.** Lifecycle selectors preserve announcement, deprecation, and retirement as separate dates. Replacement IDs require an explicit sourced relationship. Cost/speed deltas are shown only when workload, host, and measurement conditions are comparable; otherwise the fields read `Not reported` with the incompatibility reason. The prompt's named retirement examples are not fixtures.

**Responsive behavior.** Desktop may use a compact grouped table plus inspection panel; below the table breakpoint, ordered cards preserve every field. Groups are collapsible after the first urgent group to prevent extremely long pages, with counts and a Show all control. The release timeline becomes a vertical sequence.

**SSR and no-JavaScript contract.** Initial HTML contains summary counts, urgent/upcoming records, dates or not-reported labels, profile/replacement/source links, methodology, timeline, and crawlable group pagination or expansions. JavaScript enhances filters, disclosure, and compare selection.

**States.** Empty urgent state is positive but still shows monitored coverage and timestamp. Missing dates, missing migration evidence, partial deltas, source conflict, stale lifecycle revision, and total failure are distinct. Archived records never crowd urgent records by default.

**Analytics.** `lifecycle_filter_changed`, `lifecycle_record_opened`, `lifecycle_source_opened`, `lifecycle_replacement_opened`, `lifecycle_compare_started`, `lifecycle_timeline_opened`, and conditional `editorial_cta_clicked`.

**Acceptance checks.** Announcement and retirement dates are never swapped; unsupported migration claims remain absent; all record identities link to profiles; urgent records can be found without scanning the full dataset; card and table forms preserve the same facts; migration compare starts with the intended pair; the editorial CTA requires a supported migration result.

**Improvement over the prototype.** Replace a pair of hard-coded warning cards and an unbounded record wall with evidence-sorted, filterable, grouped lifecycle risk management that scales to the real catalog.

### Model profile `/models/[model_name]`

**Primary user task.** Decide whether a specific model and endpoint are suitable for a production workload, with all limitations and source quality visible.

**Components and features.** The profile includes identity/provider, lifecycle status, modalities/tool support, context and maximum output, evidence freshness, compare action, and source/conflict summary. Benchmark sections show score family/version, domain values, methodology, measured time, and provenance. An endpoint matrix separates native and third-party hosts and shows availability, region where known, feature support, pricing dimensions, TTFT, throughput, measurement conditions, and freshness. Pricing covers input, output, cache read/write, and long-context tiers. Additional sections cover price/performance history, lifecycle change log, workload-aware blended-cost examples, limitations, missing/conflicting evidence, related comparisons, relevant guides/insights, and a contextual editorial CTA after the evidence and workload examples.

**Interactions and state.** Host and workload controls update derived examples but never overwrite source facts. Benchmark and endpoint rows open the shared inspection card/source detail. Compare adds the model to shared state and gives a clear next step when one or two other models are already selected. History controls change period/granularity only when data exists.

**Data and evidence.** The route resolves aliases to one canonical stable model slug. Native model facts and hosted endpoint facts remain separate. Conflicting records show each source and the current selection rule. Derived workload examples disclose mix, host, cache, long-context, tokenizer factor, and rounding. No unavailable metric becomes a zero score or synthetic history point.

**Responsive behavior.** Identity/actions stack cleanly; wide matrices become equivalent host cards or named overflow regions with sticky row labels; benchmark facts use a readable grid; compare controls remain reachable without covering content. History and radar visuals are followed immediately by exact tables.

**SSR and no-JavaScript contract.** Initial HTML contains the canonical identity, lifecycle, limits, benchmark and pricing tables, endpoint evidence, timestamp, missing/conflict states, profile-specific summary, and links. Client charts, inspection, and scenario controls enhance but do not supply the only evidence.

**States.** Unknown slug returns a useful not-found page with search and close matches. Valid profiles handle no endpoints, partial prices, missing speed, benchmark incompatibility, stale data, source conflict, empty history, and API failure independently. A partial profile remains indexable only when it has enough verified identity and useful evidence under repository publication rules.

**Analytics.** `model_profile_viewed`, `profile_host_changed`, `profile_workload_changed`, `profile_source_opened`, `profile_history_changed`, `compare_model_added`, `profile_related_content_opened`, and conditional `editorial_cta_clicked`.

**Acceptance checks.** Canonical/alias behavior is deterministic; native and host facts are not mixed; source-effective times appear with price and performance evidence; charts have exact table equivalents; missing/conflicting states are visible; compare starts with the correct stable ID; every profile has distinct SSR title, summary, evidence, and next action; the editorial CTA follows the useful evidence.

**Improvement over the prototype.** Turn compact catalog facts into a model-specific evidence dossier that distinguishes the model from the endpoint serving it and exposes conflicts instead of flattening them.

### Leaderboards overview `/leaderboards`

**Primary user task.** See category leaders quickly, understand what each ranking measures, and choose a detailed leaderboard to inspect.

**Components and features.** Seven Top 10 summary cards cover Overall, Coding, Agentic, Math, Reasoning, Multimodal, and Latency & Throughput SLA. Each card contains category definition, score family/version, update time, compact 0–100 vertical-bar index or SLA summary, ranked semantic list, provider/model labels, profile links, top-record evidence state, and category-route link. A methodology/source block explains score comparability and why some records are excluded.

**Interactions and state.** Keyboard/pointer inspection of a bar or list entry opens the shared inspection card. A compare action adds the model without blocking the category link. Cards do not reweight globally; custom weighting is entered through its dedicated category route.

**Data and evidence.** Each card selects at most ten eligible records from the same versioned ranking selector used by its detail route. Category cards expose fewer-than-ten coverage honestly. SLA summary applies the default TTFT ≤0.80s and throughput ≥60 tok/s thresholds without changing measurements.

**Responsive behavior.** Cards flow from multi-column to one column; compact charts keep readable labels and are paired with ordered lists. No chart label is the only model identity on mobile.

**SSR and no-JavaScript contract.** All seven headings, definitions, top-ranked lists, profile/category links, score version, methodology, and timestamp render in HTML. Charts are enhancement-only.

**States.** A category with no comparable evidence remains visible with its definition and unavailable explanation. Partial/stale categories are isolated. A page-level failure retains category links and methodology.

**Analytics.** `leaderboard_category_viewed`, `leaderboard_summary_model_inspected`, `leaderboard_category_opened`, and `compare_model_added`.

**Acceptance checks.** Seven cards appear in the required order; each list matches the first ten eligible records on its detail route; every model links to its profile; default SLA eligibility matches the SLA detail route; charts remain understandable through their lists.

**Improvement over the prototype.** Replace one mixed leaderboard tab with a true category directory whose seven independently sourced previews lead to distinct SSR answers.

### Category leaderboard `/leaderboards/[category_name]`

Supported category slugs are `overall`, `coding`, `agentic`, `math`, `reasoning`, and `multimodal`; `sla` and `custom` use the specialized contracts below.

**Primary user task.** Inspect the Top 20 for one named methodology, compare candidates, and understand why records qualify or do not qualify.

**Components and features.** A category header defines the metric, score family/version, measurement/update time, and inclusion policy. The Top 20 Chart.js vertical index uses a 0–100 axis, integer score printed in each column, model labels at 55 degrees where space permits, visible provider labels/colors, and a text-backed reasoning-model marker. Cards/Table controls switch equivalent result presentations. Each record includes rank, profile identity, provider, score, evidence state, freshness, inspect action, and compare selection. Excluded-record and methodology/source sections follow the ranking.

**Interactions and state.** Chart, card, and table selection remain synchronized. Inspection and compare work by keyboard and pointer. View choice may persist locally but does not change canonical content. Pagination or Show more preserves deterministic rank order; filters, if present, are limited to evidence/access/provider and report that the result is a filtered view rather than the canonical Top 20.

**Data and evidence.** Ranking uses one category selector with a fixed methodology version and safe missing-data policy. It never rescales unsupported raw source values into 0–100 without a documented transform. Ties use a documented stable rule and keep source score precision even when bars show integer labels.

**Responsive behavior.** Cards are the narrow default. The vertical chart may scroll inside a named chart region but cannot cause page overflow; an ordered list/table is adjacent. Table mode uses sticky identity only where it improves, not hides, access to evidence.

**SSR and no-JavaScript contract.** Header, methodology, update time, Top 20 semantic ranking, profile links, comparison entry links, and exclusions render initially. Chart.js reproduces the same ranking after hydration.

**States.** Fewer than twenty eligible records, missing score, incomparable methodology, stale ranking, tie, chart failure, and API failure are explicit. A chart error cannot remove the ranked list.

**Analytics.** `leaderboard_model_inspected`, `leaderboard_view_changed`, `leaderboard_page_advanced`, `compare_model_added`, `leaderboard_methodology_opened`, and `leaderboard_exclusions_opened`.

**Acceptance checks.** Bars, cards, and table agree on IDs, order, integer label, and source precision; 55-degree labels do not clip at 1440px; reasoning markers have equivalent text; provider color is not the only identifier; Top 20 and SSR list match exactly.

**Improvement over the prototype.** Preserve the recognizable vertical index while adding per-category routes, exact list parity, exclusions, and methodology instead of treating one client-reweighted chart as every leaderboard.

### SLA leaderboard `/leaderboards/sla`

**Primary user task.** Find models that satisfy both an interactive latency ceiling and throughput floor without changing the underlying measurements.

**Components and features.** Threshold controls default to TTFT ≤0.80s and throughput ≥60 tok/s. A pass-count summary, eligible Cards/Table list, dual horizontal Chart.js bars for TTFT seconds and output tokens per second, inspection card, methodology/conditions, and excluded/missing-measurement section complete the page.

**Interactions and state.** Sliders have paired numeric inputs and Apply/Reset controls; output may preview during input but analytics and URL state update on commit. Both charts highlight the inspected model and use text/status marks for pass/fail. Compare selection operates on eligible and ineligible measured models, while the canonical result clearly identifies current eligibility.

**Data and evidence.** Eligibility is `ttft <= threshold && throughput >= threshold` over measurements that satisfy the page's host and conditions policy. Controls filter records only; they never clamp or rewrite source TTFT/throughput. Missing either measurement produces Incomplete evidence, not Fail.

**Responsive behavior.** Narrow layouts stack controls, summary, TTFT chart/table, then throughput chart/table. Labels and exact values remain visible without relying on chart color, and controls retain 44px targets at 320px.

**SSR and no-JavaScript contract.** Initial HTML contains default thresholds, default eligible list, both measurement tables, conditions, and timestamp. A native form can submit non-default thresholds and render a server result; charts are enhancement-only.

**States.** Empty eligibility is a valid result with Reset. Partial measurement, malformed thresholds, stale data, chart failure, and API failure are explicit and preserve source facts.

**Analytics.** `sla_threshold_previewed`, `sla_applied`, `sla_reset`, `sla_model_inspected`, and `compare_model_added`; raw measurement and threshold payloads are not emitted.

**Acceptance checks.** Default pass set matches the selector; threshold boundary equality passes; incomplete evidence is not counted as failure; charts and tables preserve exact source measurements; no slider update reconstructs unrelated charts; keyboard and numeric input can reproduce every slider value.

**Improvement over the prototype.** Keep dual direct-manipulation charts while adding explicit commit semantics, incomplete-evidence handling, and stable URL/share state instead of re-rendering the whole dashboard on every slider tick.

### Custom leaderboard `/leaderboards/custom`

**Primary user task.** Express a workload's priorities and see a transparent, reproducible composite ranking.

**Components and features.** Six labeled weights cover Agentic, Coding, Reasoning, Math, Multimodal, and **Throughput**. Each slider has a numeric field, current percentage, reset/equalize action, sum indicator, normalization explanation, and methodology version. Results appear as a vertical index plus equivalent Cards/Table ranking with compare selection, per-model contribution breakdown, missing-domain policy, and shareable state.

**Interactions and state.** Weight changes preview rankings and announce the new top result after a short debounce; Apply commits URL and analytics state. Equalize sets a deterministic distribution whose displayed values and internal normalized values are documented. A zero sum blocks calculation and offers Reset to equal weights; it never divides by zero. Inspecting a result shows every domain contribution.

**Data and evidence.** Composite score is `sum(domain_i * weight_i) / sum(weights)` for positive total weight. Throughput enters through a documented bounded normalization derived from eligible source measurements; it is not mixed as raw tokens/second with 0–100 capability scores. Missing-domain inclusion/exclusion is explicit and identical across chart/table.

**Responsive behavior.** Controls become a single readable stack at 320px; results follow controls and retain exact tables. Weight labels, numeric fields, sum, and correction action stay visible without horizontal page overflow.

**SSR and no-JavaScript contract.** Initial HTML contains default weights, formula, methodology, default ranking, and table. A native form can submit supported weight values and return a server-rendered result; the chart and live preview are enhancements.

**States.** Zero sum, negative or out-of-range input, partial domains, fewer eligible models, stale inputs, chart failure, and malformed URL weights are handled explicitly. Invalid input never leaves a prior ranking presented as current.

**Analytics.** `leaderboard_weight_previewed`, `leaderboard_reweighted`, `leaderboard_weights_reset`, `leaderboard_custom_shared`, `leaderboard_contribution_inspected`, and `compare_model_added`; raw URL weight payloads are not emitted.

**Acceptance checks.** Default/equal/reset values are deterministic; zero sum cannot produce NaN or a ranking; normalized Throughput stays within its documented range; contribution rows sum to the displayed composite within rounding tolerance; URL state reproduces the same order; chart, cards, table, and SSR agree.

**Improvement over the prototype.** Replace the conflicting Multilingual sixth slider with the approved Throughput domain and make its unit normalization inspectable, preventing mathematically invalid raw-unit weighting.

### Compare landing `/compare`

**Primary user task.** Select exactly two distinct models and begin a valid canonical comparison, or open an evidence-qualified featured pair.

**Components and features.** Two searchable model selectors, Swap, Clear, popular-model shortcuts, shared-state prefill notice, validation/status copy, disabled Compare action, and featured comparison banners form the page. Selectors show provider, lifecycle, and basic evidence coverage. Featured banners require an allowlisted pair-specific conclusion, effective date, and source coverage; otherwise they render as neutral popular-pair shortcuts without claims.

**Interactions and state.** Selecting the same model in both fields produces an inline error and leaves Compare disabled. Popular-pair actions fill both selectors but do not navigate until the user activates Compare. Shared two- or three-model state prefills the first valid pair and explains any omitted third model. Compare navigates to deterministic canonical order; Swap changes presentation preference only and redirects to the same canonical pair route when submitted.

**Data and evidence.** The model selector uses published stable IDs and profile names. Pair availability does not require complete evidence in every domain, but the landing page reports coverage gaps before navigation. Featured editorial text is never generated from the prototype's hard-coded synthesis.

**Responsive behavior.** Selectors stack with a reachable Swap control; shortcuts wrap as 44px chips/buttons; featured banners become ordered cards. The primary action remains after validation copy in reading and focus order.

**SSR and no-JavaScript contract.** Initial HTML contains both native selectors, popular pair actions, featured/neutral banners, model profile links, and a GET form that resolves to the canonical pair. Shared state is represented in query values when present.

**States.** No models, one model, duplicate pair, unknown shared ID, retired model, partial evidence, empty popular list, and selector-data failure are explicit. A selector-data failure retains direct model-directory and known canonical comparison links.

**Analytics.** `compare_selector_changed`, `compare_pair_swapped`, `compare_popular_pair_selected`, `compare_prefill_used`, `compare_validation_failed`, and `comparison_started`.

**Acceptance checks.** Exactly two unique IDs are required; disabled state is both semantic and visual; shared 2–3 selection prefills predictably; popular shortcuts do not imply endorsement; form submission reaches one canonical URL with or without JavaScript.

**Improvement over the prototype.** Separate pair selection from result synthesis, add an explicit valid action, and prevent selector changes from instantly publishing unsupported winner copy.

### Comparison result `/models/compare/[model_1]-vs-[model_2]`

**Primary user task.** Understand the consequential differences between two models for a chosen workload and identify the next viable action.

**Components and features.** The result begins with pair identities/profile links, evidence freshness, pair-specific summary, Swap/edit action, and missing-evidence status. A six-axis radar overlay is followed by exact capability table. Specification and score-delta tables cover cost, speed, TTFT, context/output, lifecycle, modalities/capabilities, benchmark domains, and host availability. Workload and host controls update derived comparisons. A synthesis section separates observed facts, TokenBench calculations, and editorial conclusion; alternatives explain why they are relevant. Sources/methodology precede a contextual Monomind CTA.

**Interactions and state.** Radar points, delta rows, and sources use the shared inspection pattern. Host/workload changes update only compatible derived rows and the URL scenario fragment; source facts remain unchanged. Edit comparison returns to `/compare` with the pair. Add alternative can replace A or B intentionally. CTA appears after useful evidence and is attributed to the preceding comparison action.

**Data and evidence.** Canonical ordering sorts normalized stable slugs lexicographically; reverse-order requests issue a permanent redirect while the visible A/B labels remain deterministic. Pair synthesis is generated from evidence-qualified rules and reviewed copy, not generic winner logic. Missing or incompatible benchmarks remain in the table with reasons. Delta direction labels account for whether lower or higher is better and preserve source precision.

**Responsive behavior.** Pair header and controls stack; radar and tables remain adjacent in reading order; wide delta tables become labeled comparison cards or a focusable overflow region with sticky specification labels. CTA never precedes sources or core output.

**SSR and no-JavaScript contract.** Initial HTML has pair-specific title, summary, conclusion or insufficient-evidence statement, exact tables, methodology, sources, alternatives, profile links, canonical metadata, and default workload/host result. Chart and instant controls are enhancements.

**States.** Same-model, unknown slug, alias, reverse order, retired model, no comparable prices, incompatible score family, partial host data, stale source, synthesis unavailable, chart failure, and total API failure have route-specific handling. A partial comparison still shows every valid row and explains exclusions.

**Analytics.** `comparison_completed`, `comparison_dimension_inspected`, `comparison_workload_changed`, `comparison_host_changed`, `comparison_source_opened`, `comparison_alternative_selected`, and `editorial_cta_clicked` with stable pair IDs and no workload quantities.

**Acceptance checks.** A-vs-B and B-vs-A resolve to one canonical URL; radar/table IDs and values agree; lower-is-better deltas are worded correctly; missing dimensions cannot create a winner claim; each indexed pair has unique SSR title, synthesis, evidence block, and next action; CTA follows the result.

**Improvement over the prototype.** Replace template arithmetic and universal hybrid-routing copy with pair-specific, provenance-aware synthesis that can honestly conclude that evidence is insufficient.

### Articles hub `/articles`

**Primary user task.** Choose between practical decision guides and time-sensitive market/model insights, then find current content by topic.

**Components and features.** A concise split introduces Guides and LLM Insights. Featured content, recent updates, topic filters, publication/update dates, reading time where supported, and related decision-tool links appear in semantic article cards. Guides and Insights use distinct labels and descriptions rather than one mixed grid.

**Interactions and state.** Topic filters update URL state and result count; Featured and Recent are explicit sort/view choices. Cards link to crawlable article pages. Related model/tool actions preserve relevant non-sensitive context but never replace the article link.

**Data and evidence.** Editorial records distinguish content type, publication date, update date, author/reviewer, topic, related stable IDs, source set, and factual-review status. A recent date is not fabricated for undated migrated content.

**Responsive behavior.** The Guides/Insights choice remains first in reading order; filters wrap or become a labeled disclosure; article cards use one column at narrow widths and preserve dates and type labels.

**SSR and no-JavaScript contract.** The split, featured/recent lists, dates, topic links, and article/detail links render initially. Filter links produce crawlable or base-canonical server-rendered results according to SEO policy.

**States.** Empty topic, no featured content, stale editorial index, partial metadata, and load failure preserve the Guides/Insights entry links and explain what is unavailable.

**Analytics.** `articles_channel_opened`, `articles_topic_filtered`, `article_opened`, and `article_tool_opened`.

**Acceptance checks.** Guides and Insights are visually and semantically distinct; every card exposes a publication or update status; filters and URL agree; article links work without JavaScript; featured status is editorial data, not inferred from recency.

**Improvement over the prototype.** Replace a three-card marketing grid with a navigable, dated editorial index that makes evergreen guidance and time-sensitive analysis unmistakably different.

### Guides index and detail `/articles/guides` and `/articles/guides/[slug]`

**Primary user task.** Answer a concrete architecture or cost decision with a reproducible framework, then open the relevant model or tool.

**Components and features.** The index covers Claude 3.5 Sonnet + DeepSeek V3 Hybrid Router, Hybrid Routers, Prompt Caching ROI/Economics, Self-Hosting 70B Models, Native API vs Third-Party Hosts, Tokenizer Efficiency for Text and Code, Model Retirement Migration, and Production Model Selection. Each guide detail has breadcrumb, decision question, concise answer/recommendation, assumptions, framework or steps, evidence/source blocks, limitations, last-updated date, related guides, related model/comparison/lifecycle/cost links, and editorial CTA only after useful content.

**Interactions and state.** Index topic filters and related links are normal crawlable navigation. Interactive examples may prefill Cost or Compare using versioned, non-sensitive parameters. Table of contents tracks reading position without hiding headings; source disclosures remain keyboard accessible.

**Data and evidence.** Observed facts, calculations/examples, and editorial recommendations are labeled separately. Time-sensitive prices and model facts reference current evidence or display the article's effective date. A guide is not published from speculative assumptions or unsupported prototype claims.

**Responsive behavior.** Article body uses a readable measure; table of contents becomes an in-flow disclosure; wide comparison tables become equivalent labeled cards or focusable regions; related tools and CTA stack after the article.

**SSR and no-JavaScript contract.** Complete article content, headings, dates, author/reviewer, sources, related links, structured Article/Breadcrumb data, and CTA render in HTML. Interactive calculators are optional enhancements or links to the full tools.

**States.** Unknown slug provides guide search/index links. Migrated article with stale facts shows a review banner. Missing related model or tool removes only that link; source-load failure does not erase authored content but may mark live fact callouts unavailable.

**Analytics.** `guide_viewed`, `guide_toc_opened`, `guide_source_opened`, `article_tool_opened`, `guide_related_opened`, and `editorial_cta_clicked` with content ID.

**Acceptance checks.** All eight required topics are present; every guide includes the decision question, assumptions, framework, updated date, sources, related decision link, and delayed CTA; article remains readable without JavaScript; facts and recommendations are distinguishable in text and markup.

**Improvement over the prototype.** Turn brief article teasers into decision documents that expose assumptions and hand readers directly into reproducible TokenBench scenarios.

### Insights index and detail `/articles/insights` and `/articles/insights/[slug]`

**Primary user task.** Understand a model release, benchmark change, pricing update, or lifecycle event and assess its practical consequence.

**Components and features.** The index groups Releases, Benchmark Analyses, Pricing Changes, Lifecycle Announcements, and Ecosystem/Technical Insights. Detail pages include factual brief, what changed, evidence/source timeline, TokenBench interpretation, affected models/hosts, practical implications, publication and update dates, corrections history where applicable, related profile/leaderboard/lifecycle/compare/cost links, and contextual CTA only when deployment intent is relevant.

**Interactions and state.** Topic/date filters use URL state. Evidence timeline items link to primary sources; affected model chips link to profiles and may start comparison. Corrections expand inline and remain permanently addressable. Editorial CTA is omitted when the content does not support a relevant action.

**Data and evidence.** Fact blocks cite primary evidence and effective dates; observed facts and editorial interpretation are programmatically labeled and visually distinct. Benchmark analyses name methodology versions and comparability limits. Pricing changes distinguish announcement, effective date, currency/unit, old value, and new value. Lifecycle announcements distinguish announcement and retirement dates.

**Responsive behavior.** Timeline becomes a single vertical sequence; fact/interpretation columns stack with labels preserved; affected-model and related-tool areas wrap without truncating identities.

**SSR and no-JavaScript contract.** Index entries and complete insight details, dates, fact/editorial labels, sources, affected-model links, structured Article data, and corrections render in HTML.

**States.** Unconfirmed report remains unpublished or clearly marked developing and non-canonical. Missing primary source, superseded fact, correction, partial affected-model mapping, and unknown slug are explicit. A live-data failure cannot silently substitute stale market claims.

**Analytics.** `insight_viewed`, `insight_topic_filtered`, `insight_source_opened`, `insight_affected_model_opened`, `article_tool_opened`, `insight_correction_opened`, and conditional `editorial_cta_clicked`.

**Acceptance checks.** Each insight belongs to one primary channel; publication and update dates are visible; fact and interpretation sections are programmatically labeled; price/lifecycle dates retain their distinct meanings; affected model links resolve; no CTA appears before the useful analysis or without relevant intent.

**Improvement over the prototype.** Establish an auditable market-intelligence channel with corrections and fact/editorial separation instead of treating all articles as evergreen promotional cards.

## Data flow

1. Cloudflare Pages Functions read the existing D1/R2-backed APIs without preview writes.
2. Existing validators accept only complete published revisions.
3. Route loaders normalize API contracts into page view models.
4. Pure selectors calculate Pareto membership, blended price, custom ranking, SLA eligibility, comparison deltas, and breakeven series.
5. React components render controls, charts, cards, and tables from those selectors.
6. SSR renders the default answer, evidence block, timestamp, methodology, and next action.
7. Client controls update URL/share state and charts without replacing canonical content.

## Error and edge states

- Loading, stale, prior-valid fallback, empty, unavailable, partial, conflict, validation failure, API failure, and retry states have explicit copy.
- Missing facts never become zero.
- Custom weights prevent divide-by-zero.
- Duplicate or same-model comparisons are rejected before navigation.
- Chart failure leaves the written finding and exact table usable.
- Unknown routes and slugs render a useful SSR 404 with the attempted identity, close matches where safe, and links to Home, Models, Leaderboards, Compare, Cost, and Articles; the client must never return a blank page.
- No-JavaScript output remains understandable and linked.
- Theme changes, high zoom, localization growth, reduced motion, keyboard focus, touch, print, and 320px layouts are first-class QA states.

## Backend and preview safety

- `ui-revamp` remains preserved.
- All V2.1 work occurs on `ui-revamp-2` in the existing isolated worktree.
- Preview deploys may read the existing TokenBench Pages bindings.
- No production D1, R2, Worker, domain, migration, or ingestion mutation is authorized by this design.
- If a required interaction needs a write-capable backend change, implementation stops and proposes isolated preview resources separately.

## Testing and acceptance

Implementation follows TDD with scoped commits and review gates.

Automated coverage includes:

- pure chart selectors and calculations;
- Chart.js theme adapter and lifecycle;
- route and canonical contracts;
- shared comparison state and pair ordering;
- Cards/Table parity;
- custom weights and zero-sum handling;
- SLA threshold behavior;
- breakeven endpoints and crossover table parity;
- SSR initial content;
- no-data, partial-data, stale, and failure states;
- accessibility names and semantic alternatives.

Browser coverage includes 1440px, intermediate/tablet, and 320px; light and dark themes; keyboard and pointer inspection; open mobile navigation; focus visibility; reduced motion; chart failure; no JavaScript; and print-safe output.

Impeccable QA is bounded to one desktop/mobile inspection batch, one fix batch, and one confirmation batch. Full tests, type-check, production build, route smoke tests, and clean-diff verification gate the preview deployment.

## Baseline note

The preserved base has 1,660 tests. A full four-worker baseline run produced three timeout-only failures under resource contention. Each failing case passes independently with one worker: the two UI cases complete in 165ms and 1.38s, and the 200-page ingestion boundary completes in 48.39s under its 60-second test limit. V2.1 verification must distinguish deterministic failures from this known full-suite timing sensitivity.

## Decisions resolved

- Sixth Custom Leaderboard domain: **Throughput**.
- Visual approach: faithful routed reconstruction.
- Light mode: default white institutional terminal.
- Dark mode: synchronized semantic translation.
- Prototype role: interaction and composition authority, not factual authority.
- Comparison: two-to-three-model transient exploration; canonical pairwise results.
- Backend: preview reads only; no production mutation.

## Definition of done

V2.1 is complete when all six primary sections and child routes exist; every V2.1 requirement is implemented or explicitly recorded; the required interactive charts and controls function from verified selectors; SSR remains useful; all model links and shared comparison flows work; mobile, theme, accessibility, failure, and no-JavaScript states pass; the prior revamp remains recoverable; and a separate Cloudflare Pages preview is smoke-tested without production backend mutation.
