# TokenBench immutable route matrix

Last reconciled: 2026-08-21

Immutable authority: `https://8bf19b96.tokenbench-27t.pages.dev/`

Production canonical: `https://tokenbench.monomind.one`

Status legend: `audited` means the immutable behavior is recorded; it does not mean the Next.js rebuild or visual approval is complete. Only the explicitly marked design approvals below are closed to visual redesign.

| Route family | Audit | Next.js rebuild | Core preservation gate |
| --- | --- | --- | --- |
| `/` | audited | strict data wired; design approval and production review pending | Hero plus sections 01–05 in the immutable order; four workbench filters; radar; subscription slider; three research cards; latest global shell/footer form |
| `/models/` | audited | strict data wired and build-checked; design approval pending | Hero metrics; frontier chart and toggles; 2–4 quick comparison; search/access/provider/sort/reset; response-backed catalog; card/list views; selection tray; copy/PNG/CSV; lifecycle context; release timeline |
| `/model-profile?model=<slug>` | audited | strict data wired and build-checked; design approval pending | Exact requested profile; explicit invalid ID state; capability/runtime charts; exact values; limits/lifecycle; endpoint pricing; workload example; provenance; copy/PNG/CSV |
| `/models/<slug>/` | audited | implemented and build-checked; design approval and production data review pending | Dynamic profile coverage for all 4,455 sitemap entries; source/price ledger; comparison links; explicit unavailable states |
| `/popular-models/` | audited | exact three-section parity and live weekly/strict merge implemented; design approval pending | `01` Leaderboard with one-row controls, fixed category tags, and complete compact table; `02` Insights with two charts; full-width `03` Compare with three economics charts; weekly popularity order; strict capability/economics enrichment; unavailable slots; deployed-data review remains |
| `/make-it-yours/` | audited | implemented and evidence-preview checked; design approval and production data review pending | Exact six-weight/filter matrix; shareable custom ranking; no weight normalization drift |
| `/model-lifecycle/` | audited | catalog lifecycle wired; design approval and deployed-data review pending | Metrics; response-backed expiration events; All/90/60 horizon filters; card/table toggle; copy/PNG/CSV; release timeline; evidence boundary |
| `/leaderboards/` and 14 published child routes | audited | visual design approved; do not reopen | Category directory plus route-specific charts/tables, defaults, filters, provenance, copy/CSV/share actions, and desktop-table/mobile-card behavior; only data wiring/availability verification remains |
| `/compare/` | audited | strict data wired and build-checked; design approval pending | URL-backed 2–4 distinct selections; invalid/duplicate rejection and four-model bound; capability chart/table; economics charts; decision table; provenance; copy/PNG/CSV |
| `/compare/<pair>` | audited | implemented and build-checked; design approval and exact-pair production data review pending | All 29 published pairs; evidence skeleton; share dialog; switch-pair comboboxes; pricing-route variance; explicit unavailable/not-verified state |
| `/subscribe-vs-api/` | audited | visual design approved; reviewed catalog/calculation wired | Existing simulator preserved: seven provider slots; reviewed plan/usage-limit facts; exact direct-route model mix; URL-backed workload/cache/seats/volume; summary; breakeven chart/table; source/derived tables; formula; CSV/PNG/print/copy |
| `/cost` | audited | implemented and build-checked | Redirect-only to `/subscribe-vs-api/`; do not assert a stale default provider, plan, model, or price in the redirect |
| `/tools/` | audited | implemented; build-checked; design approval pending | Static tool directory; one subscription-versus-API card; no embedded replacement calculator |
| `/llm-price-performance/` | audited | validated endpoint wired; design approval pending | URL-backed lane/creator/price filters; interactive Pareto chart and model dialog; full leaderboard/details; null/zero semantics |
| `/articles/` | audited | immutable-style cover/chrome adaptation implemented and QA-checked; design approval pending | Eight index cards; six substantive guides plus two prototype insight concepts; tabs 8/6/2/0; topics; search; compact sort; clickable titles; prototype disclosure; empty state |
| `/articles/<six published slugs>` | audited | implemented and QA-checked; design approval pending | Breadcrumb, learning summary, numbered sections, dual CTAs, desktop TOC, related content, latest global shell, Article/Breadcrumb JSON-LD |
| `/guides/` | audited | implemented and QA-checked; design approval pending | Five field-guide cards and subscribe-versus-API CTA |
| `/guides/<five published slugs>/` | audited | implemented and redirect-checked; design approval pending | Redirect to canonical `/articles/<slug>/` detail |

## Finalized approval policy

- The user-approved visual designs for `/leaderboards/` and all 14 published leaderboard children are closed to redesign. Preserve them; only strict-v1 data wiring, unavailable-state truthfulness, and verification remain.
- The user-approved visual design for `/subscribe-vs-api/` is likewise closed to redesign. Preserve every section, input, calculation/result slot, and action while data sources are wired.
- Every other matrix entry remains subject to immutable-parity approval. New Next.js tokens may restyle a preserved section; they may not remove, merge, replace, or fabricate its content, controls, charts, outputs, URL semantics, or explicit unavailable state.
- The ordered implementation/acceptance queue is maintained in `unapproved-page-parity-backlog.md`.

## Landing page: immutable section order

1. Hero and decision snapshot.
2. `01` Discover & Filter Models.
3. `02` Popular Model Insights.
4. `03` Head-to-Head Capability & Economics.
5. `04` Subscription vs. Pay-As-You-Go API Analysis.
6. `05` Methodological Research & Analysis.
7. Global footer and marketing form.

The Next.js foundation currently renders this complete order with the approved AI Component token language. The homepage subscription slider is an immutable landing section, not the additive generic API calculator and not a replacement for `/subscribe-vs-api/`.

## Models workbench contract

- Hero metrics: response-backed visible/frontier counts and ordered selection state from zero to four. The immutable 30-row design fixture is not a production cutoff.
- Frontier canvas: price/evidence scatter chart, frontier-only toggle, logarithmic price toggle, and explicit exclusion of unavailable data rather than zero substitution.
- Quick comparison: choose two to four distinct models and carry their ordered slugs to `/compare?models=...`.
- Catalog: search, provider filter, access filter, sort, reset, card/list toggle, every returned model (up to the v1 page maximum), profile links, and a persistent comparison tray.
- Result actions: copy the current link, download the result section as PNG, and export the filtered records as CSV.
- Closing sections: lifecycle migration context and recent release timeline.
- Immutable catalog filter state is local to the page rather than query-backed; only the ordered comparison selection becomes URL state.

## Popular Models strict-v1 workbench

- Exact immutable section order is implemented: `01` **Leaderboard** with its
  master table, `02` **Insights** with its two charts, and `03` **Compare** with
  its three economics charts. This is parity implementation, not design approval.
- `/popular-models/` is a weekly-popularity workbench rather than a fixed local
  list. Production order and displayed rank come only from the validated weekly
  directory response. Exact slug/model-ID matches may enrich those rows with
  strict `ui-data-contract/v1` capability, taxonomy, task-economics, release,
  route, and runtime facts. A strict benchmark rank is never relabeled as a
  popularity rank, and a missing weekly source makes the route unavailable.
- The underlying contract retains release, provenance/license, total, and
  next-cursor state when published, but the visible route uses neutral benchmark
  language. Dataset and contract names are reserved for a future credits route.
- Category controls and table slots are fixed to `All`, Reasoning, Coding,
  Agentic coding, Mathematics, Data analysis, Language, and Instruction
  following. Published aliases map into those slots; missing values remain
  visible as unavailable rather than collapsing the table.
- Search, provider, open-weights, disabled finetune availability, provider
  visibility, category, sort, expanded evidence, Chart.js insights, ordered
  two-to-four-model comparison, copy-link, PNG, and CSV actions are present.
  The comparison selection and supported controls retain query state.
- Selected-route pricing is separate evidence; its disclosed 50/50 input/output
  view is never substituted for LiveBench economics. Runtime is explicit when
  unavailable. Lifecycle is not inferred by the ranking surface and remains a
  separate lifecycle-source dependency.
- Focused implementation and local design-evidence checks are recorded in
  `popular-models-next.md`. They do not constitute route-level visual approval;
  a full cross-page review is mandatory after real production data wiring.

## Model profile distinction

- `/model-profile?model=<id>` is the richer fixture/workbench profile: hero and compare action, metrics, capability radar, SLA TTFT/TPS charts, identity/limits/lifecycle, endpoint price matrix, workload example, history/conflicts, and CTA.
- `/models/<slug>/` is the generated evidence product for 4,455 sitemap slugs: hero, radar with unavailable axes, category scores, route-attributed pricing/specifications, source ledger, and related comparison links.
- Source-only and not-found profiles are explicit states. Neither form may coerce unknown metrics to zero.

## Leaderboard variation contract

- `/leaderboards/` remains a decision-method directory, not a generic leaderboard instance.
- The user approved the Next.js directory visual design and information architecture, and the visual design of every published child route. Do not reopen either visual design; data wiring and explicit unavailable-state verification remain open.
- LLM child routes preserve their individual visualizations and default query contracts: overall uses `profile=balanced&sort=score-desc`, value uses `profile=balanced&sort=pareto-score-desc`, pricing context uses `profile=balanced&sort=price-asc`, and human-preference uses `profile=balanced&sort=rank-asc`.
- Multimodal and media routes preserve their route-specific chart counts, evidence notes, ranking rows, and `profile=balanced&sort=rank-asc` default where published.
- Desktop results use full tables while mobile results use the immutable card presentation; this responsive behavior is not satisfied by merely scrolling a desktop table.
- CSV downloads retain active query state. Share URLs preserve non-default state while omitting the default profile where the immutable site does so.
- In evidence mode the Next child routes retain the exact strict
  `ui-data-contract/v1` preview path. In HTTP/production mode each child loads
  its published `/api/benchmarks/leaderboards/:key` response, validates the
  route/profile/pagination/capability receipt, and projects the complete page
  without falling back to a generic ranking. Unsupported LMArena/media source
  lenses remain explicit unavailable surfaces until their producers exist.

## Compare workbench contract

- Query: comma-separated `models`.
- Minimum two, maximum four distinct accepted slugs.
- Remove unknowns and duplicates, truncate after four, and rewrite canonical URL state.
- Result order: review result, actions, radar, exact capabilities, runtime/economics charts, decision deltas, source/freshness note.
- Actions: copy link, PNG, CSV.
- Static pair pages retain shared-metric visualization and table, source metrics, pricing/context, provenance, related comparisons, and pair switching.
- Unknown pairs render an explicit comparison-not-found page.

## Subscribe-versus-API URL contract

The visual design is approved and is not a redesign target. Preserve this complete contract while reviewed provider/catalog data is wired; data work must not replace any simulator section or interaction.

Stable workload defaults:

```text
provider=openai
conversationsPerDay=5
messagesPerConversation=8
activeDays=22
inputTokensPerMessage=1200
outputTokensPerMessage=350
cacheReadShare=20
cacheWriteShare=5
seats=1
tokenVolume=0
inputCharactersPerMessage=4800
outputCharactersPerMessage=1400
contentType=text
longContext=0
```

`plan`, `models`, and `mix` remain canonical URL parameters, but their values are
now reconciled against the reviewed catalog response. The former illustrative
`individual`/`gpt-4o` fallback is not asserted as a current plan/model fact. A
provider with no reviewed plan keeps the selector slot and an explicit
unavailable state.

Behavioral gates:

- Unknown provider resets to OpenAI; an unavailable plan selects the first reviewed plan for that provider, when one exists.
- Models are capped at four; invalid model IDs are discarded.
- Invalid/malformed mixes rebalance accepted models to exactly 100%; a single model remains fixed at 100%.
- Out-of-range URL input values reset to defaults rather than clamp.
- Cache-read allocation has priority; cache-write is reduced so total input allocation never exceeds 100%.
- A positive cache allocation requires its own reviewed rate. A missing rate is
  not replaced with the standard-input price; setting that allocation to zero
  allows an otherwise complete direct-route calculation.
- Character estimates use 4 characters/token for text and 3 for code.
- Long context is an explicit +50% input-token scenario buffer.
- Every valid input change updates the URL and all dependent summaries, charts, and exact tables.

## Article and guide contract

Substantive published detail set:

1. `/articles/hybrid-router/`
2. `/articles/track-claude-code-usage/`
3. `/articles/monitor-openai-codex-usage/`
4. `/articles/openrouter-guide-model-routing-cost-controls/`
5. `/articles/legitimate-free-ai-api-access-credits/`
6. `/articles/reduce-llm-api-costs-caching-batch-output-limits/`

The article index also carries two explicitly prototype-labeled insight concepts that link to an in-page disclosure rather than pretend to be published detail pages. Empty/unpublished records remain excluded.

## Global shell decision

The immutable deployment exposes two historical shell implementations. The user’s newer rule is authoritative: apply the latest application shell consistently to every non-transactional Next.js page, including guide/article details and static comparison pages.

Required global behavior:

- Desktop navigation and mobile vertical menu.
- Models, Leaderboards, and Articles menus.
- Persistent `tbTheme` light/dark mode.
- Searchable language dialog with preferred and extended languages in two columns.
- Footer marketing form with first name, company, email, and optional notification consent.
- Skip link and responsive, keyboard-accessible controls.
- Compact immutable-style desktop navigation, bounded menus, and the
  transparent MonoMind mark without a white backing swatch.
- Top-model menu rows must reuse the verified Popular Models order/rank; array
  order and benchmark rank may not be presented as weekly popularity.
