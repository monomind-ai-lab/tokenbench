import { SITE_CONFIG } from '../brand/site-config';
import { GUIDE_BY_SLUG } from '../guides/content';
import { LEADERBOARD_ROUTES, pathnameForRoute, type AppRoute } from '../routing/routes';

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
    title: `AI Cost and Model Benchmark Decisions | ${SITE_CONFIG.name}`,
    description: `${SITE_CONFIG.name} helps teams compare AI costs, model benchmarks, pricing context, and decision paths with source-aware methodology and transparent caveats.`,
    h1: 'AI cost and model benchmark decisions',
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
  calculator: {
    title: `Subscription vs API Cost Calculator | ${SITE_CONFIG.name}`,
    description: `Estimate how a paid AI subscription compares with direct API pricing using your monthly token usage, model mix, and ${SITE_CONFIG.name}'s verified provider evidence.`,
    h1: 'Subscription vs API cost calculator',
  },
  compareHub: {
    title: `Compare AI Models and Costs | ${SITE_CONFIG.name}`,
    description: `Compare AI models with ${SITE_CONFIG.name} by benchmark context, pricing information, and documented evidence while keeping unavailable measurements visibly unavailable.`,
    h1: 'Compare AI models and costs',
  },
  leaderboards: {
    title: `AI Model Leaderboards | ${SITE_CONFIG.name}`,
    description: `Browse ${SITE_CONFIG.name}'s source-aware AI model leaderboards for capability, coding, agentic work, human preference, multimodal tasks, and media generation.`,
    h1: 'AI model leaderboards',
  },
  comparison: {
    title: `AI Model Comparison | ${SITE_CONFIG.name}`,
    description: `Use ${SITE_CONFIG.name} to compare two AI models with evidence-aware benchmark, cost, and capability context.`,
    h1: 'AI model comparison',
    robots: 'noindex,follow' as const,
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
    case 'tools': return makeMetadata('/tools/', pageDefinitions.tools);
    case 'calculator': return makeMetadata('/tools/subscriptions-vs-apis/', pageDefinitions.calculator);
    case 'compareHub': return makeMetadata('/compare/', pageDefinitions.compareHub);
    case 'leaderboards': return makeMetadata('/leaderboards/', pageDefinitions.leaderboards);
    case 'leaderboard': {
      const definition = LEADERBOARD_ROUTES[route.key];
      return makeMetadata(definition.pathname, definition.seo);
    }
    case 'guides': {
      if (!route.slug) return makeMetadata('/guides/', pageDefinitions.guides);
      const guide = GUIDE_BY_SLUG.get(route.slug);
      if (!guide) return makeMetadata('/guides/', pageDefinitions.notFound);
      return makeMetadata(`/guides/${guide.slug}/`, {
        title: `${guide.seoTitle} | ${SITE_CONFIG.name}`,
        description: guide.description,
        h1: guide.title,
        type: 'article',
      });
    }
    case 'comparison': return makeMetadata(pathnameForRoute(route) ?? '/compare/', {
      ...pageDefinitions.comparison,
      title: `${route.pair.replaceAll('-', ' ')} comparison | ${SITE_CONFIG.name}`,
      h1: `${route.pair.replaceAll('-', ' ')} comparison`,
    }, false);
    case 'notFound': return makeMetadata('/', pageDefinitions.notFound);
  }
}
