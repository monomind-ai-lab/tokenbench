# TokenBench benchmark data sources

TokenBench publishes only server-fetched, immutable snapshots. A published
benchmark revision records the exact sanitized catalog revision and OpenRouter
content hash used for route-level pricing, so an API response never combines a
newer catalog price with an older benchmark score. Missing source values remain
`null` and are displayed as unavailable; they are never converted to zero.

## Permitted sources and visible attribution

| Source | Rights / terms | v1 use | Required visible attribution |
| --- | --- | --- | --- |
| [BenchLM data](https://benchlm.ai/data) | MIT; data reuse is permitted under its published license. | Primary LLM metadata and safe capability evidence. | [Data from BenchLM.ai](https://benchlm.ai/data) |
| [LMArena leaderboard-dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) | CC-BY-4.0. | Human-preference and supported modality Arena measurements. | [Arena ratings from LMArena](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) |
| [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models) | OpenRouter terms apply; this is **not** represented as MIT or CC-licensed data. | Attributed catalog, hosted route, price, context, modality, and parameter facts only. | [Catalog and pricing data from OpenRouter](https://openrouter.ai/docs/guides/overview/models) |
| [LiteLLM model_prices_and_context_window.json](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) | MIT. | Route-price/context corroboration only; it never defines public rankings. | LiteLLM corroboration, linked to the source file |

Attribution is shown wherever a source contributes visible facts. TokenBench
also labels workload costs, Pareto frontiers, and comparison eligibility as
TokenBench-derived calculations rather than upstream measurements.

## Review-bound identity maps

The checked-in model-alias, editorial-comparison, and subscription-plan maps
start empty. No source artifact supplied for v1 establishes a reviewed
cross-source alias, a canonical editorial pair, or a benchmark-model-to-plan
relationship. Alias resolution is exact and case-sensitive; it has no fuzzy
fallback. Unmatched source model IDs receive stable namespaced keys and cannot
enter cross-source derivations. A later parser task may add an entry only with
concrete fixture and source evidence; absence continues to mean no verified
match.

## Safe projection and Artificial Analysis prohibition

Artificial Analysis is prohibited in this implementation. TokenBench does not
call it, store its data, consume AA-derived benchmark fields from another feed,
or publish an AA-derived metric, rank, speed, or timing figure.

For BenchLM, TokenBench never requests `speed.json`. It never stores or hashes
raw `models.json` or `benchmarks.json` bytes because those artifacts can contain
contaminated material. Instead, ingestion keeps a deterministic allowlist
projection, the original response SHA-256, and response headers. The permitted
model fields are `canonicalModelKey`, `slug`, `model`, `creator`, `sourceType`,
`reasoningType`, `releaseDate`, `contextWindowTokens`, `evidenceStatus`,
`rankingEligible`, `ranking.categoryRankingEligible`,
`coverage.trustedBenchmarkCount`, `coverage.verifiedBenchmarkCount`,
`scores.rawOverallScore`, `scores.displayCategoryScores`, and
`scores.verifiedDisplayCategoryScores`.

`scores.rawOverallScore` is the only overall BenchLM metric published by this
product (`benchlm:overall:raw`). Raw confidence bounds stay null. Category
metrics prefer `verifiedDisplayCategoryScores`, falling back to
`displayCategoryScores` only after prohibited-definition validation. TokenBench
does not normalize or rank from `displayScore`, `provisionalDisplayScore`,
`scores.displayScore`, `scores.overallScore`, `scores.verifiedDisplayScore`,
`overallRank`, `categoryRanks`, `scoreInterval90`, or
`models[].benchmarks.external`.

A definition is removed when its key begins with `aa`, its key is
`artificialAnalysis` (case-insensitively), identifying text mentions Artificial
Analysis, or its source/paper URL is on `artificialanalysis.ai`. The complete
revision fails if such a definition has a non-null, non-zero weight. External
groups are stripped. Curated BenchLM comparisons contribute pair identity only;
TokenBench recomputes eligibility from safe metrics.

Every source artifact records two distinct SHA-256 values: `contentHash` for
the exact sanitized snapshot bytes referenced by its R2 key, and
`originalContentHash` for the original upstream response before projection.
Placeholders and raw hashes presented as sanitized snapshot hashes are rejected
at the contract and D1 boundaries.

OpenRouter is treated as catalog evidence, not benchmark evidence. Ingestion
projects only `id`, `canonical_slug`, `name`, `created`,
`context_length`, `architecture.modality`, `architecture.input_modalities`,
`architecture.output_modalities`, `architecture.tokenizer`,
`architecture.instruct_type`, `pricing.prompt`, `pricing.completion`,
`pricing.input_cache_read`, `pricing.input_cache_write`,
`top_provider.context_length`, `top_provider.max_completion_tokens`,
`top_provider.is_moderated`, `per_request_limits`, `supported_parameters`,
`expiration_date`, and `knowledge_cutoff`. The stored payload is exactly the
projected `{data:[...]}` object: it excludes `benchmarks`, AA spelling, and
unknown fields. TokenBench does not expose a bulk OpenRouter mirror.

## Artifact and revision signals

- BenchLM public artifacts currently expose `schemaVersion` and a common
  `generatedAt`; conditional requests use ETag/304. No Last-Modified signal is
  assumed.
- LMArena uses the accepted subsets, `latest` split, and `overall` category.
  Dataset Viewer is the primary transport and its `x-revision` response header
  is the upstream revision. After exhausted retryable transport or server
  failures only, ingestion may read the same public dataset from official Hub
  Parquet files pinned to one verified 40-character repository commit. Every
  resolver must return that exact commit before its bounded file is accepted;
  authorization, schema, size, and validation failures never activate the
  fallback. Parquet rows are reduced to the same field allowlist and 100-row
  JSON evidence pages, while each record retains the original Parquet SHA-256.
  If one subset contains multiple `overall` rows with the same exact source
  model identity, every measurement for that ambiguous identity is excluded
  from rankings; TokenBench does not pick a preferred conflicting score. The
  pinned original-file hash remains attached to the sanitized evidence.
- LiteLLM uses raw GitHub ETag/304 where available and is recorded as
  corroborating evidence.
- OpenRouter route facts are tied to the active sanitized catalog revision and
  its projection hash. They cannot be joined into an earlier benchmark revision.

Allowed evidence is written to R2 before one transactional D1 publication
batch. For BenchLM `models.json` and `benchmarks.json`, that evidence is the
deterministic allowlist projection rather than the raw response bytes. Each
source record has a source ID, artifact ID, URL, observed time, validators,
snapshot key, sanitized content hash, original-response content hash, license,
and attribution. An unchanged combined hash updates `checked_at` without
creating a duplicate benchmark revision.

## Sources excluded from v1

- Artificial Analysis: prohibited entirely.
- Open LLM Leaderboard: not published in v1.
- LiveCodeBench: not published in v1.
- Open ASR: not published in v1, pending explicit public redistribution terms.
- BenchLM `speed.json`: excluded because its records are sourced from Artificial
  Analysis.
