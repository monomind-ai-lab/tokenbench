---
name: Obsidian Flux
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#c8c6c9'
  on-secondary: '#303033'
  secondary-container: '#47464a'
  on-secondary-container: '#b6b4b8'
  tertiary: '#c7c5d0'
  on-tertiary: '#2f3038'
  tertiary-container: '#90909a'
  on-tertiary-container: '#292931'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#e4e1e5'
  secondary-fixed-dim: '#c8c6c9'
  on-secondary-fixed: '#1b1b1e'
  on-secondary-fixed-variant: '#47464a'
  tertiary-fixed: '#e3e1ec'
  tertiary-fixed-dim: '#c7c5d0'
  on-tertiary-fixed: '#1a1b23'
  on-tertiary-fixed-variant: '#46464f'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
---

## Brand & Style

The design system embodies a "Deep Dark Neutral" aesthetic, prioritizing extreme legibility, focus, and a sense of sophisticated utility. The target audience includes developers, data analysts, and night-mode enthusiasts who require a low-strain, high-concentration environment.

The style is a blend of **Minimalism** and **Modern Corporate**, utilizing a strictly controlled color palette. It avoids unnecessary decorative flourishes, instead relying on precise geometry, subtle tonal shifts, and purposeful accents to create a sense of depth. The emotional response is one of calm, professional authority and technical precision.

## Colors

The palette is anchored in near-black neutrals to eliminate blue-light fatigue.

- **Primary (#3b82f6):** A vibrant blue used exclusively for interactive triggers, primary progress indicators, and critical state changes. It is used sparingly to maintain high visual impact.
- **Surface Neutrals (#09090b, #18181b):** The foundation of the UI. Backgrounds use the deepest black, while containers and cards use the slightly lighter Zinc-950 to create subtle separation.
- **Text Contrast:** High-contrast typography is mandatory. Primary text uses near-white (#fafafa) for maximum readability against dark backgrounds, while secondary text uses a muted grey (#a1a1aa) to maintain hierarchy without sacrificing legibility.

## Typography

This design system utilizes a highly technical typographic pairing. **Geist** provides a clean, geometric sans-serif feel that scales perfectly from large displays to dense body text. **JetBrains Mono** is utilized for labels, metadata, and status indicators to reinforce the systematic, "pro-tool" nature of the interface.

All headings feature tighter letter spacing to maintain visual density on dark backgrounds. Body text is prioritized for legibility with generous line heights.

## Layout & Spacing

The layout follows a strict **4px baseline grid**. A fluid 12-column grid is used for desktop layouts, transitioning to a 4-column grid for mobile.

- **Desktop:** 12 columns with 24px gutters and 48px side margins. Content is centered with a max-width of 1280px.
- **Mobile:** Single column layout with 16px side margins.
- **Rhythm:** Vertical spacing between sections should scale in increments of 16px (16, 32, 48, 64) to maintain a consistent cadence.

## Elevation & Depth

In a "Deep Dark" environment, shadows are less effective. Instead, this design system uses **Tonal Layering** and **Subtle Outlines**:

1.  **Level 0 (Base):** #09090b (The void/background).
2.  **Level 1 (Surface):** #18181b (Cards, sections, navigation bars).
3.  **Level 2 (Overlay):** #27272a (Modals, tooltips, dropdowns).

**Outlines:** To define boundaries, use a 1px solid border of #27272a for static elements. For active or hovered states, transition the border to #3f3f46. Shadows are used only on the highest elevation levels (modals), utilizing a pure black (#000000) shadow with 50% opacity and a 20px blur to suggest lift without introducing color.

## Shapes

The shape language is "Soft" yet disciplined. While the interface is technical, subtle rounding (4px-12px) prevents the UI from feeling aggressive.

- **Small elements (Checkboxes, Tags):** 4px (0.25rem).
- **Standard elements (Buttons, Inputs):** 8px (0.5rem).
- **Large elements (Cards, Modals):** 12px (0.75rem).

## Components

- **Buttons:** Primary buttons use the accent blue (#3b82f6) with white text. Secondary buttons use a transparent background with the #27272a border.
- **Inputs:** Fields use a #09090b background with a #27272a border. On focus, the border shifts to the primary blue with a 0px offset, 2px glow of the same color at 20% opacity.
- **Chips/Tags:** Small, low-contrast pills using #27272a background and #a1a1aa text.
- **Lists:** Rows are separated by 1px borders of #18181b. Hover states trigger a subtle background shift to #18181b.
- **Cards:** Defined by a #18181b background and a 1px #27272a border. No shadow is required unless the card is draggable.
- **Status Indicators:** Use semantic colors (Red for error, Green for success) but desaturate them by 20% to match the muted aesthetic of the design system.
