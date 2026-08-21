import { describe, expect, it } from 'vitest';
import type { PlanOffer, SourceProvenance } from '../../../src/catalog/contracts';
import {
  crawlSubscriptionSource,
  extractSubscriptionPriceObservations,
  mergeSubscriptionCrawlIntoSources,
  SUBSCRIPTION_SOURCE_CONFIGS,
} from './subscription-crawler';

const observedAt = '2026-08-21T00:00:00.000Z';
const config = SUBSCRIPTION_SOURCE_CONFIGS[0];

function plan(): PlanOffer {
  return {
    id: 'openai:pro',
    providerId: 'openai',
    displayName: 'ChatGPT Pro',
    monthlyCostMicroDollars: 200_000_000,
    currency: 'USD',
    pricingBasis: 'subscription',
    route: 'subscription',
    billingCycle: 'monthly',
    entitlement: { kind: 'unknown', description: 'Published usage is dynamic.' },
    entitlementEvidence: {
      status: 'dynamic_unknown',
      boundType: 'unknown',
      dimensions: [],
      source: { url: config.url, accessedAt: '2026-08-10T00:00:00.000Z', confidence: 'high' },
    },
    sourceId: config.sourceId,
  };
}

function source(): SourceProvenance {
  return {
    id: config.sourceId,
    providerId: config.providerId,
    sourceUrl: config.url,
    observedAt: '2026-08-10T00:00:00.000Z',
    sourceKind: 'manual_manifest',
    confidence: 'manual_verified',
    contentHash: 'sha256:old',
    reviewStatus: 'verified',
  };
}

function fetchFor(robots: string, page: string, status = 200): typeof fetch {
  return (async (request: RequestInfo | URL) => {
    const url = String(request);
    if (url.endsWith('/robots.txt')) return new Response(robots, { status: 200 });
    return new Response(page, { status, headers: { etag: '"page-v1"' } });
  }) as typeof fetch;
}

describe('subscription crawler', () => {
  it('honors ai-input robots signals and path disallows before fetching a page', async () => {
    let pageRequested = false;
    const fetchImpl = (async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nContent-Signal: ai-input=no\n');
      pageRequested = true;
      return new Response('<html/>');
    }) as typeof fetch;
    const result = await crawlSubscriptionSource({ config, observedAt, fetchImpl });
    expect(result.record.state).toBe('blocked');
    expect(result.record.reason).toContain('ai-input=no');
    expect(pageRequested).toBe(false);

    const disallowed = await crawlSubscriptionSource({
      config,
      observedAt,
      fetchImpl: fetchFor('User-agent: *\nDisallow: /pricing/\n', '<html/>'),
    });
    expect(disallowed.record.state).toBe('blocked');
    expect(disallowed.record.reason).toContain('robots disallows');
  });

  it('extracts only explicit USD monthly JSON-LD prices', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'ChatGPT Pro',
      offers: { '@type': 'Offer', price: '200', priceCurrency: 'USD', name: 'Monthly' },
    })}</script><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Annual', offers: { price: '2,000', priceCurrency: 'USD', name: 'Annual' },
    })}</script>`;
    expect(extractSubscriptionPriceObservations(html)).toEqual(expect.arrayContaining([expect.objectContaining({
      displayName: 'ChatGPT Pro',
      monthlyCostMicroDollars: 200_000_000,
      billingCycle: 'monthly',
    }), expect.objectContaining({ billingCycle: 'annual', monthlyCostMicroDollars: 2_000_000_000 })]));
  });

  it('records a baseline snapshot without replacing reviewed manual facts', async () => {
    const page = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'ChatGPT Pro', offers: { price: '200', priceCurrency: 'USD' },
    })}</script>`;
    const result = await crawlSubscriptionSource({ config, observedAt, fetchImpl: fetchFor('User-agent: *\nDisallow:\n', page) });
    expect(result.record.state).toBe('baseline');
    expect(result.rawBytes?.byteLength).toBeGreaterThan(0);
    const merged = mergeSubscriptionCrawlIntoSources({
      revision: 'catalog', publishedAt: observedAt, freshness: { status: 'fresh', checkedAt: observedAt },
      provenance: [source()], plans: [plan()], modelOffers: [],
    }, [{ ...result.record, snapshotKey: 'raw/openai.html' }]);
    expect(merged[0].source.sourceKind).toBe('official_html');
    expect(merged[0].source.reviewStatus).toBe('verified');
    expect(merged[0].plans[0].entitlementEvidence.status).toBe('dynamic_unknown');
  });

  it('keeps parsed price observations but makes changed entitlements needs-review', () => {
    const catalog = {
      revision: 'catalog', publishedAt: observedAt, freshness: { status: 'fresh' as const, checkedAt: observedAt },
      provenance: [source()], plans: [plan()], modelOffers: [],
    };
    const [merged] = mergeSubscriptionCrawlIntoSources(catalog, [{
      sourceId: config.sourceId, providerId: config.providerId, url: config.url, observedAt,
      state: 'changed', statusCode: 200, contentHash: 'sha256:new', etag: null, lastModified: null,
      snapshotKey: 'raw/new.html',
      priceObservations: [{ displayName: 'ChatGPT Pro', monthlyCostMicroDollars: 250_000_000, currency: 'USD', billingCycle: 'monthly', evidenceLocator: 'JSON-LD' }],
    }]);
    expect(merged.source.reviewStatus).toBe('needs_review');
    expect(merged.plans[0].monthlyCostMicroDollars).toBe(250_000_000);
    expect(merged.plans[0].entitlementEvidence.status).toBe('stale');
    expect(merged.plans[0].entitlementEvidence.staleReason).toContain('changed');
  });

});
