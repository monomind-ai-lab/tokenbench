import {
  GUIDES,
  articlePath as guideArticlePath,
  type GuideArticle,
  type GuideContextualLink,
  type GuideSection,
  type GuideSource,
  type GuideTable,
} from '../guides/content';

export type ArticleChannel = 'guides' | 'insights' | 'news';
export type ArticleContentType = 'guide' | 'hybrid-router' | 'insight' | 'news';

export interface ArticleCard {
  readonly label: string;
  readonly title: string;
  readonly description: string;
}

export interface ArticleFigure {
  readonly ariaLabel: string;
  readonly caption: string;
  readonly values: readonly { readonly label: string; readonly value: number }[];
}

export interface ArticleContextLink {
  readonly href: string;
  readonly label: string;
  readonly description: string;
}

export interface ArticleSection extends Omit<GuideSection, 'table' | 'sources'> {
  readonly table?: GuideTable;
  readonly sources?: readonly GuideSource[];
  readonly tocLabel?: string;
  readonly decision?: string;
  readonly cards?: readonly ArticleCard[];
  readonly figure?: ArticleFigure;
  readonly detailsTable?: { readonly label: string; readonly table: GuideTable };
  readonly contextLinks?: readonly ArticleContextLink[];
}

interface ArticleBase {
  readonly slug: string;
  readonly channel: ArticleChannel;
  readonly channelLabel: 'Guides' | 'Insights' | 'News';
  readonly contentType: ArticleContentType;
  readonly title: string;
  readonly seoTitle: string;
  readonly description: string;
  readonly dek: string;
  readonly category: string;
  readonly readMinutes: number;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly keywords: readonly string[];
  readonly takeaways: readonly string[];
  readonly sections: readonly ArticleSection[];
  readonly contextualLinks: readonly GuideContextualLink[];
  readonly relatedSlugs: readonly string[];
  readonly fixtureNote?: string;
}

export interface GuideArticleRecord extends ArticleBase {
  readonly contentType: 'guide';
  readonly source: GuideArticle;
}

export interface EditorialArticleRecord extends ArticleBase {
  readonly contentType: 'hybrid-router' | 'insight' | 'news';
}

/** A discriminated, route-ready record for every article channel. */
export type Article = GuideArticleRecord | EditorialArticleRecord;

export { guideArticlePath as articlePath };

function guideArticle(source: GuideArticle): GuideArticleRecord {
  return {
    ...source,
    channel: 'guides',
    channelLabel: 'Guides',
    contentType: 'guide',
    source,
  };
}

const HYBRID_ROUTER_ARTICLE: EditorialArticleRecord = {
  slug: 'hybrid-router',
  channel: 'guides',
  channelLabel: 'Guides',
  contentType: 'hybrid-router',
  title: 'A hybrid router for high-stakes agentic work',
  seoTitle: 'Hybrid router guide',
  description: 'A decision framework for using a hybrid model router while keeping cost, evidence, escalation, and rollback explicit.',
  dek: 'A decision framework for reserving expensive capability for the requests that need it, while keeping routine work observable and reversible.',
  category: 'Architecture',
  readMinutes: 9,
  publishedAt: '2026-08-15',
  updatedAt: '2026-08-15',
  keywords: ['hybrid model routing', 'AI routing guardrails', 'agentic work', 'model cost controls'],
  takeaways: [
    'Use a hybrid route only when requests can be classified before dispatch.',
    'Reserve the higher-capability lane for ambiguity, multi-file work, and costly failure modes.',
    'Keep escalation, sampled review, and rollback visible beside any projected cost benefit.',
  ],
  fixtureNote: 'Evidence boundary: all numerical examples in this guide are illustrative prototype fixtures, not live pricing or measured savings.',
  sections: [
    {
      id: 'question',
      title: '1. Decide whether a hybrid route is justified',
      tocLabel: 'Decide whether a hybrid route is justified',
      decision: 'When is a two-model route operationally safer and economically better than sending every request to one endpoint?',
      paragraphs: ['Begin with a narrow, reviewable split: route multi-file agentic coding and high-ambiguity tasks to the higher-capability lane; route stable classification, extraction, and straightforward drafting to the lower-cost lane.'],
      callout: { title: 'Executive recommendation', text: 'Keep an explicit escalation path, a sampled review queue, and a fixed rollback switch. This is a decision pattern—not a claim that any named model always dominates another.' },
    },
    {
      id: 'assumptions',
      title: '2. State the assumptions that make the route auditable',
      tocLabel: 'State auditable assumptions',
      paragraphs: ['A blended result is only useful when the route can be reconstructed later. Record the conditions that determine dispatch before comparing projected cost.'],
      bullets: [
        'Traffic can be labeled by task type before dispatch.',
        'Quality loss has a measurable business cost and an escalation mechanism.',
        'Latency and price are measured under the same host and workload conditions.',
        'Fallback behavior is tested independently from the primary route.',
      ],
      callout: { title: 'Rollback is part of the route', text: 'A cheaper lane without a tested recovery path is an unpriced failure mode. Treat rollback time and review effort as routing costs.' },
    },
    {
      id: 'evidence',
      title: '3. Separate facts, derived relationships, and interpretation',
      tocLabel: 'Separate evidence and interpretation',
      paragraphs: ['Evidence quality changes what a routing result can support. Keep prototype fixtures and editorial judgment visibly separate from observed prices, service measurements, and production outcomes.'],
      table: {
        headers: ['Statement', 'Type', 'What to verify'],
        rows: [
          ['Request mix changes the blended monthly cost.', 'Derived relationship', 'Input/output mix and host prices'],
          ['A high-capability lane is worth its cost for complex work.', 'Interpretation', 'Acceptance rate, recovery cost, human review'],
          ['Illustrative scenario: 70/30 routine/complex split.', 'Prototype fixture', 'Replace with production telemetry'],
        ],
      },
      cards: [
        { label: 'Derived relationship', title: 'Request mix changes blended monthly cost.', description: 'Verify the input/output mix and host prices.' },
        { label: 'Interpretation', title: 'Complex work may justify a higher-capability lane.', description: 'Verify acceptance rate, recovery cost, and human review.' },
        { label: 'Prototype fixture', title: 'Illustrative 70/30 routine-to-complex split.', description: 'Replace the fixture with production telemetry.' },
      ],
      callout: { title: 'Evidence cue', text: 'Route-price, capability, and SLA values must share an observation window before they are used in a decision. Missing evidence remains unavailable rather than inferred.' },
    },
    {
      id: 'cost',
      title: '4. Compare routing policies on the same cost basis',
      tocLabel: 'Compare routing policies',
      paragraphs: ['The chart below demonstrates how three routing policies can be reviewed. It does not report live prices, measured savings, or a recommended production split.'],
      figure: {
        ariaLabel: 'Illustrative horizontal routing cost comparison',
        caption: 'Illustrative monthly cost index. Lower cost does not imply acceptable quality or operational risk.',
        values: [
          { label: 'Single premium lane', value: 100 },
          { label: 'Hybrid with review', value: 62 },
          { label: 'Single economy lane', value: 41 },
        ],
      },
      detailsTable: {
        label: 'Exact illustrative routing cost values',
        table: { headers: ['Policy', 'Monthly index'], rows: [['Single premium lane', '100'], ['Hybrid with review', '62'], ['Single economy lane', '41']] },
      },
    },
    {
      id: 'matrix',
      title: '5. Choose the route and its guardrail together',
      tocLabel: 'Choose route and guardrail',
      paragraphs: ['The routing condition, preferred lane, and operational guardrail form one decision. Separating them makes a cheap path look safer than it is.'],
      table: {
        headers: ['Condition', 'Preferred route', 'Guardrail'],
        rows: [
          ['Multi-file change, unclear acceptance criteria', 'Capability lane', 'Human review on sampled completions'],
          ['Stable extraction, bounded output', 'Economy lane', 'Schema validation and fallback'],
          ['Latency breach or provider incident', 'Fallback lane', 'Circuit breaker and event log'],
        ],
      },
      cards: [
        { label: 'Capability lane', title: 'Multi-file change with unclear acceptance criteria', description: 'Guardrail: human review on sampled completions.' },
        { label: 'Economy lane', title: 'Stable extraction with bounded output', description: 'Guardrail: schema validation and fallback.' },
        { label: 'Fallback lane', title: 'Latency breach or provider incident', description: 'Guardrail: circuit breaker and event log.' },
      ],
    },
    {
      id: 'next',
      title: '6. Continue with the decision surfaces',
      tocLabel: 'Continue with decision surfaces',
      paragraphs: ['Use the framework to build a shortlist, inspect model constraints, and compare candidates under the same assumptions.'],
      contextLinks: [
        { href: '/models', label: 'Models workbench', description: 'Inspect price, performance, and lifecycle evidence.' },
        { href: '/make-it-yours/', label: 'Make it yours', description: 'Re-rank models around the six capability weights.' },
        { href: '/compare', label: 'Compare models', description: 'Carry two to four candidates into a detailed trade-off view.' },
      ],
    },
  ],
  contextualLinks: [],
  relatedSlugs: ['track-claude-code-usage', 'openrouter-guide-model-routing-cost-controls', 'reduce-llm-api-costs-caching-batch-output-limits'],
};

const INSIGHT_ARTICLES: readonly EditorialArticleRecord[] = [
  {
    slug: 'routing-decision-record', channel: 'insights', channelLabel: 'Insights', contentType: 'insight',
    title: 'Prototype insight: What belongs in a routing decision record?', seoTitle: 'Routing decision record prototype insight',
    description: 'A proposed reading path for comparing a request taxonomy, an escalation rule, and the evidence needed to revisit the choice. This is illustrative prototype content.',
    dek: 'A proposed reading path for comparing a request taxonomy, an escalation rule, and the evidence needed to revisit the choice.',
    category: 'Prototype insight', readMinutes: 4, publishedAt: '2026-08-14', updatedAt: '2026-08-14',
    keywords: ['prototype insight', 'routing decision record', 'model routing'],
    takeaways: ['This is illustrative prototype content, not published research.', 'A routing decision remains reviewable when its classification and escalation rule are recorded.'],
    sections: [{ id: 'decision-record', title: 'A proposed routing decision record', paragraphs: ['Record the request taxonomy, the escalation rule, the expected evidence, and the review date together. This gives a team one place to revisit a routing choice when traffic, prices, or quality change.'] }],
    contextualLinks: [], relatedSlugs: ['hybrid-router', 'model-selection-unknowns'],
    fixtureNote: 'LLM Insight entries are prototype-labeled editorial concepts, not published research or factual claims.',
  },
  {
    slug: 'model-selection-unknowns', channel: 'insights', channelLabel: 'Insights', contentType: 'insight',
    title: 'Prototype insight: Make unknowns visible before model selection', seoTitle: 'Model selection unknowns prototype insight',
    description: 'A clearly labeled concept note on presenting missing evidence beside a candidate list, rather than filling gaps with an implied conclusion.',
    dek: 'A clearly labeled concept note on presenting missing evidence beside a candidate list, rather than filling gaps with an implied conclusion.',
    category: 'Prototype insight', readMinutes: 5, publishedAt: '2026-08-13', updatedAt: '2026-08-13',
    keywords: ['prototype insight', 'model selection', 'missing evidence'],
    takeaways: ['Missing evidence is a finding, not permission to infer the result.', 'Candidate lists are easier to audit when facts and unknowns use different labels.'],
    sections: [{ id: 'unknowns', title: 'Keep the unknowns in the decision surface', paragraphs: ['Present the unavailable measurement next to the candidate list, explain what would verify it, and avoid filling the gap with a proxy score. The decision remains clearer when an unknown stays visible.'] }],
    contextualLinks: [], relatedSlugs: ['hybrid-router', 'routing-decision-record'],
    fixtureNote: 'LLM Insight entries are prototype-labeled editorial concepts, not published research or factual claims.',
  },
];

export const ARTICLES: readonly Article[] = [
  ...GUIDES.map(guideArticle),
  HYBRID_ROUTER_ARTICLE,
  ...INSIGHT_ARTICLES,
];

export const ARTICLE_BY_SLUG = new Map(ARTICLES.map((article) => [article.slug, article]));

export function relatedArticles(article: Article): Article[] {
  return article.relatedSlugs.map((slug) => ARTICLE_BY_SLUG.get(slug)).filter((item): item is Article => Boolean(item));
}
