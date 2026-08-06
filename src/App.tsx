import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { redistributeModelMix } from './catalog/calculator';
import { CalculatorControls } from './frontend/calculator-controls';
import { decodeCalculatorShareState, encodeCalculatorShareState } from './frontend/calculator-share-state';
import {
  applyWorkloadPreset,
  buildCalculatorSnapshot,
  createInitialSelection,
  selectedWorkloadPreset,
  toggleModelSelection,
} from './frontend/calculator-state';
import { Comparison } from './frontend/comparison';
import { AppShell } from './frontend/app-shell';
import { API_ONLY_PROVIDER_IDS, paidIndividualPlans } from './frontend/plan-filter';
import { recommendationForResult, ResultsDashboard, selectedPlanForProvider } from './frontend/results-dashboard';
import { ShareAction } from './frontend/share-action';
import { useSitePreferences } from './frontend/site-preferences';
import { ComparisonPage } from './frontend/comparison-page';
import type { ComparisonViewModel } from './frontend/comparison-contracts';
import { Skeleton, providerLabel } from './frontend/ui';
import { useCatalog, type CatalogState } from './frontend/use-catalog';
import { HomePage } from './pages/home-page';
import { CompareHubPage } from './pages/compare-hub-page';
import { LeaderboardDirectoryPage, LeaderboardPage } from './pages/leaderboards-page';
import { ToolsPage } from './pages/tools-page';
import { BenchAlignMethodologyPage } from './pages/benchalign-methodology-page';
import { matchRoute, ROUTE_PATHS, type LeaderboardKey, type SiteNavigationPage } from './routing/routes';
import type { WorkloadPreset } from './frontend/calculator-state';

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
      lastSuccessfulRefreshAt={catalogState?.lastSuccessfulRefreshAt ?? null}
      onRetry={catalogState?.retry}
    >
      {children}
    </AppShell>
  );
}

function CalculatorPage() {
  const catalogState = useCatalog();
  const { catalog, phase } = catalogState;
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selection, setSelection] = useState({ selectedModelIds: [] as string[], modelMixBasisPoints: {} as Record<string, number> });
  const [inputShareBasisPoints, setInputShareBasisPoints] = useState(5_000);
  const [monthlyTokens, setMonthlyTokens] = useState(10_000_000);
  const appliedSharedStateRef = useRef(false);
  const hydratedSharedStateRef = useRef(false);
  const skipSharedStateReconciliationRef = useRef(false);
  const selectedPreset = selectedWorkloadPreset(inputShareBasisPoints, monthlyTokens);

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
    setInputShareBasisPoints(decoded.state.inputShareBasisPoints);
    setMonthlyTokens(decoded.state.monthlyTokens);

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
    const providerWithModels = providerIds.find((providerId) => catalog.modelOffers.some((offer) => offer.providerId === providerId));
    const nextProvider = selectedProviderId && providerIds.includes(selectedProviderId) ? selectedProviderId : providerWithModels ?? providerIds[0];
    if (nextProvider !== selectedProviderId) setSelectedProviderId(nextProvider);
    const providerPlans = paidIndividualPlans(catalog.plans, nextProvider);
    const planStillAvailable = providerPlans.some((plan) => plan.id === selectedPlanId);
    if (selectedPlanId && !planStillAvailable) setSelectedPlanId(providerPlans[0]?.id ?? '');
    if (!selectedPlanId && !hydratedSharedStateRef.current) setSelectedPlanId(providerPlans[0]?.id ?? '');
    const providerModels = catalog.modelOffers.filter((offer) => offer.providerId === nextProvider);
    const availableModelIds = new Set(providerModels.map((offer) => offer.id));
    const retainedIds = selection.selectedModelIds.filter((id) => availableModelIds.has(id));
    if (nextProvider !== selectedProviderId || retainedIds.length === 0 && providerModels.length > 0) {
      setSelection(createInitialSelection(providerModels));
    } else if (retainedIds.length !== selection.selectedModelIds.length) {
      setSelection(createInitialSelection(providerModels.filter((offer) => retainedIds.includes(offer.id))));
    }
  }, [catalog, providerIds, selectedPlanId, selectedProviderId, selection.selectedModelIds]);

  const selectedPlan = catalog ? selectedPlanForProvider(catalog.plans, selectedProviderId, selectedPlanId) : undefined;
  const providerModels = catalog?.modelOffers.filter((offer) => offer.providerId === selectedProviderId) ?? [];
  const snapshot = useMemo(() => buildCalculatorSnapshot({
    modelOffers: providerModels,
    selectedModelIds: selection.selectedModelIds,
    modelMixBasisPoints: selection.modelMixBasisPoints,
    inputShareBasisPoints,
    monthlyTokens,
    selectedPlan,
  }), [inputShareBasisPoints, monthlyTokens, providerModels, selectedPlan, selection.modelMixBasisPoints, selection.selectedModelIds]);
  const recommendation = recommendationForResult(selectedPlan, snapshot);
  const canShare = selectedProviderId.length > 0
    && selection.selectedModelIds.length > 0
    && selection.selectedModelIds.reduce((total, modelId) => total + (selection.modelMixBasisPoints[modelId] ?? 0), 0) === 10_000
    && monthlyTokens > 0;
  const shareState = {
    providerId: selectedProviderId,
    planId: selectedPlanId,
    selectedModelIds: selection.selectedModelIds,
    modelMixBasisPoints: selection.modelMixBasisPoints,
    inputShareBasisPoints,
    monthlyTokens,
  };

  const handleProviderChange = (providerId: string) => {
    if (!catalog) return;
    setSelectedProviderId(providerId);
    const plans = paidIndividualPlans(catalog.plans, providerId);
    setSelectedPlanId(plans[0]?.id ?? '');
    setSelection(createInitialSelection(catalog.modelOffers.filter((offer) => offer.providerId === providerId)));
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

  const handlePresetChange = (preset: WorkloadPreset) => {
    const values = applyWorkloadPreset(preset);
    setInputShareBasisPoints(values.inputShareBasisPoints);
    setMonthlyTokens(values.monthlyTokens);
  };

  const focusResult = () => document.getElementById('calculator-result')?.focus();

  return (
    <PageFrame activePage="calculator" skipLinkTarget="calculator" skipLinkLabel="Skip to calculator" catalogState={catalogState}>
      <section id="calculator" className="content-stack calculator-page" aria-labelledby="calculator-heading" tabIndex={-1}>
        <header className="calculator-intro">
          <h1 id="calculator-heading">Should you subscribe or pay as you go?</h1>
          <p>Estimate the API-equivalent value of an AI subscription using the models, token volume, and input/output mix that match your workload.</p>
        </header>
        <details className="calculator-step-overview" open>
          <summary>Four steps to a useful comparison</summary>
          <ol>
            <li><a href="#calculator-provider-plan">Provider and plan</a></li>
            <li><a href="#calculator-models">Models you actually use</a></li>
            <li><a href="#calculator-workload">Monthly workload</a></li>
            <li><a href="#calculator-result">Recommendation</a></li>
          </ol>
        </details>
        {!catalog ? <div className="calculator-loading-steps" aria-label="Calculator steps">
          <header className="calculator-step-heading"><span>Step 1</span><h2>Choose a provider and plan</h2></header>
          <header className="calculator-step-heading"><span>Step 2</span><h2>Choose the models you actually use</h2></header>
          <header className="calculator-step-heading"><span>Step 3</span><h2>Describe your monthly workload</h2></header>
          <header className="calculator-step-heading"><span>Step 4</span><h2>Review the recommendation</h2></header>
        </div> : null}
        {phase === 'loading' && !catalog ? <Skeleton label="Loading verified catalog" /> : null}
        {catalog ? <>
          <div className="calculator-guided-layout">
            <CalculatorControls catalog={catalog} providerIds={providerIds} selectedProviderId={selectedProviderId} selectedPlanId={selectedPlanId} selectedModelIds={selection.selectedModelIds} modelMixBasisPoints={selection.modelMixBasisPoints} inputShareBasisPoints={inputShareBasisPoints} monthlyTokens={monthlyTokens} selectedPreset={selectedPreset} onProviderChange={handleProviderChange} onPlanChange={setSelectedPlanId} onModelToggle={handleModelToggle} onModelShareChange={handleModelShareChange} onInputShareChange={setInputShareBasisPoints} onMonthlyTokensChange={(value) => setMonthlyTokens(Math.max(0, Number.isFinite(value) ? value : 0))} onPresetChange={handlePresetChange} />
            <div className="calculator-guided-results">
              <ResultsDashboard selectedPlan={selectedPlan} snapshot={snapshot} hasAvailableModels={providerModels.length > 0} />
              {canShare ? <ShareAction label="Share result" title="TokenBench subscription vs API result" text={recommendation} url={`${location.origin}${ROUTE_PATHS.calculator}?${encodeCalculatorShareState(shareState)}`} /> : null}
            </div>
          </div>
          <Comparison catalog={catalog} selectedProviderId={selectedProviderId} selectedModelIds={selection.selectedModelIds} selectedPlanId={selectedPlanId} />
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

/** Shared by the Pages Function SSR response and browser hydration. */
export function ComparisonDetailApp({ viewModel }: { readonly viewModel: ComparisonViewModel }) {
  return <PageFrame activePage="compare"><ComparisonPage viewModel={viewModel} /></PageFrame>;
}

export default function App() {
  const route = matchRoute(window.location.pathname);

  if (route.kind === 'home') return <HomeRoute />;
  if (route.kind === 'tools') return <ToolsRoute />;
  if (route.kind === 'calculator') return <CalculatorPage />;
  if (route.kind === 'methodologyBenchAlign') return <BenchAlignMethodologyRoute />;
  if (route.kind === 'compareHub') return <CompareHubRoute />;
  if (route.kind === 'leaderboards') return <LeaderboardsRoute />;
  if (route.kind === 'leaderboard') return <LeaderboardRoute keyName={route.key} />;
  if (route.kind === 'redirect') {
    window.location.replace(route.to);
    return null;
  }
  return null;
}
