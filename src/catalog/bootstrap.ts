import type { CatalogResponse, SourceProvenance } from './contracts';
import { buildManualSubscriptionSources, MANUAL_SUBSCRIPTION_PROVIDER_IDS } from './manual-manifests';

const observedAt = '2026-08-12T00:00:00.000Z';
const manualSources = MANUAL_SUBSCRIPTION_PROVIDER_IDS.flatMap((providerId) => buildManualSubscriptionSources(providerId, observedAt));

const provenance: SourceProvenance[] = [
  ...manualSources.map(({ source }) => source),
  {
    id: 'opencode-zen', providerId: 'opencode', sourceUrl: 'https://opencode.ai/docs/zen', observedAt,
    sourceKind: 'official_json', confidence: 'official',
  },
  {
    id: 'openrouter-models', providerId: 'openrouter', sourceUrl: 'https://openrouter.ai/api/v1/models', observedAt,
    sourceKind: 'official_json', confidence: 'official',
  },
];

/**
 * This fallback contains only manually verified, source-linked records. Variable
 * entitlements remain variable; it never invents token caps or model prices.
 */
export const BOOTSTRAP_CATALOG: CatalogResponse = {
  revision: 'bootstrap-2026-08-12',
  publishedAt: observedAt,
  freshness: {
    status: 'bootstrap',
    checkedAt: observedAt,
    message: 'D1 has no published catalog. Serving manually verified bootstrap offers until ingestion publishes a revision.',
  },
  plans: manualSources.flatMap(({ plans }) => plans),
  modelOffers: manualSources.flatMap(({ modelOffers }) => modelOffers),
  provenance,
};
