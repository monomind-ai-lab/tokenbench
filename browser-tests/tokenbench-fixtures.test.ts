import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/compare/[pair]';
import { parseComparisonViewModel } from '../src/frontend/comparison-contracts';
import { HANDLER_SPARSE_COMPARISON_PATH, handlerBackedComparisonDatabase } from './tokenbench-fixtures';

function embeddedComparisonPayload(html: string): unknown {
  const payload = html.match(/<script id="comparison-initial-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!payload) throw new Error('Expected a server comparison hydration payload.');
  return JSON.parse(payload) as unknown;
}

describe('handler-backed comparison fixture', () => {
  it('keeps the exact sparse comparison document acceptable to the browser hydration contract', async () => {
    const response = await onRequestGet({
      request: new Request(`https://tokenbench.test${HANDLER_SPARSE_COMPARISON_PATH}`),
      env: { CATALOG_DB: handlerBackedComparisonDatabase() },
      params: { pair: 'canvas-vs-alpha' },
    });
    const viewModel = parseComparisonViewModel(embeddedComparisonPayload(await response.text()));

    expect(response.status).toBe(200);
    expect(viewModel).not.toBeNull();
    expect(viewModel).toMatchObject({
      canonicalPath: HANDLER_SPARSE_COMPARISON_PATH,
      models: [
        { modelKey: 'lmarena:canvas', evidenceStatus: 'source_only' },
        { modelKey: 'provider:alpha', evidenceStatus: 'supported' },
      ],
      priceChecks: [
        { modelKey: 'lmarena:canvas', selectedRouteId: null, checks: [] },
        { modelKey: 'provider:alpha', selectedRouteId: 'direct:alpha' },
      ],
    });
  });
});
