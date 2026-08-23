# LiveBench reference study — data model, presentation, charts, and what to adopt

**Date:** 2026-08-23
**Scope:** `https://livebench.ai/` and its source repo `LiveBench/new-livebench`, read at commit
`f6a8110e3cd64eb10fdbb857c9c29ca2545917ca` (HEAD of `main`, 2026-08-23). Cross-checked against
TokenBench's own parser (`src/livebench/parser.ts`), discovery worker
(`workers/benchmark-ingest/src/livebench-discovery.ts`), refresh worker
(`workers/benchmark-ingest/src/livebench-refresh.ts`), UI projection
(`functions/_shared/livebench-ui-data.ts`) and fixtures
(`workers/benchmark-ingest/test-fixtures/livebench/`).
**Status:** read-only study. No code changed, nothing deployed.

`livebench.ai` is a client-rendered CRA SPA (HashRouter) deployed from this repo's `gh-pages`
branch — `npm run deploy` pushes `build/` with `--cname livebench.ai`. Fetching the URL returns an
empty shell; **all evidence below comes from the source repo and the published `public/*.csv|json`
artifacts**, which is the same surface TokenBench already ingests.

---

## 1. The data model

### 1.1 Everything LiveBench publishes, per release

All published data lives in `public/`, **one set of files per release, named by date `YYYY_MM_DD`**.
There is no API, no JSON index, no manifest. Release existence is declared in *code*.

| Artifact | Path | Format | Required | Grain |
| --- | --- | --- | --- | --- |
| Scores | `public/table_<date>.csv` | CSV | ✅ | one row per model × one column per **task** |
| Taxonomy | `public/categories_<date>.json` | JSON | ✅ | category → ordered task list |
| Economics | `public/cost_<date>.csv` | CSV | optional (opt-in per release) | one row per model, task-wide columns |
| Model metadata | `src/Table/modelLinks.js` | JS module (`export const modelLinks = {…}`) | ✅ | **global, not per release** |
| Release control | `src/lib/constants.js` (`export const RELEASES = [...]`) | JS array literal | ✅ | the version pin |
| Methodology (code) | `src/lib/compute.js`, `src/Table/Averaging.js` | JS | — | the only formal spec of the derived metrics |
| Methodology (prose) | `src/Blog.js` → route `#/details`, plus `public/livebench.pdf` (698 KB) | JSX / PDF | — | the ICLR-2025 paper write-up |

Notably **absent**: per-model release dates, parameter counts, context windows, licences,
provider/route pricing, latency, token throughput, per-question results, confidence intervals,
sample sizes beyond `nq_*`, and any notion of "current price". The published surface is scores +
what the eval run itself cost.

### 1.2 `table_<date>.csv`

```
model,<task_1>,<task_2>,…,<task_N>
claude-opus-4-5-20251101-thinking-64k-high-effort,99.0,80.435,78.873,…
```

- `model` — string key, joins to `modelLinks` and to `cost_<date>.csv`. Case-sensitive, exact.
- every other column is a **task ID** matching a value in `categories_<date>.json`.
- values: **raw score, 0–100, float**, arbitrary decimal precision (observed 0–3 dp).
  Percent-of-max-credit, not accuracy — several tasks award partial credit.
- **No aggregate columns are stored.** No overall, no category average, no rank. Every aggregate is
  computed in the browser. This is stated explicitly in the README ("Scores are stored raw, per
  subtask. Overall and per-category averages are **computed in the browser**").
- In the current release there are **zero empty cells** — the file is dense. TokenBench's parser
  correspondingly requires every task column to be a finite decimal in `[0,100]` for every model.

### 1.3 `categories_<date>.json`

A flat object, insertion-ordered, category label → array of task IDs:

```json
{
  "Reasoning": ["theory_of_mind","zebra_puzzle","spatial","logic_with_navigation"],
  "Coding": ["code_generation","code_completion"],
  "Agentic Coding": ["javascript","typescript","python"],
  "Mathematics": ["AMPS_Hard","integrals_with_game","math_comp","olympiad"],
  "Data Analysis": ["consecutive_events","tablejoin","tablereformat"],
  "Language": ["connections","plot_unscrambling","typos"],
  "IF": ["paraphrase","simplify","story_generation","summarize"]
}
```

The **key order is the canonical category order** used by every column layout and chip row. Labels
are display strings (`"Agentic Coding"`, `"Data Analysis"`), and only `IF` is abbreviated — expanded
to `Instruction Following` by `catFull()`. Column headers use 3-letter shortenings from `catShort()`
(`Rsn / Cod / Agt / Mth / Dat / Lng / IF`).

### 1.4 `cost_<date>.csv` — 76 columns in the current release

For `N` tasks the schema is exactly `1 + 4N + 4` columns:

| Column group | Count | Unit | Meaning |
| --- | --- | --- | --- |
| `model` | 1 | — | join key |
| `<task>` | N (23) | **USD, total** | total spend to run *all* questions of that task for that model |
| `nq_<task>` | N (23) | integer | number of questions actually scored for that (model, task) |
| `avg_input_tokens` | 1 | tokens | model-level mean input tokens per question (overall) |
| `avg_output_tokens` | 1 | tokens | model-level mean output tokens per question (overall) |
| `input_price_per_million` | 1 | USD / 1M tokens | official provider list price used for the run |
| `output_price_per_million` | 1 | USD / 1M tokens | official provider list price used for the run |
| `out_<task>` | N (23) | tokens | mean output tokens per question, for that task |
| `cost_per_question` | 1 | USD | precomputed overall Σcost ÷ Σnq |
| `cost_per_successful_task` | 1 | USD | precomputed overall (Σcost ÷ Σnq) ÷ overall × 100 |

Per-question cost provenance, verbatim from the README: *"the runner's recorded `cost_usd` when it's
a real (>0) cache-aware value, else billed tokens × the official per-million rates
(`(uncached·input + cached·cached_input + output·output)/1e6`). One answer per (task, question) is
kept (latest run), matching the scorer."* Generated by `scripts/gen_cost_row.py` in a private repo
(`livebench-private`), so the generator is not auditable from public source.

**`nq_*` is per-model, not per-release.** In `2026-06-25`, 43 of 46 models share the canonical
question vector (1,270 questions); 3 models diverge — e.g. one model lost 8 of 50 `zebra_puzzle`
questions and 5 of 50 `plot_unscrambling`; another gained one `AMPS_Hard` question (101 vs 100).
This is why the cost aggregation is question-weighted rather than using a release constant.

**Zero/missing economics are encoded as `0.0`, not as blanks.** `ox-alpha-max` in the current
release has every cost column, both price columns, and both precomputed cost columns at `0.0` while
still carrying real `nq_*` and `out_*` values. Nothing in the file marks it as "no pricing"; the UI
infers it by filtering on `costOf(m) > 0`.

### 1.5 `modelLinks.js` — the model dimension

A single hand-maintained JS object literal, 62 KB, **271 top-level model keys plus 64 variant
`rawName`s = 335 addressable configurations** across all releases. TokenBench parses it with a
restricted-literal evaluator (`src/livebench/restricted-literal.ts`) — it is never executed, and the
parser fails closed on any host/global access in the trailing helper code.

Fields, with observed frequency across the 271 entries:

| Field | Type | Count | Notes |
| --- | --- | --- | --- |
| `displayName` | string | 333 | human label; falls back to the raw key |
| `organization` | string | 272 | 28 distinct values; **free text, not an ID** — `Mistral` vs `Mistral AI`, `Abacus.AI` vs `AbacusAI` both appear |
| `url` | string | 270 | announcement / docs / model-card link |
| `version` | string | 156 | usually the dated snapshot (`2025-08-07`, `002`) |
| `reasoner` | boolean | 143 | thinking/reasoning model |
| `openweight` | boolean | 94 | open-weights |
| `huggingface` | string | 43 | explicit HF URL |
| `variants[]` | array | 28 | effort/reasoning-budget siblings |
| `variants[].rawName` | string | 64 | the key that appears in the CSVs |
| `finetune{organization,baseModel,baseOrganization}` | object | **1** | derivative lineage (`smaug-agentic` ← `Kimi K3`) |
| `highUnseenBias` | boolean | 1 | undocumented; on `gemini-3.1-pro-preview-high`, unused by any UI code |

`variants[]` is the effort-grouping mechanism: `gpt-5` carries
`[{rawName:"gpt-5-high"},{rawName:"gpt-5-low"},{rawName:"gpt-5-minimal"}]`, each inheriting
`organization`/`url`/`reasoner`/`openweight` from the parent unless overridden. `getModelInfo()`
returns a merged record with `baseName`, `rawName`, `isVariant`, and `variantGroup`.
`getHuggingFaceUrl()` degrades gracefully: explicit `huggingface` → `url` if it is already on
huggingface.co → an HF search URL, so every open-weight model gets *some* link.

**A model with no `modelLinks` entry is silently hidden** (`App.js`: `if (!info) return null;
// mirror the site: only models with metadata are shown`). `npm run check-data` reports those as a
warning and hard-fails only on cost rows with no score row.

### 1.6 Versioning and pinning

- The canonical release list is `RELEASES` in `src/lib/constants.js` — a plain string array.
  **The last entry is the latest and is the default view.** A release's files can exist in `public/`
  without being listed, and would then be invisible.
- 11 releases are currently declared: `2024-06-24, 2024-07-26, 2024-08-31, 2024-11-25, 2025-04-02,
  2025-04-25, 2025-05-30, 2025-11-25, 2025-12-23, 2026-01-08, 2026-06-25`.
- **Releases are not immutable.** Commit history shows the current `2026-06-25` release being edited
  continuously: `Add ox-alpha-max: scores + cost` (2026-08-21), `Add deepseek-v4-flash-vision-exp`
  (2026-08-22), and a same-day correction `deepseek-v4-flash-vision-exp: correct grading-starvation
  false zeros (74.04 -> 76.76)`. A release date is a *question-set* version, not a snapshot version.
  The only stable pin is the git commit / blob SHA — which is exactly what TokenBench's discovery
  worker keys on (`releaseFingerprint()` over artifact + methodology blob IDs).
- Cache-busting is `?v=$REACT_APP_BUILD` (a build timestamp), because filenames are stable across
  deploys. There is no ETag/`Last-Modified` contract for the data files themselves.

---

## 2. Category and task taxonomy

### 2.1 Current taxonomy — 7 categories, 23 tasks, 1,270 questions

| Category | Tasks | Questions | Task IDs |
| --- | ---: | ---: | --- |
| Reasoning | 4 | 202 | `theory_of_mind` (52), `zebra_puzzle` (50), `spatial` (50), `logic_with_navigation` (50) |
| Coding | 2 | 117 | `code_generation` (71), `code_completion` (46) |
| Agentic Coding | 3 | 72 | `javascript` (22), `typescript` (30), `python` (20) |
| Mathematics | 4 | 379 | `AMPS_Hard` (100), `integrals_with_game` (100), `math_comp` (102), `olympiad` (77) |
| Data Analysis | 3 | 150 | `consecutive_events` (47), `tablejoin` (52), `tablereformat` (51) |
| Language | 3 | 150 | `connections` (50), `plot_unscrambling` (50), `typos` (50) |
| IF | 4 | 200 | `paraphrase` (50), `simplify` (50), `story_generation` (50), `summarize` (50) |

### 2.2 Taxonomy evolution across the 11 declared releases

| Release | Models | Cats | Tasks | Change |
| --- | ---: | ---: | ---: | --- |
| 2024-06-24 | 73 | 6 | 17 | v1 |
| 2024-07-26 | 73 | 6 | 18 | +1 Reasoning task |
| 2024-08-31 | 59 | 6 | 18 | |
| 2024-11-25 | 64 | 6 | 18 | |
| 2025-04-02 | 62 | 6 | 18 | |
| 2025-04-25 | 56 | 6 | 17 | −1 Data Analysis task |
| 2025-05-30 | 69 | **7** | 20 | **+ Agentic Coding (3 tasks)** |
| 2025-11-25 | 64 | 7 | 20 | |
| 2025-12-23 | 65 | 7 | 21 | +1 Reasoning task |
| 2026-01-08 | 121 | 7 | 23 | +1 Math, +1 Data Analysis; largest model field |
| 2026-06-25 | 46 | 7 | 23 | current; smallest recent field |

Cost data exists only for `2026-06-25` (one `cost_*.csv` in the repo). Older releases render with
all cost columns and cost charts hidden.

**Model cohorts are not stable across releases.** Both the task set *and* the model set change, so
cross-release score comparison is not supported by the product and is never offered in the UI —
switching a release re-scopes the whole page.

### 2.3 Score aggregation — exact formulas

From `src/Table/Averaging.js` and `src/lib/compute.js`:

```
categoryAvg(model, cat) = mean(  taskScore[t]  for t in categories[cat]  where not NaN )
overall(model)          = mean(  categoryAvg(model, c)  for c in ALL categories )
```

Both are **unweighted arithmetic means**, and the two levels compose:

- **Task → category: equal weight per task.** A 20-question `python` task counts the same as a
  102-question `math_comp` task within its category.
- **Category → overall: equal weight per category (1/7 each).** So Agentic Coding (72 questions,
  5.7% of the question pool) contributes 14.3% of the overall score, and Mathematics (379 questions,
  29.8% of the pool) also contributes 14.3%.
- There is **no normalization, no z-scoring, no difficulty weighting, no confidence interval**.
  Missing task values are dropped from the mean rather than imputed (`filter(val => !isNaN(val))`),
  so a model missing a task is scored on the remainder — a silent selection effect the UI does not
  surface.
- `getGlobalAverage()` returns a **string** `toFixed(2)`, so the site's canonical overall is
  2-dp-rounded before display, while the leaderboard renders `toFixed(1)`.
- **Hardcoded overrides exist.** `getGlobalAverage()` opens with
  `if (row['model'] === 'grok-3-thinking') return 72; else if (row['model'] === 'grok-3') return 58;`
  — two models whose overall is a literal, bypassing the data entirely. This is a real correctness
  hazard for any downstream re-derivation, and TokenBench's re-computation will disagree with the
  site for those two rows.
- When categories are *selected* in the leaderboard, "Overall" silently changes meaning to
  `mean(selected category averages)` — same formula, narrower set. The header tooltip changes to
  match ("Overall — mean of the selected category averages").

---

## 3. Cost and economics

This is the part LiveBench has thought hardest about, and it is the part most worth copying.

### 3.1 The two definitions

Let `S` be a **scope** — `overall` (all tasks), a category (its tasks), or a single task.

```
$/Q  (cost per question, scope-aware, QUESTION-WEIGHTED)
  = ( Σ_{t∈S} cost[t] ) / ( Σ_{t∈S} nq[t] )

score(S)
  = overall(model)                      if S == overall
  = categoryAvg(model, S)               if S is a category
  = taskScore[S]                        if S is a task

cost_per_successful_task(S)
  = ( $/Q(S) / score(S) ) × 100          [USD]

$/quality(S)
  = $/Q(S) / score(S)                    [USD per LiveBench point]   ( = cpst / 100 )

pointsPerDollar = score / cost           ["best value" KPI]
```

The `× 100` exists so that the number reads as "dollars per question you'd expect to get right",
since scores are 0–100. `costPerQuality` and `costPerSuccess` are the same quantity at different
scale; the UI ships `costPerSuccess` everywhere.

### 3.2 Why question-weighted, stated in their own words

From `compute.js`, verbatim: *"This is NOT the mean of the per-category $/Q values; expensive but
small suites like Agentic Coding are weighted by their question count, not 1/7."*

So they deliberately use **two different weightings in the same ratio**: the numerator (cost) is
question-weighted, the denominator (score) is category-equal-weighted. That is a defensible choice —
cost is a physical sum, score is their published capability definition — but it is an inconsistency
you must reproduce exactly to match their numbers.

### 3.3 Verification against the published columns

I recomputed both formulas from the raw CSVs for all 46 models in `2026-06-25`. They match the
precomputed `cost_per_question` / `cost_per_successful_task` columns to 4 dp for every model:

| model | overall | computed $/Q | file `cost_per_question` | computed cpst | file `cost_per_successful_task` |
| --- | ---: | ---: | ---: | ---: | ---: |
| `grok-build-0.1` | 67.7810 | 0.01629 | 0.0163 | 0.02403 | 0.0240 |
| `claude-opus-4-5-…-high-effort` | 72.5822 | 0.44306 | 0.4431 | 0.61043 | 0.6104 |
| `claude-opus-4-6-thinking-auto-high-effort` | 74.5199 | 0.30071 | 0.3007 | 0.40353 | 0.4035 |
| `claude-opus-4-7-xhigh-effort` | 76.5294 | 0.40423 | 0.4042 | 0.52821 | 0.5282 |

**The UI does not read those two columns.** It recomputes from the per-task columns on every render
so the number stays correct as the scope changes. The precomputed columns are effectively a
convenience export for third parties — us.

### 3.4 Output-token aggregation

`outputTokensForScope()` is asymmetric on purpose: at `overall` scope it returns the model-level
`avg_output_tokens` directly; at a category/task scope it computes the question-weighted mean
`Σ(out_t × nq_t) / Σ nq_t`. Used only in tooltips ("avg output tokens (Mathematics)"), never in a
score or ranking.

### 3.5 The Pareto frontier ("value frontier")

`frontierBy(models, getCost, getScore)` — sort ascending by cost, walk, keep any model whose score
exceeds the running max. It is **scope-aware in the table and overall-scope elsewhere**, and returns
a `Set` of model keys. Simple, deterministic, and cheap. Models with `cost == null || cost <= 0` are
excluded up front, which is how the zero-cost `ox-alpha-max` row disappears from cost views.

### 3.6 ⚠ TokenBench currently diverges from this definition

`functions/_shared/livebench-ui-data.ts` computes:

```ts
const equivalentSuccesses = taskEconomics.questionCount * score / 100;      // per task
aggregateCostPerSuccess   = Σ cost  /  Σ equivalentSuccesses;               // per model
```

That is a **fully question-weighted** cost-per-success. LiveBench's is
`(Σcost / Σnq) / overall × 100` with a **category-equal-weighted** denominator. Measured across the
45 costed models in `2026-06-25`:

- TokenBench's figure runs systematically **~5% below** LiveBench's published
  `cost_per_successful_task` — mean |Δ| **5.08%**, max **10.14%**.
- Ordering is nearly but not exactly preserved: **4 discordant pairs out of 990** (Kendall τ = 0.992),
  **7 of 45 models change rank position**, max shift 2 places.
- Our figure is arguably the more internally consistent statistic. But it is *not* LiveBench's, and
  if we attribute the number to LiveBench while publishing a different definition, the numbers on
  our page will not reconcile with theirs. Either publish both (theirs labelled as LiveBench's,
  ours labelled TokenBench-derived) or adopt theirs verbatim. `docs/rebuild-audit/
  data-source-frontend-coverage-matrix-2026-08-21.md` already carries the rule *"do not average
  ratios differently from source method"* — this is a live violation of it.

---

## 4. Presentation — the leaderboard

Source: `src/components/Leaderboard.jsx` (the live table) and `src/App.js`. Note that
`src/Table/CSVTable.jsx` (37 KB, the pre-redesign table with `react-select` filters and hardcoded
column lists) and `src/components/MetricsStrip.jsx` are **dead code** — `index.js` routes only
`App` (`/`, `/insights`) and `Blog` (`/details`), and neither imports them.

### 4.1 Page structure

```
sticky Navbar (brand + pulse dot + "LIVE" tag | Leaderboard · Insights · Details · Paper · Code ↗)
Hero      — eyebrow "Contamination-free LLM benchmark", h1, one-sentence sub with live task/cat counts
ReleaseTimeline (11 dots)  +  "Showing LiveBench-2026-06-25 — the latest release. ● live"
§01 Leaderboard
§02 Insights (scatter | cost bars, then radar)
Footer — "LiveBench · sponsored by Abacus.AI · a contamination-free LLM benchmark."
         "Overall = mean of category averages · cost = cost per successful task"
```

### 4.2 Columns

| # | Column | Alignment | Notes |
| --- | --- | --- | --- |
| 1 | expand caret `▸` | left, 30 px | row toggles a subtask detail panel |
| 2 | **Model** | left, sticky | display name + inline `open` pill for open-weights |
| 3 | **Org** | left | **hidden by default**, toggled by a "Show org" chip |
| 4…k | score columns | right, mono, tabular-nums | contents depend on category selection (below) |
| last | **Cost per successful task** | right | `$0.000` (3 dp), only when the release has cost data |

Score columns are computed from the category selection:

- **0 categories selected** → `Overall` + all 7 category averages (8 numeric columns).
- **exactly 1 selected** → that category's average + **its task columns** (drill-down in place).
- **2+ selected** → `Overall (of the selected)` + the selected category averages.

Score cells render `toFixed(1)`; the overall column is `.lb-ovr`, categories `.lb-cat`.

### 4.3 Sort

- **Default: `overall`, descending.** When a single category is selected the default sort key
  switches to that category, still descending.
- **Every column is sortable**, including Model, Org, all score columns, all task columns when
  drilled in, and Cost per successful task (`cpst`).
- **First-click direction is type-aware**: score columns start **descending** (best first); Model,
  Org, and `cpst` start **ascending** (A–Z / cheapest first). Clicking the active column flips.
- Nulls always sort last regardless of direction (`if (va == null) return 1;`).
- Sort indicator is a small `▼`/`▲` in the header. Headers carry `data-tip` tooltips, including a
  full formula tooltip on the cost column: *"Cost per successful task = (cost per task ÷ score) × 100
  for the selected scope — penalizes failures / partial credit"*.

### 4.4 Filters

| Control | Type | Default | URL param |
| --- | --- | --- | --- |
| Search models | text input, substring on display name **and** raw key, case-insensitive | empty | *(not persisted)* |
| Open weights | toggle chip | off | `open=1` |
| Include finetunes | toggle chip (shared with Insights, owned by `App`) | **off — finetunes hidden by default** | `ft=1` |
| Show org | toggle chip (adds the Org column) | off | `showorg=1` |
| Organization | `<select>`, options derived from the visible model set, sorted | "All organizations" | `org=<name>` |
| Category | multi-select chip row + an "All" reset chip | All | `cats=A,B` |
| Release | timeline dots in the hero (re-scopes the entire page) | latest | *(not persisted)* |
| Sort | header click | `overall` desc | `sort=`, `dir=asc|desc` |

All of it lives in the **hash query string** (`#/?cats=Agentic+Coding&sort=python&dir=desc`) via
`history.replaceState`, so links are shareable with no history spam. Defaults are omitted from the
URL. Note that the free-text search is deliberately *not* persisted.

There is **no** filter for reasoner/non-reasoner, release date, parameter count, context length, or
modality — `reasoner` is in the data (143 entries) and never surfaced in the UI at all.

### 4.5 Variant collapsing

`collapseVariants()` groups rows by `familyKey = getModelInfo(model).baseName` and keeps **only the
best-overall member**. So `gpt-5-high` / `gpt-5-low` / `gpt-5-minimal` collapse to one row. This is
applied *after* filtering and *before* sorting, so the collapse respects the active filters. There
is no UI to expand a family back out in the table (the scatter and bar charts do show variants
separately, with the effort suffix moved to a bracketed second line).

### 4.6 Pagination, virtualization, missing values

- **No pagination and no virtualization.** All rows render. The largest release is 121 models.
- Scrolling is contained: `.lb-tbl-scroll { overflow:auto; max-height:78vh }` with
  `thead th { position:sticky; top:0 }` and a sticky-left model column. The table is
  `width:max-content; min-width:100%` so it grows naturally and scrolls sideways rather than
  squishing. This is a deliberate replication of the old LiveBench behaviour, per a code comment.
- **Missing values render as an em-dash `—`**, never `0`, never blank. Cost cells additionally get an
  `.na` class. Models with no `modelLinks` metadata are dropped entirely rather than shown partial.
- Row click expands an inline detail panel spanning all columns: lineage
  (`From: <org>`, or `Finetune from:` / `Base model: X (from Y)`), `Version:`, a `Hugging Face ↗`
  link when resolvable, then a grid of every selected category with each task's score.

### 4.7 Cell shading

`computeShades()` ranks every score column independently and tints the **top 5 cells** with five
decreasing alphas of the accent blue: `rgba(47,84,235, 0.24 / 0.17 / 0.115 / 0.07 / 0.035)`. It is
recomputed against the *filtered* row set, so it always describes the visible cohort. (`compute.js`
also exports an unused `heat()` that maps 40→100 onto alpha 0→0.20 — the continuous alternative they
rejected in favour of rank-based top-5.)

A footer line under the table restates the rule in a mono "comment" voice, e.g.
`// select 1 category for its subtasks, or several to compare category averages · shading = top 5 per column · click a row for subtasks`.

---

## 5. Charts

Hand-built inline SVG and CSS. **No chart library at all** — the only relevant dependency is
`papaparse`. That is a strong signal for us: three charts, ~500 lines total, complete control.

### 5.1 Quality-vs-cost scatter — the headline chart

`src/components/insights/CostQualityScatter.jsx`, `viewBox="0 0 560 400"`, padding L46 R14 T16 B46.

| Aspect | Spec |
| --- | --- |
| **x** | Cost per successful task, **log10 scale**, domain `[min×0.85, max×1.15]` |
| x ticks | fixed human-readable ladder filtered to the domain: `0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50`, labelled `$0.05` |
| **y** | LiveBench overall (or the selected category score), **linear**, domain `[floor(min−2), ceil(max+2)]`, ~5 ticks |
| axis titles | mono, 10.5 px, `#5A6B85`, with direction arrows: `Cost per successful task (log) →` and `LiveBench overall ↑` (rotated −90°) |
| gridlines | horizontal `#E4E9F2`, vertical `#EEF1F7` (verticals deliberately fainter) |
| **marks** | circles r=5.5, `fill` = org colour, `stroke` = same colour, strokeWidth 2 |
| **series encoding** | colour = **organization**, from a 19-entry brand-ish palette (`OpenAI #10A37F`, `Google #EA4335`, `Anthropic #CC785C`, `DeepSeek #7C3AED`, `Alibaba/Qwen #F59E0B`, `Moonshot #EC4899`, `xAI #111827`, `Meta #4267B2`, `Mistral #FF7000`, `Cohere #39C5BB`, `AbacusAI #2F54EB`, `Arcee #9333EA`, `Z.AI #0EA5E9`, `Minimax #DB2777`, `NVIDIA #76B900`, `Xiaomi #FF6900`, `Microsoft #0078D4`), fallback `#7A8AA8` |
| **frontier** | dashed polyline `#2F54EB`, strokeWidth 2, `strokeDasharray="5 3"`, drawn through the Pareto set |
| **selection** | click a dot to *anchor* it: r→7, stroke `#14213D` at 2.5 px, label bolded to 11.5 px/800 |
| **"kill zone"** | the anchored model's dominated quadrant (down-and-right) fills with `rgba(20,33,61,0.08)` **plus a 45°-rotated 7 px hatch pattern**, bounded by two dashed `#5A6B85` leader lines, captioned `KILL ZONE · N models worse & pricier`. Dominated dots are recoloured `#C3CBDC` at 0.55 opacity. Click background or the dot again to clear. |
| **labels** | only frontier models are labelled (or just the anchor when one is set). A greedy collision-avoidance pass sorts frontier points by score descending, tries an up-and-left slot, then a below slot, then skips. Effort suffixes (`High Effort`, `xHigh`, `Max Thinking`, …) split onto a smaller bracketed second line via a regex, deliberately keeping bare `Max` (a tier, not an effort). |
| **halo** | every label uses `stroke="#FFFFFF" strokeWidth="3" paintOrder="stroke"` — a white outline so text stays legible over dots and gridlines. Cheap, very effective. |
| **tooltip** | dark `#14213D` card, 2-column mono grid: scope score, cost per successful task, `$/1M out`, `avg output tokens (scope)`, plus conditional lines `● value frontier` / `◻ kill-zone anchor · N dominated` / `◻ in X's kill zone`. Positioned in **percent of the viewBox** so it tracks the responsive SVG. |
| **legend** | flat row of org swatches (10 px dots) below the chart, mono 11.5 px |
| **attribution strip** | inside the chart card: pulse dot + `Source: LiveBench.AI — contamination-free LLM benchmark` + right-aligned mono `livebench.ai/#/insights`. This is screenshot-bait, deliberately — the chart carries its own provenance when it leaves the page. |

### 5.2 Ranked cost bars

`CostBars.jsx` — **HTML/CSS, not SVG**. One flex row per model: 150 px truncating name with an org
dot, a 16 px rounded track (`background: var(--ground)`), a fill bar in the org colour scaled to
`cost/max × 100%`, and a right-aligned mono `$0.000`. Sorted **cheapest first**. Default cohort is
the **top 20 by score** for the current scope, with an "Add a model…" `<select>` and a
`Clear added (n)` chip — so the chart starts readable and the user opts into the long tail. Tooltip
is fixed-positioned at the cursor with the same three fields.

### 5.3 Category radar

`CategoryRadar.jsx`, `viewBox="0 0 380 360"`, centre (190,180), R=115.

- 7 axes in `categories` key order, labelled with the 3-letter `catShort()` codes at R+18.
- 4 concentric polygon rings at 25/50/75/100% of R, stroke `#E4E9F2`, plus radial spokes.
- Scale is **absolute 0–100**, not normalized to the field — `R × score/100`.
- **2–3 models max**, palette `["#2F54EB", "#CC785C", "#12B886"]` assigned by selection order.
  Polygon `fillOpacity 0.13`, stroke 2, with r=2.5 vertex dots.
- Defaults to the **top 2 by overall**, and the default *tracks the model list* (`picked` stays
  `null` until the user touches it, so toggling finetunes updates the default rather than stranding
  it). Removed selections that fall out of the filter are dropped, not drawn blank.
- Chips below with a colour swatch and `×`; an `+ Add model…` select listing remaining models with
  their overall score inline (`GPT-5 High · 78.4`); at 3 it swaps to `Max 3 — remove one to add another`.

### 5.4 Release timeline

`ReleaseTimeline.jsx` — a horizontal rail, not a slider. 2 px track `--border-strong`, an accent
progress fill up to the selected index, 14 px dots absolutely positioned at `i/(n-1) × 100%`. Past
releases are filled accent; the active one is a white dot with a `--live` green ring
(`box-shadow: 0 0 0 4px rgba(18,185,134,.18)`). Ends are labelled `2024-06-24 · v1` and
`2026-06-25 · latest`. Full ARIA: `aria-current`, `aria-label="Release <date>"`.

### 5.5 The visual system in one paragraph

Light-only, no dark mode. Ground `#F6F8FC`, surface white, ink `#14213D`, muted `#5A6B85`, faint
`#8A99B5`, single accent blue `#2F54EB` with soft `#EAF0FF`, and a green `#12B886` reserved
exclusively for *liveness* (the pulsing brand dot, the active release ring, `● live`). Borders
`#E4E9F2` / `#D4DBEA`. Radius 10 px (8 small). Two shadows only. System sans for prose,
system mono (`ui-monospace, "SF Mono", …`) with `font-variant-numeric: tabular-nums` for **every
number, label, chip, and axis** — that mono/sans split is most of the "feel". Chips are
`border-radius: 999px`, mono 12 px, and fill solid accent when `aria-pressed="true"`. Section
headers are numbered `01` / `02` in faint mono. Explanatory footnotes are written as code comments
(`// select 1 category for its subtasks…`). Uppercase mono microlabels with wide letter-spacing
(0.08–0.16em) on eyebrows and KPI labels. Accessibility is real: `aria-pressed` on every chip,
`aria-label` on selects, `:focus-visible` outlines throughout, `role="img"` + `aria-label` on both
SVG charts.

---

## 6. What makes it credible

**Provenance.** Nav links straight to `Paper` (arXiv 2406.19314) and `Code ↗`
(github.com/livebench/livebench). The `#/details` page is the full ICLR-2025 write-up with the author
list, affiliations (Abacus.AI, NYU, Nvidia, UMD, USC), and the BibTeX. The footer names the sponsor
(`sponsored by Abacus.AI`) rather than hiding it. Every chart card carries its own source strip.

**Freshness.** A pulsing green dot and a `LIVE` tag in the brand; `● live` next to the latest
release; an explicit note when you time-travel (`Showing LiveBench-2025-04-25. Cost data is
published for the latest release only.`). The release timeline makes the cadence itself a visible
artifact — you can see the 11 releases and the gaps between them.

**Methodology in place, not buried.** The overall definition is restated in the page footer
(`Overall = mean of category averages · cost = cost per successful task`), in the column tooltip
with the full formula, and in the table's footnote line. The scatter subtitle defines the value
frontier and the kill zone inline. `compute.js` opens with *"Canonical derived metrics — every
surface (table, KPIs, charts) uses these so numbers never disagree."* — one module, imported by
table and both cost charts, is why the same model shows the same cost everywhere.

**Contamination controls.** The core claim: new questions released on a cadence, drawn from
recently-released datasets, arXiv papers, news articles, IMDb synopses, and math competitions "from
the past 12 months" — so training-set overlap is bounded by time. Second claim: **no LLM judge and
no human judge**, only objective ground truth, backed by a measured table showing GPT-4-Turbo
mis-judging correct answers at error rates of 0.103–0.460 on AMC/AIME/SMC/Zebra.

**Cadence, honestly stated and honestly drifted.** The paper says monthly; the current hero says
"refreshed every six months"; the actual `RELEASES` gaps are 1–7 months. They updated the copy to
match reality instead of keeping the aspirational number.

**Data hygiene as a shipped script.** `npm run check-data` cross-checks model keys across
`table` ↔ `cost` ↔ `modelLinks` for every release, warns on models that would be silently hidden,
and **exits non-zero** on a cost row with no score row. Corrections are committed in public with
explanatory messages (`correct grading-starvation false zeros (74.04 -> 76.76)`).

**What they refuse to claim.**

- No LLM-as-judge, no human preference, no crowd voting — and they argue *why* rather than just
  omitting it. They explicitly concede the cost: open-ended prompts ("write a travel guide to
  Hawaii") cannot be evaluated this way, and say so.
- **No cross-release comparison.** Selecting a release re-scopes everything; there is no trend line,
  no "score over time", no delta column. Given that both the task set and the model cohort change,
  this is the correct refusal.
- **No composite of quality and cost into a single ranked score.** Cost is a separate sortable
  column and a separate chart axis; the frontier is shown, but they never publish a "value score"
  that collapses the two.
- No confidence intervals, no error bars, no significance testing on score differences.
- No latency, throughput, uptime, or any runtime metric.
- No "which model should I use" recommendation. The kill zone is as prescriptive as they get, and
  it is a pure dominance statement, not an opinion.
- No claim that cost is *your* cost — the numbers are the eval run's cost at list prices at run time.
- `reasoner` and `openweight` exist in the data but are never turned into a leaderboard segment or
  an editorial narrative.

---

## 7. Licensing and attribution

This section contains a finding that needs an owner decision.

### 7.1 What actually exists upstream

| Artifact | Declared licence | Evidence |
| --- | --- | --- |
| `LiveBench/new-livebench` (the leaderboard app **and the published CSV/JSON data**) | **None.** No `LICENSE` file; GitHub API reports `"license": null`. Repo description: *"Redesigned LiveBench leaderboard (private preview) — deploys to new-livebench.ai"* | repo contents listing; `gh api repos/LiveBench/new-livebench` |
| `livebench/livebench` (the eval harness) | `LICENSE` is a composite: Apache-2.0 (inherited from FastChat) + MIT (inherited from LiveCodeBench). GitHub classifies it `NOASSERTION`. | `repos/livebench/livebench/contents/LICENSE` |
| The **benchmark dataset** | *"The benchmark suite is public as of June 12, 2024, distributed under the Apache License 2.0"* and *"There are no copyrights on the data."* | `docs/DATASHEET.md`, Dataset Distribution section |
| Author responsibility | *"We, the authors, bear all responsibility in case of violation of rights. The license of our repository is the Apache License 2.0."* | `docs/AUTHOR_RESPONSIBILITY.md` |
| The **website** (blog/details page) | *"This website is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License."* | `src/Blog.js`, footer |
| HuggingFace datasets (`livebench/reasoning`, `math`, `coding`, `language`, `data_analysis`, `instruction_following`, `model_answer`, `model_judgment`, `liveswebench`, `liveswebench-patches`) | **No licence declared** on any of the ten repos (`cardData.license` is null, no licence tags). | HF datasets API |
| Attribution requested | The ICLR-2025 BibTeX entry, exported as `bibtexEntry` from `src/constants.js` | `src/constants.js`, `#/details` |

**There is no CDLA licence anywhere in the LiveBench ecosystem.** A code search across
`livebench/livebench` for "CDLA" returns 0 results.

### 7.2 What TokenBench has committed to — and the gap

- `src/livebench/contracts.ts` hardcodes `licenseId: 'CDLA-Permissive-2.0'` as the only accepted
  value (`validateLiveBenchLicenseEvidence` throws on anything else).
- `workers/benchmark-ingest/src/livebench-refresh.ts` ships
  `ACCEPTED_LIVEBENCH_LICENSE = { licenseId: 'CDLA-Permissive-2.0', verificationUrl:
  'https://cdla.dev/permissive-2-0/', verifiedBy: 'TokenBench project owner', attributionText:
  'LiveBench · CDLA-Permissive-2.0' }`, and the D1 `pipeline_license_registry` gate only accepts
  that ID.
- Our own fixture README already flags this honestly: *"The pinned `new-livebench` commit does not
  itself declare a repository or package license. `CDLA-Permissive-2.0.txt` is therefore a test
  input for separately verified publication evidence, not a claim that the upstream repository made
  that declaration."* The parser is designed to require caller-supplied evidence and never infer —
  that design is right.
- **But `ACCEPTED_LIVEBENCH_LICENSE` is that caller, and it asserts CDLA-Permissive-2.0 with
  `verificationUrl` pointing at cdla.dev — i.e. at the licence text, not at any LiveBench statement
  adopting it.** If we publish `LiveBench · CDLA-Permissive-2.0` as visible attribution, we are
  attributing a licence choice to LiveBench that LiveBench has not made.

**Recommendation (owner decision required):**
1. Change the accepted licence to what upstream actually states. The defensible reading is
   **Apache-2.0 for the benchmark data** (DATASHEET + AUTHOR_RESPONSIBILITY), **CC-BY-SA-4.0 for
   website content**, and **unlicensed for `new-livebench`'s repo/derived CSVs** — which is the
   artifact we actually fetch. Widen `LiveBenchLicenseEvidence.licenseId` to a small union rather
   than a single literal, and require the `verificationUrl` to point at a **LiveBench-controlled
   URL** (the DATASHEET permalink at a pinned commit), not at the licence text's own site.
2. Treat the CC-BY-SA-4.0 site notice as the binding constraint on anything we copy from the
   *presentation* — copy, layout wording, the blog prose. Formulas and field names are facts, not
   expression; our own implementation of `(Σcost/Σnq)/score×100` is not a derivative work of their
   code. **Do not copy their CSS, their palette values, their microcopy, or their PDF/images.**
3. Attribute per our `docs/data-sources.md` pattern: a visible linked credit
   (`Scores from LiveBench` → the pinned commit or `livebench.ai`), plus the BibTeX citation on the
   methodology page. Label every derived number as TokenBench-derived, as we already do for
   frontiers and workload costs.
4. **`docs/data-sources.md` does not currently list LiveBench at all** — the "Permitted sources and
   visible attribution" table covers BenchLM, LMArena, OpenRouter, and LiteLLM only. LiveBench is
   the single largest source of task-level evidence in the pipeline and is missing from the
   published rights table. It must be added before anything LiveBench-derived ships publicly.
   (`src/data-sources/public-registry.ts` *does* list it, so the two artifacts disagree.)

---

## 8. Analysis for the TokenBench aggregation layer

### 8.1 What LiveBench does well that we should adopt directly

1. **Store raw, compute derived, from one module.** Nothing aggregate is ever persisted in the score
   file; `compute.js` is the single source of every derived number and is imported by the table and
   both cost charts. Our equivalent is `functions/_shared/livebench-ui-data.ts` — keep that
   discipline as we add LMArena, BenchLM, pricing and plans: one canonical derivation module per
   metric family, no per-surface arithmetic. It is *why* their cost number is identical in the
   table, the scatter, the bars, and the tooltip.
2. **Scope-aware metrics.** Every cost figure recomputes for the active scope (overall / category /
   task / multi-category union) rather than being a fixed per-model constant. This is the single
   biggest UX idea in the product: "cost per successful task" means something different when you
   only care about Agentic Coding, and it changes under you when you click a chip. Our
   Make-It-Yours workbench should do the same for its six axes.
3. **Cost per successful task as the headline economic metric.** `(cost per question ÷ score) × 100`
   is intelligible in one sentence, has real units, penalizes failure and partial credit, and is
   directly comparable across models. It is far better than "$/1M tokens" for the question users
   actually have. Adopt the formula *verbatim* (see §3.6) and make it the default cost column.
4. **The value frontier + kill zone.** The Pareto walk is 10 lines. The kill zone — click a model,
   grey out everything strictly worse and pricier, caption it with the count — is the most
   persuasive single interaction on the site because it turns a scatter into an argument without
   editorialising. Both are pure dominance facts, safe to publish. Steal the concept.
5. **Log-x for cost, linear-y for quality, with a fixed human-readable tick ladder.** Cost spans
   ~3 orders of magnitude (0.016 → 1.44 in the current release); log-x is mandatory and their fixed
   `$0.002 … $50` ladder reads far better than generated log ticks.
6. **Question-weighted aggregation, and saying so.** They anticipated the objection and documented
   the choice in a comment. Publish the weighting decision next to the number.
7. **Hide noise by default, opt back in.** Finetunes hidden behind a chip; effort variants collapsed
   to best-overall; cost bars default to the top-20 by score with an add-model select. Each default
   is justified in a comment, and the finetune toggle is owned by the page so table and charts can
   never disagree.
8. **Shareable URL state in the hash, defaults omitted.** `?cats=…&sort=…&dir=…&open=1&ft=1&org=…`
   via `replaceState`. Cheap, and every screenshot becomes a reproducible link.
9. **`—` for missing, never `0`, and drop rows we cannot describe.** Already our policy; they
   confirm it works. Their one weakness is encoding "no pricing" as `0.0` in the CSV — *we* should
   store null and give an unavailable reason, which our contract already supports.
10. **Rank-based top-5 shading over a continuous heatmap**, recomputed against the filtered set. It
    reads as "who wins this column" instead of "how absolutely good is this number", which is what
    a leaderboard column actually means.
11. **Provenance travelling with the artifact.** The attribution strip *inside* the chart card so a
    screenshot carries its source. Trivial to implement, disproportionately valuable.
12. **A data-integrity script in `npm test` territory.** `check_data.js` hard-fails on orphan cost
    rows. Our equivalents exist at the contract layer; a human-readable per-release integrity
    report would be a good addition.
13. **No chart library.** Three hand-built charts, ~500 lines, total control over labels, halos,
    collision avoidance, and theming. Given our design ambitions, this is the right call for us too.

### 8.2 What LiveBench deliberately does not do

| They don't | Why | Our move |
| --- | --- | --- |
| Cross-release trends / "score over time" | Task set **and** model cohort both change between releases; a trend line would be meaningless | **Respect the line, mostly.** A per-model trend across releases is defensible *only* for models present in both releases *and* only over the intersecting task set, labelled as a TokenBench-derived restricted comparison. Never draw a category or overall trend line across a taxonomy change. |
| A single quality×cost composite score | It would embed a value judgement about the exchange rate between points and dollars | **Fill it — carefully.** This is the core TokenBench proposition. Make the weighting *user-owned* (Make It Yours) rather than a house ranking, always show the inputs, and never publish a default composite as "the" ranking. |
| Any runtime metric (TTFT, tok/s, uptime) | Out of scope; they measure capability and eval spend | **Genuine gap, but we have no source.** `data-source-frontend-coverage-matrix` already records this as *source-does-not-publish*. Keep those controls disabled with an explicit reason until a revisioned runtime producer exists. Do not derive speed from `avg_output_tokens`. |
| Current market pricing | Their prices are the list prices **at run time**, frozen into the release | **Fill it — this is our biggest additive value.** Join OpenRouter live route pricing and show *both*: LiveBench's as-run economics (what the benchmark actually cost) and TokenBench's at-today's-prices recomputation (`Σ(tokens × current price)`), clearly separated. Never overwrite theirs with ours. |
| Subscription plans / human preference / other benchmarks | Single-benchmark product | **Fill it.** This is the whole aggregation layer. Keep each source as its own lens with its own attribution; never blend LiveBench scores with LMArena or BenchLM into one number. |
| Confidence intervals / significance | Not published | **Do not invent them.** We have `nq_<task>` per model, so a binomial-ish interval is *computable* — but scores carry partial credit, so a binomial CI would be wrong. Sample size is worth surfacing as context (`102 questions`); a derived CI is not. |
| Filter by reasoner, release date, context, params | Data exists (`reasoner` on 143 entries) or lives elsewhere | **Fill it.** `reasoner` is free to expose. Release date, context window and parameter counts come from our catalog join. |
| Explain that `overall` weights a 20-question task equally with a 102-question one | Their published definition, taken as given | **Disclose it.** Publish the question counts alongside the category scores and state the weighting. Offering an optional question-weighted overall as an explicitly TokenBench-derived alternative is honest and useful — as long as the LiveBench-labelled number stays theirs. |
| Surface the `grok-3` / `grok-3-thinking` hardcoded overall overrides | Legacy patch in `Averaging.js` | **Detect and quarantine.** Our re-derivation will disagree with the site for these two rows. Either replicate the override with a visible note, or exclude those configurations. Do not silently publish a different number under LiveBench's name. |

### 8.3 Highest-value join and derivation inputs

**Join keys, in order of reliability:**

| Rank | Field | Why | Caveat |
| --- | --- | --- | --- |
| 1 | `table.model` / `cost.model` / `modelLinks` key (incl. `variants[].rawName`) | The one exact, stable, byte-comparable identity. Everything else in the release hangs off it. Already our `configurationId` / `sourceModelId`. | Not a provider model ID. `claude-opus-4-5-20251101-thinking-64k-high-effort` encodes model + thinking budget + effort. Mapping to an OpenRouter `canonical_slug` needs a reviewed alias per configuration, not per model — and our alias maps are still empty by design. |
| 2 | `modelLinks[].variants[].rawName` → `baseName` | The *only* published statement of "these rows are the same model at different effort". Essential for not double-counting a family in a ranking, and for offering an effort dimension our catalog has no concept of. | Purely editorial upstream; no schema. |
| 3 | `modelLinks[].huggingface` (43 entries) | A resolvable global identifier for open-weight models — the strongest bridge to BenchLM/LMArena/catalog rows without name matching. | Only covers open weights. `getHuggingFaceUrl()`'s search-URL fallback is **not** an identifier; never join on it. |
| 4 | `modelLinks[].organization` | Series colour, filter facet, provider grouping. | Free text with real collisions (`Mistral`/`Mistral AI`, `Abacus.AI`/`AbacusAI`, `Alibaba`/`Qwen`, plus a literal `Stealth`). Needs a reviewed normalization map before it can be a join key; fine as a display facet today. |
| 5 | `modelLinks[].version` (156 entries) | Often the exact provider snapshot date (`2025-08-07`, `2024-11-20`) — a strong secondary discriminator when a display name is ambiguous. | Inconsistent format (`001`, `2024-08`, `2025-01-29`). |
| 6 | `categories_<date>.json` keys | Category identity for taxonomy mapping to our six axes. | Labels drift (`IF` vs `Instruction Following`); `Agentic Coding` only exists from 2025-05-30. Map per release, never globally. |
| 7 | `releaseId` + git commit + blob SHA | The real version pin. Releases mutate in place, so `releaseId` alone is **not** a snapshot identity. Our `releaseFingerprint()` already gets this right. | — |

**Derivation inputs, in order of value for joining quality with cost:**

| Rank | Field(s) | Derivations it unlocks |
| --- | --- | --- |
| 1 | `cost.<task>` (total USD) + `nq_<task>` | Everything economic: scope-aware `$/Q`, cost per successful task, `$/quality`, the value frontier, the kill zone, weighted workload cost, and any user-defined blend. The per-task grain is what makes it scope-aware — a single per-model cost number would be dead weight. |
| 2 | `table.<task>` raw scores | Category and overall averages, per-column ranks, the radar, custom weightings, category-restricted cost-per-success. Because they are raw, we can re-aggregate under *any* weighting the user chooses — which is precisely the aggregation layer's job. |
| 3 | `out_<task>` + `avg_output_tokens` + `avg_input_tokens` | **The bridge from LiveBench's frozen economics to live pricing.** With per-task mean output tokens and question counts we can recompute the whole eval at *today's* OpenRouter prices: `Σ_t nq_t × (avg_in × p_in + out_t × p_out) / 1e6`. This is the single highest-leverage derivation TokenBench can offer that LiveBench cannot — it turns a historical cost into a current one, and it is also the honest way to price a model whose `cost_*.csv` row is all zeros. |
| 4 | `input_price_per_million` / `output_price_per_million` | The as-run price basis. Diffing it against current catalog pricing yields a *price-drift* signal ("this benchmark cost was measured at $2/M out; it is $1.20/M today") — a credible, fully-sourced insight nobody else publishes. |
| 5 | `nq_<task>` on its own | Sample-size context per cell; detection of grading starvation (models missing questions); the correct denominator for any question-weighted alternative aggregate. |
| 6 | `openweight`, `reasoner`, `finetune{}` | Cohort segmentation and eligibility rules — open-weight-only frontiers, reasoner-vs-not cost comparison, excluding derivatives from headline ranks. `reasoner` is entirely unexploited upstream. |
| 7 | `RELEASES[]` | Cadence display, a release timeline, freshness claims, and the guard that stops us comparing across incompatible taxonomies. |

**One concrete first derivation to build:** for every LiveBench configuration, publish three cost
numbers side by side — (a) LiveBench's `cost_per_successful_task` **as published**, attributed to
LiveBench; (b) TokenBench's question-weighted cost-per-success, labelled TokenBench-derived; and
(c) a recomputed at-current-catalog-prices cost-per-success from `nq_*`, `out_*`, `avg_input_tokens`
and the joined OpenRouter route price, labelled TokenBench-derived with the catalog revision. Three
numbers, three provenances, one join. That is the whole thesis of the aggregation layer in a single
row, and every input for it already exists in the artifacts we ingest today.

---

## Appendix — source files read

Upstream, at `LiveBench/new-livebench@f6a8110e3cd64eb10fdbb857c9c29ca2545917ca`:
`README.md`, `package.json`, `scripts/check_data.js`, `src/index.js`, `src/App.js`, `src/Blog.js`,
`src/constants.js`, `src/index.css`, `src/lib/constants.js`, `src/lib/compute.js`,
`src/lib/useLeaderboardData.js`, `src/lib/urlState.js`, `src/Table/Averaging.js`,
`src/Table/modelLinks.js`, `src/Table/SortTable.js`, `src/Table/CategoryCheckboxes.js`,
`src/Table/CSVTable.jsx`, `src/components/{Leaderboard,MetricsStrip,ReleaseTimeline,FinetuneChip,Navbar}.jsx`,
`src/components/insights/{Insights,CostQualityScatter,CostBars,CategoryRadar}.jsx`,
all 11 `public/categories_*.json`, all 11 `public/table_*.csv`, `public/cost_2026_06_25.csv`.

Also: `livebench/livebench` `LICENSE`, `docs/DATASHEET.md`, `docs/MAINTENANCE_PLAN.md`,
`docs/AUTHOR_RESPONSIBILITY.md`; the HuggingFace datasets API for the ten `livebench/*` datasets.

TokenBench: `src/livebench/{parser,contracts}.ts`,
`workers/benchmark-ingest/src/{livebench-discovery,livebench-refresh}.ts`,
`workers/benchmark-ingest/test-fixtures/livebench/*`, `functions/_shared/livebench-ui-data.ts`,
`src/data-sources/public-registry.ts`, `docs/data-sources.md`,
`docs/rebuild-audit/data-source-frontend-coverage-matrix-2026-08-21.md`.
