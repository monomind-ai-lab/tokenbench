import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultApiEquivalentForPlan } from './catalog/plan-api-equivalent';
import { redistributeModelMix } from './catalog/calculator';
import type { ModelOffer, PlanOffer } from './catalog/contracts';
import { CalculatorControls } from './frontend/calculator-controls';
import { BreakevenDashboard } from './frontend/breakeven-dashboard';
import type { BreakevenScenario } from './frontend/breakeven-state';
import { decodeBreakevenShareState, decodeCalculatorShareState, encodeBreakevenShareState, encodeCalculatorShareState, type CalculatorShareState } from './frontend/calculator-share-state';
import {
  buildCalculatorSnapshot,
  toggleModelSelection,
  type CalculatorCostUsage,
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
import { LeaderboardDirectoryPage, LeaderboardPage, V21LeaderboardPage } from './pages/leaderboards-page';
import { v21Leaderboard } from './benchmarks/v21-leaderboards';
import { ToolsPage } from './pages/tools-page';
import { BenchAlignMethodologyPage } from './pages/benchalign-methodology-page';
import { ModelProfilePage } from './pages/model-profile-page';
import { ModelLifecycleApp } from './pages/model-lifecycle-page';
import { CompareProvider } from './frontend/compare-state';
import { ComparisonTray } from './frontend/comparison-tray';
import { NotFoundPage } from './pages/not-found-page';
import { PricePerformanceApp } from './pages/price-performance-page';
import { CostPage, type CostHubSharedState, type CostHubSourceCoverage } from './pages/cost-page';
import { trackTokenBenchEvent } from './frontend/analytics';
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
      <ComparisonTray />
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

export interface CostInitialState {
  readonly mode: 'calculator' | 'breakeven';
  readonly calculator?: {
    readonly workload: ConversationWorkload;
    readonly providerId: string | null;
    readonly planId: string | null;
    readonly modelIds: readonly string[];
  };
  readonly breakeven?: BreakevenScenario;
}

interface BreakevenSettings {
  readonly seats: number;
  readonly feePerSeat: number;
  readonly maxTokensMillions: number;
  readonly inputShare: number | null;
  readonly inputPricePerMillion: number | null;
  readonly outputPricePerMillion: number | null;
  readonly cacheReadBasisPoints: number;
  readonly cacheWriteTokens: number;
  readonly longContextTokens: number;
}

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

function CalculatorPage({ mode = 'calculator', initialCostState }: { readonly mode?: 'calculator' | 'breakeven'; readonly initialCostState?: CostInitialState }) {
  const catalogState = useCatalog();
  const { catalog, phase } = catalogState;
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selection, setSelection] = useState<InitialSelection>({ selectedModelIds: [], modelMixBasisPoints: {} });
  const [workload, setWorkload] = useState<ConversationWorkload>(() => initialCostState?.mode === 'calculator'
    ? initialCostState.calculator?.workload ?? DEFAULT_WORKLOAD
    : DEFAULT_WORKLOAD);
  const [mappingMode, setMappingMode] = useState<'default' | 'override'>('default');
  const [costUsage, setCostUsage] = useState<CalculatorCostUsage>({ characterCount: 0, charactersPerToken: 4, manualMonthlyTokens: null, cacheReadBasisPoints: 0, cacheWriteTokens: 0, longContextTokens: 0 });
  const [breakevenSettings, setBreakevenSettings] = useState<BreakevenSettings>(() => {
    const scenario = initialCostState?.mode === 'breakeven' ? initialCostState.breakeven : undefined;
    return {
      seats: scenario?.seats ?? 1,
      feePerSeat: scenario?.feePerSeat ?? 20,
      maxTokensMillions: scenario?.maxTokensMillions ?? 300,
      inputShare: scenario?.inputShare ?? null,
      inputPricePerMillion: scenario?.inputPricePerMillion ?? null,
      outputPricePerMillion: scenario?.outputPricePerMillion ?? null,
      cacheReadBasisPoints: 0,
      cacheWriteTokens: 0,
      longContextTokens: 0,
    };
  });
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

    const params = new URLSearchParams(window.location.search);
    const decodedBreakeven = mode === 'breakeven' ? decodeBreakevenShareState(params, catalog) : null;
    const decoded = decodedBreakeven?.state.calculator ?? decodeCalculatorShareState(params, catalog)?.state;
    if (!decoded) return;

    hydratedSharedStateRef.current = true;
    skipSharedStateReconciliationRef.current = true;
    setSelectedProviderId(decoded.providerId);
    setSelectedPlanId(decoded.planId);
    setSelection({
      selectedModelIds: [...decoded.selectedModelIds],
      modelMixBasisPoints: { ...decoded.modelMixBasisPoints },
    });
    setWorkload(decoded.workload);
    setMappingMode(decoded.mappingMode);
    if (decoded.costUsage) setCostUsage(decoded.costUsage);
    if (decodedBreakeven) {
      const scenario = decodedBreakeven.state;
      setBreakevenSettings({
        seats: scenario.seats,
        feePerSeat: scenario.feePerSeat,
        maxTokensMillions: scenario.maxTokensMillions,
        inputShare: scenario.inputShareBasisPoints / 10_000,
        inputPricePerMillion: scenario.inputPricePerMillion,
        outputPricePerMillion: scenario.outputPricePerMillion,
        cacheReadBasisPoints: scenario.cacheReadBasisPoints,
        cacheWriteTokens: scenario.cacheWriteTokens,
        longContextTokens: scenario.longContextTokens,
      });
    }

    if (decodedBreakeven?.wasNormalized) {
      window.history.replaceState(window.history.state, '', `${ROUTE_PATHS.breakeven}?${encodeBreakevenShareState(decodedBreakeven.state)}${window.location.hash}`);
    } else if (mode !== 'breakeven' && decodeCalculatorShareState(params, catalog)?.wasNormalized) {
      window.history.replaceState(
        window.history.state,
        '',
        `${ROUTE_PATHS.calculator}?${encodeCalculatorShareState(decoded)}${window.location.hash}`,
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
    costUsage,
    mappingMode,
    selectedPlan,
    catalogFreshness: catalog?.freshness,
  }), [catalog?.freshness, costUsage, mappingMode, providerModels, selectedPlan, selection.modelMixBasisPoints, selection.selectedModelIds, workload]);
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
    costUsage,
  };
  const breakevenShareState = {
    calculator: shareState,
    seats: breakevenSettings.seats,
    feePerSeat: breakevenSettings.feePerSeat,
    maxTokensMillions: breakevenSettings.maxTokensMillions,
    inputShareBasisPoints: Math.round((breakevenSettings.inputShare ?? 0.5) * 10_000),
    inputPricePerMillion: breakevenSettings.inputPricePerMillion,
    outputPricePerMillion: breakevenSettings.outputPricePerMillion,
    cacheReadBasisPoints: breakevenSettings.cacheReadBasisPoints,
    cacheWriteTokens: breakevenSettings.cacheWriteTokens,
    longContextTokens: breakevenSettings.longContextTokens,
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
           <h1 id="calculator-heading">{mode === 'breakeven' ? 'Subscription breakeven analysis' : 'Should you subscribe or pay as you go?'}</h1>
           <p>{mode === 'breakeven' ? 'Use the same verified plan, model, and workload controls to see where a published subscription fee meets published API pricing. Results use the shared calculator snapshot.' : 'Estimate the API-equivalent value of an AI subscription from conversations, messages, directional tokens, and active days that match your workload.'}</p>
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
              costUsage={costUsage}
              onProviderChange={handleProviderChange}
              onPlanChange={handlePlanChange}
              onModelToggle={handleModelToggle}
              onModelShareChange={handleModelShareChange}
              onWorkloadChange={setWorkload}
              onCostUsageChange={setCostUsage}
              onMappingModeChange={setMappingMode}
            />
            <div className="calculator-guided-results">
               {mode === 'breakeven'
                 ? <BreakevenDashboard
                   snapshot={snapshot}
                   hasAvailableModels={providerModels.length > 0}
                   seats={breakevenSettings.seats}
                   feePerSeat={breakevenSettings.feePerSeat}
                   maxTokensMillions={breakevenSettings.maxTokensMillions}
                   scenarioOverride={breakevenSettings}
                   onScenarioChange={(next) => setBreakevenSettings((current) => ({ ...current, ...next }))}
                 />
                 : <ResultsDashboard selectedPlan={selectedPlan} snapshot={snapshot} hasAvailableModels={providerModels.length > 0} catalog={catalog} />}
                {canShare ? <ShareAction label="Share result" title="TokenBench subscription vs API result" url={`${location.origin}${mode === 'breakeven' ? ROUTE_PATHS.breakeven : ROUTE_PATHS.calculator}?${mode === 'breakeven' ? encodeBreakevenShareState(breakevenShareState) : encodeCalculatorShareState(shareState)}`} onShared={() => trackTokenBenchEvent(mode === 'breakeven' ? 'breakeven_share_created' : 'cost_share_created', { route: mode === 'breakeven' ? ROUTE_PATHS.breakeven : ROUTE_PATHS.calculator })} /> : null}
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

function sharedCostState(): CostHubSharedState {
  const params = new URLSearchParams(window.location.search);
  const carriedFields: Array<CostHubSharedState['carriedFields'][number]> = [];
  if (params.has('provider') || params.has('models')) carriedFields.push('model');
  if (params.has('host') || params.has('route')) carriedFields.push('host');
  if (params.has('weights')) carriedFields.push('mix');
  if (params.has('c') || params.has('m') || params.has('i') || params.has('o') || params.has('d')) carriedFields.push('workload');
  return { present: carriedFields.length > 0, carriedFields };
}

function CostHubRoute() {
  const catalogState = useCatalog();
  const coverage = useMemo<CostHubSourceCoverage>(() => {
    const catalog = catalogState.catalog;
    if (!catalog) return { completePriceRoutes: 0, effectiveAt: null, freshness: 'unavailable' };
    const completePriceRoutes = catalog.modelOffers.filter((offer) => Number.isFinite(offer.inputMicroDollarsPerMillion)
      && Number.isFinite(offer.outputMicroDollarsPerMillion)).length;
    const sourceIds = new Set(catalog.modelOffers.map((offer) => offer.sourceId));
    const effectiveAt = catalog.provenance
      .filter((source) => sourceIds.has(source.id))
      .map((source) => source.observedAt)
      .filter((value) => Number.isFinite(Date.parse(value)))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
    return {
      completePriceRoutes,
      effectiveAt,
      freshness: catalog.freshness.status === 'stale' ? 'stale' : completePriceRoutes > 0 ? 'fresh' : 'unavailable',
    };
  }, [catalogState.catalog]);

  return <PageFrame activePage="calculator" catalogState={catalogState} skipLinkTarget="cost-page-content" skipLinkLabel="Skip to cost tools">
    <CostPage sourceCoverage={coverage} sharedState={sharedCostState()} />
  </PageFrame>;
}

function BenchAlignMethodologyRoute() {
  return <PageFrame activePage="leaderboards"><BenchAlignMethodologyPage /></PageFrame>;
}

function CompareHubRoute() {
  return <PageFrame activePage="compare"><CompareHubPage /></PageFrame>;
}

function ComparisonPendingRoute({ pair }: { readonly pair: string }) {
  return <PageFrame activePage="compare">
    <section className="content-stack static-page-content" aria-labelledby="comparison-pending-heading">
      <header>
        <p className="article-status" role="status">Comparison pending</p>
        <h1 id="comparison-pending-heading">Comparison result not yet available</h1>
        <p>{`The published result for ${pair} is not available yet. TokenBench is not presenting evidence or a winner for this pair.`}</p>
      </header>
      <nav className="static-page-links" aria-label="Comparison next steps">
        <a className="button" href={ROUTE_PATHS.compareHub}>Go to Compare hub</a>
        <a className="button button-secondary" href={ROUTE_PATHS.models}>Browse models</a>
      </nav>
    </section>
  </PageFrame>;
}

function LeaderboardsRoute() {
  return <PageFrame activePage="leaderboards"><LeaderboardDirectoryPage /></PageFrame>;
}

function LeaderboardRoute({ keyName }: { readonly keyName: LeaderboardKey }) {
  return <PageFrame activePage="leaderboards"><LeaderboardPage keyName={keyName} /></PageFrame>;
}

function V21LeaderboardRoute({ category }: { readonly category: string }) {
  const definition = v21Leaderboard(category);
  return <PageFrame activePage="leaderboards">
    {definition ? <V21LeaderboardPage category={definition} /> : <LeaderboardDirectoryPage />}
  </PageFrame>;
}

/** Shared by the category Pages Function response and its browser hydration. */
export function V21LeaderboardApp({
  category,
  initialEnvelope,
}: {
  readonly category: NonNullable<ReturnType<typeof v21Leaderboard>>;
  readonly initialEnvelope?: import('./frontend/use-benchmarks').BenchmarkApiEnvelope<import('./frontend/use-benchmarks').LeaderboardPageResult>;
}) {
  return <CompareProvider><PageFrame activePage="leaderboards"><V21LeaderboardPage category={category} initialEnvelope={initialEnvelope} /></PageFrame></CompareProvider>;
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
      : <section className="content-stack models-page" data-server-models><section className="models-hero panel" aria-labelledby="models-heading"><h1 id="models-heading">Popular AI models</h1><p>Loading the latest validated model directory.</p><Skeleton label="Loading popular models" /></section></section>}
  </PageFrame>;
}

/** Shared by the price-performance Pages Function response and browser hydration. */
export function PricePerformanceRoute({ initialEnvelope }: { readonly initialEnvelope?: PricePerformanceEnvelope }) {
  return <CompareProvider><PageFrame activePage="pricePerformance">
    <PricePerformanceApp initialEnvelope={initialEnvelope} />
  </PageFrame></CompareProvider>;
}


/** Shared by the Pages Function SSR response and browser hydration. */
export function ComparisonDetailApp({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  return <CompareProvider><PageFrame activePage="compare"><ComparisonPage viewModel={viewModel} /></PageFrame></CompareProvider>;
}

/** Shared by each durable model Pages Function response and browser hydration. */
export function ModelProfileApp({ viewModel }: { readonly viewModel: ModelProfileViewModel }) {
  return <CompareProvider><PageFrame activePage="models"><ModelProfilePage viewModel={viewModel} /></PageFrame></CompareProvider>;
}

function RoutedApp({ initialCostState }: { readonly initialCostState?: CostInitialState }) {
  const route = matchRoute(window.location.pathname);

  if (route.kind === 'home') return <HomeRoute />;
  if (route.kind === 'cost') return <CostHubRoute />;
  if (route.kind === 'tools') return <ToolsRoute />;
  if (route.kind === 'calculator') return <CalculatorPage initialCostState={initialCostState?.mode === 'calculator' ? initialCostState : undefined} />;
  if (route.kind === 'breakeven') return <CalculatorPage mode="breakeven" initialCostState={initialCostState?.mode === 'breakeven' ? initialCostState : undefined} />;
  if (route.kind === 'pricePerformance') return <PricePerformanceRoute />;
  if (route.kind === 'methodologyBenchAlign') return <BenchAlignMethodologyRoute />;
  if (route.kind === 'compareHub') return <CompareHubRoute />;
  if (route.kind === 'comparison') return <ComparisonPendingRoute pair={route.pair} />;
  if (route.kind === 'leaderboards') return <LeaderboardsRoute />;
  if (route.kind === 'leaderboardCategory') return <V21LeaderboardRoute category={route.category} />;
  if (route.kind === 'leaderboardSla') return <V21LeaderboardRoute category="sla" />;
  if (route.kind === 'leaderboardCustom') return <V21LeaderboardRoute category="custom" />;
  if (route.kind === 'leaderboard') return <LeaderboardRoute keyName={route.key} />;
  if (route.kind === 'models') return <ModelsRoute />;
  if (route.kind === 'modelLifecycle') return <ModelLifecycleApp />;
  if (route.kind === 'redirect') {
    window.location.replace(route.to);
    return null;
  }
  return <PageFrame><NotFoundPage /></PageFrame>;
}

export default function App({ initialCostState }: { readonly initialCostState?: CostInitialState } = {}) {
  return <CompareProvider><RoutedApp initialCostState={initialCostState} /></CompareProvider>;
}
