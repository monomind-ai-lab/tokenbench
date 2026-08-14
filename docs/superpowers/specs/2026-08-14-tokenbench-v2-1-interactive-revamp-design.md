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
- `/models/compare/[model_1]-vs-[model_2]`
- `/cost/calculator`
- `/cost/breakeven`
- `/articles/guides`
- `/articles/insights`

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

## Surface design

### Home

Home contains a compact proposition, a validated institutional metric strip, five interactive previews, current data timestamp, newsletter capture, and direct links into Models, Leaderboards, Compare, Cost, and Articles. Initial HTML includes the labels, values or unavailable states, preview headings, and primary links.

### Models

Models combines:

- an interactive Pareto scatter with linear/log price scale;
- accessible point inspection;
- Cards/Table catalog views;
- search, filters, sort, reset, result count, and crawlable pagination;
- selection controls for the shared two-to-three-model tray;
- canonical model-profile links.

Compact view defaults to cards. Wide tables retain visible overflow affordance and sticky model identity.

### Lifecycle and profiles

Lifecycle presents evidence-backed retirement/deprecation cards, replacement relationships, deltas, sources, freshness, and a release timeline. Unsupported dates, replacements, or deltas remain not reported. Replacement actions feed the shared comparison state.

Profiles show identity, lifecycle, modalities, limits, benchmarks, native/hosted routes, price dimensions, speed/latency conditions, history where present, workload examples, missing-data boundaries, and comparison selection.

### Leaderboards

Leaderboards contains Top 10 category summaries and Top 20 category routes. Categories include Overall, Coding, Agentic, Math, Reasoning, Multimodal, and Latency/Throughput SLA.

The vertical index uses a 0–100 scale, integer score labels, 55-degree model labels, provider labels/colors, and accessible reasoning-model text. Category pages include Cards/Table output and shared comparison selection.

The SLA matrix uses reference thresholds of TTFT ≤0.80s and throughput ≥60 tok/s. Controls change eligibility without changing source measurements.

The custom leaderboard weights Agentic, Coding, Reasoning, Math, Multimodal, and **Throughput**. Weights normalize only when their sum is positive; zero-sum input requests correction or resets safely.

### Compare

The landing page selects exactly two unique models, supports popular shortcuts without fabricating editorial endorsement, accepts shared selection state, and disables comparison until valid.

The result page provides pair-specific SSR metadata, radar overlay, specification and score deltas, workload/host controls, cost/speed/context/lifecycle/capability differences, missing-evidence explanations, sources, alternatives, and a contextual editorial CTA after the useful result.

### Cost

The Cost hub clearly separates estimation from crossover analysis.

The existing calculator flow is retained and restyled. It continues to expose source prices, token mix, host route, caching, long-context rules, assumptions, timestamps, share state, and line-item results.

Breakeven adds:

- 1–50 seats;
- $20/seat/month default scenario;
- 0–300M monthly-token domain;
- current evidence-backed target models;
- interactive API/SaaS lines;
- crossover and lower-cost-region annotation;
- formula, rounding, price-effective time, and equivalent results table.

The chart must not imply subscription capacity or included tokens that the evidence does not support. Fee crossover scenarios are labeled as fee comparisons; capacity coverage remains a separate evidence result.

### Articles

Articles separates Guides and Insights, includes dates and topic filters, preserves crawlable links, and links back into relevant tools and evidence pages.

Guides retain the V2.1 topic inventory and add decision question, framework, assumptions, updated date, related links, and post-content CTA. Insights distinguish observed facts from editorial interpretation.

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
