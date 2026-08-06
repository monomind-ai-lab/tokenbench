# TokenBench Preview Revamp Design

**Date:** 2026-08-06
**Status:** Approved in conversation; awaiting written-spec review
**Project:** TokenBench

## 1. Outcome

Revamp TokenBench so a first-time visitor can immediately understand what the
product offers, move directly into one of its core decisions, and interpret the
result without wading through implementation metadata or repeated provenance.

The release reorganizes the site around five user-facing destinations:

1. Home
2. Subscribe vs API
3. Compare
4. Leaderboards
5. Guides

It also introduces source-faithful BenchAlign presentation, Reasoning and
Knowledge leaderboard lenses, CSV downloads, restorable share links, provider
branding, Brevo-backed subscriptions, and a reproducible monthly cheatsheet
pipeline.

## 2. Product principles

- Lead with the decision a visitor can make, not the mechanics behind the data.
- Use BenchLM's published BenchAlign and category outputs verbatim; TokenBench
  does not recreate or rename the upstream scoring method.
- Keep score, evidence strength, runtime, pricing, and missing data distinct.
- Put provenance once at the point where a user may need to audit the result.
- Prefer a plain-language result over a dense collection of raw fields.
- Preserve unavailable facts instead of filling them with inferred values.
- Keep every result restorable, downloadable where appropriate, and shareable.
- Support light and dark themes, keyboard use, reduced motion, and a 320 px
  viewport without horizontally clipped decision content.

## 3. Scope and deferrals

### In scope

- Primary navigation and route hierarchy
- Home page content and data-at-a-glance redesign
- Guided Subscribe vs API calculator experience
- Compare hub and pair-detail redesign
- Leaderboard index, detail pages, filters, titles, and two new category routes
- BenchAlign methodology page
- Provider/model brand marks through Brandfetch with resilient fallbacks
- CSV export for leaderboard results
- Share actions for calculator, comparison, and leaderboard results
- Brevo double-opt-in signup and subscriber preferences
- Reproducible monthly PDF/CSV cheatsheet and campaign-draft generation
- Static-page, SEO, sitemap, redirect, accessibility, and responsive updates

### Deferred

- Generated leaderboard cover images
- Automatic production deployment or remote Cloudflare mutation
- Automatic campaign sending without an explicitly configured approval policy
- A TokenBench-owned composite capability score
- Any unsupported speed, latency, or subscription-to-model facts

Leaderboard headers remain typographic surfaces in this release. No generated
placeholder artwork is added.

## 4. Information architecture and routes

The primary header navigation is:

| Label | Canonical destination |
| --- | --- |
| Home | `/` |
| Subscribe vs API | `/tools/subscriptions-vs-apis/` |
| Compare | `/compare/` |
| Leaderboards | `/leaderboards/` |
| Guides | `/guides/` |

The generic Tools navigation item is removed. `/tools/` becomes a compatibility
entry that directs users to Subscribe vs API. Existing plural leaderboard URLs
remain canonical. Singular `/leaderboard` variants redirect to the equivalent
plural route rather than creating duplicate pages.

New fixed routes:

- `/leaderboards/llm/reasoning/`
- `/leaderboards/llm/knowledge/`
- `/methodology/benchalign/`

Comparison routes remain canonical pair URLs under `/compare/:pair`. Existing
fixed routes, generated HTML, metadata, sitemap entries, and redirects are
updated from one route registry so labels and SEO titles cannot drift.

## 5. Global experience

### Navigation and footer

The desktop and mobile navigation use the five primary destinations above.
The footer retains compact product and methodology links and adds the newsletter
offer described in Section 12. Catalog status and source warnings are not shown
as ambient footer copy unless an actionable degraded state exists.

### Page hierarchy

Every primary surface follows this order when applicable:

1. Concise title and one-paragraph description
2. Primary decision or live data
3. Supporting controls and detail
4. One evidence/provenance disclosure
5. Related next action

Internal revision identifiers do not appear in ordinary hero copy. Publication
time and method information remain available in the evidence disclosure and
machine-readable exports.

### Provider and model identity

A shared `ProviderMark` component uses a reviewed provider-to-domain registry.
Brandfetch icon URLs use the public client identifier, a fixed requested size,
theme-aware variants, reserved image dimensions, lazy loading where safe, and
an error fallback. The browser never guesses a domain from an arbitrary model
name.

Models inherit the verified provider mark unless a reviewed model-family brand
mapping exists. A deterministic lettermark is used when Brandfetch is disabled,
unavailable, or returns an error. No private Brandfetch credential is exposed.

## 6. Home page

### Hero

The hero copy is:

> **Transparent AI Costs. Verified Benchmarks.**
>
> The free decision engine for your AI stack. Evaluate exact model pricing and
> source-backed performance data so you can choose the best LLM for your
> workload.

Primary actions:

- Compare models
- Calculate subscription vs API
- Browse leaderboards

The terminal panes are removed. A live decision snapshot uses the active
published revision to show only defensible values:

- Current supported BenchAlign leader
- Best supported value-frontier model
- Lowest verified representative API rate
- A compact price-versus-performance plot

If a value is unavailable, the slot states that plainly instead of substituting
sample data.

### Remaining sections

1. **Make three decisions faster:** visual entry cards for Compare, Subscribe vs
   API, and Leaderboards.
2. **See the market at a glance:** supported top-three category leaders and a
   decision-relevant price/performance plot.
3. **What TokenBench gives you:** exact route pricing, comparable performance
   evidence, workload calculations, downloads, and shareable results.
4. **Built for AI builders:** concise prototyping, production-routing,
   subscription-selection, and optimization use cases.
5. **MonoMind AI Lab:** the closing service statement uses “cut API bills by up
   to 90%.”

The current “Benchmark signals” and terminal-workflow sections are removed.
Source links are not repeated inside every home card; the data snapshot links to
its relevant leaderboard and consolidated evidence.

## 7. Subscribe vs API

### Header

> **Should you subscribe or pay as you go?**
>
> Estimate the API-equivalent value of an AI subscription using the models,
> token volume, and input/output mix that match your workload.

### Guided flow

The calculator is presented as four steps without turning it into a blocking
wizard:

1. **Choose a provider and plan.** Explain the subscription price and flag
   variable, rolling, credit-based, or unpublished entitlements.
2. **Choose the models you actually use.** Supply a sensible default selection;
   place custom model allocation behind an advanced disclosure.
3. **Describe your monthly workload.** Offer presets and direct token-volume and
   input/output controls with short examples.
4. **Review the recommendation.** Lead with “The subscription is cheaper at this
   usage” or “Pay as you go saves approximately …” only when the calculation
   supports the statement.

The result prioritizes monthly subscription price, API-equivalent cost,
estimated difference, breakeven volume, assumptions, and unavailable facts.
Desktop places guided controls beside a sticky result summary. Mobile uses a
single sequence and a persistent “View result” action. Returning visitors may
collapse the explanatory overview.

### Shareable state

The calculator URL serializes only non-sensitive decision state: provider, plan,
selected model identifiers and weights, token volume, and input share. The page
validates every query value against the current catalog, ignores unknown values,
normalizes invalid weights, and falls back safely when an old shared link refers
to a removed offer.

## 8. Compare hub

### Header and selection

> **Compare models side by side**
>
> Choose two models to compare benchmark performance, API pricing, context
> limits, and evidence coverage.

Published revision text and timing fields are removed from the hero. The metric
category selector is removed.

The selection surface uses two numbered model pickers. Each picker begins with a
useful list of popular, utility-selectable models and supports search. A row may
show the provider mark, model and provider, BenchAlign score or evidence state,
context window, representative verified API price, and lifecycle state when
those fields exist. Popular reviewed pairs remain one-click shortcuts.

A compact optional signup beside the comparison tools offers “Notify me when
either model changes price or ranking.” The checkbox is unchecked by default;
the email control appears when it is selected.

## 9. Comparison result

The pair page renders in this order:

1. Pair header with provider marks, names, evidence states, quick model switching,
   and Share
2. Deterministic two-to-four-sentence comparison summary
3. Decision highlights for defensible shared metrics, price, and context
4. Radar or ruled shared-metric view
5. Source metrics
6. Pricing and context
7. One evidence-provenance disclosure

### Summary rules

The summary is generated from the same server-provided facts used by the page.
It may describe a higher supported score, a lower verified rate, a larger
context window, or limited evidence. It does not declare a universal winner and
does not infer a missing value. Evidence coverage is included when it changes
how the comparison should be interpreted.

### Radar rules

A radar renders only when at least four shared metrics are available for both
models on a compatible display scale. BenchLM category-score rows are eligible
when both sides use the same unit and methodology. Heterogeneous raw benchmark
units, one-sided measurements, runtime metrics, and prices are not normalized
into the radar. When fewer than four axes qualify, the page uses a ruled shared
metric list.

The chart includes a textual data table, keyboard-readable labels, and a
non-color distinction between model series.

### Metric and provenance cleanup

- `benchlm:category:coding` displays as “Coding.”
- The source column is removed from the metric table.
- Mobile uses metric cards rather than a clipped desktop table.
- A single evidence section contains source URLs, method, revision, checked
  time, and limitations.

### Pricing and context

The default route-selection policy prefers the latest verified direct-provider
route, then a verified routed provider such as OpenRouter. Users can switch
routes when alternatives exist. The table shows input, cached input, output,
context window, maximum input/output where published, modalities, route, and
verification state. Missing data reads “Not published.”

The current comparison Workload view is removed. Workload modeling remains in
Subscribe vs API, where its inputs are controllable and explained.

## 10. Leaderboards

### Index

Header copy:

> **Model leaderboards**
>
> Explore current model leaders by capability, workload, cost, and human
> preference.

“Decision-ready picks” appears before the category directory. It shows up to
three supported models for:

- BenchAlign
- Agentic performance
- Coding
- Reasoning
- Multimodal
- Knowledge

Each card shows rank, provider identity, score, evidence state, update date, and
a link to the full view. Reasoning, Multimodal, and Knowledge are labeled as
category evidence lenses while that remains BenchLM's published status.

The directory groups semantic titles without “AI model” repetition:

- Overall benchmarks
- Coding
- Agentic performance
- Reasoning
- Knowledge
- Multimodal
- Human preference
- Value
- Pricing & context
- Text to image
- Image editing
- Text to video
- Image to video
- Video editing

Each entry has a one-sentence scope, current supported leader when available,
top-three preview, and full-view link. No cover image is rendered in this
release.

### Detail pages

The detail hierarchy is:

1. Typographic category header with scope, refresh date, Share, and Download CSV
2. Decision picks supported by that dataset
3. Search, filters, metric selection, and sorting
4. Desktop table or ordered mobile cards
5. Consolidated methodology and provenance
6. Related leaderboards

Available controls are derived from the route definition and data contract:

- Search
- Provider
- Proprietary/open-weight
- Supported/estimated evidence
- Current/superseded state where available
- Price range where pricing exists
- Show metric
- Score, price, context, or source-rank sort as applicable
- Workload profile only for value and pricing views

Estimated models remain opt-in, visually distinct, and excluded from leader,
top-three, best-value, and winner badges.

### New category routes

The existing generic BenchLM category ingestion already preserves safe,
ranking-eligible category metrics. Reasoning maps only to
`benchlm:category:reasoning`; Knowledge maps only to
`benchlm:category:knowledge`. Route definitions never infer a metric from a
display label.

## 11. BenchAlign methodology page

The page title is “How BenchAlign rankings work.” It states prominently that
TokenBench republishes BenchLM's published scoring outputs and does not
recalculate them.

It summarizes and links to the upstream methodology:

- Comparable-scale calibration
- Supported versus Estimated positions
- Missing-data uncertainty
- Weighted versus display-only benchmarks
- Validated Overall, Agentic, and Coding rankings
- Reasoning, Multimodal, and Knowledge category evidence-lens status
- Separation of runtime metrics from capability scores
- Current published method version
- BenchLM source refresh and TokenBench ingestion checks

The page does not copy BenchLM's full benchmark directory or imply ownership of
the BenchAlign method.

## 12. Data cadence

BenchLM's live product is release-driven and its benchmarks carry individual
refresh cadences; monthly timing applies to historical snapshots rather than to
all live leaderboard updates.

TokenBench keeps the combined benchmark Worker schedule needed by its other
sources, but gates BenchLM network checks to once per UTC day. The adapter uses
conditional request headers and the existing projected-content hash. An
unchanged response updates freshness state without publishing a new content
revision. A changed response must pass the existing schema, provenance,
snapshot, and atomic-publication checks before it becomes active.

Catalog route pricing retains its existing six-hour source cadence. The monthly
cheatsheet freezes one active revision independently of live ingestion.

## 13. CSV download

Every leaderboard detail page provides Download CSV. The export represents the
complete active filter and sort state, not only the visible pagination page.

The endpoint is a sibling of the leaderboard API and accepts an allowlisted set
of query parameters matching the UI. It validates the leaderboard key, profile,
metric, sort, provider, evidence status, source type, lifecycle status, price
range, and search string. Invalid or unsupported combinations return a clear 400
response rather than silently changing semantics.

CSV behavior:

- RFC 4180 quoting and UTF-8 output
- Stable semantic columns per leaderboard kind
- Explicit empty value for unavailable facts
- `Content-Disposition` filename containing category and snapshot date
- Response headers for TokenBench revision, publication time, and methodology
- No formula-executable cell values; leading formula characters are escaped
- Same supported/estimated winner rules as the page

## 14. Share actions

A shared action component uses `navigator.share` when available and falls back
to copying a canonical URL. It provides a visible, screen-reader-announced
success or failure message and never requires a social-network SDK.

- Calculator: shares validated serialized calculation state.
- Comparison: shares the canonical pair URL and a factual summary.
- Leaderboard: shares the category plus active filters, metric, profile, and
  sort as URL query state.

Unknown query parameters are ignored. Each page restores state before rendering
its result so a shared URL and its visible summary agree.

## 15. Newsletter and alerts

### Footer offer

The global footer adds:

> **The Monthly LLM API Cost & Benchmark Cheatsheet (PDF/CSV)**
>
> A downloadable, printable reference sheet listing top models, current per-1M
> token rates, context windows, and category ranks.

The form collects email and an optional, unchecked preference:

> Notify me when new models or price drops are added to TokenBench.

The same alerts preference may be offered beside comparison tools. Consent is
not preselected.

### Runtime integration

The browser posts to a TokenBench Pages Function. The function validates email,
origin, consent fields, request size, and a honeypot; it uses a generic response
that does not reveal whether an address already exists. It calls Brevo's
double-opt-in endpoint and maps preferences to reviewed list or consent-group
identifiers. The API key is a Worker secret and never enters HTML, client
JavaScript, logs, tests, or repository files.

Configuration is explicit:

- `BREVO_API_KEY`
- `BREVO_CHEATSHEET_LIST_ID`
- `BREVO_ALERTS_LIST_ID`
- `BREVO_DOI_TEMPLATE_ID`
- `BREVO_DOI_REDIRECT_URL`
- `BREVO_SENDER_ID` or reviewed sender identity for campaign drafts

Missing production configuration keeps the integration disabled and presents a
non-destructive unavailable state rather than losing submitted addresses.

### Automatic cheatsheet generation

An in-repository Node script accepts a frozen TokenBench benchmark/catalog
revision and produces:

- A machine-readable CSV
- A print-specific HTML document
- A PDF rendered from that HTML
- Newsletter HTML using the same facts
- A factual subject-line and preview-text set
- A social/share image rendered from the same template when enabled

The generator never asks a language model to calculate or rewrite numbers.
Optional AI-assisted editorial variants may operate only on a structured fact
object and must pass a check that all referenced model names, ranks, prices, and
counts exactly match that object.

A revision diff identifies newly published models and verified route-level
price decreases. It deduplicates changes by model, provider, route, and revision
before producing an alerts campaign draft.

The initial operational mode creates Brevo drafts for human approval. Enabling
automatic sends is a separate deployment decision requiring credentials,
recipient-list confirmation, unsubscribe verification, and several clean draft
runs. Brevo MCP may be used by an operator for template management and campaign
analytics, but it is not a runtime dependency of TokenBench.

## 16. Data and API architecture

The implementation keeps React, Vite, Pages Functions, D1, R2, and the existing
scheduled ingestion Workers.

Key additions:

- Pure route definitions for Reasoning and Knowledge
- A materialized decision-picks projection consumed by Home and the leaderboard
  index, avoiding six independent client requests
- Pure comparison-summary and radar-eligibility derivations shared by server
  rendering and hydration
- A verified route-selection helper for comparison pricing
- Allowlisted leaderboard filters and CSV serialization
- Query-state codecs for calculator and leaderboard sharing
- A provider-domain registry and resilient `ProviderMark`
- A server-only Brevo adapter and newsletter endpoint
- Revision-diff and cheatsheet generator scripts

No browser route fetches upstream benchmark, Brandfetch catalog, or Brevo API
data directly. Brandfetch logo images are the only intentional third-party image
requests and use reviewed CDN URLs plus a local fallback.

## 17. Error, stale, and empty states

- Home highlights: unavailable slots remain visible with a short explanation.
- Calculator: removed plans/models are normalized out of shared state.
- Compare: sparse evidence changes the summary and suppresses the radar.
- Pricing: missing facts read “Not published”; a route is never fabricated.
- Leaderboards: stale published results remain usable with one freshness notice.
- CSV: invalid filters return 400; unavailable data does not abort the export.
- Share: clipboard or native-share failure is announced and leaves the page
  unchanged.
- Newsletter: validation errors are local and specific; upstream failures use a
  retryable generic message without exposing Brevo details.
- Monthly generation: incomplete or inconsistent revisions fail closed and do
  not create a campaign draft.

## 18. Accessibility and responsive requirements

- One H1 per page and semantic section headings
- Keyboard-operable navigation, pickers, filters, disclosures, share, and
  download controls
- Visible focus and minimum 44 x 44 CSS pixel interactive targets
- Accessible combobox/listbox semantics for model selection
- `aria-sort` for sortable tables
- Ordered mobile cards with the same information as desktop tables
- Radar text alternative and data table
- Status announcements for copied links, downloads, signup, loading, and errors
- Meaning that does not depend on color, logo, or chart geometry
- Reduced-motion behavior for transitions and charts
- No horizontal page overflow at 320 px

## 19. Verification strategy

Implementation follows test-first development for behavior changes. Focused
tests cover:

- Route labels, redirects, metadata, sitemap, and generated pages
- Home decision-picks rendering and unavailable states
- Calculator step guidance and shared-state validation
- Compare picker popular models and removal of category/revision UI
- Deterministic comparison summary and no-winner cases
- Radar eligibility at four compatible shared metrics
- Friendly metric names, removed source columns, and pricing-route selection
- Reasoning and Knowledge route-to-metric mappings
- Leaderboard decision picks, filters, estimated-model exclusions, and titles
- CSV filtering, ordering, quoting, formula escaping, headers, and errors
- Native share and clipboard fallback
- Provider mark mapping and image fallback
- Brevo request validation, double-opt-in mapping, generic responses, and secret
  isolation
- Revision diff, cheatsheet data fidelity, and campaign-draft gating

Final verification requires fresh successful runs of:

```sh
npm test
npm run lint
npm run build
npm run test:browser
npm run test:browser:production
git diff --check
git status --short
```

Rendered inspection covers Home, Subscribe vs API, Compare hub, a sparse and a
dense comparison, leaderboard index, each leaderboard family, methodology, and
newsletter states at representative mobile, tablet, and desktop widths in both
themes. The bounded visual QA process uses one batched inspection, one batched
fix pass, and at most one confirmation pass.

## 20. Acceptance criteria

The revamp is ready for handoff when:

- Primary navigation matches the five-destination structure.
- Home communicates the product and its three primary actions in the first
  viewport and displays only real active-revision highlights.
- The calculator is understandable as a four-step decision and produces a
  restorable share link.
- Compare selection exposes popular models without a metric-category selector.
- Comparison pages provide a factual summary, conditional radar, cleaned metric
  titles, complete route-aware pricing, one provenance disclosure, and Share.
- The leaderboard index exposes supported top-three picks for the six approved
  categories and clearly labels evidence lenses.
- Detail pages use semantic titles, data-supported filters, CSV, Share, and
  responsive cards.
- BenchAlign methodology is attributed accurately.
- Provider marks have deterministic fallbacks.
- Newsletter signup uses Brevo double opt-in with explicit preferences.
- Monthly artifacts are reproducible from one frozen revision and campaign
  creation defaults to draft.
- Generated cover images are absent and remain deferred.
- Automated and rendered verification passes with no unresolved critical,
  high, or medium findings.
