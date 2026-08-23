# TokenBench Next — Frontend Field Consumption Audit

**Date:** 2026-08-23
**Branch:** `codex/frontend-rebuild` (141 commits ahead of deployed `main`)
**App:** `apps/web`
**Live preview audited:** `https://tokenbench-next.1tm-notion.workers.dev`
**Data origin:** `https://tokenbench.monomind.one` (`apps/web/wrangler.jsonc:19-21`)

Every claim below was verified against **live fetched HTML** and **live origin JSON**, not source
alone. Origin payloads were downloaded and field-population was counted across all 100 published
models, all 471 catalog offers, all 23 subscription plans, and all 14 leaderboard lenses.

## Corrections to the working assumptions

Three things going in turned out to be wrong, and they change the shape of a rebuild:

1. **"Runtime fields have no source at all"** — true for TTFT / throughput / uptime, but **not** for
   the fields usually lumped in with them. `maxInputTokens`, `maxOutputTokens`, `inputModalities`,
   `outputModalities` and `supportedParameters` are **200/200, 183/200, 200/200, 200/200, 200/200**
   on the live `llm-pricing-context` lens, and `maxOutputTokens` is **374/471** in the live catalog.
   Those blanks are a join problem, not a source problem.
2. **`/subscribe-vs-api/` is not empty and is not client-side.** It server-renders 114.8 KB of real
   plan and route data — at the exact canonical URL only. Every other entry point gets an
   unconditional meta-refresh shell.
3. **`/make-it-yours/`'s failure is not only the LiveBench parse.** Fixing the parse is necessary
   and not sufficient: `projectModel` requires all seven capability slots to have a finite
   percentile, and one of those slots (`data-analysis`) has no producer in any source. No model can
   pass the filter today even with a healthy feed.

Also, `ROUTE_MATRIX.md` and `data-source-frontend-coverage-matrix-2026-08-21.md` map two routes to
the wrong loaders. `route-evidence-loader.server.ts` serves **`/models/[slug]/` and
`/compare/[pair]/`**, not `/model-profile/`; `/compare/`, `/model-profile/` and `/model-lifecycle/`
all go through `model-surface-data.server.ts`. And `/leaderboards/[...segments]/`,
`/llm-price-performance/` and `/popular-models/` do **not** touch
`published-compatibility.server.ts` at all.

---

# PART 1 — The two lists you asked for

## 1A. Fields we already fetch and never show (free value)

Ordered by value. "Live coverage" is measured against the real origin payload today.

### Tier 1 — populated, high-value, rendered nowhere in the app

| # | Field | Live coverage | Where it arrives | Where it dies |
|---|---|---|---|---|
| 1 | **`/api/benchmarks` — the whole endpoint** | 1.03 MB, 200 OK, fully populated | `https://tokenbench.monomind.one/api/benchmarks` | **Never fetched.** `grep -rn "api/benchmarks" apps/web/src` shows only `/models`, `/models/{slug}`, `/price-performance`, `/leaderboards/{key}`. Contains `compareDirectory.models` (**4,658 models**), `indexablePairs` (36), `decisionPicks` (6 curated leader lists), `homeDecisionSnapshot` (3 ready leader tiles + 54 price/perf points), `representativeComparisons` (per-metric gaps + leader), `routes` (14 lens descriptors), `sources` (4 sources × artifact receipts) |
| 2 | **`profile.summary.coverage`** (`benchmarkCount`, `categoryCount`, `rankedCategoryCount`, `sourceCount`) | **100/100 models** | `/api/benchmarks/models/{slug}` | Rendered **only** on `/model-profile/` ("5 benchmarks · 5 categories · 3 ranked"). `/models/` shows `-` on all 100 cards because the *directory* endpoint omits it — the data exists per model, one request away |
| 3 | **`profile.identity.releaseDate` / `specifications.releaseDate`** | **99/100 models** (e.g. grok-4-5 = `2026-07-08`) | `/api/benchmarks/models/{slug}` | Never rendered anywhere. `/model-profile/` shows *"Benchmark release 2026-08-23"* — that is the profile publish date, not the model release date. `/model-lifecycle/` renders *"No release timeline was supplied"* while 99 release dates sit in the payload |
| 4 | **`leaderboard entry.model.releaseDate`** | **85/85 on `llm-overall`** | `/api/benchmarks/leaderboards/{key}` | `leaderboard-route-live.ts:662-691` (`modelFor`) never maps it. `grep releaseDate lb-llm-overall.html` → 0 |
| 5 | **`profile.comparisons[]`** (`pairSlug`, `path`, `indexable`, `eligibilityReason`, `featuredRank`, `sharedMetricCount`) | **663 rows across 95/100 models; 71 indexable pairs** | `/api/benchmarks/models/{slug}` | Dropped at `src/frontend/published-model-compatibility.ts:226-263` — never carried into `ModelProfileFacts`. `/model-profile/` has an "Add to comparison" CTA and no related-comparison list |
| 6 | **`profile.summary.strongestEvidence` + `.validateBeforeChoosing`** | **100/100 models** | `/api/benchmarks/models/{slug}` | Ready-made editorial copy per model (e.g. *"Public overall score 75.19 at source rank #10."*). Never projected, never rendered |
| 7 | **LMArena `metric.voteCount`** | **200/200 rows; 6,898,663 votes on `llm-human-preference`** | `/api/benchmarks/leaderboards/llm-human-preference` | `leaderboard-route-live.ts` never maps `metric.voteCount`. `grep voteCount lb-llm-human-preference.html` → 0 |
| 8 | **LMArena confidence intervals `metric.lower` / `metric.upper`** | **200/200 rows** | same | Never mapped, never rendered. An arena score with no CI is the single most misleading number on the site |
| 9 | **`metric.methodology`** (`bradley_terry`, `benchlm_raw_composite`) | 100% of leaderboard rows | `/api/benchmarks/leaderboards/{key}` | Never mapped. The page has a "methodology" heading that is static prose |
| 10 | **`primaryPrice.maxOutputTokens` / `maxInputTokens` / `inputModalities` / `outputModalities` / `supportedParameters`** | On `llm-pricing-context`: **maxInput 200/200, maxOutput 183/200, modalities 200/200, supportedParameters 200/200** (417 routes total) | `/api/benchmarks/leaderboards/llm-pricing-context` | These are the exact fields the rest of the app renders as `-`. On `/leaderboards/[key]/` `maxOutputTokens` reaches the CSV only (`leaderboard-detail-page.tsx:207`) and no column; the other four are dropped in `routePricingFor` |
| 11 | **`/api/catalog` `modelOffers` (471)** — `maxOutputTokens` 374/471, `cachedInputMicroDollarsPerMillion` 304/471, `contextWindowTokens` 421/471 | | `/api/catalog` | Fetched by the lifecycle projector, which reads **only** `expirationDate` (a field the payload does not have) and discards everything else. Naive slug-tail join reaches **60/100 benchmark models**, would fill `maxOutputTokens` on **52**, and would give a price to **11 of the 26 currently price-less models** |
| 12 | **`SubscriptionCalculationView.lineItems[].tokens`** — the exact per-line token allocation (standard input / cache read / cache write / output) | every successful calculation | computed at `published-subscription.server.ts:234`, transported at `:250` | Dropped by `modelCostRows` (`subscription-simulator-page.tsx:123-160`), which reads only `kind`, `rateUsdPerMillion`, `costUsd`. **The page then prints a disclaimer that is factually false**: `:483` says *"Effective allocation is available only from a reviewed calculation response"* — the reviewed response carries it and the component discards it |
| 13 | **`/api/catalog` `plans[].entitlementEvidence`** — 38 quota dimensions across 23 plans (`metric`, `min`, `max`, `unit`, `window`, `resetRule`, `source.url`, `source.confidence`), plus `entitlement.kind`, `boundType`, `billingCycle`, `supportedModelIds` | 23/23 plans | `/api/catalog` | Rendered on the *canonical* `/subscribe-vs-api/` URL — but only **15 of 23 plans** survive the hardcoded 7-provider allowlist and only **4** (all OpenAI) can produce a calculation. `home-projector.ts:151` reads only `plan.displayName` |
| 14 | **`catalog.provenance[]`** — 12 rows with `sourceUrl`, `observedAt`, `confidence`, `reviewStatus`, `parserVersion`, `evidenceLocator` | 12/12 | `/api/catalog`, already fetched on 3 routes | `/data-sources/` renders **zero** of it — the entire page is a static TypeScript literal. Real per-source drift is visible in the payload (xai-subscription last observed **2026-08-12**, 11 days stale) and the page instead asserts *"Checked daily at 00:20 UTC"* as prose |
| 15 | **`ModelBenchmarkLedgerFact[]`** — 453 rows, each with `displayValue`, `rank`, `unit`, `evidenceStatus`, `observedAt`, `sourceUrl`, `sourceArtifactId` | 99/100 models | `/api/benchmarks/models/{slug}` → `ModelProfileFacts.benchmark.ledger` | **Rendered by nothing in the repository.** `bestVerifiedComparison`, `gap`, `weight` have zero non-test references in `apps/web/src`. It reaches the client on `/compare/` in the RSC flight payload (`bestVerifiedComparison` ×17) and renders zero DOM nodes |
| 16 | **`ModelBenchmarkCategoryFact[].score`** — 453 rows, **453/453 populated** | vs `radar[].percentile` which is only **262/666** | `/api/benchmarks/models/{slug}` | Every capability table in the app (`/compare/`, `/compare/[pair]/`, `/model-profile/`, `/models/[slug]/`) renders `percentile`, not `score`. This alone is why grok-4-5 shows `-` for Overall / Reasoning / Multimodal-grounded when its scores are 75.19 / 50.5 / (absent) |
| 17 | **`entry.aggregate.pareto`** (published value-frontier mark) | 8 frontier rows on `llm-value` | `/api/benchmarks/leaderboards/llm-value` | Produced at `leaderboard-route-live.ts:723`, then **ignored**; the frontier is re-derived client-side at `src/frontend/leaderboard-detail.ts:341-354` |
| 18 | **`entry.blendedCostPerMillion`** (server workload-blended price) | all priced rows | leaderboard lens | Produced at `leaderboard-route-live.ts:649-653`, then discarded; `leaderboard-detail.ts:333` recomputes it locally. The workload-profile radio changes only the local recompute — the server's other two profiles are never fetched |
| 19 | **`envelope.data.capabilities`** on the leaderboard lens — `providers[]`, `priceValues[]` (39 buckets on `llm-value`), `sorts[]`, `sourceTypes[]`, `evidenceStatuses[]`, `priceMode`, `supportsPrice`, `supportsEstimated`, `dataReady` | every lens | leaderboard lens | Fully **validated** (`leaderboard-route-live.ts:470-473, 509`) then **dropped** by `projectLeaderboardRouteLiveEnvelope`. The provider dropdown is instead rebuilt from row identities |
| 20 | **`data.total`** on the leaderboard lens | `llm-pricing-context` = **417** | leaderboard lens | Unread. The "Published rows" tile shows `sourceRows.length` instead |
| 21 | **`envelope.provenance[]`** on both ranking routes | always | `leaderboard-route-live.ts:741` | Built with label, url, effectiveAt, revision — **read by nothing**. The "Evidence receipt" card shows no source and hardcodes a `/data-sources/` link |
| 22 | **`data.scoreMethodology` (9 lanes) + `data.costDefinitions`** | 100% | `/api/benchmarks/price-performance` | Zero reads in `llm-price-performance-page.tsx`. The header hardcodes the chip `"Output USD / 1M default"` (`:936`) instead of the published definition |
| 23 | **`point.route.contextWindowTokens`** (54/54) and **`cachedInputUsdPerMillion`** (22/54) on price-performance | | `/api/benchmarks/price-performance` | Never rendered on `/llm-price-performance/` |
| 24 | **`point.scores[lane]` for the 8 non-selected lanes** | per point | price-performance | Loaded per point, discarded per render — a lane switch could be instant with no refetch (it already is; but the other lanes never appear in the table or tooltip) |
| 25 | **`RouteReceipt`** (`sourceId`, `providerId`, `sourceModelId`, `sourceArtifactId`, `sourceUrl`, `observedAt`, `verificationStatus`) | 74/74 routes | profile + leaderboard | Rendered only on `/model-profile/`'s receipt disclosure. Dropped entirely on `/models/`, `/`, `/compare/`, `/compare/[pair]/`, `/models/[slug]/`, and all leaderboards |
| 26 | **`CachePricing` / `cachedInputUsdPerMillion`** | 29/74 profile routes; 95/200 pricing-context rows; 304/471 catalog offers | everywhere | Rendered **only** as "Cache read" on `/model-profile/`. Dropped on `/models/` (`cacheReadUsdPerMillion`, `cacheWriteUsdPerMillion` → 0 component hits), `/`, `/compare/`, and every leaderboard |
| 27 | **`ModelSourceCoverage.benchmarkCount` / `.categoryCount` / `.rankedCategoryCount`** | 100/100 | profile | Only `sourceCount` is ever rendered (`/compare/` `:492`, `/models/` `:719`) |
| 28 | **`ModelDataFreshness.checkedAt` / `.message`** | 100/100 | profile envelope | Only `.status` is read |
| 29 | **`profile.sources[]`** (173 rows: artifactId, sourceUrl, observedAt, attributionText) | 100/100 | profile | `ModelProfileFacts.sources` is dropped at `src/frontend/model-surface-projectors.ts:218-224`. `/model-profile/` shows **1** provenance entry while `sourceCoverage.sourceCount` says **2** |
| 30 | **`PreviewModel.routeOptions`** | built for every directory row (`published-model-compatibility.ts:299-301`) and every profile row (`:362-364`) | everywhere | Only consumer in the repo is `leaderboard-route-live.ts:688`, which builds it and then never reads it. Zero renders |
| 31 | **The third comparison profile on `/`** | 1 extra HTTP round-trip per home render | `home-data.server.ts:53` fetches `rankedModelIds.slice(0,3)`; `home-page.tsx:340` renders `.slice(0,2)` | A full `/api/benchmarks/models/{slug}` request thrown away on every home page render |
| 32 | **The whole `llm-knowledge` category leaderboard on `/popular-models/`** | requested + paginated up to 32 pages + validated | `popular-models-live.ts:37`, `popular-models-live.server.ts:35` | Every metric is dropped because `popularModelsCategorySlotKey` has no `knowledge` alias (`popular-models-v1.ts:43-57`). Same for `multimodalGrounded` (44 models with data) |
| 33 | **Eight per-model `…UnavailableReason` strings on `/popular-models/`** (`identity`, `access`, `rank`, `capability`, `benchmark`, `contextWindow`, `maxOutput`, `total`) | computed per model per request | `popular-models-live.ts:565-580` | Zero JSX reads. The cell prints a bare `-` with no tooltip while the reason sits unread on the same object |
| 34 | **`SubscriptionData.models`** (full catalog model list with route ids, input/output USD, context, max-output, cache read/write) | built at `published-subscription.server.ts:370-403`, attached `:448` | | Never read by `home-projector.ts` or `home-page.tsx` |
| 35 | **`SubscriptionCalculation.lineItems`** (`id`, `tokens`, `rateUsdPerMillion`, `costUsd`) | mapped at `published-subscription.server.ts:434-439` | | Zero hits in `home-page.tsx` / `home-projector.ts` |
| 36 | **`SubscriptionPlan.provider` / `.monthlyUsd` / `.includedUsage`** | built for every plan `:417-420` | | `home-projector.ts:151` reads only `displayName` |
| 37 | **`ModelSpecifications`** — 18 members | `contextWindowTokens` 98/100, `releaseDate` 99/100, rest 0/100 | profile | Rendered on `/model-profile/` only; 10 of 18 have no row at all. `reasoningType`, `familyId`, `variantId`, `selfHostingAvailable` have **zero references in any component** |
| 38 | **`ModelDirectoryEntry` metadata** — `reasoningType` (100/100: 77 Reasoning / 21 Non-Reasoning / 2 Hybrid), `status`, `firstSeenAt`, `lastSeenAt`, `updatedAt`, `evidenceStatus` (52 supported / 47 estimated / 1 source-only), `profileFallback`, `strongestCategory` (36/100 with rank + percentile + fieldSize) | directory | `/api/benchmarks/models` | None mapped by `mapDirectoryEntry` (`popular-models-live.ts:556-589`) or `directoryModel` |

### Tier 2 — in the contract, live-null today (record, don't build for)

`RuntimeSla.ttftP50Seconds`, `RuntimeSla.outputTokensPerSecond`, `RuntimeSla.conditions`;
`ModelSpecifications.maxInputTokens / maxOutputTokens / inputModalities / outputModalities /
supportedParameters / selfHostingAvailable / createdAt / expirationDate / knowledgeCutoff /
tokenizer / instructionFormat / isModerated / perRequestLimits / familyId / variantId`;
`ModelBenchmarkLedgerFact.bestVerifiedComparison / gap / weight`;
`ModelLifecycle.sunsetOn`; `LifecycleReplacement.*`;
`RankingAggregateEconomics.costPerSuccessfulEvaluationUsd / meanOutputTokens`;
`RankingTaskEconomics.*` (all 11 members);
`RankingReleaseReceipt`, `RankingTaxonomyCategory`.

---

## 1B. UI that exists but has nothing to show

Ordered by how much surface area is wasted.

### Whole pages / sections that are dead

| Surface | Component | Field it needs | Status |
|---|---|---|---|
| **`/make-it-yours/` — the entire page** | `make-it-yours-workbench.tsx` | any `RankingData` | Renders *"The production leaderboard service is not configured for this environment."* `loadCurrentLiveBenchRanking()` throws uncaught at `make-it-yours-ranking.server.ts:128-138`. **7 capability weight sliders, access toggle, provider filter ("0 providers available"), reset button, Copy link / Download image / Export CSV (exports an empty file), and the 2-of-4 comparison counter all still render and do nothing.** The empty-state paragraph blames the user's filters for a server failure |
| **`/make-it-yours/` — the SLA panel** | `MakeItYoursSlaTable`, `MakeItYoursSlaChart` ×2, max-TTFT slider (0.2–1.2 s), min-throughput slider (20–140 tok/s), "keep unobserved runtime" checkbox | `RuntimeSla` | Even with a working ranking these would render `disabled` (`runtimeObservedCount === 0`). Nothing in `apps/web/src` populates `ttftP50Seconds` on this route |
| **`/subscribe-vs-api/` — every entry point except the exact canonical URL** | `app/subscribe-vs-api/page.tsx:33` | — | Bare `/subscribe-vs-api/` returns **HTTP 200, 30 KB, zero content lines** — a `<meta http-equiv="refresh">` shell. `if (params.toString() !== canonical) redirect(...)` fires on an empty query string **and on any key reordering**. The canonical URL renders 114.8 KB of real data; no crawler, bookmark or hand-typed link ever hits it first |
| **`/subscribe-vs-api/` — 11 of 15 reachable plans** | `subscription-simulator-page.tsx:369-374` | `supportedModelIds` | All anthropic / google / xai / zai plans have `supportedModelIds: []` → the model picker is permanently empty → **the calculation can never run**. Verified live: `?provider=anthropic&plan=anthropic:pro` → *"Choose a reviewed plan and at least one exactly bound API model."* Only the 4 OpenAI plans work |
| **`/subscribe-vs-api/` — 2 of 7 providers** | `SUBSCRIPTION_PROVIDERS`, `subscription-simulator.ts:13-14` | — | `perplexity` and `microsoft` have **zero plans and zero provenance** in the live catalog. Selecting either yields a disabled plan picker forever |
| **`/subscribe-vs-api/` — "Cache write share %" input** | `:407` | `cacheWriteMicroDollarsPerMillion` | **Null on 100 % of offered models.** Any value > 0 throws at `published-subscription.server.ts:243` and kills the **entire** calculation, not just that line. Verified live. Defensively pinned to `0` by default — i.e. a live control whose only safe value is its default |
| **`/subscribe-vs-api/` — "Annual checkout" + "Annual effective / month" tiles** | `:184`, `:185` | `annualCostMicroDollars` | **0 of 23 catalog plans** publish either field. Always `-` |
| **`/model-lifecycle/` — the whole page** | `model-lifecycle-page.tsx` | `ModelLifecycle.sunsetOn` | **0 alerts.** No lifecycle/retirement/sunset/deprecation evidence exists in *any* live endpoint (grep of the full catalog: 0 hits for `sunset`, `deprecat`, `retire`, `eol`, `shutdown`). Still rendered: horizon toggle (All / 90 days / 60 days), Cards/List toggle, Copy link, Download image, Export CSV, "Open alerts" counter, "Next sunset" tile |
| **`/model-lifecycle/` — "02 / Release timeline"** | `:286-303` | — | Hardcoded permanent empty state; `LifecycleData` has no timeline field. **But 99/100 release dates are live at `/api/benchmarks/models/{slug}`** |
| **`/model-lifecycle/` — successor block** | `:200-212`, `:222-233`, `:247` | `LifecycleReplacement` | Hardcoded `unavailable` at `published-model-compatibility.ts:647`. "Inspect successor →" is unreachable; always renders "Comparison unavailable" |
| **`/model-profile/` — "02 / Runtime & SLA"** | `model-profile-page.tsx:430`, `RouteEvidenceRuntimeCharts` | `RuntimeSla` | Never mounts (`route-evidence-charts.tsx:199`). Section renders a paragraph explaining its own absence |
| **`/model-profile/` — "Model data receipt" rows 1-8** | `:141-223` | `ModelSpecifications.createdAt / expirationDate / knowledgeCutoff / tokenizer / instructionFormat / isModerated / supportedParameters / perRequestLimits` | **0/100 models** have any of these. 8 permanently dead rows |
| **`/popular-models/` — evidence drawer task table (11 columns)** | `:568-658` | `RankingTaskEconomics` | `model.taskEconomics` hardcoded `[]` at `popular-models-live.ts:582`. All `task:` sort keys are silent no-ops |
| **`/popular-models/` — economics table (table 1)** | `:1600-` | `RankingAggregateEconomics` | Live: **Cost / successful evaluation 0/100, Mean output tokens 0/100, Pareto 0/100** |
| **`/leaderboards/` (directory)** | `leaderboards-directory-page.tsx` | — | Fully static. No loader, no counts, no freshness, no row totals — while `/api/benchmarks` publishes `routes[]` with `available` flags and `decisionPicks` with live leaders |
| **`/tools/`** | `app/tools/page.tsx:13-43` | — | Static JSX, one card |

### Individual dead controls, columns and charts

| Route | Affordance | Component:line | Field | Live coverage |
|---|---|---|---|---|
| `/` | **"TTFT · p50" column** | `home-page.tsx:166-167` | `ttftP50Seconds` | **0/100** |
| `/` | **"Throughput" column** | `home-page.tsx:166-167` | `outputTokensPerSecond` | **0/100** |
| `/` | **"Low-latency" filter button** | `home-page.tsx:153` | `ttftP50Seconds` + median cutoff | cutoff always `null` → **always 0 rows** |
| `/` | **"High-throughput" filter button** | `home-page.tsx:154` | `outputTokensPerSecond` | **always 0 rows** |
| `/` | "Identity record" column | `home-page.tsx:166-167` | `provider` | Prints the literal `"Recorded"` ×100 — the provider string is discarded by `identityRecordStatus()` (`:78-80`) |
| `/` | "Blended cost" comparison row | `home-page.tsx:347` | `blendedUsdPerMillion` | **Structurally always `-`**: `routePricing()` never emits the key (`published-model-compatibility.ts:137-149`) |
| `/` | **ChartJS radar** (`RadialLinearScale`, `Filler`, `Legend`, ~90 lines of memos) | `home-page.tsx:254-297`, mounted `:333` | `radar[].percentile` | Only 2 shared axes clear the `< 3` guard → **the bar fallback always ships instead**. Dead code plus a shipped Chart.js radar controller |
| `/models/` | **Sort option "Benchmark release"** | `:597`, comparator `:326-329` | `benchmarkReleaseOn` | **100/100 null** → `"".localeCompare("")`, a silent no-op |
| `/models/` | **"05 / Evidence observation timeline" section** | `:854-894` | `benchmarkReleaseOn` | always empty |
| `/models/` | **"04 / Lifecycle" alert list** | `:827-850` | `lifecycleStatus` | hardcoded unavailable at `published-model-compatibility.ts:298` → always empty |
| `/models/` | Card "Sources: n" | `:719` | `sourceCoverage.sourceCount` | **100/100 `-`** (data exists on the profile endpoint) |
| `/models/` | Card "Freshness:" | `:719` | `freshness.status` | **100/100 `-`** (the envelope itself carries `freshness.status = "fresh"`) |
| `/models/` | Card synopsis paragraph | `:688-691` | — | Hardcoded literal *"No model synopsis was supplied with this evidence record."* ×100. No synopsis field exists in any source |
| `/models/` | CSV columns `benchmarkRelease`, `throughput` | `:621`, `:626` | | 100/100 null in the export |
| `/popular-models/` | **"Data analysis" column + card tile + matrix row + sort + filter chip** | `:773-788`, `:956-968`, `:1433-1444`, `:2063-2078` | axis slot `data-analysis` | **0/100 — structurally dead.** No producer anywhere; the 7-slot taxonomy is LiveBench-shaped, the data is BenchLM-shaped |
| `/popular-models/` | "Language" / "Instruction following" / "Mathematics" columns | same | axis slots | **3/100, 6/100, 16/100** |
| `/popular-models/` | **"Cost / task" sortable column** | `:789-801` | `model.aggregate` | **0/100** — hardcoded null at `popular-models-live.ts:581` |
| `/popular-models/` | **"Balanced route price / 1M" matrix row** | `:1536-1540` | `blendedUsdPerMillion` | always null — hardcoded `popular-models-live.ts:537` |
| `/popular-models/` | Sort keys `mean-output`, `pareto`, `route-price` | `:106-115` | aggregate / blended | silent no-op sorts |
| `/popular-models/` | **"Exclude finetunes" checkbox** | `:2027-2045` | — | permanently `disabled`, with the honest label *"Unavailable because published data does not include a finetune flag."* |
| `/popular-models/` | Capability radar | `charts:156-216` | 7 non-null axes | never clears its guard; always renders the fallback |
| `/popular-models/` | **"Cost ranking" bar chart** | `charts:1016-1141` | `aggregate` | **renders 100 empty bars** instead of its unavailable message — see the latent bug below |
| `/compare/` | **`RouteEvidenceRuntimeCharts` (TTFT + throughput bars)** | `route-evidence-charts.tsx:196-206` | runtime | returns `null` at `:199`; never mounts |
| `/compare/` | "Fastest observation" decision card | `compare-workbench-page.tsx:235-239` | `outputTokensPerSecond` | always `-` |
| `/compare/` | "Throughput" table column | `:711` | `outputTokensPerSecond` | **0/3 live** |
| `/compare/` | `RouteEvidenceCapabilityBars` (the only surface for axis `rank`/`fieldSize`) | `route-evidence-visuals.tsx:134-202` | `capabilityAxes[].rank/fieldSize` | guarded by `< 3` non-null percentiles → never mounts |
| `/compare/[pair]/` | "Runtime" / "Lifecycle" / "Lifecycle sunset" / "TTFT p50" `<dd>`s | `route-evidence-pair-page.tsx:236`, `:114` | runtime / lifecycle | structurally unreachable |
| `/model-profile/` | "Throughput" metric tile | `:362-371` | `outputTokensPerSecond` | `-` |
| `/model-profile/` | Lifecycle card (status + "Sunset:") | `:500-523` | lifecycle | both always `-` |
| `/model-profile/` | "Long context" column + mobile row + CSV row | `:600`, `:576`, `:620`, `:252-255` | `longContextInputUsdPerMillion` | **never assigned** at `published-model-compatibility.ts:137-149` → structurally always `-` |
| `/model-profile/` | "Task economics" / "Workload" rows | `:810-822` | `taskEconomics` | hardcoded unavailable `:358` |
| `/models/[slug]/` | "Runtime observation" + "Lifecycle" sections, "TTFT p50" tile, CSV runtime rows | `:171-189`, `:259`, `:60-61` | runtime / lifecycle | structurally unreachable |
| `/leaderboards/[key]/` | **Input / Output / Blended / Context / Selected route columns** | `leaderboard-detail-page.tsx:166-170` | `primaryPrice` | **0 priced rows** on all 5 media lenses (75 / 53 / 45 / 45 / 9 rows) and on `llm-human-preference` (394 rows); **11 of 168** on `multimodal-vision-documents`. Confirmed live: every row shows `Blended / 1M - Context - Route -` |
| `/leaderboards/[key]/` | Sort "Source rank" on `llm-reasoning` | | `sourceRank` | **1 of 19 rows** non-null → effectively a no-op |
| `/leaderboards/[key]/` | "Value frontier" chart series | `leaderboard-charts.tsx:113-128` | client-recomputed `row.frontier` | works, but ignores the published `aggregate.pareto` |
| `/llm-price-performance/` | **Score lane buttons: "Multilingual" and "Instruction Following"** | `:253-270` | `point.scores[lane]` | **3/54** and **8/54** → a 3-point scatter |
| `/llm-price-performance/` | **Chart legend "Estimated evidence" and "Source-only evidence"** | `:556-564` | `evidenceStatus` | all 54 points are `supported`; `capabilities.evidenceStatuses` is `["supported"]`. Both legend rows permanently dead |
| `/llm-price-performance/` | `variants: 'one-per-family'` dedup default | `price-performance-state.ts` | `point.familyId` | **0/54 non-null** → the dedup is a no-op and has no UI control |
| `/llm-price-performance/` | `status: 'current'` default filter | `price-performance-state.ts:43` | `point.status` | silently hides `archived` models with **no way to see them** |
| `/data-sources/` | "Groups **0**" / "Fallbacks" counters | `data-sources-page.tsx` | — | render literal `0` |

### Dead code (exists, imported by nothing)

- `model-comparison.tsx`, `model-comparison-compact.tsx`, `model-comparison-hover.tsx`,
  `comparison-table-one.tsx` — only importer is `preview-shell.tsx:16-19`, and `PreviewShell`
  (`:313`) is imported by nothing. All four render **hardcoded literal arrays**
  (e.g. `releaseDate: "2026-04"` at `comparison-table-one.tsx:310`).
- `PopularModelsQualityCostChart` (`charts:497-688`) and `PopularModelsCostRankingChart`
  (`charts:690-846`) — exported, fully implemented, imported by nothing.
- `projectPopularModelsLiveWithStrict` (`popular-models-live.ts:820-832`) — no non-test caller.
- `popularModelsFieldUnavailableLabel` (`popular-models-v1.ts:237-241`) — the project's designated
  unavailable-label helper, imported by no component.
- The entire `evidence`-mode adapter path (`home-data.ts:107-127`, `ui-data.server.ts` evidence
  branch, `leaderboards/[...segments]/page.tsx:40-42`) — unreachable, `TOKENBENCH_UI_DATA_MODE=http`
  in production.

---

# PART 2 — Ground truth: what the origin actually serves

## Endpoints

| Endpoint | Status | Size | Used by |
|---|---|---|---|
| `/api/catalog` | **200** | 249 KB | `/model-lifecycle/`, `/subscribe-vs-api/`, `/` (subscription block) |
| `/api/benchmarks/models?limit=100` | **200** | 141 KB | `/`, `/models/`, `/popular-models/`, `/make-it-yours/` |
| `/api/benchmarks/models/{slug}` | **200** | ~8 KB | `/model-profile/`, `/models/[slug]/`, `/compare/`, `/compare/[pair]/`, `/` (×3) |
| `/api/benchmarks/price-performance` | **200** | 51 KB | `/llm-price-performance/`, `/popular-models/` |
| `/api/benchmarks/leaderboards/{key}` | **200** | 57 KB – 2.5 MB | `/leaderboards/[...segments]/`, `/popular-models/` (category lenses) |
| **`/api/benchmarks`** | **200** | **1.03 MB** | **nothing** |
| `/api/rankings` | 404 | | — |
| `/api/lifecycle` | 404 | | — |
| `/api/subscription` | 404 | | — |
| `/api/comparison` | 404 | | — |

Confirmed: the strict v1 endpoints are not deployed. Everything reaches the app through
`published-compatibility.server.ts` (catalog + directory + profile), `livebench-upstream.server.ts`
(direct LiveBench release), `leaderboard-route-live.server.ts` (lens endpoint), and
`llm-price-performance-data.server.ts` / `popular-models-live.server.ts` (price-performance).

## Field population — `/api/benchmarks/models?limit=100` (n = 100)

```
100/100  modelKey, canonicalSlug, displayName, creator, sourceType, reasoningType,
         firstSeen*, lastSeen*, latestProfileRevision, status, sourceId, sourceModelId,
         updatedAt, weeklyRank, evidenceStatus, profileRevision, profileFallback,
         profilePublishedAt, profileCheckedAt
 99/100  overallScore, overallRank
 74/100  representativePrice        <-- explains the 26x blanks on / and /models/
 36/100  strongestCategory
  0/100  familyId, variantId
```

`representativePrice` sub-fields (n = 74): `inputUsdPerMillion` 74, `outputUsdPerMillion` 74,
`contextWindowTokens` 74, `cachedInputUsdPerMillion` 29, **`maxInputTokens` 0, `maxOutputTokens` 0,
`inputModalities` 0, `outputModalities` 0, `supportedParameters` 0**.

Envelope carries `freshness.status = "fresh"`, `freshness.checkedAt`, and
`week = {weekStart, benchmarkRevision, sourceSnapshotId, methodologyVersion, generatedAt}` —
none of which reach the per-model cards that render `-` for freshness and benchmark release.

## Field population — all 100 model profiles

```
100/100  summary.coverage, summary.strongestEvidence, summary.validateBeforeChoosing, radar[]
 99/100  identity.releaseDate, specifications.releaseDate, categories[], ledger[], overallScore/Rank
 98/100  specifications.contextWindowTokens
 95/100  comparisons[]                       663 rows, 71 indexable
 74/100  priceRoutes[]                       0 models have more than one route
  0/100  familyId, variantId, maxInputTokens, maxOutputTokens, selfHostingAvailable,
         inputModalities, outputModalities, supportedParameters
```

`categories[]` — 453 rows across 9 keys (overall 99, agentic 76, coding 73, knowledge 63,
multimodalGrounded 44, math 37, reasoning 32, instructionFollowing 18, multilingual 11):
`score` **453/453**, `benchmarkCount` 453, `unit` 453, `rank` 361, `fieldSize` 354,
**`percentile` 262**, `rawScore` 99 (only on `overall`).

`radar[]` — 666 axes: `rank` 361, `fieldSize` 354, **`percentile` 262**.

`ledger[]` — 453 rows: `evidenceStatus` / `observedAt` / `sourceUrl` / `sourceArtifactId` / `unit`
all 453/453; `rank` 361; `rawValue` 99; **`bestVerifiedComparison` / `gap` / `weight` 0/453**.

## Field population — `/api/catalog`

- `plans` **23** (ChatGPT Go/Plus/Pro 5x/Pro 20x, Claude Pro/Max 5x/Max 20x, Google AI
  Plus/Pro/Ultra 5x/Ultra 20x, SuperGrok, Kimi ×4, Z.AI ×3, Alibaba ×4) — every field 23/23,
  including `entitlementEvidence` with 38 quota dimensions
  (16 messages, 12 feature_uses, 6 credits, 3 model_calls, 1 tasks) across
  rolling_5h / weekly / monthly windows, `status` ∈ {verified 6, projected 10, stale 5,
  dynamic_unknown 2}, `boundType` ∈ {outer_ceiling 13, hard_max 4, practical_upper 4, unknown 2}.
- `modelOffers` **471** from openrouter-models (417), opencode-zen (50), openai-api (3),
  deepseek-api (1): `inputUsdPerMillion` 471, `outputUsdPerMillion` 471,
  `contextWindowTokens` 421, **`maxOutputTokens` 374**, `cachedInput…` 304.
- `provenance` **12** rows with `sourceKind`, `confidence`, `reviewStatus`, `parserVersion`,
  `evidenceLocator`, `snapshotKey`.
- **Zero lifecycle evidence.** Full-text search of the catalog for `sunset`, `deprecat`, `retire`,
  `endOfLife`, `eol`, `shutdown` → **0 hits each**.

## Field population — leaderboard lenses (all 14 live, `available: true`)

| Lens | Rows served | Priced rows | Notable |
|---|---|---|---|
| `llm-overall` | 85 (total 85) | 54 | `model.releaseDate` **85/85** |
| `llm-coding` | 30 | — | |
| `llm-value` | 54 | 54 | 8 published pareto rows |
| `llm-pricing-context` | 200/page, **total 417** | 417 | `maxInputTokens` 200/200, `maxOutputTokens` 183/200, modalities 200/200, `supportedParameters` 200/200 |
| `llm-human-preference` (LMArena) | 200/page, total 394 | **0** | `voteCount` 200/200 (**6.9M votes**), CI `lower`/`upper` 200/200, `methodology: bradley_terry` |
| `media-text-to-image` | 75 | **0** | arena scores + vote counts |
| `media-image-editing` / `-text-to-video` / `-image-to-video` / `-video-editing` | 53 / 45 / 45 / 9 | **0** | same |
| `multimodal-vision-documents` | 168 | 11 | |

Never mapped from any lens: `metric.rawValue`, `metric.lower/upper`, `metric.voteCount`,
`metric.methodology`, `metric.rankFieldSize`, `metric.sourceUpdatedAt`, `metric.observationCount`,
`metric.sessionCount`, `model.releaseDate`, `model.reasoningType`, `model.evidenceStatus`,
`model.rankingEligible`, `model.benchmarkCount`, `model.confidenceLower/Upper`.

---

# PART 3 — Root causes (five of them explain almost every blank)

## RC-1 — The LiveBench upstream loader is failing, and the failure is silent everywhere except `/make-it-yours/`

`loadCurrentLiveBenchRanking()` (`livebench-upstream.server.ts:103`) is called with
`.catch(() => null)` at `published-compatibility.server.ts:81`, `:145`, `:191`, `:204`, and the
`null` is then cached for 300 s (`model-surface-data.server.ts:43-47`). On `/make-it-yours/` it is
**not** caught (`make-it-yours-ranking.server.ts:128-138`), which is the only reason we can see it
failing at all.

Everything downstream of the LiveBench merge is therefore empty:
`PreviewModel.benchmark` (benchmark release date), `taskEconomics`, `RankingAggregateEconomics`,
`RankingTaskEconomics`, `taxonomy`, `release`, and the LiveBench category slots on
`/popular-models/`. This single failure accounts for ~700 of the ~2,023 dashes on
`/popular-models/`, all 100 "No benchmark release" markers on `/models/`, and 100 % of
`/make-it-yours/`.

The cached upstream release is `2026-06-25` with **46 models** — even when it works it covers less
than half the 100-model directory.

## RC-2 — Four `PreviewModel` fields are hardcoded `unavailable` in the compatibility projector

`src/frontend/published-model-compatibility.ts`:

| Field | Directory | Profile |
|---|---|---|
| `benchmark` | `:291` | — |
| `taskEconomics` | `:296` | `:358` |
| `runtime` | `:297` | `:359` |
| `lifecycle` | `:298` | `:360` |
| `RoutePricing.blendedUsdPerMillion` | never assigned `:137-149` | same |
| `RoutePricing.longContextInputUsdPerMillion` | never assigned `:137-149` | same |
| `LifecycleModel.replacement` | `:647` | |
| `ModelLifecycle.status` (lifecycle route) | always `'Retirement scheduled'` `:640` | |

The LiveBench merge cannot rescue `runtime` or `lifecycle` either:
`functions/_shared/livebench-ui-data.ts:350-352` sets `selectedRoute: null` and
`lifecycleStatus: unavailable`, and `api-adapter.ts:229` returns `unavailable` for a null route.
**`RuntimeSla` and `ModelLifecycle` are structurally unreachable on the entire published path.**

## RC-3 — `profileFacts` only exists on the per-slug profile path

`profileFacts` is set **only** by `profileModel()` (`published-model-compatibility.ts:361`).
`directoryModel()` never sets it, and the merge is
`directory.profileFacts ?? benchmark.profileFacts` = `undefined`.

This is why `/models/` renders `-` for `sourceCoverage.sourceCount` and `freshness.status` on all
100 cards while the same values are 100/100 populated on the profile endpoint, and why
`specifications`, `routes`, and `benchmark` are entirely absent from the directory surface.

## RC-4 — `/popular-models/` and `/make-it-yours/` use a LiveBench-shaped 7-slot taxonomy over BenchLM-shaped data

`POPULAR_MODELS_CATEGORY_SLOTS` (`src/frontend/popular-models-v1.ts:30-37`) is fixed:
`reasoning, coding, agentic-coding, mathematics, data-analysis, language, instruction-following`.
`popularModelsCategorySlotKey` (`:211-225`) requires an **exact** normalized alias match.

Consequences:
- **`data-analysis` has no BenchLM producer** → 0/100, permanently.
- BenchLM's **`knowledge` (63 models)** and **`multimodalGrounded` (44 models)** have no slot →
  their data is fetched, paginated, validated, and **discarded**.
- `multilingual` does not match the `language` alias set (`language`, `languages`, `linguistic`).

`/make-it-yours/` is worse: `projectModel` (`make-it-yours-projector.ts:61-73`) requires **all
seven slots** to have a finite percentile, or the row is dropped. With `data-analysis` structurally
absent, **no model can ever pass** — even with a working LiveBench feed and a fixed error path.

## RC-5 — Percentile is rendered where score is available

Every capability surface renders `radar[].percentile` (**262/666 populated**) instead of
`categories[].score` (**453/453 populated**). Live proof on `/compare/claude-opus-5-vs-gpt-5-6-sol/`:
the matrix shows Agentic 100 / 96.32 and Coding 97.12 / 98.56 (percentiles), and `-` for Overall,
Reasoning and Math — while both models have published Overall scores of 82.72 and 81.73.

---

# PART 4 — Per-route findings

## `/` (home)

**Loader:** `home-data.server.ts:42-62` → `loadPublishedModelDirectoryAndRanking(100)` +
`loadPublishedCatalog()` + `loadPublishedModelComparison()`.

**Rendered:** 100-row model table (Model, Identity record, Access, Input/1M, Output/1M, TTFT·p50,
Throughput); a 3-row decision snapshot (rank, name, access, score, TTFT); 4 popular cards; a 2-model
comparison block; a working subscription-vs-API block; article cards.

**Blanks — 267 bare `-`, zero `DataValueText` wrappers** (`home-page.tsx:30` declares its own
`MISSING_VALUE`; the file never imports `data-value`). Exact breakdown:

| Column | Count |
|---|---|
| TTFT · p50 | **100/100** |
| Throughput | **100/100** |
| Input / 1M | 26/100 |
| Output / 1M | 26/100 |
| Access | 2/100 |
| snapshot TTFT ×3, popular Throughput ×4, comparison TTFT ×2 / Throughput ×2 / Blended ×2 | 13 |

Every one of these is un-annotated: no `title`, no `aria-label`, no reason string, no provenance.

**Blank on every model:** TTFT, Throughput, Blended cost.
**Blank on some:** Input/Output price (26 — the models with no `representativePrice`), Access (2 —
`sourceType: "Unknown"`).

## `/models/`

**Loader:** `model-surface-data.server.ts:145` → `cachedPublishedModelDirectory`.

**Rendered:** frontier scatter (capability vs input price), comparison tray, 100 model cards.
Controls: search, provider select (17), access select, sort (Capability / Input price / Context
window / Benchmark release), Cards/List toggle, Copy link / Download image / Export CSV.

**Blanks — 381, all correctly wrapped in `DataValueText`** (this is the only route where every dash
carries a reason, a `title`, an `aria-label` and an `sr-only` description):

| Reason | Count |
|---|---|
| No benchmark release was supplied | **100/100** |
| No source coverage count was supplied | **100/100** |
| No freshness status was supplied | **100/100** |
| No context window was supplied | 26/100 |
| No input price was supplied | 26/100 |
| No selected route was supplied | 26/100 |
| No access type was supplied | 2/100 |
| No capability score was supplied | 1/100 |

Plus 100 × the hardcoded literal *"No model synopsis was supplied with this evidence record."*

**List view never server-renders** (`view` defaults to `"cards"`), so the Model / Access / Context /
Input / Capability / Compare table is absent from the SSR HTML entirely.

## `/popular-models/`

**Loader:** four parallel sources at `popular-models-live.server.ts:180-194`, including a **direct**
LiveBench release download (up to ~14 MB, SHA-1 blob-verified per artifact).

**Rendered:** 100-row master table + 100 cards, category filter chips, provider filter, search,
category matrix, comparison tray for 2–4 models, several charts.

**Blanks — 1,923 bare `-` and 100 em-dashes, zero `DataValueText` wrappers.** Measured per column:

| Column | Filled |
|---|---|
| Overall | 99/100 |
| Reasoning | **19/100** |
| Coding | **28/100** |
| Agentic coding | **31/100** |
| Mathematics | **16/100** |
| **Data analysis** | **0/100** |
| **Language** | **3/100** |
| **Instruction following** | **6/100** |
| **Cost / task** | **0/100** |
| Published overall score (economics table) | 99/100 |
| **Cost / successful evaluation** | **0/100** |
| **Mean output tokens** | **0/100** |
| **Pareto** | **0/100** |
| Comparison evidence table (6 rows) | **0/6** |

**Latent bug** — `popular-models-charts.tsx:863` and `:1027`:

```ts
models.filter((model) => model.aggregate?.costPerSuccessfulEvaluationUsd.value !== null)
```

When `aggregate` is `null` the optional chain yields `undefined`, and `undefined !== null` is
**true**, so the filter keeps every model. That is why the cost-ranking chart renders **100 empty
bars** instead of its "Published evaluation cost is unavailable" branch, and why the scatter shows
the misleading copy *"…but none also have a positive logarithmic cost…"*.

## `/leaderboards/` (directory) and `/leaderboards/[...segments]/`

**Directory:** fully static, no loader (`app/leaderboards/page.tsx:11-13`). 14 lens cards across
3 groups.

**Detail:** `leaderboard-route-live.server.ts` → `/api/benchmarks/leaderboards/{key}`.
All 14 lenses fetch 200 OK and render. Live column fill (first 10 rows of each):

| Lens | Score | Price / Context / Route |
|---|---|---|
| `llm/overall` | 10/10 | 8/10 |
| `llm/value` | 10/10 | 10/10 |
| `llm/pricing-context` | n/a (pricing-only) | 10/10 |
| `multimodal/vision-documents` | 10/10 | 6/10 |
| `llm/human-preference` | 10/10 | **0/10** |
| `media/text-to-image` | 10/10 | **0/10** |

**Zero `DataValueText` markers on any leaderboard page.** Unavailability is expressed three ways:
a bare `MISSING_VALUE = "-"` (`leaderboard-detail-page.tsx:85`), **whole-section omission** (every
chart is wrapped in `!sourceUnavailable && …` at `:308, :318, :324, :335` and each chart early-returns
`null`), and a single error card *"Verified source projection unavailable"* (`:359`).

## `/llm-price-performance/` — the healthiest page

54 points, real scores, real output prices, a real Pareto frontier, working creator and price-range
filters, an accessible per-point description, a working table and CSV export. This is the model to
copy.

Its gaps are all *unused published metadata* (score methodology, cost definitions, capabilities
descriptors, context window, cached input price, the other 8 lanes' scores) and two dead legend
entries.

## `/make-it-yours/`

Renders *"The production leaderboard service is not configured for this environment."*
Exact path: `app/make-it-yours/page.tsx:23` → `make-it-yours-ranking.server.ts:128-138`
(`loadCurrentLiveBenchRanking()` throws, uncaught) → `:139-145` returns the error string →
`make-it-yours-workbench.tsx:762` sets `unavailable = envelope === null` → `:774` renders the card.

Three separate things must be true before this page can work: (a) the LiveBench loader must not
throw; (b) `RankingAggregateEconomics.costPerSuccessfulEvaluationUsd` must be available *and finite*
per row, or every row is filtered out; (c) all seven category slots must have a finite percentile —
which `data-analysis` structurally never does (RC-4).

## `/compare/` and `/compare/[pair]/`

**`/compare/`** (3 models): 39 unavailable markers.
26 × "No published value was supplied for this capability category" (8 union axes × 3 models = 24
cells, 13 unavailable, rendered twice for mobile + desktop),
6 × "No throughput observation was supplied",
2 × "No requested model supplied both input and output prices",
2 × "No context window was supplied",
1 × "No selected route", 1 × "Fastest observation is not available", 1 × "No throughput observation
for the requested models".

Capability fill: Grok 4.5 **3/8**, Muse Spark 1.1 **3/8**, Inkling **5/8** — because the table reads
percentile, not score (RC-5).

**`/compare/[pair]/`** uses `routeEvidenceText` (`route-evidence-ui.tsx:18`) which emits a naked
`"-"` with **no reason, no title, no aria-label** — the `EvidenceValue.reason` and its `Provenance`
are silently discarded.

Both routes fetch the **complete** `ModelProfileFacts` per model — specifications (18 members),
routes (with full receipts), categories (453 rows), ledger (453 rows), sources — and render the
identity, the percentile, four price/context numbers, and nothing else. On `/compare/` this data is
serialized into the RSC flight payload (`bestVerifiedComparison` ×17, `supportedParameters` ×81,
`maxInputTokens` ×81, `perRequestLimits` ×3) and produces zero DOM.

## `/model-profile/` — the richest page

26 unavailable markers on grok-4-5. Renders: 5 metric tiles, capability radar + exact values,
a runtime section (empty), identity/limits/lifecycle, endpoint price matrix, exact route receipt
(input, output, cache write, context, verification), a workload estimator, a model data receipt
(14 rows), provenance feed.

Blank on **every** model: the 8 `ModelSpecifications` receipt rows (Created, Expiration, Knowledge
cutoff, Tokenizer, Instruction format, Moderated, Supported parameters, Per-request limits),
Runtime, Lifecycle status, Sunset, Long-context input price, Max output, Task economics, Workload,
Input/Output modalities.
Blank on **some**: cache write (45/74 models), percentile axes (3 of 6 for grok-4-5).

## `/models/[slug]/` — a second, parallel profile page

Not a redirect and not thin: a full server-rendered profile with its own hero, four stat tiles,
a capability table (Capability / Percentile / Rank / Field size — the **only** place in the app where
`CapabilityRadarAxis.rank` and `.fieldSize` render), an endpoint price ledger, identity/runtime/
lifecycle panels, provenance, and a pair-launcher form.

It duplicates `/model-profile/` from the same endpoint through a different loader and a different
projector, with **divergent coverage**: `/models/[slug]/` is the only route that shows axis
rank/fieldSize; `/model-profile/` is the only route that shows any `ModelSpecifications` or
`RouteFact[]`. Neither shows the ledger.

12 bare `-`, **zero** `DataValueText` markers (it uses `routeEvidenceText`). Live capability fill:
Percentile 3/6, Rank 4/6, Field size 4/6. Route table: Max output 0/2.

## `/model-lifecycle/`

**Zero models listed.** `Open alerts = 0`, `Next sunset = -` (the page's single unavailable marker),
release timeline empty.

Cause: `published-model-compatibility.ts:629-631` keeps only catalog offers that have an
`expirationDate` inside `[asOf, asOf + 90d]`. **No catalog offer has an `expirationDate` field at
all** — and no live endpoint publishes retirement evidence of any kind.

This is a pure **data** problem. The page's UI is entirely decorative today.

## `/subscribe-vs-api/`

**Correction to the first-pass reading:** this page is *not* client-side and it is *not* empty. It
does two sequential server fetches of `/api/catalog` (`page.tsx:30-37`) and server-renders the
result. The 30 KB blank we measured is an **unconditional canonical redirect** at `page.tsx:33`.

| URL | Size | Unavailable markers | Calculation |
|---|---|---|---|
| bare `/subscribe-vs-api/` | 30 KB | 0 | redirect shell, no content |
| canonical (`openai:go`, `gpt-5.6-terra`, write 0 %) | **114.8 KB** | 4 | ✅ succeeds |
| `openai:plus` + 3 models | 126.6 KB | 8 | ✅ succeeds |
| `anthropic:pro` | 104.2 KB | 10 | ❌ no bound API model |
| `cacheWriteShare=10` | 104.2 KB | 8 | ❌ no published cache-write rate |

**Reachability funnel:** 23 catalog plans → **15** survive the hardcoded 7-provider allowlist
(`published-subscription.server.ts:34, 44-46, 143-160`) → **4** (all OpenAI) can produce a
calculation → **3** direct-provider model offers survive scoping. The 4-model comparison cap is
unreachable; the maximum is 3.

**Two correctness bugs found:**

1. **False zero.** `modelCostRows` initialises `cacheWriteCost: 0` (`:136`). When no cache-write
   rate exists (always), `priceTokens` emits **no** `cache_write` line (`:242-245`), so the derived
   table renders **`$0.00`** while the raw-rate table above it correctly renders `-`. The page's own
   methodology text at `:495` says *"Missing is never zero."*
2. **Input bounds exceed request bounds.** "Messages / conversation" accepts up to 10 000 (`:401`)
   but the strict bound is **1 000** (`subscription-simulator-projector.ts:827`); "Conversations /
   day" accepts up to 10 000 (`:400`) but derived volume is capped at **300 M**
   (`projector:864`). Both verified live: an in-range UI value silently kills the whole calculation
   with a generic "outside published request bounds" message.

**Loaded but never rendered here:** `calculation.differenceUsd` (`:301` — the component recomputes
the same conclusion from `cheaper`), `lineItems[].tokens` and `lineItems[].id`,
`models[].tierContextTokens` (live value **1,050,000**, replaced by the hardcoded caption
*"exact direct route"* at `:388`), `models[].routeId`, `models[].providerId`,
`providers[].unavailableReason` (replaced by a hardcoded `"- — no reviewed plan"` at `:371`),
`dimensions[].sharedPoolId`, `dimensions[].modelId` (used only as a React key),
`catalog.status`, `catalog.providers[]` (the `<select>` maps the static constant instead),
`limit.state`. `monthlyInputTokens` / `monthlyOutputTokens` are rendered **only as a sum** — the
split is loaded and collapsed.

## `/data-sources/`

**100 % hardcoded.** `app/data-sources/page.tsx:10-12` is a synchronous component; the page imports
three static literals from `src/data-sources/public-registry.ts`. Zero `EvidenceValue`s, therefore
zero unavailable markers, in 145 KB of HTML.

Claims vs. live attribution:

| Listed | Reality |
|---|---|
| `benchlm` | ✅ real, attributed on 2 endpoints |
| `opencode-zen` | ✅ real, `reviewStatus: "verified"` |
| `openrouter-models` | ⚠️ in catalog provenance but `reviewStatus: null` → **excluded** by `reviewedSource()` (`published-subscription.server.ts:40`) |
| `livebench` | ⚠️ appears in no live attribution; only a hardcoded `verificationUrl` |
| `lmarena` | ❌ in no live `attribution` array — **yet 6 of the 14 leaderboard lenses are LMArena-sourced and working** |
| `litellm` | ❌ absent from catalog provenance entirely |
| `perplexity`, `microsoft` subscriptions | ❌ **do not exist** — 0 plans, 0 provenance. The page copy asserts *"These **seven** official provider pages are the exact allowlist"* |
| — | **Live and attributed but never listed:** `deepseek-api`, `openai-api`, `kimi-subscription`, `alibaba-subscription`, `alibaba-token-subscription` (8 plans + offers actually published) |
| Hero "Sources 13" | `.length` of a hardcoded array (live catalog provenance = 12, and 5 of the 13 have no live counterpart) |
| Hero "Groups 3" / **"Fallbacks 0"** | Both hardcoded literals |

## `/cost/`, `/articles/`, `/guides/`, `/tools/`

`/cost/` — `redirect("/subscribe-vs-api/")`, served as **HTTP 200** with a 1-second meta-refresh, no
canonical, generic layout `<title>`. Its target is itself a meta-refresh shell, so the chain is
`/cost/` → `/subscribe-vs-api/` → `/subscribe-vs-api/?provider=…`: **two hops, ~2 s, all 200 status**.

`/articles/`, `/articles/[slug]/`, `/guides/`, `/guides/[slug]/` — backed entirely by a hand-written
literal array (`lib/articles.ts`). 6 published articles, 2 stub "prototype insights" with no detail
route. Dead affordances: a **`news` channel declared with `count: 0`** (`articles-index-page.tsx:18`)
that the footer links to directly (`site-chrome.tsx:500`) and that always renders "No published
entries match"; a topic filter offering `"Evidence"`, which no published article carries.
`ArticleEvidenceBlocks` returns **`null` for 3 of the 6 articles**, and its one chart uses the literal
dataset `[100, 62, 41]` labelled "Illustrative monthly index".

Routing defects (both verified live, both **HTTP 200**): `/guides/hybrid-router/` is a **soft 404**
(Next's 404 body at status 200), and `/guides/track-claude-code-usage/` is a meta-refresh to
`/articles/…` *plus* the 404 shell markers.

`/tools/` — static JSX, one card.

## Site chrome (every route)

`layout.tsx:23` calls `loadSiteChromeData()` on **every page in the product**, which fetches
`/api/benchmarks/price-performance` (cached 300 s) and projects a full
`PopularModelsV1ViewModel` down to **two fields**: `topModels[]` (10 rows × modelId/name/provider/
rank/score) and `topModelsLabel`. All pricing, capability, provenance and freshness on that view
model is discarded. The label reads *"Published Aug 23, 2026"* and **never names BenchLM**, the
source the API actually attributes.

The footer's `MarketingForm` (`site-chrome.tsx:347-374`) validates client-side and sets
`status = "success"` with **no fetch, no action, no persistence** — it shows *"Thanks — your details
are ready for the marketing list"* while discarding the submission, and advertises a *"downloadable
PDF or CSV"* that exists nowhere in the app.

All 10 top-model links in the primary nav point at `/model-profile?model=…` without a trailing
slash, which **308-redirects** to `/model-profile/` — an extra round trip on every one.

---

# PART 5 — Presentation-layer inconsistency

There are **two** unavailable-state vocabularies, and a third that never renders.

| Layer | Emits | Used by | Live occurrences |
|---|---|---|---|
| `DataValueText` / `DataText` (`untitled-data/data-value.tsx:39-85`) | `-` + `data-unavailable-value` + `title` + `aria-label` + `sr-only` reason | `/models/` (381), `/model-profile/` (26), `/compare/` (39), `/model-lifecycle/` (1) | **447** |
| Local `const MISSING_VALUE = "-"` | naked `-`, no reason, no a11y | `/` (`home-page.tsx:30`, 267 dashes), `/popular-models/` (`:81` + `charts:50`, 1,923 dashes), `/leaderboards/[key]/` (`:85`), `/llm-price-performance/`, `/make-it-yours/` (`:91`) | **~2,200** |
| `routeEvidenceText` (`route-evidence-ui.tsx:18`) | naked `-` | `/models/[slug]/` (12), `/compare/[pair]/` | ~15 |
| `n/a` for categorical status | `<span aria-hidden>n/a</span>` | **only** `make-it-yours-workbench.tsx:109` | **0 live** — that page never renders |

So the `n/a` convention has **zero live occurrences** today, and roughly **83 % of all unavailable
states on the site carry no reason, no tooltip and no screen-reader text**.

Why the popular-models path can't use `DataValueText` even if it wanted to: `PopularModelsV1ViewModel`
is a *nullable-scalar* contract (`number | null` plus a **sibling** `…UnavailableReason: string | null`,
`popular-models-v1.ts:91-94`), while `DataValueText` requires a `PresentationValue<T>` object carrying
both. The accessors `popularModelsColumnValue` (`:469-497`) and `popularModelsMetricValue` (`:457-466`)
return a plain `number | null`, so the reason is already gone by the time the cell renders.

---

# PART 6 — Surfaces that would light up immediately

Concrete, with the field and the measured count.

| # | Surface | Needs | Effort | Payoff |
|---|---|---|---|---|
| 1 | **Every capability table** (`/compare/`, `/compare/[pair]/`, `/model-profile/`, `/models/[slug]/`) | render `categories[].score` (**453/453**) instead of `radar[].percentile` (**262/666**) | one projector change | capability cells go from ~58 % filled to **100 %**; `/compare/` drops from 26 blanks to ~2 |
| 2 | **`/models/` card footer "Sources: n · Freshness:"** (200 blanks) | `summary.coverage.sourceCount` + envelope `freshness.status` — **100/100 available** | either read envelope `freshness` (already fetched) or add a coverage field to the directory projection | removes **200 of 381** blanks on the page |
| 3 | **`/model-lifecycle/` release timeline** | `identity.releaseDate` — **99/100 available** at `/api/benchmarks/models/{slug}`, and **85/85** on the `llm-overall` lens | new projection; the lifecycle route currently reads the wrong endpoint | turns a fully empty page into a real 99-model release timeline |
| 4 | **A "related comparisons" module on `/model-profile/`** | `profile.comparisons[]` — **663 rows, 71 indexable pairs**, already in every profile response | stop dropping it at `published-model-compatibility.ts:226-263` | internal linking + a real next-step CTA on 95/100 profiles |
| 5 | **LMArena leaderboard credibility** | `metric.voteCount` (**6.9M votes**) and `metric.lower` / `.upper` (**200/200 CIs**) | map two fields in `leaderboard-route-live.ts:662-691` | an arena score with a CI and a vote count instead of a bare number |
| 6 | **`/models/` sort "Benchmark release" + the timeline section** | `week.weekStart` (envelope) or `model.releaseDate` (lens, 85/85) | | un-deadens a sort option, a card badge ×100, and an entire page section |
| 7 | **Max output / modalities / supported parameters everywhere** | join `/api/catalog` `modelOffers` (**374/471 have `maxOutputTokens`**) or the `llm-pricing-context` lens (**183/200**, plus modalities and parameters 200/200) | needs an identity join; naive slug-tail match already reaches **60/100** models and would fill `maxOutputTokens` on **52** | fills the "Max output" column on `/model-profile/`, `/models/[slug]/`, `/compare/[pair]/`, and the leaderboard CSV |
| 8 | **11 of the 26 price-less models** | same catalog join | | `/` and `/models/` blanks drop from 26 to 15 |
| 9 | **`/subscribe-vs-api/` first paint** | nothing new — drop the unconditional canonical redirect at `page.tsx:33` (or make it 308 with a real `Location`) | one condition | turns a 30 KB blank first hit into the 114.8 KB page that already works one hop later. Then widen the plan funnel: 19 of 23 live plans are currently uncalculable |
| 9b | **A per-line token column in the subscription derived table** | `lineItems[].tokens` — already computed and transported | display only | removes a disclaimer that is factually false and shows the actual cache-read allocation |
| 10 | **A "benchmark ledger" table on `/model-profile/`** | `ModelProfileFacts.benchmark.ledger` — **453 rows** with `displayValue`, `rank`, `unit`, `observedAt`, `sourceUrl` | already fetched on 4 routes, rendered on 0 | per-metric receipts with clickable sources |
| 11 | **`/leaderboards/` directory freshness + counts** | `/api/benchmarks` `routes[]` (14 lenses with `available`) + `decisionPicks` (6 live leader lists) | endpoint not yet called | turns a static card grid into a live index |
| 12 | **Home "decision snapshot"** | `/api/benchmarks` `homeDecisionSnapshot` — `benchAlignLeader`, `valueFrontierLeader`, `lowestVerifiedRepresentativeRate`, all `status: "ready"` | endpoint not yet called | three real, pre-computed hero tiles |
| 15 | **`/popular-models/` Knowledge + Multimodal columns** | BenchLM `knowledge` (**63 models**) and `multimodalGrounded` (**44 models**) — already fetched and discarded | add two slots to `POPULAR_MODELS_CATEGORY_SLOTS` and their aliases | +107 populated cells; also stops the wasted `llm-knowledge` pagination |
| 16 | **`/llm-price-performance/` methodology + cost definitions** | `data.scoreMethodology` (9 lanes) + `data.costDefinitions` | replace the hardcoded chip at `:936` | published definitions instead of hardcoded prose |
| 17 | **Cached-input pricing column** | `cachedInputUsdPerMillion` — 29/74 profile routes, 95/200 pricing-context, **304/471 catalog offers** | | a real cost-optimization lever, currently shown on exactly one page |

---

# PART 7 — Data problem vs. wiring problem

| Blank | Verdict | Evidence |
|---|---|---|
| TTFT / throughput / uptime (all routes) | **Data** | 0 occurrences in any of the 6 live endpoints. Confirmed genuinely sourceless |
| Lifecycle / sunset / retirement / successor | **Data** | 0 hits for `sunset`/`deprecat`/`retire`/`eol` across the full catalog. No endpoint publishes it |
| `familyId` / `variantId` / `selfHostingAvailable` | **Data** | 0/100 at the origin |
| `bestVerifiedComparison` / `gap` / `weight` | **Data** | 0/453 ledger rows |
| Task economics / evaluation cost / mean output tokens / Pareto | **Data (upstream)** — LiveBench release is stale (2026-06-25, 46 models) and the loader is failing | RC-1 |
| `data-analysis` category | **Wiring (taxonomy mismatch)** | No BenchLM producer; the 7-slot taxonomy is LiveBench-shaped. RC-4 |
| `knowledge` / `multimodalGrounded` on `/popular-models/` | **Wiring** | 63 and 44 models have data; no slot alias exists |
| Capability `-` on `/compare/` and profiles | **Wiring** | `score` is 453/453; `percentile` is 262/666. RC-5 |
| `/models/` "Sources" and "Freshness" (200 blanks) | **Wiring** | 100/100 available on the profile endpoint; `freshness` is in the directory envelope already |
| `/models/` "Benchmark release" (100 blanks) | **Wiring** | `week.weekStart` in the envelope; `releaseDate` 85/85 on the lens |
| `/model-lifecycle/` release timeline | **Wiring** | 99/100 release dates live |
| Max output / modalities / supported parameters | **Wiring (cross-source join)** | 0/74 on the benchmarks path, but 183/200 + 200/200 + 200/200 on the pricing-context lens and 374/471 in the catalog |
| Input/output price on 26 models | **Data (partly)** | `representativePrice` null for 26; **11 of those 26** have a catalog offer → 11 are wiring, 15 are data |
| `/subscribe-vs-api/` blank first paint | **Wiring** | The canonical URL renders 114.8 KB of real data; a bare hit is an unconditional meta-refresh shell |
| `/subscribe-vs-api/` — 19 of 23 plans uncalculable | **Data** | `supportedModelIds: []` on all non-OpenAI plans at the origin; 2 of 7 allowlisted providers have no plans at all |
| Subscription cache-write price | **Data** | `cacheWriteMicroDollarsPerMillion` null on 100 % of offers |
| Subscription annual pricing tiles | **Data** | 0 of 23 plans publish `annualCostMicroDollars` |
| `/data-sources/` source list | **Wiring** | `catalog.provenance[]` (12 rows with `observedAt`, `confidence`, `reviewStatus`) is already fetched on 3 routes and rendered on none |
| `/make-it-yours/` blank page | **Wiring + data** | uncaught throw (wiring) over a stale upstream (data) over an impossible 7-slot requirement (wiring) |
| Blended cost / long-context price | **Wiring** | never assigned in `routePricing()`; the leaderboard lens publishes `blendedCostPerMillion` and it is discarded |
| LMArena price/context columns | **Data** | arena models have no routes; the columns should not exist on those lenses |
| Vote counts / confidence intervals | **Wiring** | 200/200 available, 0 rendered |

---

# Appendix — reproduction

```bash
# live preview pages
curl -sS https://tokenbench-next.1tm-notion.workers.dev/models/ -o models.html
curl -sS https://tokenbench-next.1tm-notion.workers.dev/leaderboards/llm/human-preference/ -o lb.html

# origin ground truth
curl -sS https://tokenbench.monomind.one/api/benchmarks/models?limit=100
curl -sS https://tokenbench.monomind.one/api/benchmarks/models/grok-4-5
curl -sS https://tokenbench.monomind.one/api/catalog
curl -sS https://tokenbench.monomind.one/api/benchmarks                         # 1.03 MB, unused
curl -sS "https://tokenbench.monomind.one/api/benchmarks/leaderboards/llm-pricing-context?profile=balanced&limit=200"

# count annotated unavailable states in a fetched page
grep -o 'data-unavailable-value' page.html | wc -l
# count naked dashes
grep -o '>-<' page.html | wc -l
```
