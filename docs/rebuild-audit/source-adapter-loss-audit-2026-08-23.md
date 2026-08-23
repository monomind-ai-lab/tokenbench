# Source adapter loss audit — what upstream publishes vs. what TokenBench ingests

Audit date: 2026-08-23
Branch audited: `codex/frontend-rebuild` (144 commits ahead of `main`; `main` is 2 ahead of the merge base)
Scope: code + live upstream artifacts. Read-only. No ingestion run, no deploy, no code change.

Live samples fetched during this audit (all public, unauthenticated GETs):

| Source | URL | Result |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1/models` | 422 models, 674 KB |
| LiteLLM | `raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` | 3,176 rows, 1.8 MB |
| LiveBench | `api.github.com/repos/LiveBench/new-livebench` @ `f6a8110e3cd64eb10fdbb857c9c29ca2545917ca` → `constants.js`, `modelLinks.js`, `table_2026_06_25.csv`, `cost_2026_06_25.csv`, `categories_2026_06_25.json` | release `2026-06-25`, 46 models, 23 tasks, 271 modelLinks entries |
| BenchLM | `benchlm.ai/data/{models,pricing,benchmarks}.json` | 393 / 331 / 402 items |
| OpenCode Zen | `opencode.ai/zen/v1/models` + `opencode.ai/docs/zen/` | 64 endpoint ids; **3** HTML tables |
| LMArena | not fetched (HF Dataset Viewer, gated behaviour) — worked from parser + `workers/benchmark-ingest/test-fixtures/lmarena/*.json` |

---

## 1. Ranked list — fields the sources already publish that we do not capture

Effort key: **XS** = one allowlist line + pass-through. **S** = allowlist + contract field + one DB column. **M** = migration + normalizer + surface. **L** = policy review or new review workflow required.

| # | Field(s) | Source | Coverage in live data | Effort | What it unlocks |
| --- | --- | --- | --- | --- | --- |
| 1 | `cost_per_question`, `cost_per_successful_task` | LiveBench `cost_*.csv` | 46/46 rows | **XS** | The single highest-value number on the site. Today `src/frontend/popular-models/fixtures.ts:28` ships an **invented** `costPerSuccessfulTask` labelled "illustrative-ui-data". The real column is parsed, schema-validated, then discarded (`src/livebench/parser.ts:301`). Two columns turn a fixture page into an evidence page. |
| 2 | `modelLinks[].huggingface` + `modelLinks[].url` for **non-finetune** models, joined to OpenRouter `hugging_face_id` | LiveBench + OpenRouter | HF: 43/271 links (9/44 current-table models); `url`: 270/271. OpenRouter `hugging_face_id`: 422/422 | **S** | The **only** exact cross-source join key that exists anywhere in the data. `hugging_face_id` was added to the OpenRouter allowlist today but has **no downstream consumer** (§6). LiveBench discards HF for all non-finetunes at `src/livebench/parser.ts:253`. Wiring both ends is what replaces the empty `MODEL_ALIASES` with evidence-backed aliases. |
| 3 | `family` object: `familyKey`, `familyName`, `variantType`, `snapshotLabel`, `baseFamilyModelKey`, `relatedModelKeys[]`, `isCanonicalFamilyEntry`, `supersedesModelKey` | BenchLM `models.json` | **393/393**; 56 models carry `supersedesModelKey`, 213 carry `relatedModelKeys` | **S** | Model lifecycle and successor mapping — listed in `future-data-value-opportunities-2026-08-21.md` as "needs a new evidence source". It already exists. Powers the `model-lifecycle/` route, family grouping on Models, "you're on the old one" alerts, and a within-source identity spine (285 distinct family keys over 393 models). |
| 4 | OpenCode Zen **Deprecation-date table** (3rd table on the docs page), plus long-context and peak/off-peak price tiers, `Cached Write`, `AI SDK Package` | OpenCode Zen docs HTML | Deprecation: 18 rows. Tier rows: **24 of 74 pricing rows dropped**. Cached Write: 21 non-blank. SDK package: 4 distinct | **S** | Fixes a live correctness bug (§5.6): every Zen offer is hard-coded `availability: 'available'` (`workers/catalog-ingest/src/index.ts:262`) while 18 models have published deprecation dates. The tier rows are exactly what `ModelOffer.longContextInputMicroDollarsPerMillion` was added for and never populated. `AI SDK Package` (`@ai-sdk/anthropic` etc.) is the only signal of a Zen model's real creator — today all 50 offers get `providerId: 'opencode'`. |
| 5 | Per-model **individual benchmark scores** — `models[].benchmarks.<category>.<benchmarkKey>` | BenchLM `models.json` | **4,347 scores** across 393 models and 290 distinct keys (22 AA-prefixed, 19 `external` — both already filterable by existing code) | **L** (policy) | We publish only 8 category aggregates per model. Upstream publishes ~249 clean individual benchmarks (`sweVerified`, `gpqa`, `hle`, `terminalBench2`, `browseComp`, `charxiv`…). This is the deepest untapped dataset in the whole system. Gated by `docs/data-sources.md:44-49`, not by licence — the AA-stripping machinery already exists (`benchlm.ts:331-344`). |
| 6 | LiteLLM capability flags + lifecycle: `supports_reasoning`, `supports_vision`, `supports_function_calling`, `supports_tool_choice`, `supports_prompt_caching`, `supports_web_search`, `supports_computer_use`, `supports_pdf_input`, `supports_response_schema`, `supports_audio_input/output`, `deprecation_date`, `rpm`, `tpm`, `supported_endpoints`, `supported_regions`, `tiered_pricing`, `source` | LiteLLM | function_calling 1830, tool_choice 1689, vision 1106, response_schema 1021, reasoning 896, prompt_caching 713, **deprecation_date 555**, pdf_input 480, web_search 290, computer_use 175, rpm/tpm 60, supported_regions 12 | **M** | `BenchmarkPriceCheck.supportedParameters` is hard-nulled for every LiteLLM row (`workers/benchmark-ingest/src/litellm.ts:181`). ~30 capability booleans across 3,176 rows are dropped. `deprecation_date` gives lifecycle coverage far beyond OpenRouter's `expiration_date`. `source` is a per-row provenance URL — free evidence links. |
| 7 | OpenRouter `description`, `reasoning` object (`mandatory`, `supported_efforts`, `default_effort`, `default_enabled`, `supports_max_tokens`), `default_parameters`, `alias_target`, `links.details`, `supported_voices` | OpenRouter | `description` 422/422; `reasoning` 289/422; `default_parameters` 422/422; `alias_target` 12/422 | **S** | `reasoning.supported_efforts` is the missing axis for a reasoning-effort comparison (`["xhigh","high","medium","low","minimal"]`). `alias_target` resolves renamed/aliased routes to their canonical slug — free identity edges. `description` is deliberately excluded per the 2026-08-21 review; the rest was never considered. |
| 8 | OpenRouter extended price meters: `pricing.web_search`, `pricing.image`, `pricing.image_output`, `pricing.audio`, `pricing.audio_output`, `pricing.internal_reasoning`, `pricing.input_audio_cache`, `pricing.input_cache_write_1h`, `pricing.overrides[]` | OpenRouter | web_search 158, audio 32, image 29, internal_reasoning 30, cache_write_1h 32, **overrides 59** | **S** | The allowlist keeps only 4 of 13 published price meters (`workers/catalog-ingest/src/index.ts:75-77`). `pricing.overrides` is per-model long-context tier pricing (`{min_prompt_tokens: 128000, prompt, completion}`) — the same gap as #4, on the larger source. Multimodal and web-search costs are currently invisible in every calculator. |
| 9 | BenchLM `coverage.scoreConfidence` (1–4), `coverage.verifiedBenchmarkCount`, `coverage.rankableBenchmarkCount`, `coverage.generatedBenchmarkCount`, `ranking.verifiedRankingEligible` | BenchLM `models.json` | 393/393 | **XS** | We keep only `trustedBenchmarkCount` (`benchlm.ts:417-420`). `scoreConfidence` is a published 1–4 confidence grade — exactly the "is this rank meaningful?" signal, requiring no derivation. |
| 10 | BenchLM `pricing[].note`, `pricing[].url`, `pricing[].markdownUrl`, `models[].url`, `models[].markdownUrl` | BenchLM | `note` **331/331**; `url` 393/393 | **XS** | `note` is the upstream's own prose explaining *why* a price is 0 or absent ("Self-hosted open-weight model. Public hosted pricing varies by provider…"). We currently null the value (`benchlm.ts:957-963`, correctly) and then throw away the explanation. `markdownUrl` is an LLM-readable evidence page per model — ideal for the evidence drawer and for citations. |
| 11 | BenchLM benchmark definitions: `name`, `fullName`, `description`, `paperUrl`, `paperTitle`, `authors`, `year`, `tasks`, `format`, `difficulty`, `decimals`, `displayableScoreCount` | BenchLM `benchmarks.json` | paperUrl 393/402, difficulty 399, year 395 | **XS** | The projection keeps only `category`, `benchmarkKey`, `weight` (`benchlm.ts:490-494`). Everything needed for a real methodology page — what each benchmark measures, its paper, its sample size — is published and dropped. |
| 12 | LiveBench `out_<task>` per-task mean output tokens (23 columns) | LiveBench `cost_*.csv` | 46/46 rows × 23 tasks | **XS** | Schema-tolerated at `src/livebench/parser.ts:300` and never read. Per-task verbosity is the input to any honest "reasoning models cost more on hard tasks" chart; today only the whole-run `avg_output_tokens` survives. |
| 13 | LiveBench `modelLinks[].version`, `finetune.baseOrganization`, `highUnseenBias` | LiveBench `modelLinks.js` | `version` 156/271; `highUnseenBias` 1/271 | **XS** | `version` is the dated snapshot label (`"2025-08-07"`) that distinguishes `chatgpt-4o-latest-0903` from `chatgpt-4o-latest-2025-01-29`. `highUnseenBias` is an upstream contamination warning we silently ignore. |
| 14 | OpenRouter `benchmarks.design_arena[]` — `{arena, category, elo, win_rate, rank}` | OpenRouter | 230/422 models | **L** (policy) | A second human-preference signal alongside LMArena, free in the payload we already fetch. It is a **sibling key of `benchmarks.artificial_analysis`** in the same object, so it can only be taken with a sub-projection that drops the AA sibling — a deliberate policy decision, not an accident. |
| 15 | LMArena `variance` | LMArena rows | present in every fixture row | **XS** | It is inside the fetch allowlist (`workers/benchmark-ingest/src/source-steps.ts:775`) and range-validated, then never read by either parser. One line to surface rating dispersion. |
| 16 | BenchLM `market`, `isRegional`, `contextWindow` (formatted), `provisionalDisplayScore`, `publicRankingMode` | BenchLM `models.json` | `market` 14/393 (Korea, Japan); rest 393/393 | **XS** | Regional-model filtering; `korean` is already a published BenchLM category we never expose. |
| 17 | OpenCode Zen `owned_by`, `created`; `Endpoint` column | OpenCode Zen | 64/64 | **XS** | Endpoint URL distinguishes `/responses` vs `/messages` vs `/chat/completions` — API-shape compatibility, and per-model endpoints for the Gemini family. |

---

## 2. Outright broken right now

### 2.1 LiveBench ingestion is dead — and it is a one-line upstream omission that kills the whole release

`src/livebench/parser.ts:232`:

```ts
if (!link) throw new LiveBenchValidationError(`table model ${sourceModelId} has no modelLinks metadata`);
```

Verified against the live upstream at commit `f6a8110e`, release `2026-06-25`:

- `table_2026_06_25.csv` has **46** model rows.
- `modelLinks.js` has **271** top-level keys + **64** variant `rawName`s.
- Exactly **2** table models are absent from both: **`deepseek-v4-flash`** and **`deepseek-v4-pro`**.

Those 2 missing entries abort the parse of all 46 models × 23 tasks × 2 fact tables — **1,058 scores and 1,058 economics rows**, plus the whole category taxonomy. `parseLiveBenchRelease` builds `models` before it touches scores (`parser.ts:343`), so the throw happens before anything is retained.

Why this is structurally brittle, not just unlucky:

- `modelLinks.js` is a **hand-maintained presentation file** in a UI repo. It is not a data contract. LiveBench adds a model to the table CSV and to `modelLinks.js` in separate edits; any window between them breaks us.
- The parser demands metadata that is genuinely optional for the product: `organization` and `displayName` are the only truly required fields (`parser.ts:236-237`), and both have obvious safe fallbacks (`sourceModelId` itself, and "Unknown" — which is exactly what `lmarena.ts:94-97` already does for a blank organization).
- The failure mode is inverted relative to every other adapter in this codebase. LMArena silently *excludes* ambiguous rows (`lmarena.ts:398-402`); BenchLM *nulls* unpublishable ranks (`benchlm-public-leaderboard.ts:147-168`). LiveBench alone converts a missing display label into total data loss.
- Three further hair-triggers on the same path, all currently armed:
  - `livebench-discovery.ts:271-278` — pinned git blob ids for `src/lib/compute.js` and `src/Table/Averaging.js`. Any upstream edit to those UI files, cosmetic or not, throws `LiveBench methodology … requires a reviewed TokenBench projection update`.
  - `parser.ts:152-156` (`requireExactTaskColumns`) — the table's task columns must match `categories_*.json` exactly, in both directions. Adding one task upstream is fatal.
  - `parser.ts:322-323` — the cost CSV model set must match the table model set *exactly*. A model scored but not yet costed is fatal.

Suggested shape of a fix (not applied): make `resolveModel` degrade — fall back to `sourceModelId` for `displayName`, `null`/`"Unknown"` for `organization`, and record an `unresolved_identity` count on the release rather than throwing. This preserves the "never invent evidence" rule (nothing is guessed; the field is simply marked unavailable) while removing the single-point-of-failure. Note the identity rows are already written as `matchKind: 'proposal'` / `reviewStatus: 'needs_review'` (`livebench-refresh.ts:357-364`), so unresolved models are already quarantined downstream.

### 2.2 The strict cross-source join can never return a row

Confirmed. `model_configurations` is created by `migrations/0013_pipeline_foundation.sql:42`, read by exactly one query — `functions/_shared/strict-model-join.ts:147` (`INNER JOIN model_configurations AS canonical ON canonical.configuration_id = livebench.canonical_configuration_id`) — and there is **no `INSERT INTO` or `UPDATE` anywhere in the repository**. Meanwhile `livebench-refresh.ts:357-364` writes every identity with `canonicalConfigurationId: null`. `INNER JOIN` on a permanently-empty table gated on `canonical_configuration_id IS NOT NULL AND identity_review_status = 'verified'` returns zero rows unconditionally. There is no code path — not even a manual one — that could ever populate it.

### 2.3 Popular Models ships invented numbers while the real ones are parsed and thrown away

`src/frontend/popular-models/fixtures.ts` is imported by `src/pages/popular-models-page.tsx`, `src/frontend/app-shell.tsx`, and `src/seo/static-page.ts` — production paths, not tests. Its metadata is honest (`productionData: false`, "Every name, score, cost… is invented"), but the field it fakes, `costPerSuccessfulTask`, is published by LiveBench in every cost CSV row as `cost_per_successful_task`, is explicitly tolerated by `parser.ts:301`, and is then dropped because `LiveBenchTaskEconomics` (`src/livebench/contracts.ts:31-40`) has no field for it.

`future-data-value-opportunities-2026-08-21.md` claims "LiveBench task economics already supply … cost per question, cost per quality point". That claim is **false** at the parser boundary — both columns are validated and discarded.

### 2.4 Every OpenCode Zen offer is reported as available

`workers/catalog-ingest/src/index.ts:262` sets `availability: 'available'` unconditionally, while the same docs page publishes a third table listing 18 models with deprecation dates (GPT 5.2 Codex, Claude Opus 4.1, Gemini 3 Pro, GLM 5, Kimi K2.5, MiniMax M2.5, Qwen3 Coder 480B, …), several already in the past. The OpenRouter path in the same function derives `deprecated` correctly from `expiration_date` (`index.ts:204`); the OpenCode path was never given the equivalent.

### 2.5 A third of OpenCode Zen's published pricing is silently discarded

Replaying the join at `index.ts:245-252` against the live page: 74 pricing rows in, **50 offers out**. 22 rows have no matching entry in the model-ID table and 2 have IDs the models API does not list. The 22 are not junk — they are the *tiered* rows the product most needs:

```
DeepSeek V4 Pro (Off-Peak) / (Peak)          ← time-of-day pricing
DeepSeek V4 Flash (Off-Peak) / (Peak)
Claude Sonnet 4.5 (≤ 200K tokens) / (> 200K tokens)   ← long-context tiers
Gemini 3.1 Pro (≤ 200K) / (> 200K)
Grok 4.6, Grok 4.5, GPT 5.6 Sol, GPT 5.6 Terra … (all tiered)
```

The comment at `index.ts:252-253` acknowledges this ("The pricing page also lists deprecated IDs and context-tiered rows"), so the loss is known — but `ModelOffer.longContextInputMicroDollarsPerMillion` already exists in the contract (`src/catalog/contracts.ts:36`) and is never populated by any parser.

### 2.6 The identity maps are empty, and that is expensive

Both confirmed empty:

- `src/benchmarks/model-aliases.ts:7-12` — `{ benchlm: {}, lmarena: {}, litellm: {}, openrouter: {} }`
- `src/benchmarks/subscription-model-map.ts:5` — `{}`

Consequences, measured against live data:

- Every model from every source gets `source:<sourceId>:<urlencoded id>` (`model-aliases.ts:33-35`). 393 BenchLM + 422 OpenRouter + 3,176 LiteLLM + 46 LiveBench + n LMArena models occupy **entirely disjoint key spaces**. No model exists twice; nothing can be compared across sources.
- Every source-only model is `evidenceStatus: 'source_only'`, `rankingEligible: false` (`litellm.ts:154-155`, `lmarena.ts:422`, `openrouter-normalization.ts:37-38`). So price cannot meet score: LiteLLM/OpenRouter price checks never attach to a BenchLM-scored model.
- `subscriptionPlanIdsForModel()` returns `[]` for every model. Subscribe-vs-API cannot say which plan includes a given model except through the 5 hand-written `supportedModelIds` arrays in `manual-manifests.ts` (18 of 23 plans have `supportedModelIds: []`), and those hold bare ids (`'gpt-5.6-terra'`) that match neither an OpenRouter id (`openai/gpt-5.6-terra`) nor a canonical model key.
- The `docs/data-sources.md:23-32` policy — "A later parser task may add an entry only with concrete fixture and source evidence" — is correct and should stand. The point of item #2 in the ranked list is that `hugging_face_id` ↔ `modelLinks.huggingface` **is** concrete source evidence: an exact string match between two independently published identifiers, requiring no name similarity, no fuzz, no editorial judgement.

---

## 3. BenchLM

**What the code fetches** (`workers/benchmark-ingest/src/benchlm.ts:33-40`): `leaderboard.json`, `models.json`, `pricing.json`, `comparisons.json`, `benchmarks.json`, and `api/data/leaderboard?mode=bench-align-v5&limit=200`. `speed.json` is hard-refused at `benchlm.ts:709` (AA contamination, `docs/data-sources.md:125`).

**Envelope allowlist** — `benchlm.ts:198-203` keeps only `schemaVersion`, `generatedAt`, `items` (+`counts` for `models.json`). Live envelopes also publish `name`, `description`, `canonicalUrl`, `sourceLastUpdated`, `sourceFiles`, `rankingMode` — all dropped. `canonicalUrl` and `sourceLastUpdated` are attribution/freshness facts we already need elsewhere.

### models.json — 393 items, 26 top-level keys published, 10 kept

| Published | Kept? | Where | Note |
| --- | --- | --- | --- |
| `canonicalModelKey`, `slug`, `model`, `creator`, `sourceType`, `reasoningType`, `releaseDate`, `contextWindowTokens`, `evidenceStatus`, `rankingEligible` | **kept** | `benchlm.ts:397-407` | |
| `ranking.overallRank`, `ranking.categoryRanks`, `ranking.categoryRankingEligible` | kept, then overridden | `benchlm.ts:409-414`, `:884-890` | `overallRank` from `models.json` is discarded in favour of the truncated public-leaderboard rank |
| `coverage.trustedBenchmarkCount` | kept, then clamped down | `benchlm.ts:417-420`, `:800` | |
| `scores.rawOverallScore` | kept as diagnostic only | `benchlm.ts:424`, `:881` | never the public value |
| `scores.displayScore`, `scores.displayCategoryScores`, `scores.verifiedDisplayCategoryScores` | projected but **never read** | `benchlm.ts:423-432` | dead weight in the projection |
| **`family`** (8 sub-fields) | **dropped** | — | ranked #3. 393/393 coverage |
| **`benchmarks`** (per-benchmark scores) | **dropped** | — | ranked #5. 4,347 scores |
| **`url`**, **`markdownUrl`** | **dropped** | — | 393/393. Evidence links |
| **`id`** (integer) | **dropped** | — | stable upstream primary key, 393/393 |
| **`market`**, **`isRegional`** | **dropped** | — | 14 regional models (Korea, Japan) |
| **`coverage.verifiedBenchmarkCount`**, **`rankableBenchmarkCount`**, **`generatedBenchmarkCount`**, **`scoreConfidence`** | **dropped** | — | ranked #9 |
| **`ranking.verifiedRankingEligible`** | **dropped** | — | |
| **`scores.overallScore`**, **`scores.verifiedDisplayScore`** | **dropped** | — | |
| **`provisionalDisplayScore`**, **`publicRankingMode`**, **`contextWindow`** (formatted) | **dropped** | — | |
| **`scoreInterval90`** `{lower, upper}` | **dropped by policy** | `docs/data-sources.md:57` | 220/393. This is the published uncertainty band the roadmap says "needs a source". It exists; the block is a TokenBench policy line, not a licence term. Worth an explicit re-decision. |

### pricing.json — 331 items, 19 keys published, 11 kept

Kept (`benchlm.ts:441-452`): `canonicalModelKey`, `slug`, `model`, `creator`, `sourceType`, `contextWindowTokens`, `inputPrice`, `cachedInputPrice`, `outputPrice`, `hasNumericPricing`, `isFreePricing`. The last two are projected but unused.

Dropped: **`note`** (331/331 — upstream's own prose explaining an absent or zero price), **`trainingPrice`** (0/331 populated today, but the field exists), **`scorePerOutputDollar`** (111/331 — upstream's own value metric), **`url`**, **`markdownUrl`**, **`displayScore`**, **`overallRank`**, **`contextWindow`**.

**The `$0` sentinel** — `benchlm.ts:957-963`:

```ts
if (value === 0 && sourceType === 'Open Weight') return null;
return value;
```

This is correct and well-reasoned (`benchlm.ts:945-956`): a `0` on an open-weight row means "no hosted price published", not "free". Proprietary `$0` is left as published. If all three rates null out, the price check is dropped entirely (`benchlm.ts:985`). The gap is that the *reason* — which upstream states verbatim in `note` — is discarded, so the UI shows `-` with no explanation available even in the evidence drawer.

### benchmarks.json — 402 items, 20 keys published, 3 kept

Kept (`benchlm.ts:490-494`): `category`, `benchmarkKey`, `weight`. Dropped: `categoryLabel`, `name`, `fullName`, `description`, `paperUrl` (393/402), `paperTitle`, `authors`, `year` (395), `tasks`, `format`, `difficulty` (399), `decimals`, `successorKey`, `successorUrl`, `displayableScoreCount`, `url`, `markdownUrl`. Ranked #11.

Published categories include **`korean`** and `external`, neither surfaced.

### public leaderboard — `inputPrice`/`outputPrice` dropped

`benchlm-public-leaderboard.ts:108-117` allows 8 row fields. The live payload also carries `inputPrice` and `outputPrice` per row; they are dropped because pricing comes from `pricing.json`. Harmless, but it is a second price observation on the same identity that could corroborate.

**Join keys BenchLM publishes:** `canonicalModelKey` (primary), `slug`, `model`+`creator` (the only join into the public leaderboard, matched on exact then NFKC-normalized identity at `benchlm-public-leaderboard.ts:182-186`), `id`, `family.familyKey`/`baseFamilyModelKey`/`relatedModelKeys`/`supersedesModelKey`, `url`, `markdownUrl`. **No HuggingFace id anywhere.** The `family` graph is the strongest *within-source* identity structure available and is entirely unused.

---

## 4. LiveBench

**Artifacts** (`livebench-discovery.ts:42-48`): `public/table_<date>.csv`, `public/categories_<date>.json`, `public/cost_<date>.csv`, `src/Table/modelLinks.js`, pinned to one git commit with per-file blob-id verification. `src/lib/constants.js` selects the canonical release; `src/lib/compute.js` and `src/Table/Averaging.js` are blob-pinned methodology guards.

**Current live release `2026-06-25`:** 46 models, 23 tasks, 7 categories (Reasoning, Coding, Agentic Coding, Mathematics, Data Analysis, Language, IF).

### cost CSV — 76 columns published, 27 consumed

| Column group | Count | Kept? | Note |
| --- | --- | --- | --- |
| `model` | 1 | kept | |
| `<taskId>` (per-task evaluation cost USD) | 23 | kept → `evaluationCostUsd` | |
| `nq_<taskId>` (question count) | 23 | kept → `questionCount` | |
| `avg_input_tokens`, `avg_output_tokens` | 2 | kept | |
| `input_price_per_million`, `output_price_per_million` | 2 | kept | 46/46 populated |
| **`out_<taskId>`** (per-task mean output tokens) | **23** | **dropped** | tolerated at `parser.ts:300`, never read. Ranked #12 |
| **`cost_per_question`** | 1 | **dropped** | tolerated at `parser.ts:301`. Ranked #1 |
| **`cost_per_successful_task`** | 1 | **dropped** | tolerated at `parser.ts:301`. Ranked #1 |

`OPTIONAL_COST_COLUMNS` at `src/livebench/parser.ts:36` names only the four kept optional columns; the three dropped groups are allowed past `requireCostSchema` (`parser.ts:300-303`) purely so validation does not fail, then never enter `LiveBenchTaskEconomics` (`src/livebench/contracts.ts:31-40`).

### modelLinks.js — 10 info fields published, 5 consumed

Field coverage across all 271 entries / the 44 matched current-table models:

| Field | All / current | Kept? | Where |
| --- | --- | --- | --- |
| `organization` | 271 / 44 | kept | `parser.ts:237` |
| `displayName` | 271 / 44 | kept | `parser.ts:235-236` |
| `openweight` | 94 / 11 | kept | `parser.ts:238-239` |
| `reasoner` | 143 / 44 | kept | `parser.ts:240-241` |
| `finetune.baseModel` | 1 / 1 | kept | `parser.ts:256` |
| **`huggingface`** | **43 / 9** | **kept only for finetunes** | `parser.ts:261` — the non-finetune branch returns `lineageSourceUrl: null` at `parser.ts:253`. Ranked #2 |
| **`url`** | **270 / 43** | **kept only for finetunes** | same. Provider announcement/docs URL |
| **`version`** | **156 / 14** | **dropped** | dated snapshot label. Ranked #13 |
| **`highUnseenBias`** | 1 / 1 | **dropped** | upstream contamination warning |
| **`finetune.organization`, `finetune.baseOrganization`** | 1 / 1 | **dropped** | |

Variant objects upstream currently carry only `rawName` and `displayName`; the parser additionally handles `url`, `openweight`, `reasoner` on variants (`parser.ts:216-219`), which is forward-compatible but currently unexercised.

**Join keys:** `sourceModelId` (table CSV row label, e.g. `gpt-5-high`), `modelLinks` key, variant `rawName`, `organization`, `displayName`, **`huggingface` URL**, `url`. The HF URL is the join key; it is discarded for 41 of 43 entries that publish it.

---

## 5. LMArena

Worked from `workers/benchmark-ingest/src/lmarena.ts` and the four checked-in fixtures (`test-fixtures/lmarena/{agent,text_style_control,text_style_control_page_100,text_to_image}.json`), which carry real Dataset Viewer envelopes.

**Transport:** HF Dataset Viewer `filter` endpoint (`lmarena.ts:44`), 11 subsets (`lmarena.ts:11-23`), split pinned to `latest` (`:310-311`), category pinned to `overall` (`source-steps.ts:93`), 100-row pages. Pinned-commit Parquet fallback at `lmarena.ts:45`.

**Row allowlist** — `workers/benchmark-ingest/src/source-steps.ts:772-776`:
- standard: `model_name`, `organization`, `license`, `rating`, `rating_lower`, `rating_upper`, `variance`, `vote_count`, `rank`, `category`, `leaderboard_publish_date`
- agent: `model_name`, `organization`, `license`, `score`, `score_ci_lower`, `score_ci_upper`, `observation_count`, `session_count`, `rank`, `category`, `leaderboard_publish_date`

The fixtures contain exactly these fields and nothing more — LMArena is the one source where our allowlist and the published schema are congruent. Two losses remain:

- **`variance`** is allowlisted and range-checked (`source-steps.ts:903-905`) but read by neither `parseStandardRow` (`lmarena.ts:198-214`) nor `parseAgentRow` (`:229-245`). Ranked #15.
- **`license`** is not stored as a licence. `lmarena.ts:151-157` collapses it to a 3-value `sourceType`: `'proprietary'`→Proprietary, `'unknown'`/empty→Unknown, **everything else**→Open Weight. The actual licence string (Apache-2.0, MIT, Llama-3-Community, …) is lost — that is a real product fact for self-hosting and compliance filters, thrown away by a lossy bucketing.

**Silent loss path:** `lmarena.ts:398-402` drops any model appearing twice within a page (`identityCounts.get(...) === 1`), contributing no model and no metric, without failing or recording the drop. `rankFieldSize` is forced null (`:443-447`) because a page is a window, not a cohort — correct, but it means LMArena ranks display without a denominator.

**Join keys published:** `model_name` and `organization` only. No URL, no HF id. LMArena is the hardest source to join and will need `MODEL_ALIASES` entries built by hand or via a name-normalization review — it cannot be joined structurally.

---

## 6. OpenRouter

Live payload: 422 models. Enumerated top-level and nested keys, with population counts:

| Field | Coverage | Allowlisted? | Note |
| --- | --- | --- | --- |
| `id`, `canonical_slug`, `name`, `created`, `context_length` | 422 | ✅ `index.ts:67` | |
| **`hugging_face_id`** | **422** | ✅ `index.ts:67` (added today) | **No consumer.** `openrouter-normalization.ts:144-196` never reads it; there is no DB column (`partitioned-publication.ts:102`); nothing in `src/` or `functions/` references it. It will land in R2 at the next ingest and stop there. See #2. |
| `architecture.{modality, input_modalities, output_modalities, tokenizer, instruct_type}` | 422 | ✅ `index.ts:73` | |
| `pricing.{prompt, completion, input_cache_read, input_cache_write}` | 422 / 422 / 250 / 74 | ✅ `index.ts:76` | |
| `top_provider.{context_length, max_completion_tokens, is_moderated}` | 422 | ✅ `index.ts:79` | |
| `per_request_limits`, `supported_parameters`, `expiration_date`, `knowledge_cutoff` | 422 | ✅ `index.ts:70` | |
| **`description`** | **422** | ❌ | excluded by explicit 2026-08-21 decision |
| **`reasoning`** `{mandatory, supported_efforts, default_effort, default_enabled, supports_max_tokens}` | **289** | ❌ | ranked #7 — the reasoning-effort axis |
| **`default_parameters`** `{temperature, top_p, top_k, frequency_penalty, presence_penalty, repetition_penalty}` | 422 | ❌ | provider-recommended defaults |
| **`alias_target`** `{name, slug}` | 12 | ❌ | resolves aliased routes to canonical — free identity edges |
| **`links.details`** | 422 | ❌ | per-model endpoints URL; the documented path to per-provider (not just top-provider) facts |
| **`supported_voices`** | 422 (mostly null) | ❌ | |
| **`pricing.web_search`** | 158 | ❌ | ranked #8 |
| **`pricing.overrides[]`** `{min_prompt_tokens, prompt, completion}` | **59** | ❌ | long-context tier pricing — the OpenRouter equivalent of the OpenCode Zen tier rows |
| **`pricing.{image, image_output, audio, audio_output, input_audio_cache, internal_reasoning, input_cache_write_1h}`** | 29 / 9 / 32 / 2 / 27 / 30 / 32 | ❌ | multimodal + reasoning-token meters |
| **`benchmarks.artificial_analysis`** | 169 | ❌ prohibited | correctly refused (`index.ts:99-107`) |
| **`benchmarks.design_arena[]`** `{arena, category, elo, win_rate, rank}` | **230** | ❌ | ranked #14, policy-gated by AA sibling |

**Second-order loss — allowlisted but unparsed at the catalog layer.** `projectOpenRouterModelsPayload` (`index.ts:113-139`) stores all 20 allowlisted fields into R2, but `parseModels` (`index.ts:162-210`) reads only `id`, `name`, `pricing.*`, `context_length`, `top_provider.max_completion_tokens`, `expiration_date`. The remaining fields survive only because the *benchmark* worker re-reads the frozen projection in `openrouter-normalization.ts:181-194`. So the catalog API sees a much thinner model than the benchmark API does. `hugging_face_id` is not read by either.

Two smaller behaviours worth naming:

- `index.ts:193` drops every model whose prompt and completion price is `-1` and whose id starts with `openrouter/` — the free/auto router pseudo-models. Deliberate.
- `canonicalOpenRouterProviderId` (`index.ts:151-160`) derives `providerId` from the id prefix with a 4-entry alias map (`qwen→alibaba`, `x-ai→xai`, `moonshotai→kimi`, `z-ai→zai`). This is the only creator attribution we have; it silently mislabels any future prefix not in the map.

---

## 7. OpenCode Zen

**Two artifacts, three tables.** `opencode.ai/zen/v1/models` returns 64 entries with exactly 4 fields — `id`, `object`, `created`, `owned_by`. Only `id` is read (`index.ts:240-244`); `created` and `owned_by` are dropped.

`opencode.ai/docs/zen/` publishes **three** tables; the parser finds two by exact header match (`index.ts:245-246`):

| Table | Header | Rows | Used? |
| --- | --- | --- | --- |
| T0 | `Model \| Model ID \| Endpoint \| AI SDK Package` | 63 | **partially** — only cols 0–1 (`index.ts:248`). `Endpoint` and `AI SDK Package` dropped |
| T1 | `Model \| Input \| Output \| Cached Read \| Cached Write` | 74 | **partially** — `index.ts:250` destructures 4 of 5 columns; **`Cached Write` (21 non-blank rows) is dropped**, even though `ModelOffer.cacheWriteMicroDollarsPerMillion` exists |
| T2 | `Model \| Deprecation date` | 18 | **never parsed** |

Join outcome measured live: 74 pricing rows → **50 offers**. 22 rows have no model-ID entry (all the tiered/peak rows, §2.5), 2 have IDs absent from the models API (`qwen3.7-max`, `qwen3.7-plus`).

`'Free'` maps to `0` micro-dollars at `index.ts:228`. Note this is a *different* case from the BenchLM open-weight sentinel: on OpenCode Zen, `Free` genuinely means a $0 rate on a hosted route, so `0` is correct here.

**Join keys published:** `Model ID` (the Zen route id), display name, `Endpoint` URL, `AI SDK Package` (→ real creator), `owned_by` (always `"opencode"`, useless). The two useful ones are dropped.

---

## 8. Manual subscription manifests + subscription crawler

`src/catalog/manual-manifests.ts` is a hand-curated evidence file, not an adapter — there is no upstream to compare it against field-by-field. What matters for the audit:

- **8 providers** (`manual-manifests.ts:3`) + separate Alibaba token and OpenAI API sources, each with `sourceUrl`, `sourceKind: 'manual_manifest'`, `parserVersion` stamp, `evidenceLocator`, `reviewStatus`, and (for 4 providers) a page `contentHash`.
- **Verification dates are explicit and honest** (`manual-manifests.ts:32-41`): anthropic/google/xai/openai/zai verified 2026-08-21, alibaba/kimi 2026-08-10, deepseek 2026-08-03. The comment at `:18-31` documents the earlier bug where the ingest clock was used as the observation time — that is now fixed.
- **Two sources are flagged `needs_review`**: `xai` (its page declares `Content-Signal: ai-input=no`, so the crawler is blocked by policy at `subscription-crawler.ts:103-105` and the stored price cannot be re-verified automatically) and `zai` (per-tier prices no longer published).
- **18 of 23 plans have `supportedModelIds: []`**. The 5 populated ones (`manual-manifests.ts:254, 371, 384, 395, 406`) hold bare ids like `'gpt-5.6-terra'` and `'qwen3.7-plus'` that match no other source's identifier namespace. Combined with the empty `SUBSCRIPTION_MODEL_MAP`, subscription↔model binding is effectively non-existent.

The **subscription crawler** (`workers/catalog-ingest/src/subscription-crawler.ts`, 489 lines, branch-only) is a genuinely conservative design: robots.txt + `Content-Signal` honoured, 2 MiB cap, prices read **only** from JSON-LD `Product`/`Offer` blocks (never free text), normalized-exact single-match required to update a price, and any changed source forced to `entitlementEvidence.status: 'stale'` + `reviewStatus: 'needs_review'`. Its registry (`src/data-sources/public-registry.ts:1-9`) adds two providers not in the manual manifests — **perplexity** and **microsoft** — so those exist as crawl targets with no manifest behind them yet.

**Not deployed** (§9).

---

## 9. Deployment status

There is **no CI**. No `.github/` directory exists on either branch; all deploys are manual Wrangler invocations.

Branch state: `main` @ `352428e` (2026-08-23 17:47), `codex/frontend-rebuild` @ `11d8248` (2026-08-23 17:48), merge base `b134a1b` (2026-08-13). `git rev-list --left-right --count main...codex/frontend-rebuild` = **2 / 144** — main is not frozen; it has 2 independent commits that were reproduced on the feature branch.

| Adapter file | On `main`? | tip-to-tip diff | Deployed? |
| --- | --- | --- | --- |
| `workers/benchmark-ingest/src/benchlm.ts` | yes | **identical blob** | yes |
| `workers/benchmark-ingest/src/benchlm-public-leaderboard.ts` | yes | identical | yes |
| `workers/benchmark-ingest/src/lmarena.ts` | yes | identical | yes |
| `workers/benchmark-ingest/src/litellm.ts` | yes | identical | yes |
| `workers/benchmark-ingest/src/openrouter-normalization.ts` | yes | **+55/-0** | **no** — the 8 new route-receipt fields (`createdAt`, `expirationDate`, `knowledgeCutoff`, `tokenizer`, `instructionFormat`, `isModerated`, `perRequestLimitsJson`, `cacheWriteUsdPerMillion`) exist only locally |
| `workers/benchmark-ingest/src/index.ts` | yes | +12/-2 | **no** — the LiveBench cron branch is the only wiring that runs LiveBench at all |
| `workers/benchmark-ingest/src/livebench-discovery.ts` | **absent** | +424/-0 | **no** |
| `workers/benchmark-ingest/src/livebench-refresh.ts` | **absent** | +388/-0 | **no** |
| `src/livebench/parser.ts` | **absent** | +387/-0 | **no** |
| `src/livebench/contracts.ts` | **absent** | +470/-0 | **no** |
| `workers/catalog-ingest/src/index.ts` | yes | **+17/-6** | **no** — `expiration_date` parsing, `deprecated` availability derivation, `cache_write` price, `hugging_face_id` allowlist entry, and the widened `plan_offers`/`model_offers` INSERTs are all local-only |
| `workers/catalog-ingest/src/catalog-cycle.ts` | yes | +130/-13 | **no** — the whole `retrieve-subscriptions` pipeline step |
| `workers/catalog-ingest/src/subscription-crawler.ts` | **absent** | +489/-0 | **no** |
| `src/data-sources/public-registry.ts` | **absent** | new | **no** |
| `src/catalog/manual-manifests.ts` | yes | +76/-60 | **no** — including the corrected Google multipliers (288→2, 576→4, 2880→5, 11520→20 — the deployed values are wrong by two orders of magnitude), the anthropic/zai URL changes, the xai/zai `needs_review` downgrades, and the new annual-price fields |
| `src/benchmarks/model-aliases.ts` | yes | identical (empty) | yes — empty in production too |
| `src/benchmarks/subscription-model-map.ts` | yes | identical (empty) | yes |

**Runtime configuration actually live** (per `docs/handoff/2026-08-23-codex-handoff.md` §3, verified read-only against remote on 2026-08-23):

- Pages project `tokenbench`, production branch **`main`**, domains `tokenbench-27t.pages.dev` / `tokenbench.monomind.one`.
- Catalog Worker version `c3b23ed9-…`: has `AUTOMATED_SOURCE_IDS` only. **`AUTOMATED_SUBSCRIPTION_SOURCE_IDS` is not set**, so the crawler could not run even if deployed.
- Benchmark Worker version `2510f6b5-…`: cron `15 2 * * SUN` only. **The `17 */6 * * *` LiveBench discovery trigger has never been active in production.**
- **Remote D1 has migrations 0001–0012 applied.** `0013_pipeline_foundation` … `0019_plan_annual_price_evidence` are pending.

Three consequences that matter for planning:

1. **LiveBench has never run in production.** The `deepseek-v4-flash` parse failure is breaking a feature that exists only locally and on any staging path. It still blocks the branch from being deployable.
2. **`model_configurations` and `livebench_model_configurations` do not exist in production at all** — they arrive in migrations 0013/0014. So the strict join isn't merely empty in production; its tables are absent.
3. **The catalog worker cannot be deployed from this branch without migrations 0013–0019 first.** Every widened INSERT in `catalog-ingest/src/index.ts` and `catalog-cycle.ts` targets columns added by 0015/0016/0019 (`cache_write_micro_dollars_per_million`, `expiration_date`, `annual_cost_micro_dollars`, `annual_effective_monthly_cost_micro_dollars`). Deploying code before migrations fails every write.

Regarding the note that the workers "were redeployed today from a narrow cut of `main` plus three fixes": no document in the repo uses that phrase, and no artefact records such a deploy. What the handoff records is that the *active* worker versions carry only `main`-era configuration (single cron, no subscription env var) — consistent with a `main`-based deploy. Treat the three fixes as unrecorded; the field-level conclusions above are unaffected because all four benchmark adapters (`benchlm`, `benchlm-public-leaderboard`, `lmarena`, `litellm`) are **byte-identical** between the two branch tips.

---

## 10. Join keys — what each source publishes, and what the empty maps cost

| Source | Identity keys published | Keys we retain | Cross-source join potential |
| --- | --- | --- | --- |
| BenchLM | `canonicalModelKey`, `slug`, `model`, `creator`, `id`, `url`, `markdownUrl`, `family.{familyKey, baseFamilyModelKey, relatedModelKeys, supersedesModelKey}` | key, slug, model, creator | **No HF id, no provider model id.** Joinable to other sources only by name+creator normalization. Internally, the `family` graph is a strong spine we ignore. |
| LiveBench | table `sourceModelId`, `modelLinks` key, variant `rawName`, `organization`, `displayName`, **`huggingface` URL**, `url`, `version` | id, org, displayName; HF/url **only for finetunes** | **HF URL ↔ OpenRouter `hugging_face_id` is the one exact structural join in the system.** 9 of the 44 current-table models publish it. |
| LMArena | `model_name`, `organization` | both | Name-only. Requires manual alias review; nothing structural exists. |
| LiteLLM | map key (`provider/model`), `litellm_provider`, `source` (docs URL) | key, provider | The map key is literally `provider + model id`, which matches OpenRouter's `id` format for many rows — a high-yield, low-risk exact-string join nobody is attempting. |
| OpenRouter | `id`, `canonical_slug`, **`hugging_face_id`**, `alias_target.slug`, `links.details` | id, canonical_slug, hugging_face_id (stored, unread) | The richest identity surface of any source. Two of its three join keys (`hugging_face_id`, `alias_target`) are unused. |
| OpenCode Zen | `Model ID`, `AI SDK Package`, `Endpoint` | Model ID only | `AI SDK Package` → creator; `Model ID` overlaps OpenRouter's suffix for many models. |
| Manual manifests | `supportedModelIds[]` (5 plans), `providerId` | both | Bare ids in a private namespace; match nothing. |

**Cost of the two empty maps, concretely:** with `MODEL_ALIASES` empty, ~4,000 model records across five sources sit in five disjoint keyspaces; no model has more than one source's evidence; every non-BenchLM model is `rankingEligible: false` and `evidenceStatus: 'source_only'`; price never meets score. With `SUBSCRIPTION_MODEL_MAP` empty, no subscription plan is linked to any benchmarked model. Neither map can be filled by guessing — but items #2 (HF id ↔ HF URL) and the LiteLLM key format above are **exact-string** evidence that satisfies the `docs/data-sources.md:23-32` standard without any fuzzy matching.

---

## 11. Cadence and licensing constraints

**Cadence** (`src/ingestion/cadence.ts`):

| Pipeline | Cron | Freshness window | Deployed? |
| --- | --- | --- | --- |
| Catalog (OpenRouter, OpenCode Zen, manual, subscriptions) | `20 0 * * *` — daily | 36 h | cron yes; subscription step no |
| Benchmark (BenchLM, LMArena, LiteLLM) | `15 2 * * SUN` — weekly | 8 days | yes |
| LiveBench discovery | `17 */6 * * *` — 4×/day | 12 h | **no** |

Cadence keys are UTC-day (catalog), ISO-week (benchmark), 6-hour bucket (LiveBench), and a cycle only starts on a strictly newer key (`cadence.ts:74-76`). Design implication: anything derived from a weekly benchmark revision cannot be presented as daily-fresh, and OpenRouter route facts are pinned to a catalog revision and "cannot be joined into an earlier benchmark revision" (`docs/data-sources.md:105-106`).

**Licensing** (`docs/data-sources.md:10-18`), with visible-attribution requirements:

| Source | Terms | Display constraint |
| --- | --- | --- |
| BenchLM | MIT; reuse permitted | Attribution "Data from BenchLM.ai". Only the allowlisted fields at `data-sources.md:44-49` may be published — **this is the binding constraint on ranked items #3, #5, #9, #10, #11**, and it is a TokenBench policy list, not a licence limit. Extending it is a review decision, not a legal one. |
| LMArena | CC-BY-4.0 | Attribution required. |
| OpenRouter | OpenRouter ToS — **explicitly not MIT/CC** | Attributed catalog/route/price/context/modality/parameter facts **only**; "TokenBench does not expose a bulk OpenRouter mirror" (`data-sources.md:83`). Items #7/#8 stay inside "catalog facts"; **item #14 (`design_arena` elo/rank) would be publishing a third-party benchmark measurement out of an OpenRouter payload and needs its own review.** |
| LiteLLM | MIT | "Route-price/context corroboration only; it never defines public rankings" (`data-sources.md:17`). Item #6's capability flags are *not* prices — publishing them as facts needs a scope decision, though MIT permits it. |
| LiveBench | CDLA-Permissive-2.0, project-owner-verified 2026-08-19 (`livebench-refresh.ts:41-47`), enforced by a D1 licence-registry check at `livebench-refresh.ts:227-242` | Permissive. **No licensing obstacle to items #1, #2, #12, #13** — the upstream repo has no licence declaration, so the CDLA classification is caller-owned evidence and is validated before every ingest. |
| OpenCode Zen | not classified in `data-sources.md` | Ingested as `official_json` + `official_html` with `parserVersion: 'zen-docs-v1'` (`index.ts:266-272`). **Gap:** OpenCode Zen appears in `src/data-sources/public-registry.ts` but has no row in the `docs/data-sources.md` rights table. Items #4 and #17 should get a terms line before shipping. |

**Hard prohibitions** (`data-sources.md:34-38`, 119-126): Artificial Analysis entirely — no calls, no storage, no AA-derived field from any other feed. Enforced at `index.ts:99-107` (catalog projection) and `benchlm.ts:331-344`/`:481-486` (definition stripping, with a hard failure if a prohibited definition carries non-zero weight). BenchLM `speed.json` refused at `benchlm.ts:709`. Open LLM Leaderboard, LiveCodeBench, and Open ASR excluded from v1.

**Policy-gated, not source-gated** — worth an explicit re-decision because each already exists in data we fetch: BenchLM `scoreInterval90` (220/393 published uncertainty bands), BenchLM per-benchmark scores (4,347), OpenRouter `description`, OpenRouter `benchmarks.design_arena` (230/422).

---

## Appendix — allowlists quoted

```
workers/catalog-ingest/src/index.ts:61-68   OPENROUTER_IDENTITY_FIELDS
  'id', 'canonical_slug', 'name', 'created', 'context_length', 'hugging_face_id'
workers/catalog-ingest/src/index.ts:69-71   OPENROUTER_TRAILING_FIELDS
  'per_request_limits', 'supported_parameters', 'expiration_date', 'knowledge_cutoff'
workers/catalog-ingest/src/index.ts:72-74   OPENROUTER_ARCHITECTURE_FIELDS
  'modality', 'input_modalities', 'output_modalities', 'tokenizer', 'instruct_type'
workers/catalog-ingest/src/index.ts:75-77   OPENROUTER_PRICING_FIELDS
  'prompt', 'completion', 'input_cache_read', 'input_cache_write'
workers/catalog-ingest/src/index.ts:78-80   OPENROUTER_TOP_PROVIDER_FIELDS
  'context_length', 'max_completion_tokens', 'is_moderated'

workers/benchmark-ingest/src/benchlm.ts:198-203  artifact envelope
workers/benchmark-ingest/src/benchlm.ts:376-386  leaderboard items (9 fields)
workers/benchmark-ingest/src/benchlm.ts:397-434  model items (10 + 3 nested groups)
workers/benchmark-ingest/src/benchlm.ts:441-453  pricing items (11 fields)
workers/benchmark-ingest/src/benchlm.ts:461-471  comparison items (5 fields)
workers/benchmark-ingest/src/benchlm.ts:490-494  benchmark definitions (3 fields)
workers/benchmark-ingest/src/benchlm-public-leaderboard.ts:108-117  row (8 fields)
workers/benchmark-ingest/src/benchlm-public-leaderboard.ts:133-140  envelope (6 fields)

workers/benchmark-ingest/src/source-steps.ts:772-776   LMArena row allowlists

src/livebench/parser.ts:36    OPTIONAL_COST_COLUMNS
  'avg_input_tokens', 'avg_output_tokens', 'input_price_per_million', 'output_price_per_million'
src/livebench/parser.ts:300-303  columns tolerated but never read (out_*, cost_per_question,
                                 cost_per_successful_task)

workers/catalog-ingest/src/index.ts:245-246  OpenCode table selection by exact header
workers/catalog-ingest/src/index.ts:250      const [displayName, input, output, cachedInput] = row;
                                             ← 5th column (Cached Write) discarded
```
