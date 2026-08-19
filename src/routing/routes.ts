import { articlePath, GUIDE_BY_SLUG, GUIDES } from '../guides/content';
import { previewPaths } from '../preview/route-manifest';
import { LEADERBOARD_ROUTES, type LeaderboardKey } from './leaderboard-routes';

export { LEADERBOARD_ROUTES, type LeaderboardKey } from './leaderboard-routes';

export { previewPaths, previewPaths as PREVIEW_ROUTE_PATHS } from '../preview/route-manifest';

export const ROUTE_PATHS = {
  home: '/',
  articles: '/articles/',
  tools: '/tools/',
  calculator: '/subscribe-vs-api/',
  pricePerformance: '/llm-price-performance/',
  compareHub: '/compare/',
  models: '/models/',
  popularModels: '/popular-models/',
  leaderboards: '/leaderboards/',
  newsletterConfirmed: '/newsletter/confirmed/',
  welcome: '/welcome/',
} as const;

const LEGACY_GUIDES_PATH = '/guides/';

export function previewModelProfilePath(slug: string): string {
  return previewPaths.modelProfile(slug);
}

export type SiteNavigationPage = 'home' | 'calculator' | 'pricePerformance' | 'models' | 'popularModels' | 'compare' | 'leaderboards' | 'guides';


export type AppRoute =
  | { kind: 'home' }
  | { kind: 'tools' }
  | { kind: 'calculator' }
  | { kind: 'pricePerformance' }
  | { kind: 'methodologyBenchAlign' }
  | { kind: 'guides'; slug?: string }
  | { kind: 'compareHub' }
  | { kind: 'models' }
  | { kind: 'popularModels' }
  | { kind: 'comparison'; pair: string }
  | { kind: 'modelProfile'; slug: string }
  | { kind: 'newsletterConfirmed' }
  | { kind: 'welcome' }
  | { kind: 'privacy' }
  | { kind: 'leaderboards' }
  | { kind: 'leaderboard'; key: LeaderboardKey }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' };

export type FixedAppRoute = Exclude<AppRoute, { kind: 'comparison' } | { kind: 'modelProfile' } | { kind: 'redirect' } | { kind: 'notFound' }>;

export interface FixedRouteDefinition {
  readonly id: string;
  readonly pathname: string;
  readonly route: FixedAppRoute;
}

const basicFixedRoutes: readonly FixedRouteDefinition[] = [
  { id: 'home', pathname: ROUTE_PATHS.home, route: { kind: 'home' } },
  ...GUIDES.map((guide) => ({
    id: `guide-${guide.slug}`,
    pathname: articlePath(guide.slug),
    route: { kind: 'guides' as const, slug: guide.slug },
  })),
  { id: 'tools', pathname: ROUTE_PATHS.tools, route: { kind: 'tools' } },
  { id: 'price-performance', pathname: ROUTE_PATHS.pricePerformance, route: { kind: 'pricePerformance' } },
  { id: 'compare', pathname: ROUTE_PATHS.compareHub, route: { kind: 'compareHub' } },
  { id: 'models', pathname: ROUTE_PATHS.models, route: { kind: 'models' } },
  { id: 'popular-models', pathname: ROUTE_PATHS.popularModels, route: { kind: 'popularModels' } },
  { id: 'newsletter-confirmed', pathname: ROUTE_PATHS.newsletterConfirmed, route: { kind: 'newsletterConfirmed' } },
  { id: 'welcome', pathname: ROUTE_PATHS.welcome, route: { kind: 'welcome' } },
  { id: 'leaderboards', pathname: ROUTE_PATHS.leaderboards, route: { kind: 'leaderboards' } },
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
    case 'pricePerformance': return ROUTE_PATHS.pricePerformance;
    case 'methodologyBenchAlign': return null;
    case 'guides': return route.slug ? articlePath(route.slug) : ROUTE_PATHS.articles;
    case 'compareHub': return ROUTE_PATHS.compareHub;
    case 'models': return ROUTE_PATHS.models;
    case 'popularModels': return ROUTE_PATHS.popularModels;
    case 'comparison': return `${ROUTE_PATHS.compareHub}${route.pair}`;
    case 'modelProfile': return `${ROUTE_PATHS.models}${encodeURIComponent(route.slug)}/`;
    case 'newsletterConfirmed': return ROUTE_PATHS.newsletterConfirmed;
    case 'welcome': return ROUTE_PATHS.welcome;
    case 'privacy': return null;
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
  if (normalizedPathname === ROUTE_PATHS.pricePerformance) return { kind: 'pricePerformance' };
  if (normalizedPathname === LEGACY_GUIDES_PATH) return { kind: 'redirect', to: ROUTE_PATHS.articles };
  if (normalizedPathname === ROUTE_PATHS.compareHub) return { kind: 'compareHub' };
  if (normalizedPathname === ROUTE_PATHS.models) return { kind: 'models' };
  if (normalizedPathname === ROUTE_PATHS.popularModels) return { kind: 'popularModels' };
  if (normalizedPathname === ROUTE_PATHS.newsletterConfirmed) return { kind: 'newsletterConfirmed' };
  if (normalizedPathname === ROUTE_PATHS.welcome) return { kind: 'welcome' };
  if (normalizedPathname === ROUTE_PATHS.leaderboards) return { kind: 'leaderboards' };

  if (normalizedPathname === '/leaderboard/') return { kind: 'redirect', to: ROUTE_PATHS.leaderboards };
  const legacyLeaderboardMatch = normalizedPathname.match(/^\/leaderboard\/(.+)\/$/);
  if (legacyLeaderboardMatch) {
    const canonicalPathname = `/leaderboards/${legacyLeaderboardMatch[1]}/`;
    const isPublishedLeaderboard = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
      .some((key) => LEADERBOARD_ROUTES[key].pathname === canonicalPathname);
    if (isPublishedLeaderboard) return { kind: 'redirect', to: canonicalPathname };
  }

  const articleMatch = normalizedPathname.match(/^\/articles\/([^/]+)\/$/);
  if (articleMatch && GUIDE_BY_SLUG.has(articleMatch[1])) return { kind: 'guides', slug: articleMatch[1] };

  const guideMatch = normalizedPathname.match(/^\/guides\/([^/]+)\/$/);
  if (guideMatch && GUIDE_BY_SLUG.has(guideMatch[1])) return { kind: 'redirect', to: articlePath(guideMatch[1]) };

  const leaderboardKey = (Object.keys(LEADERBOARD_ROUTES) as LeaderboardKey[])
    .find((key) => LEADERBOARD_ROUTES[key].pathname === normalizedPathname);
  if (leaderboardKey) return { kind: 'leaderboard', key: leaderboardKey };

  const comparisonMatch = normalizedPathname.match(/^\/compare\/([^/]+)\/$/);
  if (comparisonMatch) return { kind: 'comparison', pair: comparisonMatch[1] };

  const modelMatch = normalizedPathname.match(/^\/models\/([^/]+)\/$/);
  if (modelMatch) {
    try { return { kind: 'modelProfile', slug: decodeURIComponent(modelMatch[1]) }; } catch { return { kind: 'notFound' }; }
  }

  return { kind: 'notFound' };
}

function htmlFileForPathname(rootDir: string, pathname: string): string {
  const normalizedRoot = rootDir.replace(/[\\/]+$/, '');
  return `${normalizedRoot}${pathname}index.html`;
}

export function staticHtmlEntries(rootDir: string): Record<string, string> {
  return Object.fromEntries(FIXED_ROUTES.map(({ id, pathname }) => [id, htmlFileForPathname(rootDir, pathname)]));
}
