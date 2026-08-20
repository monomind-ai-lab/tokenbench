# Checkpoint 2 — dark-theme depth

Date: 2026-08-20  
Branch: `codex/frontend-rebuild`  
Deployment: not performed or authorized

## Outcome

Dark mode now uses a cool-neutral elevation ladder instead of neutral black and
gray surfaces that visually collapsed together. No route layout or approved
component structure changed.

The semantic dark tokens reserve distinct roles for the page canvas, inset
muted areas, sidebar, card, input, secondary control, popover, and borders. A
calibrated soft shadow adds a low-opacity cool rim without replacing borders.
Light-mode tokens, the `#1111ff` light-mode accent, dark-mode brand roles, chart
series, provider colors, and status colors are unchanged.

Muted opacity utilities remain subordinate/inset treatments. Actionable or
independently scannable surfaces continue to require a full card/popover plus a
border; a low-opacity fill is not treated as the sole affordance.

## Verification

- Root foreground contrast measured approximately 19:1 against the dark page,
  17:1 against cards, and 15:1 against popovers.
- Muted text measured above 7:1 against the page, card, and muted surfaces.
- Primary button text measured approximately 6.7:1.
- Browser dark-mode checks at 1691px and 390px covered the home page, Models,
  Popular Models, Subscribe-vs-API, Tools, and an article detail. Checked routes
  retained zero page-level horizontal overflow, visible footer forms, and their
  expected chart surfaces.
- Light mode, brand/provider/status colors, and checkpoint-1 footer/table rules
  remained unchanged.
- Impeccable layout detector, root TypeScript, and Next ESLint/build passed.
- The repository run passed 2,101 tests and hit the existing 60-second timeout
  only in the 200-page LMArena safety-cap case; that exact test then passed in
  isolation (27.8 seconds). No product assertion failed.
