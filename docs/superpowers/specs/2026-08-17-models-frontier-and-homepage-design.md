# Models Frontier and Homepage Design

## Scope

This change has two sequential deliverables on the `ui-revamp-3` preview:

1. Refine the Models Workbench price-performance panel.
2. Replace the root redirect with a purpose-built TokenBench homepage.

The existing navigation, footer, design tokens, theme behavior, prototype data, and downstream page implementations remain the visual and behavioral authority.

## Models Workbench Frontier

- Remove the `frontier-details` disclosure and its generated table.
- Keep the existing scatter series and controls.
- Add a non-interactive Chart.js line dataset named `Pareto frontier` behind the model points.
- Populate it from the existing Pareto calculation, ordered by ascending cost.
- Use the existing theme accent token through `colors().accentText`, with a 2px straight stroke, no fill, and no line-owned markers.
- Keep the line visible in both the complete scatter view and `Frontier only` view.

## Homepage Direction

The homepage is a dark, high-density evidence console in the established `ui-revamp-3` world. It persuades by demonstrating working decision surfaces rather than by adding marketing claims.

### First viewport

The global shell frames a two-column hero. The left column carries the supplied headline, supporting copy, and two primary routes. The right column is a compact evidence terminal that combines ranked model rows, source/status cues, and measured price/latency fields. All prototype values are labeled illustrative.

### Page sequence

Five numbered evidence bands follow the hero:

1. Model discovery: filter chips and a responsive model evidence table linked to `/models`.
2. Popular insights: `#popular-models-insights-grid` with four dense model snapshots linked to `/popular-models/`.
3. Head-to-head comparison: GPT-4o and DeepSeek V3 capability, latency, cost, and context evidence linked to `/compare?models=gpt-4o%2Cdeepseek-v3`.
4. Subscription versus API: a compact, functional monthly-prompts slider using an explicitly illustrative crossover calculation, linked to `/cost/calculator`.
5. Articles: three current preview article cards linked to `/articles` and the existing hybrid-router article.

The numbered labels are retained because the supplied brief makes the five-step product tour an explicit sequence. They remain subordinate to the section titles.

## Data and truth constraints

- Model facts come from `TB_MODELS`; no new benchmark or price claims are invented.
- The cost preview is labeled illustrative and exposes its fixed assumptions.
- The supplied `Save up to 65%` claim is omitted because the repository does not contain evidence supporting it.
- The obsolete `/cost/subscriptions-vs-api` path is replaced by the approved `/cost/calculator` route.

## Responsive and accessibility behavior

- Multi-column layouts collapse below 768px without horizontal clipping.
- The table becomes ordered evidence cards on narrow screens.
- The comparison chart has an equivalent semantic facts grid.
- The cost slider has a visible label, output, assumptions, and keyboard support.
- Links and controls retain 44px targets, visible focus, and reduced-motion support.

## Integration

- Add `home.html` to the preview bundle as `/index.html`.
- Change preview home links from `/models` to `/` while retaining `/models` as the workbench route.
- Remove the root redirect from `public/_redirects`.
- Preserve the current shared shell and shared prototype assets.

## Verification

- Browser regression for the frontier dataset and removed disclosure.
- Bundle and navigation tests for the new root page.
- Browser coverage for homepage copy, routes, slider behavior, mobile stacking, keyboard access, and overflow.
- Production build, TypeScript lint, targeted Vitest, and Playwright checks.
- One desktop/mobile visual inspection batch, one corrective batch if needed, then a final confirmation.
