/**
 * Durable editorial records. Facts, calculations, and recommendations stay in
 * separate blocks so a reader can tell source evidence from TokenBench advice.
 */
export type ArticleChannel = 'guide' | 'insight';
export type FactualReviewState = 'reviewed' | 'developing' | 'stale' | 'partial';
export type EvidenceStatus = 'dated' | 'undated' | 'unavailable' | 'superseded';

export interface ArticleSource {
  readonly label: string;
  readonly url: string;
  /** A source-provided effective/announcement date, never an inferred current date. */
  readonly effectiveAt: string | null;
  readonly evidenceStatus: EvidenceStatus;
}

export interface ArticleBlock {
  readonly heading: string;
  readonly body: string;
  readonly kind: 'fact' | 'calculation' | 'interpretation' | 'recommendation';
  readonly sources: readonly ArticleSource[];
}

export interface RelatedDecisionLink {
  readonly label: string;
  readonly href: string;
}

export interface EditorialPerson {
  readonly name: string | null;
  readonly state: 'available' | 'unavailable';
}

export interface Correction {
  readonly id: string;
  readonly publishedAt: string;
  readonly detail: string;
}

export interface EvidenceTimelineEntry extends ArticleSource {
  readonly dateLabel: string;
  readonly detail: string;
}

export interface ArticleRecord {
  readonly id: string;
  readonly slug: string;
  readonly channel: ArticleChannel;
  readonly title: string;
  readonly topic: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly featured: boolean;
  readonly factualReview: FactualReviewState;
  readonly author: EditorialPerson;
  readonly reviewer: EditorialPerson;
  readonly factBlocks: readonly ArticleBlock[];
  readonly interpretationBlocks: readonly ArticleBlock[];
  readonly relatedDecisionLinks: readonly RelatedDecisionLink[];
  readonly corrections: readonly Correction[];
  readonly affectedModelIds: readonly string[];
  readonly affectedHostIds: readonly string[];
  readonly ctaEligible: boolean;
}

export const REQUIRED_GUIDE_TOPICS = [
  'Claude 3.5 Sonnet + DeepSeek V3 Hybrid Router',
  'Hybrid Routers',
  'Prompt Caching ROI/Economics',
  'Self-Hosting 70B Models',
  'Native API vs Third-Party Hosts',
  'Tokenizer Efficiency for Text and Code',
  'Model Retirement Migration',
  'Production Model Selection',
] as const;

export const INSIGHT_CATEGORIES = [
  'Releases',
  'Benchmark Analyses',
  'Pricing Changes',
  'Lifecycle Announcements',
  'Ecosystem/Technical Insights',
] as const;

export type InsightCategory = typeof INSIGHT_CATEGORIES[number];

export interface InsightRecord extends ArticleRecord {
  readonly channel: 'insight';
  readonly category: InsightCategory;
  readonly factualBrief: string;
  readonly whatChanged: string;
  readonly evidenceTimeline: readonly EvidenceTimelineEntry[];
  readonly implications: readonly string[];
}

const publishedAt = '2026-08-14T00:00:00Z';
const undatedProviderSource = (label: string, url: string): ArticleSource => ({ label, url, effectiveAt: null, evidenceStatus: 'undated' });

function insight(
  category: InsightCategory,
  slug: string,
  title: string,
  source: ArticleSource,
  whatChanged: string,
): InsightRecord {
  return {
    id: `insight-${slug}`,
    slug,
    channel: 'insight',
    title,
    topic: category.toLowerCase().replaceAll(/[^a-z]+/gu, '-').replace(/-$/u, ''),
    category,
    publishedAt,
    updatedAt: publishedAt,
    featured: category === 'Releases' || category === 'Pricing Changes',
    factualReview: source.effectiveAt ? 'reviewed' : 'partial',
    author: { name: 'TokenBench editorial desk', state: 'available' },
    reviewer: { name: null, state: 'unavailable' },
    factualBrief: `This brief records only what the cited primary material states about ${category.toLowerCase()}. ${source.effectiveAt ? `The source date is ${source.effectiveAt}.` : 'The primary material has no durable effective date in this record, so the claim remains explicitly undated.'}`,
    whatChanged,
    factBlocks: [{ heading: 'Observed facts', kind: 'fact', body: `Read the cited primary material directly before treating this ${category.toLowerCase()} record as current operational input.`, sources: [source] }],
    interpretationBlocks: [{ heading: 'TokenBench interpretation', kind: 'interpretation', body: 'Use the record to decide which local evaluation, cost, or lifecycle check to run next; it is not a substitute for testing the exact model and route.', sources: [source] }],
    evidenceTimeline: [{ ...source, dateLabel: source.effectiveAt ?? 'Effective date unavailable', detail: 'Primary-source record retained for this editorial brief.' }],
    implications: ['Verify the cited source before deployment.', 'Keep unavailable or undated evidence out of automated selection rules.'],
    corrections: [],
    affectedModelIds: [],
    affectedHostIds: [],
    relatedDecisionLinks: [
      { label: 'Compare models', href: '/compare/' },
      { label: 'Review lifecycle evidence', href: '/models/lifecycle/' },
      { label: 'Estimate cost', href: '/cost/calculator/' },
    ],
    ctaEligible: category === 'Pricing Changes' || category === 'Ecosystem/Technical Insights',
  };
}

export const INSIGHTS: readonly InsightRecord[] = [
  insight('Releases', 'provider-release-evidence-checklist', 'Release notes are the starting point, not a deployment verdict', undatedProviderSource('OpenAI release notes', 'https://help.openai.com/en/articles/9624314-model-release-notes'), 'A provider release entry may change the set of models or behaviors available to a route; this record does not infer capability or pricing from the announcement.'),
  insight('Benchmark Analyses', 'benchmark-methodology-comparability', 'Benchmark versions need a comparability check before selection', undatedProviderSource('HELM benchmark documentation', 'https://crfm.stanford.edu/helm/latest/'), 'A published benchmark result is tied to a version, prompt, harness, and evaluation condition; no universal ordering is inferred.'),
  insight('Pricing Changes', 'pricing-effective-date-check', 'Pricing notices need announcement and effective-date separation', undatedProviderSource('OpenAI API pricing', 'https://platform.openai.com/pricing'), 'A pricing page may change independently of an announcement. This record preserves an undated source state until a primary effective date is captured.'),
  insight('Lifecycle Announcements', 'lifecycle-announcement-retirement-check', 'Lifecycle notices require a migration window, not a silent substitution', undatedProviderSource('Anthropic model deprecations', 'https://docs.anthropic.com/en/docs/resources/model-deprecations'), 'An announced retirement date and a replacement recommendation are separate fields; this record leaves each unavailable rather than supplying an inferred date.'),
  insight('Ecosystem/Technical Insights', 'tokenizer-route-compatibility-check', 'Tokenizer and route compatibility should be measured on representative text', undatedProviderSource('Hugging Face tokenizers documentation', 'https://huggingface.co/docs/tokenizers/index'), 'Token counts depend on the tokenizer, text, code, and route. This brief recommends measuring the candidate workload instead of carrying a generic ratio into cost planning.'),
];

export const INSIGHT_BY_SLUG = new Map(INSIGHTS.map((record) => [record.slug, record]));

export function insightPath(slug: string): string {
  return `/articles/insights/${slug}/`;
}
