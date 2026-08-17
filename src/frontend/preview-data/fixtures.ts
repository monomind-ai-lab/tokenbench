import type {
  EvidenceValue,
  LifecycleModel,
  PreviewModel,
  Provenance,
  SubscriptionPlan,
} from './contracts';

export const PREVIEW_FIXTURE_PROVENANCE = {
  identity: {
    id: 'illustrative-model-identity',
    label: 'Illustrative prototype data',
    kind: 'illustrative_prototype',
    effectiveAt: '2026-08-15T00:00:00.000Z',
    note: 'Representative model identity and access fixture from the approved preview.',
  },
  benchmark: {
    id: 'illustrative-benchmark',
    label: 'Illustrative prototype data',
    kind: 'illustrative_prototype',
    effectiveAt: '2026-08-14T00:00:00.000Z',
    note: 'Representative benchmark release and subtask fixture from the approved preview.',
  },
  economics: {
    id: 'illustrative-route-economics',
    label: 'Illustrative prototype data',
    kind: 'illustrative_prototype',
    effectiveAt: '2026-08-13T00:00:00.000Z',
    note: 'Representative route, cache, and task-economics fixture from the approved preview.',
  },
  runtime: {
    id: 'illustrative-runtime-sla',
    label: 'Illustrative prototype data',
    kind: 'illustrative_prototype',
    effectiveAt: '2026-08-12T00:00:00.000Z',
    note: 'Representative runtime SLA fixture from the approved preview.',
  },
  lifecycle: {
    id: 'illustrative-lifecycle',
    label: 'Illustrative prototype data',
    kind: 'illustrative_prototype',
    effectiveAt: '2026-08-11T00:00:00.000Z',
    note: 'Representative lifecycle fixture from the approved preview.',
  },
  plans: {
    id: 'illustrative-subscription-plans',
    label: 'Illustrative prototype data',
    kind: 'illustrative_prototype',
    effectiveAt: '2026-08-10T00:00:00.000Z',
    note: 'Representative subscription-plan fixture from the approved preview.',
  },
} as const satisfies Readonly<Record<string, Provenance>>;

function available<T>(value: T, provenance: Provenance): EvidenceValue<T> {
  return { availability: 'available', value, provenance };
}

function unavailable(reason: string): EvidenceValue<never> {
  return { availability: 'unavailable', reason };
}

const gpt4o: PreviewModel = {
  id: 'gpt-4o',
  identity: available({ slug: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' }, PREVIEW_FIXTURE_PROVENANCE.identity),
  access: available('Proprietary', PREVIEW_FIXTURE_PROVENANCE.identity),
  benchmark: available({
    releaseOn: '2024-05-13',
    subtasks: [{ id: 'reasoning', label: 'Reasoning' }, { id: 'coding', label: 'Coding' }],
  }, PREVIEW_FIXTURE_PROVENANCE.benchmark),
  capability: available({
    compositeScore: 82.4,
    radar: [
      { key: 'reasoning', label: 'Reasoning', percentile: 91, rank: 3, fieldSize: 36 },
      { key: 'coding', label: 'Coding', percentile: 88, rank: 4, fieldSize: 36 },
      { key: 'throughput', label: 'Throughput', percentile: 84, rank: 6, fieldSize: 36 },
    ],
  }, PREVIEW_FIXTURE_PROVENANCE.benchmark),
  routePricing: available({
    route: 'OpenAI native · fixture',
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 10,
    cache: available({
      readUsdPerMillion: available(1.25, PREVIEW_FIXTURE_PROVENANCE.economics),
      writeUsdPerMillion: unavailable('No approved cache-write price source'),
    }, PREVIEW_FIXTURE_PROVENANCE.economics),
  }, PREVIEW_FIXTURE_PROVENANCE.economics),
  taskEconomics: available({ costUsdPerSuccessfulTask: 4.38, workload: 'Representative successful task' }, PREVIEW_FIXTURE_PROVENANCE.economics),
  runtime: available({
    ttftP50Seconds: 0.38,
    outputTokensPerSecond: 105,
    conditions: 'Representative hosted route · p50 · streaming · 1× concurrency',
  }, PREVIEW_FIXTURE_PROVENANCE.runtime),
  lifecycle: available({
    status: 'Current',
    sunsetOn: unavailable('No approved sunset source'),
  }, PREVIEW_FIXTURE_PROVENANCE.lifecycle),
};

const deepseekV3: PreviewModel = {
  id: 'deepseek-v3',
  identity: available({ slug: 'deepseek-v3', name: 'DeepSeek V3', provider: 'DeepSeek' }, PREVIEW_FIXTURE_PROVENANCE.identity),
  access: available('Open weights', PREVIEW_FIXTURE_PROVENANCE.identity),
  benchmark: available({
    releaseOn: '2025-12-26',
    subtasks: [{ id: 'reasoning', label: 'Reasoning' }, { id: 'coding', label: 'Coding' }],
  }, PREVIEW_FIXTURE_PROVENANCE.benchmark),
  capability: available({
    compositeScore: 76.1,
    radar: [
      { key: 'reasoning', label: 'Reasoning', percentile: 83, rank: 6, fieldSize: 36 },
      { key: 'coding', label: 'Coding', percentile: 81, rank: 7, fieldSize: 36 },
      { key: 'throughput', label: 'Throughput', percentile: 72, rank: 11, fieldSize: 36 },
    ],
  }, PREVIEW_FIXTURE_PROVENANCE.benchmark),
  routePricing: available({
    route: 'DeepSeek native · fixture',
    inputUsdPerMillion: 0.27,
    outputUsdPerMillion: 1.1,
    cache: available({
      readUsdPerMillion: available(0.07, PREVIEW_FIXTURE_PROVENANCE.economics),
      writeUsdPerMillion: unavailable('No approved cache-write price source'),
    }, PREVIEW_FIXTURE_PROVENANCE.economics),
  }, PREVIEW_FIXTURE_PROVENANCE.economics),
  taskEconomics: available({ costUsdPerSuccessfulTask: 0.48, workload: 'Representative successful task' }, PREVIEW_FIXTURE_PROVENANCE.economics),
  runtime: available({
    ttftP50Seconds: 0.55,
    outputTokensPerSecond: 65,
    conditions: 'Representative hosted route · p50 · streaming · 1× concurrency',
  }, PREVIEW_FIXTURE_PROVENANCE.runtime),
  lifecycle: available({
    status: 'Current',
    sunsetOn: unavailable('No approved sunset source'),
  }, PREVIEW_FIXTURE_PROVENANCE.lifecycle),
};

export const PREVIEW_FIXTURE_MODELS: readonly PreviewModel[] = [gpt4o, deepseekV3];

export const PREVIEW_FIXTURE_LIFECYCLE: readonly LifecycleModel[] = [{
  modelId: 'gpt-4-turbo',
  identity: available({ slug: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' }, PREVIEW_FIXTURE_PROVENANCE.identity),
  lifecycle: available({
    status: 'Retirement scheduled',
    sunsetOn: available('2026-09-30', PREVIEW_FIXTURE_PROVENANCE.lifecycle),
  }, PREVIEW_FIXTURE_PROVENANCE.lifecycle),
  replacement: unavailable('No approved replacement source'),
}];

export const PREVIEW_FIXTURE_SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [{
  id: 'illustrative-openai-individual',
  provider: available('OpenAI', PREVIEW_FIXTURE_PROVENANCE.plans),
  displayName: available('Individual plan', PREVIEW_FIXTURE_PROVENANCE.plans),
  monthlyUsd: available(20, PREVIEW_FIXTURE_PROVENANCE.plans),
  includedUsage: unavailable('No approved plan entitlement source'),
}];
