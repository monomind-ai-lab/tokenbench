import { HOME_PAGE_COPY, SITE_CONFIG } from '../brand/site-config';
import { INSIGHT_BY_SLUG, insightPath } from '../articles/content';
import { GUIDE_BY_SLUG, guidePath } from '../guides/content';
import { LEADERBOARD_ROUTES, ROUTE_PATHS, pathnameForRoute, type AppRoute } from '../routing/routes';

export interface PageMetadata {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly h1: string;
  readonly robots: 'index,follow' | 'noindex,follow';
  readonly openGraph: {
    readonly type: 'website' | 'article';
    readonly title: string;
    readonly description: string;
    readonly url: string;
    readonly image: string;
    readonly imageAlt: string;
  };
  readonly twitter: {
    readonly card: 'summary_large_image';
    readonly title: string;
    readonly description: string;
    readonly image: string;
  };
}

interface MetadataDefinition {
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly type?: 'website' | 'article';
  readonly robots?: 'index,follow' | 'noindex,follow';
}

const socialImage = `${SITE_CONFIG.origin}/og-guides.png`;

function canonicalUrl(pathname: string, trailingSlash = true): string {
  if (pathname === '/') return SITE_CONFIG.origin;
  const normalizedPathname = trailingSlash
    ? pathname.endsWith('/') ? pathname : `${pathname}/`
    : pathname.replace(/\/+$/, '');
  return `${SITE_CONFIG.origin}${normalizedPathname}`;
}

function makeMetadata(pathname: string, definition: MetadataDefinition, trailingSlash = true): PageMetadata {
  const canonical = canonicalUrl(pathname, trailingSlash);
  return {
    ...definition,
    robots: definition.robots ?? 'index,follow',
    openGraph: {
      type: definition.type ?? 'website',
      title: definition.title,
      description: definition.description,
      url: canonical,
      image: socialImage,
      imageAlt: `${SITE_CONFIG.name} — ${definition.h1}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: definition.title,
      description: definition.description,
      image: socialImage,
    },
    canonical,
  };
}

const pageDefinitions = {
  home: {
    title: `${HOME_PAGE_COPY.h1} | ${SITE_CONFIG.name}`,
    description: HOME_PAGE_COPY.subcopy,
    h1: HOME_PAGE_COPY.h1,
  },
  guides: {
    title: `AI Cost Optimization Guides | ${SITE_CONFIG.name}`,
    description: `Read practical AI cost optimization guides from ${SITE_CONFIG.name} for tracking usage, choosing access paths, controlling token spend, and reviewing provider evidence.`,
    h1: 'AI cost optimization guides',
  },
  tools: {
    title: `AI Cost Decision Tools | ${SITE_CONFIG.name}`,
    description: `Explore ${SITE_CONFIG.name} decision tools for comparing AI subscriptions, direct API costs, model pricing context, and workload-aware tradeoffs.`,
    h1: 'AI cost decision tools',
  },
  cost: {
    title: `AI Subscription Cost Tools | ${SITE_CONFIG.name}`,
    description: `Compare AI subscription and direct API costs with ${SITE_CONFIG.name}'s workload-aware, source-backed decision tools.`,
    h1: 'Subscribe vs API',
  },
  calculator: {
    title: `Subscription vs API Cost Calculator | ${SITE_CONFIG.name}`,
    description: `Compare subscription plan fees with API-equivalent pricing from conversations, messages, directional input and output tokens, active days, and ${SITE_CONFIG.name}'s verified provider evidence.`,
    h1: 'Subscription vs API cost calculator',
  },
  breakeven: {
    title: `Subscription Breakeven Calculator | ${SITE_CONFIG.name}`,
    description: `Estimate the workload crossover between an AI subscription and direct API pricing with ${SITE_CONFIG.name}'s source-backed calculator inputs.`,
    h1: 'Subscription breakeven calculator',
  },
  articles: {
    title: `AI Articles | ${SITE_CONFIG.name}`,
    description: `Browse ${SITE_CONFIG.name}'s technical AI cost guides and evidence-aware articles for practical model and workload decisions.`,
    h1: 'AI articles',
  },
  insights: {
    title: `LLM Insights | ${SITE_CONFIG.name}`,
    description: `Follow ${SITE_CONFIG.name}'s evidence-aware AI ecosystem updates, model releases, and benchmark analysis as this channel is populated.`,
    h1: 'LLM insights',
    robots: 'noindex,follow' as const,
  },
  pricePerformance: {
    title: `LLM Price vs Performance | ${SITE_CONFIG.name}`,
    description: `Compare current public AI benchmark scores with direct API price on ${SITE_CONFIG.name}, inspect the Pareto efficiency frontier, and review every plotted model in an accessible evidence table.`,
    h1: 'LLM Price vs. Performance Benchmark',
  },
  compareHub: {
    title: `Compare AI Models and Costs | ${SITE_CONFIG.name}`,
    description: `Compare AI models with ${SITE_CONFIG.name} by benchmark context, pricing information, and documented evidence while keeping unavailable measurements visibly unavailable.`,
    h1: 'Compare models side by side',
  },
  models: {
    title: `Popular AI Models | ${SITE_CONFIG.name}`,
    description: `Browse the current weekly top 100 AI models and search retained model profiles with source-linked benchmark, pricing, and evidence facts from ${SITE_CONFIG.name}.`,
    h1: 'Popular AI models',
  },
  modelLifecycle: {
    title: `Model Lifecycle Radar | ${SITE_CONFIG.name}`,
    description: `Review current and archived model lifecycle records on ${SITE_CONFIG.name}, with validated seen dates and explicit unavailable states for unsupported releases, retirement, migration, cost, and speed evidence.`,
    h1: 'Model Lifecycle Radar',
  },
  newsletterConfirmed: {
    title: `Subscription confirmed | ${SITE_CONFIG.name}`,
    description: `Your ${SITE_CONFIG.name} newsletter subscription is confirmed. The current test cheatsheet PDF will arrive by email; start exploring AI cost and benchmark decision tools.`,
    h1: 'Your subscription is confirmed.',
    robots: 'noindex,follow' as const,
  },
  welcome: {
    title: `Welcome to ${SITE_CONFIG.name}`,
    description: `Welcome to ${SITE_CONFIG.name}. Compare direct AI API pricing, model benchmarks, and subscription value with source-backed evidence.`,
    h1: `Welcome to ${SITE_CONFIG.name}`,
    robots: 'noindex,follow' as const,
  },
  privacy: {
    title: `Privacy Policy | ${SITE_CONFIG.name}`,
    description: `Read the ${SITE_CONFIG.name} privacy policy explaining how MonoMind AI Lab collects, uses, protects, and safeguards personal data across the site, decision engines, and newsletter.`,
    h1: 'Privacy Policy for TokenBench',
  },
  leaderboards: {
    title: `AI Model Leaderboards | ${SITE_CONFIG.name}`,
    description: `Browse ${SITE_CONFIG.name}'s source-aware AI model leaderboards for capability, coding, agentic work, human preference, multimodal tasks, and media generation.`,
    h1: 'Model leaderboards',
  },
  methodologyBenchAlign: {
    title: `How BenchAlign Rankings Work | ${SITE_CONFIG.name}`,
    description: `Read how ${SITE_CONFIG.name} republishes BenchLM's BenchAlign output, separates supported and estimated rows, and preserves source methodology and refresh boundaries.`,
    h1: 'How BenchAlign rankings work',
  },
  comparison: {
    title: `AI Model Comparison | ${SITE_CONFIG.name}`,
    description: `Use ${SITE_CONFIG.name} to compare two AI models with evidence-aware benchmark, cost, and capability context.`,
    h1: 'AI model comparison',
    robots: 'noindex,follow' as const,
  },
  modelProfile: {
    title: `AI Model Evidence Profile | ${SITE_CONFIG.name}`,
    description: `Review a retained AI model profile on ${SITE_CONFIG.name} with source-backed benchmark scores, relative field ranks, route pricing, specifications, and an auditable evidence ledger.`,
    h1: 'AI model evidence profile',
  },
  notFound: {
    title: `Page Not Found | ${SITE_CONFIG.name}`,
    description: `The requested ${SITE_CONFIG.name} page is not available. Browse AI cost tools, model leaderboards, comparisons, or optimization guides instead.`,
    h1: 'Page not found',
    robots: 'noindex,follow' as const,
  },
} as const;

export function metadataForRoute(route: AppRoute): PageMetadata {
  switch (route.kind) {
    case 'home': return makeMetadata('/', pageDefinitions.home);
    case 'cost': return makeMetadata(ROUTE_PATHS.cost, pageDefinitions.cost);
    case 'tools': return makeMetadata('/tools/', pageDefinitions.tools);
    case 'calculator': return makeMetadata(ROUTE_PATHS.calculator, pageDefinitions.calculator);
    case 'breakeven': return makeMetadata(ROUTE_PATHS.breakeven, pageDefinitions.breakeven);
    case 'pricePerformance': return makeMetadata(ROUTE_PATHS.pricePerformance, pageDefinitions.pricePerformance);
    case 'methodologyBenchAlign': return makeMetadata('/methodology/benchalign/', pageDefinitions.methodologyBenchAlign);
    case 'compareHub': return makeMetadata('/compare/', pageDefinitions.compareHub);
    case 'models': return makeMetadata(ROUTE_PATHS.models, pageDefinitions.models);
    case 'modelLifecycle': return makeMetadata(ROUTE_PATHS.modelLifecycle, pageDefinitions.modelLifecycle);
    case 'newsletterConfirmed': return makeMetadata(ROUTE_PATHS.newsletterConfirmed, pageDefinitions.newsletterConfirmed);
    case 'welcome': return makeMetadata(ROUTE_PATHS.welcome, pageDefinitions.welcome);
    case 'privacy': return makeMetadata(ROUTE_PATHS.privacy, pageDefinitions.privacy);
    case 'leaderboards': return makeMetadata('/leaderboards/', pageDefinitions.leaderboards);
    case 'leaderboard': {
      const definition = LEADERBOARD_ROUTES[route.key];
      return makeMetadata(definition.pathname, definition.seo);
    }
    case 'guides': {
      if (!route.slug) return makeMetadata(ROUTE_PATHS.guides, pageDefinitions.guides);
      const guide = GUIDE_BY_SLUG.get(route.slug);
      if (!guide) return makeMetadata(ROUTE_PATHS.guides, pageDefinitions.notFound);
      return makeMetadata(guidePath(guide.slug), {
        title: `${guide.seoTitle} | ${SITE_CONFIG.name}`,
        description: guide.description,
        h1: guide.title,
        type: 'article',
      });
    }
    case 'articles': return makeMetadata(ROUTE_PATHS.articles, pageDefinitions.articles);
    case 'insights': return makeMetadata(ROUTE_PATHS.insights, pageDefinitions.insights);
    case 'insightDetail': {
      const insight = INSIGHT_BY_SLUG.get(route.slug);
      if (!insight) return makeMetadata(ROUTE_PATHS.insights, pageDefinitions.notFound);
      return makeMetadata(insightPath(insight.slug), {
        title: `${insight.title} | ${SITE_CONFIG.name}`,
        description: insight.factualBrief,
        h1: insight.title,
        type: 'article',
      });
    }
    case 'comparison': return makeMetadata(pathnameForRoute(route) ?? ROUTE_PATHS.comparison, {
      ...pageDefinitions.comparison,
      title: `${route.pair.replaceAll('-', ' ')}: evidence-qualified comparison | ${SITE_CONFIG.name}`,
      description: `Compare ${route.pair.replaceAll('-vs-', ' and ').replaceAll('-', ' ')} with published benchmark, route-price, and evidence-coverage context from ${SITE_CONFIG.name}.`,
      h1: `${route.pair.replaceAll('-', ' ')} comparison`,
    });
    case 'modelProfile': return makeMetadata(pathnameForRoute(route) ?? ROUTE_PATHS.models, {
      ...pageDefinitions.modelProfile,
      title: `${route.slug.replaceAll('-', ' ')} model evidence | ${SITE_CONFIG.name}`,
      h1: `${route.slug.replaceAll('-', ' ')} model evidence`,
    });
    case 'redirect': return makeMetadata(route.to, pageDefinitions.notFound);
    case 'notFound': return makeMetadata('/', pageDefinitions.notFound);
  }
}
