import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const decisionSurfaces = [
  'src/App.tsx',
  'src/pages/models-page.tsx',
  'src/frontend/model-directory-pareto.tsx',
  'src/pages/leaderboards-page.tsx',
  'src/pages/price-performance-page.tsx',
  'src/frontend/price-performance-chart.tsx',
] as const;

describe('V2.1 decision headings', () => {
  it('uses headings and factual status rows instead of decorative eyebrow scaffolding', () => {
    for (const pathname of decisionSurfaces) {
      const source = readFileSync(resolve(process.cwd(), pathname), 'utf8');
      expect(source, pathname).not.toContain('className="eyebrow"');
    }
  });
});
