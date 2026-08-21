/**
 * URL state for the subscription comparison surface.
 *
 * This module deliberately contains no provider price, plan, model, or usage
 * facts. Those must arrive through the strict subscription catalog boundary.
 */
export const SUBSCRIPTION_PROVIDERS = [
  { id: "openai", label: "ChatGPT / OpenAI" },
  { id: "anthropic", label: "Claude / Anthropic" },
  { id: "google", label: "Gemini / Google" },
  { id: "xai", label: "Grok / xAI" },
  { id: "zai", label: "GLM Coding / Z.ai" },
  { id: "perplexity", label: "Perplexity" },
  { id: "microsoft", label: "Microsoft Copilot" },
] as const;

export type SubscriptionProvider = (typeof SUBSCRIPTION_PROVIDERS)[number]["id"];
export type ContentType = "text" | "code";

export type SubscriptionScenario = {
  provider: SubscriptionProvider;
  /** An empty value means there is no reviewed plan available for this provider. */
  plan: string;
  /** Only IDs verified by the catalog projector survive canonicalization. */
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

export const defaultSubscriptionScenario: SubscriptionScenario = {
  provider: "openai",
  plan: "",
  models: [],
  mix: {},
  conversationsPerDay: 5,
  messagesPerConversation: 8,
  activeDays: 22,
  inputTokensPerMessage: 1200,
  outputTokensPerMessage: 350,
  cacheReadShare: 20,
  // Published provider catalogs rarely expose a separate cache-write rate.
  // Keep the default exactly calculable; a positive user-entered share remains
  // blocked unless its reviewed rate is present.
  cacheWriteShare: 0,
  seats: 1,
  tokenVolume: 0,
  inputCharactersPerMessage: 4800,
  outputCharactersPerMessage: 1400,
  contentType: "text",
  longContext: false,
};

const ranges: Record<keyof Pick<SubscriptionScenario,
  "conversationsPerDay" | "messagesPerConversation" | "activeDays" | "inputTokensPerMessage"
  | "outputTokensPerMessage" | "cacheReadShare" | "cacheWriteShare" | "seats" | "tokenVolume"
  | "inputCharactersPerMessage" | "outputCharactersPerMessage">, [number, number]> = {
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

const selectionId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function isSubscriptionProvider(value: string | null): value is SubscriptionProvider {
  return SUBSCRIPTION_PROVIDERS.some((provider) => provider.id === value);
}

function numberParam(params: URLSearchParams, key: keyof typeof ranges) {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return defaultSubscriptionScenario[key];
  const value = Number(raw);
  const [min, max] = ranges[key];
  return Number.isFinite(value) && value >= min && value <= max ? value : defaultSubscriptionScenario[key];
}

function equalMix(models: readonly string[]): Record<string, number> {
  if (models.length === 0) return {};
  const base = Math.floor(100 / models.length);
  const remainder = 100 - base * models.length;
  return Object.fromEntries(models.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}

/** Normalize ratios without coupling URL state to an unreviewed model catalog. */
export function normalizeMix(models: readonly string[], rawMix: string | null | Record<string, number>): Record<string, number> {
  if (models.length === 0) return {};
  if (models.length === 1) return { [models[0]]: 100 };

  const parsed = typeof rawMix === "string"
    ? Object.fromEntries(rawMix
      .split(",")
      .map((part) => part.split(":", 2))
      .filter(([id, value]) => models.includes(id) && Number.isFinite(Number(value)) && Number(value) >= 0)
      .map(([id, value]) => [id, Number(value)]))
    : rawMix ?? {};

  if (models.some((id) => !Number.isFinite(parsed[id]) || parsed[id] < 0)) return equalMix(models);
  const total = models.reduce((sum, id) => sum + parsed[id], 0);
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
  const provider = isSubscriptionProvider(providerRaw) ? providerRaw : defaultSubscriptionScenario.provider;
  const requestedPlan = params.get("plan");
  const plan = requestedPlan !== null && selectionId.test(requestedPlan) ? requestedPlan : "";
  const models = Array.from(new Set((params.get("models") ?? "")
    .split(",")
    .filter((id) => selectionId.test(id))))
    .slice(0, 4);

  return {
    provider,
    plan,
    models,
    mix: normalizeMix(models, params.get("mix")),
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
  params.set("mix", scenario.models.map((id) => `${id}:${scenario.mix[id] ?? 0}`).join(","));
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
