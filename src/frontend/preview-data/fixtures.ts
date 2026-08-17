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

type WeightedRankingCapability = 'agentic' | 'coding' | 'reasoning' | 'math' | 'multimodal' | 'throughput';

interface WeightedRankingFixtureRecord {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly access: 'Proprietary' | 'Open weights';
  readonly cost: number;
  readonly inputPrice: number;
  readonly outputPrice: number;
  readonly cacheRead: number | null;
  readonly released: string;
  readonly lifecycle: 'Current';
  readonly sunset: string | null;
  readonly ttft: number;
  readonly throughput: number;
  readonly scores: Readonly<Record<Exclude<WeightedRankingCapability, 'throughput'>, number>>;
}

const WEIGHTED_RANKING_CAPABILITIES: readonly WeightedRankingCapability[] = ['agentic', 'coding', 'reasoning', 'math', 'multimodal', 'throughput'];

/**
 * Typed migration of the approved illustrative Make it yours records. This is
 * intentionally separate from the smaller Models/Compare fixture set so those
 * established surfaces do not acquire ranking-only claims.
 */
const WEIGHTED_RANKING_FIXTURE_RECORDS: readonly WeightedRankingFixtureRecord[] = [
  {"id":"claude-3-5-sonnet","name":"Claude 3.5 Sonnet","provider":"Anthropic","access":"Proprietary","cost":6,"inputPrice":3,"outputPrice":15,"cacheRead":0.3,"released":"2024-06-20","lifecycle":"Current","sunset":null,"ttft":0.42,"throughput":82,"scores":{"agentic":92,"coding":94,"reasoning":90,"math":88,"multimodal":89}},
  {"id":"deepseek-v3","name":"DeepSeek V3","provider":"DeepSeek","access":"Open weights","cost":0.48,"inputPrice":0.27,"outputPrice":1.1,"cacheRead":0.07,"released":"2025-12-26","lifecycle":"Current","sunset":null,"ttft":0.55,"throughput":65,"scores":{"agentic":87,"coding":92,"reasoning":89,"math":89,"multimodal":75}},
  {"id":"deepseek-r1","name":"DeepSeek R1","provider":"DeepSeek","access":"Open weights","cost":1,"inputPrice":0.55,"outputPrice":2.19,"cacheRead":0.14,"released":"2026-01-20","lifecycle":"Current","sunset":null,"ttft":0.95,"throughput":48,"scores":{"agentic":89,"coding":95,"reasoning":96,"math":97,"multimodal":72}},
  {"id":"gpt-4o","name":"GPT-4o","provider":"OpenAI","access":"Proprietary","cost":4.38,"inputPrice":2.5,"outputPrice":10,"cacheRead":1.25,"released":"2024-05-13","lifecycle":"Current","sunset":null,"ttft":0.38,"throughput":105,"scores":{"agentic":89,"coding":90,"reasoning":89,"math":88,"multimodal":92}},
  {"id":"gemini-1-5-pro","name":"Gemini 1.5 Pro","provider":"Google","access":"Proprietary","cost":2.19,"inputPrice":1.25,"outputPrice":5,"cacheRead":0.31,"released":"2024-02-15","lifecycle":"Current","sunset":"Not reported","ttft":0.62,"throughput":78,"scores":{"agentic":85,"coding":87,"reasoning":88,"math":86,"multimodal":93}},
  {"id":"llama-3-3-70b","name":"Llama 3.3 70B","provider":"Meta","access":"Open weights","cost":0.36,"inputPrice":0.3,"outputPrice":0.4,"cacheRead":null,"released":"2024-12-06","lifecycle":"Current","sunset":null,"ttft":0.31,"throughput":110,"scores":{"agentic":81,"coding":84,"reasoning":84,"math":81,"multimodal":50}},
  {"id":"gpt-5-6-sol","name":"GPT-5.6 Sol","provider":"OpenAI","access":"Proprietary","cost":5.25,"inputPrice":3,"outputPrice":12,"cacheRead":0.75,"released":"2026-07-28","lifecycle":"Current","sunset":null,"ttft":0.33,"throughput":118,"scores":{"agentic":97,"coding":96,"reasoning":97,"math":95,"multimodal":94}},
  {"id":"claude-mythos-5","name":"Claude Mythos 5","provider":"Anthropic","access":"Proprietary","cost":5.9,"inputPrice":4,"outputPrice":16,"cacheRead":0.4,"released":"2026-07-16","lifecycle":"Current","sunset":null,"ttft":0.41,"throughput":96,"scores":{"agentic":98,"coding":97,"reasoning":96,"math":94,"multimodal":93}},
  {"id":"claude-opus-5","name":"Claude Opus 5","provider":"Anthropic","access":"Proprietary","cost":8.6,"inputPrice":6,"outputPrice":24,"cacheRead":0.6,"released":"2026-06-30","lifecycle":"Current","sunset":null,"ttft":0.46,"throughput":88,"scores":{"agentic":97,"coding":98,"reasoning":98,"math":96,"multimodal":92}},
  {"id":"gemini-3-6-pro","name":"Gemini 3.6 Pro","provider":"Google","access":"Proprietary","cost":3.1,"inputPrice":1.5,"outputPrice":8,"cacheRead":0.38,"released":"2026-07-08","lifecycle":"Current","sunset":null,"ttft":0.36,"throughput":112,"scores":{"agentic":94,"coding":93,"reasoning":96,"math":96,"multimodal":98}},
  {"id":"grok-4-5","name":"Grok 4.5","provider":"xAI","access":"Proprietary","cost":4.9,"inputPrice":3,"outputPrice":14,"cacheRead":0.75,"released":"2026-06-18","lifecycle":"Current","sunset":null,"ttft":0.44,"throughput":103,"scores":{"agentic":93,"coding":92,"reasoning":95,"math":94,"multimodal":91}},
  {"id":"deepseek-v4-pro-0813","name":"DeepSeek V4 Pro 0813","provider":"DeepSeek","access":"Open weights","cost":0.72,"inputPrice":0.35,"outputPrice":1.8,"cacheRead":0.09,"released":"2026-08-13","lifecycle":"Current","sunset":null,"ttft":0.49,"throughput":79,"scores":{"agentic":94,"coding":97,"reasoning":96,"math":97,"multimodal":80}},
  {"id":"deepseek-v4-flash-0731","name":"DeepSeek V4 Flash 0731","provider":"DeepSeek","access":"Open weights","cost":0.26,"inputPrice":0.12,"outputPrice":0.6,"cacheRead":0.03,"released":"2026-07-31","lifecycle":"Current","sunset":null,"ttft":0.27,"throughput":132,"scores":{"agentic":88,"coding":92,"reasoning":90,"math":91,"multimodal":74}},
  {"id":"kimi-k3","name":"Kimi K3","provider":"Moonshot AI","access":"Open weights","cost":0.85,"inputPrice":0.45,"outputPrice":2,"cacheRead":0.11,"released":"2026-06-12","lifecycle":"Current","sunset":null,"ttft":0.48,"throughput":90,"scores":{"agentic":92,"coding":94,"reasoning":94,"math":93,"multimodal":88}},
  {"id":"qwen3-8-max","name":"Qwen 3.8 Max","provider":"Alibaba","access":"Proprietary","cost":1.65,"inputPrice":0.8,"outputPrice":4,"cacheRead":0.2,"released":"2026-06-24","lifecycle":"Current","sunset":null,"ttft":0.37,"throughput":108,"scores":{"agentic":92,"coding":95,"reasoning":93,"math":95,"multimodal":91}},
  {"id":"qwen3-5-235b","name":"Qwen 3.5 235B","provider":"Alibaba","access":"Open weights","cost":0.58,"inputPrice":0.28,"outputPrice":1.5,"cacheRead":0.07,"released":"2026-05-20","lifecycle":"Current","sunset":null,"ttft":0.51,"throughput":76,"scores":{"agentic":90,"coding":94,"reasoning":92,"math":94,"multimodal":87}},
  {"id":"llama-4-maverick","name":"Llama 4 Maverick","provider":"Meta","access":"Open weights","cost":0.45,"inputPrice":0.2,"outputPrice":1.2,"cacheRead":0.05,"released":"2026-04-07","lifecycle":"Current","sunset":null,"ttft":0.34,"throughput":121,"scores":{"agentic":88,"coding":91,"reasoning":89,"math":88,"multimodal":92}},
  {"id":"mistral-large-3","name":"Mistral Large 3","provider":"Mistral AI","access":"Open weights","cost":0.9,"inputPrice":0.4,"outputPrice":2.5,"cacheRead":0.1,"released":"2026-05-06","lifecycle":"Current","sunset":null,"ttft":0.39,"throughput":109,"scores":{"agentic":89,"coding":93,"reasoning":91,"math":90,"multimodal":86}},
  {"id":"command-a","name":"Command A","provider":"Cohere","access":"Open weights","cost":0.68,"inputPrice":0.3,"outputPrice":1.8,"cacheRead":0.08,"released":"2026-03-14","lifecycle":"Current","sunset":null,"ttft":0.43,"throughput":92,"scores":{"agentic":87,"coding":89,"reasoning":90,"math":86,"multimodal":70}},
  {"id":"glm-5","name":"GLM-5","provider":"Zhipu AI","access":"Open weights","cost":0.75,"inputPrice":0.35,"outputPrice":2,"cacheRead":0.09,"released":"2026-05-28","lifecycle":"Current","sunset":null,"ttft":0.47,"throughput":86,"scores":{"agentic":91,"coding":92,"reasoning":93,"math":94,"multimodal":89}},
  {"id":"nova-pro","name":"Nova Pro","provider":"Amazon","access":"Proprietary","cost":1.4,"inputPrice":0.8,"outputPrice":3.2,"cacheRead":0.2,"released":"2025-12-03","lifecycle":"Current","sunset":null,"ttft":0.58,"throughput":74,"scores":{"agentic":84,"coding":86,"reasoning":87,"math":85,"multimodal":88}},
  {"id":"phi-4","name":"Phi-4","provider":"Microsoft","access":"Open weights","cost":0.22,"inputPrice":0.12,"outputPrice":0.52,"cacheRead":null,"released":"2025-01-10","lifecycle":"Current","sunset":null,"ttft":0.29,"throughput":116,"scores":{"agentic":79,"coding":86,"reasoning":88,"math":91,"multimodal":62}},
  {"id":"jamba-1-5-large","name":"Jamba 1.5 Large","provider":"AI21 Labs","access":"Open weights","cost":0.7,"inputPrice":0.35,"outputPrice":1.4,"cacheRead":null,"released":"2024-08-22","lifecycle":"Current","sunset":null,"ttft":0.52,"throughput":81,"scores":{"agentic":80,"coding":82,"reasoning":84,"math":81,"multimodal":58}},
  {"id":"yi-large","name":"Yi-Large","provider":"01.AI","access":"Proprietary","cost":0.9,"inputPrice":0.45,"outputPrice":1.8,"cacheRead":null,"released":"2024-05-13","lifecycle":"Current","sunset":null,"ttft":0.61,"throughput":70,"scores":{"agentic":81,"coding":84,"reasoning":85,"math":84,"multimodal":60}},
  {"id":"gemma-3-27b","name":"Gemma 3 27B","provider":"Google","access":"Open weights","cost":0.2,"inputPrice":0.1,"outputPrice":0.5,"cacheRead":null,"released":"2025-03-12","lifecycle":"Current","sunset":null,"ttft":0.32,"throughput":104,"scores":{"agentic":82,"coding":87,"reasoning":86,"math":88,"multimodal":84}},
  {"id":"command-r-plus","name":"Command R+","provider":"Cohere","access":"Open weights","cost":0.55,"inputPrice":0.25,"outputPrice":1.5,"cacheRead":null,"released":"2024-04-04","lifecycle":"Current","sunset":null,"ttft":0.46,"throughput":89,"scores":{"agentic":83,"coding":84,"reasoning":84,"math":80,"multimodal":55}},
  {"id":"mistral-small-3-2","name":"Mistral Small 3.2","provider":"Mistral AI","access":"Open weights","cost":0.3,"inputPrice":0.15,"outputPrice":0.7,"cacheRead":null,"released":"2025-06-20","lifecycle":"Current","sunset":null,"ttft":0.28,"throughput":124,"scores":{"agentic":84,"coding":89,"reasoning":86,"math":85,"multimodal":82}},
  {"id":"llama-3-1-405b","name":"Llama 3.1 405B","provider":"Meta","access":"Open weights","cost":0.8,"inputPrice":0.4,"outputPrice":1.6,"cacheRead":null,"released":"2024-07-23","lifecycle":"Current","sunset":null,"ttft":0.72,"throughput":61,"scores":{"agentic":84,"coding":88,"reasoning":87,"math":86,"multimodal":50}},
  {"id":"qwen-2-5-72b","name":"Qwen 2.5 72B","provider":"Alibaba","access":"Open weights","cost":0.25,"inputPrice":0.12,"outputPrice":0.6,"cacheRead":null,"released":"2024-09-19","lifecycle":"Current","sunset":null,"ttft":0.35,"throughput":101,"scores":{"agentic":82,"coding":88,"reasoning":87,"math":90,"multimodal":52}},
  {"id":"grok-3-mini","name":"Grok 3 Mini","provider":"xAI","access":"Proprietary","cost":0.6,"inputPrice":0.3,"outputPrice":1.2,"cacheRead":null,"released":"2025-04-09","lifecycle":"Current","sunset":null,"ttft":0.4,"throughput":98,"scores":{"agentic":85,"coding":88,"reasoning":91,"math":92,"multimodal":55}},
];

function normalizedThroughputScore(throughput: number): number {
  return Math.min(100, throughput / 120 * 100);
}

function weightedRankingComposite(record: WeightedRankingFixtureRecord): number {
  const weights = { agentic: 20, coding: 20, reasoning: 20, math: 15, multimodal: 15, throughput: 10 } as const;
  return WEIGHTED_RANKING_CAPABILITIES.reduce((total, capability) => total + (capability === 'throughput'
    ? normalizedThroughputScore(record.throughput)
    : record.scores[capability]) * weights[capability], 0) / 100;
}

function weightedRankingModel(record: WeightedRankingFixtureRecord): PreviewModel {
  return {
    id: record.id,
    identity: available({ slug: record.id, name: record.name, provider: record.provider }, PREVIEW_FIXTURE_PROVENANCE.identity),
    access: available(record.access, PREVIEW_FIXTURE_PROVENANCE.identity),
    benchmark: available({
      releaseOn: record.released,
      subtasks: WEIGHTED_RANKING_CAPABILITIES.map((key) => ({ id: key, label: key[0]!.toUpperCase() + key.slice(1) })),
    }, PREVIEW_FIXTURE_PROVENANCE.benchmark),
    capability: available({
      compositeScore: weightedRankingComposite(record),
      radar: WEIGHTED_RANKING_CAPABILITIES.map((key) => ({
        key,
        label: key[0]!.toUpperCase() + key.slice(1),
        percentile: key === 'throughput' ? normalizedThroughputScore(record.throughput) : record.scores[key],
        rank: null,
        fieldSize: null,
      })),
    }, PREVIEW_FIXTURE_PROVENANCE.benchmark),
    routePricing: available({
      route: `${record.provider} illustrative prototype route`,
      inputUsdPerMillion: record.inputPrice,
      outputUsdPerMillion: record.outputPrice,
      blendedUsdPerMillion: available(record.cost, PREVIEW_FIXTURE_PROVENANCE.economics),
      cache: available({
        readUsdPerMillion: record.cacheRead === null ? unavailable('No approved cache-read price source') : available(record.cacheRead, PREVIEW_FIXTURE_PROVENANCE.economics),
        writeUsdPerMillion: unavailable('No approved cache-write price source'),
      }, PREVIEW_FIXTURE_PROVENANCE.economics),
    }, PREVIEW_FIXTURE_PROVENANCE.economics),
    taskEconomics: available({ costUsdPerSuccessfulTask: record.cost, workload: 'Illustrative prototype ranking cost' }, PREVIEW_FIXTURE_PROVENANCE.economics),
    runtime: available({
      ttftP50Seconds: record.ttft,
      outputTokensPerSecond: record.throughput,
      conditions: 'Illustrative prototype route · p50 · streaming · 1× concurrency',
    }, PREVIEW_FIXTURE_PROVENANCE.runtime),
    lifecycle: available({
      status: record.lifecycle,
      sunsetOn: record.sunset === null ? unavailable('No approved sunset source') : available(record.sunset, PREVIEW_FIXTURE_PROVENANCE.lifecycle),
    }, PREVIEW_FIXTURE_PROVENANCE.lifecycle),
  };
}

export const PREVIEW_WEIGHTED_RANKING_FIXTURE_MODELS: readonly PreviewModel[] = WEIGHTED_RANKING_FIXTURE_RECORDS.map(weightedRankingModel);

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
