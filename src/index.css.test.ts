import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Task 9 responsive styles', () => {
  it('defines cost decision, chart, and narrow-layout contracts without relying on page overflow', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toMatch(/\.cost-tool-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/\.breakeven-chart\s*\{[^}]*min-height: 260px/s);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.cost-tool-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
    expect(css).toMatch(/\.cost-tool-card .*\.button[^}]*min-height: 44px/s);
  });
});
