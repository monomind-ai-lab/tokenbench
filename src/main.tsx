import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import GuidesApp from './GuidesApp.tsx';
import { matchRoute } from './routing/routes';
import './index.css';

const route = matchRoute(window.location.pathname);
const RootApp = route.kind === 'guides'
  ? GuidesApp
  : route.kind === 'home' || route.kind === 'calculator'
    ? App
    : null;

if (RootApp) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootApp />
    </StrictMode>,
  );
}
