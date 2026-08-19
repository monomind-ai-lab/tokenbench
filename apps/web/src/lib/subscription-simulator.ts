export type SubscriptionProvider = "openai" | "anthropic" | "google";
export type ContentType = "text" | "code";

export type SubscriptionPlan = {
  id: string;
  provider: SubscriptionProvider;
  name: string;
  price: number;
};

export type SimulatorModel = {
  id: string;
  name: string;
  provider: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  color: string;
};

export type SubscriptionScenario = {
  provider: SubscriptionProvider;
  plan: string;
  models: string[];
  mix: Record<string, number>;
  conversationsPerDay: number;
  messagesPerConversation: number;
  activeDays: number;
  inputTokensPerMessage: number;
  outputTokensPerMessage: number;
  cacheReadShare: number;
  cacheWriteShare: number;
  seats: number;
  tokenVolume: number;
  inputCharactersPerMessage: number;
  outputCharactersPerMessage: number;
  contentType: ContentType;
  longContext: boolean;
};

export const subscriptionPlans: SubscriptionPlan[] = [
  { id: "individual", provider: "openai", name: "ChatGPT Plus", price: 20 },
  { id: "team", provider: "openai", name: "ChatGPT Team", price: 30 },
  { id: "enterprise", provider: "openai", name: "ChatGPT Pro", price: 60 },
  { id: "anthropic-pro", provider: "anthropic", name: "Claude Pro", price: 20 },
  { id: "anthropic-max", provider: "anthropic", name: "Claude Max", price: 100 },
  { id: "google-ai-pro", provider: "google", name: "Google AI Pro", price: 20 },
  { id: "google-ai-ultra", provider: "google", name: "Google AI Ultra", price: 250 },
];

const rawModels: Array<[string, string, string, number, number, string]> = [
  ["claude-3-5-sonnet", "Claude 3.5 Sonnet", "Anthropic", 3, 15, "#d97757"],
  ["deepseek-v3", "DeepSeek V3", "DeepSeek", 0.27, 1.1, "#4b7bec"],
  ["deepseek-r1", "DeepSeek R1", "DeepSeek", 0.55, 2.19, "#2d61cf"],
  ["gpt-4o", "GPT-4o", "OpenAI", 2.5, 10, "#f4f4f5"],
  ["gemini-1-5-pro", "Gemini 1.5 Pro", "Google", 1.25, 5, "#5489d6"],
  ["llama-3-3-70b", "Llama 3.3 70B", "Meta", 0.1, 0.32, "#6c8ff0"],
  ["gpt-5-6-sol", "GPT-5.6 Sol", "OpenAI", 3.5, 14, "#e4e4e7"],
  ["claude-mythos-5", "Claude Mythos 5", "Anthropic", 5, 25, "#e59b7f"],
  ["claude-opus-5", "Claude Opus 5", "Anthropic", 15, 75, "#c76e50"],
  ["gemini-3-6-pro", "Gemini 3.6 Pro", "Google", 2, 10, "#70a0e5"],
  ["grok-4-5", "Grok 4.5", "xAI", 3, 15, "#a1a1aa"],
  ["deepseek-v4-pro-0813", "DeepSeek V4 Pro 0813", "DeepSeek", 0.65, 2.6, "#315fc2"],
  ["deepseek-v4-flash-0731", "DeepSeek V4 Flash 0731", "DeepSeek", 0.12, 0.5, "#648fea"],
  ["kimi-k3", "Kimi K3", "Moonshot AI", 0.6, 2.5, "#49a6db"],
  ["qwen3-8-max", "Qwen3.8 Max", "Alibaba", 0.8, 3.2, "#8d6ce6"],
  ["qwen3-5-235b", "Qwen3.5 235B", "Alibaba", 0.22, 0.88, "#7455cb"],
  ["llama-4-maverick", "Llama 4 Maverick", "Meta", 0.15, 0.6, "#496fd8"],
  ["mistral-large-3", "Mistral Large 3", "Mistral", 2, 6, "#f2a93b"],
  ["command-a", "Command A", "Cohere", 2.5, 10, "#6cc6a4"],
  ["glm-5", "GLM 5", "Z.ai", 0.8, 2.8, "#4fc1a4"],
  ["nova-pro", "Nova Pro", "Amazon", 0.8, 3.2, "#f4a640"],
  ["phi-4", "Phi-4", "Microsoft", 0.12, 0.3, "#5d8fda"],
  ["jamba-1-5-large", "Jamba 1.5 Large", "AI21", 2, 8, "#a66ce5"],
  ["yi-large", "Yi Large", "01.AI", 1.5, 5, "#37a3ca"],
  ["gemma-3-27b", "Gemma 3 27B", "Google", 0.09, 0.17, "#89b5ef"],
  ["command-r-plus", "Command R+", "Cohere", 2.5, 10, "#4faf8d"],
  ["mistral-small-3-2", "Mistral Small 3.2", "Mistral", 0.1, 0.3, "#ef8f24"],
  ["llama-3-1-405b", "Llama 3.1 405B", "Meta", 0.8, 0.8, "#3657aa"],
  ["qwen-2-5-72b", "Qwen 2.5 72B", "Alibaba", 0.13, 0.4, "#6847b8"],
  ["grok-3-mini", "Grok 3 Mini", "xAI", 0.3, 0.5, "#8d8d99"],
];

export const simulatorModels: SimulatorModel[] = rawModels.map(([id, name, provider, input, output, color]) => ({ id, name, provider, input, output, cacheRead: input * 0.5, cacheWrite: input, color }));

export const defaultSubscriptionScenario: SubscriptionScenario = {
  provider: "openai",
  plan: "individual",
  models: ["gpt-4o"],
  mix: { "gpt-4o": 100 },
  conversationsPerDay: 5,
  messagesPerConversation: 8,
  activeDays: 22,
  inputTokensPerMessage: 1200,
  outputTokensPerMessage: 350,
  cacheReadShare: 20,
  cacheWriteShare: 5,
  seats: 1,
  tokenVolume: 0,
  inputCharactersPerMessage: 4800,
  outputCharactersPerMessage: 1400,
  contentType: "text",
  longContext: false,
};

const ranges: Record<keyof Pick<SubscriptionScenario, "conversationsPerDay" | "messagesPerConversation" | "activeDays" | "inputTokensPerMessage" | "outputTokensPerMessage" | "cacheReadShare" | "cacheWriteShare" | "seats" | "tokenVolume" | "inputCharactersPerMessage" | "outputCharactersPerMessage">, [number, number]> = {
  conversationsPerDay: [0, 10_000],
  messagesPerConversation: [0, 10_000],
  activeDays: [1, 31],
  inputTokensPerMessage: [0, 1_000_000],
  outputTokensPerMessage: [0, 1_000_000],
  cacheReadShare: [0, 100],
  cacheWriteShare: [0, 100],
  seats: [1, 50],
  tokenVolume: [0, 300],
  inputCharactersPerMessage: [0, 4_000_000],
  outputCharactersPerMessage: [0, 4_000_000],
};

function numberParam(params: URLSearchParams, key: keyof typeof ranges) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return defaultSubscriptionScenario[key];
  const value = Number(raw);
  const [min, max] = ranges[key];
  return Number.isFinite(value) && value >= min && value <= max ? value : defaultSubscriptionScenario[key];
}

function equalMix(models: string[]) {
  const base = Math.floor(100 / models.length);
  const remainder = 100 - base * models.length;
  return Object.fromEntries(models.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}

export function normalizeMix(models: string[], rawMix: string | null) {
  if (models.length === 1) return { [models[0]]: 100 };
  if (!rawMix) return equalMix(models);
  const parsed = Object.fromEntries(rawMix.split(",").map((part) => part.split(":" as const)).filter(([id, value]) => models.includes(id) && Number.isFinite(Number(value)) && Number(value) >= 0).map(([id, value]) => [id, Number(value)]));
  if (Object.keys(parsed).length !== models.length) return equalMix(models);
  const total = Object.values(parsed).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return equalMix(models);
  const normalized: Record<string, number> = {};
  let used = 0;
  models.forEach((id, index) => {
    const value = index === models.length - 1 ? 100 - used : Math.round((parsed[id] / total) * 100);
    normalized[id] = value;
    used += value;
  });
  return normalized;
}

export function parseSubscriptionScenario(params: URLSearchParams): SubscriptionScenario {
  const providerRaw = params.get("provider");
  const provider: SubscriptionProvider = providerRaw === "anthropic" || providerRaw === "google" || providerRaw === "openai" ? providerRaw : "openai";
  const providerPlans = subscriptionPlans.filter((plan) => plan.provider === provider);
  const requestedPlan = params.get("plan");
  const plan = providerPlans.some((candidate) => candidate.id === requestedPlan) ? (requestedPlan as string) : providerPlans[0].id;
  const knownModels = new Set(simulatorModels.map((model) => model.id));
  const models = Array.from(new Set((params.get("models") ?? "gpt-4o").split(",").filter((id) => knownModels.has(id)))).slice(0, 4);
  const acceptedModels = models.length ? models : ["gpt-4o"];
  return {
    provider,
    plan,
    models: acceptedModels,
    mix: normalizeMix(acceptedModels, params.get("mix")),
    conversationsPerDay: numberParam(params, "conversationsPerDay"),
    messagesPerConversation: numberParam(params, "messagesPerConversation"),
    activeDays: numberParam(params, "activeDays"),
    inputTokensPerMessage: numberParam(params, "inputTokensPerMessage"),
    outputTokensPerMessage: numberParam(params, "outputTokensPerMessage"),
    cacheReadShare: numberParam(params, "cacheReadShare"),
    cacheWriteShare: numberParam(params, "cacheWriteShare"),
    seats: numberParam(params, "seats"),
    tokenVolume: numberParam(params, "tokenVolume"),
    inputCharactersPerMessage: numberParam(params, "inputCharactersPerMessage"),
    outputCharactersPerMessage: numberParam(params, "outputCharactersPerMessage"),
    contentType: params.get("contentType") === "code" ? "code" : "text",
    longContext: params.get("longContext") === "1",
  };
}

export function serializeSubscriptionScenario(scenario: SubscriptionScenario) {
  const params = new URLSearchParams();
  params.set("provider", scenario.provider);
  params.set("plan", scenario.plan);
  params.set("models", scenario.models.join(","));
  params.set("mix", scenario.models.map((id) => `${id}:${scenario.mix[id]}`).join(","));
  params.set("conversationsPerDay", String(scenario.conversationsPerDay));
  params.set("messagesPerConversation", String(scenario.messagesPerConversation));
  params.set("activeDays", String(scenario.activeDays));
  params.set("inputTokensPerMessage", String(scenario.inputTokensPerMessage));
  params.set("outputTokensPerMessage", String(scenario.outputTokensPerMessage));
  params.set("cacheReadShare", String(scenario.cacheReadShare));
  params.set("cacheWriteShare", String(scenario.cacheWriteShare));
  params.set("seats", String(scenario.seats));
  params.set("tokenVolume", String(scenario.tokenVolume));
  params.set("inputCharactersPerMessage", String(scenario.inputCharactersPerMessage));
  params.set("outputCharactersPerMessage", String(scenario.outputCharactersPerMessage));
  params.set("contentType", scenario.contentType);
  params.set("longContext", scenario.longContext ? "1" : "0");
  return params.toString();
}

export function calculateSubscriptionScenario(scenario: SubscriptionScenario, subscriptionPrice?: number) {
  const messages = scenario.conversationsPerDay * scenario.messagesPerConversation * scenario.activeDays;
  const workloadInput = messages * scenario.inputTokensPerMessage * (scenario.longContext ? 1.5 : 1);
  const workloadOutput = messages * scenario.outputTokensPerMessage;
  const workloadTotal = workloadInput + workloadOutput;
  const selectedTotal = scenario.tokenVolume > 0 ? scenario.tokenVolume * 1_000_000 : workloadTotal;
  const inputRatio = workloadTotal > 0 ? workloadInput / workloadTotal : 0.75;
  const inputTokens = selectedTotal * inputRatio;
  const outputTokens = selectedTotal - inputTokens;
  const cacheReadShare = Math.min(100, scenario.cacheReadShare);
  const cacheWriteShare = Math.min(scenario.cacheWriteShare, 100 - cacheReadShare);
  const uncachedShare = 100 - cacheReadShare - cacheWriteShare;
  const modelLines = scenario.models.map((id) => {
    const model = simulatorModels.find((candidate) => candidate.id === id) as SimulatorModel;
    const ratio = scenario.mix[id] / 100;
    const modelInput = inputTokens * ratio;
    const modelOutput = outputTokens * ratio;
    const inputCost = (modelInput / 1_000_000) * ((uncachedShare / 100) * model.input + (cacheReadShare / 100) * model.cacheRead + (cacheWriteShare / 100) * model.cacheWrite);
    const outputCost = (modelOutput / 1_000_000) * model.output;
    return { model, ratio, inputTokens: modelInput, outputTokens: modelOutput, inputCost, outputCost, total: inputCost + outputCost };
  });
  const apiCost = modelLines.reduce((sum, line) => sum + line.total, 0);
  const plan = subscriptionPlans.find((candidate) => candidate.id === scenario.plan) as SubscriptionPlan;
  const seatPrice = subscriptionPrice ?? plan.price;
  const subscriptionCost = seatPrice * scenario.seats;
  const costPerMillion = selectedTotal > 0 ? apiCost / (selectedTotal / 1_000_000) : 0;
  const crossoverMillions = costPerMillion > 0 ? subscriptionCost / costPerMillion : null;
  return { messages, workloadInput, workloadOutput, totalTokens: selectedTotal, cacheReadShare, cacheWriteShare, uncachedShare, modelLines, apiCost, plan, seatPrice, subscriptionCost, costPerMillion, crossoverMillions };
}
