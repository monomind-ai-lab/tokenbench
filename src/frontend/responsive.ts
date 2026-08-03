export type ResponsiveLayout = 'compact' | 'tablet' | 'desktop' | 'wide';

export function getResponsiveLayout(width: number): ResponsiveLayout {
  if (width < 768) return 'compact';
  if (width < 1024) return 'tablet';
  if (width < 1440) return 'desktop';
  return 'wide';
}
