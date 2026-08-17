import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { NewsletterConfirmedPage } from '../pages/newsletter-confirmed-page';
import { PopularModelsPage } from '../pages/popular-models-page';
import { PageFrame } from '../frontend/page-frame';
import { matchRoute } from '../routing/routes';
import { matchPreviewRoute, matchPreviewRuntimeRoute, previewRoutes, previewRuntimeRoutes } from './route-manifest';
import type { PreviewClientRouteId, PreviewPayloadDefinition, PreviewRoute, PreviewRouteMatch, PreviewRuntimeRoute } from './route-types';

export type HydrationResult =
  | { readonly kind: 'hydrated'; readonly routeId: PreviewClientRouteId }
  | { readonly kind: 'mounted'; readonly routeId: PreviewClientRouteId }
  | { readonly kind: 'preserved-invalid-payload'; readonly routeId: PreviewClientRouteId }
  | { readonly kind: 'unmatched' };

type EmbeddedPayload =
  | { readonly kind: 'missing' }
  | { readonly kind: 'valid'; readonly data: unknown }
  | { readonly kind: 'invalid' };

function embeddedPayload(document: Document, definition: PreviewPayloadDefinition): EmbeddedPayload {
  const element = document.getElementById(definition.key);
  if (element === null) return { kind: 'missing' };
  if (!(element instanceof HTMLScriptElement)
    || element.type !== 'application/json'
    || !element.textContent) return { kind: 'invalid' };

  try {
    const parsed = definition.parse(JSON.parse(element.textContent));
    return parsed === null ? { kind: 'invalid' } : { kind: 'valid', data: parsed };
  } catch {
    return { kind: 'invalid' };
  }
}

function previewRouteElement(route: PreviewRoute, match: PreviewRouteMatch, data?: unknown) {
  const Page = route.Page;
  return <StrictMode>
    <PageFrame shell={route.shell}>
      <Page match={match} data={data} />
    </PageFrame>
  </StrictMode>;
}

function runtimeRouteElement(route: PreviewRuntimeRoute, data: unknown) {
  return <StrictMode>{route.render(data)}</StrictMode>;
}

function mountPopularModelsWorkbench(document: Document, routeId: PreviewRoute['id']): HydrationResult {
  const workbench = document.querySelector<HTMLElement>('[data-popular-models-workbench]');
  if (!workbench) return { kind: 'unmatched' };

  workbench.replaceChildren();
  createRoot(workbench).render(<StrictMode><PopularModelsPage /></StrictMode>);
  return { kind: 'mounted', routeId };
}

function startRuntimeRoute(document: Document, url: URL): HydrationResult | null {
  const match = matchPreviewRuntimeRoute(url);
  if (!match) return null;
  const route = previewRuntimeRoutes.find((candidate) => candidate.id === match.routeId);
  const root = document.getElementById('root');
  if (!route || !root) return { kind: 'unmatched' };

  const payload = embeddedPayload(document, route.payload);
  if (payload.kind === 'valid') {
    hydrateRoot(root, runtimeRouteElement(route, payload.data));
    return { kind: 'hydrated', routeId: route.id };
  }
  return payload.kind === 'invalid'
    ? { kind: 'preserved-invalid-payload', routeId: route.id }
    : { kind: 'unmatched' };
}

function startOutOfScopeRoute(document: Document, location: Location): void {
  const route = matchRoute(location.pathname);
  if (route.kind === 'redirect') {
    location.replace(route.to);
    return;
  }
  if (route.kind === 'newsletterConfirmed') {
    const root = document.getElementById('root');
    if (root) createRoot(root).render(<StrictMode><NewsletterConfirmedPage /></StrictMode>);
  }
}

/** Starts a manifest-owned browser route without replacing invalid SSR evidence. */
export function startPreviewRoute(document: Document, location: Location): HydrationResult {
  const url = new URL(location.href);
  const runtimeResult = startRuntimeRoute(document, url);
  if (runtimeResult) return runtimeResult;

  const match = matchPreviewRoute(url);
  if (!match) {
    startOutOfScopeRoute(document, location);
    return { kind: 'unmatched' };
  }

  const route = previewRoutes.find((candidate) => candidate.id === match.routeId);
  if (!route) return { kind: 'unmatched' };

  if (route.prototypeMount === 'popular-models-workbench') {
    if (route.payload && embeddedPayload(document, route.payload).kind === 'invalid') {
      return { kind: 'preserved-invalid-payload', routeId: route.id };
    }
    return mountPopularModelsWorkbench(document, route.id);
  }

  const root = document.getElementById('root');
  if (!root) return { kind: 'unmatched' };

  if (route.payload) {
    const payload = embeddedPayload(document, route.payload);
    if (payload.kind === 'valid') {
      hydrateRoot(root, previewRouteElement(route, match, payload.data));
      return { kind: 'hydrated', routeId: route.id };
    }
    if (payload.kind === 'invalid') return { kind: 'preserved-invalid-payload', routeId: route.id };
  }

  if (route.delivery !== 'react') return { kind: 'unmatched' };
  root.replaceChildren();
  createRoot(root).render(previewRouteElement(route, match));
  return { kind: 'mounted', routeId: route.id };
}
