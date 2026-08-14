import { SITE_CONFIG } from '../brand/site-config';
import { GUIDE_BY_SLUG, GUIDES, guidePath } from '../guides/content';

export const ROUTE_PATHS = {
  home: '/',
  articles: '/articles/',
  guides: '/articles/guides/',
  insights: '/articles/insights/',
  tools: '/tools/',
  cost: '/cost/',
  calculator: '/cost/calculator/',
  breakeven: '/cost/breakeven/',
  pricePerformance: '/llm-price-performance/',
  compareHub: '/compare/',
  comparison: '/models/compare/',
  models: '/models/',
  modelLifecycle: '/models/lifecycle/',
  leaderboards: '/leaderboards/',
  leaderboardSla: '/leaderboards/sla/',
  leaderboardCustom: '/leaderboards/custom/',
  methodologyBenchAlign: '/methodology/benchalign/',
  newsletterConfirmed: '/newsletter/confirmed/',
  welcome: '/welcome/',
  privacy: '/privacy/',
} as const;

export const LEADERBOARD_CATEGORIES = ['overall', 'coding', 'agentic', 'math', 'reasoning', 'multimodal'] as const;
export type LeaderboardCategory = typeof LEADERBOARD_CATEGORIES[number];

export type SiteNavigationPage = 'home' | 'calculator' | 'pricePerformance' | 'models' | 'compare' | 'leaderboards' | 'guides';

export const LEADERBOARD_ROUTES = {
  'llm-overall': {
    pathname: '/leaderboards/llm/overall/',
    navigationLabel: 'Overall benchmarks',
    seo: {
      title: `Overall benchmarks | ${SITE_CONFIG.name}`,
      description: `Compare supported AI models by overall benchmark capability with clear source attribution, methodology context, and ${SITE_CONFIG.name}'s unavailable-data handling.`,
      h1: 'Overall benchmarks',
      summary: 'Review the supported overall-capability signal alongside its source, update time, and methodology before making a model decision.',
    },
  },
  'llm-coding': {
    pathname: '/leaderboards/llm/coding/',
    navigationLabel: 'Coding performance',
    seo: {
      title: `Coding benchmark | ${SITE_CONFIG.name}`,
      description: `Compare supported AI coding models with source-aware benchmark context, transparent methodology, and ${SITE_CONFIG.name}'s explicit treatment of missing measurements.`,
      h1: 'Coding benchmark',
      summary: 'Use coding benchmark evidence as one input to a workload-specific evaluation, not as a substitute for your repository and toolchain tests.',
    },
  },
  'llm-agentic': {
    pathname: '/leaderboards/llm/agentic/',
    navigationLabel: 'Agentic performance',
    seo: {
      title: `Agentic performance | ${SITE_CONFIG.name}`,
      description: `Explore supported agentic AI model benchmarks with source-level context, publication timestamps, and ${SITE_CONFIG.name}'s clear methodology for unavailable results.`,
      h1: 'Agentic performance',
      summary: 'Agentic performance depends on the tools, policies, and task environment; inspect the evidence before generalizing a benchmark result.',
    },
  },
  'llm-reasoning': {
    pathname: '/leaderboards/llm/reasoning/',
    navigationLabel: 'Reasoning',
    seo: {
      title: `Reasoning | ${SITE_CONFIG.name}`,
      description: `Review supported AI reasoning category evidence from BenchLM with source-level methodology, timestamps, and ${SITE_CONFIG.name}'s explicit unavailable-data handling. This category evidence lens is not a validated BenchAlign ranking.`,
      h1: 'Reasoning',
      summary: 'Reasoning is a BenchLM-published category evidence lens, not a validated BenchAlign ranking; inspect the exact source measurement before applying it to your workload.',
    },
  },
  'llm-knowledge': {
    pathname: '/leaderboards/llm/knowledge/',
    navigationLabel: 'Knowledge',
    seo: {
      title: `Knowledge | ${SITE_CONFIG.name}`,
      description: `Review supported AI knowledge category evidence from BenchLM with source-level methodology, timestamps, and ${SITE_CONFIG.name}'s explicit unavailable-data handling. This category evidence lens is not a validated BenchAlign ranking.`,
      h1: 'Knowledge',
      summary: 'Knowledge is a BenchLM-published category evidence lens, not a validated BenchAlign ranking. If BenchLM has not published the reviewed category metric, this view remains unavailable rather than inferring a result.',
    },
  },
  'llm-human-preference': {
    pathname: '/leaderboards/llm/human-preference/',
    navigationLabel: 'Human preference',
    seo: {
      title: `Human preference | ${SITE_CONFIG.name}`,
      description: `Review human-preference AI model rankings with visible source context, methodology notes, and ${SITE_CONFIG.name}'s honest unavailable states for incomplete evidence.`,
      h1: 'Human preference',
      summary: 'Human-preference signals are useful for comparing perceived response quality, while task fit and safety requirements still need local evaluation.',
    },
  },
  'llm-value': {
    pathname: '/leaderboards/llm/value/',
    navigationLabel: 'Value frontier',
    seo: {
      title: `Value frontier | ${SITE_CONFIG.name}`,
      description: `Explore the AI model value frontier using disclosed workload costs, supported benchmark evidence, and ${SITE_CONFIG.name}'s transparent Pareto methodology instead of an opaque score.`,
      h1: 'Value frontier',
      summary: 'Value views compare supported capability evidence with stated workload costs and never present an unsupported universal value score.',
    },
  },
  'llm-pricing-context': {
    pathname: '/leaderboards/llm/pricing-context/',
    navigationLabel: 'Pricing and context',
    seo: {
      title: `Pricing and context | ${SITE_CONFIG.name}`,
      description: `Compare AI model pricing context and declared context windows with source attribution, route-level caveats, and ${SITE_CONFIG.name}'s explicit unavailable-data states.`,
      h1: 'Pricing and context',
      summary: 'Price and context information are route-specific; compare the exact provider route and declared limits relevant to your workload.',
    },
  },
  'multimodal-vision-documents': {
    pathname: '/leaderboards/multimodal/vision-documents/',
    navigationLabel: 'Vision and documents',
    seo: {
      title: `Multimodal | ${SITE_CONFIG.name}`,
      description: `Compare supported vision and document AI benchmarks with source-aware methodology, timestamped evidence, and ${SITE_CONFIG.name}'s clear unavailable-result handling.`,
      h1: 'Multimodal',
      summary: 'Vision and document results should be checked against the image, document, language, and extraction conditions that match your use case.',
    },
  },
  'media-text-to-image': {
    pathname: '/leaderboards/media/text-to-image/',
    navigationLabel: 'Text to image',
    seo: {
      title: `Text to image | ${SITE_CONFIG.name}`,
      description: `Explore text-to-image model rankings with source-level attribution, methodology context, and ${SITE_CONFIG.name}'s transparent handling for missing benchmark evidence.`,
      h1: 'Text to image',
      summary: 'Image-generation rankings describe a measured evaluation context and should be paired with prompt, licensing, and workflow review.',
    },
  },
  'media-image-editing': {
    pathname: '/leaderboards/media/image-editing/',
    navigationLabel: 'Image editing',
    seo: {
      title: `Image editing | ${SITE_CONFIG.name}`,
      description: `Review AI image-editing model rankings with source attribution, transparent methodology, and ${SITE_CONFIG.name}'s explicit unavailable states for incomplete evidence.`,
      h1: 'Image editing',
      summary: 'Evaluate editing models against the transformations, source assets, rights, and fidelity requirements of the real production workflow.',
    },
  },
  'media-text-to-video': {
    pathname: '/leaderboards/media/text-to-video/',
    navigationLabel: 'Text to video',
    seo: {
      title: `Text to video | ${SITE_CONFIG.name}`,
      description: `Compare text-to-video model rankings with visible source context, methodology notes, and ${SITE_CONFIG.name}'s transparent treatment of unavailable benchmark evidence.`,
      h1: 'Text to video',
      summary: 'Video-generation evidence should be considered alongside duration, controls, rights, and production workflow requirements.',
    },
  },
  'media-image-to-video': {
    pathname: '/leaderboards/media/image-to-video/',
    navigationLabel: 'Image to video',
    seo: {
      title: `Image to video | ${SITE_CONFIG.name}`,
      description: `Explore image-to-video model rankings with source-level attribution, transparent methodology, and ${SITE_CONFIG.name}'s clear treatment of missing results.`,
      h1: 'Image to video',
      summary: 'Image-to-video rankings are only one signal; assess input fidelity, motion controls, rights, and output reliability for your workflow.',
    },
  },
  'media-video-editing': {
    pathname: '/leaderboards/media/video-editing/',
    navigationLabel: 'Video editing',
    seo: {
      title: `Video editing | ${SITE_CONFIG.name}`,
      description: `Review AI video-editing model rankings with source attribution, methodology context, and ${SITE_CONFIG.name}'s transparent unavailable-data handling.`,
      h1: 'Video editing',
      summary: 'Use video-editing evidence to frame a hands-on workflow test that includes source media, edit controls, rights, and delivery constraints.',
    },
  },
} as const;

export type LeaderboardKey = keyof typeof LEADERBOARD_ROUTES;

export type AppRoute =
  | { kind: 'home' }
  | { kind: 'cost' }
  | { kind: 'tools' }
  | { kind: 'calculator' }
  | { kind: 'breakeven' }
  | { kind: 'pricePerformance' }
  | { kind: 'methodologyBenchAlign' }
  | { kind: 'guides'; slug?: string }
  | { kind: 'articles' }
  | { kind: 'insights' }
  | { kind: 'compareHub' }
  | { kind: 'models' }
  | { kind: 'modelLifecycle' }
  | { kind: 'comparison'; pair: string }
  | { kind: 'modelProfile'; slug: string }
  | { kind: 'newsletterConfirmed' }
  | { kind: 'welcome' }
  | { kind: 'privacy' }
  | { kind: 'leaderboards' }
  | { kind: 'leaderboardCategory'; category: LeaderboardCategory }
  | { kind: 'leaderboardSla' }
  | { kind: 'leaderboardCustom' }
  | { kind: 'leaderboard'; key: LeaderboardKey }
  | { kind: 'insightDetail'; slug: string }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' };

export type FixedAppRoute = Exclude<AppRoute, { kind: 'comparison' } | { kind: 'modelProfile' } | { kind: 'insightDetail' } | { kind: 'redirect' } | { kind: 'notFound' }>;

export interface FixedRouteDefinition {
  readonly id: string;
  readonly pathname: string;
  readonly route: FixedAppRoute;
}

const basicFixedRoutes: readonly FixedRouteDefinition[] = [
  { id: 'home', pathname: ROUTE_PATHS.home, route: { kind: 'home' } },
  { id: 'cost', pathname: ROUTE_PATHS.cost, route: { kind: 'cost' } },
  { id: 'calculator', pathname: ROUTE_PATHS.calculator, route: { kind: 'calculator' } },
  { id: 'breakeven', pathname: ROUTE_PATHS.breakeven, route: { kind: 'breakeven' } },
  { id: 'articles', pathname: ROUTE_PATHS.articles, route: { kind: 'articles' } },
  { id: 'guides', pathname: ROUTE_PATHS.guides, route: { kind: 'guides' } },
  { id: 'insights', pathname: ROUTE_PATHS.insights, route: { kind: 'insights' } },
  ...GUIDES.map((guide) => ({
    id: `guide-${guide.slug}`,
    pathname: guidePath(guide.slug),
    route: { kind: 'guides' as const, slug: guide.slug },
  })),
  { id: 'tools', pathname: ROUTE_PATHS.tools, route: { kind: 'tools' } },
  { id: 'price-performance', pathname: ROUTE_PATHS.pricePerformance, route: { kind: 'pricePerformance' } },
  { id: 'compare', pathname: ROUTE_PATHS.compareHub, route: { kind: 'compareHub' } },
  { id: 'models', pathname: ROUTE_PATHS.models, route: { kind: 'models' } },
  { id: 'model-lifecycle', pathname: ROUTE_PATHS.modelLifecycle, route: { kind: 'modelLifecycle' } },
  { id: 'newsletter-confirmed', pathname: ROUTE_PATHS.newsletterConfirmed, route: { kind: 'newsletterConfirmed' } },
  { id: 'welcome', pathname: ROUTE_PATHS.welcome, route: { kind: 'welcome' } },
  { id: 'privacy', pathname: ROUTE_PATHS.privacy, route: { kind: 'privacy' } },
  { id: 'leaderboards', pathname: ROUTE_PATHS.leaderboards, route: { kind: 'leaderboards' } },
  ...LEADERBOARD_CATEGORIES.map((category) => ({
    id: `leaderboard-category-${category}`,
    pathname: `${ROUTE_PATHS.leaderboards}${category}/`,
    route: { kind: 'leaderboardCategory' as const, category },
  })),
  { id: 'leaderboard-sla', pathname: ROUTE_PATHS.leaderboardSla, route: { kind: 'leaderboardSla' } },
  { id: 'leaderboard-custom', pathname: ROUTE_PATHS.leaderboardCustom, route: { kind: 'leaderboardCustom' } },
  { id: 'methodology-benchalign', pathname: ROUTE_PATHS.methodologyBenchAlign, route: { kind: 'methodologyBenchAlign' } },
];

/** Canonical V2.1 categories are static entries; exact non-equivalent source lenses remain support routes. */
const leaderboardFixedRoutes: readonly FixedRouteDefinition[] = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
  .filter((key) => legacyLeaderboardCategory(key) === null)
  .map((key) => ({
    id: `leaderboard-${key}`,
    pathname: LEADERBOARD_ROUTES[key].pathname,
    route: { kind: 'leaderboard' as const, key },
  }));

export const FIXED_ROUTES: readonly FixedRouteDefinition[] = [
  ...basicFixedRoutes,
  ...leaderboardFixedRoutes,
];

export const LEADERBOARD_NAVIGATION = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[]).map((key) => ({
  key,
  pathname: LEADERBOARD_ROUTES[key].pathname,
  label: LEADERBOARD_ROUTES[key].navigationLabel,
}));

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || ROUTE_PATHS.home;
  const withLeadingSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  const withoutDuplicateSlashes = withLeadingSlash.replace(/\/{2,}/g, '/');
  return withoutDuplicateSlashes === ROUTE_PATHS.home
    ? ROUTE_PATHS.home
    : `${withoutDuplicateSlashes.replace(/\/+$/, '')}/`;
}

export function pathnameForRoute(route: AppRoute): string | null {
  switch (route.kind) {
    case 'home': return ROUTE_PATHS.home;
    case 'cost': return ROUTE_PATHS.cost;
    case 'tools': return ROUTE_PATHS.tools;
    case 'calculator': return ROUTE_PATHS.calculator;
    case 'breakeven': return ROUTE_PATHS.breakeven;
    case 'pricePerformance': return ROUTE_PATHS.pricePerformance;
    case 'methodologyBenchAlign': return ROUTE_PATHS.methodologyBenchAlign;
    case 'guides': return route.slug ? guidePath(route.slug) : ROUTE_PATHS.guides;
    case 'articles': return ROUTE_PATHS.articles;
    case 'insights': return ROUTE_PATHS.insights;
    case 'compareHub': return ROUTE_PATHS.compareHub;
    case 'comparison': return `${ROUTE_PATHS.comparison}${encodeURIComponent(route.pair)}/`;
    case 'models': return ROUTE_PATHS.models;
    case 'modelLifecycle': return ROUTE_PATHS.modelLifecycle;
    case 'modelProfile': return `${ROUTE_PATHS.models}${encodeURIComponent(route.slug)}/`;
    case 'newsletterConfirmed': return ROUTE_PATHS.newsletterConfirmed;
    case 'welcome': return ROUTE_PATHS.welcome;
    case 'privacy': return ROUTE_PATHS.privacy;
    case 'leaderboards': return ROUTE_PATHS.leaderboards;
    case 'leaderboardCategory': return `${ROUTE_PATHS.leaderboards}${route.category}/`;
    case 'leaderboardSla': return ROUTE_PATHS.leaderboardSla;
    case 'leaderboardCustom': return ROUTE_PATHS.leaderboardCustom;
    case 'leaderboard': return LEADERBOARD_ROUTES[route.key].pathname;
    case 'insightDetail': return `${ROUTE_PATHS.insights}${encodeURIComponent(route.slug)}/`;
    case 'redirect': return route.to;
    case 'notFound': return null;
  }
}

export function matchRoute(pathname: string): AppRoute {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === ROUTE_PATHS.home) return { kind: 'home' };
  if (normalizedPathname === ROUTE_PATHS.cost) return { kind: 'cost' };
  if (normalizedPathname === ROUTE_PATHS.tools) return { kind: 'tools' };
  if (normalizedPathname === ROUTE_PATHS.calculator) return { kind: 'calculator' };
  if (normalizedPathname === ROUTE_PATHS.breakeven) return { kind: 'breakeven' };
  if (normalizedPathname === ROUTE_PATHS.pricePerformance) return { kind: 'pricePerformance' };
  if (normalizedPathname === ROUTE_PATHS.methodologyBenchAlign) return { kind: 'methodologyBenchAlign' };
  if (normalizedPathname === ROUTE_PATHS.guides) return { kind: 'guides' };
  if (normalizedPathname === ROUTE_PATHS.articles) return { kind: 'articles' };
  if (normalizedPathname === ROUTE_PATHS.insights) return { kind: 'insights' };
  if (normalizedPathname === ROUTE_PATHS.compareHub) return { kind: 'compareHub' };
  if (normalizedPathname === ROUTE_PATHS.models) return { kind: 'models' };
  if (normalizedPathname === ROUTE_PATHS.modelLifecycle) return { kind: 'modelLifecycle' };
  if (normalizedPathname === ROUTE_PATHS.newsletterConfirmed) return { kind: 'newsletterConfirmed' };
  if (normalizedPathname === ROUTE_PATHS.welcome) return { kind: 'welcome' };
  if (normalizedPathname === ROUTE_PATHS.privacy) return { kind: 'privacy' };
  if (normalizedPathname === ROUTE_PATHS.leaderboards) return { kind: 'leaderboards' };
  if (normalizedPathname === ROUTE_PATHS.leaderboardSla) return { kind: 'leaderboardSla' };
  if (normalizedPathname === ROUTE_PATHS.leaderboardCustom) return { kind: 'leaderboardCustom' };

  if (normalizedPathname === '/leaderboard/') return { kind: 'redirect', to: ROUTE_PATHS.leaderboards };
  if (normalizedPathname === '/calculator/' || normalizedPathname === '/tools/subscriptions-vs-apis/') return { kind: 'redirect', to: ROUTE_PATHS.calculator };
  if (normalizedPathname === '/guides/') return { kind: 'redirect', to: ROUTE_PATHS.guides };
  const legacyLeaderboardMatch = normalizedPathname.match(/^\/leaderboard\/(.+)\/$/);
  if (legacyLeaderboardMatch) {
    const canonicalPathname = `/leaderboards/${legacyLeaderboardMatch[1]}/`;
    const legacyKey = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
      .find((key) => LEADERBOARD_ROUTES[key].pathname === canonicalPathname);
    if (legacyKey) {
      const category = legacyLeaderboardCategory(legacyKey);
      return { kind: 'redirect', to: category ? pathnameForRoute({ kind: 'leaderboardCategory', category })! : canonicalPathname };
    }
  }

  const legacyGuideMatch = normalizedPathname.match(/^\/guides\/([^/]+)\/$/);
  if (legacyGuideMatch && GUIDE_BY_SLUG.has(legacyGuideMatch[1])) return { kind: 'redirect', to: guidePath(legacyGuideMatch[1]) };

  const guideMatch = normalizedPathname.match(/^\/articles\/guides\/([^/]+)\/$/);
  if (guideMatch && GUIDE_BY_SLUG.has(guideMatch[1])) return { kind: 'guides', slug: guideMatch[1] };

  const leaderboardKey = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
    .find((key) => LEADERBOARD_ROUTES[key].pathname === normalizedPathname);
  if (leaderboardKey) {
    const category = legacyLeaderboardCategory(leaderboardKey);
    return category
      ? { kind: 'redirect', to: pathnameForRoute({ kind: 'leaderboardCategory', category })! }
      : { kind: 'leaderboard', key: leaderboardKey };
  }

  const categoryMatch = normalizedPathname.match(/^\/leaderboards\/([^/]+)\/$/);
  if (categoryMatch && isLeaderboardCategory(categoryMatch[1])) return { kind: 'leaderboardCategory', category: categoryMatch[1] };

  const comparisonMatch = normalizedPathname.match(/^\/models\/compare\/([^/]+)\/$/);
  if (comparisonMatch) return { kind: 'comparison', pair: comparisonMatch[1] };

  const legacyComparisonMatch = normalizedPathname.match(/^\/compare\/([^/]+)\/$/);
  if (legacyComparisonMatch) return { kind: 'redirect', to: `${ROUTE_PATHS.comparison}${legacyComparisonMatch[1]}/` };

  const insightMatch = normalizedPathname.match(/^\/articles\/insights\/([^/]+)\/$/);
  if (insightMatch) {
    try { return { kind: 'insightDetail', slug: decodeURIComponent(insightMatch[1]) }; } catch { return { kind: 'notFound' }; }
  }

  const modelMatch = normalizedPathname.match(/^\/models\/([^/]+)\/$/);
  if (modelMatch) {
    try { return { kind: 'modelProfile', slug: decodeURIComponent(modelMatch[1]) }; } catch { return { kind: 'notFound' }; }
  }

  return { kind: 'notFound' };
}

function isLeaderboardCategory(value: string): value is LeaderboardCategory {
  return (LEADERBOARD_CATEGORIES as readonly string[]).includes(value);
}

function legacyLeaderboardCategory(key: LeaderboardKey): LeaderboardCategory | null {
  const categories: Partial<Record<LeaderboardKey, LeaderboardCategory>> = {
    'llm-overall': 'overall',
    'llm-coding': 'coding',
    'llm-agentic': 'agentic',
    'llm-reasoning': 'reasoning',
    'multimodal-vision-documents': 'multimodal',
  };
  return categories[key] ?? null;
}

function htmlFileForPathname(rootDir: string, pathname: string): string {
  const normalizedRoot = rootDir.replace(/[\\/]+$/, '');
  return `${normalizedRoot}${pathname}index.html`;
}

export function staticHtmlEntries(rootDir: string): Record<string, string> {
  return Object.fromEntries(FIXED_ROUTES.map(({ id, pathname }) => [id, htmlFileForPathname(rootDir, pathname)]));
}
