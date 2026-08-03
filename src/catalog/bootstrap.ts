import type { CatalogResponse, SourceProvenance } from './contracts';

const observedAt = '2026-08-03T00:00:00.000Z';

const provenance: SourceProvenance[] = [
  ['alibaba-subscription', 'alibaba', 'https://www.alibabacloud.com/campaign/ai-scene-coding'],
  ['anthropic-subscription', 'anthropic', 'https://www.anthropic.com/pricing'],
  ['deepseek-api', 'deepseek', 'https://api-docs.deepseek.com/quick_start/pricing'],
  ['xai-subscription', 'xai', 'https://x.ai/pricing'],
  ['kimi-api', 'kimi', 'https://kimi.com/help/kimi-api/api-pricing'],
  ['openai-subscription', 'openai', 'https://openai.com/chatgpt/pricing/'],
  ['opencode-zen', 'opencode', 'https://opencode.ai/docs/zen'],
  ['zai-subscription', 'zai', 'https://z.ai/subscribe'],
  ['openrouter-models', 'openrouter', 'https://openrouter.ai/api/v1/models'],
].map(([id, providerId, sourceUrl]) => ({
  id,
  providerId,
  sourceUrl,
  observedAt,
  sourceKind: id === 'openrouter-models' || id === 'opencode-zen' ? 'official_json' as const : 'manual_manifest' as const,
  confidence: 'manual_verified' as const,
}));

/**
 * This fallback deliberately carries source records only. It never guesses token
 * prices or subscription entitlements when the published D1 revision is absent.
 */
export const BOOTSTRAP_CATALOG: CatalogResponse = {
  revision: 'bootstrap-2026-08-03',
  publishedAt: observedAt,
  freshness: {
    status: 'bootstrap',
    checkedAt: observedAt,
    message: 'D1 has no published catalog. Source records are manually verified; offers await ingestion.',
  },
  plans: [],
  modelOffers: [],
  provenance,
};
