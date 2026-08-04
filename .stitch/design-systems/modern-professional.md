---
name: Modern Professional
colors:
  surface: '#f9f9ff'
  surface-dim: '#d7dae3'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3fc'
  surface-container: '#ebedf7'
  surface-container-high: '#e6e8f1'
  surface-container-highest: '#e0e2eb'
  on-surface: '#181c22'
  on-surface-variant: '#414753'
  inverse-surface: '#2d3037'
  inverse-on-surface: '#eef0fa'
  outline: '#717785'
  outline-variant: '#c1c6d5'
  surface-tint: '#005db8'
  primary: '#005ab4'
  on-primary: '#ffffff'
  primary-container: '#0a73e0'
  on-primary-container: '#fefcff'
  inverse-primary: '#aac7ff'
  secondary: '#465f88'
  on-secondary: '#ffffff'
  secondary-container: '#b6d0ff'
  on-secondary-container: '#3f5881'
  tertiary: '#964400'
  on-tertiary: '#ffffff'
  tertiary-container: '#bd5700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#aac7ff'
  on-primary-fixed: '#001b3e'
  on-primary-fixed-variant: '#00458d'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#aec7f7'
  on-secondary-fixed: '#001b3d'
  on-secondary-fixed-variant: '#2d476f'
  tertiary-fixed: '#ffdbc9'
  tertiary-fixed-dim: '#ffb68c'
  on-tertiary-fixed: '#321200'
  on-tertiary-fixed-variant: '#763400'
  background: '#f9f9ff'
  on-background: '#181c22'
  surface-variant: '#e0e2eb'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
---

# Design System: Modern Professional

## Brand & Style
The brand identity has shifted from a warm, energetic orange palette to a cool, dependable, and professional blue aesthetic. The style is **Corporate / Modern**, emphasizing reliability, clarity, and precision. It draws inspiration from modern interface guidelines, balancing a clean aesthetic with functional depth. The target audience expects a trustworthy, high-performance environment that feels current yet established.

## Colors
The color palette is anchored by a vibrant, professional blue (#1275e2) which serves as the primary driver for action and brand recognition. The secondary color is a muted, desaturated blue-grey (#5f78a3) used for supporting UI elements and visual balance. A warm tertiary orange (#c55b00) provides a high-contrast accent for specific call-outs or status indicators without overwhelming the primary blue theme. The neutral palette is a sophisticated cool grey (#74777f), ensuring a clean and modern foundation.

## Typography
The system utilizes **Inter** across all typographic scales to provide a highly legible, neutral, and geometric feel. This replaces the previous Public Sans typeface to achieve a more contemporary, tech-focused appearance. Headlines use a semi-bold weight to establish clear hierarchy, while body text is optimized for readability with generous line heights. The scale is designed to be accessible across all device types, with Inter's tall x-height providing excellent clarity at smaller sizes.

## Layout & Spacing
The layout follows a fluid 12-column grid system designed for flexibility. Spacing is based on a consistent rhythmic scale (multiples of 8px), ensuring alignment and visual harmony. Gutters are set to 16px to maintain separation between components, while page margins are set to 24px for a comfortable frame. On mobile devices, the grid collapses to a single column with reduced margins to maximize screen real estate.

## Elevation & Depth
Visual hierarchy is conveyed through **tonal layers** and soft ambient shadows. Surfaces are elevated using subtle shifts in neutral tones, creating a sense of stacked depth. Higher elevation levels (like modals or floating buttons) utilize extra-diffused, low-opacity shadows with a very slight tint of the neutral grey to feel integrated into the professional environment.

## Shapes
The system has moved away from sharp corners to a **Rounded** (level 2) shape language. Standard components like buttons and input fields feature a 0.5rem (8px) corner radius. Larger containers and cards utilize 1rem (16px) or 1.5rem (24px) for 'rounded-lg' and 'rounded-xl' respectively. This change softens the professional aesthetic, making the interface feel more approachable and modern.

## Components
- **Buttons:** Feature the primary blue fill with white text; corners are rounded at 8px.
- **Input Fields:** Utilize a 1px neutral border with Inter typography; focus states use the primary blue.
- **Cards:** Use subtle elevation or low-contrast outlines with a 16px corner radius.
- **Chips:** Highly rounded (pill-style) using secondary or tertiary colors for categorization.
- **Checkboxes & Radios:** Use the primary blue for selected states to ensure high visibility.