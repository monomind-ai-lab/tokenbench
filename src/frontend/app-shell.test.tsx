import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act, createElement, StrictMode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { PricePerformanceRoute } from '../App';
import type { CatalogResponse, PlanOffer } from '../catalog/contracts';
import { AppShell, SiteHeader } from './app-shell';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
import { ROUTE_PATHS } from '../routing/routes';
import '../index.css';

function respondWithCatalog(catalog = FRONTEND_TEST_CATALOG) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), {
    status: 200,
    headers: { 'content-type': 'application/json', etag: `"${catalog.revision}"` },
  })));
}

function renderAt(pathname: string) {
  window.history.replaceState({}, '', pathname);
  return render(<App />);
}

const CALCULATOR_PATH = ROUTE_PATHS.calculator;
const selectedDirectOffer = FRONTEND_TEST_CATALOG.modelOffers[0];

interface CalculatorPathOptions {
  readonly providerId?: string;
  readonly planId?: string;
  readonly modelIds?: string;
  readonly weights?: string;
  readonly conversationsPerDay?: number;
  readonly messagesPerConversation?: number;
  readonly inputTokensPerMessage?: number;
  readonly outputTokensPerMessage?: number;
  readonly activeDaysPerMonth?: number;
}

function calculatorPath({
  providerId = 'provider-a',
  planId = 'provider-a:starter',
  modelIds = selectedDirectOffer.id,
  weights = '10000',
  conversationsPerDay = 10,
  messagesPerConversation = 8,
  inputTokensPerMessage = 750,
  outputTokensPerMessage = 250,
  activeDaysPerMonth = 25,
}: CalculatorPathOptions = {}) {
  const params = new URLSearchParams({
    v: '2',
    c: String(conversationsPerDay),
    m: String(messagesPerConversation),
    i: String(inputTokensPerMessage),
    o: String(outputTokensPerMessage),
    d: String(activeDaysPerMonth),
    models: modelIds,
    weights,
    provider: providerId,
    plan: planId,
  });
  return `${CALCULATOR_PATH}?${params}`;
}

function renderCalculator(catalog: CatalogResponse, pathname = calculatorPath()) {
  respondWithCatalog(catalog);
  return renderAt(pathname);
}

async function calculatorReadyHeading() {
  await screen.findByRole('heading', { name: 'API-equivalent monthly cost' }, { timeout: 5_000 });
  return screen.getByRole('heading', { name: 'Review the recommendation' });
}

async function calculatedResult() {
  await screen.findByRole('heading', { name: 'API-equivalent monthly cost' }, { timeout: 5_000 });
  return screen.getByRole('region', { name: 'Calculated plan value' });
}

function comparablePlan(overrides: Partial<PlanOffer> = {}): PlanOffer {
  return {
    ...FRONTEND_TEST_CATALOG.plans[1],
    id: 'provider-a:comparable',
    displayName: 'Comparable 10M',
    monthlyCostMicroDollars: 20_000_000,
    billingCycle: 'monthly',
    supportedModelIds: [selectedDirectOffer.modelId],
    entitlement: { kind: 'fixed_tokens', monthlyTokens: 10_000_000 },
    ...overrides,
  };
}

function nonIndividualPlan(kind: 'free' | 'team'): PlanOffer {
  return {
    ...comparablePlan(),
    id: `provider-a:${kind}`,
    displayName: kind === 'free' ? 'Free' : 'Team',
    monthlyCostMicroDollars: kind === 'free' ? 0 : 80_000_000,
  };
}

type IneligibleCalculatorFixture = 'rolling' | 'guardrail' | 'credits' | 'unsupported-mix' | 'no-plan';

function calculatorFixture(fixture: IneligibleCalculatorFixture): CatalogResponse {
  const plan = comparablePlan();
  switch (fixture) {
    case 'rolling':
      return { ...FRONTEND_TEST_CATALOG, plans: [{ ...plan, entitlement: { kind: 'rolling_limit', description: 'Rolling usage limit' } }] };
    case 'guardrail':
      return { ...FRONTEND_TEST_CATALOG, plans: [{ ...plan, entitlement: { kind: 'guardrail_limited', description: 'Guardrails vary by demand' } }] };
    case 'credits':
      return { ...FRONTEND_TEST_CATALOG, plans: [{ ...plan, entitlement: { kind: 'credits', description: 'Credits are not a fixed token allowance' } }] };
    case 'unsupported-mix':
      return { ...FRONTEND_TEST_CATALOG, plans: [{ ...plan, supportedModelIds: ['different-model'] }] };
    case 'no-plan':
      return FRONTEND_TEST_CATALOG;
  }
}

function twoProviderCatalog(): CatalogResponse {
  const providerBSource = {
    ...FRONTEND_TEST_CATALOG.provenance[0],
    id: 'provider-b-subscription',
    providerId: 'provider-b',
  };
  const providerBPlan = {
    ...comparablePlan(),
    id: 'provider-b:fixed',
    providerId: 'provider-b',
    displayName: 'Provider B Fixed',
    sourceId: providerBSource.id,
    supportedModelIds: ['beta'],
  };
  const providerBOffer = {
    ...selectedDirectOffer,
    id: 'provider-b:beta:direct_provider',
    providerId: 'provider-b',
    displayName: 'Beta Direct',
    modelId: 'beta',
    sourceId: providerBSource.id,
  };
  return {
    ...FRONTEND_TEST_CATALOG,
    provenance: [...FRONTEND_TEST_CATALOG.provenance, providerBSource],
    plans: [...FRONTEND_TEST_CATALOG.plans, providerBPlan],
    modelOffers: [...FRONTEND_TEST_CATALOG.modelOffers, providerBOffer],
  };
}

describe('responsive calculator app shell', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'light';
    window.history.replaceState({}, '', ROUTE_PATHS.calculator);
    respondWithCatalog();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('routes the clarified Home decision page through the global shell and preserves the footer signup', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Compare models' })[0]).toHaveAttribute('href', '/compare/');
    expect(screen.getByRole('link', { name: 'Open the calculator' })).toHaveAttribute('href', ROUTE_PATHS.calculator);
    expect(screen.getByRole('link', { name: 'Browse leaderboards' })).toHaveAttribute('href', '/leaderboards/');
    expect(screen.getByRole('region', { name: 'Market at a glance' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'TokenBench decision workflow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Provider selection/i })).not.toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('form', { name: 'Newsletter signup' })).toBeInTheDocument();
    expect(within(footer).getByRole('checkbox', { name: /Notify me when new models are added/i })).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Methodology' })).toHaveAttribute('href', '/methodology/benchalign/');
    expect(within(footer).getByRole('link', { name: 'Price vs performance' })).toHaveAttribute('href', '/llm-price-performance/');
    expect(within(footer).queryByRole('link', { name: 'Data sources' })).not.toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy/');
    expect(within(footer).queryByRole('link', { name: 'Sources' })).not.toBeInTheDocument();
    expect(footer).not.toHaveTextContent(/Catalog refresh/i);
    expect(footer).not.toHaveTextContent(/Updated /i);
    expect(footer).not.toHaveTextContent('Double opt-in required. Unsubscribe at any time.');
    expect(within(footer).getByText('Verify provider evidence before purchasing.')).toBeInTheDocument();
  });

  it('renders a useful six-link recovery page for an unknown route', () => {
    renderAt('/not-a-published-route/');

    expect(screen.getByRole('heading', { name: /Page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary recovery links' })).toBeInTheDocument();
  });

  it('keeps shared compare selections visible in a direct hydration entrypoint', () => {
    window.history.replaceState({}, '', '/llm-price-performance/?compare=alpha,beta');
    render(<PricePerformanceRoute />);

    expect(screen.getByRole('complementary', { name: 'Comparison tray' })).toHaveTextContent('alpha');
  });

  it.each([
    ['alpha,beta', 'alpha'],
    ['alpha,beta,gamma', 'gamma'],
  ] as const)('hydrates a direct entrypoint without a compare-tray markup mismatch for %s', async (ids, expectedId) => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const browserWindow = window;
    vi.stubGlobal('window', undefined);
    let serverMarkup = '';
    try {
      serverMarkup = renderToString(createElement(PricePerformanceRoute));
    } finally {
      vi.stubGlobal('window', browserWindow);
    }
    document.body.innerHTML = `<div id="root">${serverMarkup}</div>`;
    window.history.replaceState({}, '', `/llm-price-performance/?compare=${ids}`);
    const root = document.getElementById('root')!;
    const recoverableError = vi.fn();
    let hydrationRoot: Root | undefined;

    try {
      await act(async () => {
        hydrationRoot = hydrateRoot(root, createElement(StrictMode, null, createElement(PricePerformanceRoute)), { onRecoverableError: recoverableError });
      });

      expect(recoverableError).not.toHaveBeenCalled();
      expect(screen.getByRole('complementary', { name: 'Comparison tray' })).toHaveTextContent(expectedId);
    } finally {
      hydrationRoot?.unmount();
    }
  });

  it('makes the tools directory link to the subscription versus API calculator', () => {
    renderAt('/tools/');

    expect(screen.getByRole('heading', { name: 'AI cost decision tools', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open subscription vs. API calculator' })).toHaveAttribute('href', ROUTE_PATHS.calculator);
    expect(screen.queryByRole('group', { name: /Provider selection/i })).not.toBeInTheDocument();
  });

  it('keeps the calculator controls and results on their dedicated route', async () => {
    renderAt(ROUTE_PATHS.calculator);

    expect(screen.getByRole('heading', { name: 'Should you subscribe or pay as you go?', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /Provider selection/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Plan selection/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Conversations per day' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Messages per conversation' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Average input tokens per message' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Average output tokens per message' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Active days per month' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Calculated plan value/i })).toBeInTheDocument();
  });

  it('presents the calculator as four guided steps and a plain-language result', async () => {
    renderAt(calculatorPath());

    expect(screen.getByRole('heading', { name: 'Should you subscribe or pay as you go?', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Estimate the API-equivalent value of an AI subscription from conversations, messages, directional tokens, and active days that match your workload.')).toBeInTheDocument();
    expect(screen.getAllByText(/^Step [1-4]$/)).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Choose a provider and plan' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose the models you actually use' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Describe your message-level workload' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review the recommendation' })).toBeInTheDocument();
    const result = await calculatedResult();
    expect(screen.queryByRole('status', { name: 'Default API mapping' })).not.toBeInTheDocument();
    expect(screen.getByText('Advanced model mapping').closest('details')).toHaveAttribute('open');
    expect(result).toHaveTextContent('API is cheaper on a token-equivalent basis.');
    expect(result).toHaveTextContent('Not independently verified');
    expect(result).toHaveTextContent('Breakeven messages per day');
    expect(result).toHaveTextContent('Efficiency');
    expect(screen.getByRole('button', { name: 'Share result' })).toBeInTheDocument();
  });

  it.each<readonly [IneligibleCalculatorFixture]>([
    ['rolling'],
    ['guardrail'],
    ['credits'],
    ['unsupported-mix'],
    ['no-plan'],
  ])('does not call an ineligible %s subscription cheaper', async (fixture) => {
    const catalog = calculatorFixture(fixture);
    renderCalculator(catalog, calculatorPath({ planId: fixture === 'no-plan' ? '' : catalog.plans[0].id }));

    expect(await calculatedResult())
      .not.toHaveTextContent('Subscription is cheaper');
  });

  it('keeps savings and breakeven arithmetic available for a plan without verified capacity', async () => {
    const catalog = calculatorFixture('rolling');
    renderCalculator(catalog, calculatorPath({ planId: catalog.plans[0].id }));

    const result = await calculatedResult();
    expect(result).toHaveTextContent('API is cheaper on a token-equivalent basis.');
    expect(within(result).getByText('Monthly difference').parentElement).toHaveTextContent('$13.00');
    expect(within(result).getByText('Breakeven messages per day').parentElement).toHaveTextContent(/messages\/day/);
    expect(within(result).getByText('Efficiency').parentElement).toHaveTextContent('%');
    expect(within(result).getByText('Capacity evidence').parentElement).toHaveTextContent('Not independently verified');
  });

  it('renders projected entitlement derivation as a scenario without suppressing cost arithmetic', async () => {
    const plan = comparablePlan({
      entitlementEvidence: {
        status: 'projected',
        boundType: 'outer_ceiling',
        dimensions: [{ metric: 'model_calls', max: 720, unit: 'messages', window: 'monthly' }],
        projection: {
          formula: '5 x 144 = 720',
          assumptions: ['The five-hour window repeats for 30 days.'],
          caveats: ['A weekly cap may bind first.'],
        },
        source: { url: 'https://example.test/projected-plan', accessedAt: '2026-08-10T00:00:00.000Z', confidence: 'medium' },
      },
    });
    renderCalculator({ ...FRONTEND_TEST_CATALOG, plans: [plan] }, calculatorPath({ planId: plan.id }));

    const result = await calculatedResult();
    expect(result).toHaveTextContent('Projected outer ceiling');
    expect(result).toHaveTextContent('5 x 144 = 720');
    expect(result).toHaveTextContent('The five-hour window repeats for 30 days.');
    expect(result).toHaveTextContent('A weekly cap may bind first.');
    expect(result).toHaveTextContent('API is cheaper on a token-equivalent basis.');
    expect(within(result).getByRole('link', { name: 'Open entitlement source' })).toHaveAttribute('href', 'https://example.test/projected-plan');
    expect(within(result).getByText('Breakeven messages per day').parentElement).toHaveTextContent(/messages\/day/);
  });

  it('blocks stale entitlement evidence and renders the reason distinctly', async () => {
    const plan = comparablePlan({
      entitlementEvidence: {
        status: 'stale',
        boundType: 'hard_max',
        dimensions: [{ metric: 'credits', max: 10_000_000, unit: 'tokens', window: 'monthly' }],
        staleReason: 'The published plan price drifted from the stored value.',
        source: { url: 'https://example.test/stale-plan', accessedAt: '2026-08-10T00:00:00.000Z', confidence: 'low' },
      },
    });
    renderCalculator({ ...FRONTEND_TEST_CATALOG, plans: [plan] }, calculatorPath({ planId: plan.id }));

    const result = await calculatedResult();
    expect(result).toHaveTextContent('Stale evidence');
    expect(result).toHaveTextContent('The published plan price drifted from the stored value.');
    expect(result).toHaveTextContent('API is cheaper on a token-equivalent basis.');
    expect(within(result).getByText('Breakeven messages per day').parentElement).toHaveTextContent(/messages\/day/);
  });

  it.each<readonly [IneligibleCalculatorFixture | 'covered' | 'insufficient', string]>([
    ['covered', 'The published allowance covers this workload under the selected model limits.'],
    ['insufficient', 'The published allowance is below this workload.'],
    ['credits', 'The plan includes credits. The provider does not publish a stable token conversion, so TokenBench cannot verify token coverage.'],
    ['rolling', 'The provider publishes a rolling usage limit without a numeric monthly cap or reset schedule, so TokenBench cannot verify token coverage.'],
    ['guardrail', 'The provider advertises higher limits but does not publish a numeric cap or reset schedule.'],
    ['unsupported-mix', 'The plan does not publish access to one or more selected models.'],
  ])('names the published %s coverage condition instead of estimating capacity', async (fixture, expectedCopy) => {
    const catalog = fixture === 'covered'
      ? { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan()] }
      : fixture === 'insufficient'
        ? { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan({ entitlement: { kind: 'fixed_tokens', monthlyTokens: 1_000 } })] }
        : calculatorFixture(fixture);
    renderCalculator(catalog, calculatorPath({ planId: catalog.plans[0]?.id ?? '' }));

    const result = await calculatedResult();
    const coverage = within(result).getByRole('heading', { name: 'Capacity evidence' }).closest<HTMLElement>('section');
    if (!coverage) throw new Error('Expected a capacity evidence card');

    expect(coverage).toHaveTextContent(expectedCopy);
  });

  it.each<readonly [string, CatalogResponse, string]>([
    ['a lower fixed subscription', { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan({ monthlyCostMicroDollars: 5_000_000 })] }, 'Subscription is cheaper on a token-equivalent basis.'],
    ['an equal fixed subscription', { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan({ monthlyCostMicroDollars: 7_000_000 })] }, 'The token-equivalent costs are equal.'],
    ['a more expensive fixed subscription', { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan({ monthlyCostMicroDollars: 8_000_000 })] }, 'API is cheaper on a token-equivalent basis.'],
    ['an entitlement without published capacity', calculatorFixture('rolling'), 'API is cheaper on a token-equivalent basis.'],
  ])('uses eligibility and savings to explain %s', async (_name, catalog, expectedRecommendation) => {
    renderCalculator(catalog, calculatorPath({ planId: catalog.plans[0]?.id ?? '' }));

    expect(await calculatedResult())
      .toHaveTextContent(expectedRecommendation);
  });

  it('hydrates shared state once, preserves the URL, and lets the visitor change provider afterward', async () => {
    const pathname = calculatorPath({
      planId: 'provider-a:fixed',
      conversationsPerDay: 12,
      messagesPerConversation: 6,
      inputTokensPerMessage: 900,
      outputTokensPerMessage: 300,
      activeDaysPerMonth: 22,
    });
    renderCalculator(twoProviderCatalog(), pathname);

    await calculatedResult();
    expect(screen.getByRole('radio', { name: /Fixed 10M/i })).toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Conversations per day' })).toHaveValue(12);
    expect(screen.getByRole('spinbutton', { name: 'Messages per conversation' })).toHaveValue(6);
    expect(screen.getByRole('checkbox', { name: /Alpha Direct/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Alpha via OpenRouter/i })).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Provider B' }));

    await waitFor(() => expect(screen.getByRole('radio', { name: /Provider B Fixed/i })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Beta Direct/i })).toBeChecked();
    expect(`${window.location.pathname}${window.location.search}`).toBe(pathname);
  });

  it('does not silently select marketplace pricing when no direct provider API offer exists', async () => {
    const marketplaceOnlyCatalog = {
      ...FRONTEND_TEST_CATALOG,
      modelOffers: FRONTEND_TEST_CATALOG.modelOffers.filter((offer) => offer.pricingBasis !== 'direct_provider_api'),
    };
    renderCalculator(marketplaceOnlyCatalog, CALCULATOR_PATH);

    expect(await screen.findByText('Select a verified model')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Alpha via OpenRouter/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Alpha via OpenCode Zen/i })).not.toBeChecked();
    expect(screen.queryByText(/token-equivalent costs are equal/i)).not.toBeInTheDocument();
  });

  it('starts with a provider that has a deterministic direct API mapping when one is available', async () => {
    const catalog = twoProviderCatalog();
    const apiOnlySource = {
      ...catalog.provenance[0],
      id: 'deepseek-api',
      providerId: 'deepseek',
    };
    const apiOnlyOffer = {
      ...selectedDirectOffer,
      id: 'deepseek:flash:direct_provider',
      providerId: 'deepseek',
      displayName: 'DeepSeek Flash Direct',
      modelId: 'deepseek-flash',
      sourceId: apiOnlySource.id,
    };
    const marketplaceFirstCatalog = {
      ...catalog,
      provenance: [...catalog.provenance, apiOnlySource],
      modelOffers: [...catalog.modelOffers.filter((offer) => offer.id !== selectedDirectOffer.id), apiOnlyOffer],
    };
    renderCalculator(marketplaceFirstCatalog, CALCULATOR_PATH);

    const result = await calculatedResult();
    expect(screen.getByRole('radio', { name: 'Provider B' })).toBeChecked();
    expect(result).toHaveTextContent(/token-equivalent basis/i);
    expect(screen.getByRole('checkbox', { name: /Beta Direct/i })).toBeChecked();
  });

  it('canonicalizes recovered shared state once without selecting a replacement plan', async () => {
    const recoveryPath = `${CALCULATOR_PATH}?${new URLSearchParams({
      provider: 'provider-a',
      plan: 'removed-plan',
      c: '1',
      m: '1',
      i: '1000',
      o: '1000',
      d: '30',
      models: `${selectedDirectOffer.id},removed-model`,
      weights: '7000,3000',
      utm_source: 'test',
    })}`;
    renderCalculator(FRONTEND_TEST_CATALOG, recoveryPath);

    await calculatedResult();
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`)
      .toBe(calculatorPath({
        planId: '',
        conversationsPerDay: 1,
        messagesPerConversation: 1,
        inputTokensPerMessage: 1_000,
        outputTokensPerMessage: 1_000,
        activeDaysPerMonth: 30,
      })));
    expect(screen.getByRole('radio', { name: /Starter/i })).not.toBeChecked();
    expect(screen.getByRole('region', { name: 'Calculated plan value' })).toHaveTextContent('No plan selected');
  });

  it.each(['free', 'team'] as const)('canonicalizes a shared %s plan as no selected individual plan', async (kind) => {
    const excludedPlan = nonIndividualPlan(kind);
    const catalog = { ...FRONTEND_TEST_CATALOG, plans: [...FRONTEND_TEST_CATALOG.plans, excludedPlan] };
    renderCalculator(catalog, calculatorPath({ planId: excludedPlan.id }));

    const result = await calculatedResult();
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`)
      .toBe(calculatorPath({ planId: '' })));
    within(screen.getByRole('group', { name: /Plan selection/i })).getAllByRole('radio')
      .forEach((plan) => expect(plan).not.toBeChecked());
    expect(result).toHaveTextContent('No plan selected');
  });

  it('shares the hydrated state without replacing the current address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const pathname = calculatorPath({ planId: 'provider-a:fixed', conversationsPerDay: 15 });
    renderCalculator(FRONTEND_TEST_CATALOG, pathname);

    await calculatedResult();
    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${pathname}`);
    expect(`${window.location.pathname}${window.location.search}`).toBe(pathname);
  });

  it('focuses the calculated result from the persistent view-result action', async () => {
    renderCalculator(FRONTEND_TEST_CATALOG);

    const result = await calculatedResult();
    const viewResult = document.querySelector<HTMLButtonElement>('.view-result-action');
    if (!viewResult) throw new Error('Expected a persistent view-result action');
    fireEvent.click(viewResult);

    expect(result).toHaveFocus();
  });

  it('shows MonoMind guidance when monthly usage exceeds the agency threshold', async () => {
    renderAt(ROUTE_PATHS.calculator);

    await calculatorReadyHeading();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Conversations per day' }), { target: { value: '101' } });

    const guidance = await screen.findByRole('status', { name: 'High-volume optimization guidance' });
    expect(guidance).toHaveTextContent('At this volume, custom model routing, prompt caching, and agent pipelines may materially reduce spend.');
    expect(within(guidance).getByRole('link', { name: 'Talk to MonoMind' })).toHaveAttribute('href', 'https://monomind.one/');
  });

  it('renders derived metrics, evidence links, and separated pricing basis comparisons', async () => {
    render(<App />);

    expect(await calculatorReadyHeading()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Direct provider API', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenRouter API', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenCode Zen', level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /evidence/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Availability: available', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/· Availability: available/)).toBeInTheDocument();
  });

  it('renders the TokenBench shared chrome with its canonical navigation', async () => {
    render(<App />);

    await calculatorReadyHeading();
    expect(screen.getByRole('link', { name: 'TokenBench home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('img', { name: 'MonoMind monogram' })).toHaveAttribute('src', '/brand/monomind-tokenbench.png');
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-brand', 'plum');
    expect(screen.queryByText('The Decision Engine for AI Costs & Model Benchmarks')).not.toBeInTheDocument();
    expect(screen.getByText('Powered by MonoMind AI Lab')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveTextContent('HomeSubscribe vs APIPrice vs PerformanceModelsCompareLeaderboardsGuides');
  });

  it('renders the seven approved primary navigation destinations', () => {
    render(<SiteHeader theme="dark" language="en" activePage="home" onThemeToggle={vi.fn()} onLanguageChange={vi.fn()} />);

    expect(within(screen.getByRole('navigation', { name: 'Primary navigation' }))
      .getAllByRole('link').map((link) => link.textContent))
      .toEqual(['Home', 'Subscribe vs API', 'Price vs Performance', 'Models', 'Compare', 'Leaderboards', 'Guides']);
  });

  it('defaults a no-storage document to light and persists both TokenBench theme choices', async () => {
    render(<App />);

    await calculatorReadyHeading();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('tokenbench:theme')).toBeNull();
    expect(localStorage.getItem('tokenbench:theme:explicit')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('tokenbench:theme')).toBe('dark');
    expect(localStorage.getItem('tokenbench:theme:explicit')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('tokenbench:theme')).toBe('light');
    expect(localStorage.getItem('tokenbench:theme:explicit')).toBe('true');
  });

  it('opens and closes primary navigation with its accessible mobile menu control', () => {
    render(<SiteHeader theme="dark" language="en" activePage="calculator" onThemeToggle={vi.fn()} onLanguageChange={vi.fn()} />);

    const menu = document.querySelector<HTMLButtonElement>('.menu-button');
    if (!menu) throw new Error('Expected an accessible mobile navigation control');
    expect(menu).toHaveAttribute('data-min-target', '44');
    expect(menu).toHaveAttribute('aria-label', 'Open navigation');
    expect(menu).toHaveAttribute('aria-controls', 'primary-navigation');
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(screen.getByRole('navigation', { name: 'Primary navigation' }), { key: 'Escape' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the shell usable at the minimum supported viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    render(<SiteHeader theme="light" language="en" activePage="home" onThemeToggle={vi.fn()} onLanguageChange={vi.fn()} />);

    expect(document.querySelector('.header-inner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    const menu = document.querySelector<HTMLButtonElement>('.menu-button');
    expect(menu).toHaveAttribute('data-min-target', '44');
  });

  it('does not present API-only model owners as subscription plan providers', async () => {
    const apiOnlyOffer = {
      ...FRONTEND_TEST_CATALOG.modelOffers[1],
      id: 'provider-b:beta:openrouter',
      providerId: 'provider-b',
      displayName: 'Beta via OpenRouter',
      modelId: 'beta',
    };
    respondWithCatalog({
      ...FRONTEND_TEST_CATALOG,
      modelOffers: [...FRONTEND_TEST_CATALOG.modelOffers, apiOnlyOffer],
    });
    render(<App />);

    await calculatorReadyHeading();
    const providerGroup = screen.getByRole('group', { name: /Provider selection/i });
    expect(within(providerGroup).getByRole('radio', { name: 'Provider A' })).toBeInTheDocument();
    expect(within(providerGroup).queryByRole('radio', { name: 'Provider B' })).not.toBeInTheDocument();
  });

  it('limits plan selection to paid individual subscriptions', async () => {
    respondWithCatalog({
      ...FRONTEND_TEST_CATALOG,
      plans: [
        ...FRONTEND_TEST_CATALOG.plans,
        { ...FRONTEND_TEST_CATALOG.plans[0], id: 'provider-a:free', displayName: 'Free', monthlyCostMicroDollars: 0 },
        { ...FRONTEND_TEST_CATALOG.plans[0], id: 'provider-a:team', displayName: 'Team', monthlyCostMicroDollars: 90_000_000 },
      ],
    });
    render(<App />);

    await calculatorReadyHeading();
    const planGroup = screen.getByRole('group', { name: /Plan Selection/i });
    expect(within(planGroup).getByRole('radio', { name: /Starter/i })).toBeInTheDocument();
    expect(within(planGroup).queryByRole('radio', { name: /Free/i })).not.toBeInTheDocument();
    expect(within(planGroup).queryByRole('radio', { name: /Team/i })).not.toBeInTheDocument();
  });

  it('redistributes selected model usage through Advanced while keeping primary message inputs editable', async () => {
    render(<App />);
    await calculatorReadyHeading();

    const advanced = screen.getByText('Advanced model mapping');
    expect(advanced.closest('details')).toHaveAttribute('open');
    const modelGroup = screen.getByRole('group', { name: /Model selection/i });
    const checkboxes = within(modelGroup).getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    const usageMix = screen.getByRole('group', { name: /Model usage mix/i });
    expect(within(usageMix).getByLabelText(/Alpha Direct/)).toHaveAttribute('aria-valuenow', '50');
    const conversations = screen.getByRole('spinbutton', { name: 'Conversations per day' });
    fireEvent.change(conversations, { target: { value: '30' } });
    expect(conversations).toHaveValue(30);
    expect(screen.queryByRole('status', { name: 'Default API mapping' })).not.toBeInTheDocument();
  });

  it('keeps calculator state while switching language and returns to the dark theme', async () => {
    render(<App />);
    await calculatorReadyHeading();
    const usage = screen.getByRole('spinbutton', { name: 'Conversations per day' });
    fireEvent.change(usage, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /Toggle dark theme/i }));
    fireEvent.click(screen.getByRole('button', { name: /Toggle light theme/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /Language/i }), { target: { value: 'zh-TW' } });

    expect(usage).toHaveValue(42);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('tokenbench:theme')).toBe('light');
    expect(screen.getByRole('button', { name: /Toggle dark theme/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('combobox', { name: /Language/i })).toHaveValue('zh-TW');
  });

  it('shows actionable retry UI for a failed catalog request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/catalog/i);
    const retry = screen.getByRole('button', { name: /Retry loading catalog/i });
    respondWithCatalog();
    fireEvent.click(retry);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'API-equivalent monthly cost' })).toBeInTheDocument();
  });

  it('announces one recovery banner when the fallback notice duplicates the catalog error', () => {
    const unavailable = 'Catalog unavailable (network down). Showing only the checked-in verified bootstrap; retry to load the latest revision.';
    render(<AppShell
      activePage="calculator"
      catalogPhase="ready"
      error={unavailable}
      language="en"
      notice={unavailable}
      onLanguageChange={vi.fn()}
      onRetry={vi.fn()}
      onThemeToggle={vi.fn()}
      theme="dark"
    ><p>Calculator fallback</p></AppShell>);

    expect(screen.getByRole('alert')).toHaveTextContent(unavailable);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading catalog' })).toBeInTheDocument();
  });

  it('places the monthly cheatsheet form in the shared footer', () => {
    render(<AppShell
      activePage="calculator"
      language="en"
      onLanguageChange={vi.fn()}
      onThemeToggle={vi.fn()}
      theme="dark"
    ><p>Calculator content</p></AppShell>);

    const footer = document.querySelector('footer');
    if (!footer) throw new Error('Expected the shared site footer');
    expect(within(footer).getByRole('heading', { name: 'LLM API Cost & Benchmark Cheatsheet' })).toBeInTheDocument();
    expect(within(footer).getByRole('checkbox', { name: 'Notify me when new models are added to TokenBench.' })).not.toBeChecked();
    expect(within(footer).getByRole('form', { name: 'Newsletter signup' })).toBeInTheDocument();
  });

  it('renders comparison offers as compact cards at a 320px viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    render(<App />);
    await calculatorReadyHeading();
    expect(document.querySelector('[data-layout="compact"]')).toBeInTheDocument();
    expect(screen.getAllByTestId('offer-card').length).toBeGreaterThan(0);
  });

  it('hydrates compact clients from a wide SSR shell without leaving a layout mismatch behind', async () => {
    const shell = (children = createElement('p', null, 'Server comparison content')) => createElement(AppShell, {
      activePage: 'compare',
      children,
      language: 'en',
      onLanguageChange: vi.fn(),
      onThemeToggle: vi.fn(),
      theme: 'dark',
    });
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    const serverMarkup = renderToString(createElement(StrictMode, null, shell()));
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    const container = document.createElement('div');
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const recoverable = vi.fn();
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, createElement(StrictMode, null, shell()), { onRecoverableError: recoverable });
    });

    expect(serverMarkup).toContain('data-layout="wide"');
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-layout', 'compact');

    await act(async () => root?.unmount());
    container.remove();
  });

  it('gives every range control a minimum 44px touch target', async () => {
    render(<App />);
    await calculatorReadyHeading();
    const modelGroup = screen.getByRole('group', { name: /Model selection/i });
    const checkboxes = within(modelGroup).getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    const ranges = screen.getAllByRole('slider');
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((range) => window.getComputedStyle(range).minHeight === '44px')).toBe(true);
  });

  it('shows savings and separate full-width plan and API pricing panels with selected models highlighted', async () => {
    const selectedModelIds = FRONTEND_TEST_CATALOG.modelOffers.map((offer) => offer.id);
    renderCalculator(
      { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan()] },
      calculatorPath({ planId: 'provider-a:comparable', modelIds: selectedModelIds.join(','), weights: '3334,3333,3333' }),
    );
    const result = await calculatedResult();
    expect(within(result).getByRole('heading', { name: 'Capacity evidence' })).toBeInTheDocument();
    expect(result).toHaveTextContent(/token-equivalent basis/);
    expect(screen.queryByRole('heading', { name: /Cost-first recommendation/i })).not.toBeInTheDocument();

    const planHeading = screen.getByRole('heading', { name: /Individual Subscription Plans/i });
    const apiHeading = screen.getByRole('heading', { name: /^API Prices$/i });
    const planPanel = planHeading.closest('section');
    const apiPanel = apiHeading.closest('section');
    expect(planPanel).not.toBe(apiPanel);
    expect(apiPanel?.querySelectorAll('tr[data-selected="true"]')).toHaveLength(3);
    expect(apiPanel?.querySelectorAll('tr[data-selected="true"] .selected-badge')).toHaveLength(3);
  });
});
