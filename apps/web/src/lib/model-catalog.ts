export type AccessType = "API" | "Open weights" | "Subscription";

export type CatalogModel = {
  id: string;
  name: string;
  provider: string;
  summary: string;
  access: AccessType[];
  category: "Flagship" | "Reasoning" | "Fast" | "Code" | "Open weights";
  context: number;
  inputPrice: number | null;
  outputPrice: number | null;
  score: number | null;
  speed: number | null;
  frontier: boolean;
  color: string;
  released: string;
};

export const catalogModels: CatalogModel[] = [
  { id: "gpt-4.1", name: "GPT-4.1", provider: "OpenAI", summary: "High-capability general model with a one-million-token context window.", access: ["API"], category: "Flagship", context: 1_000_000, inputPrice: 2, outputPrice: 8, score: 96, speed: 77, frontier: true, color: "#e4e4e7", released: "2025-04-14" },
  { id: "o3", name: "o3", provider: "OpenAI", summary: "Deliberate reasoning for difficult analysis, coding, and tool-use tasks.", access: ["API", "Subscription"], category: "Reasoning", context: 200_000, inputPrice: 2, outputPrice: 8, score: 98, speed: 48, frontier: true, color: "#f4f4f5", released: "2025-04-16" },
  { id: "o4-mini", name: "o4-mini", provider: "OpenAI", summary: "Compact reasoning model tuned for efficient high-volume workloads.", access: ["API", "Subscription"], category: "Reasoning", context: 200_000, inputPrice: 1.1, outputPrice: 4.4, score: 94, speed: 72, frontier: false, color: "#d4d4d8", released: "2025-04-16" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", summary: "Multimodal generalist for text, image, and realtime product experiences.", access: ["API", "Subscription"], category: "Flagship", context: 128_000, inputPrice: 2.5, outputPrice: 10, score: 92, speed: 82, frontier: false, color: "#fafafa", released: "2024-05-13" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", summary: "Low-cost multimodal model for focused production tasks.", access: ["API"], category: "Fast", context: 128_000, inputPrice: 0.15, outputPrice: 0.6, score: 86, speed: 94, frontier: false, color: "#a1a1aa", released: "2024-07-18" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 mini", provider: "OpenAI", summary: "Fast long-context model balancing instruction following and cost.", access: ["API"], category: "Fast", context: 1_000_000, inputPrice: 0.4, outputPrice: 1.6, score: 90, speed: 91, frontier: false, color: "#71717a", released: "2025-04-14" },
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "Anthropic", summary: "Deep agentic and coding capability for long-running professional work.", access: ["API", "Subscription"], category: "Flagship", context: 200_000, inputPrice: 15, outputPrice: 75, score: 99, speed: 43, frontier: true, color: "#d97757", released: "2025-05-22" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", summary: "Strong coding and agentic performance with a balanced cost profile.", access: ["API", "Subscription"], category: "Flagship", context: 200_000, inputPrice: 3, outputPrice: 15, score: 97, speed: 69, frontier: true, color: "#e59b7f", released: "2025-05-22" },
  { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", provider: "Anthropic", summary: "Hybrid reasoning model with controllable extended thinking.", access: ["API", "Subscription"], category: "Reasoning", context: 200_000, inputPrice: 3, outputPrice: 15, score: 94, speed: 65, frontier: false, color: "#c76e50", released: "2025-02-24" },
  { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", summary: "Responsive compact model for chat and light tool workflows.", access: ["API"], category: "Fast", context: 200_000, inputPrice: 0.8, outputPrice: 4, score: 87, speed: 92, frontier: false, color: "#b65f45", released: "2024-10-22" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", summary: "Long-context multimodal reasoning across code, documents, and media.", access: ["API", "Subscription"], category: "Flagship", context: 1_048_576, inputPrice: 1.25, outputPrice: 10, score: 97, speed: 71, frontier: true, color: "#5489d6", released: "2025-03-25" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", summary: "Fast reasoning with multimodal input and adjustable thinking budgets.", access: ["API"], category: "Fast", context: 1_048_576, inputPrice: 0.3, outputPrice: 2.5, score: 92, speed: 93, frontier: false, color: "#70a0e5", released: "2025-04-17" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google", summary: "Production multimodal model optimized for throughput and price.", access: ["API"], category: "Fast", context: 1_048_576, inputPrice: 0.1, outputPrice: 0.4, score: 85, speed: 96, frontier: false, color: "#3f73bd", released: "2025-02-05" },
  { id: "gemma-3-27b", name: "Gemma 3 27B", provider: "Google", summary: "Open multimodal model for local and hosted deployments.", access: ["Open weights"], category: "Open weights", context: 128_000, inputPrice: 0.09, outputPrice: 0.17, score: 83, speed: 85, frontier: false, color: "#89b5ef", released: "2025-03-12" },
  { id: "grok-3", name: "Grok 3", provider: "xAI", summary: "Flagship reasoning and retrieval model from xAI.", access: ["API", "Subscription"], category: "Flagship", context: 131_072, inputPrice: 3, outputPrice: 15, score: 96, speed: 66, frontier: true, color: "#b7b7c1", released: "2025-02-17" },
  { id: "grok-3-mini", name: "Grok 3 Mini", provider: "xAI", summary: "Compact reasoning option with adjustable thinking effort.", access: ["API"], category: "Reasoning", context: 131_072, inputPrice: 0.3, outputPrice: 0.5, score: 89, speed: 88, frontier: false, color: "#8d8d99", released: "2025-04-09" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", summary: "Open-weight mixture-of-experts model with strong coding economics.", access: ["API", "Open weights"], category: "Open weights", context: 128_000, inputPrice: 0.27, outputPrice: 1.1, score: 92, speed: 68, frontier: false, color: "#4b7bec", released: "2024-12-26" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek", summary: "Open reasoning model with visible chain-of-thought style inference.", access: ["API", "Open weights"], category: "Reasoning", context: 128_000, inputPrice: 0.55, outputPrice: 2.19, score: 96, speed: 51, frontier: true, color: "#2d61cf", released: "2025-01-20" },
  { id: "llama-4-maverick", name: "Llama 4 Maverick", provider: "Meta", summary: "Open-weight multimodal mixture-of-experts flagship.", access: ["Open weights"], category: "Open weights", context: 1_048_576, inputPrice: 0.15, outputPrice: 0.6, score: 89, speed: 81, frontier: false, color: "#6c8ff0", released: "2025-04-05" },
  { id: "llama-4-scout", name: "Llama 4 Scout", provider: "Meta", summary: "Long-context open model built for efficient multimodal work.", access: ["Open weights"], category: "Open weights", context: 10_000_000, inputPrice: 0.08, outputPrice: 0.3, score: 86, speed: 87, frontier: false, color: "#496fd8", released: "2025-04-05" },
  { id: "llama-3.3-70b", name: "Llama 3.3 70B", provider: "Meta", summary: "Widely hosted multilingual open model for general workloads.", access: ["Open weights"], category: "Open weights", context: 128_000, inputPrice: 0.1, outputPrice: 0.32, score: 84, speed: 83, frontier: false, color: "#3657aa", released: "2024-12-06" },
  { id: "mistral-large-2", name: "Mistral Large 2", provider: "Mistral", summary: "Multilingual flagship with function calling and code capability.", access: ["API", "Open weights"], category: "Flagship", context: 128_000, inputPrice: 2, outputPrice: 6, score: 87, speed: 74, frontier: false, color: "#f2a93b", released: "2024-07-24" },
  { id: "mistral-small-3.1", name: "Mistral Small 3.1", provider: "Mistral", summary: "Compact open model for fast multimodal applications.", access: ["API", "Open weights"], category: "Fast", context: 128_000, inputPrice: 0.1, outputPrice: 0.3, score: 83, speed: 91, frontier: false, color: "#ef8f24", released: "2025-03-17" },
  { id: "codestral", name: "Codestral", provider: "Mistral", summary: "Code-specialized model for completion and repository work.", access: ["API", "Open weights"], category: "Code", context: 256_000, inputPrice: 0.3, outputPrice: 0.9, score: 88, speed: 86, frontier: false, color: "#dc721b", released: "2025-01-13" },
  { id: "command-r-plus", name: "Command R+", provider: "Cohere", summary: "Retrieval-grounded enterprise model with tool-use support.", access: ["API"], category: "Flagship", context: 128_000, inputPrice: 2.5, outputPrice: 10, score: 84, speed: 69, frontier: false, color: "#6cc6a4", released: "2024-04-04" },
  { id: "qwen3-235b", name: "Qwen3 235B", provider: "Alibaba", summary: "Large open mixture-of-experts model with thinking and fast modes.", access: ["API", "Open weights"], category: "Reasoning", context: 131_072, inputPrice: 0.22, outputPrice: 0.88, score: 93, speed: 62, frontier: false, color: "#8d6ce6", released: "2025-04-29" },
  { id: "qwen2.5-coder-32b", name: "Qwen2.5 Coder 32B", provider: "Alibaba", summary: "Open code model suited to local and hosted engineering tools.", access: ["Open weights"], category: "Code", context: 131_072, inputPrice: 0.07, outputPrice: 0.16, score: 86, speed: 79, frontier: false, color: "#7455cb", released: "2024-11-12" },
  { id: "sonar-pro", name: "Sonar Pro", provider: "Perplexity", summary: "Search-grounded answer model with citations and web context.", access: ["API", "Subscription"], category: "Flagship", context: 200_000, inputPrice: 3, outputPrice: 15, score: 85, speed: 73, frontier: false, color: "#31a6a6", released: "2025-02-11" },
  { id: "kimi-k2", name: "Kimi K2", provider: "Moonshot AI", summary: "Open agentic mixture-of-experts model for coding and tools.", access: ["API", "Open weights"], category: "Open weights", context: 131_072, inputPrice: 0.15, outputPrice: 2.5, score: null, speed: null, frontier: false, color: "#49a6db", released: "2025-07-11" },
  { id: "phi-4", name: "Phi-4", provider: "Microsoft", summary: "Small open model focused on reasoning quality per parameter.", access: ["Open weights"], category: "Reasoning", context: 16_384, inputPrice: null, outputPrice: null, score: 82, speed: null, frontier: false, color: "#5d8fda", released: "2024-12-12" },
];

export const catalogProviders = ["All", ...Array.from(new Set(catalogModels.map((model) => model.provider)))];

export function formatContext(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  return `${Math.round(value / 1_000)}K`;
}

export function formatPrice(value: number | null) {
  return value === null ? "-" : `$${value < 1 ? value.toFixed(2) : Number(value.toFixed(2))}`;
}
