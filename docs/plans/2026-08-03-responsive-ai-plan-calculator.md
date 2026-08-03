# Responsive AI Plan Calculator Implementation

## Global Constraints

- Work in `/Users/darenmini/projects/.codex-worktrees/ai-plan-responsive` on branch `codex/responsive-data-rebuild`.
- Follow strict test-driven development for behavior: write a focused test, run it and capture the expected failure, add minimal implementation, then run it green. Configuration-only files are exempt.
- Keep the product calculator-only for individual developers: no leaderboard, accounts, exports, analytics, or team budgeting.
- Never invent prices, token allowances, or subscription entitlements. A plan maximum is allowed only for an official fixed-token entitlement.
- Subscription access and usage-based API pricing remain distinct pricing bases.
- All model/plan/source identities must be stable IDs, never price values.
- Preserve the existing Cloudflare Pages production project and custom domain. Do not deploy or mutate Cloudflare resources from a worker task.
- Do not modify the supplied attachment or the vault. Commit each task when complete.

## Task 1: Verified catalog domain and Cloudflare data pipeline

Build the data foundation, API contract, tests, and deployable Cloudflare configuration.

### Domain and calculator contracts

- Replace the legacy hardcoded plan/token model with shared TypeScript contracts for `PlanOffer`, `ModelOffer`, `SourceProvenance`, and `CatalogResponse`.
- Use a discriminated plan entitlement union supporting `fixed_tokens`, `rolling_limit`, `credits`, `guardrail_limited`, and `unknown`.
- Store token prices as integer micro-dollars per one million tokens. Include input, optional cached-input, and output rates.
- Distinguish pricing basis and route: subscription, direct provider API, OpenRouter, and OpenCode Zen.
- Add pure calculator functions for weighted model cost, monthly API cost, break-even tokens, proportional model-mix redistribution, and cost-first recommendation with caveats.
- Variable-limit plans must return no maximum-plan-value calculation.

### Catalog API and fallback

- Add a same-origin Pages Function at `GET /api/catalog`, with optional `provider` filtering.
- Read the current published catalog revision from D1 through binding `CATALOG_DB`.
- Return revision/freshness metadata, plans, model offers, and provenance. Return `ETag` and public `Cache-Control`; honor matching `If-None-Match` with 304.
- When D1 is unavailable or unseeded, return a checked-in, manually verified bootstrap catalog. Mark its freshness/source status clearly; do not use synthetic model prices or entitlements.
- Include official source URLs and observation metadata for Alibaba, Anthropic, DeepSeek, xAI, Kimi, OpenAI, OpenCode, Z.AI, and OpenRouter.

### Scheduled ingestion Worker

- Add a separate Worker named `ai-plan-catalog-ingest` with D1 binding `CATALOG_DB` and R2 binding `SOURCE_SNAPSHOTS`.
- Implement source adapters with fetch, parse, validate, and provenance stages. OpenRouter and OpenCode use their official JSON model endpoints. Provider subscription data uses explicit manually verified manifests unless a stable permitted structured source is available.
- Validate required fields, non-negative integer prices, currency/units, stable unique IDs, source URLs, and entitlement shapes before publication.
- Save immutable compressed-or-plain raw evidence snapshots to R2 using dated/content-hash keys, then atomically publish a new D1 revision only after every record for that source validates. A failed refresh must leave the previous revision active.
- Cron schedules: OpenRouter every six hours, OpenCode every six hours at an offset, and one rotating subscription provider every three hours so each provider is refreshed approximately daily.
- Add D1 migrations for catalog revisions, normalized plan/model/source records, source refresh state, and publication state. Include indexes needed by the public read path.
- Add Wrangler configuration and deployment documentation for Pages bindings, Worker bindings, cron schedules, D1 migrations, R2 lifecycle retention, and Workers Builds root/deploy commands.

### Test and tooling acceptance

- Add Vitest and testing scripts.
- Unit-test calculator math, rounding, mix redistribution, break-even boundaries, recommendation behavior, and variable-limit suppression.
- Test catalog validation, duplicate rejection, malformed payloads, adapter parsing, provider filtering, ETag/304 behavior, stale/bootstrap fallback, atomic publication, and preservation of last-known-good state on failure.
- `npm test`, `npm run lint`, and `npm run build` must pass with pristine output.

## Task 2: Responsive accessible frontend rebuild

Rebuild the React frontend against Task 1's shared contracts and `/api/catalog` endpoint, using the supplied HTML as the visual reference.

### Structure and state

- Decompose the monolithic app into focused app-shell, calculator-controls, results-dashboard, comparison, recommendation, catalog hook/cache, and shared UI modules.
- Preserve provider selection, stable plan selection, multi-model selection, proportional model usage mix, input/output ratio, expected monthly usage, API-equivalent value, break-even, and conditional plan maximum.
- Add editable balanced, input-heavy, and output-heavy workload presets.
- Compare verified direct-provider, OpenRouter, and OpenCode Zen offers without merging their pricing identities.
- Derive every metric, table cell, recommendation, and chart point from current state; no reference-design sample value may remain hardcoded as a result.
- Use a transparent cost-first recommendation and show caveats for variable limits, access restrictions, stale data, and low-confidence/manual sources.

### Catalog experience

- Fetch `/api/catalog` with a small localStorage cache and conditional ETag revalidation.
- Provide skeleton loading, actionable retry/error UI, stale/bootstrap notices, last-successful refresh time, pricing-basis labels, and links to official evidence.
- Never silently substitute invented data. Empty providers/models must have actionable empty states.

### Visual, responsive, and accessible acceptance

- Implement the supplied blue/neutral visual system, light/dark themes, and the existing language selector in a compact responsive shell.
- At 320–375 px: stacked controls/results, compact two-row header, full-width controls, scaled chart, comparison tables rendered as cards, and no page-level horizontal overflow.
- At 768 px: two-column controls with stacked result sections.
- At 1024 px and above: sticky two-column controls and a 4:8 metric/chart result layout.
- At 1440 px: centered maximum-width composition with the complete hierarchy.
- Use at least 44 px touch targets, semantic landmarks/headings/fieldsets/labels/table captions/scopes, visible keyboard focus, reduced-motion support, and accessible contrast.
- Persist theme preference. The language control must remain operable without breaking calculator state.

### Frontend tests

- Add component/integration tests for calculator interactions, presets, model redistribution, recommendation changes, loading/error/stale states, evidence links, dark theme persistence, language switching, and mobile card rendering.
- Add browser-level responsive tests or an equivalent automated viewport harness for 320, 375, 768, 1024, and 1440 px, including a horizontal-overflow assertion and keyboard navigation coverage.
- `npm test`, `npm run lint`, and `npm run build` must pass with pristine output.

## Task 3: Integrated production readiness

Review and complete the integrated branch after Tasks 1 and 2.

- Resolve integration defects between frontend state, catalog API contracts, bootstrap data, Pages Functions, and Worker configuration.
- Ensure the checked-in catalog contains only source-linked verified facts and variable entitlements where providers do not publish fixed token allowances.
- Ensure source freshness, stale state, pricing route, and entitlement caveats are visible in the production UI.
- Run the complete unit, component, integration, browser-responsive, TypeScript, and production-build checks.
- Document the exact Cloudflare dashboard steps for Pages D1/R2 bindings and Workers Builds automatic deployment from `main`.
- Commit any required integration corrections and report remaining external dashboard actions separately.
