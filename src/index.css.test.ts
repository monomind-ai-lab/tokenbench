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

  it('keeps audited editorial actions at the shared 44px target without thick colored side tabs', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toMatch(/\.article-filters a\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.evidence-timeline a\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.guide-index-heading > a\s*\{[^}]*min-height:\s*44px/s);
    expect(css).not.toMatch(/\.cost-evidence-note\s*\{[^}]*border-left:\s*3px/s);
    expect(css).not.toMatch(/\.model-decision-copy p\s*\{[^}]*border-left:\s*3px/s);
  });

  it('keeps long editorial breadcrumb context visible while allowing it to wrap on compact layouts', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toMatch(/\.breadcrumbs\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(css).toMatch(/\.breadcrumbs\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  });

  it('keeps written evidence and table fallbacks in print while suppressing interactive chrome', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toMatch(/@media print\s*\{[\s\S]*\.article-source[^}]*display:\s*inline-flex/s);
    expect(css).toMatch(/@media print\s*\{[\s\S]*\.comparison-radar-table[^}]*display:\s*table/s);
    expect(css).toMatch(/@media print\s*\{[\s\S]*\.top-header[^}]*display:\s*none/s);
    expect(css).toMatch(/@media print\s*\{[\s\S]*\.article-filters[^}]*display:\s*none/s);
    expect(css).toMatch(/@media print\s*\{[\s\S]*\.comparison-tray[^}]*display:\s*none/s);
  });

  it('constrains the breakeven canvas to its compact panel after Chart.js measures it', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toMatch(/\.breakeven-chart-panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(css).toMatch(/\.breakeven-chart canvas\s*\{[^}]*width:\s*100%\s*!important/s);
    expect(css).toMatch(/\.breakeven-chart canvas\s*\{[^}]*max-width:\s*100%/s);
  });

  it('allows the models Pareto surface to shrink around its responsive chart at compact widths', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toMatch(/\.models-pareto\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.models-pareto\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  });
});
