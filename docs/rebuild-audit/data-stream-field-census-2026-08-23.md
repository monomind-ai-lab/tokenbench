# TokenBench deployed-API data-stream field census

**Census date:** 2026-08-23 (requests made 2026-08-23 09:57–10:20 UTC)
**Origin:** `https://tokenbench.monomind.one`
**Repo state:** `codex/frontend-rebuild` @ `11d8248`
**Method:** read-only. No deploy, migration, or code change.

## What was actually collected

| Population | Method | Size |
| --- | --- | --- |
| `/api/catalog` | 1 request + 3 `?provider=` probes | 12 provenance, 23 plans, 471 model offers |
| `/api/benchmarks` | 1 request | 4 sources, 14 routes, 4,658 compare-directory models |
| `/api/benchmarks/models` | walked **every** cursor page at `limit=100` for `status=all`, `status=current`, `status=archived` | 47 pages, **4,674 distinct models (100% of population)** |
| `/api/benchmarks/models/<slug>` | **every slug in the directory**, not a sample | **4,674 / 4,674 profiles (100%)**, all HTTP 200 |
| `/api/benchmarks/leaderboards/<key>` | all 14 keys from `src/routing/leaderboard-routes.ts`, all cursor pages, plus `includeEstimated=1` on all 7 routes that accept it | 17 JSON pages, 1,467 entries |
| `/api/benchmarks/leaderboards/<key>/csv` | all 14 keys | 14 files, 1,467 data rows |
| `/api/benchmarks/price-performance` | 1 request | 54 points |
| `/api/benchmarks/comparison` | GET + v1 media type | **404 — not deployed** |
| Upstream controls | live `openrouter.ai/api/v1/models` (422 rows) and LiteLLM `model_prices_and_context_window.json` (3,176 rows), fetched to separate *source-does-not-publish* from *we-drop-it* | — |

The 4,674-profile walk means **every fill rate below is a true population count, not an estimate.** Where a denominator is smaller than 4,674 it is the count of parent objects that exist (e.g. 3,829 price-route objects across 4,674 profiles).

---

## Headline corrections to the 2026-08-21 matrix

| Prior claim | Verified today | Status |
| --- | --- | --- |
| `/api/benchmarks` is **stale**, receipt `benchmark_be54b95…` dated 2026-08-13 | `fresh`, revision `benchmark_b10eca4636bc59118b74ed3c49ea25be`, published `2026-08-23T08:08:08Z` | **fixed since** |
| price-performance has **73 points** | **54 points**, zero `$0` values | **fixed since** (69→54 per today's D1 fix) |
| `/api/benchmarks/lifecycle`, `rankings`, `subscription` return **HTTP 200 site HTML** | all three return **HTTP 404 `application/json`** from `functions/api/[[path]].ts` | **improved** — clients no longer get HTML on `response.ok` |
| catalog is `fresh` while 8 of 12 sources are outside their evidence window | catalog is `fresh` and, under the *source-kind aware* rule, correctly so (oldest manual source `xai-subscription` is 11 d old vs a 30-day manual window) | **rule is right; see caveat below** |
| "current public catalog contains **50 `opencode-zen` model offers**" | exactly **50/471** | **confirmed** |
| LiveBench is "wired-but-unpopulated" publicly | **confirmed** — LiveBench appears in **zero** production rows: not in `/api/benchmarks` `data.sources` (which lists only `benchlm`, `lmarena`, `litellm`, `openrouter`), not in any profile `sources[]`, not in any `priceRoutes[]`, not in any `ledger[]` | **confirmed** |
| Cross-source maps are empty → "partially composable" | Understated. **Cross-source overlap is exactly zero.** See §4. | **worse than reported** |
| `/api/benchmarks/models` is the model directory | Understated. The **default view is capped at 100 rows** by a weekly-ranks join. See §5.1. | **new defect** |

### `hugging_face_id`: not present, and it will *not* appear after the next ingest

- **Present today:** no. `0/471` catalog model offers carry it; the field does not exist in any deployed response.
- **After the next catalog ingest:** still no. `hugging_face_id` was added to `OPENROUTER_IDENTITY_FIELDS` (`workers/catalog-ingest/src/index.ts:67`), which governs only the **sanitized R2 evidence projection**. The `ModelOffer` contract (`src/catalog/contracts.ts:85-107`) has no field for it, and `parseModels` (`workers/catalog-ingest/src/index.ts:176-206`) never reads it. It will be preserved in the R2 blob and dropped before it reaches D1 or any API.
- Upstream publishes it for **169 / 422** OpenRouter models (40%), so this is a real join key being discarded one layer too early.

### The `$0` fix is only half deployed

Empirically:

- Leaderboards: **0 of 202** BenchLM-sourced `primaryPrice` rows carry `inputUsdPerMillion: 0`. Clean.
- Price-performance: **0 of 54** points carry a `$0` price; 69 − 15 = 54 reconciles exactly.
- Model profiles: **94 of 234** BenchLM price routes *still* publish `inputUsdPerMillion: 0` **and** `outputUsdPerMillion: 0` with `verificationStatus: "primary"`. 91 are `Open Weight`, 3 are `Proprietary`.
- **The 15 models excluded from price-performance are precisely the 15 that still show `$0` on their profile page**, all `evidenceStatus: supported`, e.g. `gpt-oss-120b`, `deepseek-v3-1`, `llama-4-scout`, `glm-4-7`, `gemma-4-31b`.

Cause (inferred from timestamps, stated as inference): within revision `benchmark_b10eca…`, the fact tables carry `2026-08-23T08:08:08Z` (16:08 local, after the 14:44 local D1 commit) while `benchmark_model_profile_snapshots` carry `generatedAt: 2026-08-23T02:15:18Z` (10:15 local, before it). The fact tables were rebuilt post-fix; the profile snapshots were not.

**And the fix has a hole.** `benchlmHostedRate` (`workers/benchmark-ingest/src/benchlm.ts:961`) only nulls the sentinel when `sourceType === 'Open Weight'`. BenchLM labels three LiquidAI LFM2 models `Proprietary`:

- `lfm2-24b-a2b`, `lfm2-5-1-2b-thinking`, `lfm2-5-1-2b-instruct` — all `$0 in / $0 out`, all `verificationStatus: primary`, all `evidenceStatus: supported`.

`lfm2-24b-a2b` is, **right now**, the value of `/api/benchmarks` → `data.homeDecisionSnapshot.lowestVerifiedRepresentativeRate`, published with `representativePriceUsdPerMillion: 0` and `updatedAt: 2026-08-23T08:08:08Z` — i.e. produced by the *post-fix* run. The commit message asserts "no proprietary model has ever carried this sentinel"; that is no longer true. The card also links to `/leaderboards/llm/pricing-context/`, which contains **only** OpenRouter rows, so the named model is not on the page it points to.

### Production API code is older than the repo

`profileFallback` (added `aa5f727`, 2026-08-21 09:34) **is** in the deployed `/api/benchmarks/models` response. `categories` (added `c4241b7`, 2026-08-21 17:49 to `functions/_shared/model-directory-db.ts:421`) **is not**. So the deployed Pages Functions sit in the window `aa5f727 ≤ deployed < c4241b7` — nothing from 2026-08-22 or 2026-08-23 is in the API layer. This is the single explanation for most `not-deployed` rows below.

### LiveBench

`deepseek-v4-flash has no modelLinks metadata` is thrown at `src/livebench/parser.ts:232`. Because LiveBench has **zero** production footprint, the blast radius today is: nothing that is currently served changes. What it blocks is everything LiveBench was to supply — task-level economics, `lineageSourceUrl` (the HuggingFace URL that would pair with `hugging_face_id`), and the `/api/benchmarks/comparison` endpoint, which returns 404 for a second, independent reason (never routed).

---

## 1. Field census — `/api/catalog`

Denominators: 12 provenance records, 23 plans, 471 model offers, 1 envelope.

| Path | Type | Fill | Class | Note |
| --- | --- | --- | --- | --- |
| `revision` | string | 1/1 | — | `catalog_dc9c2f35aedf758f5958b524_c7b6e328+manual-bootstrap-2026-08-12` |
| `publishedAt` | string | 1/1 | — | `2026-08-23T00:20:19.817Z` |
| `freshness.status` | enum | 1/1 | — | `fresh` (values: `fresh`/`stale`/`bootstrap`) |
| `freshness.checkedAt` | string | 1/1 | — | |
| `freshness.message` | string | 0/1 | — | present only when stale |
| `provenance[].id` | string | 12/12 | — | 12 distinct |
| `provenance[].providerId` | string | 12/12 | — | 11 distinct (alibaba×2) |
| `provenance[].sourceUrl` | string | 12/12 | — | |
| `provenance[].observedAt` | string | 12/12 | — | range `2026-08-12T12:00Z` → `2026-08-23T00:20Z` |
| `provenance[].sourceKind` | enum | 12/12 | — | `manual_manifest`=10, `official_json`=1, `official_html`=1 |
| `provenance[].confidence` | enum | 12/12 | — | `manual_verified`=10, `official`=2 |
| `provenance[].snapshotKey` | string | 10/12 | genuinely-sparse | absent for the 2 alibaba manual rows |
| `provenance[].contentHash` | string | **3/12** | not-deployed | `openrouter-models`, `opencode-zen`, `xai-subscription` only. `index.ts:514` binds `contentHash ?? sha256:${hash}` — never null — so a current worker would fill all 12 |
| `provenance[].parserVersion` | string | **11/12** | not-deployed | missing exactly on `openrouter-models`; `index.ts:514` defaults it to `adapter-v1` (added `22e25c3`) |
| `provenance[].evidenceLocator` | string | 10/12 | genuinely-sparse | absent on `openrouter-models`, `deepseek-api` |
| `provenance[].reviewStatus` | string | **11/12** | not-deployed | missing exactly on `openrouter-models`; `index.ts:514` defaults it to `verified` |
| `plans[].id / providerId / displayName / currency / pricingBasis / route / billingCycle / sourceId` | string | 23/23 | — | `billingCycle` is `monthly` for all 23 |
| `plans[].monthlyCostMicroDollars` | number | 23/23 | — | min 6e6 ($6), med 5e7 ($50), max 2e8 ($200) |
| `plans[].annualCostMicroDollars` | number | **0/23** | not-deployed | `anthropic:pro` carries `200_000_000` in `src/catalog/manual-manifests.ts:271` (added `c4241b7`, after the deployed build) |
| `plans[].annualEffectiveMonthlyCostMicroDollars` | number | **0/23** | not-deployed | same line, `17_000_000` |
| `plans[].supportedModelIds[]` | string[] | 23/23 arrays; **5/23 non-empty** | genuinely-sparse | 20 ids total; only OpenAI + Alibaba token plans name models |
| `plans[].entitlement.kind` | enum | 23/23 | — | `credits`=10, `guardrail_limited`=9, `rolling_limit`=4 |
| `plans[].entitlement.description` | string | 23/23 | — | 21 distinct |
| `plans[].entitlementEvidence.status` | enum | 23/23 | — | `projected`=10, `verified`=6, `stale`=5, `dynamic_unknown`=2 — **only 6/23 plans are verified** |
| `plans[].entitlementEvidence.boundType` | enum | 23/23 | — | `outer_ceiling`=13, `hard_max`=4, `practical_upper`=4, `unknown`=2 |
| `plans[].entitlementEvidence.dimensions[]` | object[] | 38 rows over 23 plans | — | len 0–4, median 1 |
| `…dimensions[].metric` | enum | 38/38 | — | `messages`=16, `feature_uses`=12, `credits`=6, `model_calls`=3, `tasks`=1 |
| `…dimensions[].unit` | enum | 38/38 | — | 7 distinct |
| `…dimensions[].window` | enum | 38/38 | — | `rolling_5h`=17, `monthly`=17, `weekly`=4 |
| `…dimensions[].max` | number | 31/38 | genuinely-sparse | min 25, med 4,000, max 160,000 |
| `…dimensions[].min` | number | 10/38 | genuinely-sparse | published bands only |
| `…dimensions[].resetRule` | string | 18/38 | genuinely-sparse | |
| `…dimensions[].modelId` | string | 9/38 | genuinely-sparse | OpenAI `sol`/`terra`/`luna` only |
| `…dimensions[].feature` | string | 12/38 | genuinely-sparse | Alibaba `agent`/`swarm`/`database` |
| `plans[].entitlementEvidence.projection.*` | object | 13/23 | — | present exactly for `status: projected` + 3 others; `formula`, `assumptions[]` (1–3), `caveats[]` (2) all 100% within |
| `plans[].entitlementEvidence.staleReason` | string | 5/23 | — | matches `status: stale` exactly |
| `plans[].entitlementEvidence.source.{url,accessedAt,confidence}` | | 23/23 | — | all `accessedAt: 2026-08-10T00:00:00Z`, all `confidence: high`, 9 distinct URLs |
| `modelOffers[].id / providerId / displayName / modelId / currency / unit / route / pricingBasis / sourceId / availability` | string | 471/471 | — | |
| `modelOffers[].pricingBasis` | enum | 471/471 | — | `openrouter`=417, `opencode_zen`=50, `direct_provider_api`=4 |
| `modelOffers[].availability` | enum | 471/471 | — | **`available`=471 — the enum is degenerate** (see `expirationDate`) |
| `modelOffers[].inputMicroDollarsPerMillion` | number | 471/471 | — | min 0, med 500,000 ($0.50/M), max 1.5e8 ($150/M) |
| `modelOffers[].outputMicroDollarsPerMillion` | number | 471/471 | — | min 0, med 2e6 ($2/M), max 6e8 ($600/M) |
| `modelOffers[].cachedInputMicroDollarsPerMillion` | number | 304/471 | genuinely-sparse | reconciles exactly: 250 OpenRouter (upstream publishes `input_cache_read` for 250/422) + 50 opencode + 4 direct |
| `modelOffers[].contextWindowTokens` | number | 421/471 | genuinely-sparse | the 50 opencode-zen rows carry none; min 4,095 med 262,144 max 2e6 |
| `modelOffers[].maxOutputTokens` | number | 374/471 | genuinely-sparse | min 2,048 med 65,536 max 1,024,000 |
| `modelOffers[].cacheWriteMicroDollarsPerMillion` | number | **0/471** | **not-deployed** | Upstream publishes `pricing.input_cache_write` for **74/422** OpenRouter models. `parseModels` reads it (`index.ts:199`), migration `0016` adds the column, both INSERTs bind it, and `functions/api/catalog.ts:185` maps it. All 74 are present in the catalog with the field absent. |
| `modelOffers[].expirationDate` | string | **0/471** | **not-deployed** | Upstream publishes `expiration_date` for **13/422**; all 13 are in the catalog, all with `availability: "available"` and no `expirationDate`. **Three expire tomorrow (2026-08-24)**: `inclusionai/ring-2.6-1t`, `inclusionai/ling-2.6-1t`, `inclusionai/ling-2.6-flash`; three NVIDIA `:free` routes also expire 2026-08-24. |
| `modelOffers[].longContextInputMicroDollarsPerMillion` | number | 0/471 | source-does-not-publish | no approved source emits a long-context tier |

### Catalog fields that exist upstream and are never modelled at all

Live OpenRouter publishes these per model; none has any representation in `ModelOffer`, so they are dropped by the **projection allowlist** in `workers/catalog-ingest/src/index.ts:61-79`:

| Upstream field | Upstream fill | In allowlist? | Reaches API? |
| --- | --- | --- | --- |
| `hugging_face_id` | 169/422 | yes (`:67`) | **no** — no contract field |
| `supported_parameters` | 419/422 | yes (`:70`) | no (surfaces on the *benchmark* side only) |
| `knowledge_cutoff` | 193/422 | yes (`:70`) | **no** — no contract field anywhere |
| `architecture.tokenizer` / `instruct_type` | 422/422 | yes (`:73`) | no |
| `top_provider.is_moderated` | 422/422 | yes (`:79`) | no |
| `per_request_limits` | 0/422 (all null) | yes (`:70`) | n/a — source-does-not-publish |
| `description` | 422/422 | **no** | no — dropped at `:37` |
| `benchmarks` | 230/422 | **no** | no — dropped at `:37` |
| `reasoning` | 289/422 | **no** | no — dropped at `:37` |
| `default_parameters`, `supported_voices`, `links`, `alias_target` | varies | **no** | no — dropped at `:37` |

**Latent ingest-breaking bug.** `microDollarsPerMillion` (`index.ts:139-146`) throws when a price has more than 12 significant fraction digits. Live OpenRouter currently has **14 such values**, 13 of them `input_cache_write: "0.0000000208333333333333"` (22 digits) on Google Gemini Flash routes, plus `deepseek/deepseek-v4-pro`'s `input_cache_read: "0.0000000330745"` (13 digits). The moment a current-code catalog-ingest worker is deployed, the OpenRouter source will throw `OpenRouter pricing exceeds micro-dollar precision` and fail its whole cycle. This is very likely *why* the worker has not been updated — but it means the `cacheWrite`/`expirationDate`/`hugging_face_id` work is blocked behind a rounding decision.

---

## 2. Field census — `/api/benchmarks`

| Path | Type | Fill | Class | Note |
| --- | --- | --- | --- | --- |
| `revision` / `publishedAt` / `freshness.status` / `freshness.checkedAt` | | 1/1 | — | `fresh`, `2026-08-23T08:08:08Z` |
| `attribution[]` | object[] | 24 | — | `lmarena`=16, `benchlm`=6, `litellm`=1, `openrouter`=1 |
| `data.sources[].sourceId` | enum | 4/4 | — | `benchlm`, `lmarena`, `litellm`, `openrouter`. **No `livebench`, no `opencode-zen`.** |
| `data.sources[].available` | boolean | 4/4 | — | all `true` |
| `data.sources[].artifacts[].artifactId` | string | 24/24 | — | benchlm 6, lmarena 16, litellm 1, openrouter 1 |
| `data.sources[].artifacts[].upstreamRevision` | string | 23/24 | genuinely-sparse | null for litellm `model-prices` |
| `data.sources[].artifacts[].schemaVersion` | string | 7/24 | genuinely-sparse | benchlm×6 (`1.0` / `bench-align-v5.3-…`), lmarena rows use `hub-parquet-v1` (16), litellm+openrouter null |
| `data.routes[]` | object[] | 14/14 | — | all `available: true`; `supportsEstimated: true` on 7 |
| `data.compareDirectory.models[]` | object[] | 4,658 | — | current-status models only |
| `…models[].slug / name / creator / sourceType / evidenceStatus / utilitySelectable` | | 4,658/4,658 | — | `utilitySelectable` is `true` for **all 4,658** — a degenerate flag |
| `…models[].evidenceStatus` | enum | 4,658/4,658 | — | `source_only`=4,438 (95.3%), `estimated`=116, `supported`=104 |
| `…models[].metricCategories[]` | string[] | 4,658 arrays; **874 non-empty (18.8%)** | genuinely-sparse | `overall`=874, `coding`=119, `agentic`=108, `knowledge`=82, `math`=63, `multimodalGrounded`=51, `reasoning`=35, `instructionFollowing`=31, `multilingual`=12 |
| `data.compareDirectory.indexablePairs[]` | object[] | **36** | genuinely-sparse | `featuredRank` 35/36; `sharedMetricCount` 3–5 |
| `data.representativeComparisons[]` | object[] | **1** | genuinely-sparse | |
| `…[0].modelAPriceUsdPerMillion` / `modelBPriceUsdPerMillion` | number | **0/1** | join-fails | both null, though `claude-opus-5` and `gpt-5-6-sol` each have a BenchLM primary price in their own profiles |
| `…[0].sharedMetrics[]` | object[] | 5 | — | `metricKey`, `category`, `unit`, `modelAValue`, `modelBValue`, `gap`, `leaderSlug` all 5/5 |
| `data.decisionPicks[]` | object[] | 6 groups / **16 entries** | — | `benchalign`×3 groups, `evidence-lens`×3 |
| `…entries[].representativePriceUsdPerMillion` | number | 13/16 | genuinely-sparse | |
| `…entries[].{rank,modelKey,slug,name,provider,score,unit,evidenceStatus,updatedAt,routePath,contextWindowTokens}` | | 16/16 | — | |
| `data.homeDecisionSnapshot.benchAlignLeader.status` | enum | 1/1 | — | `ready` |
| `data.homeDecisionSnapshot.valueFrontierLeader.status` | enum | 1/1 | — | `ready` |
| `data.homeDecisionSnapshot.lowestVerifiedRepresentativeRate` | object | 1/1 | — | **`representativePriceUsdPerMillion: 0` — see §Headline. Actively wrong.** |
| `data.homeDecisionSnapshot.pricePerformancePoints[]` | object[] | 54 | — | `score`, `representativePriceUsdPerMillion`, `contextWindowTokens`, `evidenceStatus` all 54/54; **`rank` 0/54** |

---

## 3. Field census — `/api/benchmarks/models` (full population, `status=all`, n=4,674)

| Path | Type | Fill | Class | Note |
| --- | --- | --- | --- | --- |
| `modelKey` | string | 4,674/4,674 | — | `source:{sourceId}:{id}`; 100% unique |
| `canonicalSlug` | string | 4,674/4,674 | — | 100% unique. **Only BenchLM models get a human slug** (`claude-opus-5`); the other 4,275 get `source-{sourceId}-{urlencoded-id}` (e.g. `source-litellm-together_ai%2Fzai-org%2FGLM-4.6`). URL-hostile. |
| `displayName` | string | 4,674/4,674 | — | Not unique: `Claude Opus 4.6/4.7/4.8` each appear twice (BenchLM + LMArena rows are separate models) |
| `creator` | string | 4,674/4,674 | — | **279 distinct, semantically inconsistent across sources — see §4.3** |
| `sourceType` | enum | 4,674/4,674 | — | `Unknown`=3,597 (77%), `Proprietary`=578, `Open Weight`=499. `Unknown` = all 3,174 litellm + all 421 openrouter + 2 benchlm |
| `reasoningType` | enum | **399/4,674 (8.5%)** | source-does-not-publish | `Non-Reasoning`=221, `Reasoning`=176, `Hybrid`=2. **All 399 are BenchLM**; litellm/openrouter/lmarena publish nothing equivalent (0/4,275) |
| `familyId` | null | **0/4,674** | not-deployed | never populated by any adapter; the `oneRepresentativePerFamily` variant collapse in `src/benchmarks/price-performance.ts:311` therefore cannot work |
| `variantId` | null | **0/4,674** | not-deployed | same |
| `firstSeenRevision` / `firstSeenAt` | string | 4,674/4,674 | — | 5 distinct; 4,420 models share `2026-08-11T20:48:20.302Z`, so lineage depth is ~12 days |
| `lastSeenRevision` / `lastSeenAt` | string | 4,674/4,674 | — | 4,658 at `2026-08-23T08:08:08Z`, 16 stranded on 2026-08-13 revisions |
| `latestProfileRevision` | string | 4,674/4,674 | — | |
| `status` | enum | 4,674/4,674 | — | `current`=4,658, `archived`=16 |
| `sourceId` | enum | 4,674/4,674 | — | `litellm`=3,174 (67.9%), `lmarena`=680, `openrouter`=421, `benchlm`=399 |
| `sourceModelId` | string | 4,674/4,674 | — | |
| `updatedAt` | string | 4,674/4,674 | — | |
| `weeklyRank` | number | **100/4,674 (2.1%)** | genuinely-sparse | exactly the weekly top-100; 1…100 |
| `overallScore` | number | 879/4,674 (18.8%) | genuinely-sparse | **min −0.198, med 1,203.57, max 1,618.71 — two incompatible units in one field, see §6.1** |
| `overallRank` | number | 879/4,674 (18.8%) | genuinely-sparse | 1…394 |
| `evidenceStatus` | enum | 4,674/4,674 | — | **`source_only`=4,455 (95.3%)**, `estimated`=115, `supported`=104 |
| `strongestCategory` | object | **39/4,674 (0.83%)** | genuinely-sparse | requires a non-`overall` category with `rankingEligible: true` (`model-directory-db.ts:202-212`). All 39 BenchLM, all `supported`. Within the default weekly top-100 view it is 36/100 |
| `strongestCategory.rawScore` | null | 0/39 | source-does-not-publish | BenchLM emits `rawScore` only on `benchlm:overall:raw` |
| `strongestCategory.{key,label,metricKey,score,rank,fieldSize,percentile,evidenceStatus,benchmarkCount,rankingEligible,unit,sourceId}` | | 39/39 | — | `score` 21.1–100; `percentile` 2.94–100; `fieldSize` 2–140 |
| `representativePrice` | object | 3,298/4,674 (70.6%) | genuinely-sparse | filter is "input or output non-null" (`model-directory-db.ts:216`) |
| `representativePrice.sourceId` | enum | 3,298/3,298 | — | `litellm`=2,643, `openrouter`=421, `benchlm`=234 |
| `representativePrice.verificationStatus` | enum | 3,298/3,298 | — | **`corroborating`=2,643 (80%)**, `primary`=655. Four-fifths of all prices come from a source explicitly declared non-authoritative |
| `representativePrice.inputUsdPerMillion` | number | 3,287/3,298 | — | min 0, med 0.50, **max 135,000 — see §6.2** |
| `representativePrice.outputUsdPerMillion` | number | 3,284/3,298 | — | min 0, med 1.44, max 540,000 |
| `representativePrice.cachedInputUsdPerMillion` | number | 1,094/3,298 (33%) | genuinely-sparse | min 0, med 0.18, max 37.5 |
| `representativePrice.contextWindowTokens` | number | 3,165/3,298 (96%) | — | 77 – 10,485,760 |
| `representativePrice.maxInputTokens` | number | 2,932/3,298 (89%) | genuinely-sparse | |
| `representativePrice.maxOutputTokens` | number | 2,860/3,298 (87%) | genuinely-sparse | |
| `representativePrice.canonicalSlug` | string | **655/3,298 (19.9%)** | adapter-drops-it | populated only for benchlm (234) + openrouter (421). `workers/benchmark-ingest/src/litellm.ts` never sets it, so 2,643 litellm routes carry `null` |
| `representativePrice.inputModalities[]` | string[] | 776/3,298 (23.5%) | genuinely-sparse | `text`=775, `image`=561, `file`=155, `audio`=154, `video`=150 |
| `representativePrice.outputModalities[]` | string[] | **421/3,298 (12.8%)** | genuinely-sparse | exactly the OpenRouter rows; LiteLLM publishes `output_modalities` for far fewer |
| `representativePrice.supportedParameters[]` | string[] | **421/3,298 (12.8%)** | genuinely-sparse | exactly OpenRouter; 26 distinct values, 3–22 per route |
| `representativePrice.{providerId,routeId,sourceModelId,sourceArtifactId,sourceUrl,observedAt}` | | 3,298/3,298 | — | |
| `profileRevision` / `profilePublishedAt` / `profileCheckedAt` | string | 4,674/4,674 | — | 4,655 at `2026-08-23T02:15:18Z` |
| `profileFallback` | enum | 4,674/4,674 | — | `none`=4,671, `prior-profile`=3 |
| **`categories[]`** | — | **absent from the response** | **not-deployed** | `functions/_shared/model-directory-db.ts:421` emits it as of `c4241b7`; the deployed build predates that commit |

### 3.1 The default directory view returns only 100 models

`/api/benchmarks/models` with no filters (or `status=current`) and `limit=100` returns **100 rows and `nextCursor: null`**, while `status=all` returns **4,674 rows across 47 pages**.

```
limit=2   status=current -> 2  + cursor      limit=2   status=all -> 2  + cursor
limit=50  status=current -> 50 + cursor      limit=50  status=all -> 50 + cursor
limit=99  status=current -> 99 + cursor      limit=99  status=all -> 99 + cursor
limit=100 status=current -> 100 + NULL       limit=100 status=all -> 100 + cursor
```

Cause: `directoryQuery` (`functions/_shared/model-directory-db.ts:268-283`) routes the unfiltered default onto `benchmark_popular_model_ranks`, which holds exactly the weekly top-100. Any client that pages the default endpoint to exhaustion sees **100 of 4,658 current models (2.1%)** and has no signal that it stopped early. It also silently changes the sort (weekly rank vs. display name) and the population (all-BenchLM vs. all four sources).

The default page is a very different dataset from the directory:

| | default page (n=100) | full population (n=4,674) |
| --- | --- | --- |
| `sourceId` | benchlm 100 | litellm 3,174 / lmarena 680 / openrouter 421 / benchlm 399 |
| `evidenceStatus` | supported 52, estimated 47, source_only 1 | source_only 4,455, estimated 115, supported 104 |
| `strongestCategory` | 36/100 | 39/4,674 |
| `representativePrice` | 74/100 | 3,298/4,674 |
| `reasoningType` | 100/100 | 399/4,674 |

---

## 4. Field census — `/api/benchmarks/models/<slug>` (n = 4,674, 100% of population)

Envelope and `data.directory.*` mirror §3. New paths below.

| Path | Type | Fill | Class | Note |
| --- | --- | --- | --- | --- |
| `freshness.status` | enum | 4,674/4,674 | — | `fresh`=4,655, `stale`=19 |
| `freshness.message` | string | 19/4,674 | — | 16 "archived model", 3 "prior valid durable profile" |
| `attribution[]` | object[] | 5,041 rows / 4,674 profiles | — | len 0–5, median 1 |
| `data.selectedRevision` | string | 4,674/4,674 | — | 3 distinct |
| `data.fallback` | enum | 4,674/4,674 | — | `none`=4,671, `prior-profile`=3 |
| **`data.aliasFrom`** | null | **0/4,674** | **join-fails** | the alias map (`src/benchmarks/model-aliases.ts`) is empty by design, so no profile is ever reached through an alias |
| `data.profile.identity.{modelKey,slug,displayName,creator,sourceType}` | | 4,674/4,674 | — | |
| `data.profile.identity.reasoningType` | enum | 399/4,674 | source-does-not-publish | BenchLM only |
| `data.profile.identity.releaseDate` | string | **322/4,674 (6.9%)** | source-does-not-publish | BenchLM only (322 of its 399); no other source publishes a release date |
| `data.profile.identity.familyId` / `variantId` | null | 0/4,674 | not-deployed | |
| `data.profile.revision.{revision,generatedAt,publishedAt,checkedAt}` | string | 4,674/4,674 | — | all four identical per profile |
| `data.profile.summary.overallScore` | number | 879/4,674 | genuinely-sparse | **mixed units, see §6.1** |
| `data.profile.summary.overallRank` | number | 879/4,674 | genuinely-sparse | |
| `data.profile.summary.evidenceStatus` | enum | 4,674/4,674 | — | `source_only`=4,455, `estimated`=115, `supported`=104 |
| `data.profile.summary.benchmarkCount` | number | 4,674/4,674 | — | **min 0, median 0, max 24** — 3,795 profiles have zero |
| `data.profile.summary.coverage.benchmarkCount` | number | 4,674/4,674 | — | 0–24, median 0 |
| `data.profile.summary.coverage.categoryCount` | number | 4,674/4,674 | — | 0–9, median 0 |
| `data.profile.summary.coverage.rankedCategoryCount` | number | 4,674/4,674 | — | 0–7, median 0 |
| `data.profile.summary.coverage.sourceCount` | number | 4,674/4,674 | — | **0–5, median 1**; see §4.2 |
| `data.profile.summary.strongestEvidence` | string | 4,674/4,674 | — | **3,795/4,674 (81%) are the literal string "No eligible public overall score is available."** |
| `data.profile.summary.validateBeforeChoosing` | string | 4,674/4,674 | — | 2 distinct boilerplate strings |
| `data.profile.radar[]` | object[] | **28,149 rows** | — | len 6–9. Six keys are emitted for **every** model whether or not there is data |
| `data.profile.radar[].key` / `.label` | enum | 28,149/28,149 | — | `agentic`/`coding`/`knowledge`/`multimodalGrounded`/`overall`/`reasoning` = 4,674 each; `math`=62, `instructionFollowing`=31, `multilingual`=12 |
| `data.profile.radar[].rank` | number | **1,239/28,149 (4.4%)** | genuinely-sparse | |
| `data.profile.radar[].percentile` | number | **362/28,149 (1.3%)** | genuinely-sparse | 0–100 |
| `data.profile.radar[].fieldSize` | number | **499/28,149 (1.8%)** | genuinely-sparse | 2–388 |
| `data.profile.categories[]` | object[] | 1,376 rows over 499 models | — | len 0–9, median 0 |
| `…categories[].key` | enum | 1,376/1,376 | — | `overall`=879, `coding`=118, `agentic`=107, `knowledge`=81, `math`=62, `multimodalGrounded`=51, `reasoning`=35, `instructionFollowing`=31, `multilingual`=12 |
| `…categories[].score` | number | 1,376/1,376 | — | **min −0.198, med 81.77, max 1,618.71 — mixed units** |
| `…categories[].unit` | enum | 1,376/1,376 | — | `score`=750, `arena_score`=626 |
| `…categories[].rawScore` | number | 199/1,376 (14.5%) | source-does-not-publish | only `benchlm:overall:raw`; 0–87 |
| `…categories[].rank` | number | 1,239/1,376 (90%) | — | 1–394 |
| `…categories[].fieldSize` | number | 499/1,376 (36.3%) | genuinely-sparse | 2–388 |
| `…categories[].percentile` | number | **362/1,376 (26.3%)** | genuinely-sparse | 0–100 |
| `…categories[].rankingEligible` | boolean | 1,376/1,376 | — | true=902, false=474 |
| `…categories[].evidenceStatus` | enum | 1,376/1,376 | — | `source_only`=686, `supported`=353, `estimated`=337 |
| `…categories[].{metricKey,label,benchmarkCount,sourceId}` | | 1,376/1,376 | — | `sourceId`: benchlm=696, lmarena=680 |
| `data.profile.priceRoutes[]` | object[] | **3,829 rows over 4,674 profiles; len min 0, median 1, max 1** | **join-fails** | **No model anywhere has more than one price route.** Multi-route price comparison is structurally impossible today |
| `…priceRoutes[].sourceId` | enum | 3,829/3,829 | — | `litellm`=3,174, `openrouter`=421, `benchlm`=234 |
| `…priceRoutes[].verificationStatus` | enum | 3,829/3,829 | — | `corroborating`=3,174, `primary`=655 |
| `…priceRoutes[].inputUsdPerMillion` | number | 3,287/3,829 (85.8%) | genuinely-sparse | 542 nulls, all litellm (embeddings/moderation rows); min 0, med 0.50, max 135,000 |
| `…priceRoutes[].outputUsdPerMillion` | number | 3,284/3,829 (85.8%) | genuinely-sparse | min 0, med 1.44, max 540,000 |
| `…priceRoutes[].cachedInputUsdPerMillion` | number | 1,094/3,829 (28.6%) | genuinely-sparse | 0 – 37.5 |
| `…priceRoutes[].contextWindowTokens` | number | 3,331/3,829 (87%) | genuinely-sparse | 77 – 10,485,760 |
| `…priceRoutes[].maxInputTokens` | number | 3,098/3,829 (80.9%) | genuinely-sparse | **0/234 for benchlm** — hard-coded null at `workers/benchmark-ingest/src/benchlm.ts:999` |
| `…priceRoutes[].maxOutputTokens` | number | 3,010/3,829 (78.6%) | genuinely-sparse | **0/234 for benchlm** — `benchlm.ts:1000` |
| `…priceRoutes[].inputModalities[]` | string[] | 818/3,829 (21.4%) | genuinely-sparse | **0/234 for benchlm** — `benchlm.ts:1001`; `text`=812, `image`=574, `audio`=161, `file`=155, `video`=150 |
| `…priceRoutes[].outputModalities[]` | string[] | 421/3,829 (11.0%) | genuinely-sparse | **0/234 for benchlm** — `benchlm.ts:1002`; openrouter only |
| `…priceRoutes[].supportedParameters[]` | string[] | 421/3,829 (11.0%) | genuinely-sparse | **0/234 for benchlm** — `benchlm.ts:1003`; openrouter only |
| `…priceRoutes[].canonicalSlug` | string | 655/3,829 (17.1%) | adapter-drops-it | litellm never sets it |
| `…priceRoutes[].{providerId,routeId,sourceModelId,sourceArtifactId,sourceUrl,observedAt}` | | 3,829/3,829 | — | |
| `data.profile.specifications.contextWindowTokens` | number | 3,421/4,674 (73.2%) | genuinely-sparse | |
| `data.profile.specifications.maxInputTokens` | number | 3,098/4,674 (66.3%) | genuinely-sparse | |
| `data.profile.specifications.maxOutputTokens` | number | 3,010/4,674 (64.4%) | genuinely-sparse | |
| `data.profile.specifications.inputModalities[]` | string[] | 4,674 arrays, **818 non-empty (17.5%)** | genuinely-sparse | |
| `data.profile.specifications.outputModalities[]` | string[] | 4,674 arrays, **421 non-empty (9.0%)** | genuinely-sparse | |
| `data.profile.specifications.supportedParameters[]` | string[] | 4,674 arrays, **421 non-empty (9.0%)** | genuinely-sparse | |
| `data.profile.specifications.releaseDate` | string | 322/4,674 | source-does-not-publish | |
| `data.profile.specifications.sourceType` | enum | 4,674/4,674 | — | |
| **`data.profile.specifications.selfHostingAvailable`** | null | **0/4,674** | **source-does-not-publish** | no adapter ever writes it; would be trivially derivable once `hugging_face_id` survives ingest |
| `data.profile.ledger[]` | object[] | 1,709 rows over 4,674 profiles | — | len 0–9, median 0 |
| `…ledger[].{metricKey,category,benchmarkName,displayValue,unit,evidenceStatus,observedAt,sourceId,sourceArtifactId,sourceUrl}` | | 1,709/1,709 | — | `sourceId`: lmarena=1,013, benchlm=696 |
| `…ledger[].displayValue` | number | 1,709/1,709 | — | **min −0.198, med 1,117.45, max 1,690.64 — mixed units** |
| `…ledger[].rank` | number | 1,572/1,709 (92%) | — | 1–394 |
| `…ledger[].rawValue` | number | 199/1,709 (11.6%) | source-does-not-publish | benchlm overall only |
| **`…ledger[].bestVerifiedComparison`** | null | **0/1,709** | **join-fails** | needs a cross-source peer; there are none (§4.2) |
| **`…ledger[].gap`** | null | **0/1,709** | **join-fails** | derived from `bestVerifiedComparison` |
| **`…ledger[].weight`** | null | **0/1,709** | **source-does-not-publish** | BenchLM's per-benchmark weights are not in the allowlisted projection; LMArena has no weights |
| `data.profile.comparisons[]` | object[] | 834 rows over 4,674 profiles | — | len 0–183; **only 28 models have any comparison at all** |
| `…comparisons[].eligibilityReason` | enum | 834/834 | — | **`quality-gates-not-met`=763 (91.5%)**, `supported-safe-shared-benchlm-categories`=71 |
| `…comparisons[].indexable` | boolean | 834/834 | — | false=763, true=71 |
| `…comparisons[].sharedMetricCount` | number | 834/834 | — | **min 0, median 0, max 5** |
| `…comparisons[].featuredRank` | number | 831/834 | — | 2–400 |
| `data.profile.sources[]` | object[] | 5,041 rows | — | `litellm`=3,174, `lmarena`=1,013, `benchlm`=433, `openrouter`=421 |

### 4.1 Source-exclusivity: the join is not partially dead, it is entirely dead

Computed over all 4,674 profiles:

| Source | Models with any evidence | Models with a price route | Models with a metric |
| --- | --- | --- | --- |
| `litellm` | 3,174 | 3,174 | 0 |
| `lmarena` | 680 | 0 | 680 |
| `openrouter` | 421 | 421 | 0 |
| `benchlm` | 282 | 234 | 199 |
| `livebench` | **0** | 0 | 0 |
| `opencode-zen` | **0** (catalog only) | 0 | 0 |
| manual manifests | **0** (catalog only) | 0 | 0 |

Pairwise overlap:

```
benchlm ∩ litellm    = 0        litellm ∩ lmarena    = 0
benchlm ∩ lmarena    = 0        litellm ∩ openrouter = 0
benchlm ∩ openrouter = 0        lmarena ∩ openrouter = 0
```

**Every source is 100% exclusive.** Source-count distribution across the population: **1 source = 4,557 models; 0 sources = 117 models; ≥2 sources = 0 models.**

Consequences, all confirmed empirically:
- **No model has both a benchmark score and a price from a different source.** BenchLM is the only source that carries both, and only for 199 of its 399 models.
- Every LMArena model (680) has a score and **no price at all**. That is why all five media leaderboards have `price_usd_per_million` and `context_window_tokens` filled for **0** of their 227 CSV rows.
- Every LiteLLM (3,174) and OpenRouter (421) model has a price and **no score**.
- `aliasFrom`, `bestVerifiedComparison`, `gap`, and both `representativeComparisons[0]` price fields are null *because of this*, not because the data is missing upstream.
- 117 BenchLM models have a directory row, a radar skeleton, and **no evidence of any kind**.

`model_configurations` being unwritten is a *second*, deeper layer of the same problem; the first layer is that the four adapters never produce a shared `modelKey` at all (`resolveCanonicalModelKey` returns null for every input, so every model gets `sourceSpecificModelKey`).

### 4.2 Ingested metrics with no route to reach them

The LMArena adapter ingests 16 subsets, but only 8 metric families have a leaderboard route. Models carrying an unreachable metric:

| Metric key | Models | Reachable? |
| --- | --- | --- |
| `lmarena:webdev:overall` | **118** | **no route** |
| `lmarena:agent:overall:ips` | **54** | **no route** |
| `lmarena:search_style_control:overall` | **32** | **no route** |
| `benchlm:category:math` | **62** | **no route** |
| `benchlm:category:instructionFollowing` | **31** | **no route** |
| `benchlm:category:multilingual` | **12** | **no route** |
| `lmarena:text_style_control:overall` | 396 | `llm-human-preference` |
| `benchlm:overall:raw` | 199 | `llm-overall`, `llm-value` |
| `lmarena:vision_style_control:overall` | 148 | `multimodal-vision-documents` |
| `benchlm:category:coding` | 118 | `llm-coding` |
| `benchlm:category:agentic` | 107 | `llm-agentic` |
| `benchlm:category:knowledge` | 81 | `llm-knowledge` |
| `lmarena:text_to_image:overall` | 75 | `media-text-to-image` |
| `lmarena:image_edit:overall` | 53 | `media-image-editing` |
| `benchlm:category:multimodalGrounded` | 51 | `multimodal-vision-documents` |
| `lmarena:image_to_video:overall` | 45 | `media-image-to-video` |
| `lmarena:text_to_video:overall` | 45 | `media-text-to-video` |
| `lmarena:document_style_control:overall` | 38 | `multimodal-vision-documents` |
| `benchlm:category:reasoning` | 35 | `llm-reasoning` |
| `lmarena:search_style_control` (dup) | — | — |
| `lmarena:video_edit:overall` | 9 | `media-video-editing` |

Six paid-for metric families covering **309 model-metric rows** are ingested, stored, exposed on individual profiles, and have no leaderboard. `webdev` (118 models) is larger than every existing route except human-preference, vision, and overall.

### 4.3 `creator` means four different things

| Source | Distinct creators | Top values | What it actually is |
| --- | --- | --- | --- |
| `benchlm` | 90 | `OpenAI` 46, `Alibaba` 28, `Google` 25, `Anthropic` 23 | true creator, Title Case |
| `openrouter` | 55 | `openai` 96, `alibaba` 51, `google` 43, `anthropic` 32 | route owner slug, lower-case, aliased |
| `lmarena` | 48 | `openai` 81, `google` 71, `alibaba` 71, **`Unknown` 63**, `anthropic` 54 | creator slug, lower-case, 63 unknown |
| `litellm` | 126 | **`fireworks_ai` 313, `bedrock` 268, `azure` 221, `bedrock_converse` 152, `azure_ai` 112** | **hosting provider, not creator** |

Grouping the directory by `creator` produces `openai` (403 litellm routes) *and* `OpenAI` (46 benchlm models) *and* `openai` (96 openrouter) as three different buckets, alongside `bedrock` and `azure` as if they were model makers. Any "browse by provider" feature must normalise first.

### 4.4 One fifth of the directory is not an LLM

The LiteLLM adapter reads `mode` (`workers/benchmark-ingest/src/litellm.ts:128`) but uses it **only** inside `routeId`, never to filter and never as a field. Joining our 3,174 LiteLLM models back to the live upstream file by `mode`:

| `mode` | Count |
| --- | --- |
| `chat` | 2,390 |
| `image_generation` | 269 |
| `embedding` | 132 |
| `responses` | 89 |
| `audio_transcription` | 66 |
| `completion` | 36 |
| `image_edit` | 31 |
| `audio_speech` | 31 |
| `realtime` | 30 |
| `video_generation` | 25 |
| `rerank` | 25 |
| `search` | 20 |
| `ocr` | 14 |
| null | 8 |
| `moderation` | 6 |
| `guardrail`, `vector_store` | 1 each |

**659 / 3,174 (20.8%)** are not chat/completion models — 14.1% of the whole 4,674-model directory. `mode` is recoverable from `routeId` (`litellm:{provider}:{urlencoded-id}:{mode}`) but is not a first-class field, so no client can filter on it without string surgery. Classification: **adapter-drops-it** (`workers/benchmark-ingest/src/litellm.ts:128` — parsed, never surfaced).

---

## 5. Field census — `/api/benchmarks/leaderboards/<key>`

All 14 routes return HTTP 200. Totals (`profile=balanced`, `limit=200`):

| Key | Kind | Entries | With `includeEstimated=1` | Δ |
| --- | --- | --- | --- | --- |
| `llm-overall` | benchlm | 85 | 85 | 0 |
| `llm-coding` | benchlm | 30 | 30 | 0 |
| `llm-agentic` | benchlm | 32 | 32 | 0 |
| `llm-reasoning` | benchlm | **19** | 34 | +15 |
| `llm-knowledge` | benchlm | 41 | 57 | +16 |
| `llm-human-preference` | lmarena | **394** (2 pages) | n/a | — |
| `llm-value` | value | 54 | 54 | 0 |
| `llm-pricing-context` | pricing-context | **417** (3 pages) | n/a | — |
| `multimodal-vision-documents` | multimodal | 168 | 175 | +7 |
| `media-text-to-image` | lmarena | 75 | n/a | — |
| `media-image-editing` | lmarena | 53 | n/a | — |
| `media-text-to-video` | lmarena | 45 | n/a | — |
| `media-image-to-video` | lmarena | 45 | n/a | — |
| `media-video-editing` | lmarena | **9** | n/a | — |

Entry-level census across all 14 routes, all pages (n = 1,467 entries):

| Path | Type | Fill | Class | Note |
| --- | --- | --- | --- | --- |
| `entry.model.{modelKey,slug,name,creator,sourceType,evidenceStatus,rankingEligible,benchmarkCount,sourceId,sourceModelId,sourceArtifactId}` | | 1,467/1,467 | — | `sourceId`: lmarena=774, openrouter=417, benchlm=276 |
| `entry.model.evidenceStatus` | enum | 1,467/1,467 | — | `source_only`=1,191, `supported`=276 — **no `estimated` rows appear without the flag** |
| `entry.model.rankingEligible` | boolean | 1,467/1,467 | — | true=1,050, false=417 (all 417 pricing-context rows) |
| `entry.model.contextWindowTokens` | number | 686/1,467 (46.8%) | genuinely-sparse | 4,095 – 10,000,000 |
| `entry.model.reasoningType` | enum | 276/1,467 (18.8%) | source-does-not-publish | exactly the BenchLM rows |
| `entry.model.releaseDate` | string | 276/1,467 (18.8%) | source-does-not-publish | exactly the BenchLM rows |
| **`entry.model.confidenceLower` / `confidenceUpper`** | null | **0/1,467** | **adapter-drops-it** | LMArena publishes CIs and they *are* carried on the metric (`metric.lower`/`.upper`, 774/1,050). The model-level pair is never populated by any adapter |
| `entry.metric` | object | 1,050/1,467 (71.6%) | — | null for all 417 pricing-context rows (by design) |
| `entry.metric.value` | number | 1,050/1,050 | — | **min 6.21, med 1,204.45, max 1,511.57 — mixed units** |
| `entry.metric.unit` | enum | 1,050/1,050 | — | `arena_score`=774, `score`=276 |
| `entry.metric.methodology` | enum | 1,050/1,050 | — | `bradley_terry`=774, `benchlm_raw_composite`=276 |
| `entry.metric.rank` | number | 1,020/1,050 (97.1%) | — | 1–394 |
| `entry.metric.rankFieldSize` | number | **137/1,050 (13.0%)** | genuinely-sparse | BenchLM category rows only; 2–140 |
| `entry.metric.rawValue` | number | 139/1,050 (13.2%) | source-does-not-publish | benchlm overall only, 0–87 |
| `entry.metric.lower` / `.upper` | number | 774/1,050 (73.7%) | genuinely-sparse | **LMArena only.** lower 863–1,503, upper 900–1,522 |
| `entry.metric.voteCount` | number | **774/1,050 (73.7%)** | genuinely-sparse | **LMArena only. min 403, median 21,464, max 11,129,100** — the richest quantitative field in the whole API |
| **`entry.metric.observationCount` / `sessionCount`** | null | **0/1,050** | **source-does-not-publish** | the LMArena `latest`/`overall` subsets expose vote totals, not observation or session counts |
| `entry.metric.{modelKey,metricKey,category,sourceId,sourceUpdatedAt,sourceModelId,sourceArtifactId,rankingEligible}` | | 1,050/1,050 | — | |
| `entry.metrics[]` | object[] | 1,082 rows | — | len 0–2; only `multimodal-vision-documents` ever emits 2 |
| `entry.primaryPrice` | object | **619/1,467 (42.2%)** | join-fails | 417 openrouter + 202 benchlm. **0 of 774 LMArena entries have a price** |
| `entry.primaryPrice.inputUsdPerMillion` | number | 619/619 | — | min 0 (22 OpenRouter `:free` routes), med 0.65, max 150 |
| `entry.primaryPrice.outputUsdPerMillion` | number | 619/619 | — | min 0, med 2.50, max 600 |
| `entry.primaryPrice.cachedInputUsdPerMillion` | number | 351/619 (56.7%) | genuinely-sparse | 0.002 – 7.5 |
| `entry.primaryPrice.contextWindowTokens` | number | 619/619 | — | 4,095 – 2,000,000 |
| `entry.primaryPrice.maxInputTokens` | number | 417/619 | genuinely-sparse | OpenRouter only |
| `entry.primaryPrice.maxOutputTokens` | number | 370/619 | genuinely-sparse | OpenRouter only |
| `entry.primaryPrice.{inputModalities,outputModalities,supportedParameters}` | arrays | 417/619 (67.4%) | genuinely-sparse | OpenRouter only |
| `entry.primaryPrice.verificationStatus` | enum | 619/619 | — | `primary`=619 — corroborating routes never surface here |
| `entry.blendedCostPerMillion` | number | 619/1,467 (42.2%) | join-fails | 0 – 262.5 |
| `entry.contextWindowTokens` | number | 693/1,467 (47.2%) | genuinely-sparse | |
| `entry.sourceRank` | number | 1,020/1,467 (69.5%) | — | 1–394 |
| `entry.onValueFrontier` | boolean | 1,467/1,467 | — | **true = 8** across the whole corpus |
| `data.capabilities.*` | | 1/1 per route | — | `dataReady`, `defaultProfile`, `defaultSort`, `supportsProfile`, `supportsEstimated`, `supportsLifecycle`, `priceMode`, `supportsPrice`, `priceValues[]`, `metricKeys[]`, `sorts[]`, `providers[]`, `sourceTypes[]`, `evidenceStatuses[]` — all populated |
| `data.pagination.{limit,total}` | number | 1/1 | — | |
| `data.pagination.nextCursor` | string | 2 of 14 routes | — | human-preference, pricing-context |

### 5.1 CSV export

All 14 CSVs return HTTP 200 with 1:1 row parity with the JSON. Empty-cell counts:

| CSV | Rows | Empty columns |
| --- | --- | --- |
| `llm-overall` | 85 | `price_usd_per_million` 54 empty (36%) |
| `llm-coding` | 30 | `price_usd_per_million` 23 |
| `llm-agentic` | 32 | `price_usd_per_million` 23 |
| `llm-reasoning` | 19 | `rank` 1, `source_rank` 1, `price_usd_per_million` 11 |
| `llm-knowledge` | 41 | `rank` 29, `source_rank` 29, `price_usd_per_million` 26 |
| `llm-human-preference` | 394 | **`price_usd_per_million` 0/394, `context_window_tokens` 0/394** |
| `llm-value` | 54 | none — the only fully dense export |
| `llm-pricing-context` | 417 | `cached_input_usd_per_million` 250 |
| `media-*` (5 files) | 227 total | **`price_usd_per_million` 0, `context_window_tokens` 0 in all five** |
| `multimodal-vision-documents` | 168 | benchlm lens 15/168, vision lens 147/168, document lens 38/168, `price_usd_per_million` 11/168, `context_window_tokens` 15/168 |

`llm-knowledge` is the odd one: **29 of 41 rows have an empty `rank` and `source_rank`**, because knowledge is an evidence lens where `metric.rank` is deliberately null. A CSV consumer sorting on `rank` gets 12 ranked rows and 29 blanks.

---

## 6. Values that look wrong

### 6.1 `overallScore`, `categories[].score`, `ledger[].displayValue` and `metric.value` mix two incompatible units in one numeric field

`summary.overallScore` (879 populated): **626 are `arena_score` (Bradley-Terry Elo, ~850–1,620) and 253 are `score` (BenchLM 0–100 composite).** Min −0.198, median 1,203.57, max 1,618.71.

There is no unit discriminator on `summary` itself — the caller has to reach into `categories[]`, find the row whose `key === 'overall'`, and read `unit` there. Any sort, average, threshold, or chart axis built on `summary.overallScore` will place every LMArena model above every BenchLM model by construction. The same applies to `categories[].score` and `ledger[].displayValue` (which at least carry `unit` on the same object).

**25 models carry a negative "overall" score**, all LMArena, e.g. `Gemini 3.6 Flash (High)` at −0.0304, `MiniMax M2.7` at −0.1186. These are style-control coefficients, not ratings, and they render as the worst models in the corpus.

### 6.2 LiteLLM `wandb/*` prices are off by roughly 10⁶ — upstream, not ours

Top input prices in the whole corpus:

| Model | input USD/M | output USD/M |
| --- | --- | --- |
| `wandb/deepseek-ai/DeepSeek-R1-0528` | **135,000** | 540,000 |
| `wandb/deepseek-ai/DeepSeek-V3-0324` | 114,000 | 275,000 |
| `wandb/Qwen/Qwen3-Coder-480B-A35B-Instruct` | 100,000 | 150,000 |
| `wandb/meta-llama/Llama-3.3-70B-Instruct` | 71,000 | 71,000 |
| `wandb/zai-org/GLM-4.5` | 55,000 | 200,000 |
| `wandb/deepseek-ai/DeepSeek-V3.1` | 55,000 | 165,000 |
| …4 more `wandb/*` rows above $10,000/M | | |

I checked upstream: LiteLLM literally publishes `"input_cost_per_token": 0.135` for `wandb/deepseek-ai/DeepSeek-R1-0528`. Our adapter's ×10⁶ conversion is correct; **the upstream file is wrong** (real W&B Inference pricing is well under $1/M). Classification: faithful propagation of a source defect. But it poisons any price-based ranking or "cheapest model" query that includes LiteLLM — which is 2,643 of the 3,298 directory prices.

### 6.3 `$0` as a verified rate — still live in three places

- 94 BenchLM profile price routes (91 `Open Weight`, 3 `Proprietary`) with `verificationStatus: "primary"`.
- `homeDecisionSnapshot.lowestVerifiedRepresentativeRate` = `lfm2-24b-a2b` at `$0`.
- 22 OpenRouter pricing-context rows at `$0` — these are legitimate `:free` routes and are **correct**.

### 6.4 Smaller oddities

- `HEAD /api/catalog` returns **HTTP 404 JSON**, because `functions/api/catalog.ts` exports only `onRequestGet` and HEAD falls through to the `[[path]]` catch-all. Same for every `/api/*` route.
- `modelOffers[].availability` has one value (`available`) for all 471 rows, so the enum carries no information while `expirationDate` is dropped.
- `compareDirectory.models[].utilitySelectable` is `true` for all 4,658 rows.
- `homeDecisionSnapshot.pricePerformancePoints[].rank` is `null` for all 54.
- `data.profile.summary.strongestEvidence` is the same "No eligible public overall score is available." string for 3,795 of 4,674 profiles.
- Three model slugs collide case-insensitively (`source-lmarena-Hy3`/`hy3`, `source-lmarena-Inkling`/`inkling`, `…%2FBAAI%2F…`/`…%2Fbaai%2F…`). They are distinct models with distinct profiles, but any case-insensitive routing layer or filesystem cache will merge them.
- Catalog prices already drift within a day: at 00:20 ingest `deepseek/deepseek-v4-pro` was $0.4138/M input; at 10:20 upstream says $0.3969/M. The 36-hour evidence window is generous relative to how fast OpenRouter moves.

---

## 7. Per-source coverage summary

| Source | Catalog offers | Catalog plans | Directory models | Price routes | Metric rows | Exclusive? |
| --- | --- | --- | --- | --- | --- | --- |
| `litellm` | 0 | 0 | **3,174** (67.9%) | 3,174 (`corroborating`) | 0 | 100% exclusive |
| `lmarena` | 0 | 0 | **680** (14.5%) | **0** | 1,013 | 100% exclusive |
| `openrouter` | **417** | 0 | **421** (9.0%) | 421 (`primary`) | 0 | 100% exclusive |
| `benchlm` | 0 | 0 | **399** (8.5%) | 234 (`primary`) | 696 | 100% exclusive |
| `opencode-zen` | **50** | 0 | **0** | 0 | 0 | catalog-only |
| manual manifests (8 providers) | 4 | **23** | **0** | 0 | 0 | catalog-only |
| `livebench` | 0 | 0 | **0** | 0 | 0 | absent entirely |

Manual manifest providers in `/api/catalog` provenance: `anthropic`, `google`, `kimi`, `openai` (×2: subscription + api), `xai`, `zai`, `alibaba` (×2), `deepseek`. **No `perplexity-subscription`, no `microsoft-subscription`** — consistent with the 2026-08-21 finding. Plans by provider: alibaba 4, google 4, kimi 4, openai 4, anthropic 3, zai 3, xai 1.

Source observation ages at census time (catalog): openrouter/opencode/alibaba×2 same-day; openai 2 d; kimi 3 d; google 5 d; deepseek 6 d; anthropic 7 d; zai 9 d; **xai 11 d**. Under the 30-day manual window all are fresh; under the old 36-hour blanket rule 8 of 12 would be stale. The rule change is correct — but note the served bytes come from `api_response_cache`, materialised by the **catalog-ingest worker**, which is on older code (`functions/api/catalog.ts:249-268` only falls through to a live D1 read on a cache miss). So the freshness *value* is currently correct by coincidence rather than because the new code computed it.

---

## 8. Classification roll-up

**`not-deployed`** (code exists in the repo, not in production)
`catalog.modelOffers[].cacheWriteMicroDollarsPerMillion` (74 upstream) · `catalog.modelOffers[].expirationDate` (13 upstream, 6 expiring 2026-08-24) · `catalog.plans[].annualCostMicroDollars` + `annualEffectiveMonthlyCostMicroDollars` · `catalog.provenance[].parserVersion`/`reviewStatus`/`contentHash` on `openrouter-models` · `models[].categories` (absent entirely) · v1 media-type negotiation on `/api/benchmarks/models` and `/models/<slug>` (returns the legacy envelope) · `familyId`/`variantId` everywhere · the 94 residual `$0` BenchLM profile routes.

**`adapter-drops-it`**
`hugging_face_id` — in the R2 allowlist (`workers/catalog-ingest/src/index.ts:67`), no contract field, never read by `parseModels` (`index.ts:176-206`) · LiteLLM `mode` — parsed at `workers/benchmark-ingest/src/litellm.ts:128`, used only to build `routeId`, never exposed (659 non-LLM rows unfilterable) · `priceRoutes[].canonicalSlug` for LiteLLM (2,643 nulls) · `entry.model.confidenceLower`/`confidenceUpper` (LMArena CIs exist and reach `metric.lower`/`.upper`, never the model) · OpenRouter `description`/`benchmarks`/`reasoning`/`default_parameters`/`links` — dropped by the allowlist at `index.ts:37` before any contract sees them.

**`join-fails`**
`data.aliasFrom` (0/4,674) · `ledger[].bestVerifiedComparison` and `.gap` (0/1,709) · `representativeComparisons[0].modelAPriceUsdPerMillion`/`modelBPriceUsdPerMillion` (0/1) · `entry.primaryPrice` and `entry.blendedCostPerMillion` on all 774 LMArena leaderboard rows · `priceRoutes[]` never exceeding length 1 · every price field in the five media CSVs (0/227).

**`source-does-not-publish`**
`reasoningType`, `releaseDate`, `rawScore` (BenchLM-only fields, absent for the other 4,275 models) · `metric.observationCount`/`sessionCount` (LMArena publishes vote totals, not observations) · `ledger[].weight` · `specifications.selfHostingAvailable` · `longContextInputMicroDollarsPerMillion` · `per_request_limits` (0/422 upstream) · BenchLM `maxInputTokens`/`maxOutputTokens`/`inputModalities`/`outputModalities`/`supportedParameters`, hard-nulled at `workers/benchmark-ingest/src/benchlm.ts:999-1003` because `pricing.json` does not carry them.

**`genuinely-sparse`** — everything else in the tables above.

---

## 9. What is rich enough to build on

Ranked by usable density over a real population.

1. **LMArena human preference.** 394 ranked models with `value`, `rank`, `lower`, `upper` and `voteCount` at 73.7% fill and vote counts from 403 to 11.1 M. This is the only field family with genuine statistical weight. Six subsets are live; three more (`webdev` 118 models, `agent` 54, `search` 32) are already ingested with no page.
2. **OpenRouter route metadata.** 417 routes with 100% input/output price, 100% context window, 89% max-output, and — uniquely — `inputModalities`, `outputModalities` and `supportedParameters` at 100% of OpenRouter rows. This is the only place a "which models support tool calling / vision / structured output" filter can be built today.
3. **BenchLM category scores.** 199 models with an overall composite, plus per-category rows at 118 (coding) / 107 (agentic) / 81 (knowledge) / 63 (math) / 51 (multimodal) / 35 (reasoning) / 31 (instruction-following) / 12 (multilingual). `percentile` and `fieldSize` are present for 499 category rows. Math, instruction-following and multilingual have no route.
4. **Subscription plan entitlements.** 23 plans across 7 providers with a structured `entitlementEvidence` model — `boundType`, 38 typed `dimensions` rows with metric/unit/window/max, explicit `projection.formula` + `assumptions` + `caveats`, and a source URL on every one. The honesty model here is the best-built thing in the API. Caveat: only 6 of 23 are `verified`.
5. **Price-performance.** 54 clean points, 100% dense on `overall`, price and context. Secondary lanes thin fast (agentic/coding/math 23, knowledge 26, reasoning/multimodal 11, instruction-following 8, multilingual 3).

**Do not build on** `summary.overallScore` without reading `unit` (two scales, 25 negatives); `creator` without normalisation (four meanings); LiteLLM prices without an outlier guard (ten `wandb/*` rows at $10k–$135k/M); `strongestCategory` (39/4,674); `radar[].percentile` (362/28,149); `familyId`/`variantId` (0); the default `/api/benchmarks/models` page (100 of 4,658).

## 10. Gaps that are ours, not the source's

In descending order of what they unlock:

1. **The cross-source join produces zero matches — not "partial", zero.** 4,557 models have exactly one source, 117 have none, and no model has two. Fix this and `bestVerifiedComparison`, `gap`, multi-route price comparison, priced human-preference rankings, and priced media leaderboards all light up at once. Today no LMArena model has a price and no LiteLLM/OpenRouter model has a score.
2. **`/api/benchmarks/models` default page silently truncates to 100 of 4,658 models.** The unfiltered path joins `benchmark_popular_model_ranks` (`functions/_shared/model-directory-db.ts:268-283`) and returns `nextCursor: null` at `limit=100`. Any consumer that pages to exhaustion sees 2.1% of the catalogue with no error.
3. **`hugging_face_id` will still not appear after the next ingest.** It stops at the R2 projection; there is no `ModelOffer` field and `parseModels` never reads it. Upstream fill is 169/422. This is the single field most likely to break the join in item 1, and it is one contract field plus one line away.
4. **The `$0` fix is half-landed and has a `sourceType` hole.** 94 profile routes still publish `$0` as `primary`; the site's "lowest verified representative rate" headline is `$0` for `lfm2-24b-a2b` because BenchLM labels three open-weight LiquidAI models `Proprietary`. Key the guard on the price being a sentinel, not on BenchLM's `sourceType`.
5. **Six ingested metric families have no route** — `webdev` (118 models), `agent` (54), `search_style_control` (32), `math` (62), `instructionFollowing` (31), `multilingual` (12). Paid for, stored, invisible.
6. **`cacheWrite` (74) and `expirationDate` (13) are written by current code but blocked behind a rounding bug.** Deploying the current catalog-ingest worker today would throw on 14 live OpenRouter prices whose fractions exceed 12 significant digits. Six routes expire 2026-08-24 and the API will keep reporting them `available`.
7. **659 non-LLM LiteLLM rows (20.8% of that source, 14.1% of the directory) are indistinguishable from chat models** because `mode` is parsed and then buried inside `routeId`.
8. **`summary.overallScore` mixes Elo and a 0–100 composite** with no unit on the same object, and carries 25 negative values.
9. **Production API code predates 2026-08-21 17:49.** `profileFallback` is present, `categories` is not. Redeploying the Pages Functions is a prerequisite for verifying anything else on this list.
