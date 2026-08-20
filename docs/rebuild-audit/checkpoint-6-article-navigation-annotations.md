# Checkpoint 6 — article and navigation annotations

Date: 2026-08-21

## Applied annotations

- Article channel controls are left-aligned 100px tabs with 8px top corners,
  square lower corners, 700 weight, and a 14px line box. The interactive
  surface remains at least 44px high for keyboard and touch accessibility.
- Article topic filters wrap without horizontal scrolling and use centered
  11px/700 labels, 10px horizontal and 7px vertical content padding, and a
  50px pill radius while retaining a 44px minimum target.
- Published article metadata and field-guide actions use the existing semantic
  secondary-brand token. It resolves to `#9dabff` in dark mode and the approved
  contrast-safe secondary in light mode.
- Articles navigation is a vertical four-row menu with a description for All,
  Guides, Insights, and News.
- Leaderboards navigation is a vertical three-row menu. Each row places its
  description to the right of its title.

## Verification

- Next ESLint and the production build passed.
- Impeccable detector returned no findings on both changed UI components.
- Browser checks passed at 1691×1000 and 390×844 in dark mode, plus a desktop
  light-mode regression pass.
- At 390px, channel tabs wrap to the next line rather than overflowing; the
  document remains bounded to the viewport.
- Desktop browser checks confirmed `#9dabff` for dark metadata/actions, the
  contrast-safe light counterpart, vertical menu rows, right-side menu
  descriptions, and no application console errors.
- Local evidence and production-data previews both return HTTP 200.

No deployment or live infrastructure change occurred.
