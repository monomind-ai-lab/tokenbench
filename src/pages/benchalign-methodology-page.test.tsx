import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const ISO_TIME = '2026-08-06T12:00:00.000Z';

function benchmarkSummaryWithBenchAlignSource(sourceMetadata: {
  readonly upstreamRevision: string | null;
  readonly schemaVersion: string | null;
} | null) {
  return {
    revision: 'published-r1',
    publishedAt: ISO_TIME,
    freshness: { status: 'fresh', checkedAt: ISO_TIME },
    attribution: [{ sourceId: 'benchlm', label: 'Data from BenchLM.ai', url: 'https://benchlm.ai/data/leaderboard.json', updatedAt: ISO_TIME }],
    data: {
      sources: [
        {
          sourceId: 'benchlm',
          available: sourceMetadata !== null,
          updatedAt: sourceMetadata === null ? null : ISO_TIME,
          artifacts: sourceMetadata === null ? [] : [{
            artifactId: 'leaderboard',
            url: 'https://benchlm.ai/data/leaderboard.json',
            updatedAt: ISO_TIME,
            upstreamRevision: sourceMetadata.upstreamRevision,
            schemaVersion: sourceMetadata.schemaVersion,
          }],
        },
        { sourceId: 'lmarena', available: false, updatedAt: null, artifacts: [] },
        { sourceId: 'litellm', available: false, updatedAt: null, artifacts: [] },
        { sourceId: 'openrouter', available: false, updatedAt: null, artifacts: [] },
      ],
      decisionPicks: [
        { key: 'llm-overall', label: 'BenchAlign leaders', status: 'benchalign', entries: [] },
        { key: 'llm-agentic', label: 'Agentic BenchAlign leaders', status: 'benchalign', entries: [] },
        { key: 'llm-coding', label: 'Coding BenchAlign leaders', status: 'benchalign', entries: [] },
        { key: 'llm-reasoning', label: 'Reasoning evidence lens', status: 'evidence-lens', entries: [] },
        { key: 'multimodal-vision-documents', label: 'Vision and documents evidence lens', status: 'evidence-lens', entries: [] },
        { key: 'llm-knowledge', label: 'Knowledge evidence lens', status: 'evidence-lens', entries: [] },
      ],
      homeDecisionSnapshot: {
        benchAlignLeader: { status: 'unavailable' },
        valueFrontierLeader: { status: 'unavailable' },
        lowestVerifiedRepresentativeRate: { status: 'unavailable' },
        pricePerformancePoints: [],
      },
    },
  };
}

describe('BenchAlign methodology page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/methodology/benchalign/');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('explains the BenchAlign source boundary without claiming ownership', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<App />);

    expect(screen.getByRole('heading', { name: 'How BenchAlign rankings work' })).toBeVisible();
    expect(screen.getByText(/TokenBench republishes BenchLM's BenchAlign results/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /Read BenchLM's methodology/i })).toHaveAttribute(
      'href',
      'https://benchlm.ai/methodology',
    );
  });

  it('receives the active BenchLM leaderboard metadata from the published same-origin summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(benchmarkSummaryWithBenchAlignSource({
      upstreamRevision: 'benchlm-method-2026-08',
      schemaVersion: '1.0',
    })), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('benchlm-method-2026-08')).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/benchmarks', expect.objectContaining({
      headers: { accept: 'application/json' },
    })));
  });

  it('keeps the published method version unavailable when the active source record has no version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(benchmarkSummaryWithBenchAlignSource({
      upstreamRevision: null,
      schemaVersion: null,
    })), { status: 200, headers: { 'content-type': 'application/json' } })));

    render(<App />);

    expect(await screen.findByText('Unavailable')).toBeVisible();
  });
});
