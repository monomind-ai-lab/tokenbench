import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import App, { ComparisonDetailApp, ModelProfileApp, PricePerformanceRoute, type CostInitialState } from './App.tsx';
import GuidesApp from './GuidesApp.tsx';
import { parseComparisonViewModel } from './frontend/comparison-contracts';
import { parseModelProfileViewModel } from './frontend/model-profile-contracts';
import { parseModelDirectoryEnvelope } from './frontend/model-directory-contracts';
import { parsePricePerformanceEnvelope } from './benchmarks/price-performance-contracts';
import { NewsletterConfirmedPage } from './pages/newsletter-confirmed-page';
import { ModelsApp } from './pages/models-page';
import { ModelLifecycleApp } from './pages/model-lifecycle-page';
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

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finite(value: unknown, minimum: number, maximum: number, integer = false): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isInteger(value)) ? value : null;
}

function initialCostState(kind: 'calculator' | 'breakeven'): CostInitialState | null {
  const id = kind === 'calculator' ? 'cost-calculator-initial-data' : 'cost-breakeven-initial-data';
  const payload = document.getElementById(id);
  if (!(payload instanceof HTMLScriptElement) || payload.type !== 'application/json' || !payload.textContent) return null;
  try {
    const value = record(JSON.parse(payload.textContent));
    if (!value) return null;
    if (kind === 'calculator') {
      const query = record(value.query);
      const workload = record(query?.workload);
      const conversationsPerDay = finite(workload?.conversationsPerDay, 0, 10_000, true);
      const messagesPerConversation = finite(workload?.messagesPerConversation, 0, 1_000, true);
      const inputTokensPerMessage = finite(workload?.inputTokensPerMessage, 0, 1_000_000, true);
      const outputTokensPerMessage = finite(workload?.outputTokensPerMessage, 0, 1_000_000, true);
      const activeDaysPerMonth = finite(workload?.activeDaysPerMonth, 0, 31, true);
      const providerId = query?.providerId;
      const planId = query?.planId;
      const modelIds = query?.modelIds;
      const validProviderId = providerId === null || typeof providerId === 'string';
      const validPlanId = planId === null || typeof planId === 'string';
      if ([conversationsPerDay, messagesPerConversation, inputTokensPerMessage, outputTokensPerMessage, activeDaysPerMonth].some((item) => item === null)
        || !validProviderId || !validPlanId
        || !Array.isArray(modelIds) || modelIds.length > 3 || !modelIds.every((modelId) => typeof modelId === 'string' && /^[A-Za-z0-9:_-]{1,160}$/u.test(modelId))) return null;
      return {
        mode: 'calculator',
        calculator: {
          workload: { conversationsPerDay, messagesPerConversation, inputTokensPerMessage, outputTokensPerMessage, activeDaysPerMonth },
          providerId: providerId as string | null,
          planId: planId as string | null,
          modelIds,
        },
      };
    }
    const seats = finite(value.seats, 1, 50, true);
    const feePerSeat = finite(value.feePerSeat, 0, 100_000);
    const maxTokensMillions = finite(value.maxTokensMillions, 0, 300);
    const inputShare = finite(value.inputShare, 0, 1);
    const inputPricePerMillion = value.inputPricePerMillion === null ? null : finite(value.inputPricePerMillion, 0, 100_000);
    const outputPricePerMillion = value.outputPricePerMillion === null ? null : finite(value.outputPricePerMillion, 0, 100_000);
    const capacityTokens = value.capacityTokens === null ? null : finite(value.capacityTokens, 0, Number.MAX_SAFE_INTEGER, true);
    if (seats === null || feePerSeat === null || maxTokensMillions === null || inputShare === null
      || inputPricePerMillion === null && value.inputPricePerMillion !== null
      || outputPricePerMillion === null && value.outputPricePerMillion !== null
      || capacityTokens === null && value.capacityTokens !== null) return null;
    return {
      mode: 'breakeven',
      breakeven: { seats, feePerSeat, maxTokensMillions, inputShare, inputPricePerMillion, outputPricePerMillion, capacityTokens },
    };
  } catch {
    return null;
  }
}

const route = matchRoute(window.location.pathname);
const RootApp = route.kind === 'articles' || route.kind === 'guides' || route.kind === 'insights' || route.kind === 'insightDetail'
  || (route.kind === 'notFound' && window.location.pathname.startsWith('/articles/'))
  ? GuidesApp
  : route.kind === 'newsletterConfirmed' || route.kind === 'privacy' || route.kind === 'welcome'
    ? null
    : App;

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
} else if (route.kind === 'modelLifecycle') {
  const root = document.getElementById('root')!;
  root.replaceChildren();
  createRoot(root).render(<StrictMode><ModelLifecycleApp /></StrictMode>);
} else if (route.kind === 'comparison') {
  const viewModel = initialComparisonViewModel();
  const root = document.getElementById('root')!;
  // A malformed payload must never erase the crawlable server response or
  // prompt a replacement request; the browser can simply leave it intact.
  if (viewModel) {
    hydrateRoot(root,
      <StrictMode>
        <ComparisonDetailApp viewModel={viewModel} />
      </StrictMode>,
    );
  } else if (!document.getElementById('comparison-initial-data')) {
    root.replaceChildren();
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
} else if (route.kind === 'calculator' || route.kind === 'breakeven') {
  const root = document.getElementById('root')!;
  const initial = initialCostState(route.kind);
  const payloadId = route.kind === 'calculator' ? 'cost-calculator-initial-data' : 'cost-breakeven-initial-data';
  // Cost SSR deliberately uses a client replacement rather than hydration: its
  // static form and the interactive calculator have different control trees.
  // The validated bounded scenario is transferred before the replacement so a
  // submitted GET result is never covered by client defaults.
  if (initial) {
    root.replaceChildren();
    createRoot(root).render(<StrictMode><App initialCostState={initial} /></StrictMode>);
  } else if (!document.getElementById(payloadId)) {
    root.replaceChildren();
    createRoot(root).render(<StrictMode><App /></StrictMode>);
  }
} else if (RootApp) {
  const root = document.getElementById('root')!;
  if (route.kind === 'articles' || route.kind === 'guides' || route.kind === 'insights' || route.kind === 'insightDetail'
    || route.kind === 'notFound' && window.location.pathname.startsWith('/articles/')) {
    // Editorial static markup is a complete no-JS fallback, but its shell and
    // landmark ids intentionally differ from the interactive application.
    // Replace it rather than triggering a hydration mismatch and client retry.
    root.replaceChildren();
    createRoot(root).render(<StrictMode><RootApp /></StrictMode>);
  } else {
  // These static shells remain for no-JavaScript crawlers. Once their
  // interactive route mounts, clear the fallback so it cannot duplicate UI.
  if (route.kind === 'compareHub' || route.kind === 'leaderboards' || route.kind === 'leaderboard'
    || route.kind === 'leaderboardCategory' || route.kind === 'leaderboardSla' || route.kind === 'leaderboardCustom') root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <RootApp />
    </StrictMode>,
  );
  }
} else if (route.kind === 'newsletterConfirmed') {
  // The transactional confirmation page mounts directly without AppShell so
  // no navigation or footer actions are ever exposed here.
  const root = document.getElementById('root')!;
  createRoot(root).render(
    <StrictMode>
      <NewsletterConfirmedPage />
    </StrictMode>,
  );
}
