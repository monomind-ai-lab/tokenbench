import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import App, { ComparisonDetailApp, ModelProfileApp, PricePerformanceRoute } from './App.tsx';
import GuidesApp from './GuidesApp.tsx';
import { parseComparisonViewModel } from './frontend/comparison-contracts';
import { parseModelProfileViewModel } from './frontend/model-profile-contracts';
import { parseModelDirectoryEnvelope } from './frontend/model-directory-contracts';
import { parsePricePerformanceEnvelope } from './benchmarks/price-performance-contracts';
import { NewsletterConfirmedPage } from './pages/newsletter-confirmed-page';
import { ModelsApp } from './pages/models-page';
import { matchRoute } from './routing/routes';
import './index.css';

function initialComparisonViewModel() {
  const payload = document.getElementById('comparison-initial-data');
  if (!(payload instanceof HTMLScriptElement) || payload.type !== 'application/json' || !payload.textContent) return null;
  try {
    return parseComparisonViewModel(JSON.parse(payload.textContent));
  } catch {
    return null;
  }
}
function initialModelDirectoryEnvelope() {
  const payload = document.getElementById('models-initial-data');
  if (!(payload instanceof HTMLScriptElement) || payload.type !== 'application/json' || !payload.textContent) return null;
  try {
    return parseModelDirectoryEnvelope(JSON.parse(payload.textContent));
  } catch {
    return null;
  }
}

function initialPricePerformanceEnvelope() {
  const payload = document.getElementById('price-performance-initial-data');
  if (!(payload instanceof HTMLScriptElement) || payload.type !== 'application/json' || !payload.textContent) return null;
  try {
    return parsePricePerformanceEnvelope(JSON.parse(payload.textContent));
  } catch {
    return null;
  }
}


function initialModelProfileViewModel() {
  const payload = document.getElementById('model-profile-initial-data');
  if (!(payload instanceof HTMLScriptElement) || payload.type !== 'application/json' || !payload.textContent) return null;
  try { return parseModelProfileViewModel(JSON.parse(payload.textContent)); } catch { return null; }
}

const route = matchRoute(window.location.pathname);
const RootApp = route.kind === 'guides'
  ? GuidesApp
  : route.kind === 'home' || route.kind === 'tools' || route.kind === 'calculator' || route.kind === 'methodologyBenchAlign' || route.kind === 'compareHub' || route.kind === 'leaderboards' || route.kind === 'leaderboard' || route.kind === 'popularModels'
    ? App
    : null;

if (route.kind === 'modelProfile') {
  const viewModel = initialModelProfileViewModel();
  if (viewModel) {
    const root = document.getElementById('root')!;
    hydrateRoot(root, <StrictMode><ModelProfileApp viewModel={viewModel} /></StrictMode>);
  }
} else if (route.kind === 'pricePerformance') {
  const envelope = initialPricePerformanceEnvelope();
  const root = document.getElementById('root')!;
  if (envelope) {
    hydrateRoot(root, <StrictMode><PricePerformanceRoute initialEnvelope={envelope} /></StrictMode>);
  } else if (!document.getElementById('price-performance-initial-data')) {
    // A Vite/static shell has no embedded payload and may mount client-side.
    // A malformed SSR payload is left untouched so server evidence is never erased.
    root.replaceChildren();
    createRoot(root).render(<StrictMode><PricePerformanceRoute /></StrictMode>);
  }
} else if (route.kind === 'models') {
  const envelope = initialModelDirectoryEnvelope();
  // Keep substantive server HTML when the payload fails validation.
  if (envelope) {
    const root = document.getElementById('root')!;
    hydrateRoot(root,
      <StrictMode>
        <ModelsApp initialEnvelope={envelope} />
      </StrictMode>,
    );
  }
} else if (route.kind === 'comparison') {
  const viewModel = initialComparisonViewModel();
  // A malformed payload must never erase the crawlable server response or
  // prompt a replacement request; the browser can simply leave it intact.
  if (viewModel) {
    const root = document.getElementById('root')!;
    hydrateRoot(root,
      <StrictMode>
        <ComparisonDetailApp viewModel={viewModel} />
      </StrictMode>,
    );
  }
} else if (RootApp) {
  const root = document.getElementById('root')!;
  // These static shells remain for no-JavaScript crawlers. Once their
  // interactive route mounts, clear the fallback so it cannot duplicate UI.
  if (route.kind === 'compareHub' || route.kind === 'leaderboards' || route.kind === 'leaderboard' || route.kind === 'popularModels') root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <RootApp />
    </StrictMode>,
  );
} else if (route.kind === 'newsletterConfirmed') {
  // The transactional confirmation page mounts directly without AppShell so
  // no navigation or footer actions are ever exposed here.
  const root = document.getElementById('root')!;
  createRoot(root).render(
    <StrictMode>
      <NewsletterConfirmedPage />
    </StrictMode>,
  );
} else if (route.kind === 'redirect') {
  window.location.replace(route.to);
}
