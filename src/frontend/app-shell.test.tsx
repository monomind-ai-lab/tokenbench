import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act, createElement, StrictMode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { CatalogResponse, PlanOffer } from '../catalog/contracts';
import { AppShell, SiteHeader } from './app-shell';
import { FRONTEND_TEST_CATALOG } from './test-fixtures';
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

const CALCULATOR_PATH = '/tools/subscriptions-vs-apis/';
const selectedDirectOffer = FRONTEND_TEST_CATALOG.modelOffers[0];

interface CalculatorPathOptions {
  readonly providerId?: string;
  readonly planId?: string;
  readonly modelIds?: string;
  readonly weights?: string;
  readonly inputShareBasisPoints?: number;
  readonly monthlyTokens?: number;
}

function calculatorPath({
  providerId = 'provider-a',
  planId = 'provider-a:starter',
  modelIds = selectedDirectOffer.id,
  weights = '10000',
  inputShareBasisPoints = 5_000,
  monthlyTokens = 10_000_000,
}: CalculatorPathOptions = {}) {
  const params = new URLSearchParams({
    provider: providerId,
    plan: planId,
    models: modelIds,
    weights,
    input: String(inputShareBasisPoints),
    tokens: String(monthlyTokens),
  });
  return `${CALCULATOR_PATH}?${params}`;
}

function renderCalculator(catalog: CatalogResponse, pathname = calculatorPath()) {
  respondWithCatalog(catalog);
  return renderAt(pathname);
}

async function calculatedResult() {
  await screen.findByRole('heading', { name: /What does API usage cost?/i });
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
    window.history.replaceState({}, '', '/tools/subscriptions-vs-apis/');
    respondWithCatalog();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('routes the clarified Home decision page through the global shell and preserves the footer signup', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Compare models' })[0]).toHaveAttribute('href', '/compare/');
    expect(screen.getByRole('link', { name: 'Open the calculator' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
    expect(screen.getByRole('link', { name: 'Browse leaderboards' })).toHaveAttribute('href', '/leaderboards/');
    expect(screen.getByRole('region', { name: 'Live decision snapshot' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'TokenBench decision workflow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Provider selection/i })).not.toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('form', { name: 'Newsletter signup' })).toBeInTheDocument();
    expect(within(footer).getByRole('checkbox', { name: /Notify me when new models or price drops/i })).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Methodology' })).toHaveAttribute('href', '/methodology/benchalign/');
    expect(within(footer).queryByRole('link', { name: 'Sources' })).not.toBeInTheDocument();
  });

  it('makes the tools directory link to the subscription versus API calculator', () => {
    renderAt('/tools/');

    expect(screen.getByRole('heading', { name: 'AI cost decision tools', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open subscription vs. API calculator' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
    expect(screen.queryByRole('group', { name: /Provider selection/i })).not.toBeInTheDocument();
  });

  it('keeps the calculator controls and results on their dedicated route', async () => {
    renderAt('/tools/subscriptions-vs-apis/');

    expect(screen.getByRole('heading', { name: 'Should you subscribe or pay as you go?', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /Provider selection/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Plan selection/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Model selection/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Expected monthly usage/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Calculated plan value/i })).toBeInTheDocument();
  });

  it('presents the calculator as four guided steps and a plain-language result', async () => {
    renderAt(calculatorPath());

    expect(screen.getByRole('heading', { name: 'Should you subscribe or pay as you go?', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Estimate the API-equivalent value of an AI subscription using the models, token volume, and input/output mix that match your workload.')).toBeInTheDocument();
    expect(screen.getAllByText(/^Step [1-4]$/)).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Choose a provider and plan' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose the models you actually use' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Describe your monthly workload' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review the recommendation' })).toBeInTheDocument();
    const result = await calculatedResult();
    expect(screen.getByText('Variable rolling entitlement · exact token capacity is not published.')).toBeInTheDocument();
    expect(screen.getByText('Adjust model usage mix')).toBeInTheDocument();
    expect(screen.getByText('For example, 10M tokens at a 50/50 input/output mix describes a balanced monthly workload.')).toBeInTheDocument();
    expect(result).toHaveTextContent(/subscription|pay as you go/i);
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

  it('does not present savings or breakeven metrics for an ineligible plan', async () => {
    const catalog = calculatorFixture('rolling');
    renderCalculator(catalog, calculatorPath({ planId: catalog.plans[0].id }));

    const result = await calculatedResult();
    const differenceHeading = within(result).getByRole('heading', { name: 'Can the plan cover this workload?' });
    const differenceMetric = differenceHeading.closest<HTMLElement>('.value-metric');
    if (!differenceMetric) throw new Error('Expected an estimated-difference metric');

    expect(within(differenceMetric).getByText('Not verified')).toHaveAttribute('data-savings-tone', 'neutral');
    expect(within(result).getByText('Breakeven point').parentElement).toHaveTextContent('Unavailable');
    expect(within(result).getByText('Efficiency').parentElement).toHaveTextContent('Unavailable');
    expect(within(result).queryByText(/^Breakeven:/)).not.toBeInTheDocument();
  });

  it.each<readonly [string, CatalogResponse, string]>([
    ['a lower fixed subscription', { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan()] }, 'Subscription is cheaper'],
    ['an equal fixed subscription', { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan({ monthlyCostMicroDollars: 50_000_000 })] }, 'Subscription and pay as you go cost the same'],
    ['a more expensive fixed subscription', { ...FRONTEND_TEST_CATALOG, plans: [comparablePlan({ monthlyCostMicroDollars: 80_000_000 })] }, 'Pay as you go is cheaper'],
    ['an entitlement without published capacity', calculatorFixture('rolling'), 'Not verified'],
  ])('uses eligibility and savings to explain %s', async (_name, catalog, expectedRecommendation) => {
    renderCalculator(catalog, calculatorPath({ planId: catalog.plans[0]?.id ?? '' }));

    expect(await calculatedResult())
      .toHaveTextContent(expectedRecommendation);
  });

  it('hydrates shared state once, preserves the URL, and lets the visitor change provider afterward', async () => {
    const pathname = calculatorPath({ planId: 'provider-a:fixed', inputShareBasisPoints: 8_000, monthlyTokens: 2_500_000 });
    renderCalculator(twoProviderCatalog(), pathname);

    await calculatedResult();
    expect(screen.getByRole('radio', { name: /Fixed 10M/i })).toBeChecked();
    expect(screen.getByLabelText(/Expected monthly usage/i)).toHaveValue('2,500,000');
    expect(screen.getByLabelText(/Input share/i)).toHaveAttribute('aria-valuenow', '80');
    expect(screen.getByRole('checkbox', { name: /Alpha Direct/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Alpha via OpenRouter/i })).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Provider B' }));

    await waitFor(() => expect(screen.getByRole('radio', { name: /Provider B Fixed/i })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Beta Direct/i })).toBeChecked();
    expect(`${window.location.pathname}${window.location.search}`).toBe(pathname);
  });

  it('canonicalizes recovered shared state once without selecting a replacement plan', async () => {
    const recoveryPath = `${CALCULATOR_PATH}?${new URLSearchParams({
      provider: 'provider-a',
      plan: 'removed-plan',
      models: `${selectedDirectOffer.id},removed-model`,
      weights: '7000,3000',
      input: '5000',
      tokens: '1000000',
      utm_source: 'test',
    })}`;
    renderCalculator(FRONTEND_TEST_CATALOG, recoveryPath);

    await calculatedResult();
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`)
      .toBe(calculatorPath({ planId: '', monthlyTokens: 1_000_000 })));
    expect(screen.getByRole('radio', { name: /Starter/i })).not.toBeChecked();
    expect(screen.getByRole('region', { name: 'Calculated plan value' })).toHaveTextContent('Choose a subscription with published capacity');
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
    expect(result).toHaveTextContent('Choose a subscription with published capacity');
  });

  it('shares the hydrated state without replacing the current address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const pathname = calculatorPath({ planId: 'provider-a:fixed', monthlyTokens: 2_500_000 });
    renderCalculator(FRONTEND_TEST_CATALOG, pathname);

    await calculatedResult();
    fireEvent.click(screen.getByRole('button', { name: 'Share result' }));

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
    renderAt('/tools/subscriptions-vs-apis/');

    await screen.findByRole('heading', { name: /What does API usage cost?/i });
    fireEvent.change(screen.getByLabelText(/Expected monthly usage/i), { target: { value: '20000001' } });

    const guidance = await screen.findByRole('status', { name: 'High-volume optimization guidance' });
    expect(guidance).toHaveTextContent('At this volume, custom model routing, prompt caching, and agent pipelines may materially reduce spend.');
    expect(within(guidance).getByRole('link', { name: 'Talk to MonoMind' })).toHaveAttribute('href', 'https://monomind.one/');
  });

  it('renders derived metrics, evidence links, and separated pricing basis comparisons', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /What does API usage cost?/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Direct provider API', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenRouter API', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenCode Zen', level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /evidence/i }).length).toBeGreaterThan(0);
    expect(screen.getByText('Availability: available')).toBeInTheDocument();
  });

  it('renders the TokenBench shared chrome with its canonical navigation', async () => {
    render(<App />);

    await screen.findByRole('heading', { name: /What does API usage cost?/i });
    expect(screen.getByRole('link', { name: 'TokenBench home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('img', { name: 'MonoMind monogram' })).toHaveAttribute('src', '/brand/monomind-tokenbench.png');
    expect(screen.getByText('The Decision Engine for AI Costs & Model Benchmarks')).toBeInTheDocument();
    expect(screen.getByText('Powered by MonoMind AI Lab')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveTextContent('HomeSubscribe vs APICompareLeaderboardsGuides');
  });

  it('renders the five approved primary navigation destinations', () => {
    render(<SiteHeader theme="dark" language="en" activePage="home" onThemeToggle={vi.fn()} onLanguageChange={vi.fn()} />);

    expect(within(screen.getByRole('navigation', { name: 'Primary navigation' }))
      .getAllByRole('link').map((link) => link.textContent))
      .toEqual(['Home', 'Subscribe vs API', 'Compare', 'Leaderboards', 'Guides']);
  });

  it('defaults a no-storage document to light and persists both TokenBench theme choices', async () => {
    render(<App />);

    await screen.findByRole('heading', { name: /What does API usage cost?/i });
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
    expect(menu).toHaveAttribute('aria-label', 'Open navigation');
    expect(menu).toHaveAttribute('aria-controls', 'primary-navigation');
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(screen.getByRole('navigation', { name: 'Primary navigation' }), { key: 'Escape' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
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

    await screen.findByRole('heading', { name: /What does API usage cost?/i });
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

    await screen.findByRole('heading', { name: /What does API usage cost?/i });
    const planGroup = screen.getByRole('group', { name: /Plan Selection/i });
    expect(within(planGroup).getByRole('radio', { name: /Starter/i })).toBeInTheDocument();
    expect(within(planGroup).queryByRole('radio', { name: /Free/i })).not.toBeInTheDocument();
    expect(within(planGroup).queryByRole('radio', { name: /Team/i })).not.toBeInTheDocument();
  });

  it('redistributes selected model usage and changes derived values when a preset is edited', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /What does API usage cost?/i });

    const modelGroup = screen.getByRole('group', { name: /Model selection/i });
    const checkboxes = within(modelGroup).getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    const usageMix = screen.getByRole('group', { name: /Model usage mix/i });
    expect(within(usageMix).getByLabelText(/Alpha Direct/)).toHaveAttribute('aria-valuenow', '50');

    expect(screen.getByRole('button', { name: /Balanced/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Input-heavy/i }));
    expect(screen.getByRole('button', { name: /Balanced/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Input-heavy/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Input share/i)).toHaveAttribute('aria-valuenow', '80');
    const monthlyUsage = screen.getByLabelText(/Expected monthly usage/i);
    expect(monthlyUsage.compareDocumentPosition(screen.getByText('Presets')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(monthlyUsage, { target: { value: '3000000' } });
    expect(monthlyUsage).toHaveValue('3,000,000');
    expect(screen.getByRole('button', { name: /Input-heavy/i })).toHaveAttribute('aria-pressed', 'false');

    const usageRange = screen.getByRole('slider', { name: /Monthly usage range/i });
    fireEvent.change(usageRange, { target: { value: '50000000' } });
    expect(screen.getByLabelText(/Expected monthly usage/i)).toHaveValue('50,000,000');
    expect(usageRange).toHaveAttribute('aria-valuetext', '50,000,000 tokens');
  });

  it('keeps calculator state while switching language and returns to the light theme', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /What does API usage cost?/i });
    const usage = screen.getByLabelText(/Expected monthly usage/i);
    fireEvent.change(usage, { target: { value: '4200000' } });
    fireEvent.click(screen.getByRole('button', { name: /Toggle dark theme/i }));
    fireEvent.click(screen.getByRole('button', { name: /Toggle light theme/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /Language/i }), { target: { value: 'zh-TW' } });

    expect(usage).toHaveValue('4,200,000');
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
    await waitFor(() => expect(screen.getByRole('heading', { name: /What does API usage cost?/i })).toBeInTheDocument());
  });

  it('announces one recovery banner when the fallback notice duplicates the catalog error', () => {
    const unavailable = 'Catalog unavailable (network down). Showing only the checked-in verified bootstrap; retry to load the latest revision.';
    render(<AppShell
      activePage="calculator"
      catalogPhase="ready"
      error={unavailable}
      language="en"
      lastSuccessfulRefreshAt={null}
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
      lastSuccessfulRefreshAt={null}
      onLanguageChange={vi.fn()}
      onThemeToggle={vi.fn()}
      theme="dark"
    ><p>Calculator content</p></AppShell>);

    const footer = document.querySelector('footer');
    if (!footer) throw new Error('Expected the shared site footer');
    expect(within(footer).getByRole('heading', { name: 'The Monthly LLM API Cost & Benchmark Cheatsheet (PDF/CSV)' })).toBeInTheDocument();
    expect(within(footer).getByRole('checkbox', { name: 'Notify me when new models or price drops are added to TokenBench.' })).not.toBeChecked();
    expect(within(footer).getByRole('form', { name: 'Newsletter signup' })).toBeInTheDocument();
  });

  it('renders comparison offers as compact cards at a 320px viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    render(<App />);
    await screen.findByRole('heading', { name: /What does API usage cost?/i });
    expect(document.querySelector('[data-layout="compact"]')).toBeInTheDocument();
    expect(screen.getAllByTestId('offer-card').length).toBeGreaterThan(0);
  });

  it('hydrates compact clients from a wide SSR shell without leaving a layout mismatch behind', async () => {
    const shell = (children = createElement('p', null, 'Server comparison content')) => createElement(AppShell, {
      activePage: 'compare',
      children,
      language: 'en',
      lastSuccessfulRefreshAt: null,
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
    await screen.findByRole('heading', { name: /What does API usage cost?/i });

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
    const savingsHeading = await screen.findByRole('heading', { name: /Can the plan cover this workload?/i });
    expect(savingsHeading).toBeInTheDocument();
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
