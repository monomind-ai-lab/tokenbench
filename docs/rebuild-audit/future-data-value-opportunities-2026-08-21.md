# Future data opportunities for human review

Review date: 2026-08-21
Status: mixed — approved existing-source facts implemented; blocked/new-source candidates retained for later review

## Decision rule

These additions could make TokenBench more useful without changing the approved page structure. A candidate should ship only after its source, identity join, update cadence, licensing/redistribution terms, and unavailable-state contract are reviewed. An upstream sort option or marketing statement is not itself a displayable measurement.

## Implemented from approved current sources

- OpenRouter route receipts now preserve model creation time, expiration date,
  knowledge cutoff, tokenizer, instruction format, moderation, per-request
  limits, input/output modalities, supported parameters, context, maximum
  output, and an independent cache-write price when published. Each fact stays
  attached to the exact route and source artifact; the public API does not
  become a bulk OpenRouter mirror.
- The model directory loads every cursor page from one immutable revision and
  exposes the published profile category vector, field sizes, ranks, coverage,
  and freshness without replacing weekly popularity order or making browser-side
  profile fan-out requests.
- Model Profile, Models, Compare, Popular Models, Make It Yours, leaderboard,
  and data-source surfaces consume these typed receipts. Missing scalar facts
  render as an accessible `-`; the reason and provenance remain available to
  assistive technology and inspectable detail views.
- Subscription plan responses now include provider-published annual checkout
  and effective-monthly amounts, qualitative usage notes, evidence status,
  entitlement dimensions, reset/model/feature/shared-pool facts, last-verified
  timestamps, and direct source references. Annual savings and numeric capacity
  are not inferred.
- LiveBench task economics already supply task score, question count,
  evaluation cost, token volumes, cost per question, cost per quality point,
  and source Pareto membership on the exact release/taxonomy identity.

Not implemented by this checkpoint: copied OpenRouter descriptions; fixed,
image, web-search, or internal-reasoning meters outside the approved source
allowlist; ZDR/EU discovery filters without durable endpoint receipts; and
AI Pricing Guru history as a public source without written redistribution
permission.

## High-value facts already exposed by current sources

| Candidate data | Candidate source | Best surfaces | Contract and UX note |
| --- | --- | --- | --- |
| Model creation date, expiration date, knowledge cutoff, description | [OpenRouter Models API](https://openrouter.ai/docs/guides/overview/models) | Models, profile, lifecycle, compare | Keep `created` distinct from provider release date. `expiration_date: null` means no published deprecation date, not indefinite support. |
| Input/output modalities, tokenizer, instruction format | [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models) | Models filters, profile, compare | Join to an exact model and endpoint identity. Empty or omitted arrays remain unavailable. |
| Supported request parameters such as tools, structured output, reasoning, response format, seed, and logprobs | OpenRouter `supported_parameters` | Models, profile, compare | Present as compatibility facts, not quality scores. Provider endpoint support may be narrower than a model-level union. |
| Context, max completion, moderation, per-request limits | OpenRouter model/top-provider fields | Profile, compare, API calculator | Keep the selected endpoint attached; do not apply one provider's limits to every route. |
| Fixed request, image, web-search, internal-reasoning, cache-read, and cache-write prices | OpenRouter pricing fields | Profile price matrix, compare, Subscribe vs API | Add independent nullable meters. Never fold them into input price or a blended rate without a disclosed workload. |
| Zero-data-retention and EU-region availability filters | OpenRouter model filters/endpoints | Models, compare, enterprise decision cards | A filter result is suitable for discovery; a durable per-endpoint fact requires a revisioned endpoint receipt. |
| Category score, source rank, field size, coverage count, reasoning type, release date, and raw/display score | Current BenchLM model profiles and per-key leaderboards | Home, Models, Popular Models, profile, leaderboard detail | Most of these facts are already ingested. Surface rank/field-size and coverage without recomputing weekly popularity rank. |
| Complete category vector for every weekly-directory row | Current per-model BenchLM profile records | Popular Models, Make It Yours, compare | The source exists, but the public bulk directory currently exposes only `strongestCategory` and ranked per-key routes omit non-ranking-eligible scores. Add an additive bulk category array (or a bounded bulk-profile endpoint) so the UI does not need 100 profile requests. |
| Task-level score, question count, evaluation cost, average input/output tokens, model price, cost per question, cost per quality point, and Pareto membership | [LiveBench release data](https://github.com/LiveBench/new-livebench/blob/main/README.md) | Popular Models drawers, Make It Yours, compare, data-source detail | Preserve task/category/release scope. `$ / quality` must use the source's question-weighted method, not an average of category ratios. |
| Daily API price history and price-change alerts | [AI Pricing Guru price-history API](https://www.aipricing.guru/api-docs/) | Home alerts, profile history, compare, price-performance | Useful as corroboration/history. Public commercial redistribution needs written permission under the published dataset terms. |
| Annual price, annual savings, included models, feature list, usage notes, source count, and last-verified timestamp | Direct provider subscription crawl; [AI Pricing Guru subscription pages](https://www.aipricing.guru/subscriptions/) as corroboration | Subscribe vs API | The direct provider page stays authoritative. Preserve qualitative limits as text unless a numeric cap and reset period are explicitly published. |

## Valuable facts that need a new or stronger evidence source

| Candidate data | User value | Evidence required before implementation |
| --- | --- | --- |
| Route-level p50/p95/p99 TTFT and output throughput | Honest latency/SLA filtering and runtime charts | Independently revisioned observations with route, provider, region, timestamp, sample count, request shape, and methodology. OpenRouter's sort signal alone is not enough to display a numeric value. |
| Error rate, uptime, rate-limit incidence, and fallback frequency | Reliability comparison | Time-windowed route telemetry with sample size and error taxonomy; never infer from one failed request. |
| Endpoint-level data retention, training use, residency, and enterprise controls | Privacy/compliance screening | Versioned official policy evidence tied to plan, endpoint, region, and effective date; legal review recommended. |
| Subscription caps with reset windows, dynamic multipliers, queue priority, and peak/off-peak rules | Real subscription capacity instead of price-only comparison | Provider-published numeric limits plus cadence and applicable model/tool. Qualitative “higher limits” stays text. |
| Subscription feature parity: voice, image/video, deep research, storage, coding agents, connectors, and team controls | Explains what the monthly price buys | Plan-versioned entitlement facts and region/seat constraints. Do not convert features into token equivalents. |
| Taxes, local currency, regional plan availability, promotions, and renewal price | Purchase-ready budgeting | Region-specific checkout evidence with currency, tax treatment, promotion end date, and renewal terms. |
| Replacement/successor model and migration guide | Actionable lifecycle alerts | Provider-published successor mapping or a clearly labeled editorial recommendation; never infer from family/name order. |
| Benchmark confidence intervals, vote/sample counts, disagreement, and revision trend | Shows whether close ranks are meaningful | Source-published uncertainty/sample facts and stable cross-revision identity. Do not derive confidence from rank alone. |
| Self-hosting requirements: license, weights availability, quantization, VRAM/RAM, accelerator, throughput, and energy | Hosted-vs-self-hosted decisions | Reviewed model-card/license sources plus reproducible hardware benchmark methodology. |

## Page-level proposals for a later design review

- **Home:** compact price-change and lifecycle alerts; evidence freshness/conflict summary; no extra methodology wall.
- **Models:** filters for modalities, tool use, structured output, context, ZDR, region, lifecycle, and price change; retain cards/list and shareable query state.
- **Popular Models:** show field size and category coverage; task-economics density; per-model source overlap; optional price-change badge.
- **Profiles:** full endpoint meter table, supported-parameter matrix, release/expiration history, source-conflict timeline, and observed runtime receipt.
- **Compare:** parameter/modality compatibility, route-specific price sensitivity, confidence/sample deltas, and lifecycle mismatch warnings.
- **Make It Yours:** let users choose only source-published dimensions; independently toggle observed runtime constraints; explain models excluded by each missing fact.
- **Leaderboards:** revision trend, field-size/sample context, confidence where published, and deliberate access to rows after the approved top ten.
- **Subscribe vs API:** feature/entitlement comparison, annual billing, reset-window limits, seats/team controls, and regional pricing kept separate from token-cost math.

## Non-negotiable safeguards

- Exact source identity joins only; no display-name matching.
- `null` is not zero, and an omitted capability is not unsupported.
- Stored precision remains intact; reader-facing values use at most two decimals.
- Every historical trend carries the actual revision/effective timestamp rather than interpolated points.
- Provider, model, route, plan, region, and source revisions remain distinct.
- AI Pricing Guru may corroborate pricing and history, but its published redistribution terms require permission before it becomes a public primary dataset.
