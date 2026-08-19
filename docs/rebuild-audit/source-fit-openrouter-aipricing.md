# OpenRouter and AI Pricing Guru source-fit review

Date: 2026-08-19
Status: recommendation pending frontend/data-contract approval

## Decision summary

- Use OpenRouter as the authority for **OpenRouter model-endpoint availability and deprecation**, not as proof of a model creator's global product lifecycle.
- Preserve daily OpenRouter snapshots and derive observed additions/removals from snapshot diffs. A disappeared model is an observed OpenRouter catalog removal, not an inferred vendor retirement.
- Keep successor/replacement evidence unavailable unless a separate reviewed source explicitly publishes it.
- Do not adopt AI Pricing Guru as the subscription-plan or usage-limit source. Its documented API exposes API pricing and workload estimation, not subscription records or entitlement limits.
- Do not use AI Pricing Guru as TokenBench's primary public pricing-comparison source without written permission. The dataset terms require permission for that use.
- Continue using TokenBench's provider-sourced subscription manifests and entitlement evidence. AI Pricing Guru may be evaluated later as a secondary API-price validation source if permission and attribution requirements are settled.

## Observed API coverage

### OpenRouter

Source: `GET https://openrouter.ai/api/v1/models`

Observed on 2026-08-19:

- 415 currently visible models.
- 5 records with a non-null `expiration_date`.
- 194 records with a non-null `knowledge_cutoff`.
- 0 records with a non-null `per_request_limits`.
- Three of the five expiration values were `2098-12-31`; treat these as literal source values and do not present them as meaningful near-term lifecycle evidence.

Useful fields include `id`, `canonical_slug`, `name`, `created`, `context_length`, architecture/modalities, pricing, top-provider limits, supported parameters, `knowledge_cutoff`, and `expiration_date`. OpenRouter documents `created` as the date added to OpenRouter and `expiration_date` as the deprecation date for the model endpoint.

The current TokenBench OpenRouter projection already retains `created`, `canonical_slug`, `expiration_date`, and `knowledge_cutoff` in the immutable source snapshot. The current catalog parser then discards the lifecycle fields and labels every parsed offer `available`; no lifecycle projection is materialized yet.

### AI Pricing Guru

Documented OpenAPI operations:

- `GET /api/pricing.json`
- `GET /api/estimate`
- `POST /api/estimate`

Observed on 2026-08-19, `/api/pricing.json` contained 214 models across 17 providers. It provides model identity, API token prices, cache prices where known, status, and daily source freshness. The estimator calculates API cost from supplied tokens/calls and supports batches of scenarios.

The docs also link an unversioned `GET /api/price-history.json` dataset; it is not part of the published OpenAPI paths. None of these endpoints supplies subscription-plan prices, plan/model inclusion, or usage-limit/entitlement records.

AI Pricing Guru publishes subscription comparisons on HTML pages, but scraping those pages would be a separate brittle source integration and is not covered by the documented API contract.

## Pipeline gaps and proposed changes

### Lifecycle

1. Extend the existing OpenRouter normalization boundary to validate and retain `created` and `expiration_date` as typed facts instead of only snapshot bytes.
2. Add a revisioned OpenRouter lifecycle projection keyed by `canonical_slug`, with `observedAt`, `addedToOpenRouterAt`, `expirationAt`, and catalog-presence state.
3. Diff the active and prior complete snapshots to produce `added`, `expiration_scheduled`, and `observed_removed` events.
4. Keep the active pointer atomic and retain last-good data on refresh failure.
5. Update the lifecycle contract so scope is explicit (`openrouter_endpoint`). Do not overload a global `retired` state with an OpenRouter-only event.
6. Materialize `/api/benchmarks/lifecycle`; it currently returns the truthful unavailable envelope.

### Subscription versus API

The accepted TokenBench contract already represents plan prices, model support, entitlement evidence state, capacity units/windows, bounds, assumptions, caveats, confidence, source references, exact API line items, and crossover data. The data model is sufficient; the missing work is production projection/materialization and Next.js wiring.

Do not add an AI Pricing Guru ingestion dependency for subscription limits. If written permission is obtained, a secondary API-price adapter should retain source identity and never silently override direct-provider or OpenRouter route pricing.

## Frontend recommendation

### Model lifecycle

Keep the page structure, card/list switch, horizon controls, exports, release timeline, and evidence boundary. Change the semantics:

- Rename the surface to **OpenRouter availability and deprecation radar**.
- Label dates **OpenRouter endpoint deprecation**, not provider sunset.
- Label `created` as **Added to OpenRouter**, not model release date.
- Replace the guaranteed successor card with an explicit unavailable state unless reviewed replacement evidence exists.
- Add observed catalog additions/removals, canonical slug, source timestamp, and a scope badge.
- Distinguish `scheduled deprecation` from `observed removed` and never infer one from the other.

### Subscribe versus API

Keep all current inputs, exact model mix, Chart.js crossover chart, tables, query semantics, and copy/download/export actions. When source-backed data is wired:

- Split the result into **cost comparison** and **entitlement/capacity fit**. A cheaper subscription is not necessarily adequate for the workload.
- Show plan limit units and windows exactly as sourced; preserve relative or dynamic limits as unknown rather than converting them to tokens.
- Show evidence state, bound type, confidence, effective time, and source links near the result.
- Add model API status/freshness and cached-input pricing where supplied.
- Keep price history or change alerts as secondary context, not as the primary decision result.

## Authoritative references

- OpenRouter model API: https://openrouter.ai/docs/guides/overview/models
- OpenRouter provider deprecation semantics: https://openrouter.ai/docs/guides/community/for-providers
- AI Pricing Guru API docs: https://www.aipricing.guru/api-docs/
- AI Pricing Guru OpenAPI: https://www.aipricing.guru/openapi.json
- AI Pricing Guru subscription pages: https://www.aipricing.guru/subscriptions/
