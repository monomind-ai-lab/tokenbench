export type ResponsiveLayout = 'compact' | 'tablet' | 'desktop' | 'wide';

export function getResponsiveLayout(width: number): ResponsiveLayout {
  if (width < 768) return 'compact';
  if (width < 1024) return 'tablet';
  if (width < 1440) return 'desktop';
  return 'wide';
}

/**
 * Keep the page-level content inside the viewport at each acceptance width.
 * The shell uses the same gutters in CSS, so this gives the viewport harness a
 * small, deterministic contract without depending on a browser layout engine.
 */
export function contentWidthForViewport(width: number): number {
  const gutter = width < 768 ? 24 : 48;
  return Math.max(0, width - gutter);
}

export function hasHorizontalOverflow(viewportWidth: number, contentWidth: number): boolean {
  return contentWidth > viewportWidth;
}
