import { SITE_CONFIG } from '../brand/site-config';
import { GUIDE_BY_SLUG, GUIDES, guidePath } from '../guides/content';

export const ROUTE_PATHS = {
  home: '/',
  guides: '/guides/',
  tools: '/tools/',
  calculator: '/tools/subscriptions-vs-apis/',
  compareHub: '/compare/',
  leaderboards: '/leaderboards/',
  methodologyBenchAlign: '/methodology/benchalign/',
} as const;

export type SiteNavigationPage = 'home' | 'calculator' | 'compare' | 'leaderboards' | 'guides';

export const LEADERBOARD_ROUTES = {
  'llm-overall': {
    pathname: '/leaderboards/llm/overall/',
    navigationLabel: 'Overall benchmarks',
    seo: {
      title: `Overall AI Model Benchmarks | ${SITE_CONFIG.name}`,
      description: `Compare supported AI models by overall benchmark capability with clear source attribution, methodology context, and ${SITE_CONFIG.name}'s unavailable-data handling.`,
      h1: 'Overall benchmarks',
      summary: 'Review the supported overall-capability signal alongside its source, update time, and methodology before making a model decision.',
    },
  },
  'llm-coding': {
    pathname: '/leaderboards/llm/coding/',
    navigationLabel: 'Coding performance',
    seo: {
      title: `AI Coding Model Benchmarks | ${SITE_CONFIG.name}`,
      description: `Compare supported AI coding models with source-aware benchmark context, transparent methodology, and ${SITE_CONFIG.name}'s explicit treatment of missing measurements.`,
      h1: 'Coding benchmark',
      summary: 'Use coding benchmark evidence as one input to a workload-specific evaluation, not as a substitute for your repository and toolchain tests.',
    },
  },
  'llm-agentic': {
    pathname: '/leaderboards/llm/agentic/',
    navigationLabel: 'Agentic performance',
    seo: {
      title: `AI Agentic Model Benchmarks | ${SITE_CONFIG.name}`,
      description: `Explore supported agentic AI model benchmarks with source-level context, publication timestamps, and ${SITE_CONFIG.name}'s clear methodology for unavailable results.`,
      h1: 'Agentic performance',
      summary: 'Agentic performance depends on the tools, policies, and task environment; inspect the evidence before generalizing a benchmark result.',
    },
  },
  'llm-reasoning': {
    pathname: '/leaderboards/llm/reasoning/',
    navigationLabel: 'Reasoning',
    seo: {
      title: `AI Reasoning Category Evidence | ${SITE_CONFIG.name}`,
      description: `Review supported AI reasoning category evidence from BenchLM with source-level methodology, timestamps, and ${SITE_CONFIG.name}'s explicit unavailable-data handling. This category evidence lens is not a validated BenchAlign ranking.`,
      h1: 'Reasoning',
      summary: 'Reasoning is a BenchLM-published category evidence lens, not a validated BenchAlign ranking; inspect the exact source measurement before applying it to your workload.',
    },
  },
  'llm-knowledge': {
    pathname: '/leaderboards/llm/knowledge/',
    navigationLabel: 'Knowledge',
    seo: {
      title: `AI Knowledge Category Evidence | ${SITE_CONFIG.name}`,
      description: `Review supported AI knowledge category evidence from BenchLM with source-level methodology, timestamps, and ${SITE_CONFIG.name}'s explicit unavailable-data handling. This category evidence lens is not a validated BenchAlign ranking.`,
      h1: 'Knowledge',
      summary: 'Knowledge is a BenchLM-published category evidence lens, not a validated BenchAlign ranking. If BenchLM has not published the reviewed category metric, this view remains unavailable rather than inferring a result.',
    },
  },
  'llm-human-preference': {
    pathname: '/leaderboards/llm/human-preference/',
    navigationLabel: 'Human preference',
    seo: {
      title: `Human Preference AI Model Rankings | ${SITE_CONFIG.name}`,
      description: `Review human-preference AI model rankings with visible source context, methodology notes, and ${SITE_CONFIG.name}'s honest unavailable states for incomplete evidence.`,
      h1: 'Human preference',
      summary: 'Human-preference signals are useful for comparing perceived response quality, while task fit and safety requirements still need local evaluation.',
    },
  },
  'llm-value': {
    pathname: '/leaderboards/llm/value/',
    navigationLabel: 'Value frontier',
    seo: {
      title: `AI Model Value Frontier | ${SITE_CONFIG.name}`,
      description: `Explore the AI model value frontier using disclosed workload costs, supported benchmark evidence, and ${SITE_CONFIG.name}'s transparent Pareto methodology instead of an opaque score.`,
      h1: 'Value frontier',
      summary: 'Value views compare supported capability evidence with stated workload costs and never present an unsupported universal value score.',
    },
  },
  'llm-pricing-context': {
    pathname: '/leaderboards/llm/pricing-context/',
    navigationLabel: 'Pricing and context',
    seo: {
      title: `AI Model Pricing and Context | ${SITE_CONFIG.name}`,
      description: `Compare AI model pricing context and declared context windows with source attribution, route-level caveats, and ${SITE_CONFIG.name}'s explicit unavailable-data states.`,
      h1: 'Pricing and context',
      summary: 'Price and context information are route-specific; compare the exact provider route and declared limits relevant to your workload.',
    },
  },
  'multimodal-vision-documents': {
    pathname: '/leaderboards/multimodal/vision-documents/',
    navigationLabel: 'Vision and documents',
    seo: {
      title: `Vision and Document AI Benchmarks | ${SITE_CONFIG.name}`,
      description: `Compare supported vision and document AI benchmarks with source-aware methodology, timestamped evidence, and ${SITE_CONFIG.name}'s clear unavailable-result handling.`,
      h1: 'Multimodal',
      summary: 'Vision and document results should be checked against the image, document, language, and extraction conditions that match your use case.',
    },
  },
  'media-text-to-image': {
    pathname: '/leaderboards/media/text-to-image/',
    navigationLabel: 'Text to image',
    seo: {
      title: `Text-to-Image Model Rankings | ${SITE_CONFIG.name}`,
      description: `Explore text-to-image model rankings with source-level attribution, methodology context, and ${SITE_CONFIG.name}'s transparent handling for missing benchmark evidence.`,
      h1: 'Text to image',
      summary: 'Image-generation rankings describe a measured evaluation context and should be paired with prompt, licensing, and workflow review.',
    },
  },
  'media-image-editing': {
    pathname: '/leaderboards/media/image-editing/',
    navigationLabel: 'Image editing',
    seo: {
      title: `AI Image Editing Model Rankings | ${SITE_CONFIG.name}`,
      description: `Review AI image-editing model rankings with source attribution, transparent methodology, and ${SITE_CONFIG.name}'s explicit unavailable states for incomplete evidence.`,
      h1: 'Image editing',
      summary: 'Evaluate editing models against the transformations, source assets, rights, and fidelity requirements of the real production workflow.',
    },
  },
  'media-text-to-video': {
    pathname: '/leaderboards/media/text-to-video/',
    navigationLabel: 'Text to video',
    seo: {
      title: `Text-to-Video Model Rankings | ${SITE_CONFIG.name}`,
      description: `Compare text-to-video model rankings with visible source context, methodology notes, and ${SITE_CONFIG.name}'s transparent treatment of unavailable benchmark evidence.`,
      h1: 'Text to video',
      summary: 'Video-generation evidence should be considered alongside duration, controls, rights, and production workflow requirements.',
    },
  },
  'media-image-to-video': {
    pathname: '/leaderboards/media/image-to-video/',
    navigationLabel: 'Image to video',
    seo: {
      title: `Image-to-Video Model Rankings | ${SITE_CONFIG.name}`,
      description: `Explore image-to-video model rankings with source-level attribution, transparent methodology, and ${SITE_CONFIG.name}'s clear treatment of missing results.`,
      h1: 'Image to video',
      summary: 'Image-to-video rankings are only one signal; assess input fidelity, motion controls, rights, and output reliability for your workflow.',
    },
  },
  'media-video-editing': {
    pathname: '/leaderboards/media/video-editing/',
    navigationLabel: 'Video editing',
    seo: {
      title: `AI Video Editing Model Rankings | ${SITE_CONFIG.name}`,
      description: `Review AI video-editing model rankings with source attribution, methodology context, and ${SITE_CONFIG.name}'s transparent unavailable-data handling.`,
      h1: 'Video editing',
      summary: 'Use video-editing evidence to frame a hands-on workflow test that includes source media, edit controls, rights, and delivery constraints.',
    },
  },
} as const;

export type LeaderboardKey = keyof typeof LEADERBOARD_ROUTES;

export type AppRoute =
  | { kind: 'home' }
  | { kind: 'tools' }
  | { kind: 'calculator' }
  | { kind: 'methodologyBenchAlign' }
  | { kind: 'guides'; slug?: string }
  | { kind: 'compareHub' }
  | { kind: 'comparison'; pair: string }
  | { kind: 'leaderboards' }
  | { kind: 'leaderboard'; key: LeaderboardKey }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' };

export type FixedAppRoute = Exclude<AppRoute, { kind: 'comparison' } | { kind: 'redirect' } | { kind: 'notFound' }>;

export interface FixedRouteDefinition {
  readonly id: string;
  readonly pathname: string;
  readonly route: FixedAppRoute;
}

const basicFixedRoutes: readonly FixedRouteDefinition[] = [
  { id: 'home', pathname: ROUTE_PATHS.home, route: { kind: 'home' } },
  { id: 'guides', pathname: ROUTE_PATHS.guides, route: { kind: 'guides' } },
  ...GUIDES.map((guide) => ({
    id: `guide-${guide.slug}`,
    pathname: guidePath(guide.slug),
    route: { kind: 'guides' as const, slug: guide.slug },
  })),
  { id: 'tools', pathname: ROUTE_PATHS.tools, route: { kind: 'tools' } },
  { id: 'calculator', pathname: ROUTE_PATHS.calculator, route: { kind: 'calculator' } },
  { id: 'compare', pathname: ROUTE_PATHS.compareHub, route: { kind: 'compareHub' } },
  { id: 'leaderboards', pathname: ROUTE_PATHS.leaderboards, route: { kind: 'leaderboards' } },
  { id: 'methodology-benchalign', pathname: ROUTE_PATHS.methodologyBenchAlign, route: { kind: 'methodologyBenchAlign' } },
];

const leaderboardFixedRoutes: readonly FixedRouteDefinition[] = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[]).map((key) => ({
  id: `leaderboard-${key}`,
  pathname: LEADERBOARD_ROUTES[key].pathname,
  route: { kind: 'leaderboard', key },
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
    case 'tools': return ROUTE_PATHS.tools;
    case 'calculator': return ROUTE_PATHS.calculator;
    case 'methodologyBenchAlign': return ROUTE_PATHS.methodologyBenchAlign;
    case 'guides': return route.slug ? guidePath(route.slug) : ROUTE_PATHS.guides;
    case 'compareHub': return ROUTE_PATHS.compareHub;
    case 'comparison': return `${ROUTE_PATHS.compareHub}${route.pair}`;
    case 'leaderboards': return ROUTE_PATHS.leaderboards;
    case 'leaderboard': return LEADERBOARD_ROUTES[route.key].pathname;
    case 'redirect': return route.to;
    case 'notFound': return null;
  }
}

export function matchRoute(pathname: string): AppRoute {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === ROUTE_PATHS.home) return { kind: 'home' };
  if (normalizedPathname === ROUTE_PATHS.tools) return { kind: 'tools' };
  if (normalizedPathname === ROUTE_PATHS.calculator) return { kind: 'calculator' };
  if (normalizedPathname === ROUTE_PATHS.methodologyBenchAlign) return { kind: 'methodologyBenchAlign' };
  if (normalizedPathname === ROUTE_PATHS.guides) return { kind: 'guides' };
  if (normalizedPathname === ROUTE_PATHS.compareHub) return { kind: 'compareHub' };
  if (normalizedPathname === ROUTE_PATHS.leaderboards) return { kind: 'leaderboards' };

  if (normalizedPathname === '/leaderboard/') return { kind: 'redirect', to: ROUTE_PATHS.leaderboards };
  const legacyLeaderboardMatch = normalizedPathname.match(/^\/leaderboard\/(.+)\/$/);
  if (legacyLeaderboardMatch) {
    const canonicalPathname = `/leaderboards/${legacyLeaderboardMatch[1]}/`;
    const isPublishedLeaderboard = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
      .some((key) => LEADERBOARD_ROUTES[key].pathname === canonicalPathname);
    if (isPublishedLeaderboard) return { kind: 'redirect', to: canonicalPathname };
  }

  const guideMatch = normalizedPathname.match(/^\/guides\/([^/]+)\/$/);
  if (guideMatch && GUIDE_BY_SLUG.has(guideMatch[1])) return { kind: 'guides', slug: guideMatch[1] };

  const leaderboardKey = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
    .find((key) => LEADERBOARD_ROUTES[key].pathname === normalizedPathname);
  if (leaderboardKey) return { kind: 'leaderboard', key: leaderboardKey };

  const comparisonMatch = normalizedPathname.match(/^\/compare\/([^/]+)\/$/);
  if (comparisonMatch) return { kind: 'comparison', pair: comparisonMatch[1] };

  return { kind: 'notFound' };
}

function htmlFileForPathname(rootDir: string, pathname: string): string {
  const normalizedRoot = rootDir.replace(/[\\/]+$/, '');
  return `${normalizedRoot}${pathname}index.html`;
}

export function staticHtmlEntries(rootDir: string): Record<string, string> {
  return Object.fromEntries(FIXED_ROUTES.map(({ id, pathname }) => [id, htmlFileForPathname(rootDir, pathname)]));
}
