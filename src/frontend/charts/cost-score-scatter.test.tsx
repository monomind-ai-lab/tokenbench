import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CostScoreScatter, type CostScorePoint } from './cost-score-scatter';

const data: readonly CostScorePoint[] = [
  { label: 'Hy3', cost: 0.5, score: 41.2, frontier: true, href: '/models/hy3/' },
  { label: 'Claude Opus 5', cost: 10, score: 80.4, frontier: true, href: '/models/claude-opus-5/' },
  { label: 'Overpriced', cost: 18, score: 60.1, frontier: false, href: null },
];

describe('CostScoreScatter', () => {
  it('renders one marker per point in server-rendered SVG', () => {
    const html = renderToString(<CostScoreScatter data={data} ariaLabel="Cost versus score" />);
    expect(html.match(/<circle/gu)).toHaveLength(3);
  });

  it('connects only frontier points with the frontier path', () => {
    const html = renderToString(<CostScoreScatter data={data} ariaLabel="Cost versus score" />);
    expect(html).toContain('cost-score-frontier');
  });

  it('exposes the accessible label and a per-point title', () => {
    const html = renderToString(<CostScoreScatter data={data} ariaLabel="Cost versus score" />);
    expect(html).toContain('aria-label="Cost versus score"');
    expect(html).toContain('Claude Opus 5');
  });

  it('renders nothing when there is no data rather than an empty axis', () => {
    expect(renderToString(<CostScoreScatter data={[]} ariaLabel="Cost versus score" />)).toBe('');
  });

  it('renders nothing when any point carries a non-finite value', () => {
    const bad = [{ label: 'X', cost: Number.NaN, score: 50, frontier: false, href: null }];
    expect(renderToString(<CostScoreScatter data={bad} ariaLabel="Cost versus score" />)).toBe('');
  });

  it('emits a real SVG rather than an empty shell under renderToString', () => {
    // Recharts emits a ~127-byte empty shell in a DOM-free runtime. These pages
    // are server-rendered for SEO, so the chart must contain real geometry.
    const html = renderToString(<CostScoreScatter data={data} ariaLabel="Cost versus score" />);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('<svg');
  });
});
