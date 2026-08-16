# Preview Leaderboard and Comparison Consistency Design

**Date:** 2026-08-16  
**Branch:** `ui-revamp-3`  
**Status:** Design approved by the user on 2026-08-16

## Objective

Refine the approved `ui-revamp-3` preview screens so model-provider terminology, leaderboard emphasis, insight disclosures, model-selection workflows, and the dedicated comparison page behave consistently in light and dark themes. Production remains untouched.

## Scope

This change covers the preview implementations for:

- `/models`
- `/popular-models/`
- `/make-it-yours/`
- `/compare` and `/compare?models=...`

It also updates shared preview navigation and footer links where they target the comparison page.

The implementation must use the existing TokenBench design tokens and current component primitives. It must not add hardcoded hexadecimal colors or create a separate visual system.

## Non-goals

- Do not change production pages or production deployments.
- Do not rename internal fixture, type, state, or data fields such as `organization`, `selectedOrganizations`, or `model.organization`.
- Do not replace ordinary editorial uses of “organization,” such as organization-level limits, workspaces, analytics, or seats.
- Do not change API contracts or wire LiveBench data.
- Do not make the `/compare` result layout the shared quick-comparison layout used elsewhere.
- Do not rewrite the React and prototype preview stacks into a single framework.

## Design decisions

### 1. Provider terminology

Use **Provider** or **Providers** for visible UI that identifies a model vendor. This includes labels, table headings, search placeholders, empty states, clear actions, chart accessible names, comparison metrics, and CSV export headings.

Examples include:

- “Organizations” → “Providers”
- “Filter by organization” → “Filter by provider”
- “Search organizations” → “Search providers”
- “No organizations match” → “No providers match”
- “Clear organizations” → “Clear providers”
- “Show org” → “Show provider”
- “Search models or organizations” → “Search models or providers”

Internal field and CSS class names stay unchanged unless a rename is mechanically necessary for a new shared component. Filtering must continue to operate on the existing `organization` data field.

### 2. Popular Models leaderboard

The leaderboard retains its current table and mobile-card behavior.

- Top-five score boxes use existing semantic theme tokens to gain a stronger primary-tinted surface, a visible token-based border, and readable focused text in dark mode. Light mode keeps its existing hierarchy.
- Every table-header cell and its interactive sort control uses vertical middle alignment.
- The provider heading and provider filter use the terminology rules above.
- Accessible top-five and chart descriptions use provider wording.

### 3. Popular Models insights

- Add a 32px token-equivalent separation between the scatter-chart plotting area and its provider legend.
- “Exact quality and cost values” and “Exact cost ranking” retain native `<details>` semantics.
- Their summaries show a downward triangle while collapsed and an upward triangle while expanded. The marker is decorative; the native disclosure remains keyboard- and screen-reader-operable.
- Exact-data tables use Provider as the visible model-vendor heading.

### 4. Make it yours

- List view is the initial view on every fresh page load. The existing view toggle remains available and retains its responsive behavior.
- Add an insight pair immediately after the Weighted ranking and Service-level filter area.
- The left panel plots the current weighted score on the Y axis against blended cost per one million tokens on a logarithmic X axis. It uses the current weights, access/provider filters, SLA state, and model additions so the chart stays synchronized with the weighted ranking.
- The right panel ranks the same visible models by cost.
- Reuse the Popular Models insight hierarchy, chart interaction patterns, exact-data disclosure treatment, section actions, and existing tokens. Copy and CSV exports must reflect the currently visible weighted result set.

### 5. Shared quick-comparison contract

The Models workbench, Make it yours, and Popular Models comparison workspace use the same quick-comparison information architecture. `/compare` is explicitly excluded.

Because the preview currently contains React and prototype pages, consistency is delivered through one documented DOM, state, and styling contract with thin stack-specific adapters. Existing shared prototype helpers remain the source for prototype selection behavior; the React comparison workspace mirrors the same contract without forcing a framework migration.

The contract is:

1. Heading: **Quick comparison**.
2. Selection status: “2 / 4 selected” pattern and the existing illustrative-data disclosure.
3. Clear action: low-emphasis text action at the section’s top-right.
4. Selected-model pills appear in selection order.
5. **Add a model** appears immediately after the last selected-model pill and opens the existing searchable picker.
6. **More details** appears at the section’s bottom-left and links to `/compare?models=<comma-separated selected ids>`.
7. Capability radar is centered in its panel, with 32px token-equivalent separation between the legend and spiderweb.
8. The decision matrix remains models-as-columns and keeps provider terminology.

The contract must remain usable at 320px, with controls wrapping without clipping and the decision table retaining an equivalent narrow-screen representation or safe horizontal overflow.

### 6. Dedicated `/compare` page

The canonical comparison page keeps its own result layout.

- Remove “Back to model catalog →”.
- Center the radar and add 32px token-equivalent separation between its legend and spiderweb.
- Keep the radar in the left panel.
- Move Exact capability values to the right panel, replacing the current Decision deltas content. The capability table is visible in that panel rather than leaving a mostly empty collapsed panel.
- Rename the later full-width specification section to **Decision deltas**.
- Add the subtitle **Tabulated specs for quick comparison.**
- Preserve multi-model selection, searchable Add a model controls, charts, exact values, and responsive stacking.

### 7. Comparison route reliability

Live inspection on 2026-08-16 returned HTTP 200 with zero redirects for `/compare`, `/compare/`, and `/compare/?models=deepseek-v3%2Cllama-3-3-70b`. There is no active redirect loop in the deployed preview.

The source currently mixes slashless and trailing-slash comparison links across the prototype and React stacks. Standardize preview navigation and footer destinations on `/compare`, matching the user-approved preview URL. `/compare/` must remain directly loadable without a redirect loop. Query parameters must be retained when navigating or updating model selections.

Add browser regression coverage that loads both path forms and a populated `?models=` URL, asserts a successful comparison shell, checks that the URL does not bounce between path forms, and verifies required scripts/styles load without console errors.

## Interaction and accessibility requirements

- Keep native button, table, and `<details>` semantics.
- Preserve visible keyboard focus and 44px interactive targets.
- Do not encode top-five status solely through color; retain the existing screen-reader label.
- Provider filters and model pickers must focus their search input when opened, close on Escape and outside pointer interaction, and expose selection state.
- Chart legends and exact-data tables remain available to non-pointer users.
- All changed layouts must work at 320px, 768px, 1302px, and a wide desktop viewport in both themes.

## Implementation architecture

- Keep Popular Models behavior in its current React modules under `src/frontend/popular-models/`.
- Keep Models, Make it yours, and `/compare` prototype behavior under `prototypes/ui-revamp-3/`, promoting reusable prototype selection and picker behavior through `common.js`.
- Add only the smallest shared helpers needed for consistent quick-comparison placement and URL construction.
- Use existing token variables and `color-mix()` for theme-aware contrast and spacing tokens or their established equivalents for 32px gaps.
- Keep route normalization in the existing preview route constants and shell link generators rather than page-local strings where possible.

## Test strategy

Implementation follows a red-green-refactor cycle.

Behavior-first tests must cover:

- Visible Provider/Providers terminology and absence of obsolete model-vendor Organization/Organizations labels.
- Internal filtering still using the existing `organization` fixture field.
- Dark-theme top-five boxes having a distinguishable background and border with readable text.
- Vertical middle alignment for Popular Models header cells and sort controls.
- List view as the Make it yours default.
- Weighted-score insight synchronization with current weights and filters.
- Disclosure arrow changes between collapsed and expanded states.
- Quick-comparison action placement, selection order, searchable picker, clear action, and `/compare?models=` link.
- `/compare` layout exclusivity, removed catalog link, relocated capability values, and Decision deltas title/subtitle.
- Direct `/compare`, `/compare/`, and populated query navigation without loops or lost parameters.

After focused tests pass, run the repository lint, build, relevant Playwright preview coverage, and full test suite. Then perform one bounded visual inspection pass covering desktop and mobile in both themes, fix findings in one batch, and confirm once.

## Deployment and acceptance

Deploy only the built `dist` directory to the Cloudflare Pages project `tokenbench` on branch `ui-revamp-3`. Do not deploy production.

Acceptance requires:

- focused and full automated checks passing;
- no unintended source or route changes outside this scope;
- stable preview and the new immutable deployment both verified;
- no comparison-route loop, console error, clipped control, or dark-mode contrast regression;
- final handoff listing the commit, stable URL, immutable URL, verification commands, and any residual risk.
