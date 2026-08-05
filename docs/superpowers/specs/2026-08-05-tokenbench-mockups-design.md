# TokenBench Decision-Surface Mockups Design

**Status:** Approved direction; written specification pending user review

**Date:** 2026-08-05

**Surfaces:** Calculator light theme, compare hub, comparison detail, leaderboard directory, value leaderboard

## Outcome

Create a five-screen mockup bundle that transfers the dark calculator’s compact decision-workstation language into a coherent TokenBench system. The light calculator will no longer be a separately styled artifact. Compare and leaderboard screens will use the same hierarchy, geometry, controls, evidence rails, and theme tokens.

The approved direction is **Decision Workstation**: dense but legible panels, compact radii, thin hairlines, monospaced evidence labels, strong electric-blue selection states, restrained elevation, and visible source/methodology context.

## User Job and Mode

These are primarily **Operate** surfaces. A visitor is selecting inputs, comparing evidence, filtering results, or deciding which route deserves deeper inspection. Expression must reinforce task state and evidence quality without obscuring familiar controls.

The memorable system behavior is that every recommendation-shaped surface keeps its assumptions and provenance physically attached: blue evidence rails, source labels, timestamps, explicit unavailable cells, and disclosed workload controls remain visible beside the result.

## Scope

The review bundle contains five responsive HTML sources:

1. `.stitch/designs/calculator-light.html` — update the existing light calculator.
2. `.stitch/designs/compare-hub.html` — `/compare/` selection and discovery surface.
3. `.stitch/designs/compare-detail.html` — representative `/compare/:pair` surface.
4. `.stitch/designs/leaderboards-directory.html` — `/leaderboards/` directory.
5. `.stitch/designs/leaderboard-value.html` — representative `/leaderboards/llm/value/` category.

Each source supports both semantic themes and will be rendered at 1440 CSS pixels and 390 CSS pixels in dark and light mode. Raw screenshots use `<stem>-<width>-<theme>.png`, producing four deterministic captures per screen. The existing dark calculator is the visual authority and receives no intentional visual redesign; its before/after capture must remain equivalent if shared styles are extracted.

## Non-goals

- Do not implement production React behavior, benchmark APIs, Pages Functions, D1 queries, sitemaps, or deployment in this mockup pass.
- Do not change the product’s visual identity beyond making the approved dark-derived system coherent across themes.
- Do not invent published rankings, comparison winners, subscription mappings, testimonials, or reviewed popular pairs.
- Do not add a universal value score.
- Do not replace the implemented Task 11 leaderboard information architecture with a second concept.

## Shared Visual Contract

### Structure and geometry

- Use the production TokenBench header and footer: logo, tagline, Tools, Compare, Leaderboards, Guides, language control, and semantic theme button.
- Use one shared mockup stylesheet and identical semantic component classes across all five screens. Theme differences come from root semantic tokens, not divergent markup or component geometry.
- Panels use 12px radii, controls and buttons use 8px radii, and compact selection rows use 4px radii.
- Major surfaces use 1px hairlines and brightness/surface steps. Light mode may use the existing restrained panel shadow only where separation cannot be achieved by surface contrast.
- Labels for evidence, filters, methodology, and compact metadata use JetBrains Mono or the production monospaced fallback, uppercase only where the existing system does so.
- Display and body copy use the production Inter stack; the mockups do not introduce a separate theme-specific typeface.
- Primary action and selected-state blue is `#0007cd`. Selection must also use border, weight, icon or native checked state; color alone is insufficient.

### Theme mapping

Dark mode remains the incumbent reference:

- Canvas `#0f0f0f`
- Surface `#181818`
- Container `#222222`
- Elevated surface `#2a2a2a`
- Text `#ffffff`
- Muted text `#a8a8a8`
- Primary `#0007cd`

Light mode uses the production semantic translation:

- Canvas `#f7f8fc`
- Surface `#ffffff`
- Container `#eef1f7`
- Elevated surface `#e7ebf3`
- Strong divider `#e0e4ef`
- Text `#111318`
- Muted text `#505866`
- Selected surface `#e0e5ff`
- Primary `#0007cd`

The light design must retain the dark design’s density, selection confidence, chart emphasis, table hierarchy, and compact control language. It must not reintroduce the legacy pale-blue Material palette, 16px default cards, weak `primary/5` selections, or broad shadow hierarchy.

## Screen Specifications

### 1. Light calculator

The light calculator preserves the dark calculator’s exact reading order and component topology:

1. Provider and plan selection panels.
2. Model selection and usage-mix panels.
3. Cobalt API-equivalent-value summary paired with the value-trend chart.
4. Subscription plan table.
5. API route pricing table.
6. Cost-optimization recommendation with primary and secondary actions.

The update uses the production TokenBench shell instead of the legacy “AI Cost Engine” navigation. Choice rows receive compact borders and decisive checked states. The value card remains cobalt in both themes. The chart keeps the dark version’s focused current column, breakpoint marker, subdued comparison bars, and text alternative. Tables preserve compact headers, selected-row emphasis, aligned numeric columns, and visible route/source context.

### 2. Compare hub — `/compare/`

The first viewport is a model-decision workspace, not a marketing hero:

- A concise H1 and one-sentence explanation.
- Two equal model combobox panels separated by a keyboard-operable swap action.
- Provider and category filters directly below the selectors.
- A primary “Compare models” action disabled until two distinct known models are selected.
- A blue-left-rule methodology strip explaining canonical ordering, evidence requirements, and that missing measurements remain unavailable.

Below the workspace:

- A reviewed-matchups region reflects the actual empty editorial allowlist with an explicit “No reviewed matchups published yet” state. It does not display invented popular comparison cards.
- Related guide links explain workload profiles, source interpretation, and subscription-versus-API evaluation.
- A compact evidence legend defines Supported, Estimated, Stale, and Unavailable.

### 3. Comparison detail — `/compare/:pair`

The representative detail mockup uses the repository-known pair **Claude 3.7 Sonnet vs GPT-4o** to demonstrate layout without claiming a published winner:

- Breadcrumb and canonical pair title.
- Two equal model identity panels with provider, model family, and evidence status.
- A neutral center `VS` marker; neither side is visually pre-declared the winner.
- An evidence-aware summary that states what can and cannot be compared from the active revision.

The body contains:

1. Exact source-metric comparison table, retaining original metric names and units.
2. Workload profile control for input-heavy, balanced, and output-heavy cost views.
3. API route pricing and declared context comparison, with explicit unavailable cells.
4. Subscription-match region that either shows a reviewed mapping and breakeven or “No verified subscription match” with a calculator link.
5. Source, publication time, freshness, and methodology panel.
6. Related comparisons region that remains empty or unavailable when no reviewed pairs exist.

The mockup may use known model names to make the composition legible, but all non-repository numeric values remain `Unavailable`; no synthetic overall score or winner is shown.

### 4. Leaderboard directory — `/leaderboards/`

Preserve the implemented Task 11 structure:

- TokenBench directory eyebrow, H1, short explanation, and availability/evidence rail.
- A three-column desktop grid of registered evidence lenses.
- Each card states the question the lens answers and links to its canonical route.
- Related-leaderboard links and the restrained MonoMind CTA close the page.

The visual refinement aligns panel density, radii, blue emphasis, and light-theme treatment with the calculator. It does not add embedded rankings to the directory.

### 5. Value leaderboard — `/leaderboards/llm/value/`

Use the value route because it best connects calculator decisions with benchmark evidence:

- H1, concise route summary, and blue-left-rule methodology statement that explicitly rejects an opaque universal value score.
- Compact filter rail containing model/provider search, workload profile, sort control, and opt-in estimated BenchLM control.
- Desktop semantic table with rank/Pareto status, model/provider, exact capability evidence, workload price, context where applicable, evidence state, and source freshness.
- Ordered mobile cards containing the same facts and accessible ordering.
- Visible source attribution, publication time, related leaderboard links, and MonoMind CTA.

Estimated entries are appended after supported ranked entries, visibly labelled, unranked, and ineligible for a top badge or value-frontier claim.

## Data and State Rules

- Mockups use repository-confirmed labels, source names, and route definitions.
- Unknown or absent evidence renders `Unavailable`; zero is never used as a substitute for missing data.
- Stale and failed states keep the most recent complete revision separate from current status messaging.
- All live-looking metrics show their source label and publication or update time in the same visual region.
- A comparison or leaderboard control never implies an API operation completed when the mockup contains no active revision.
- Empty, loading, unavailable, stale, and error states use the same panel system and reserve enough layout space to avoid disruptive shifts.

## Responsive Behavior

- Review widths: 1440px desktop and 390px mobile; implementation must remain safe down to 320px.
- At narrow widths, header navigation uses the production menu button and retains language/theme controls.
- Calculator and compare two-column regions stack in reading order.
- Filter rails become a one-column sequence with full-width 44px controls.
- Leaderboard and comparison tables become equivalent ordered cards rather than horizontally scrolling or dropping columns.
- Model names, source identifiers, and prices wrap or truncate only where the full value remains available to assistive technology.

## Accessibility Contract

- One topical H1 per page with ordered heading levels.
- Semantic buttons, labels, comboboxes, checkboxes, radio groups, tables, scopes, and `aria-sort` where applicable.
- Minimum 44 by 44 CSS-pixel interactive targets.
- Visible keyboard focus in both themes.
- Selection, freshness, estimate, and unavailable states communicated by text or icon plus color.
- Charts include a text alternative or adjacent value table.
- Motion is nonessential and respects reduced-motion preferences.
- Light and dark text/control states meet WCAG AA contrast for normal-size text.

## Verification and Review Artifacts

The mockup pass is complete only when:

1. All five HTML sources render without console errors.
2. Dark and light screenshots at 1440px and 390px exist for every source, using the deterministic naming convention above.
3. Calculator dark and light geometry is compared at identical viewport sizes.
4. No page overflows horizontally at 390px or 320px.
5. Keyboard focus, selection states, and 44px controls are visibly verified.
6. The light calculator retains the approved dark hierarchy while using the semantic light token map.
7. Compare and leaderboard screens expose source, freshness, methodology, and unavailable states without fabricated claims.
8. One bounded visual inspection round produces a batched fix, followed by at most one confirmation round.
9. Impeccable detection and an independent finish review report any remaining material findings.

## Implementation Boundary

After this specification is approved, a detailed implementation plan will split work into non-overlapping streams:

- Shared mockup system and light-calculator parity.
- Compare hub and comparison-detail mockups.
- Leaderboard directory and value-category mockups.
- Rendering, accessibility checks, and finish review owned by the integrating agent.

No stream may independently change the approved visual contract, invent evidence, or modify production APIs. Integration and final visual acceptance remain with the primary agent.
