import type { LeaderboardKey } from '../routing/routes';

export interface GuideSource {
  readonly label: string;
  readonly url: string;
}

export interface GuideTable {
  readonly headers: string[];
  readonly rows: string[][];
}

export interface GuideSection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: string[];
  readonly steps?: string[];
  readonly bullets?: string[];
  readonly table?: GuideTable;
  readonly callout?: { readonly title: string; readonly text: string };
  readonly sources?: GuideSource[];
}

export interface GuideContextualLink {
  readonly leaderboard: LeaderboardKey;
  readonly label: string;
  readonly description: string;
}

export interface GuideArticle {
  readonly slug: string;
  readonly title: string;
  readonly seoTitle: string;
  readonly description: string;
  readonly dek: string;
  readonly category: string;
  readonly readMinutes: number;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly keywords: string[];
  readonly takeaways: string[];
  readonly sections: GuideSection[];
  readonly contextualLinks: GuideContextualLink[];
  readonly relatedSlugs: string[];
}

const publishedAt = '2026-08-04';

/** Source content retained for unified article records and legacy detail redirects. */
export const GUIDES: readonly GuideArticle[] = [
  {
    slug: 'track-claude-code-usage',
    title: 'How to Track Claude Code Usage, Tokens, and Spend',
    seoTitle: 'Track Claude Code Usage, Tokens, and Spend',
    description: 'Learn what Claude Code usage, cost, and context tools show, how subscription limits differ from API billing, and where teams can find analytics.',
    dek: 'A practical workflow for separating plan capacity, context-window pressure, and token-billed API spend before any of them surprise you.',
    category: 'Usage monitoring',
    readMinutes: 8,
    publishedAt,
    updatedAt: publishedAt,
    keywords: ['Claude Code usage', 'Claude token tracking', 'Claude Code cost', 'Anthropic usage limits'],
    takeaways: [
      'First identify whether Claude Code is using a Pro or Max plan, an organization seat, or an API key.',
      'Treat plan capacity, context fullness, and API token spend as three different measurements.',
      'Use short, repeatable checkpoints during long sessions instead of waiting for a limit warning.',
    ],
    sections: [
      {
        id: 'identify-billing-path',
        title: '1. Identify the billing path before reading the numbers',
        paragraphs: [
          'Claude Code can consume an individual Claude subscription, an eligible Team or Enterprise seat, or usage from an Anthropic Console API key. Those paths do not report cost in the same way. A Pro or Max user is consuming plan capacity; an API-key user is creating metered token spend; an organization may also have administrator analytics.',
          'Start each setup by checking which account is signed in and whether an ANTHROPIC_API_KEY is intentionally present in the environment. This prevents a common mistake: assuming a session is covered by a subscription while it is actually billing the API account.',
        ],
        callout: {
          title: 'Keep the concepts separate',
          text: 'A context window that is nearly full does not mean the monthly bill is nearly exhausted. Likewise, a plan warning is not a token-level invoice. Name the measurement before acting on it.',
        },
        sources: [
          { label: 'Models, usage, and limits in Claude Code', url: 'https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code' },
          { label: 'Use Claude Code with Pro or Max', url: 'https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan' },
        ],
      },
      {
        id: 'session-commands',
        title: '2. Check usage, cost, and context inside the session',
        paragraphs: [
          'Claude Code exposes different views for different questions. Use /usage to inspect plan and rate-limit status, /cost to review session token usage and spend when cost reporting applies, and /context to see what is occupying the current context window. /model helps confirm which model the session is using before a large task begins.',
          'Check these views at natural boundaries: after repository exploration, before a large refactor, and after a tool-heavy debugging loop. The goal is not constant surveillance. It is to catch a growing context, an unexpectedly expensive model, or an unintended billing path while the session is still easy to correct.',
        ],
        steps: [
          'At the start, confirm the signed-in account and selected model.',
          'After exploration, open /context and remove or compact material that no longer helps the task.',
          'For API-billed work, check /cost after a representative task and use it as a baseline—not a guarantee for every future task.',
          'For subscription work, check /usage before starting another long agentic run.',
        ],
        sources: [
          { label: 'Claude Code cheatsheet', url: 'https://support.claude.com/en/articles/14553413-claude-code-cheatsheet' },
        ],
      },
      {
        id: 'shared-limits',
        title: '3. Understand shared subscription limits',
        paragraphs: [
          'For Pro and Max users, Claude and Claude Code draw from shared capacity. A long coding session can therefore affect availability in the Claude app, and heavy app usage can affect the next Claude Code session. Published capacity is variable because task complexity, model choice, conversation length, and tool use all matter.',
          'When a warning appears, reduce unnecessary context first. Split unrelated work into a new session, ask for smaller outputs, and use a faster model when frontier reasoning is not required. Upgrading should be the last step after confirming that the workload—not an avoidable workflow habit—is driving the limit.',
        ],
        bullets: [
          'Do not translate a plan warning into a fabricated token allowance.',
          'Do not assume every repository or prompt consumes capacity at the same rate.',
          'Do record the task type and model when a limit arrives earlier than expected.',
        ],
        sources: [
          { label: 'Use Claude Code with Pro or Max', url: 'https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan' },
        ],
      },
      {
        id: 'team-analytics',
        title: '4. Use organization analytics when your role supports them',
        paragraphs: [
          'Eligible Team, Enterprise, and Console roles can use Claude Code analytics for an organization-level view. This is useful for adoption, activity, and cost governance, but it is not a substitute for understanding an individual session. Personal Pro and Max accounts should not expect the same administrative dashboard.',
          'For teams, review trends by week rather than reacting to one expensive day. Pair usage data with successful task counts, pull requests, or time saved. Cost per successful outcome is more useful than raw token volume because a cheap run that produces rework is not actually efficient.',
        ],
        sources: [
          { label: 'Claude Code usage analytics', url: 'https://support.claude.com/en/articles/12157520-claude-code-usage-analytics' },
        ],
      },
      {
        id: 'weekly-routine',
        title: '5. Adopt a ten-minute weekly review',
        paragraphs: [
          'Review which model handled each recurring workflow, which sessions repeatedly filled their context, and whether API-billed tasks had a stable cost range. Then choose one adjustment for the next week: a smaller model for routine edits, a shorter repository briefing, or a fresh session between unrelated tasks.',
          'Use the calculator to compare the observed API-equivalent value with your subscription fee. Because Claude plan limits are variable, treat the result as a decision aid and keep the provider evidence open before buying or upgrading.',
        ],
        bullets: [
          'Record one representative /cost result for each API-billed workflow.',
          'Record when shared plan warnings appear and what task preceded them.',
          'Remove stale instructions and duplicated context from project setup files.',
          'Revisit the plan only after two or three weeks of comparable data.',
        ],
      },
    ],
    contextualLinks: [
      {
        leaderboard: 'llm-pricing-context',
        label: 'Review AI model pricing and context',
        description: 'Inspect route-specific provider pricing and declared context limits alongside your observed Claude Code workflow.',
      },
    ],
    relatedSlugs: ['monitor-openai-codex-usage', 'reduce-llm-api-costs-caching-batch-output-limits', 'openrouter-guide-model-routing-cost-controls'],
  },
  {
    slug: 'monitor-openai-codex-usage',
    title: 'How to Monitor OpenAI Codex Usage, Credits, and Token Costs',
    seoTitle: 'Monitor OpenAI Codex Usage, Credits, and Costs',
    description: 'Find Codex usage and credits, understand token-based rates, separate ChatGPT entitlements from API billing, and set practical personal or team limits.',
    dek: 'Codex can draw from a ChatGPT plan, flexible credits, or the OpenAI API. Here is how to tell which meter you are looking at and turn it into a useful budget.',
    category: 'Usage monitoring',
    readMinutes: 8,
    publishedAt,
    updatedAt: publishedAt,
    keywords: ['Codex usage', 'OpenAI Codex credits', 'Codex token cost', 'ChatGPT Codex limits'],
    takeaways: [
      'Keep ChatGPT Codex usage and OpenAI Platform API billing in separate reports.',
      'Input, cached input, and output tokens can consume credits at different rates.',
      'Use task outcomes and recent usage together when setting personal or workspace limits.',
    ],
    sections: [
      {
        id: 'separate-meters',
        title: '1. Separate ChatGPT Codex credits from API billing',
        paragraphs: [
          'A Codex task launched through a ChatGPT entitlement or flexible credit balance is not the same billing stream as an application calling the OpenAI Platform API. The interfaces, permissions, and accounting units differ. Combining them into one spreadsheet without a billing-path column creates misleading totals.',
          'Label every record as subscription capacity, flexible agentic credits, or Platform API spend. If a team uses more than one path, assign owners and budgets separately before creating an overall AI total.',
        ],
        callout: {
          title: 'A dashboard is only meaningful when the meter is named',
          text: 'Do not use Platform API costs as a proxy for ChatGPT Codex usage, and do not interpret a ChatGPT credit balance as an API account balance.',
        },
        sources: [
          { label: 'Codex rate card', url: 'https://help.openai.com/en/articles/20001106-codex-rate-card-2' },
          { label: 'OpenAI Usage API', url: 'https://platform.openai.com/docs/api-reference/usage' },
        ],
      },
      {
        id: 'usage-panel',
        title: '2. Read the Codex Usage panel',
        paragraphs: [
          'Open Codex settings and find the Usage panel or Usage Dashboard available to your plan and role. Depending on the account, it can show current limits, recent usage, remaining credits, purchasing options, or auto-reload controls. Treat the live panel as the source of truth because models, rates, and entitlements can change.',
          'Check it after representative tasks rather than after every prompt. A repository-wide refactor, a small bug fix, and a long research task have very different profiles. Grouping them together hides the work that actually consumes the budget.',
        ],
        steps: [
          'Capture the task type, model, and date before starting a representative run.',
          'Review the Usage panel immediately after completion.',
          'Record whether the run succeeded without retries or manual rework.',
          'Repeat the same task class a few times before treating the average as a planning number.',
        ],
        sources: [
          { label: 'Codex rate card and Usage panel', url: 'https://help.openai.com/en/articles/20001106-codex-rate-card-2' },
          { label: 'Flexible usage credits', url: 'https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-free-go-plus-pro-sora' },
        ],
      },
      {
        id: 'token-mix',
        title: '3. Watch the token mix, not only the total',
        paragraphs: [
          'Codex usage is token-based for most plans, but input, cached input, and output can consume credits at different rates. Large repository context raises input; repeated stable context may benefit from caching; verbose answers increase output. Tool calls and task complexity also affect the final amount.',
          'This is why two tasks with similar prompt length can use very different credits. When a workflow becomes expensive, inspect whether the cause is oversized context, repeated uncached instructions, a high-end model, long output, or retries caused by weak task definitions.',
        ],
        bullets: [
          'Keep stable instructions concise and reusable.',
          'Ask for the artifact you need, not a second narrative copy of the same work.',
          'Start with the least-expensive model that passes your quality check.',
          'Create a new task when the objective changes materially.',
        ],
        sources: [
          { label: 'Codex rate card', url: 'https://help.openai.com/en/articles/20001106-codex-rate-card-2' },
        ],
      },
      {
        id: 'personal-team-controls',
        title: '4. Set personal and workspace controls',
        paragraphs: [
          'For personal use, avoid automatic top-ups until you understand a normal week. Start with a small explicit credit purchase, turn on notifications where available, and review the recent-usage list before reloading. For organizations, assign limits by seat type or individual when the workspace supports it.',
          'A limit should protect the budget without blocking valuable work. Set a warning below the hard ceiling, document how a user requests more, and review exceptions by task outcome. A fixed cap with no escalation path often pushes work into unmanaged personal accounts.',
        ],
        sources: [
          { label: 'Flexible usage credits', url: 'https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-free-go-plus-pro-sora' },
          { label: 'Business spend controls', url: 'https://help.openai.com/en/articles/20001155' },
        ],
      },
      {
        id: 'monthly-review',
        title: '5. Reconcile outcomes, credits, and API costs monthly',
        paragraphs: [
          'Use the OpenAI Platform Usage API or Costs endpoint for API reporting and the Codex Usage panel for ChatGPT-side Codex consumption. Reconcile each to its own invoice or credit pool, then combine the categories only in a final management view.',
          'Track cost per accepted change, resolved issue, or completed research artifact. This makes model and plan decisions clearer than a raw token chart. When the pattern is stable, compare it with the calculator and decide whether a subscription, API route, or hybrid is the better operating model.',
        ],
        sources: [
          { label: 'OpenAI Usage API', url: 'https://platform.openai.com/docs/api-reference/usage' },
        ],
      },
    ],
    contextualLinks: [
      {
        leaderboard: 'llm-pricing-context',
        label: 'Review AI model pricing and context',
        description: 'Compare provider route pricing and context declarations before treating one usage meter as an API estimate.',
      },
    ],
    relatedSlugs: ['track-claude-code-usage', 'reduce-llm-api-costs-caching-batch-output-limits', 'openrouter-guide-model-routing-cost-controls'],
  },
  {
    slug: 'openrouter-guide-model-routing-cost-controls',
    title: 'OpenRouter for Beginners: One API, Model Routing, and Cost Controls',
    seoTitle: 'OpenRouter Beginner Guide: Routing and Cost Controls',
    description: 'Use OpenRouter’s OpenAI-compatible API, choose models and providers, add controlled fallbacks, monitor spend, and apply practical privacy settings.',
    dek: 'OpenRouter can simplify multi-model access, but resilient routing needs explicit budgets, logging, and provider-policy choices.',
    category: 'API routing',
    readMinutes: 10,
    publishedAt,
    updatedAt: publishedAt,
    keywords: ['OpenRouter guide', 'OpenRouter API', 'AI model routing', 'OpenRouter cost controls'],
    takeaways: [
      'Use a specific model first; add aliases and fallbacks only when the product benefits from them.',
      'Log the model and provider that actually served every routed request.',
      'Treat privacy and retention as provider-level decisions, not a blanket property of the router.',
    ],
    sections: [
      {
        id: 'when-to-use',
        title: '1. Decide whether a router is the right abstraction',
        paragraphs: [
          'OpenRouter offers one API surface for many models and providers. It is useful when an application needs model choice, provider fallbacks, centralized credits, or normalized reporting. Direct provider access may be simpler when one vendor is strategic, the workload needs a provider-specific feature, or compliance requires a direct contract.',
          'Begin with a narrow reason for adding a router. “We want every model” creates operational noise; “we need a backup provider for this supported model” is testable. Keep the direct route available in your architecture when a feature or contract makes it necessary.',
        ],
        sources: [
          { label: 'OpenRouter quickstart', url: 'https://openrouter.ai/docs/quickstart' },
        ],
      },
      {
        id: 'first-request',
        title: '2. Make the first request with a scoped key',
        paragraphs: [
          'Create an API key for one environment or application, then point an OpenAI-compatible client at OpenRouter’s base URL. Keep the key server-side, load it from a secret store, and give separate keys to development and production so usage can be filtered later.',
          'Select a specific model ID for the first integration. Send a small deterministic request, record the response model, and confirm the activity appears under the expected key before adding streaming, tools, or fallbacks.',
        ],
        steps: [
          'Create a dedicated development key and set a conservative credit limit.',
          'Configure the OpenRouter base URL documented in the quickstart.',
          'Call one explicit model with a small maximum output.',
          'Log request ID, returned model, provider when available, token usage, latency, and cost.',
          'Rotate the key immediately if it was ever placed in browser code or source control.',
        ],
        sources: [
          { label: 'OpenRouter quickstart', url: 'https://openrouter.ai/docs/quickstart' },
        ],
      },
      {
        id: 'routing-controls',
        title: '3. Add routing controls deliberately',
        paragraphs: [
          'Default routing balances provider availability while prioritizing price, but production requirements are rarely just “cheapest.” OpenRouter supports provider ordering, fallback behavior, price caps, latency or throughput preferences, and zero-data-retention routing. Each control should map to an application requirement and a test.',
          'A fallback improves availability but can change which model or provider serves the request. Evaluate fallback models against the same task set, cap the acceptable price, and surface the returned model in logs. Never assume an alias always resolves to the same model.',
        ],
        bullets: [
          'Price-sensitive batch work: cap price and allow slower providers.',
          'Interactive work: set latency expectations and a limited fallback chain.',
          'Regulated data: restrict providers using the exact retention and policy controls you require.',
          'Model-specific features: disable fallback to models that cannot satisfy the request schema.',
        ],
        sources: [
          { label: 'Provider routing', url: 'https://openrouter.ai/docs/guides/routing/provider-selection' },
          { label: 'Model fallbacks', url: 'https://openrouter.ai/docs/guides/routing/model-fallbacks' },
        ],
      },
      {
        id: 'monitor-spend',
        title: '4. Monitor activity and credit balance',
        paragraphs: [
          'Use the Activity page to filter historical usage by model, provider, and API key. A credits endpoint can expose current balance for an internal monitor. Build alerts from both spend and behavior: sudden cost, a fallback rate spike, a new provider, or a model mix that changed without a release.',
          'Measure cost per successful request rather than the listed unit price alone. A cheap model with retries, invalid tool calls, or heavy manual review can cost more than a higher-priced model that succeeds on the first attempt.',
        ],
        bullets: [
          'Set separate keys and budgets by environment.',
          'Alert on daily spend and on unexpected model/provider identities.',
          'Retain the returned model and usage fields with the application trace.',
          'Review fallbacks as an error-budget signal, not only a reliability feature.',
        ],
        sources: [
          { label: 'OpenRouter FAQ and activity reporting', url: 'https://openrouter.ai/docs/faq' },
        ],
      },
      {
        id: 'privacy-check',
        title: '5. Check the exact provider policy before sensitive work',
        paragraphs: [
          'Providers connected through OpenRouter can have different logging, retention, and training policies. OpenRouter exposes policy information and controls, but it does not make every provider’s behavior identical. Review the chosen endpoint, enable zero-data-retention routing when required, and test that restricted requests do not silently fall back to an ineligible provider.',
          'Document the policy decision next to the route configuration. If the data category requires a direct agreement or specific geographic processing, a direct provider integration may be the right answer even when routing is convenient.',
        ],
        sources: [
          { label: 'Provider logging and privacy controls', url: 'https://openrouter.ai/docs/guides/privacy/provider-logging' },
        ],
      },
    ],
    contextualLinks: [
      {
        leaderboard: 'llm-pricing-context',
        label: 'Review AI model pricing and context',
        description: 'Review price and context declarations for the model routes you are considering before setting a routing policy.',
      },
    ],
    relatedSlugs: ['legitimate-free-ai-api-access-credits', 'reduce-llm-api-costs-caching-batch-output-limits', 'monitor-openai-codex-usage'],
  },
  {
    slug: 'legitimate-free-ai-api-access-credits',
    title: '5 Legitimate Free AI API Options—and the Limits That Matter',
    seoTitle: '5 Legitimate Free AI API Options and Their Limits',
    description: 'Compare five official free AI API options for experiments, including quotas, privacy, regional availability, and production-readiness caveats.',
    dek: '“Free” can mean a recurring quota, selected free models, or daily compute. Use these official options for experiments, then plan the production migration before traffic arrives.',
    category: 'Free API access',
    readMinutes: 9,
    publishedAt,
    updatedAt: publishedAt,
    keywords: ['free AI API', 'free LLM API', 'Gemini API free tier', 'OpenRouter free models', 'Workers AI free'],
    takeaways: [
      'Treat every free offering as limited experimentation capacity, not unlimited production inference.',
      'Check regional availability, data terms, model access, and organization-level rate limits before building.',
      'Design a paid migration path and a hard budget before the prototype gains users.',
    ],
    sections: [
      {
        id: 'meaning-of-free',
        title: '1. Define what “free” means for your experiment',
        paragraphs: [
          'A free AI API may provide a recurring quota, selected zero-price models, a daily compute allowance, or rate-limited prototyping access. Those are different products. None should be described as permanently unlimited, and most are intentionally unsuitable for production traffic.',
          'Before integrating, write down the expected requests per day, acceptable latency, data sensitivity, required region, and exit plan. A free tier is valuable when it accelerates learning without locking the application to assumptions that disappear at launch.',
        ],
        callout: {
          title: 'Review date: August 4, 2026',
          text: 'Free tiers change frequently. Follow each official source link and confirm current quotas, model access, and data terms before creating an account or deploying an application.',
        },
      },
      {
        id: 'five-options',
        title: '2. Compare five official options',
        paragraphs: [
          'These services publish a genuine free allocation or free-plan access. The comparison focuses on the kind of allowance and the operational caveat that matters most; it intentionally avoids temporary referral codes and generic trial-credit lists.',
        ],
        table: {
          headers: ['Service', 'What the free option provides', 'Limit to verify'],
          rows: [
            ['Gemini API', 'A free tier with selected model access and free input/output usage under published limits.', 'Model quotas, supported regions, and free-tier data-use terms vary.'],
            ['Groq', 'A published free-plan rate-limit table for supported models.', 'Limits apply at the organization level and vary by model.'],
            ['OpenRouter', 'A free plan with free models and a free-model router.', 'Daily request limits and model availability are intentionally constrained.'],
            ['GitHub Models', 'Free, rate-limited model access for prototyping and experimentation with a GitHub account.', 'Limits vary by model and plan; enabling paid usage changes the budget model.'],
            ['Cloudflare Workers AI', 'A daily allocation measured in Neurons for serverless AI inference.', 'Neurons are model-dependent compute units, not a universal token allowance.'],
          ],
        },
        sources: [
          { label: 'Gemini API pricing', url: 'https://ai.google.dev/gemini-api/docs/pricing' },
          { label: 'Groq rate limits', url: 'https://console.groq.com/docs/rate-limits' },
          { label: 'OpenRouter pricing', url: 'https://openrouter.ai/pricing' },
          { label: 'GitHub Models billing', url: 'https://docs.github.com/en/billing/concepts/product-billing/github-models' },
          { label: 'Cloudflare Workers AI pricing', url: 'https://developers.cloudflare.com/workers-ai/platform/pricing/' },
        ],
      },
      {
        id: 'gemini-groq',
        title: '3. Choose Gemini API or Groq for a direct-provider prototype',
        paragraphs: [
          'Gemini API is a useful starting point when the target Google model and region are supported. Verify the exact model’s rate limit and whether free-tier content may be used to improve Google products. Move sensitive or production data only after the account tier and data terms match the workload.',
          'Groq publishes free-plan limits across supported models and returns rate-limit information in response headers. It can be a strong fit for latency experiments, but the organization-wide limit means multiple applications can compete for the same allowance. Build backoff and quota reporting from the first request.',
        ],
        sources: [
          { label: 'Gemini API rate limits', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' },
          { label: 'Gemini API available regions', url: 'https://ai.google.dev/gemini-api/docs/available-regions' },
          { label: 'Groq rate limits', url: 'https://console.groq.com/docs/rate-limits' },
        ],
      },
      {
        id: 'openrouter-github',
        title: '4. Use OpenRouter or GitHub Models for multi-model experiments',
        paragraphs: [
          'OpenRouter exposes multiple free models and a free-model router, which is convenient for exploring model behavior through one API. The tradeoff is variable model availability and low request limits. Log the returned model and never build a production promise around whichever free endpoint happens to be available today.',
          'GitHub Models provides rate-limited access for prototyping with a GitHub account. It is useful when model experiments already live near a repository or GitHub workflow. Check the selected model’s current limits and ensure paid usage cannot be enabled accidentally by an unrelated account change.',
        ],
        sources: [
          { label: 'OpenRouter free models router', url: 'https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground' },
          { label: 'GitHub Models billing', url: 'https://docs.github.com/en/billing/concepts/product-billing/github-models' },
        ],
      },
      {
        id: 'workers-ai',
        title: '5. Use Workers AI for serverless experiments close to application code',
        paragraphs: [
          'Cloudflare Workers AI includes a daily free allocation measured in Neurons. It is useful for small serverless experiments because inference can sit beside a Worker or Pages application. Neuron usage varies by model, so compare the model-specific multiplier rather than converting the allowance into a made-up universal token number.',
          'Track daily Neurons, return a clear error or fallback when the allocation is exhausted, and require an explicit decision before enabling paid overage. If the experiment grows, estimate the paid workload using the actual model and request distribution observed during the free period.',
        ],
        sources: [
          { label: 'Workers AI pricing', url: 'https://developers.cloudflare.com/workers-ai/platform/pricing/' },
        ],
      },
      {
        id: 'production-migration',
        title: '6. Prepare the production migration before launch',
        paragraphs: [
          'Wrap the provider behind a small internal interface, keep model IDs in configuration, and log usage from day one. Define the paid provider or model that will take over when the free quota, latency, privacy, or reliability no longer fits.',
          'Run a load test below the published limit, add retry and backoff behavior, and set a hard paid budget before enabling billing. The best free tier is the one that teaches you the real workload without becoming an architectural trap.',
        ],
        bullets: [
          'Keep keys server-side and separate by environment.',
          'Record model, input/output usage, latency, status, and cost when reported.',
          'Test quota exhaustion as a normal product state.',
          'Review official terms again immediately before production launch.',
        ],
      },
    ],
    contextualLinks: [
      {
        leaderboard: 'llm-pricing-context',
        label: 'Review AI model pricing and context',
        description: 'Use route-level pricing context to plan the paid path before a free-tier prototype reaches production traffic.',
      },
    ],
    relatedSlugs: ['openrouter-guide-model-routing-cost-controls', 'reduce-llm-api-costs-caching-batch-output-limits', 'track-claude-code-usage'],
  },
  {
    slug: 'reduce-llm-api-costs-caching-batch-output-limits',
    title: 'Lower LLM API Costs with Caching, Batch Jobs, and Output Caps',
    seoTitle: 'Lower LLM API Costs with Caching, Batch, and Caps',
    description: 'Cut LLM API spend responsibly by measuring token mix, batching non-urgent work, caching repeated context, and controlling model and output budgets.',
    dek: 'Cost optimization works when it reduces cost per successful task—not when it simply shifts expense into retries, latency, or human review.',
    category: 'Cost optimization',
    readMinutes: 11,
    publishedAt,
    updatedAt: publishedAt,
    keywords: ['reduce LLM API cost', 'prompt caching', 'Batch API', 'output token limit', 'AI cost optimization'],
    takeaways: [
      'Baseline input, cached input, output, tool, reasoning, and retry costs before optimizing.',
      'Move non-interactive work to discounted batch processing and cache only context that truly repeats.',
      'Choose models and output caps with an evaluation set so savings do not create rework.',
    ],
    sections: [
      {
        id: 'baseline',
        title: '1. Build a cost baseline by workload',
        paragraphs: [
          'Start with a week of representative requests grouped by product workflow: support classification, document extraction, coding assistance, research, or content generation. Record input, cached input, output, retries, tool calls, model, latency, and whether the result passed review.',
          'Calculate cost per successful task. Unit prices alone cannot reveal that a smaller model retries twice or that a verbose workflow adds expensive output no user reads. Keep interactive and offline workloads separate because their latency requirements lead to different optimizations.',
        ],
        steps: [
          'Choose three to five high-volume workflows.',
          'Capture at least a representative sample for each model and route.',
          'Mark success using a test, reviewer decision, or product outcome.',
          'Rank opportunities by total monthly cost, not by the largest percentage discount.',
        ],
      },
      {
        id: 'batch',
        title: '2. Move non-urgent work to batch processing',
        paragraphs: [
          'OpenAI and Anthropic publish discounted batch processing for work that does not need an immediate response. Good candidates include nightly classification, evaluation runs, catalog enrichment, and document backfills. User-facing chat, live coding, and synchronous validation usually belong on real-time endpoints.',
          'Design batch jobs to be restartable. Store a stable request ID, validate outputs before publishing them, and retry only failed items. A discount disappears quickly if a malformed batch must be rerun in full.',
        ],
        bullets: [
          'Batch only workloads that can tolerate the documented completion window.',
          'Split very large jobs into auditable chunks.',
          'Validate schemas and model availability before upload.',
          'Reconcile batch output IDs to the original records before downstream use.',
        ],
        sources: [
          { label: 'OpenAI Batch API', url: 'https://platform.openai.com/docs/api-reference/batch' },
          { label: 'Anthropic pricing and batch discount', url: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },
        ],
      },
      {
        id: 'prompt-caching',
        title: '3. Cache repeated context—after measuring reuse',
        paragraphs: [
          'Prompt caching is valuable when a large, stable prefix appears across many requests: a system policy, tool schema, codebase briefing, or reference document. Put stable material first and changing user input later so the provider has a reusable prefix. Then monitor cache reads and the effective cost per request.',
          'Caching can cost more for one-off work because writes may carry a premium and never receive a hit. Estimate the break-even number of reads using the provider’s current write and read rates. Also review data-retention implications before enabling extended caching for sensitive workloads.',
        ],
        callout: {
          title: 'Cache design rule',
          text: 'Cache stable, high-token prefixes that repeat. Do not pad a prompt or freeze rapidly changing context merely to chase a cache hit.',
        },
        sources: [
          { label: 'Anthropic pricing and prompt caching rates', url: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },
          { label: 'OpenAI Responses API usage details', url: 'https://platform.openai.com/docs/api-reference/responses' },
          { label: 'OpenAI data controls by endpoint', url: 'https://platform.openai.com/docs/models/default-usage-policies-by-endpoint' },
        ],
      },
      {
        id: 'models-and-caps',
        title: '4. Route by task and cap output',
        paragraphs: [
          'Use the least-expensive model that meets a written quality threshold for each task. A compact model may handle classification and extraction while a frontier model handles ambiguous reasoning. Route escalation from an observable signal—confidence, validation failure, or task type—not from a random percentage.',
          'Set an output ceiling appropriate to the artifact. Ask for structured fields when the product needs fields, a patch when it needs a patch, and a concise explanation only when a human will read it. Very low caps can truncate results and create retries, so test them against long-tail cases.',
        ],
        steps: [
          'Create a small evaluation set with normal and difficult examples.',
          'Test a lower-cost model and define the failure conditions that trigger escalation.',
          'Set the output cap slightly above the longest accepted result in the evaluation.',
          'Measure total cost including retries and escalations before rollout.',
        ],
      },
      {
        id: 'retries-context',
        title: '5. Remove hidden waste from retries and context',
        paragraphs: [
          'Repeated instructions, full conversation replays, duplicated documents, and unconstrained retry loops often create more waste than the model choice. Summarize durable state, send only relevant retrieval results, validate locally when possible, and stop retrying after a known number of attempts.',
          'Log why a retry happened. A transient provider error, invalid JSON, insufficient context, and a weak prompt require different fixes. Blindly changing the temperature or resending the same request spends money without adding information.',
        ],
        bullets: [
          'Deduplicate retrieved passages before constructing the prompt.',
          'Use schema validation and targeted repair instead of regenerating a whole response.',
          'Keep conversation summaries separate from raw history and refresh them intentionally.',
          'Set retry counts, backoff, and maximum total cost per task.',
        ],
      },
      {
        id: 'verify-savings',
        title: '6. Verify savings with quality and privacy checks',
        paragraphs: [
          'Compare the new workflow with the baseline using cost per accepted result, latency, error rate, reviewer time, and data-handling requirements. Roll out one change at a time so the effect is attributable. A cheaper bill paired with slower users or more production incidents is not a win.',
          'Review provider evidence whenever prices or models change, then update the calculator with the observed token mix. Keep an explicit rollback path for every routing, caching, and batch change.',
        ],
        table: {
          headers: ['Metric', 'Why it matters'],
          rows: [
            ['Cost per successful task', 'Includes retries and quality failures that token price misses.'],
            ['Cache hit rate', 'Shows whether write premiums are being amortized.'],
            ['Escalation rate', 'Reveals whether a lower-cost first model is actually efficient.'],
            ['P95 latency', 'Protects the user experience during routing changes.'],
            ['Human review minutes', 'Captures cost shifted from inference to people.'],
          ],
        },
      },
    ],
    contextualLinks: [
      {
        leaderboard: 'llm-coding',
        label: 'Review AI coding model benchmarks',
        description: 'Use coding benchmark context to decide which models deserve a workload-specific evaluation.',
      },
      {
        leaderboard: 'llm-value',
        label: 'Explore the LLM value frontier',
        description: 'Compare disclosed workload costs and capability evidence without treating a leaderboard as a universal score.',
      },
    ],
    relatedSlugs: ['track-claude-code-usage', 'monitor-openai-codex-usage', 'openrouter-guide-model-routing-cost-controls'],
  },
];

export const GUIDE_BY_SLUG = new Map(GUIDES.map((guide) => [guide.slug, guide]));

export function articlePath(slug: string): string {
  return `/articles/${slug}/`;
}

/** @deprecated Use articlePath for canonical article destinations. */
export function guidePath(slug: string): string {
  return articlePath(slug);
}

export function legacyGuidePath(slug: string): string {
  return `/guides/${slug}/`;
}

export function relatedGuides(guide: GuideArticle): GuideArticle[] {
  return guide.relatedSlugs.map((slug) => GUIDE_BY_SLUG.get(slug)).filter((item): item is GuideArticle => Boolean(item));
}
