import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultApiEquivalentForPlan } from './catalog/plan-api-equivalent';
import { redistributeModelMix } from './catalog/calculator';
import type { ModelOffer, PlanOffer } from './catalog/contracts';
import { CalculatorControls } from './frontend/calculator-controls';
import { decodeCalculatorShareState, encodeCalculatorShareState, type CalculatorShareState } from './frontend/calculator-share-state';
import {
  buildCalculatorSnapshot,
  toggleModelSelection,
  type InitialSelection,
} from './frontend/calculator-state';
import type { ConversationWorkload } from './catalog/subscription-api-calculator';
import { Comparison } from './frontend/comparison';
import { AppShell } from './frontend/app-shell';
import { API_ONLY_PROVIDER_IDS, paidIndividualPlans } from './frontend/plan-filter';
import { recommendationForResult, ResultsDashboard, selectedPlanForProvider } from './frontend/results-dashboard';
import { ShareAction } from './frontend/share-action';
import { useSitePreferences } from './frontend/site-preferences';
import { ComparisonPage } from './frontend/comparison-page';
import type { ComparisonViewModel } from './frontend/comparison-contracts';
import type { ModelProfileViewModel } from './frontend/model-profile-contracts';
import type { PricePerformanceEnvelope } from './benchmarks/price-performance-contracts';
import { Skeleton, providerLabel } from './frontend/ui';
import { useCatalog, type CatalogState } from './frontend/use-catalog';
import { parseModelDirectoryEnvelope, type ModelDirectoryEnvelope } from './frontend/model-directory-contracts';
import { ModelsPage } from './pages/models-page';
import { HomePage } from './pages/home-page';
import { CompareHubPage } from './pages/compare-hub-page';
import { LeaderboardDirectoryPage, LeaderboardPage } from './pages/leaderboards-page';
import { ToolsPage } from './pages/tools-page';
import { BenchAlignMethodologyPage } from './pages/benchalign-methodology-page';
import { ModelProfilePage } from './pages/model-profile-page';
import { PricePerformanceApp } from './pages/price-performance-page';
import { matchRoute, ROUTE_PATHS, type LeaderboardKey, type SiteNavigationPage } from './routing/routes';

interface PageFrameProps {
  readonly children: ReactNode;
  readonly activePage?: SiteNavigationPage;
  readonly skipLinkTarget?: string;
  readonly skipLinkLabel?: string;
  readonly catalogState?: CatalogState;
}

function PageFrame({ children, activePage, skipLinkTarget, skipLinkLabel, catalogState }: PageFrameProps) {
  const { theme, language, toggleTheme, changeLanguage } = useSitePreferences();

  return (
    <AppShell
      theme={theme}
      language={language}
      activePage={activePage}
      skipLinkTarget={skipLinkTarget}
      skipLinkLabel={skipLinkLabel}
      onThemeToggle={toggleTheme}
      onLanguageChange={changeLanguage}
      catalogPhase={catalogState?.phase}
      notice={catalogState?.notice}
      error={catalogState?.error}
      onRetry={catalogState?.retry}
    >
      {children}
    </AppShell>
  );
}

const DEFAULT_WORKLOAD: ConversationWorkload = {
  conversationsPerDay: 10,
  messagesPerConversation: 8,
  inputTokensPerMessage: 750,
  outputTokensPerMessage: 250,
  activeDaysPerMonth: 25,
};

function defaultOfferForProvider(catalog: NonNullable<CatalogState['catalog']>, providerId: string, planId: string): ModelOffer | null {
  const plan = catalog.plans.find((candidate) => candidate.id === planId && candidate.providerId === providerId);
  if (plan) return defaultApiEquivalentForPlan(plan, catalog.modelOffers);
  return catalog.modelOffers.find((offer) => offer.providerId === providerId && offer.pricingBasis === 'direct_provider_api' && offer.route === 'direct_provider') ?? null;
}

function selectionForPlan(catalog: NonNullable<CatalogState['catalog']>, providerId: string, planId: string): InitialSelection {
  const defaultOffer = defaultOfferForProvider(catalog, providerId, planId);
  if (defaultOffer) return { selectedModelIds: [defaultOffer.id], modelMixBasisPoints: { [defaultOffer.id]: 10_000 } };
  return { selectedModelIds: [], modelMixBasisPoints: {} };
}

function selectionsMatch(left: InitialSelection, right: InitialSelection): boolean {
  return left.selectedModelIds.length === right.selectedModelIds.length
    && left.selectedModelIds.every((id, index) => id === right.selectedModelIds[index]
      && left.modelMixBasisPoints[id] === right.modelMixBasisPoints[id]);
}

function CalculatorPage() {
  const catalogState = useCatalog();
  const { catalog, phase } = catalogState;
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selection, setSelection] = useState<InitialSelection>({ selectedModelIds: [], modelMixBasisPoints: {} });
  const [workload, setWorkload] = useState<ConversationWorkload>(DEFAULT_WORKLOAD);
  const [mappingMode, setMappingMode] = useState<'default' | 'override'>('default');
  const appliedSharedStateRef = useRef(false);
  const hydratedSharedStateRef = useRef(false);
  const skipSharedStateReconciliationRef = useRef(false);

  const providerIds = useMemo(() => {
    if (!catalog) return [];
    const paidProviderIds = paidIndividualPlans(catalog.plans).map((plan) => plan.providerId);
    const apiOnlyProviderIds = API_ONLY_PROVIDER_IDS.filter((providerId) => catalog.modelOffers.some((offer) => offer.providerId === providerId));
    return Array.from(new Set([...paidProviderIds, ...apiOnlyProviderIds]))
      .sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [catalog]);

  useEffect(() => {
    if (!catalog || phase !== 'ready' || appliedSharedStateRef.current) return;
    appliedSharedStateRef.current = true;

    const decoded = decodeCalculatorShareState(new URLSearchParams(window.location.search), catalog);
    if (!decoded) return;

    hydratedSharedStateRef.current = true;
    skipSharedStateReconciliationRef.current = true;
    setSelectedProviderId(decoded.state.providerId);
    setSelectedPlanId(decoded.state.planId);
    setSelection({
      selectedModelIds: [...decoded.state.selectedModelIds],
      modelMixBasisPoints: { ...decoded.state.modelMixBasisPoints },
    });
    setWorkload(decoded.state.workload);
    setMappingMode(decoded.state.mappingMode);

    if (decoded.wasNormalized) {
      window.history.replaceState(
        window.history.state,
        '',
        `${ROUTE_PATHS.calculator}?${encodeCalculatorShareState(decoded.state)}${window.location.hash}`,
      );
    }
  }, [catalog, phase]);

  useEffect(() => {
    if (!catalog || providerIds.length === 0) return;
    if (skipSharedStateReconciliationRef.current) {
      skipSharedStateReconciliationRef.current = false;
      return;
    }
    const providerWithPlanDefault = providerIds.find((providerId) => {
      const firstPlan = paidIndividualPlans(catalog.plans, providerId)[0];
      return firstPlan !== undefined && defaultOfferForProvider(catalog, providerId, firstPlan.id) !== null;
    });
    const providerWithApiOnlyDefault = providerIds.find((providerId) => paidIndividualPlans(catalog.plans, providerId).length === 0
      && defaultOfferForProvider(catalog, providerId, '') !== null);
    const providerWithModels = providerIds.find((providerId) => catalog.modelOffers.some((offer) => offer.providerId === providerId));
    const nextProvider = selectedProviderId && providerIds.includes(selectedProviderId)
      ? selectedProviderId
      : providerWithPlanDefault ?? providerWithApiOnlyDefault ?? providerWithModels ?? providerIds[0];
    if (nextProvider !== selectedProviderId) {
      setSelectedProviderId(nextProvider);
      return;
    }
    const providerPlans = paidIndividualPlans(catalog.plans, nextProvider);
    const planStillAvailable = selectedPlanId === '' || providerPlans.some((plan) => plan.id === selectedPlanId);
    if (!planStillAvailable) {
      setSelectedPlanId(providerPlans[0]?.id ?? '');
      setSelection(selectionForPlan(catalog, nextProvider, providerPlans[0]?.id ?? ''));
      setMappingMode('default');
      return;
    }
    if (!selectedPlanId && providerPlans.length > 0 && !hydratedSharedStateRef.current) {
      const firstPlanId = providerPlans[0]?.id ?? '';
      setSelectedPlanId(firstPlanId);
      setSelection(selectionForPlan(catalog, nextProvider, firstPlanId));
      setMappingMode('default');
      return;
    }
    const providerModelIds = new Set(catalog.modelOffers.filter((offer) => offer.providerId === nextProvider).map((offer) => offer.id));
    if (!hydratedSharedStateRef.current && !selection.selectedModelIds.some((id) => providerModelIds.has(id))) {
      const nextSelection = selectionForPlan(catalog, nextProvider, selectedPlanId);
      if (!selectionsMatch(selection, nextSelection)) setSelection(nextSelection);
      setMappingMode('default');
    }
  }, [catalog, providerIds, selectedPlanId, selectedProviderId, selection.selectedModelIds]);

  const selectedPlan = catalog ? selectedPlanForProvider(catalog.plans, selectedProviderId, selectedPlanId) : undefined;
  const providerModels = catalog?.modelOffers.filter((offer) => offer.providerId === selectedProviderId) ?? [];
  const defaultApiEquivalentOffer = selectedPlan && catalog ? defaultApiEquivalentForPlan(selectedPlan, catalog.modelOffers) : null;
  const snapshot = useMemo(() => buildCalculatorSnapshot({
    modelOffers: providerModels,
    selectedModelIds: selection.selectedModelIds,
    modelMixBasisPoints: selection.modelMixBasisPoints,
    workload,
    mappingMode,
    selectedPlan,
    catalogFreshness: catalog?.freshness,
  }), [catalog?.freshness, mappingMode, providerModels, selectedPlan, selection.modelMixBasisPoints, selection.selectedModelIds, workload]);
  const recommendation = recommendationForResult(selectedPlan, snapshot);
  const canShare = selectedProviderId.length > 0
    && selection.selectedModelIds.length > 0
    && selection.selectedModelIds.reduce((total, modelId) => total + (selection.modelMixBasisPoints[modelId] ?? 0), 0) === 10_000;
  const shareState: CalculatorShareState = {
    providerId: selectedProviderId,
    planId: selectedPlanId,
    workload,
    selectedModelIds: selection.selectedModelIds,
    modelMixBasisPoints: selection.modelMixBasisPoints,
    mappingMode,
  };

  const handleProviderChange = (providerId: string) => {
    if (!catalog) return;
    const plans = paidIndividualPlans(catalog.plans, providerId);
    const planId = plans[0]?.id ?? '';
    setSelectedProviderId(providerId);
    setSelectedPlanId(planId);
    setSelection(selectionForPlan(catalog, providerId, planId));
    setMappingMode('default');
  };

  const handlePlanChange = (planId: string) => {
    if (!catalog) return;
    setSelectedPlanId(planId);
    setSelection(selectionForPlan(catalog, selectedProviderId, planId));
    setMappingMode('default');
  };

  const handleModelToggle = (modelId: string) => setSelection((current) => toggleModelSelection(current, modelId));

  const handleModelShareChange = (modelId: string, shareBasisPoints: number) => {
    setSelection((current) => {
      if (!current.selectedModelIds.includes(modelId)) return current;
      try {
        return { ...current, modelMixBasisPoints: redistributeModelMix(current.modelMixBasisPoints, modelId, shareBasisPoints) };
      } catch {
        return current;
      }
    });
  };

  const focusResult = () => document.getElementById('calculator-result')?.focus();

  return (
    <PageFrame activePage="calculator" skipLinkTarget="calculator" skipLinkLabel="Skip to calculator" catalogState={catalogState}>
      <section id="calculator" className="content-stack calculator-page" aria-labelledby="calculator-heading" tabIndex={-1}>
        <header className="calculator-intro">
          <h1 id="calculator-heading">Should you subscribe or pay as you go?</h1>
          <p>Estimate the API-equivalent value of an AI subscription from conversations, messages, directional tokens, and active days that match your workload.</p>
        </header>
        <details className="calculator-step-overview" open>
          <summary>Four steps to a useful comparison</summary>
          <ol>
            <li><a href="#calculator-provider-plan">Provider and plan</a></li>
            <li><a href="#calculator-models">Models you actually use</a></li>
            <li><a href="#calculator-workload">Message-level workload</a></li>
            <li><a href="#calculator-result">Recommendation</a></li>
          </ol>
        </details>
        {!catalog ? <div className="calculator-loading-steps" aria-label="Calculator steps">
          <header className="calculator-step-heading"><span>Step 1</span><h2>Choose a provider and plan</h2></header>
          <header className="calculator-step-heading"><span>Step 2</span><h2>Choose the models you actually use</h2></header>
          <header className="calculator-step-heading"><span>Step 3</span><h2>Describe your message-level workload</h2></header>
          <header className="calculator-step-heading"><span>Step 4</span><h2>Review the recommendation</h2></header>
        </div> : null}
        {phase === 'loading' && !catalog ? <Skeleton label="Loading verified catalog" /> : null}
        {catalog ? <>
          <div className="calculator-guided-layout">
            <CalculatorControls
              catalog={catalog}
              providerIds={providerIds}
              selectedProviderId={selectedProviderId}
              selectedPlanId={selectedPlanId}
              selectedModelIds={selection.selectedModelIds}
              modelMixBasisPoints={selection.modelMixBasisPoints}
              workload={workload}
              mappingMode={mappingMode}
              defaultApiEquivalentOffer={defaultApiEquivalentOffer}
              onProviderChange={handleProviderChange}
              onPlanChange={handlePlanChange}
              onModelToggle={handleModelToggle}
              onModelShareChange={handleModelShareChange}
              onWorkloadChange={setWorkload}
              onMappingModeChange={setMappingMode}
            />
            <div className="calculator-guided-results">
              <ResultsDashboard selectedPlan={selectedPlan} snapshot={snapshot} hasAvailableModels={providerModels.length > 0} catalog={catalog} />
              {canShare ? <ShareAction label="Share result" title="TokenBench subscription vs API result" url={`${location.origin}${ROUTE_PATHS.calculator}?${encodeCalculatorShareState(shareState)}`} /> : null}
            </div>
          </div>
          <Comparison catalog={catalog} selectedProviderId={selectedProviderId} selectedModelIds={selection.selectedModelIds} selectedPlanId={selectedPlanId} workload={workload} modelMixBasisPoints={selection.modelMixBasisPoints} />
          <button className="view-result-action" type="button" aria-controls="calculator-result" onClick={focusResult}>View result</button>
        </> : null}
      </section>
    </PageFrame>
  );
}

function HomeRoute() {
  return <PageFrame activePage="home"><HomePage /></PageFrame>;
}

function ToolsRoute() {
  return <PageFrame><ToolsPage /></PageFrame>;
}

function BenchAlignMethodologyRoute() {
  return <PageFrame activePage="leaderboards"><BenchAlignMethodologyPage /></PageFrame>;
}

function CompareHubRoute() {
  return <PageFrame activePage="compare"><CompareHubPage /></PageFrame>;
}

function LeaderboardsRoute() {
  return <PageFrame activePage="leaderboards"><LeaderboardDirectoryPage /></PageFrame>;
}

function LeaderboardRoute({ keyName }: { readonly keyName: LeaderboardKey }) {
  return <PageFrame activePage="leaderboards"><LeaderboardPage keyName={keyName} /></PageFrame>;
}
function ModelsRoute() {
  const [envelope, setEnvelope] = useState<ModelDirectoryEnvelope | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/benchmarks/models?limit=100', { headers: { accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('models unavailable')))
      .then((payload: unknown) => {
        const parsed = parseModelDirectoryEnvelope(payload);
        if (active && parsed) setEnvelope(parsed);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return <PageFrame activePage="models">
    {envelope
      ? <ModelsPage envelope={envelope} />
      : <section className="content-stack models-page" data-server-models><section className="models-hero panel" aria-labelledby="models-heading"><span className="eyebrow">Weekly model directory</span><h1 id="models-heading">Popular AI models</h1><p>Loading the latest validated model directory.</p><Skeleton label="Loading popular models" /></section></section>}
  </PageFrame>;
}

/** Shared by the price-performance Pages Function response and browser hydration. */
export function PricePerformanceRoute({ initialEnvelope }: { readonly initialEnvelope?: PricePerformanceEnvelope }) {
  return <PageFrame activePage="pricePerformance">
    <PricePerformanceApp initialEnvelope={initialEnvelope} />
  </PageFrame>;
}


/** Shared by the Pages Function SSR response and browser hydration. */
export function ComparisonDetailApp({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  return <PageFrame activePage="compare"><ComparisonPage viewModel={viewModel} /></PageFrame>;
}

/** Shared by each durable model Pages Function response and browser hydration. */
export function ModelProfileApp({ viewModel }: { readonly viewModel: ModelProfileViewModel }) {
  return <PageFrame activePage="models"><ModelProfilePage viewModel={viewModel} /></PageFrame>;
}

export default function App() {
  const route = matchRoute(window.location.pathname);

  if (route.kind === 'home') return <HomeRoute />;
  if (route.kind === 'tools') return <ToolsRoute />;
  if (route.kind === 'calculator') return <CalculatorPage />;
  if (route.kind === 'pricePerformance') return <PricePerformanceRoute />;
  if (route.kind === 'methodologyBenchAlign') return <BenchAlignMethodologyRoute />;
  if (route.kind === 'compareHub') return <CompareHubRoute />;
  if (route.kind === 'leaderboards') return <LeaderboardsRoute />;
  if (route.kind === 'leaderboard') return <LeaderboardRoute keyName={route.key} />;
  if (route.kind === 'models') return <ModelsRoute />;
  if (route.kind === 'redirect') {
    window.location.replace(route.to);
    return null;
  }
  return null;
}
