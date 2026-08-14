export type ChartThemeMode = 'light' | 'dark';

export interface ChartTheme {
  readonly text: string;
  readonly grid: string;
  readonly surface: string;
  readonly primary: string;
}

/** Semantic colors used by the bundled Chart.js adapter. */
export function chartThemeFor(theme: ChartThemeMode): ChartTheme {
  return theme === 'light'
    ? { text: '#475569', grid: '#e2e8f0', surface: '#ffffff', primary: '#741a66' }
    : { text: '#a8a8a8', grid: '#383838', surface: '#1d1d1d', primary: '#d88ac8' };
}

/** Legacy SVG charts still use CSS custom properties for their palette. */
export const CHART_THEME = {
  bar: 'var(--accent)',
  barMuted: 'var(--muted)',
  axis: 'var(--muted)',
  grid: 'var(--outline)',
} as const;
