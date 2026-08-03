import { describe, expect, it } from 'vitest';
import { contentWidthForViewport, getResponsiveLayout, hasHorizontalOverflow } from './responsive';

describe('responsive viewport harness', () => {
  it.each([
    [320, 'compact'],
    [375, 'compact'],
    [768, 'tablet'],
    [1024, 'desktop'],
    [1440, 'wide'],
  ] as const)('maps %s px to the acceptance layout', (width, layout) => {
    expect(getResponsiveLayout(width)).toBe(layout);
  });

  it.each([320, 375, 768, 1024, 1440])('keeps page content within the %s px viewport', (width) => {
    expect(hasHorizontalOverflow(width, contentWidthForViewport(width))).toBe(false);
  });
});
