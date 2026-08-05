export const MOCKUP_PAGES = [
  { id: 'calculator-light', file: '.stitch/designs/calculator-light.html' },
  { id: 'compare-hub', file: '.stitch/designs/compare-hub.html' },
  { id: 'compare-detail', file: '.stitch/designs/compare-detail.html' },
  { id: 'leaderboards-directory', file: '.stitch/designs/leaderboards-directory.html' },
  { id: 'leaderboard-value', file: '.stitch/designs/leaderboard-value.html' },
] as const;

export const MOCKUP_THEMES = ['dark', 'light'] as const;

export const MOCKUP_VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
] as const;
