import type { ArticleBlock, ArticleRecord, ArticleSource, RelatedDecisionLink } from '../articles/content';
import { REQUIRED_GUIDE_TOPICS } from '../articles/content';
import type { LeaderboardKey } from '../routing/routes';

export interface GuideSource extends ArticleSource {}

export interface GuideTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface GuideSection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly steps?: readonly string[];
  readonly bullets?: readonly string[];
  readonly table?: GuideTable;
  readonly callout?: { readonly title: string; readonly text: string };
  readonly sources?: readonly GuideSource[];
}

export interface GuideContextualLink {
  readonly leaderboard: LeaderboardKey;
  readonly label: string;
  readonly description: string;
}

export interface GuideArticle extends ArticleRecord {
  readonly channel: 'guide';
  readonly seoTitle: string;
  readonly description: string;
  readonly dek: string;
  readonly category: string;
  readonly readMinutes?: number;
  readonly keywords: readonly string[];
  readonly takeaways: readonly string[];
  readonly decisionQuestion: string;
  readonly answer: string;
  readonly assumptions: readonly string[];
  readonly framework: readonly string[];
  readonly limitations: readonly string[];
  readonly sections: readonly GuideSection[];
  readonly contextualLinks: readonly GuideContextualLink[];
  readonly relatedSlugs: readonly string[];
}

const publishedAt = '2026-08-14T00:00:00Z';
const editorialAuthor = { name: 'TokenBench editorial desk', state: 'available' } as const;
const reviewerUnavailable = { name: null, state: 'unavailable' } as const;
const modelGuideSource = (label: string, url: string): GuideSource => ({ label, url, effectiveAt: null, evidenceStatus: 'undated' });

const sourceLibrary = {
  anthropicModels: modelGuideSource('Anthropic models overview', 'https://docs.anthropic.com/en/docs/about-claude/models/overview'),
  deepseekV3: modelGuideSource('DeepSeek-V3 project', 'https://github.com/deepseek-ai/DeepSeek-V3'),
  openRouterRouting: modelGuideSource('OpenRouter routing documentation', 'https://openrouter.ai/docs/guides/routing'),
  anthropicCaching: modelGuideSource('Anthropic prompt caching documentation', 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching'),
  huggingFaceInference: modelGuideSource('Hugging Face inference endpoints documentation', 'https://huggingface.co/docs/inference-endpoints/index'),
  openaiPricing: modelGuideSource('OpenAI API pricing', 'https://platform.openai.com/pricing'),
  tokenizerDocs: modelGuideSource('Hugging Face tokenizers documentation', 'https://huggingface.co/docs/tokenizers/index'),
  anthropicDeprecations: modelGuideSource('Anthropic model deprecations', 'https://docs.anthropic.com/en/docs/resources/model-deprecations'),
  helm: modelGuideSource('HELM benchmark documentation', 'https://crfm.stanford.edu/helm/latest/'),
} as const;

const defaultLinks: readonly RelatedDecisionLink[] = [
  { label: 'Compare models', href: '/compare/' },
  { label: 'Review pricing and context', href: '/leaderboards/llm/pricing-context/' },
  { label: 'Estimate API costs', href: '/cost/calculator/' },
];

function toSection(index: number, title: string, body: string, source: GuideSource): GuideSection {
  return {
    id: title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replace(/-$/u, ''),
    title: `${index}. ${title}`,
    paragraphs: [body],
    sources: [source],
  };
}

interface NewGuide {
  readonly slug: string;
  readonly title: string;
  readonly topic: typeof REQUIRED_GUIDE_TOPICS[number];
  readonly category: string;
  readonly dek: string;
  readonly decisionQuestion: string;
  readonly answer: string;
  readonly assumptions: readonly string[];
  readonly framework: readonly string[];
  readonly limitations: readonly string[];
  readonly source: GuideSource;
  readonly secondarySource?: GuideSource;
  readonly ctaEligible?: boolean;
}

function makeGuide(input: NewGuide, position: number): GuideArticle {
  const sources = input.secondarySource ? [input.source, input.secondarySource] : [input.source];
  const observed: ArticleBlock = {
    heading: 'Observed facts',
    kind: 'fact',
    body: `The primary documentation linked below is the evidence record for this guide. Its effective date is explicitly unavailable in this static editorial record, so readers must not treat it as a current price, lifecycle, or capability assertion.`,
    sources,
  };
  const calculation: ArticleBlock = {
    heading: 'Calculation or example',
    kind: 'calculation',
    body: 'Create a versioned worksheet with the route, token mix, traffic window, and currency before comparing options. The example is a reproducible decision frame, not a quoted provider price.',
    sources,
  };
  const recommendation: ArticleBlock = {
    heading: 'Editorial recommendation',
    kind: 'recommendation',
    body: input.answer,
    sources,
  };
  const sections = [
    toSection(1, 'Confirm the evidence boundary', `Open ${input.source.label} and record the exact model, host, date, and terms that apply to the decision. If the source has no effective date, keep the result marked undated.`, input.source),
    toSection(2, 'Run the framework on representative work', input.framework.join(' '), input.secondarySource ?? input.source),
    toSection(3, 'Make the decision explicit', `${input.answer} Keep an acceptance threshold and a rollback path alongside the cost or performance comparison.`, input.source),
  ];
  return {
    id: `guide-${input.slug}`,
    slug: input.slug,
    channel: 'guide',
    title: input.title,
    topic: input.topic,
    seoTitle: input.title,
    description: input.dek,
    dek: input.dek,
    category: input.category,
    keywords: [input.topic, input.category, 'evidence-aware AI decisions'],
    publishedAt,
    updatedAt: publishedAt,
    featured: position < 3,
    factualReview: 'partial',
    author: editorialAuthor,
    reviewer: reviewerUnavailable,
    readMinutes: 7,
    takeaways: [input.decisionQuestion, input.answer, 'Keep documented evidence and local measurements separate.'],
    decisionQuestion: input.decisionQuestion,
    answer: input.answer,
    assumptions: input.assumptions,
    framework: input.framework,
    limitations: input.limitations,
    factBlocks: [observed, calculation],
    interpretationBlocks: [recommendation],
    sections,
    contextualLinks: [{
      leaderboard: 'llm-pricing-context',
      label: 'Review AI model pricing and context',
      description: 'Inspect route-level publication and unavailable evidence before using it in a total.',
    }],
    relatedDecisionLinks: defaultLinks,
    relatedSlugs: [],
    corrections: [],
    affectedModelIds: [],
    affectedHostIds: [],
    ctaEligible: input.ctaEligible ?? true,
  };
}

const guideDefinitions: readonly NewGuide[] = [
  {
    slug: 'claude-deepseek-hybrid-router', title: 'Claude 3.5 Sonnet + DeepSeek V3 Hybrid Router', topic: 'Claude 3.5 Sonnet + DeepSeek V3 Hybrid Router', category: 'Routing strategy',
    dek: 'A decision framework for routing routine and high-stakes work while keeping the exact host, version, and evaluation visible.',
    decisionQuestion: 'When should a workload use Claude 3.5 Sonnet or DeepSeek V3 in a hybrid route?',
    answer: 'Route only after a representative evaluation defines the quality floor, fallback behavior, host policy, and evidence date for each candidate.',
    assumptions: ['The workload has a measurable acceptance test.', 'Both candidates are available through an approved route.', 'The router records selected model and fallback outcome.'],
    framework: ['Classify requests by required quality, latency, and context.', 'Evaluate both candidates on versioned samples.', 'Set a conservative fallback and audit its result.'],
    limitations: ['Provider availability and route terms can change.', 'No price or capability is inferred from this guide.'], source: sourceLibrary.anthropicModels, secondarySource: sourceLibrary.deepseekV3,
  },
  {
    slug: 'hybrid-routers', title: 'Hybrid Routers', topic: 'Hybrid Routers', category: 'Routing strategy',
    dek: 'Design a model router that can explain each route choice instead of concealing cost or quality trade-offs behind a single score.',
    decisionQuestion: 'How should a team introduce a hybrid router without losing decision traceability?',
    answer: 'Start with explicit policy bands, observability, and a deterministic fallback; automate selection only after the route has been measured against the accepted outcome.',
    assumptions: ['The team controls a routing policy.', 'Each route can expose an identity and error state.', 'Acceptance is reviewed by workload class.'],
    framework: ['Define route eligibility per task class.', 'Record prompt class, route, and outcome without user content.', 'Review misses before widening automation.'],
    limitations: ['A router cannot repair an unsupported host.', 'Benchmarks may not represent production tool use.'], source: sourceLibrary.openRouterRouting,
  },
  {
    slug: 'prompt-caching-roi-economics', title: 'Prompt Caching ROI/Economics', topic: 'Prompt Caching ROI/Economics', category: 'Cost optimization',
    dek: 'Measure whether a stable prefix is reused enough to justify caching, while keeping cache-write and cache-read evidence distinct.',
    decisionQuestion: 'Does prompt caching reduce cost per successful task for this workload?',
    answer: 'Measure stable-prefix reuse, cache-write behavior, cache-read behavior, and outcome quality together; do not assume a published discount applies to a different route.',
    assumptions: ['The prompt has a stable reusable prefix.', 'Cache hits and misses can be observed.', 'The workload records successful outcomes.'],
    framework: ['Separate stable and variable tokens.', 'Measure cold and warm runs.', 'Compare totals against the same quality threshold.'],
    limitations: ['Caching policies are provider and route specific.', 'Undated documentation is not a current rate card.'], source: sourceLibrary.anthropicCaching,
  },
  {
    slug: 'self-hosting-70b-models', title: 'Self-Hosting 70B Models', topic: 'Self-Hosting 70B Models', category: 'Deployment',
    dek: 'Frame self-hosting as a capacity, operations, latency, and quality decision rather than a public-price substitution.',
    decisionQuestion: 'When is a self-hosted 70B model a credible production option?',
    answer: 'Use a self-hosted candidate only after its capacity plan, security controls, operations ownership, and workload evaluation pass together.',
    assumptions: ['Capacity estimates use observed concurrency.', 'Operations ownership is named.', 'The model license and host policy are reviewed.'],
    framework: ['Measure demand and latency at peak.', 'Cost infrastructure and operator time separately.', 'Compare quality and failure recovery with the managed route.'],
    limitations: ['Hardware availability and model support vary.', 'A parameter count does not predict workload quality.'], source: sourceLibrary.huggingFaceInference,
  },
  {
    slug: 'native-api-vs-third-party-hosts', title: 'Native API vs Third-Party Hosts', topic: 'Native API vs Third-Party Hosts', category: 'Host selection',
    dek: 'Choose a native API or third-party host with explicit provenance, policy, support, pricing, and failover requirements.',
    decisionQuestion: 'Which host should serve a model when both native and third-party routes are available?',
    answer: 'Compare the exact serving route and commercial terms, then select only a host that satisfies provenance, data handling, support, and fallback requirements.',
    assumptions: ['The team can identify the serving host.', 'Data policy requirements are documented.', 'The route is tested with production-like traffic.'],
    framework: ['Inventory host-specific evidence.', 'Compare policy and operational requirements.', 'Run a controlled route evaluation before migration.'],
    limitations: ['A model label does not make two hosts equivalent.', 'Current pricing needs direct dated evidence.'], source: sourceLibrary.openaiPricing,
  },
  {
    slug: 'tokenizer-efficiency-text-code', title: 'Tokenizer Efficiency for Text and Code', topic: 'Tokenizer Efficiency for Text and Code', category: 'Workload measurement',
    dek: 'Measure tokens on the actual text and code mix before turning a generic token ratio into a cost or context plan.',
    decisionQuestion: 'How do tokenizer differences affect text and code planning?',
    answer: 'Run candidate tokenizers on a representative, privacy-safe sample and report the distribution rather than one universal ratio.',
    assumptions: ['Samples include the real text and code mix.', 'Inputs are approved for local measurement.', 'The exact tokenizer version is retained.'],
    framework: ['Collect representative documents and code.', 'Tokenize with recorded versions.', 'Compare distribution, context pressure, and outcome quality.'],
    limitations: ['Token ratios shift by language and formatting.', 'A tokenizer count alone does not establish model quality.'], source: sourceLibrary.tokenizerDocs,
  },
  {
    slug: 'model-retirement-migration', title: 'Model Retirement Migration', topic: 'Model Retirement Migration', category: 'Lifecycle',
    dek: 'Prepare a migration that keeps announcement date, retirement date, replacement evidence, and rollback constraints separate.',
    decisionQuestion: 'How should a team migrate before a model retirement without assuming a replacement is equivalent?',
    answer: 'Treat announcement, retirement, replacement evaluation, and rollout as distinct lifecycle stages and preserve an explicit unknown state when dates are missing.',
    assumptions: ['The current route and model identities are inventoried.', 'A rollback plan is feasible.', 'Evaluation owners are named.'],
    framework: ['Capture the primary lifecycle notice.', 'Map affected integrations and tests.', 'Evaluate replacement candidates before staged rollout.'],
    limitations: ['Provider notices can change.', 'A suggested replacement may differ by route or workload.'], source: sourceLibrary.anthropicDeprecations,
  },
  {
    slug: 'production-model-selection', title: 'Production Model Selection', topic: 'Production Model Selection', category: 'Selection',
    dek: 'Select a production model from explicit workload evidence, evaluation limits, route costs, lifecycle risk, and operational controls.',
    decisionQuestion: 'What is the defensible process for selecting a production model?',
    answer: 'Choose the candidate that clears a written quality and operational threshold for the workload, then document the evidence gaps that remain.',
    assumptions: ['Success criteria are measurable.', 'Evaluation data is representative and approved.', 'Route and lifecycle evidence is available or marked unavailable.'],
    framework: ['Define quality, latency, cost, and governance thresholds.', 'Run versioned tests on representative work.', 'Review lifecycle and host evidence before release.'],
    limitations: ['Public benchmarks are not a production guarantee.', 'No static article can substitute for local acceptance tests.'], source: sourceLibrary.helm,
  },
];

export const GUIDES: readonly GuideArticle[] = guideDefinitions.map(makeGuide);
export const GUIDE_BY_SLUG = new Map(GUIDES.map((guide) => [guide.slug, guide]));

export function guidePath(slug: string): string {
  return `/articles/guides/${slug}/`;
}

export function relatedGuides(guide: GuideArticle): readonly GuideArticle[] {
  const explicit = guide.relatedSlugs.map((slug) => GUIDE_BY_SLUG.get(slug)).filter((item): item is GuideArticle => Boolean(item));
  return explicit.length > 0 ? explicit : GUIDES.filter((candidate) => candidate.slug !== guide.slug).slice(0, 3);
}
