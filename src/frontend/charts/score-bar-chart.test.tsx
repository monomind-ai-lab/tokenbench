import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScoreBarChart } from './score-bar-chart';

const data = [
  { label: 'Alpha', value: 82.5 },
  { label: 'Beta', value: 70 },
  { label: 'Gamma', value: 55.25, muted: true },
];

describe('ScoreBarChart', () => {
  it('server-renders real bars and axis text without a DOM', () => {
    const html = renderToString(<ScoreBarChart data={data} ariaLabel="Coding score by model" />);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Coding score by model"');
    expect(html).toContain('role="img"');
    expect((html.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('Alpha');
    expect(html).toContain('82.5');
  });

  it('scales bar width to the value', () => {
    const html = renderToString(<ScoreBarChart data={data} ariaLabel="Scores" />);
    const widths = [...html.matchAll(/class="visx-bar"[^>]*width="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(widths).toHaveLength(3);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  });

  it('renders nothing when there is no data', () => {
    expect(renderToString(<ScoreBarChart data={[]} ariaLabel="Scores" />)).toBe('');
  });
});
