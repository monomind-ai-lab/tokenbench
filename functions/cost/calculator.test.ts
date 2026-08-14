import { describe, expect, it, vi } from 'vitest';
import { FRONTEND_TEST_CATALOG } from '../../src/frontend/test-fixtures';

const readPublishedCatalog = vi.hoisted(() => vi.fn());
vi.mock('../api/catalog', () => ({ readPublishedCatalog }));

import { onRequestGet } from './calculator';

describe('cost calculator GET SSR', () => {
  it('renders a bounded submitted scenario with source prices, formula, and a canonical base URL before JavaScript', async () => {
    readPublishedCatalog.mockResolvedValue(FRONTEND_TEST_CATALOG);
    const response = await onRequestGet({
      request: new Request('https://tokenbench.monomind.one/cost/calculator/?c=10&m=2&i=750&o=250&d=20&provider=provider-a&plan=provider-a%3Afixed&models=provider-a%3Aalpha%3Adirect_provider&weights=10000'),
      env: { CATALOG_DB: {} as never },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<form method="get" action="/cost/calculator/">');
    expect(html).toContain('Published input price');
    expect(html).toContain('Calculation assumptions');
    expect(html).toContain('<link rel="canonical" href="https://tokenbench.monomind.one/cost/calculator/">');
    expect(html).toContain('id="cost-calculator-initial-data" type="application/json"');
  });
});
