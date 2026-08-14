import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { modelProfileViewModelFixture } from '../frontend/model-profile-test-fixture';
import { ModelProfilePage, categoryLeaderboardPath } from './model-profile-page';

describe('categoryLeaderboardPath', () => {
  it('maps a known category key to its leaderboard route', () => {
    expect(categoryLeaderboardPath('coding')).toBe('/leaderboards/llm/coding/');
    expect(categoryLeaderboardPath('agentic')).toBe('/leaderboards/llm/agentic/');
    expect(categoryLeaderboardPath('knowledge')).toBe('/leaderboards/llm/knowledge/');
    expect(categoryLeaderboardPath('reasoning')).toBe('/leaderboards/llm/reasoning/');
    expect(categoryLeaderboardPath('overall')).toBe('/leaderboards/llm/overall/');
  });

  it('maps the multimodal category to its non-llm route', () => {
    // A `llm-${key}` template would yield the nonexistent
    // "llm-multimodalGrounded"; the real route is multimodal-vision-documents.
    expect(categoryLeaderboardPath('multimodalGrounded'))
      .toBe('/leaderboards/multimodal/vision-documents/');
    expect(categoryLeaderboardPath('multimodal'))
      .toBe('/leaderboards/multimodal/vision-documents/');
  });

  it('returns null for a category with no published leaderboard', () => {
    expect(categoryLeaderboardPath('mathematics')).toBeNull();
    expect(categoryLeaderboardPath('not-a-category')).toBeNull();
  });
});

describe('ModelProfilePage', () => {
  it('keeps native and hosted endpoint evidence separate in the full dossier', () => {
    const viewModel = {
      ...modelProfileViewModelFixture(),
      endpointEvidence: [
        {
          endpointId: 'openai:gpt-5-6-sol', hostId: 'openai', native: true,
          availability: 'available', inputPrice: 5, outputPrice: 30, cacheReadPrice: 0.5, cacheWritePrice: null,
          longContextRule: 'Published native context: 400,000 tokens.', ttft: 0.8, throughput: 120,
          conditions: 'Provider published measurement conditions.', effectiveAt: '2026-08-11T18:00:00.000Z',
        },
        {
          endpointId: 'openrouter:openai/gpt-5-6-sol', hostId: 'openrouter', native: false,
          availability: 'available', inputPrice: 5.5, outputPrice: 31, cacheReadPrice: null, cacheWritePrice: null,
          longContextRule: null, ttft: null, throughput: null,
          conditions: null, effectiveAt: '2026-08-11T18:00:00.000Z',
        },
      ],
    };

    render(<ModelProfilePage viewModel={viewModel} />);

    expect(screen.getByRole('heading', { name: 'Endpoint evidence' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Native endpoint facts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hosted endpoint facts' })).toBeInTheDocument();
    expect(screen.getByText('History and change log')).toBeInTheDocument();
    expect(screen.getByText('Workload examples')).toBeInTheDocument();
    expect(screen.getByText('Limitations')).toBeInTheDocument();
  });

  it('shows corrected category evidence, route facts, and ledger sources', () => {
    render(<ModelProfilePage viewModel={modelProfileViewModelFixture()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'GPT-5.6 Sol' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Coding' })).toHaveTextContent('78.0');
    expect(screen.getByRole('article', { name: 'Coding' })).toHaveTextContent('#3');
    expect(screen.getAllByText('$5.00').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /source/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Score' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Last Updated' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('BenchLM')[0].closest('a')).toHaveAttribute('href', 'https://benchlm.ai/models/gpt-5-6-sol');
    expect(screen.queryByRole('columnheader', { name: 'Benchmark' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Raw' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Evidence' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sources' })).not.toBeInTheDocument();
  });

  it('names each category ledger without dropping its source-linked evidence', () => {
    render(<ModelProfilePage viewModel={modelProfileViewModelFixture()} />);

    const overallLedger = screen.getByRole('table', { name: 'Overall benchmark ledger' });
    const codingLedger = screen.getByRole('table', { name: 'Coding benchmark ledger' });
    expect(overallLedger).toHaveTextContent('81.48');
    expect(codingLedger).toHaveTextContent('77.95');
    expect(screen.getAllByRole('link', { name: 'Overall source' })[0]).toHaveAttribute('href', 'https://benchlm.ai/models/gpt-5-6-sol');
  });

  it('links each category name to its leaderboard', () => {
    render(<ModelProfilePage viewModel={modelProfileViewModelFixture()} />);
    const coding = screen.getByRole('link', { name: 'Coding leaderboard' });
    expect(coding).toHaveAttribute('href', '/leaderboards/llm/coding/');
    const overall = screen.getByRole('link', { name: 'Overall leaderboard' });
    expect(overall).toHaveAttribute('href', '/leaderboards/llm/overall/');
  });

  it('keeps a category without a leaderboard as plain text', () => {
    render(<ModelProfilePage viewModel={modelProfileViewModelFixture()} />);
    // The fixture's "Multimodal" category maps to vision-documents; a category
    // with no route must not render an anchor.
    expect(screen.queryByRole('link', { name: 'Mathematics leaderboard' })).not.toBeInTheDocument();
  });
});
