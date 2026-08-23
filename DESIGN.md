---
version: 1
name: TokenBench-design-authority
description: An evidence-first decision tool for comparing AI model cost, capability, and runtime facts. The interface is a dense, dark-default data product built on neutral surfaces with a single saturated electric blue (`#1111ff`) reserved for primary actions, chart fills, and focus. Inter Tight carries display and body; JetBrains Mono carries every measured value. The defining visual signature is the evidence receipt — a provenance/freshness line attached to every result surface — and the deliberate `-` / `n/a` rendering of facts no approved source publishes.

authority:
  structure: "https://8bf19b96.tokenbench-27t.pages.dev/"
  structure-contract: docs/rebuild-audit/PRESERVATION_CONTRACT.md
  tokens-source-of-truth: apps/web/src/app/globals.css
  interaction-language: AI Components (card/list result surfaces, filter and tray behavior)
  primitives: Base UI + local shadcn-style cva wrappers; Cult UI motion/disclosure patterns; licensed Untitled UI icons and namespaced data-value layer
  charts: Chart.js via react-chartjs-2
  precedence: "structure -> this document -> globals.css -> component-local classes"

colors:
  brand: "#1111ff"
  brand-hover: "#0d0ddd"
  brand-active: "#0909bc"
  brand-secondary: "#2727a8"
  brand-secondary-dark: "#9dabff"
  brand-foreground: "#ffffff"
  brand-subtle: "#e9e9ff"
  brand-subtle-dark: "#282855"
  selection: "#ced0ff"
  selection-dark: "#38387f"
  background: "oklch(1 0 0)"
  background-dark: "oklch(0.145 0.012 265)"
  card: "oklch(1 0 0)"
  card-dark: "oklch(0.205 0.016 265)"
  muted: "oklch(0.97 0 0)"
  muted-dark: "oklch(0.175 0.014 265)"
  muted-foreground: "oklch(0.556 0 0)"
  muted-foreground-dark: "oklch(0.72 0.014 265)"
  foreground: "oklch(0.145 0 0)"
  foreground-dark: "oklch(0.985 0.006 265)"
  border: "oklch(0.922 0 0)"
  border-dark: "oklch(0.34 0.016 265 / 72%)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"

typography:
  display-hero:
    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
    class: text-5xl
    fontWeight: 600
    usage: One per page at most; route-family landing headline.
  display-lg:
    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
    class: text-4xl
    fontWeight: 600
    usage: Page title on interior decision surfaces.
  heading-section:
    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
    class: text-2xl
    fontWeight: 600
    usage: Named section owning a result or an input group.
  heading-sub:
    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
    class: text-lg
    fontWeight: 500
    usage: Card title, table caption, tray label.
  body:
    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
    class: text-sm
    fontWeight: 400
    usage: Default reading size across the product.
  dense:
    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
    class: text-xs
    fontWeight: 400
    usage: Table cells, badges, chips, provenance receipts, helper text.
  measured-value:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    class: font-mono text-xs tabular-nums
    usage: Mandatory for every number that came from a source. Never for prose.

rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  pill: 9999px
  base-variable: 0.625rem

spacing:
  control-gap: 8px
  field-gap: 12px
  card-gap: 16px
  cell-y: 12px
  section-y-compact: 48px
  section-y: 56px
  section-y-loose: 64px
  container-max: 1280px
  prose-max: 42rem

components:
  container:
    maxWidth: "{spacing.container-max}"
    class: max-w-7xl
    note: Every full-width result surface uses this. Prose columns use max-w-2xl / max-w-3xl.
  button-default:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-foreground}"
    hover: "{colors.brand-hover}"
    active: "{colors.brand-active}"
    rounded: "{rounded.lg}"
    note: The one primary action in a control group. Adding an item to a comparison is a primary action.
  button-outline:
    backgroundColor: transparent
    border: "{colors.border}"
    rounded: "{rounded.lg}"
    note: Secondary/reversible actions only.
  button-ghost:
    backgroundColor: transparent
    note: Tertiary and icon-only affordances.
  touch-target:
    minHeight: 44px
    note: min-h-11 on every interactive control in a dense table or tray.
  data-value:
    typography: "{typography.measured-value}"
    unavailable-scalar: "-"
    unavailable-status: "n/a"
    note: Both carry an accessible title and screen-reader reason. Never coerce absence to 0, free, pass, or fail.
  evidence-receipt:
    typography: "{typography.dense}"
    textColor: "{colors.muted-foreground}"
    note: One latest source receipt on-page; the full ledger lives in exports and /data-sources/.
  focus-ring:
    outline: 2px solid var(--ring)
    outlineOffset: 2px
    note: --ring is brand in light, brand-secondary in dark. Never remove without an equal replacement.
---

## Overview

TokenBench helps someone choose an AI model or plan using facts that are traceable to an approved source. Every visual decision serves that: the reader must be able to tell, at a glance, what a number is, where it came from, how fresh it is, and whether it is missing.

The interface is therefore **dense and quiet**. Roughly three quarters of all text in the product is `text-xs` or `text-sm`. Color is not decoration — a saturated blue appearing anywhere means *this is actionable* or *this is the measured series*. Neutral surfaces carry everything else so that data, not chrome, is the figure.

This document is the **human design authority**. `apps/web/src/app/globals.css` is the machine source of truth for token values; when the two disagree, the CSS is correct and this document must be corrected to match. Neither one may override `docs/rebuild-audit/PRESERVATION_CONTRACT.md`, which governs what content and behavior must exist at all.

### Authority chain

1. **Structure and behavior** — the immutable deployment `8bf19b96` and the preservation contract. Route coverage, section order, information hierarchy, interactive behavior, and result actions come from here. A redesign may not delete a section.
2. **This document** — the visual and interaction system applied to that structure.
3. **`globals.css`** — literal token values.
4. **Component-local classes** — only for genuinely local composition.

AI Components supplies the card/list result-surface language and the filter/tray interaction model. Cult UI contributes motion and disclosure patterns (`animated-number`, `direction-aware-tabs`, `hover-card`). Untitled UI contributes icons and a namespaced data-value layer, using TokenBench's blue — **no Untitled global theme is imported**. Chart.js owns every quantitative chart.

## Colors

### Brand

`#1111ff` is the only brand hue. It is used for primary buttons, chart fills, focus rings, the caret, and active control states. It is identical in light and dark.

Because `#1111ff` on a dark background fails contrast as text, dark mode substitutes `--brand-secondary: #9dabff` for **text-like** brand usage — links, `.text-primary`, values, and status marks — while fills and charts keep the saturated blue. This split is implemented in `globals.css` and must not be flattened.

In light mode `--brand-secondary` is `#2727a8`, a darker blue used for inline links so body links do not vibrate against white.

### Surface

**Dark is the default theme.** The bootstrap in `site-chrome.tsx` resolves anything other than a stored `light` to dark, so a first-time reader lands in dark mode. Both themes are first-class and every surface must be reviewed in both.

Dark mode is a blue-tinted neutral (chroma `0.012–0.02` at hue `265`), not a pure gray — surfaces read as related to the brand without being colored. Light mode is plain neutral: white background, white cards, `oklch(0.97 0 0)` muted.

### Semantic

`--destructive` is the only semantic color. There is deliberately **no green success color and no amber warning color**, because a green cell would imply an editorial verdict on a model the evidence does not support. Pass/fail states use text and badge variants, not hue.

## Typography

Inter Tight carries display and body. JetBrains Mono carries every measured value.

The mono rule is a correctness rule, not a stylistic one: any number that came from a source must be `font-mono` and `tabular-nums` so columns align and so a reader can distinguish a measured fact from prose. Numbers that are user input echoes or narrative counts stay in the sans face.

Hierarchy runs `text-5xl` (one hero per page at most) → `text-4xl` → `text-2xl` → `text-lg` → `text-sm` (default) → `text-xs` (dense). There is intentionally no size between `text-2xl` and `text-lg` in regular use; adding one dilutes the section rhythm.

## Layout

- **Container:** `max-w-7xl` (1280px) for every result surface. Prose columns are `max-w-2xl`/`max-w-3xl`.
- **Section rhythm:** `py-12` / `py-14` / `py-16`. Dense internal spacing is `gap-2` / `gap-3` / `gap-4`; table cells are `py-3`.
- **Wide data:** a desktop result table must fit its container. Reach for `table-layout: fixed`, a bounded first column, and `white-space: nowrap` on numeric columns — the pattern already proven for `#subscription-result` at the bottom of `globals.css`. A nested horizontal scrollbar on desktop is a layout failure, not an acceptable fallback.

## Shapes & Depth

Radius derives from `--radius: 0.625rem`: `sm` 6px, `md` 8px, `lg` 10px, `xl` 14px. Cards and tables use `rounded-xl`; controls use `rounded-lg`; chips and badges use `pill`.

Depth is nearly flat. Light mode separates surfaces with `1px` borders, not shadows. Dark mode has one elevation token, `--shadow-soft`, which combines a tight contact shadow, a wide ambient shadow, and a faint blue-white rim. There is no second elevation level; if something needs to feel higher, it needs a border or a different surface, not a bigger shadow.

## Components

### Buttons

`default` is the brand fill and marks the single primary action in a group. `outline` is for secondary, reversible actions. `ghost` is tertiary and icon-only. `link` is inline navigation.

The primary/secondary decision is semantic, not aesthetic: **the action that advances the user's task is `default`**, even when it sits next to another prominent control. An "Add model" control that commits a selection is primary; a control that merely navigates elsewhere is not automatically more important.

Every interactive control inside a dense table or tray carries `min-h-11` (44px) regardless of its visual height.

### Data values

Absent facts have two renderings, and they are not interchangeable:

- **`-`** for a missing scalar (a price, a latency, a score).
- **`n/a`** for a missing categorical status (SLA eligibility, pass/fail).

Both carry an accessible `title` and screen-reader text naming the reason. Absence is never coerced into `0`, `free`, `pass`, `fail`, or `Outside SLA`. A model with no published TTFT observation has not failed an SLA — it has no observation.

### Model identity

A model name is navigation. Every model name rendered in a result — table header cell, card title, tray chip, comparison column — links to that model's canonical profile through **one shared link component**. Plain-text model names are a defect.

Provider identity uses the real provider logo. Colored dots are a **fallback for load failure or missing mapping only**, never the intended finished state.

### Evidence receipts

Every result surface shows its provenance and freshness. On-page, show the **single newest defensible receipt** by effective/observed revision, labelled as the latest visible receipt. The complete ledger stays available in CSV/PNG export metadata and at `/data-sources/`. Provenance is never deleted from the view model to shorten the page.

Stale evidence is labelled stale and still shown; only a cold system with no prior publication is unavailable.

### Loading & transitions

Changing a query on a decision surface — adding a model, changing a filter — is a **control action, not a page load**.

- The shell, inputs, and current results stay mounted and visible.
- The user's selection updates optimistically, within 100ms.
- The result region shows a bounded inline progress or shimmer, scoped to the region that is actually changing.
- Warm result completion target: 800ms.

A full-page skeleton that replaces the current page during a query change is prohibited. `app/loading.tsx` is for genuine cold route entry only.

## Do's and Don'ts

### Do

- Reserve `#1111ff` for action, focus, and measured series.
- Render every source-derived number in `font-mono tabular-nums`.
- Make the entire card or row surface respond to hover *and* keyboard focus, not just its text.
- Keep the full accessible reason behind a compact `-` or `n/a`.
- Fit desktop tables to the container by bounding columns.
- Let additive features be additive — new surfaces sit beside existing ones.

### Don't

- Don't introduce a color outside the token set, and don't add success-green or warning-amber.
- Don't use a full-page skeleton for an in-page query change.
- Don't render a model name as plain text.
- Don't treat colored provider dots as finished.
- Don't collapse route families into a generic template. `/subscribe-vs-api/` in particular keeps every existing section, input, result, and action; a generic API calculator may only be added alongside it.
- Don't show every provenance row inline at the point of decision.
- Don't mark a surface "final" from automated checks. Human route-family approval is the gate.

## Responsive Behavior

Breakpoints follow Tailwind defaults. The meaningful transitions are:

- **`md`** — dense desktop tables appear; below this, the same facts render as stacked metric cards. Both must carry identical data and identical unavailable-value semantics.
- **`xl` / `1280px`** — multi-column result layouts and fixed-layout wide tables engage.

Verify decision surfaces at 1024, 1280, 1440, and 1691px, in both themes, with the longest realistic model names and the maximum selectable comparison size.

Touch targets are 44px minimum everywhere, including inside tables.

## Known Gaps

These are open and tracked; they are **not** part of the system to be reproduced.

1. Provider logos are not ported to the Next rebuild. The reviewed mapping exists at `src/frontend/provider-mark.tsx` but reads `import.meta.env`, which is not a valid Next boundary. Colored dots are standing in.
2. Eight reviewer annotations from 2026-08-21 are unimplemented — Compare latency and full-page placeholder, Compare desktop table overflow, verbose Compare provenance, leaderboard card hover coverage, `Unobserved` → `n/a`, Make It Yours search width, Add button emphasis, and unlinked model names.
3. No fresh parity baseline exists. The prior "final implementation checkpoint" assessment was rejected by the product owner and should not be cited.
4. `--chart-1..5` are still the stock shadcn palette and have not been reviewed against the brand or for categorical accessibility.
