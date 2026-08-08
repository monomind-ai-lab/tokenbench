# Leaderboard Filter and Sort Layout Design

**Date:** 2026-08-07
**Status:** Approved 2026-08-08
**Project:** TokenBench

## 1. Outcome

Redesign the Filter and Sort panel on leaderboard detail pages so its hierarchy is
obvious at a glance, common controls are easy to scan, provider selection works
like a compact tag filter, and price filtering uses a visual range instead of two
number fields.

The common panel is organized into four rows:

1. Search model or provider
2. Metric lens, Sort leaderboard, and Evidence
3. Provider tags
4. Price range and Include estimated models

The redesign does not add Workload profile or Source type to ordinary leaderboard
pages. Those remain conditional, supplementary controls only on the specialized
routes or datasets that already support them.

## 2. Design principles

- Make the most common action, search, the first and widest control.
- Group selectors that change how the result is interpreted or ordered.
- Make multi-select providers faster to scan and toggle than a checkbox list.
- Show the available price span before the user changes it.
- Preserve the current URL-backed filtering behavior and source-faithful data.
- Use plain-language labels; internal source keys must not leak into filter copy.
- Keep every control usable with keyboard, touch, screen readers, light mode, and
  dark mode.
- Keep horizontal scrolling local to the provider row on narrow screens; the page
  itself must never acquire horizontal overflow.

## 3. Scope

### In scope

- Leaderboard detail-page Filter and Sort panel
- Four-row information hierarchy
- Provider multi-select tags
- Data-derived dual-handle price range
- Human-readable metric-lens option labels
- Source-neutral estimated-model copy
- Desktop, tablet, and mobile responsive behavior
- Existing URL query serialization and filtering semantics
- Focused component, query-state, accessibility, responsive, and browser coverage

### Out of scope

- Calculator controls or calculator workload behavior
- Adding Workload profile to new leaderboard routes
- Adding Source type to datasets that do not already expose multiple source types
- Changing leaderboard scores, ranking methods, evidence rules, or data-fetch cadence
- Changing CSV/API query keys or the meaning of existing shared URLs
- Reworking the results table, evidence panel, or leaderboard hero

## 4. Common four-row layout

The form retains the accessible name `Leaderboard filters`. Its visual and DOM
order must match the reading order below.

### Row 1: search

The `Search model or provider` search field occupies the full available width.
The visible label and accessible name use the same sentence-case copy. The field
continues to match model name, provider name, and model slug using the existing
query behavior.

Search remains immediate rather than requiring a submit action. The form still
prevents a browser submission because all filter state is applied in place.

### Row 2: interpretation and ordering

The next row contains, in order:

1. `Metric lens`
2. `Sort leaderboard`
3. `Evidence`

On desktop, available controls use three equal columns. A control is omitted when
the current route data cannot truthfully support it; the remaining controls expand
within the row instead of leaving empty placeholders.

Metric-lens option values and URL parameters retain their canonical source keys,
but visible option labels are humanized. For example,
`benchlm:category:coding` is displayed as `Coding`, not as the raw key. Known
source prefixes, including `benchlm`, are not shown in this control. Unknown
future keys receive a deterministic title-cased fallback rather than exposing
colon-delimited implementation text.

Sort and Evidence keep their current route-aware option sets and filtering
semantics.

### Row 3: provider tags

Providers are presented as multi-select tags inside a `Providers` fieldset.
Each tag has a minimum 44 px touch target, a clear selected state, and a visible
keyboard focus state. Each tag is a `type="button"` toggle with `aria-pressed`, so
its selected state is exposed to assistive technology and both Space and Enter use
native button interaction.

No selected provider means all providers are included, matching current query
semantics. Selecting multiple tags uses inclusive OR behavior. Clicking a selected
tag again removes it. Provider values written to the URL remain canonical and
sorted exactly as they are today.

On desktop and tablet, tags wrap naturally across lines. On mobile, tags remain in
one line and the provider container scrolls horizontally with touch, trackpad, or
keyboard. The scrollbar is visible or otherwise discoverable, scroll padding keeps
the first and last tags reachable, and the scroll container does not widen the
document.

The provider row is omitted when the loaded result contains fewer than two
providers.

### Row 4: price range and estimated models

The final common row places a price-range control in the flexible left area and
the estimated-model checkbox in the right area.

The price control is labeled `Price per 1M tokens`. It uses two independently
accessible range handles for minimum and maximum. The handles operate over an
ordered numeric domain made from the distinct display prices available for the
current leaderboard and pricing mode. Any active, in-range numeric bound restored
from an older shared URL is also inserted into that domain. This preserves exact
fractional and large values without arbitrary rounding. The visible range value
uses the site's currency formatter.

The default state spans the full available minimum-to-maximum range. In that state,
`minPrice` and `maxPrice` remain absent from the URL and models with unavailable
pricing remain visible, preserving existing behavior. Moving either handle writes
the corresponding real price to existing filter state and excludes records whose
price is unavailable. Returning both handles to the full endpoints clears both URL
parameters.

The handles cannot cross. If a handle reaches the other, the range may represent
one exact published price. Arrow keys adjust the focused handle by one available
price value. Each handle has an explicit accessible name (`Minimum price per 1M
tokens` and `Maximum price per 1M tokens`) and exposes its formatted current value.

If the page has no supported prices, the entire price control is omitted. If it has
only one distinct supported price, the row shows that value as a non-interactive
range summary rather than rendering two unusable handles.

The checkbox copy is:

> **Include estimated models**
>
> Estimated entries stay unranked and do not receive leader badges.

`BenchLM` is removed from its visible label, helper text, and accessible name.
The control remains conditional on the current leaderboard's existing estimated
model capability.

## 5. Supplementary conditional controls

`Workload profile` is not a common leaderboard filter. It continues to appear only
on the existing value and pricing-context leaderboard kinds, where the selected
profile changes the displayed blended price. It is placed in a low-emphasis
supplementary row after the four common rows and retains its current URL behavior.

`Source type` is not added to ordinary leaderboards. It continues to appear only
when the loaded rows contain more than one supported source type. When present, it
is placed in the same supplementary area after the common rows and retains its
current multi-select and URL behavior.

This change does not broaden either capability or change its meaning. Follow-up
product work may remove or relocate these specialized filters, but that decision is
not implied by this layout refinement.

## 6. Responsive behavior

### Desktop

- Search is a full-width row.
- Metric lens, Sort leaderboard, and Evidence form a three-column row.
- Provider tags wrap in their own full-width row.
- Price range takes the remaining width beside the estimated-model checkbox.
- Row spacing creates visible grouping without introducing separate card borders
  around every control.

### Tablet

- Search remains full width.
- The selector row uses available columns without squeezing any control below its
  readable minimum width; the third control may wrap to a second line.
- Provider tags wrap.
- Price and estimated controls may stack when the checkbox would become cramped.

### Mobile

- Search remains full width.
- Metric lens, Sort leaderboard, and Evidence stack vertically in that order.
- Provider tags stay in one horizontally scrollable row.
- Price range and its displayed values use the full width.
- Include estimated models appears below the range.
- All controls fit at 320 px without document-level horizontal overflow.

## 7. State, data, and loading behavior

- Existing public query keys remain unchanged: `q`, `metric`, `sort`, `provider`,
  `evidence`, `minPrice`, `maxPrice`, and `estimated` continue to serialize the
  common controls.
- Existing shared URLs continue to parse. Numeric price bounds from an older URL
  remain exact numeric bounds. An active bound between or outside published prices
  is inserted into the slider's ordered domain. Only a lower bound at or below the
  published minimum and an upper bound at or above the published maximum normalize
  to their equivalent open endpoints. A valid range outside or between published
  prices remains visible and correctly produces no matches.
- The price-domain data is derived from the same display-price function used by
  filtering: workload-aware blended prices on supported specialized pages and
  representative prices elsewhere.
- Price bounds are based on the loaded leaderboard dataset, not only the currently
  visible rows after search/provider/evidence filters, so changing another filter
  does not make the slider jump or invalidate its endpoints.
- Provider tags, evidence values, price domain, and optional controls remain
  capability-driven. Controls are not fabricated from route names.
- While route data is unavailable, data-dependent rows are not interactive. The
  existing loading and error surfaces remain authoritative; the redesign must not
  present sample values as live bounds.
- Empty filtered results keep the selected controls and existing clear/reset path
  so the user can recover without reloading.

## 8. Visual treatment

- Reuse TokenBench surface, outline, muted text, primary, and focus tokens in both
  themes.
- Keep the panel editorial and spacious; rows are separated primarily by spacing,
  not nested boxes.
- Provider tags are compact pills or softly rounded tags, not oversized cards.
- Selected tags use both color and a leading checkmark as a non-color cue.
- The price track has a quiet inactive segment and a clearly emphasized selected
  segment. Handles remain distinguishable in light and dark themes.
- Labels use the existing label type style and sentence-case wording in the DOM;
  CSS may retain the existing uppercase visual treatment.
- Motion is limited to brief color/position feedback and respects reduced-motion
  preferences.

## 9. Accessibility requirements

- DOM order matches visual order at every breakpoint.
- Every selector, search field, range handle, checkbox, and provider choice has an
  explicit accessible name.
- Multi-select provider state is announced, not only communicated by color.
- The two range handles are independently keyboard-operable and cannot create an
  invalid minimum-greater-than-maximum state.
- The provider fieldset has an accessible legend, and tabbing among overflowing
  tags scrolls the focused tag into view without clipping its focus indicator.
- Focus indicators meet the existing TokenBench focus treatment and are not clipped
  by the provider scroller or range container.
- Touch targets are at least 44 by 44 px.
- The redesign introduces no new live-region chatter while users drag a handle;
  the focused input's native value announcement is sufficient.

## 10. Verification and acceptance criteria

The implementation is complete when focused automated tests and browser checks
prove all of the following:

1. Search renders as the first full-width row.
2. Metric lens, Sort leaderboard, and Evidence render in that DOM order when
   supported and reflow correctly when one is absent.
3. Raw metric keys never appear as user-facing filter option labels, while their
   canonical values still serialize to the URL.
4. Provider tags support one, multiple, and cleared selections with existing OR
   semantics and canonical URL ordering.
5. Provider tags wrap on desktop and scroll horizontally on mobile without causing
   document overflow at 320 px.
6. Price handles default to the complete data-derived range while leaving
   `minPrice` and `maxPrice` absent.
7. Moving either handle applies inclusive filtering and URL state; returning to the
   full range clears both price parameters.
8. Fractional, large, one-value, missing-price, crossed-handle, and old shared-URL
   cases behave as specified.
9. The checkbox is named `Include estimated models`; no `BenchLM` text appears in
   this filter control.
10. Workload profile and Source type remain conditional and do not appear on an
    ordinary leaderboard without the existing supporting capability.
11. Light and dark themes preserve contrast, selection, track, handle, and focus
    states.
12. Keyboard-only operation and accessible names pass focused component and browser
    assertions.
13. Existing leaderboard filtering, CSV/share URL behavior, loading/error states,
    and results rendering continue to pass their regressions.
