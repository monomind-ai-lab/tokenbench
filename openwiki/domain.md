# Domain concepts and data rules

## Decision product, not a universal ranking

TokenBench serves evaluators of AI subscriptions, API routes, and models. It combines pricing and benchmark evidence to support a defensible decision, not to invent a definitive winner. Product intent and constraints live in `PRODUCT.md`; its key principle is to show provenance with the decision and preserve uncertainty instead of manufacturing completeness.

Primary user surfaces include subscription-vs-API analysis, model directories/profiles, source-aware leaderboards, canonical pair comparisons, price-performance views, and guides/articles.

## Evidence states and revisions

- **`null` / unavailable:** missing fact, not a numeric zero. It requires an explicit reason/provenance path in contract-driven UI.
- **Valid vs fresh:** a complete published revision remains valid after its freshness window. Catalog freshness is 36 hours at ingestion policy (the endpoint fallback has a 24-hour request window); benchmark-derived surfaces are fresh for eight days. Refresh failure displays labeled last-good; unavailable is reserved for a cold system.
- **Separate revision roles:** catalog, benchmark, runtime-observation, projection, and methodology revisions must not be conflated. For example, a benchmark score does not imply TTFT, throughput, or uptime, and a subscription calculation has no benchmark dependency.
- **Route-level pricing:** provider route, cache-read/write, input/output, context, and tier facts stay explicit. A model name alone is not enough to merge price evidence.

## Source policy and provenance

Permitted benchmark/catalog roles are documented in `docs/data-sources.md`:

| Source | Role |
| --- | --- |
| BenchLM | safe capability and metadata evidence |
| LMArena | human-preference and supported modality measurements |
| OpenRouter | attributed catalog, hosted-route price, context, modality, parameter facts |
| LiteLLM | price/context corroboration only |
| TokenBench | disclosed workload costs, Pareto frontiers, and comparison eligibility |
| LiveBench (working-tree integration) | source-attributed capability scores, taxonomy, and evaluation economics only |

LiveBench release artifacts are commit-pinned and verified before publication. Its source-only model configurations remain identity proposals until a catalog mapping is reviewed; do not infer provider routes, pricing, runtime/SLA, lifecycle, subscription, or canonical identity facts from benchmark evidence. The in-progress integration relies on a project-approved CDLA-Permissive-2.0 registry record, not a license inferred by the parser (`migrations/0014_livebench.sql`).

Visible source attribution is required wherever a source contributes a fact. Review-bound alias maps, comparison allowlists, and model-to-plan mappings are exact/case-sensitive and initially empty; no fuzzy identity fallback is permitted.

**Artificial Analysis is completely prohibited**, including API calls, storage, direct values, timing/speed fields, or derived contamination from another feed. BenchLM uses a deterministic allowlist projection and excludes `speed.json`; OpenRouter is a projected catalog input and must exclude benchmarks/unknown fields. Immutable evidence records both sanitized and original-content hashes.

## UI contract and rebuild boundary

`contracts/ui-data-contract/v1/` is an accepted evidence-backed contract for models, profiles, lifecycle, rankings, comparisons, and subscription calculations. It has versioned envelopes, availability wrappers, provenance, and retained positive/rejection fixtures. It proves client/server boundary behavior; its `fixture-*` revisions and `example.com` URLs are not production facts.

The validated root frontend boundary is in `src/frontend/preview-data/`: gateway, parser/contracts, evidence transport, fixture adapter, HTTP transport, and tests. HTTP transport intentionally has no silent evidence/fixture fallback and requests `application/vnd.tokenbench.ui-data.v1+json`. The working-tree LiveBench projection can serve partial models, profiles, comparisons, and rankings; lifecycle/subscription remain explicitly unavailable, rather than fabricated. The new Next app must reuse/adapt this boundary rather than clone schemas or treat its local arrays as authoritative.

## Product-specific decision logic

- Subscription analysis blends selected model prices, input/output mix, cache shares, volume/workload assumptions, seats, and plan price to derive API-equivalent spend and crossover/breakeven. Root implementation is catalog-driven; current Next simulator logic is presentation fixture code pending gateway wiring.
- Leaderboards retain source ranks and exposed methodology. Value is a disclosed workload/capability Pareto lens, not an opaque score.
- Comparisons accept ordered, distinct model sets and must keep URL state reconstructible. Valid but unreviewed pairs may be useful but are not necessarily indexable; reviewed editorial pair eligibility is separate.
- Estimated BenchLM entries are opt-in, visibly distinct, unranked, and cannot receive winner/value claims (`PRODUCT.md`).
