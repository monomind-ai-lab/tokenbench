export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  context_length: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: any;
}

export interface Plan {
  name: string;
  cost: number;
  maxTokensPerMonth?: number;
}

export interface Provider {
  id: string;
  name: string;
  plans: Plan[];
  prefix: string; // The prefix in openrouter model IDs, e.g., 'anthropic/'
  url?: string;
}

export interface Language {
  code: string;
  name: string;
  native: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'zh-TW', name: 'Traditional Chinese', native: '繁體中文' },
  { code: 'zh-CN', name: 'Simplified Chinese', native: '简体中文' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
];

export const PROVIDERS: Provider[] = [
  { id: 'alibaba', name: 'ALIBABA', url: 'https://www.alibabacloud.com/campaign/ai-scene-coding', plans: [{ name: 'Free Quota', cost: 0, maxTokensPerMonth: 10 }, { name: 'Pro Token Plan', cost: 85, maxTokensPerMonth: 500 }], prefix: 'qwen/' },
  { id: 'anthropic', name: 'ANTHROPIC', url: 'https://claude.com/pricing', plans: [{ name: 'Free', cost: 0, maxTokensPerMonth: 10 }, { name: 'Pro', cost: 20, maxTokensPerMonth: 50 }, { name: 'Max (5x)', cost: 100, maxTokensPerMonth: 250 }, { name: 'Max (20x)', cost: 200, maxTokensPerMonth: 1000 }, { name: 'Team', cost: 25, maxTokensPerMonth: 100 }, { name: 'Enterprise', cost: 0, maxTokensPerMonth: 2000 }], prefix: 'anthropic/' },
  { id: 'deepseek', name: 'DEEPSEEK', url: 'https://api-docs.deepseek.com/quick_start/pricing', plans: [{ name: 'Free', cost: 0, maxTokensPerMonth: 10 }, { name: 'Plus', cost: 10, maxTokensPerMonth: 50 }, { name: 'Pro', cost: 25, maxTokensPerMonth: 150 }], prefix: 'deepseek/' },
  { id: 'grok', name: 'GROK', url: 'https://x.ai/pricing', plans: [{ name: 'Free', cost: 0, maxTokensPerMonth: 10 }, { name: 'X Premium', cost: 8, maxTokensPerMonth: 50 }, { name: 'X Premium+', cost: 16, maxTokensPerMonth: 100 }, { name: 'SuperGrok', cost: 30, maxTokensPerMonth: 250 }, { name: 'SuperGrok Heavy', cost: 300, maxTokensPerMonth: 1000 }], prefix: 'x-ai/' },
  { id: 'moonshot', name: 'MOONSHOT', url: 'https://kimi.com/help/kimi-api/api-pricing', plans: [{ name: 'Adagio (Free)', cost: 0, maxTokensPerMonth: 10 }, { name: 'Moderato', cost: 19, maxTokensPerMonth: 50 }, { name: 'Allegretto', cost: 39, maxTokensPerMonth: 250 }, { name: 'Allegro', cost: 99, maxTokensPerMonth: 750 }, { name: 'Vivace', cost: 199, maxTokensPerMonth: 1500 }], prefix: 'moonshotai/' },
  { id: 'openai', name: 'OPENAI', url: 'https://openai.com/business/pricing', plans: [{ name: 'Free', cost: 0, maxTokensPerMonth: 10 }, { name: 'Go', cost: 8, maxTokensPerMonth: 20 }, { name: 'Plus', cost: 20, maxTokensPerMonth: 50 }, { name: 'Pro (5x)', cost: 100, maxTokensPerMonth: 250 }, { name: 'Pro (20x)', cost: 200, maxTokensPerMonth: 1000 }, { name: 'Business / Team', cost: 20, maxTokensPerMonth: 100 }], prefix: 'openai/' },
  { id: 'opencode-go', name: 'OPENCODE GO', url: 'https://docs.docker.com/ai/docker-agent/providers/opencode-go', plans: [{ name: 'Go Pro', cost: 10, maxTokensPerMonth: 50 }], prefix: 'opencode-go/' },
  { id: 'zai', name: 'Z.AI', url: 'https://z.ai/subscribe?plantype=team', plans: [{ name: 'Lite', cost: 18, maxTokensPerMonth: 50 }, { name: 'Pro', cost: 80, maxTokensPerMonth: 300 }, { name: 'Max', cost: 168, maxTokensPerMonth: 700 }, { name: 'Team (Standard)', cost: 88, maxTokensPerMonth: 100 }, { name: 'Team (Premium)', cost: 188, maxTokensPerMonth: 250 }], prefix: 'zhipu/' },
];
