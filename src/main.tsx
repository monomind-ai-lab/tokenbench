import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import GuidesApp from './GuidesApp.tsx';
import { matchRoute } from './routing/routes';
import './index.css';

const route = matchRoute(window.location.pathname);
const RootApp = route.kind === 'guides'
  ? GuidesApp
  : route.kind === 'home' || route.kind === 'tools' || route.kind === 'calculator' || route.kind === 'leaderboards' || route.kind === 'leaderboard'
    ? App
    : null;

if (RootApp) {
  const root = document.getElementById('root')!;
  // Leaderboard static shells remain for no-JavaScript crawlers. Once their
  // interactive route mounts, clear that fallback so it cannot duplicate UI.
  if (route.kind === 'leaderboards' || route.kind === 'leaderboard') root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <RootApp />
    </StrictMode>,
  );
}
