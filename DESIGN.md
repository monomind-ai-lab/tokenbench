---
name: TokenBench
description: A light-first evidence ledger for defensible AI cost and model decisions.
colors:
  light-canvas: "#e9edf4"
  light-surface: "#ffffff"
  light-surface-low: "#f5f7fb"
  light-surface-container: "#eef1f7"
  light-text: "#111318"
  light-muted: "#505866"
  light-outline: "#e0e4ef"
  light-field-outline: "#c3c8d6"
  plum: "#741a66"
  plum-strong: "#5d1552"
  plum-soft: "#f2ddec"
  on-plum: "#ffffff"
  light-danger: "#c92d2d"
  light-warning: "#7a4b00"
  light-warning-bg: "#fff0ce"
  dark-canvas: "#0c0c0c"
  dark-surface: "#1d1d1d"
  dark-surface-low: "#191919"
  dark-surface-container: "#262626"
  dark-text: "#ffffff"
  dark-muted: "#a8a8a8"
  dark-outline: "#2c2c2c"
  dark-primary: "#d88ac8"
  dark-primary-strong: "#f0b7e2"
  dark-primary-soft: "#4b2143"
  dark-tertiary: "#ffcf91"
  dark-danger: "#ff8585"
  dark-warning: "#ffd18a"
  dark-warning-bg: "#3d2d10"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.65rem, 7vw, 5.4rem)"
    fontWeight: 700
    lineHeight: 0.96
    letterSpacing: "-0.065em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.4rem, 3vw, 2.1rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.05em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  compact:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.5
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "0.68rem"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "0.07em"
rounded:
  control: "8px"
  compact-panel: "10px"
  primary: "12px"
  hero: "16px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  section: "32px"
  target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.on-plum}"
    typography: "{typography.compact}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.plum-strong}"
    typography: "{typography.compact}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "44px"
  panel:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.primary}"
    padding: "24px"
  input:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    typography: "{typography.compact}"
    rounded: "{rounded.control}"
    padding: "8px 11px"
    height: "44px"
---

# Design System: TokenBench

## Overview

**Creative North Star: “The Evidence Ledger”**

TokenBench is a light-first technical decision surface. White and pale-slate layers organize pricing, benchmark, workload, and provenance evidence; plum marks decisions, supported evidence, active navigation, and focus without overwhelming the ledger.

Dark mode is a synchronized semantic translation. It preserves hierarchy, geometry, evidence states, and the plum identity while remapping surfaces and foreground accents for contrast.

Key characteristics are 12px panels, 8px controls, 44px minimum targets, semantic tables on wide screens, equivalent ordered cards on narrow screens, and literal `Unavailable` states instead of fabricated completeness.

## Colors

Neutral surfaces carry most of the interface. Ledger Plum (`#741a66`) identifies primary decisions; Plum Ink and Plum Wash support links and selected states. Dark mode translates those roles to `#d88ac8`, `#f0b7e2`, and `#4b2143`.

Amber identifies estimated, stale, or cautionary information. Red is reserved for validation or transport failure. Missing evidence is neutral—not an error—and always keeps an explicit text label.

**The Evidence Role Rule.** Color reinforces a written state; it never replaces “Unavailable,” “Estimated,” “Stale,” “Warning,” or “Error.”

**The Synchronized Theme Rule.** Theme changes remap semantic roles, not hierarchy or meaning.

## Typography

Inter carries headings, body copy, navigation, controls, and values. JetBrains Mono distinguishes table headers, revisions, timestamps, statuses, ranks, and compact measurements.

- Display is bold, tightly tracked, and responsive.
- Headlines remain compact enough for dense product surfaces.
- Body copy uses a generous 1.65 line height and usually stays within 720–780px.
- Mono labels are short, uppercase evidence metadata—not a costume for prose.

## Layout

The shared shell caps content at 1280px, with 32px desktop gutters and 12px narrow gutters. The sticky header is 64px high. Main surfaces follow a single-column stack with 20–36px gaps.

- At 1023px and below, wide evidence tables become equivalent ordered cards.
- At 900px and below, primary navigation becomes the menu treatment.
- At 767px and below, control grids, dialogs, footers, and fact grids stack.
- At 380px and below, dense fact grids reduce to one column.
- The minimum supported viewport is 320px.

**The Equivalent Evidence Rule.** Responsive cards preserve table order, labels, values, status, and source meaning.

**The Reachability Rule.** Buttons, links, selects, radios, checkboxes, and range hit areas remain at least 44×44 CSS pixels.

## Elevation & Depth

Depth is structural and restrained. Light panels use `0 4px 18px rgba(31, 45, 64, 0.08)`; dark panels use `0 8px 24px rgba(0, 0, 0, 0.45)`. Internal evidence regions remain flat and rely on borders, tonal surface steps, and restrained plum-tinted gradients.

## Shapes

Primary panels use 12px corners, controls use 8px, compact callouts use 9–10px, and major heroes use 16px. Pills are limited to status badges, filter chips, freshness labels, and circular controls. Dashed containers indicate empty or unavailable evidence; estimated and source-only marks use dashed or dotted treatment where applicable.

## Components

Navigation uses a translucent 64px sticky header. The active destination combines stronger text with a 2px plum underline. The mobile menu is a bordered and shadowed surface beneath the header.

Primary buttons use stable plum fill, white text, an 8px radius, and a 44px minimum height. Secondary buttons are transparent with plum text and border. Focus is a 3px semantic outline with 2–3px offset.

Inputs use the theme surface, strong field outline, 8px radius, and 44px minimum height. Selected radios, checkboxes, filters, and ranges use plum plus an explicit checked or pressed state.

Panels use the theme surface, outline, 12px radius, 24px padding, and theme shadow. Nested fact cells use the low surface and little or no shadow. Tables use surface-container headers and compact mono labels; mobile cards preserve the same evidence fields.

Supported evidence uses plum plus explicit wording. Estimated evidence uses amber and is ineligible for winner semantics. Source-only evidence uses muted or dotted treatment. Unavailable evidence remains a literal neutral value. Charts include accessible names and nearby exact tabular evidence.

## Do's and Don'ts

Do keep the default light-first and white-surfaced. Do preserve theme semantics, 44px targets, table-to-card equivalence, visible focus, reduced-motion behavior, and explicit missing-evidence wording.

Do not reintroduce Composio, terminal-mockup, electric-blue, or dark-monolithic marketing guidance. Do not invent scores, rankings, prices, dates, migrations, sources, or unavailable facts. Do not use color alone for evidence quality. Do not hide evidence to make mobile fit. Do not use pill geometry for primary actions or general fields.
