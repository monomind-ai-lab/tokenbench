import { useEffect, useMemo, useState } from 'react';
import { redistributeModelMix } from './catalog/calculator';
import { CalculatorControls } from './frontend/calculator-controls';
import {
  applyWorkloadPreset,
  buildCalculatorSnapshot,
  createInitialSelection,
  toggleModelSelection,
} from './frontend/calculator-state';
import { Comparison } from './frontend/comparison';
import { AppShell } from './frontend/app-shell';
import { Recommendation } from './frontend/recommendation';
import { ResultsDashboard, selectedOffersForProvider, selectedPlanForProvider } from './frontend/results-dashboard';
import { Skeleton } from './frontend/ui';
import { useCatalog } from './frontend/use-catalog';
import type { WorkloadPreset } from './frontend/calculator-state';
import { providerLabel } from './frontend/ui';

type ThemeMode = 'light' | 'dark';

function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem('ai-cost-engine:theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readLanguage(): string {
  const match = document.cookie.split('; ').find((cookie) => cookie.startsWith('googtrans='));
  return match?.split('=')[1]?.split('/').at(-1) || 'en';
}

export default function App() {
  const catalogState = useCatalog();
  const { catalog, phase, notice, error, lastSuccessfulRefreshAt, retry } = catalogState;
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [language, setLanguage] = useState(readLanguage);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selection, setSelection] = useState({ selectedModelIds: [] as string[], modelMixBasisPoints: {} as Record<string, number> });
  const [inputShareBasisPoints, setInputShareBasisPoints] = useState(5_000);
  const [monthlyTokens, setMonthlyTokens] = useState(10_000_000);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('ai-cost-engine:theme', theme); } catch { /* Theme persistence is best effort. */ }
  }, [theme]);

  const providerIds = useMemo(() => {
    if (!catalog) return [];
    return Array.from(new Set([...catalog.plans.map((plan) => plan.providerId), ...catalog.modelOffers.map((offer) => offer.providerId)]))
      .sort((a, b) => providerLabel(a).localeCompare(providerLabel(b)));
  }, [catalog]);

  useEffect(() => {
    if (!catalog || providerIds.length === 0) return;
    const providerWithModels = providerIds.find((providerId) => catalog.modelOffers.some((offer) => offer.providerId === providerId));
    const nextProvider = selectedProviderId && providerIds.includes(selectedProviderId) ? selectedProviderId : providerWithModels ?? providerIds[0];
    if (nextProvider !== selectedProviderId) setSelectedProviderId(nextProvider);
    const providerPlans = catalog.plans.filter((plan) => plan.providerId === nextProvider);
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
  const selectedModelOffers = catalog ? selectedOffersForProvider(catalog.modelOffers, selectedProviderId, selection.selectedModelIds) : [];
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
    const plans = catalog.plans.filter((plan) => plan.providerId === providerId);
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

  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage;
    document.cookie = `googtrans=/en/${nextLanguage}; path=/;`;
    const translateSelect = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;
    if (translateSelect) {
      translateSelect.value = nextLanguage;
      translateSelect.dispatchEvent(new Event('change'));
    }
  };

  return (
    <AppShell theme={theme} language={language} onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} onLanguageChange={handleLanguageChange} catalogPhase={phase} notice={notice} error={error} lastSuccessfulRefreshAt={lastSuccessfulRefreshAt} onRetry={retry}>
      {phase === 'loading' && !catalog ? <Skeleton label="Loading verified catalog" /> : null}
      {catalog ? <div className="content-stack">
        <section className="intro-panel"><div><p className="eyebrow">Current catalog · {catalog.revision}</p><h2>Model plan value, derived from evidence.</h2><p>Estimate API-equivalent value and break-even volume for the workload you actually expect. Subscription limits stay conditional when providers do not publish fixed token caps.</p></div><div className="intro-meta"><span className={`freshness-chip freshness-${catalog.freshness.status}`}>{catalog.freshness.status}</span><span>{catalog.freshness.message ?? 'Catalog source records are available.'}</span></div></section>
        <CalculatorControls catalog={catalog} providerIds={providerIds} selectedProviderId={selectedProviderId} selectedPlanId={selectedPlanId} selectedModelIds={selection.selectedModelIds} modelMixBasisPoints={selection.modelMixBasisPoints} inputShareBasisPoints={inputShareBasisPoints} monthlyTokens={monthlyTokens} onProviderChange={handleProviderChange} onPlanChange={setSelectedPlanId} onModelToggle={handleModelToggle} onModelShareChange={handleModelShareChange} onInputShareChange={setInputShareBasisPoints} onMonthlyTokensChange={(value) => setMonthlyTokens(Math.max(0, Number.isFinite(value) ? value : 0))} onPresetChange={handlePresetChange} />
        <ResultsDashboard catalog={catalog} selectedProviderId={selectedProviderId} selectedPlan={selectedPlan} selectedModelOffers={selectedModelOffers} snapshot={snapshot} />
        <div id="comparison" className="analysis-stack"><Comparison catalog={catalog} selectedProviderId={selectedProviderId} /><Recommendation catalog={catalog} providerId={selectedProviderId} /></div>
      </div> : null}
    </AppShell>
  );
}
