export type ArticleSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type PublishedArticle = {
  slug: string;
  title: string;
  dek: string;
  category: "Guides";
  topic: string;
  date: string;
  readTime: string;
  learn: string[];
  sections: ArticleSection[];
};

export const publishedArticles: PublishedArticle[] = [
  {
    slug: "hybrid-router",
    title: "Build a Hybrid LLM Router Without Losing Cost Control",
    dek: "A practical routing pattern that keeps a strong default, sends narrow work to efficient models, and records the evidence needed to tune the policy.",
    category: "Guides",
    topic: "Routing",
    date: "2026-08-12",
    readTime: "10 min read",
    learn: ["Define routing lanes from workload evidence", "Separate fallback behavior from normal routing", "Measure quality, latency, and cost on the same decision record"],
    sections: [
      { heading: "Start from decision lanes, not a provider list", paragraphs: ["A hybrid router is easier to reason about when each lane describes a job: fast classification, retrieval-grounded response, code repair, or deliberate reasoning. Model names are an implementation detail inside that policy.", "Write the minimum evidence and failure conditions for each lane before you add automatic selection."] },
      { heading: "Keep a reliable default and explicit fallbacks", paragraphs: ["Choose one broadly capable default for ambiguous requests. Add a fallback only for a named failure mode such as timeout, unavailable region, or context overflow."], bullets: ["Do not retry every error across every provider.", "Cap fallback depth and total request budget.", "Log which rule selected each route."] },
      { heading: "Evaluate routes with workload-shaped tests", paragraphs: ["Benchmarks are useful priors, but routing quality depends on your prompts, tools, schemas, and acceptable latency. Replay representative traces and grade the outputs against task-specific criteria."] },
      { heading: "Tune with cost and quality together", paragraphs: ["A route is not efficient if it saves token spend while increasing retries or human review. Compare completed-task cost and decision latency, not price per token alone."] },
    ],
  },
  {
    slug: "track-claude-code-usage",
    title: "Track Claude Code Usage Without Guessing at Tokens",
    dek: "Turn local session records and provider billing evidence into a transparent monthly view of coding-agent activity.",
    category: "Guides",
    topic: "Usage",
    date: "2026-08-10",
    readTime: "8 min read",
    learn: ["Separate local activity from billed usage", "Capture session-level inputs without storing sensitive prompts", "Reconcile estimates against provider evidence"],
    sections: [
      { heading: "Decide which question the tracker answers", paragraphs: ["Developer activity, model token volume, and provider invoice cost are different measures. Name the decision first so the tracker does not imply precision it cannot support."] },
      { heading: "Collect bounded local evidence", paragraphs: ["Record timestamps, model identifiers, tool-call counts, and any available usage fields. Avoid copying prompt bodies into an analytics store when aggregate fields are sufficient."], bullets: ["Use stable session identifiers.", "Preserve missing values as missing.", "Document which clients expose cached-token fields."] },
      { heading: "Reconcile with the provider bill", paragraphs: ["Treat local totals as operational evidence and the invoice as billing evidence. Differences can come from retries, background calls, caching rules, or route-specific pricing."] },
      { heading: "Report useful uncertainty", paragraphs: ["Show observed totals, estimated totals, and unreconciled gaps separately. A range with provenance is more useful than a confident but untraceable number."] },
    ],
  },
  {
    slug: "monitor-openai-codex-usage",
    title: "Monitor OpenAI Codex Usage Across Projects",
    dek: "A source-aware workflow for understanding agent sessions, workload volume, and cost signals without conflating them with subscription limits.",
    category: "Guides",
    topic: "Usage",
    date: "2026-08-08",
    readTime: "9 min read",
    learn: ["Design project and session dimensions", "Keep subscription and API evidence separate", "Build a reviewable weekly usage report"],
    sections: [
      { heading: "Model the work before the spend", paragraphs: ["Start with project, repository, session, and task outcome. Cost becomes actionable only when it can be related to completed or abandoned work."] },
      { heading: "Separate API usage from product access", paragraphs: ["A coding subscription and a metered API route can expose similar models while following different billing and capacity rules. Keep their records in separate ledgers."] },
      { heading: "Normalize only comparable fields", paragraphs: ["Convert token and currency units, but retain the original provider fields and timestamps. Do not fill an unavailable cache or reasoning-token field with zero."] },
      { heading: "Review trends with guardrails", paragraphs: ["Use a weekly view to spot changes in sessions per task, retries, and completed-task cost. Investigate discontinuities before turning them into budgets or team targets."] },
    ],
  },
  {
    slug: "openrouter-guide-model-routing-cost-controls",
    title: "OpenRouter Guide: Model Routing and Cost Controls",
    dek: "How to compare route-specific prices, pin critical behavior, and add fallback policies without hiding provider differences.",
    category: "Guides",
    topic: "Routing",
    date: "2026-08-05",
    readTime: "11 min read",
    learn: ["Read route-attributed prices correctly", "Choose when to pin a provider route", "Bound fallbacks and output spend"],
    sections: [
      { heading: "Treat the route as part of the product", paragraphs: ["The same model identifier can have different availability, latency, and price through different hosts. Preserve route attribution in every cost and performance record."] },
      { heading: "Pin behavior that must be reproducible", paragraphs: ["Pin a route when compliance, region, feature support, or evaluation reproducibility matters more than opportunistic availability."] },
      { heading: "Use fallbacks as an explicit policy", paragraphs: ["Define accepted substitutions, error classes, and spend ceilings. A fallback that changes model family should be visible in the result provenance."] },
      { heading: "Add cost controls at request boundaries", paragraphs: ["Set maximum output, context budgets, retry ceilings, and route allowlists before dispatch. Review total completed-task cost after execution."] },
    ],
  },
  {
    slug: "legitimate-free-ai-api-access-credits",
    title: "Legitimate Free AI API Access and Credits",
    dek: "A practical guide to trials, research programs, and free tiers—plus the limits and evidence to verify before building on them.",
    category: "Guides",
    topic: "Access",
    date: "2026-08-02",
    readTime: "7 min read",
    learn: ["Distinguish trials, grants, and durable free tiers", "Verify expiry and eligibility evidence", "Avoid unsafe credential-sharing offers"],
    sections: [
      { heading: "Classify the offer before comparing it", paragraphs: ["A one-time credit, time-limited trial, research grant, and permanent free quota solve different problems. Record the amount, expiry, eligible models, and account requirements."] },
      { heading: "Prefer provider and program sources", paragraphs: ["Verify the offer on the provider’s own pricing, program, or console documentation. Third-party lists can be useful discovery aids but often outlive the terms they describe."] },
      { heading: "Protect credentials and billing identity", paragraphs: ["Do not use shared keys, resold accounts, or instructions that bypass eligibility checks. Legitimate access should preserve your control over credentials and usage records."] },
      { heading: "Plan the post-credit path", paragraphs: ["Estimate the workload at published prices before the credit expires. A free start is valuable only when the migration or paid continuation is understood."] },
    ],
  },
  {
    slug: "reduce-llm-api-costs-caching-batch-output-limits",
    title: "Reduce LLM API Costs With Caching, Batch, and Output Limits",
    dek: "A measurement-first playbook for lowering spend while protecting task quality, latency, and operational reliability.",
    category: "Guides",
    topic: "Cost",
    date: "2026-07-29",
    readTime: "12 min read",
    learn: ["Build a cost baseline by completed task", "Apply caching and batch where semantics permit", "Control output, retries, and context waste"],
    sections: [
      { heading: "Build a completed-task cost baseline", paragraphs: ["Start with input, cached input, output, retries, and failed attempts for representative tasks. Provider price alone cannot explain the cost of an unreliable workflow."] },
      { heading: "Use batch processing for deferrable work", paragraphs: ["Queue evaluation, enrichment, and offline generation when the provider offers a suitable batch product. Include delayed results and retry handling in the operating model."] },
      { heading: "Cache stable prefixes and repeated reads", paragraphs: ["Caching helps when long instructions or source material repeat without semantic changes. Measure hit rate and verify how each route bills reads and writes."] },
      { heading: "Route by task and cap output", paragraphs: ["Use efficient models for bounded tasks, keep a capable fallback, and set output ceilings that match the product need. Avoid paying for verbose text that downstream code discards."] },
      { heading: "Remove retry and context waste", paragraphs: ["Repair invalid schemas at the prompt and tool boundary. Summarize or retrieve relevant context instead of repeatedly sending an entire history."] },
      { heading: "Recheck quality and privacy", paragraphs: ["Cost changes should pass the same task-level quality and privacy checks as a model migration. Savings are not real when they move work to manual review or expose sensitive data."] },
    ],
  },
];

export const prototypeInsights = [
  { slug: "prototype-price-shock", title: "Prototype insight: price-shock alerts", dek: "A concept for showing which workload assumptions are most sensitive to a provider price change.", category: "Insights" as const, topic: "Cost", date: "Prototype", readTime: "Concept" },
  { slug: "prototype-evidence-drift", title: "Prototype insight: evidence drift monitor", dek: "A concept for highlighting when leaderboard decisions depend on observations collected at materially different times.", category: "Insights" as const, topic: "Evidence", date: "Prototype", readTime: "Concept" },
];

export const guideIndexArticles = publishedArticles.filter((article) => article.slug !== "hybrid-router");
