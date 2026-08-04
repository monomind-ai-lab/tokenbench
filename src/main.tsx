import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import GuidesApp from './GuidesApp.tsx';
import './index.css';

const RootApp = window.location.pathname.startsWith('/guides') ? GuidesApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
