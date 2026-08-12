/** Chart colors reference existing CSS custom properties so themes stay in sync. */
export const CHART_THEME = {
  bar: 'var(--accent)',
  barMuted: 'var(--muted)',
  axis: 'var(--muted)',
  grid: 'var(--outline)',
} as const;
