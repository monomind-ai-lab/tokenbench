import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PercentileBar } from './percentile-bar';

describe('PercentileBar', () => {
  it('renders a bar whose width matches the percentile', () => {
    const html = renderToString(<PercentileBar percentile={72.5} label="Coding percentile" />);
    expect(html).toContain('72.5%');
    expect(html).toContain('role="img"');
  });

  it('renders an explicit unavailable state instead of a zero-width bar', () => {
    const html = renderToString(<PercentileBar percentile={null} label="Coding percentile" />);
    expect(html).toContain('Unavailable');
    expect(html).not.toContain('width:0%');
  });

  it('clamps an out-of-range percentile', () => {
    expect(renderToString(<PercentileBar percentile={140} label="x" />)).toContain('100.0%');
    expect(renderToString(<PercentileBar percentile={-20} label="x" />)).toContain('0.0%');
  });

  it('treats a non-finite percentile as unavailable rather than plotting it', () => {
    const html = renderToString(<PercentileBar percentile={Number.NaN} label="x" />);
    expect(html).toContain('Unavailable');
  });

  it('exposes the label to assistive technology', () => {
    const html = renderToString(<PercentileBar percentile={40} label="Coding percentile" />);
    expect(html).toContain('Coding percentile');
  });
});
