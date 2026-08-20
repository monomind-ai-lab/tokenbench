# Unapproved page parity backlog

Last reconciled: 2026-08-21
Immutable authority: `https://8bf19b96.tokenbench-27t.pages.dev/`

## Policy

For every route in this backlog, reproduce the immutable page section by
section before applying new Next.js tokens. Styling may change; page structure,
information hierarchy, controls, charts, actions, URL/query behavior, responsive
table/card behavior, and explicit unavailable states may not be removed,
collapsed, replaced, or fabricated. Where strict-v1 or source facts are not
available, keep the corresponding structural slot visible with its honest
unavailable state.

Visual-design approvals are out of scope here: `/leaderboards/` plus all 14
published children, and `/subscribe-vs-api/`, are approved and must not be
reopened. Their data wiring remains a separate non-visual task.

## Ordered backlog

1. **Route coverage first — completed 2026-08-21.** Immutable-structure Next
   routes now cover
   `/models/<slug>/` (4,455 profiles), `/compare/<pair>` (29 pairs),
   `/make-it-yours/`, and `/llm-price-performance/`. Each must render its
   complete source/unavailable/not-found state before live facts are available.
   Production endpoint availability and cross-page data review remain in the
   data-wiring checkpoint; see `checkpoint-3-route-coverage.md`.
2. **Model decision core — P0.** Rewire `/models/`,
   `/model-profile?model=<slug>`, `/models/<slug>/`, `/compare/`, and
   `/compare/<pair>` from local catalog/derived chart fixtures to the strict-v1
   models, profile, and comparison boundaries. Preserve two-to-four ordering,
   canonical cleanup, source ledgers, route-specific pricing, and visible
   unavailable measurements.
3. **Custom ranking — implementation complete; production review pending.**
   `/make-it-yours/` now carries the exact six-weight
   matrix, access/provider/SLA filters, charts plus semantic tables, ordered
   comparison tray, exports, and shareable state. Submit the exact custom
   ranking matrix; do not normalize or invent runtime values locally.
4. **Lifecycle truthfulness — P0.** Complete `/model-lifecycle/` only with a
   revisioned lifecycle projection. OpenRouter can evidence endpoint additions,
   expiration, and observed removal, not vendor retirement or a successor;
   unavailable successor slots remain visible. Preserve the horizon controls,
   card/table switch, actions, timeline, and evidence boundary.
5. **Price-performance — implementation complete; endpoint review pending.**
   `/llm-price-performance/` now carries its
   lane/creator/price filters, Pareto chart/dialog, accessible table fallback,
   detail rows, URL state, freshness, and exact null-versus-zero handling.
6. **Popular Models closeout — P1.** The `01` Leaderboard master table, `02`
   two-chart Insights, and `03` three-economics-chart Compare structure are
   implemented. Keep strict-v1 unavailable slots intact; wire real HTTP/live
   data and complete the final cross-page review before design approval.
7. **Home — P1.** Preserve Hero plus `01`–`05`, four workbench filters, radar,
   subscription slider, research cards, and global footer. Replace only its
   fixture facts with source-aware view models or visible unavailable slots;
   keep it dependent on the completed decision-core routes.
8. **Research and utility pages — P1.** Reconcile `/articles/`, all six
   `/articles/<slug>/` details, `/guides/`, all five guide redirects, `/tools/`,
   and `/cost` against their exact immutable sections, filters/sorts, CTAs,
   canonical redirects, metadata, and global shell. `/tools/` remains a
   directory card, never an embedded calculator; `/cost` remains redirect-only.

## Data and source boundaries

- `rankings` strict-v1 is the source for Popular Models and custom rankings;
  model/profile/comparison facts stay in their distinct strict-v1 operations.
- OpenRouter is endpoint availability/deprecation and route-pricing evidence,
  not global model-lifecycle or subscription evidence.
- Subscription UI scope is limited to ChatGPT/OpenAI, Claude/Anthropic,
  Gemini/Google, Grok/xAI, GLM Coding/Z.ai, Perplexity, and Microsoft Copilot.
  Official provider pages are primary; AI Pricing Guru is approved only as a
  discrepancy cross-check and never overrides first-party evidence.
- Production is HTTP-only. Local evidence/fixtures may support design checks
  only when visibly labeled and never silently fall back in production.

## Ownership boundaries

- **Shared shell and tokens:** `apps/web/src/app/layout.tsx`,
  `apps/web/src/app/globals.css`, and `apps/web/src/components/site-chrome.tsx`.
  Route work must preserve the approved global navigation, theme, language,
  accessibility, and footer behavior.
- **Next route UI:** `apps/web/src/app/**` and matching
  `apps/web/src/components/**`. Route components consume mapped view models;
  they do not manufacture source facts.
- **Data contract and producers:** `contracts/ui-data-contract/v1`,
  `src/pipeline/ui-data-contract-v1-*`, `functions/api/benchmarks/**`,
  `workers/catalog-ingest/**`, and `workers/benchmark-ingest/**` own source
  joins, revisions, and unavailable envelopes.
- **Immutable-reference implementation:** root `src/pages/**` and
  `src/frontend/**` are parity references, not shortcuts for changing the
  Next.js target or replacing the immutable route contract.
