export const SUBSCRIPTION_SOURCE_CONFIGS = [
  { sourceId: 'openai-subscription', providerId: 'openai', url: 'https://chatgpt.com/pricing/' },
  { sourceId: 'anthropic-subscription', providerId: 'anthropic', url: 'https://claude.com/pricing/' },
  { sourceId: 'google-subscription', providerId: 'google', url: 'https://one.google.com/about/plans' },
  { sourceId: 'xai-subscription', providerId: 'xai', url: 'https://x.ai/pricing' },
  { sourceId: 'zai-subscription', providerId: 'zai', url: 'https://z.ai/subscribe' },
  { sourceId: 'perplexity-subscription', providerId: 'perplexity', url: 'https://www.perplexity.ai/pro' },
  { sourceId: 'microsoft-subscription', providerId: 'microsoft', url: 'https://www.microsoft.com/en-us/microsoft-365-copilot/personal' },
] as const;

export type SubscriptionSourceConfig = typeof SUBSCRIPTION_SOURCE_CONFIGS[number];

export type PublicDataSource = Readonly<{
  id: string;
  label: string;
  kind: 'Benchmark' | 'Catalog and pricing' | 'Subscription';
  url: string;
  role: string;
  refresh: string;
  publicationRule: string;
}>;

export const BENCHMARK_DATA_SOURCES: readonly PublicDataSource[] = [
  {
    id: 'benchlm',
    label: 'BenchLM',
    kind: 'Benchmark',
    url: 'https://benchlm.ai/data',
    role: 'Published language-model capability, category, and comparison evidence.',
    refresh: 'Checked on the benchmark ingestion schedule and retained by immutable source revision.',
    publicationRule: 'Only validated source rows and source-provided ranks are eligible for publication.',
  },
  {
    id: 'livebench',
    label: 'LiveBench',
    kind: 'Benchmark',
    url: 'https://github.com/LiveBench/new-livebench',
    role: 'Task-level language-model scores, category structure, and evaluation economics.',
    refresh: 'Release discovery is revision-pinned; a new release is staged and validated before activation.',
    publicationRule: 'Unknown methodology revisions, incomplete releases, and unresolved identities do not publish.',
  },
  {
    id: 'lmarena',
    label: 'LMArena',
    kind: 'Benchmark',
    url: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset',
    role: 'Human-preference and multimodal/media source lenses from the published leaderboard dataset.',
    refresh: 'Dataset revisions and every retained page are fingerprinted before publication.',
    publicationRule: 'Each source lens remains separate; missing ranks are never inferred from visible row order.',
  },
] as const;

export const CATALOG_DATA_SOURCES: readonly PublicDataSource[] = [
  {
    id: 'openrouter-models',
    label: 'OpenRouter models API',
    kind: 'Catalog and pricing',
    url: 'https://openrouter.ai/api/v1/models',
    role: 'Hosted model identity, route pricing, context limits, modalities, and supported parameters.',
    refresh: 'Fetched in the daily catalog cycle with conditional-request and last-good snapshot handling.',
    publicationRule: 'A route is published only when it remains bound to the same validated catalog revision.',
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    kind: 'Catalog and pricing',
    url: 'https://opencode.ai/docs/zen/',
    role: 'OpenCode Zen model availability and documented route pricing.',
    refresh: 'Models and pricing are retrieved independently in the daily catalog cycle, then joined.',
    publicationRule: 'Only exact available offers from the two matching source artifacts are published.',
  },
  {
    id: 'litellm',
    label: 'LiteLLM model prices and limits',
    kind: 'Catalog and pricing',
    url: 'https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json',
    role: 'Corroborating price, context, modality, and token-limit evidence.',
    refresh: 'Stored by immutable artifact hash during benchmark ingestion.',
    publicationRule: 'Corroborating rows never establish a hosted route without a reviewed identity and route binding.',
  },
] as const;

const SUBSCRIPTION_LABELS: Readonly<Record<SubscriptionSourceConfig['sourceId'], string>> = {
  'openai-subscription': 'ChatGPT plans',
  'anthropic-subscription': 'Claude plans',
  'google-subscription': 'Google AI plans',
  'xai-subscription': 'Grok plans',
  'zai-subscription': 'GLM Coding plans',
  'perplexity-subscription': 'Perplexity plans',
  'microsoft-subscription': 'Microsoft Copilot plans',
};

export const SUBSCRIPTION_DATA_SOURCES: readonly PublicDataSource[] = SUBSCRIPTION_SOURCE_CONFIGS.map((source) => ({
  id: source.sourceId,
  label: SUBSCRIPTION_LABELS[source.sourceId],
  kind: 'Subscription',
  url: source.url,
  role: 'Official plan price, billing-cycle, included-benefit, and published usage-limit evidence.',
  refresh: 'Checked daily at 00:20 UTC with robots-policy, size, content-hash, and conditional-request guards.',
  publicationRule: 'Changed or ambiguous observations require review; a failed crawl preserves the last verified catalog.',
}));

export const PUBLIC_DATA_SOURCES = [
  ...BENCHMARK_DATA_SOURCES,
  ...CATALOG_DATA_SOURCES,
  ...SUBSCRIPTION_DATA_SOURCES,
] as const;
