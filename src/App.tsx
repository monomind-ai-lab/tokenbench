import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { redistributeModelMix } from './catalog/calculator';
import { CalculatorControls } from './frontend/calculator-controls';
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
import { ResultsDashboard, selectedPlanForProvider } from './frontend/results-dashboard';
import { useSitePreferences } from './frontend/site-preferences';
import { ComparisonPage } from './frontend/comparison-page';
import type { ComparisonViewModel } from './frontend/comparison-contracts';
import { Skeleton, providerLabel } from './frontend/ui';
import { useCatalog, type CatalogState } from './frontend/use-catalog';
import { HomePage } from './pages/home-page';
import { CompareHubPage } from './pages/compare-hub-page';
import { LeaderboardDirectoryPage, LeaderboardPage } from './pages/leaderboards-page';
import { ToolsPage } from './pages/tools-page';
import { matchRoute, type LeaderboardKey } from './routing/routes';
import type { WorkloadPreset } from './frontend/calculator-state';

type ActivePage = 'home' | 'tools' | 'compare' | 'leaderboards' | 'guides';

interface PageFrameProps {
  readonly children: ReactNode;
  readonly activePage: ActivePage;
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
  const selectedPreset = selectedWorkloadPreset(inputShareBasisPoints, monthlyTokens);

  const providerIds = useMemo(() => {
    if (!catalog) return [];
    const paidProviderIds = paidIndividualPlans(catalog.plans).map((plan) => plan.providerId);
    const apiOnlyProviderIds = API_ONLY_PROVIDER_IDS.filter((providerId) => catalog.modelOffers.some((offer) => offer.providerId === providerId));
    return Array.from(new Set([...paidProviderIds, ...apiOnlyProviderIds]))
      .sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [catalog]);

  useEffect(() => {
    if (!catalog || providerIds.length === 0) return;
    const providerWithModels = providerIds.find((providerId) => catalog.modelOffers.some((offer) => offer.providerId === providerId));
    const nextProvider = selectedProviderId && providerIds.includes(selectedProviderId) ? selectedProviderId : providerWithModels ?? providerIds[0];
    if (nextProvider !== selectedProviderId) setSelectedProviderId(nextProvider);
    const providerPlans = paidIndividualPlans(catalog.plans, nextProvider);
    const planStillAvailable = providerPlans.some((plan) => plan.id === selectedPlanId);
    if (!planStillAvailable) setSelectedPlanId(providerPlans[0]?.id ?? '');
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

  return (
    <PageFrame activePage="tools" skipLinkTarget="calculator" skipLinkLabel="Skip to calculator" catalogState={catalogState}>
      <section className="content-stack calculator-page" aria-labelledby="calculator-heading">
        <h1 id="calculator-heading" className="sr-only">Subscription vs. API cost calculator</h1>
        {phase === 'loading' && !catalog ? <Skeleton label="Loading verified catalog" /> : null}
        {catalog ? <>
          <CalculatorControls catalog={catalog} providerIds={providerIds} selectedProviderId={selectedProviderId} selectedPlanId={selectedPlanId} selectedModelIds={selection.selectedModelIds} modelMixBasisPoints={selection.modelMixBasisPoints} inputShareBasisPoints={inputShareBasisPoints} monthlyTokens={monthlyTokens} selectedPreset={selectedPreset} onProviderChange={handleProviderChange} onPlanChange={setSelectedPlanId} onModelToggle={handleModelToggle} onModelShareChange={handleModelShareChange} onInputShareChange={setInputShareBasisPoints} onMonthlyTokensChange={(value) => setMonthlyTokens(Math.max(0, Number.isFinite(value) ? value : 0))} onPresetChange={handlePresetChange} />
          <ResultsDashboard selectedPlan={selectedPlan} snapshot={snapshot} />
          <Comparison catalog={catalog} selectedProviderId={selectedProviderId} selectedModelIds={selection.selectedModelIds} selectedPlanId={selectedPlanId} />
        </> : null}
      </section>
    </PageFrame>
  );
}

function HomeRoute() {
  return <PageFrame activePage="home"><HomePage /></PageFrame>;
}

function ToolsRoute() {
  return <PageFrame activePage="tools"><ToolsPage /></PageFrame>;
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
  if (route.kind === 'compareHub') return <CompareHubRoute />;
  if (route.kind === 'leaderboards') return <LeaderboardsRoute />;
  if (route.kind === 'leaderboard') return <LeaderboardRoute keyName={route.key} />;
  return null;
}
