import { describe, expect, it, vi } from 'vitest';
import { FRONTEND_TEST_CATALOG } from '../../src/frontend/test-fixtures';

const readPublishedCatalog = vi.hoisted(() => vi.fn());
vi.mock('../api/catalog', () => ({ readPublishedCatalog }));

import { onRequestGet } from './breakeven';

describe('breakeven GET SSR', () => {
  it('renders the sampled fee result and independent unavailable capacity evidence before JavaScript', async () => {
    readPublishedCatalog.mockResolvedValue(FRONTEND_TEST_CATALOG);
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/cost/breakeven/?seats=10&fee=20&volume=300&input=75&input_price=0.27&output_price=1.10'),
      env: { CATALOG_DB: {} as never },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Breakeven cost samples');
    expect(html).toContain('outside the displayed 0–300M range');
    expect(html).toContain('Subscription capacity evidence');
    expect(html).toContain('Unavailable');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/cost/breakeven/">');
  });
});
