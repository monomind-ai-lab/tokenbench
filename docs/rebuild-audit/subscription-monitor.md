# Subscription plan monitor

Date: 2026-08-21
Automation: `tokenbench-subscription-plan-monitor` (retired)
Status: replaced by the checkpointed catalog Worker subscription retrieval phase
Deployment: code/config ready; deployment not performed or authorized

## Approved provider scope

The subscription and usage-limit catalog is intentionally limited to the seven
provider families present in the reviewed subscription matrix:

1. ChatGPT / OpenAI
2. Claude / Anthropic
3. Gemini / Google
4. Grok / xAI
5. GLM Coding / Z.ai
6. Perplexity
7. Microsoft Copilot

Alibaba, DeepSeek, Kimi, and other current manual-manifest entries are not part
of the approved consumer-subscription UI scope. Removing or migrating those
legacy entries is data-wiring work and must preserve historical provenance.

## Evidence policy

- Official public provider pricing, plan, terms, and help pages are primary.
- The automation checks current robots policy before retrieving a page. It does
  not authenticate, enter checkout, discover hidden APIs, or bypass a block.
- [AI Pricing Guru](https://www.aipricing.guru/subscriptions/) is a secondary
  discrepancy detector only. It can identify a missing plan or price drift but
  cannot override a verified first-party fact.
- Dynamic wording such as “higher limits” remains `dynamic_unknown`. Relative
  allowances remain relative or projected. No numeric cap, token conversion,
  included model, or API-equivalent entitlement is inferred.
- Conflicting or missing official evidence marks a fact `stale` or
  `needs_review`; the last verified value is not silently overwritten.

## First-party starting points

| Provider | Pricing / plans | Limits / inclusions |
| --- | --- | --- |
| OpenAI | [ChatGPT pricing](https://openai.com/chatgpt/pricing) | [ChatGPT Plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus) |
| Anthropic | [Claude pricing](https://www.anthropic.com/pricing?subjects=claude&type=product) | [Plan comparison](https://support.anthropic.com/en/articles/11049762-choosing-a-claude-ai-plan) and [usage guidance](https://support.anthropic.com/en/articles/9797557-usage-limit-best-practices) |
| Google | [Gemini subscriptions](https://gemini.google/us/subscriptions/?hl=en) | [Gemini limits](https://support.google.com/gemini/answer/16275805?hl=en) |
| xAI | [xAI pricing](https://x.ai/pricing) | [Grok FAQ](https://docs.x.ai/grok/faq) |
| Z.ai | [GLM Coding plans](https://z.ai/subscribe) | [Usage policy](https://docs.z.ai/devpack/usage-policy) and [subscription terms](https://docs.z.ai/legal-agreement/subscription-terms) |
| Perplexity | [Perplexity Pro](https://www.perplexity.ai/pro) | [Plan comparison](https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you) |
| Microsoft | [Copilot Pro](https://www.microsoft.com/en-us/store/b/copilotpro) and [Microsoft 365 Premium](https://www.microsoft.com/en-us/microsoft-365/p/microsoft-365-premium/cfq7ttc11z3q) | [AI credits and limits](https://support.microsoft.com/en-us/microsoft-365-copilot/ai-credits-and-limits-for-microsoft-365-subscriptions) |

## Output and publication boundary

The production path now runs in `workers/catalog-ingest/src/subscription-crawler.ts`
inside the daily checkpointed catalog cycle. It fetches only the seven
allowlisted source pages after checking each origin's `robots.txt`, stores a
bounded raw HTML snapshot in R2, and writes a combined crawl receipt before
staging. The existing manual manifests are the baseline: the first successful
crawl records an official HTML snapshot while preserving reviewed plan and
entitlement facts. A 304 or unchanged hash keeps the existing facts. A changed
page with incomplete recognized facts preserves explicit parsed prices only and
marks entitlements `stale` with `reviewStatus: needs_review`; robots blocks,
transient failures, and unsupported pages leave the last-good catalog active.

The staged candidate passes the existing catalog validator and is published by
the same guarded D1 catalog/cache pointer transaction used for model/API data.
Pages already read the published catalog through `/api/catalog`, so no frontend
fallback or separate subscription database is involved. Perplexity and
Microsoft records are captured as provenance/review receipts until a page
publishes a complete, reviewed plan fact; the crawler never fabricates them.

The former local report-only automation was intentionally retired after this
Worker path was implemented. The checked-in `docs/data-refresh/` files remain
historical evidence and are not the production publication mechanism.

The checked-in manual manifest still lacks reviewed Perplexity and Microsoft /
Copilot plan offers. The crawler can now retain their raw evidence and
`needs_review` provenance, but a reviewed catalog decision is required before
those plans appear as consumer recommendations.
