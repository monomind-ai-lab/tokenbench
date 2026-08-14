import { ROUTE_PATHS } from '../routing/routes';

const RECOVERY_LINKS = [
  { label: 'Home', href: ROUTE_PATHS.home },
  { label: 'Models', href: ROUTE_PATHS.models },
  { label: 'Leaderboards', href: ROUTE_PATHS.leaderboards },
  { label: 'Compare', href: ROUTE_PATHS.compareHub },
  { label: 'Subscribe vs API', href: ROUTE_PATHS.cost },
  { label: 'Articles', href: ROUTE_PATHS.articles },
] as const;

export function NotFoundPage({ attemptedPath }: { readonly attemptedPath?: string }) {
  return <section className="content-stack static-page-content not-found-page" aria-labelledby="not-found-heading">
    <header><p className="eyebrow">404</p><h1 id="not-found-heading">Page not found</h1><p>The route may have moved, or it may not be a published TokenBench decision page.</p>{attemptedPath ? <p>Requested identity: <code>{attemptedPath}</code></p> : null}</header>
    <nav className="static-page-links" aria-label="Primary recovery links">
      {RECOVERY_LINKS.map((link) => <a className="button button-secondary" href={link.href} key={link.href}>{link.label}</a>)}
    </nav>
  </section>;
}
