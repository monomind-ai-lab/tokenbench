import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import App, { ComparisonDetailApp } from './App.tsx';
import GuidesApp from './GuidesApp.tsx';
import { parseComparisonViewModel } from './frontend/comparison-contracts';
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

const route = matchRoute(window.location.pathname);
const RootApp = route.kind === 'guides'
  ? GuidesApp
  : route.kind === 'home' || route.kind === 'tools' || route.kind === 'calculator' || route.kind === 'methodologyBenchAlign' || route.kind === 'compareHub' || route.kind === 'leaderboards' || route.kind === 'leaderboard'
    ? App
    : null;

if (route.kind === 'comparison') {
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
  if (route.kind === 'compareHub' || route.kind === 'leaderboards' || route.kind === 'leaderboard') root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <RootApp />
    </StrictMode>,
  );
} else if (route.kind === 'redirect') {
  window.location.replace(route.to);
}
