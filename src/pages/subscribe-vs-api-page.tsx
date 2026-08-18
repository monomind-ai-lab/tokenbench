import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { ConversationWorkload, CrossoverDomainPoint } from '../catalog/subscription-api-calculator';
import { CrossoverChart } from '../frontend/crossover-chart';
import { encodeCalculatorShareState, type CalculatorShareState } from '../frontend/calculator-share-state';
import { fixtureAdapter } from '../frontend/preview-data/adapter';
import type { CachePricing, EvidenceValue, PreviewDataAdapter, PreviewModel, RoutePricing, SubscriptionCalculation, SubscriptionData, SubscriptionPlan, SubscriptionQuery, UiDataContractV1 } from '../frontend/preview-data/contracts';
import type { PreviewPageProps } from '../preview/route-types';

const DEFAULT_WORKLOAD: ConversationWorkload = {
  conversationsPerDay: 5,
  messagesPerConversation: 8,
  inputTokensPerMessage: 1_200,
  outputTokensPerMessage: 350,
  activeDaysPerMonth: 22,
};

interface CharacterEstimate {
  readonly contentType: 'text' | 'code';
  readonly inputCharactersPerMessage: number;
  readonly outputCharactersPerMessage: number;
}

interface SubscribeVsApiState {
  readonly providerId: string;
  readonly planId: string;
  readonly selectedModelIds: readonly string[];
  readonly modelMixBasisPoints: Readonly<Record<string, number>>;
  readonly workload: ConversationWorkload;
  readonly cacheReadShareBasisPoints: number;
  readonly cacheWriteShareBasisPoints: number;
  readonly longContext: boolean;
  readonly characterEstimate: CharacterEstimate;
  readonly seats: number;
  readonly tokenVolume: number;
}

type ActionState = { readonly tone: 'info' | 'error'; readonly message: string } | null;

interface SubscribeVsApiPageProps extends PreviewPageProps {
  readonly adapter?: PreviewDataAdapter;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isEvidenceValue<T>(value: unknown, isAvailable: (candidate: unknown) => candidate is T): value is EvidenceValue<T> {
  return isRecord(value)
    && (value.availability === 'unavailable' && typeof value.reason === 'string'
      || value.availability === 'available' && isAvailable(value.value));
}

function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return isRecord(value)
    && typeof value.id === 'string'
    && isEvidenceValue(value.provider, (candidate): candidate is string => typeof candidate === 'string')
    && isEvidenceValue(value.displayName, (candidate): candidate is string => typeof candidate === 'string')
    && isEvidenceValue(value.monthlyUsd, (candidate): candidate is number => typeof candidate === 'number')
    && isEvidenceValue(value.includedUsage, (candidate): candidate is string => typeof candidate === 'string');
}

function isCachePricing(value: unknown): value is CachePricing {
  return isRecord(value)
    && isEvidenceValue(value.readUsdPerMillion, (candidate): candidate is number => typeof candidate === 'number')
    && isEvidenceValue(value.writeUsdPerMillion, (candidate): candidate is number => typeof candidate === 'number');
}

function isRoutePricing(value: unknown): value is RoutePricing {
  return isRecord(value)
    && typeof value.route === 'string'
    && typeof value.inputUsdPerMillion === 'number'
    && typeof value.outputUsdPerMillion === 'number'
    && (value.longContextInputUsdPerMillion === undefined
      || isEvidenceValue(value.longContextInputUsdPerMillion, (candidate): candidate is number => typeof candidate === 'number'))
    && isEvidenceValue(value.cache, isCachePricing);
}

function isPreviewModel(value: unknown): value is PreviewModel {
  return isRecord(value)
    && typeof value.id === 'string'
    && isEvidenceValue(value.identity, (candidate): candidate is { readonly name: string; readonly provider: string } => isRecord(candidate) && typeof candidate.name === 'string' && typeof candidate.provider === 'string')
    && isEvidenceValue(value.routePricing, isRoutePricing);
}

function isSubscriptionCalculation(value: unknown): value is SubscriptionCalculation {
  return isRecord(value)
    && isRecord(value.request)
    && typeof value.request.planId === 'string'
    && typeof value.request.seats === 'number'
    && Array.isArray(value.request.modelMix)
    && isRecord(value.request.workload)
    && typeof value.request.cacheReadShareBasisPoints === 'number'
    && typeof value.request.cacheWriteShareBasisPoints === 'number'
    && typeof value.request.crossoverTokenVolume === 'number'
    && typeof value.monthlySubscriptionUsd === 'number'
    && typeof value.selectedVolumeApiUsd === 'number'
    && (value.crossoverTokens === null || typeof value.crossoverTokens === 'number')
    && Array.isArray(value.domain)
    && Array.isArray(value.lineItems);
}

export function parseSubscribeVsApiPageData(value: unknown): UiDataContractV1<SubscriptionData> | null {
  if (!isRecord(value)
    || value.contractVersion !== 'ui-data-contract/v1'
    || (value.status !== 'available' && value.status !== 'partial' && value.status !== 'unavailable')
    || typeof value.fetchedAt !== 'string'
    || (value.effectiveAt !== null && typeof value.effectiveAt !== 'string')
    || !Array.isArray(value.provenance)) return null;
  if (value.data === null) return value as unknown as UiDataContractV1<SubscriptionData>;
  if (!isRecord(value.data)
    || !Array.isArray(value.data.plans)
    || !Array.isArray(value.data.models)
    || !value.data.plans.every(isSubscriptionPlan)
    || !value.data.models.every(isPreviewModel)
    || !isEvidenceValue(value.data.calculation, isSubscriptionCalculation)) return null;
  return value as unknown as UiDataContractV1<SubscriptionData>;
}

function providerId(plan: SubscriptionPlan): string {
  return plan.provider.availability === 'available'
    ? plan.provider.value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '-')
    : 'unavailable-provider';
}

function planLabel(plan: SubscriptionPlan): string {
  return plan.displayName.availability === 'available' ? plan.displayName.value : 'Plan name unavailable';
}

function planProviderLabel(plan: SubscriptionPlan): string {
  return plan.provider.availability === 'available' ? plan.provider.value : 'Provider unavailable';
}

function planPrice(plan: SubscriptionPlan): number | null {
  return plan.monthlyUsd.availability === 'available' && Number.isFinite(plan.monthlyUsd.value) && plan.monthlyUsd.value >= 0
    ? plan.monthlyUsd.value
    : null;
}

function modelName(model: PreviewModel): string {
  return model.identity.availability === 'available' ? model.identity.value.name : model.id;
}

function modelPricing(model: PreviewModel): RoutePricing | null {
  return model.routePricing.availability === 'available' ? model.routePricing.value : null;
}

function evenMix(ids: readonly string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const share = Math.floor(10_000 / ids.length);
  return Object.fromEntries(ids.map((id, index) => [id, share + (index === ids.length - 1 ? 10_000 - share * ids.length : 0)]));
}

function positiveInteger(value: string | null, minimum: number, maximum: number, fallback: number): number {
  if (!value || !/^(?:0|[1-9]\d*)$/u.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function parseModelSelection(search: URLSearchParams, models: readonly PreviewModel[], fallback: readonly string[] = []): readonly string[] {
  const available = new Set(models.filter((model) => modelPricing(model)).map((model) => model.id));
  const requested = search.get('models')?.split(',').filter(Boolean) ?? [];
  const selected = [...new Set(requested.filter((id) => available.has(id)))];
  const retained = fallback.filter((id) => available.has(id));
  return selected.length > 0 ? selected : retained.length > 0 ? retained : models.filter((model) => modelPricing(model)).slice(0, 1).map((model) => model.id);
}

function initialState(data: SubscriptionData, search: URLSearchParams): SubscribeVsApiState {
  const calculation = data.calculation.availability === 'available' ? data.calculation.value : null;
  const retainedRequest = calculation?.request;
  const availablePlans = data.plans.filter((plan) => planPrice(plan) !== null);
  const firstPlan = availablePlans[0];
  const planId = availablePlans.some((plan) => plan.id === search.get('plan'))
    ? search.get('plan')!
    : availablePlans.some((plan) => plan.id === retainedRequest?.planId)
      ? retainedRequest!.planId
      : firstPlan?.id ?? '';
  const selectedPlan = availablePlans.find((plan) => plan.id === planId) ?? firstPlan;
  const selectedModelIds = parseModelSelection(search, data.models, retainedRequest?.modelMix.map((model) => model.modelSlug));
  const encodedWeights = search.get('weights')?.split(',').map((value) => positiveInteger(value, 0, 10_000, -1)) ?? [];
  const weightsAreComplete = encodedWeights.length === selectedModelIds.length
    && encodedWeights.every((weight) => weight >= 0)
    && encodedWeights.reduce((total, weight) => total + weight, 0) === 10_000;
  const retainedWeights = Object.fromEntries((retainedRequest?.modelMix ?? []).map((model) => [model.modelSlug, model.shareBasisPoints]));
  const retainedWeightsAreComplete = selectedModelIds.length > 0
    && selectedModelIds.every((id) => typeof retainedWeights[id] === 'number')
    && selectedModelIds.reduce((total, id) => total + retainedWeights[id]!, 0) === 10_000;
  const modelMixBasisPoints = weightsAreComplete
    ? Object.fromEntries(selectedModelIds.map((id, index) => [id, encodedWeights[index]!]))
    : retainedWeightsAreComplete ? retainedWeights : evenMix(selectedModelIds);
  const contentType = search.get('contentType') === 'code' ? 'code' : 'text';
  const cacheWriteShareBasisPoints = positiveInteger(search.get('cacheWriteShare'), 0, 100, (retainedRequest?.cacheWriteShareBasisPoints ?? 500) / 100) * 100;
  const cacheReadShareBasisPoints = Math.min(
    10_000 - cacheWriteShareBasisPoints,
    positiveInteger(search.get('cacheReadShare'), 0, 100, (retainedRequest?.cacheReadShareBasisPoints ?? 2000) / 100) * 100,
  );
  return {
    providerId: selectedPlan ? providerId(selectedPlan) : '',
    planId,
    selectedModelIds,
    modelMixBasisPoints,
    workload: {
      conversationsPerDay: positiveInteger(search.get('c'), 0, 10_000, retainedRequest?.workload.conversationsPerDay ?? DEFAULT_WORKLOAD.conversationsPerDay),
      messagesPerConversation: positiveInteger(search.get('m'), 0, 1_000, retainedRequest?.workload.messagesPerConversation ?? DEFAULT_WORKLOAD.messagesPerConversation),
      inputTokensPerMessage: positiveInteger(search.get('i'), 0, 1_000_000, retainedRequest?.workload.inputTokensPerMessage ?? DEFAULT_WORKLOAD.inputTokensPerMessage),
      outputTokensPerMessage: positiveInteger(search.get('o'), 0, 1_000_000, retainedRequest?.workload.outputTokensPerMessage ?? DEFAULT_WORKLOAD.outputTokensPerMessage),
      activeDaysPerMonth: positiveInteger(search.get('d'), 0, 31, retainedRequest?.workload.activeDaysPerMonth ?? DEFAULT_WORKLOAD.activeDaysPerMonth),
    },
    cacheReadShareBasisPoints,
    cacheWriteShareBasisPoints,
    longContext: search.get('longContext') === '1',
    characterEstimate: {
      contentType,
      inputCharactersPerMessage: positiveInteger(search.get('inputCharactersPerMessage'), 0, 4_000_000, 4_800),
      outputCharactersPerMessage: positiveInteger(search.get('outputCharactersPerMessage'), 0, 4_000_000, 1_400),
    },
    seats: positiveInteger(search.get('seats'), 1, 50, retainedRequest?.seats ?? 1),
    tokenVolume: positiveInteger(search.get('tokenVolume'), 0, 300_000_000, retainedRequest?.crossoverTokenVolume ?? 0),
  };
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(tokens / 1_000)}K`;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(tokens);
}

function sourceUsd(value: EvidenceValue<number>, fallback: number): { readonly value: number; readonly label: string; readonly status: string } {
  return value.availability === 'available'
    ? { value: value.value, label: formatUsd(value.value), status: 'Published source rate' }
    : { value: fallback, label: 'Unavailable; standard input used in scenario', status: `Unavailable: ${value.reason}` };
}

function unavailablePriceEvidence(reason: string): EvidenceValue<number> {
  return { availability: 'unavailable', reason };
}

function cacheReadEvidence(pricing: RoutePricing): EvidenceValue<number> {
  return pricing.cache.availability === 'available'
    ? pricing.cache.value.readUsdPerMillion
    : unavailablePriceEvidence(pricing.cache.reason);
}

function cacheWriteEvidence(pricing: RoutePricing): EvidenceValue<number> {
  return pricing.cache.availability === 'available'
    ? pricing.cache.value.writeUsdPerMillion
    : unavailablePriceEvidence(pricing.cache.reason);
}

function longContextEvidence(pricing: RoutePricing): EvidenceValue<number> {
  return pricing.longContextInputUsdPerMillion
    ?? unavailablePriceEvidence('No approved long-context price source');
}

function calculationQuery(
  data: SubscriptionData,
  state: SubscribeVsApiState,
): SubscriptionQuery | null {
  const retainedRequest = data.calculation.availability === 'available' ? data.calculation.value.request : null;
  const retainedMix = new Map((retainedRequest?.modelMix ?? []).map((model) => [model.modelSlug, model]));
  const modelMix = state.selectedModelIds.flatMap((modelId) => {
    const model = data.models.find((candidate) => candidate.id === modelId);
    const pricing = model === undefined ? null : modelPricing(model);
    if (pricing === null) return [];
    const retained = retainedMix.get(modelId);
    return [{
      modelSlug: modelId,
      routeId: pricing.route,
      pricingTierId: retained?.pricingTierId ?? null,
      shareBasisPoints: state.modelMixBasisPoints[modelId] ?? 0,
      tierContextTokens: retained?.tierContextTokens ?? 0,
    }];
  });
  if (state.planId.length === 0 || modelMix.length === 0 || modelMix.reduce((total, model) => total + model.shareBasisPoints, 0) !== 10_000) return null;
  return {
    operation: 'calculate',
    planId: state.planId,
    seats: state.seats,
    modelMix,
    workload: {
      ...state.workload,
      inputTokensPerMessage: state.longContext ? Math.round(state.workload.inputTokensPerMessage * 1.5) : state.workload.inputTokensPerMessage,
    },
    cacheReadShareBasisPoints: state.cacheReadShareBasisPoints,
    cacheWriteShareBasisPoints: state.cacheWriteShareBasisPoints,
    crossoverTokenVolume: state.tokenVolume,
  };
}

function shareState(state: SubscribeVsApiState): CalculatorShareState {
  return {
    providerId: state.providerId,
    planId: state.planId,
    workload: state.workload,
    selectedModelIds: state.selectedModelIds,
    modelMixBasisPoints: state.modelMixBasisPoints,
    mappingMode: 'override',
    cacheReadShareBasisPoints: state.cacheReadShareBasisPoints,
    cacheWriteShareBasisPoints: state.cacheWriteShareBasisPoints,
    longContext: state.longContext,
    characterEstimate: state.characterEstimate,
    seats: state.seats,
    tokenVolume: state.tokenVolume,
  };
}

function shareUrl(state: SubscribeVsApiState): string {
  if (typeof window === 'undefined') return `/subscribe-vs-api?${encodeCalculatorShareState(shareState(state))}`;
  const url = new URL(window.location.href);
  url.search = encodeCalculatorShareState(shareState(state)).toString();
  return url.href;
}

function lowerCost(point: CrossoverDomainPoint): string {
  if (point.apiUsd < point.monthlySubscriptionUsd) return 'API';
  if (point.apiUsd > point.monthlySubscriptionUsd) return 'Monthly subscription';
  return 'Equal';
}

function csvCell(value: string): string {
  const formulaSafe = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\n\r]/u.test(formulaSafe) ? `"${formulaSafe.replaceAll('"', '""')}"` : formulaSafe;
}

function crossoverCsv(result: SubscriptionCalculation): string {
  return [
    ['Monthly tokens', 'Monthly subscription (USD)', 'API usage (USD)', 'Lower cost'],
    ...result.domain.map((point) => [String(point.tokens), point.monthlySubscriptionUsd.toFixed(6), point.apiUsd.toFixed(6), lowerCost(point)]),
  ].map((row) => row.map(csvCell).join(',')).join('\n');
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function copyScenarioLink(url: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const field = document.createElement('textarea');
  field.value = url;
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Clipboard access is unavailable');
}

function SourcePriceRows({ selected }: { readonly selected: readonly { readonly model: PreviewModel; readonly shareBasisPoints: number }[] }) {
  return <tbody>{selected.flatMap(({ model, shareBasisPoints }) => {
    const pricing = modelPricing(model)!;
    const read = sourceUsd(cacheReadEvidence(pricing), pricing.inputUsdPerMillion);
    const write = sourceUsd(cacheWriteEvidence(pricing), pricing.inputUsdPerMillion);
    const longContext = sourceUsd(longContextEvidence(pricing), pricing.inputUsdPerMillion);
    return [
      ['Standard input', formatUsd(pricing.inputUsdPerMillion), 'Published source rate'],
      ['Cache read', read.label, read.status],
      ['Cache write', write.label, write.status],
      ['Long-context input', longContext.label, longContext.status],
      ['Output', formatUsd(pricing.outputUsdPerMillion), 'Published source rate'],
    ].map(([component, rate, status]) => <tr key={`${model.id}-${component}`}><th scope="row">{modelName(model)} <span className="fixture">{shareBasisPoints / 100}% mix</span></th><td>{component}</td><td>{rate}</td><td>{status}</td></tr>);
  })}</tbody>;
}

function EvidenceDetail({ label, value }: { readonly key?: string; readonly label: string; readonly value: EvidenceValue<unknown> }) {
  const provenance = value.provenance;
  return <div><dt>{label}</dt><dd>{value.availability === 'available' ? 'Available' : `Unavailable: ${value.reason}`}{provenance ? <><span> — </span><strong>{provenance.label}</strong><span> · </span><time dateTime={provenance.effectiveAt}>{provenance.effectiveAt}</time><span> · </span><span>{provenance.note}</span></> : null}</dd></div>;
}

function SourceProvenance({ plan, selected }: { readonly plan: SubscriptionPlan | undefined; readonly selected: readonly { readonly model: PreviewModel; readonly shareBasisPoints: number }[] }) {
  const entries = [
    ...(plan ? [{ label: `${planLabel(plan)} monthly subscription`, value: plan.monthlyUsd as EvidenceValue<unknown> }] : []),
    ...selected.flatMap(({ model }) => {
      const pricing = modelPricing(model)!;
      return [
        { label: `${modelName(model)} route pricing`, value: model.routePricing as EvidenceValue<unknown> },
        { label: `${modelName(model)} cache write`, value: cacheWriteEvidence(pricing) as EvidenceValue<unknown> },
        { label: `${modelName(model)} long-context input`, value: longContextEvidence(pricing) as EvidenceValue<unknown> },
      ];
    }),
  ];
  return <section className="panel subscribe-provenance" aria-labelledby="subscription-provenance-heading">
    <div className="toolbar"><div><h2 id="subscription-provenance-heading">Source provenance</h2><p className="fixture">Source label, note, effective time, and unavailable reason remain distinct from the derived scenario.</p></div></div>
    <dl>{entries.map((entry) => <EvidenceDetail key={entry.label} label={entry.label} value={entry.value} />)}</dl>
  </section>;
}

export function SubscribeVsApiPage({ match, data, adapter = fixtureAdapter }: SubscribeVsApiPageProps) {
  const staticContract = parseSubscribeVsApiPageData(data);
  const staticData = staticContract?.data ?? null;
  const [catalogContract, setCatalogContract] = useState<UiDataContractV1<SubscriptionData> | null>(null);
  const [calculationContract, setCalculationContract] = useState<UiDataContractV1<SubscriptionData> | null>(staticData === null ? null : staticContract);
  const [state, setState] = useState<SubscribeVsApiState>(() => initialState(staticData ?? {
    plans: [],
    models: [],
    selectedModelTaskEconomics: { availability: 'unavailable', reason: 'No subscription source data' },
    calculation: { availability: 'unavailable', reason: 'No subscription calculation is available.' },
  }, match.search));
  const [actionState, setActionState] = useState<ActionState>(null);
  const exportRef = useRef<HTMLElement>(null);
  const pageData = staticData ?? catalogContract?.data ?? null;
  const plans = pageData?.plans.filter((plan) => planPrice(plan) !== null) ?? [];
  const models = pageData?.models.filter((model) => modelPricing(model) !== null) ?? [];
  const providerIds = [...new Set(plans.map(providerId))];
  const providerPlans = plans.filter((plan) => providerId(plan) === state.providerId);
  const selectedPlan = providerPlans.find((plan) => plan.id === state.planId) ?? plans.find((plan) => plan.id === state.planId);
  const selected = state.selectedModelIds.flatMap((id) => {
    const model = models.find((candidate) => candidate.id === id);
    return model ? [{ model, shareBasisPoints: state.modelMixBasisPoints[id] ?? 0 }] : [];
  });
  const calculation = calculationContract?.data?.calculation;
  const result = calculation?.availability === 'available' ? calculation.value : null;
  const calculationReason = calculationContract?.status === 'unavailable'
    ? calculationContract.reason
    : calculation?.availability === 'unavailable'
      ? calculation.reason
      : null;

  useEffect(() => {
    let active = true;
    void adapter.subscription({ operation: 'catalog' }).then((next) => {
      if (!active) return;
      setCatalogContract(next);
      if (staticData === null && next.data !== null) setState(initialState(next.data, match.search));
    });
    return () => { active = false; };
  }, [adapter, match.search, staticData]);

  useEffect(() => {
    if (match.search.toString().length === 0 || pageData === null) return;
    const query = calculationQuery(pageData, state);
    if (query === null) return;
    let active = true;
    void adapter.subscription(query).then((next) => { if (active) setCalculationContract(next); });
    return () => { active = false; };
  }, [adapter, match.search, pageData, state]);

  const submitCalculation = (next: SubscribeVsApiState) => {
    if (pageData === null) return;
    const query = calculationQuery(pageData, next);
    if (query === null) {
      setActionState({ tone: 'error', message: 'Choose a source-priced plan and a complete model mix to calculate the crossover.' });
      return;
    }
    void adapter.subscription(query).then((response) => setCalculationContract(response));
  };

  const update = (next: SubscribeVsApiState) => {
    setState(next);
    if (typeof window !== 'undefined') window.history.replaceState(window.history.state, '', shareUrl(next));
    submitCalculation(next);
  };
  const updateWorkload = (key: keyof ConversationWorkload, value: number) => update({ ...state, workload: { ...state.workload, [key]: value } });
  const updateShare = (id: string, nextShare: number) => {
    const others = state.selectedModelIds.filter((modelId) => modelId !== id);
    if (others.length === 0) return;
    const bounded = Math.min(10_000, Math.max(0, Math.round(nextShare)));
    const remaining = 10_000 - bounded;
    const currentTotal = others.reduce((total, modelId) => total + (state.modelMixBasisPoints[modelId] ?? 0), 0);
    let assigned = 0;
    const modelMixBasisPoints: Record<string, number> = { [id]: bounded };
    others.forEach((modelId, index) => {
      const value = index === others.length - 1
        ? remaining - assigned
        : Math.round(remaining * ((state.modelMixBasisPoints[modelId] ?? 0) / Math.max(1, currentTotal)));
      modelMixBasisPoints[modelId] = value;
      assigned += value;
    });
    update({ ...state, modelMixBasisPoints });
  };
  const toggleModel = (id: string) => {
    const selectedModelIds = state.selectedModelIds.includes(id)
      ? state.selectedModelIds.filter((modelId) => modelId !== id)
      : [...state.selectedModelIds, id];
    if (selectedModelIds.length === 0) return;
    update({ ...state, selectedModelIds, modelMixBasisPoints: evenMix(selectedModelIds) });
  };
  const applyCharacterEstimate = () => {
    const charactersPerToken = state.characterEstimate.contentType === 'code' ? 3 : 4;
    update({
      ...state,
      workload: {
        ...state.workload,
        inputTokensPerMessage: Math.round(state.characterEstimate.inputCharactersPerMessage / charactersPerToken),
        outputTokensPerMessage: Math.round(state.characterEstimate.outputCharactersPerMessage / charactersPerToken),
      },
    });
    setActionState({ tone: 'info', message: 'Character estimate applied to the message-level token controls.' });
  };

  if (pageData === null) return <section className="content-stack subscribe-vs-api-page"><header className="calculator-intro"><h1>Should you subscribe or pay as you go?</h1></header><p role="alert">{catalogContract?.reason ?? staticContract?.reason ?? 'Subscription comparison data is unavailable.'}</p></section>;

  const calculatedAt = calculationContract?.fetchedAt ?? staticContract?.fetchedAt ?? catalogContract?.fetchedAt ?? 'time unavailable';
  const sourceEffectiveAt = calculationContract?.effectiveAt ?? staticContract?.effectiveAt ?? catalogContract?.effectiveAt ?? 'Mixed source effective times';
  return <div className="content-stack subscribe-vs-api-page">
    <header className="calculator-intro" aria-labelledby="subscribe-vs-api-heading">
      <span className="eyebrow">Subscription versus API analysis</span>
      <h1 id="subscribe-vs-api-heading">Should you subscribe or pay as you go?</h1>
      <p>Build a message-level workload, keep provider source rates separate from the derived estimate, then test the seat and token-volume crossover.</p>
    </header>
    <details className="calculator-step-overview" open>
      <summary>Four steps to a useful comparison</summary>
      <ol><li><a href="#subscription-provider-plan">Provider and plan</a></li><li><a href="#subscription-model-mix">Model mix</a></li><li><a href="#subscription-workload">Message workload</a></li><li><a href="#subscription-crossover">Crossover result</a></li></ol>
    </details>
    {staticContract?.status === 'partial' ? <p className="fixture" role="status">Illustrative prototype data may be partial; unavailable source facts remain labelled.</p> : null}
    {catalogContract?.status === 'unavailable' ? <p role="status">{catalogContract.reason}</p> : null}
    {actionState ? <p className={`subscription-action-status status-${actionState.tone}`} role={actionState.tone === 'error' ? 'alert' : 'status'}>{actionState.message}</p> : null}
    <section className="panel subscribe-controls" aria-label="Subscription versus API controls">
      <section id="subscription-provider-plan" className="subscribe-control-section" aria-labelledby="subscription-provider-heading">
        <div className="calculator-step-heading"><span>Step 1</span><h2 id="subscription-provider-heading">Choose a provider and plan</h2></div>
        <div className="subscribe-control-grid">
          <label>Provider<select aria-label="Subscription provider" value={state.providerId} onChange={(event) => {
            const nextProviderId = event.currentTarget.value;
            const nextPlan = plans.find((plan) => providerId(plan) === nextProviderId);
            if (nextPlan) update({ ...state, providerId: nextProviderId, planId: nextPlan.id });
          }}>{providerIds.map((id) => <option key={id} value={id}>{planProviderLabel(plans.find((plan) => providerId(plan) === id)!)}</option>)}</select></label>
          <label>Plan<select aria-label="Monthly subscription plan" value={state.planId} onChange={(event) => update({ ...state, planId: event.currentTarget.value })}>{providerPlans.map((plan) => <option key={plan.id} value={plan.id}>{planLabel(plan)} · {formatUsd(planPrice(plan))} / month</option>)}</select></label>
        </div>
      </section>
      <section id="subscription-model-mix" className="subscribe-control-section" aria-labelledby="subscription-model-heading">
        <div className="calculator-step-heading"><span>Step 2</span><h2 id="subscription-model-heading">Choose the models you actually use</h2></div>
        <p className="field-help">Each model retains its own source price record. The selected mix creates a derived scenario rate; it never replaces the source values below.</p>
        <div className="subscribe-model-grid">{models.map((model) => <label className="subscribe-model-choice" key={model.id}><input type="checkbox" checked={state.selectedModelIds.includes(model.id)} onChange={() => toggleModel(model.id)} /><span><strong>{modelName(model)}</strong><small>{modelPricing(model)?.route}</small></span></label>)}</div>
        {selected.length > 1 ? <div className="subscribe-mix-controls" role="group" aria-label="Model usage mix">{selected.map(({ model, shareBasisPoints }) => <label key={model.id}>{modelName(model)} <output>{shareBasisPoints / 100}%</output><input aria-label={`${modelName(model)} workload share`} type="range" min="0" max="10000" step="100" value={shareBasisPoints} onChange={(event) => updateShare(model.id, Number(event.currentTarget.value))} /></label>)}</div> : null}
      </section>
      <section id="subscription-workload" className="subscribe-control-section" aria-labelledby="subscription-workload-heading">
        <div className="calculator-step-heading"><span>Step 3</span><h2 id="subscription-workload-heading">Describe a message-level workload</h2></div>
        <div className="subscribe-control-grid">{([
          ['conversationsPerDay', 'Conversations per day', 0, 10_000],
          ['messagesPerConversation', 'Messages per conversation', 0, 1_000],
          ['inputTokensPerMessage', 'Input tokens per message', 0, 1_000_000],
          ['outputTokensPerMessage', 'Output tokens per message', 0, 1_000_000],
          ['activeDaysPerMonth', 'Active days per month', 0, 31],
        ] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} step="1" value={state.workload[key]} onChange={(event) => updateWorkload(key, positiveInteger(event.currentTarget.value, min, max, state.workload[key]))} /></label>)}</div>
        <div className="subscribe-control-grid">
          <label>Cache-read share<input aria-label="Cache-read share" type="number" min="0" max="100" step="1" value={state.cacheReadShareBasisPoints / 100} onChange={(event) => update({ ...state, cacheReadShareBasisPoints: Math.min(10_000 - state.cacheWriteShareBasisPoints, positiveInteger(event.currentTarget.value, 0, 100, state.cacheReadShareBasisPoints / 100) * 100) })} /></label>
          <label>Cache-write share<input aria-label="Cache-write share" type="number" min="0" max="100" step="1" value={state.cacheWriteShareBasisPoints / 100} onChange={(event) => update({ ...state, cacheWriteShareBasisPoints: Math.min(10_000 - state.cacheReadShareBasisPoints, positiveInteger(event.currentTarget.value, 0, 100, state.cacheWriteShareBasisPoints / 100) * 100) })} /></label>
          <label className="subscribe-checkbox"><input type="checkbox" checked={state.longContext} onChange={(event) => update({ ...state, longContext: event.currentTarget.checked })} /> Long-context workload (1.5× input-token scenario buffer)</label>
        </div>
        <fieldset className="subscribe-character-estimate"><legend>Character estimate (does not change token inputs until applied)</legend><div className="subscribe-control-grid"><label>Content type<select value={state.characterEstimate.contentType} onChange={(event) => update({ ...state, characterEstimate: { ...state.characterEstimate, contentType: event.currentTarget.value === 'code' ? 'code' : 'text' } })}><option value="text">Text · 4 characters per token</option><option value="code">Code · 3 characters per token</option></select></label><label>Input characters per message<input type="number" min="0" max="4000000" value={state.characterEstimate.inputCharactersPerMessage} onChange={(event) => update({ ...state, characterEstimate: { ...state.characterEstimate, inputCharactersPerMessage: positiveInteger(event.currentTarget.value, 0, 4_000_000, state.characterEstimate.inputCharactersPerMessage) } })} /></label><label>Output characters per message<input type="number" min="0" max="4000000" value={state.characterEstimate.outputCharactersPerMessage} onChange={(event) => update({ ...state, characterEstimate: { ...state.characterEstimate, outputCharactersPerMessage: positiveInteger(event.currentTarget.value, 0, 4_000_000, state.characterEstimate.outputCharactersPerMessage) } })} /></label></div><button type="button" onClick={applyCharacterEstimate}>Use character estimate</button></fieldset>
      </section>
    </section>
    <section id="subscription-crossover" ref={exportRef} className="panel subscribe-crossover" aria-labelledby="subscription-crossover-heading">
      <div className="toolbar"><div><span className="eyebrow">Step 4 · Derived scenario</span><h2 id="subscription-crossover-heading">Monthly API and Monthly subscription crossover</h2><p>Selected-volume values and domain samples use the same unrounded scenario rate before display formatting.</p></div><div role="group" aria-label="Share and export crossover analysis"><button data-export-action="true" type="button" onClick={() => { void copyScenarioLink(shareUrl(state)).then(() => setActionState({ tone: 'info', message: 'Scenario link copied.' })).catch(() => setActionState({ tone: 'error', message: 'The link could not be copied. Copy the browser address instead.' })); }}>Copy link</button><button data-export-action="true" type="button" onClick={() => { if (!result) return; const href = URL.createObjectURL(new Blob([`\uFEFF${crossoverCsv(result)}`], { type: 'text/csv;charset=utf-8' })); triggerDownload(href, 'tokenbench-subscribe-vs-api.csv'); window.setTimeout(() => URL.revokeObjectURL(href), 0); setActionState({ tone: 'info', message: 'Crossover CSV downloaded.' }); }}>Download CSV</button><button data-export-action="true" type="button" onClick={() => { if (!exportRef.current) return; void toPng(exportRef.current, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), cacheBust: true, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), filter: (node) => !(node instanceof HTMLElement && node.dataset.exportAction === 'true') }).then((href) => { triggerDownload(href, 'tokenbench-subscribe-vs-api.png'); setActionState({ tone: 'info', message: 'Crossover image downloaded.' }); }).catch(() => setActionState({ tone: 'error', message: 'The image could not be generated. Use the CSV for exact values instead.' })); }}>Download image</button><button data-export-action="true" type="button" onClick={() => window.print()}>Print</button></div></div>
      <div className="subscribe-control-grid subscribe-crossover-inputs"><label>Subscription seats<output>{state.seats} {state.seats === 1 ? 'seat' : 'seats'}</output><input aria-label="Subscription seats" type="range" min="1" max="50" step="1" value={state.seats} onChange={(event) => update({ ...state, seats: Number(event.currentTarget.value) })} /></label><label>Token volume in crossover domain (0–300M)<input aria-label="Token volume in crossover domain" type="number" min="0" max="300000000" step="1" value={state.tokenVolume} onChange={(event) => update({ ...state, tokenVolume: positiveInteger(event.currentTarget.value, 0, 300_000_000, state.tokenVolume) })} /></label></div>
      {result ? <><div className="subscribe-result-grid"><dl><dt>Monthly subscription</dt><dd>{formatUsd(result.monthlySubscriptionUsd)}</dd><small>{state.seats} × {formatUsd(planPrice(selectedPlan!))} per seat / month</small></dl><dl><dt>API at selected volume</dt><dd>{formatUsd(result.selectedVolumeApiUsd)}</dd><small>{formatTokens(state.tokenVolume)} tokens</small></dl><dl><dt>Crossover</dt><dd>{result.crossoverTokens === null ? 'Not calculated' : `${formatTokens(result.crossoverTokens)} tokens`}</dd><small>{result.crossoverTokens === null ? 'A positive API rate is required.' : lowerCost({ tokens: state.tokenVolume, monthlySubscriptionUsd: result.monthlySubscriptionUsd, apiUsd: result.selectedVolumeApiUsd }) === 'API' ? 'API is lower at the selected volume.' : 'Monthly subscription is lower at the selected volume.'}</small></dl></div><div className="subscribe-crossover-chart"><CrossoverChart domain={result.domain} /></div><div className="table-wrap" role="region" aria-label="Exact API and Monthly subscription crossover values" tabIndex={0}><table aria-label="Exact API and Monthly subscription crossover values"><caption>Direct samples include the selected volume and crossover when they sit inside the 0–300M token domain. Display rounding does not change lower-cost results.</caption><thead><tr><th scope="col">Monthly tokens</th><th scope="col">Monthly subscription</th><th scope="col">API usage</th><th scope="col">Lower cost</th></tr></thead><tbody>{result.domain.map((point) => <tr key={point.tokens}><th scope="row">{point.tokens === state.tokenVolume ? <strong>Selected volume · </strong> : null}{result.crossoverTokens !== null && Math.abs(point.tokens - result.crossoverTokens) < 0.0001 ? <strong>Crossover · </strong> : null}{formatTokens(point.tokens)} tokens</th><td>{formatUsd(point.monthlySubscriptionUsd)}</td><td>{formatUsd(point.apiUsd)}</td><td>{lowerCost(point)}</td></tr>)}</tbody></table></div></> : <p role="alert">{calculationReason ?? 'Choose a source-priced plan and a complete model mix to calculate the crossover.'}</p>}
    </section>
    {result ? <section className="subscribe-evidence-grid" aria-label="Source prices and derived calculations"><article className="panel"><div className="toolbar"><div><h2>Source price records</h2><p className="fixture">Published fixture values remain separate from derived totals.</p></div><span className="tag">Source data</span></div><div className="table-wrap" role="region" aria-label="Selected model source prices" tabIndex={0}><table aria-label="Selected model source prices"><caption>Source rate records for the selected model mix.</caption><thead><tr><th scope="col">Model</th><th scope="col">Price component</th><th scope="col">Source rate / 1M</th><th scope="col">Evidence state</th></tr></thead><SourcePriceRows selected={selected} /></table></div></article><article className="panel"><div className="toolbar"><div><h2>Derived monthly line items</h2><p className="fixture">Scenario arithmetic, not source price records.</p></div><span className="tag">Derived</span></div><div className="table-wrap" role="region" aria-label="Derived monthly API line items" tabIndex={0}><table aria-label="Derived monthly API line items"><caption>Exact scenario lines before display rounding.</caption><thead><tr><th scope="col">Line item</th><th scope="col">Monthly tokens</th><th scope="col">Rate / 1M</th><th scope="col">Monthly cost</th></tr></thead><tbody>{result.lineItems.map((item, index) => <tr key={`${item.id}-${index}`}><th scope="row">{item.id.replaceAll('-', ' ')}</th><td>{new Intl.NumberFormat('en-US').format(item.tokens)}</td><td>{formatUsd(item.rateUsdPerMillion)}</td><td>{formatUsd(item.costUsd)}</td></tr>)}</tbody></table></div></article><SourceProvenance plan={selectedPlan} selected={selected} /></section> : null}
    <section className="subscribe-evidence-grid" aria-label="Formula and assumptions"><details className="panel" open><summary>Formula and rounding</summary><p>Monthly messages = conversations per day × messages per conversation × active days. Cache reads and writes split adjusted input tokens; each line uses the selected source rate or the disclosed standard-input fallback. Monthly subscription is seats × the selected source plan price.</p></details><aside className="panel"><h2>Assumptions and timestamp</h2><p>Long-context mode applies a visible 1.5× input-token scenario buffer. It does not invent a separate source price tier when one is unavailable.</p><p className="fixture">Source effective time: <time>{sourceEffectiveAt}</time></p><p className="fixture">Calculated from the delivered contract: <time>{calculatedAt}</time></p></aside></section>
  </div>;
}
