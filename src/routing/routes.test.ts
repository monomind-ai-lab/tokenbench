import { describe, expect, it } from 'vitest';
import { LEADERBOARD_ROUTES, matchRoute, staticHtmlEntries } from './routes';

const fixedRouteCases = [
  ['/', { kind: 'home' }],
  ['/guides', { kind: 'guides' }],
  ['/guides/track-claude-code-usage', { kind: 'guides', slug: 'track-claude-code-usage' }],
  ['/guides/monitor-openai-codex-usage', { kind: 'guides', slug: 'monitor-openai-codex-usage' }],
  ['/guides/openrouter-guide-model-routing-cost-controls', { kind: 'guides', slug: 'openrouter-guide-model-routing-cost-controls' }],
  ['/guides/legitimate-free-ai-api-access-credits', { kind: 'guides', slug: 'legitimate-free-ai-api-access-credits' }],
  ['/guides/reduce-llm-api-costs-caching-batch-output-limits', { kind: 'guides', slug: 'reduce-llm-api-costs-caching-batch-output-limits' }],
  ['/tools', { kind: 'tools' }],
  ['/tools/subscriptions-vs-apis', { kind: 'calculator' }],
  ['/compare', { kind: 'compareHub' }],
  ['/leaderboards', { kind: 'leaderboards' }],
  ['/leaderboards/llm/overall', { kind: 'leaderboard', key: 'llm-overall' }],
  ['/leaderboards/llm/coding', { kind: 'leaderboard', key: 'llm-coding' }],
  ['/leaderboards/llm/agentic', { kind: 'leaderboard', key: 'llm-agentic' }],
  ['/leaderboards/llm/human-preference', { kind: 'leaderboard', key: 'llm-human-preference' }],
  ['/leaderboards/llm/value', { kind: 'leaderboard', key: 'llm-value' }],
  ['/leaderboards/llm/pricing-context', { kind: 'leaderboard', key: 'llm-pricing-context' }],
  ['/leaderboards/multimodal/vision-documents', { kind: 'leaderboard', key: 'multimodal-vision-documents' }],
  ['/leaderboards/media/text-to-image', { kind: 'leaderboard', key: 'media-text-to-image' }],
  ['/leaderboards/media/image-editing', { kind: 'leaderboard', key: 'media-image-editing' }],
  ['/leaderboards/media/text-to-video', { kind: 'leaderboard', key: 'media-text-to-video' }],
  ['/leaderboards/media/image-to-video', { kind: 'leaderboard', key: 'media-image-to-video' }],
  ['/leaderboards/media/video-editing', { kind: 'leaderboard', key: 'media-video-editing' }],
] as const;

describe('TokenBench route registry', () => {
  it('matches every fixed route with and without its trailing slash', () => {
    for (const [pathname, expected] of fixedRouteCases) {
      if (pathname === '/') {
        expect(matchRoute('/')).toEqual(expected);
        continue;
      }

      expect(matchRoute(pathname)).toEqual(expected);
      expect(matchRoute(`${pathname}/`)).toEqual(expected);
    }
  });

  it('keeps dynamic comparisons distinct from the compare hub in both slash forms', () => {
    const expected = { kind: 'comparison', pair: 'claude-4-vs-gpt-5' };

    expect(matchRoute('/compare/claude-4-vs-gpt-5')).toEqual(expected);
    expect(matchRoute('/compare/claude-4-vs-gpt-5/')).toEqual(expected);
    expect(matchRoute('/compare/')).toEqual({ kind: 'compareHub' });
  });

  it('does not turn unknown fixed-path candidates into published pages', () => {
    expect(matchRoute('/guides/not-a-guide/')).toEqual({ kind: 'notFound' });
    expect(matchRoute('/leaderboards/llm/not-a-metric/')).toEqual({ kind: 'notFound' });
  });

  it('derives every Vite input from the fixed registry without a dynamic comparison page', () => {
    const inputs = staticHtmlEntries('/generated-tokenbench');

    expect(Object.values(inputs).sort()).toEqual([
      '/generated-tokenbench/compare/index.html',
      '/generated-tokenbench/guides/index.html',
      '/generated-tokenbench/guides/legitimate-free-ai-api-access-credits/index.html',
      '/generated-tokenbench/guides/monitor-openai-codex-usage/index.html',
      '/generated-tokenbench/guides/openrouter-guide-model-routing-cost-controls/index.html',
      '/generated-tokenbench/guides/reduce-llm-api-costs-caching-batch-output-limits/index.html',
      '/generated-tokenbench/guides/track-claude-code-usage/index.html',
      '/generated-tokenbench/index.html',
      '/generated-tokenbench/leaderboards/index.html',
      '/generated-tokenbench/leaderboards/llm/agentic/index.html',
      '/generated-tokenbench/leaderboards/llm/coding/index.html',
      '/generated-tokenbench/leaderboards/llm/human-preference/index.html',
      '/generated-tokenbench/leaderboards/llm/overall/index.html',
      '/generated-tokenbench/leaderboards/llm/pricing-context/index.html',
      '/generated-tokenbench/leaderboards/llm/value/index.html',
      '/generated-tokenbench/leaderboards/media/image-editing/index.html',
      '/generated-tokenbench/leaderboards/media/image-to-video/index.html',
      '/generated-tokenbench/leaderboards/media/text-to-image/index.html',
      '/generated-tokenbench/leaderboards/media/text-to-video/index.html',
      '/generated-tokenbench/leaderboards/media/video-editing/index.html',
      '/generated-tokenbench/leaderboards/multimodal/vision-documents/index.html',
      '/generated-tokenbench/tools/index.html',
      '/generated-tokenbench/tools/subscriptions-vs-apis/index.html',
    ]);
    expect(inputs.home).toBe('/generated-tokenbench/index.html');
    expect(Object.values(inputs)).not.toContain('/generated-tokenbench/compare/claude-4-vs-gpt-5/index.html');
  });

  it('keeps human-readable navigation labels on the single leaderboard registry', () => {
    expect(LEADERBOARD_ROUTES['llm-overall'].navigationLabel).toBe('LLM overall');
    expect(LEADERBOARD_ROUTES['media-text-to-video'].navigationLabel).toBe('Text to video');
  });
});
