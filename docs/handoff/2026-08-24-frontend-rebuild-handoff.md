# TokenBench frontend rebuild handoff — 2026-08-24

For continuing the frontend rebuild in the Claude desktop app. The backend data
stream is the subject of this document; the design is deliberately not.

Branch `codex/frontend-rebuild` at `6e64aa4`, pushed. Production branch `main`
at `352428e`, pushed and deployed.

---

## 1. What changed in the data stream today

All of this is live on `https://tokenbench.monomind.one` unless marked otherwise.

| Change | Effect on the frontend |
| --- | --- |
| Open-weight `$0` sentinel dropped (twice — see §5) | Price fields are `null` where no hosted price is published, instead of a verified `$0`. Never divide by a price without a null check. |
| Catalog freshness is source-kind aware | `/api/catalog` `freshness.status` now reflects evidence age, not publication recency. `manual_manifest` sources get 30 days, `official_*` 36 hours. |
| Manual manifests carry real verification dates | `provenance[].observedAt` is when a human checked the price, not when the cycle ran. |
| JSON 404 catch-all | Unmatched `/api/*` returns a JSON 404. `response.ok` is now safe to branch on. |
| LiveBench licence corrected to Apache-2.0 | Attribution must say **LiveBench · Apache-2.0** and state that TokenBench re-aggregated and re-priced the evidence. |
| `data.cohort` on the model directory | Tells you which population you received. **Read this** — see §3. |
| Quality and preference split | `overallScore` is 0-100 only; `preferenceRating` is Bradley-Terry. **Never put them in one column.** See §2. |

Not deployed: everything on `codex/frontend-rebuild` that is not on `main`. That
branch is 141 commits ahead and its worker config needs migrations 0013-0019,
none of which are applied to production D1.

---

## 2. The two score scales — the rule that matters most

`summary.overallScore` used to hold BenchLM composites (~49-61) and LMArena
Bradley-Terry ratings (~850-1620) in one unlabelled field. It is now split:

- `overallScore` — 0-100 benchmark composite. `null` for a model rated only by
  human preference.
- `preferenceRating` — Bradley-Terry rating, its own scale.
- `overallRank` — scale-free, shared by both.

**Rules for the UI**

1. Never sort, chart, threshold or average across the two. One axis, one scale.
2. Never rescale a rating into 0-100. Bradley-Terry has no meaningful zero, so a
   linear projection invents ratios and moves whenever the field changes.
3. A model with `overallScore: null` and a populated `preferenceRating` is not
   missing data — it has a different kind of measurement. Say so; do not render
   a bare dash.
4. Approved plan: explain each scale in a tooltip, with the detail on a
   dedicated **Methods** page. Neither exists yet; both are frontend work.

Preference and capability can legitimately disagree. The split exists so a
surface can show that rather than average it away.

---

## 3. Cohorts — do not promise "4,658 models"

`/api/benchmarks/models` answers an unfiltered request from a curated weekly
top-100, not the catalogue. At `limit=100` its cursor goes null, which used to be
indistinguishable from the end of the catalogue.

Every response now carries `data.cohort`:

```json
{ "kind": "weekly-popular", "size": 100, "catalogueQuery": "status=all" }
```

`kind: "catalogue"` means the full directory. Absent means unknown — never treat
that as `catalogue`.

**Honest cohort sizes**, from a full census of all 4,674 profiles:

```
evidenceStatus:  source_only  4,438   (a name, no evidence)
                 estimated      116
                 supported      104
metricCategories: overall 874 · coding 119 · agentic 108 · reasoning 35
```

A compare picker may list 4,658 names. Only ~104 carry supported evidence and
~874 have any overall score. Do not build a headline on the larger number.

---

## 4. Free value sitting in production

**`/api/benchmarks` is live, 1.03 MB, and the app never calls it.** It contains:

- `homeDecisionSnapshot` — leader tiles already marked `status: "ready"`, with
  rank, name, provider, score, price and context window.
- `decisionPicks` — 6 curated leader lists, labelled and typed.
- `compareDirectory` — 4,658 models with per-model `metricCategories`.
- 14 lens descriptors, 36 indexable pairs, 4 source attributions.

Wiring this one endpoint is the highest-value change available.

Other fields fetched today and rendered nowhere:

- `categories[].score` is 453/453 populated while `radar[].percentile` is
  262/666 — and the UI renders the percentile. That single choice causes most
  visible dashes. **Prefer score; fall back to percentile.**
- `summary.coverage` (100/100) and `identity.releaseDate` (99/100).
- LMArena `voteCount` (403 to 11.1M) and confidence intervals (200/200) — the
  only uncertainty measure anywhere in the system.
- `profile.comparisons[]` — 663 rows, 71 indexable pairs.

Full detail: `docs/rebuild-audit/frontend-field-consumption-2026-08-23.md`.

---

## 5. Known-broken, so you do not chase them

1. **`/make-it-yours/` cannot work yet.** The LiveBench upstream release fails
   parsing (`deepseek-v4-flash has no modelLinks metadata`), and separately
   `projectModel` requires all seven category slots to have a finite percentile
   while `data-analysis` has no producer anywhere.
2. **94 profile pages still show `$0`.** The parser fix is deployed and correct,
   but all cycles mint the same revision — it hashes upstream source bytes, and
   only our parser changed. Profile snapshots are immutable per revision, so a
   parser-only fix cannot reach them. Needs a revision-bump path.
3. **Runtime fields have no source.** TTFT, throughput and uptime are sourceless.
   Home's TTFT/throughput columns and the low-latency/high-throughput filters
   return zero rows by construction. Cut them or leave them explicitly empty.
4. **The cross-source join is exactly zero.** 4,557 models have one source, 0
   have two. `maxOutputTokens`, modalities and `supportedParameters` exist in the
   catalog (374/471, 100% of OpenRouter routes) but never reach a scored model.
   Punctuation normalisation alone would take the join from 11 to 34 of 100.
5. **`/popular-models/` ships an invented `costPerSuccessfulTask`** from
   `src/frontend/popular-models/fixtures.ts`, which is explicitly labelled
   `productionData: false`. LiveBench publishes the real figure. Do not carry
   this fixture into the rebuild.

---

## 6. Conventions the rebuild should adopt

**One unavailable-state component.** Three vocabularies exist today —
`DataValueText` (447 live, fully annotated), a local `MISSING_VALUE = "-"`
(~2,200, naked), and `routeEvidenceText` (~15, naked). About **83% of
unavailable states carry no reason, tooltip or screen-reader text**. Collapse to
one annotated component before building surfaces on it.

- `-` for a missing scalar, `n/a` for a missing categorical status.
- Both carry a reason in `title` and screen-reader text.
- Absence is never coerced to `0`, `free`, `pass`, `fail` or `Outside SLA`.

**Attribution on a dedicated page**, not beside every value — approved. No
licence here requires per-value notice. Apache-2.0 additionally requires stating
that changes were made; every LiveBench surface must say TokenBench
re-aggregated and re-priced the evidence.

**Every measured number** renders `font-mono tabular-nums`.

**Model names are navigation.** Use the shared `ModelLink`.

Design authority is `DESIGN.md` (corrected 2026-08-23). Note the app is
**dark-default** — the theme bootstrap resolves anything but a stored `light` to
dark.

---

## 7. The aggregation thesis, for feature work

LiveBench publishes per model × task: `nq`, `avg_input_tokens`, `out_<task>`,
and the price it assumed. That separates **workload** (a model property) from
**price** (a market property that moves weekly).

> TokenBench = measured quality × token workload × today's market price.

LiveBench freezes cost at benchmark time and explicitly refuses quality×cost
composites. An aggregator can recompute continuously. Every input already exists
in artifacts we ingest and currently discard.

Derived points this unlocks, gated on the LiveBench parse fix and the identity
join: live cost-per-successful-task, verbosity index, price drift since
benchmark, route arbitrage, subscription break-even, and successor tracking via
BenchLM's `supersedesModelKey` (56 edges, already fetched weekly).

One correction to make first: `functions/_shared/livebench-ui-data.ts` computes
cost-per-successful-task as `Σcost / Σ(nq × score/100)`; LiveBench uses
`($/Q ÷ score) × 100` where `$/Q = Σcost/Σnq`. Ours runs ~5% low and reorders 7
of 45 model ranks.

---

## 8. Reference documents

- `docs/rebuild-audit/data-stream-field-census-2026-08-23.md` — every field, fill
  rate over full populations, and why each blank is blank
- `docs/rebuild-audit/source-adapter-loss-audit-2026-08-23.md` — what each source
  publishes vs what we keep; ranked list of uncaptured fields
- `docs/rebuild-audit/frontend-field-consumption-2026-08-23.md` — what the app
  reads, what it renders, what it wastes
- `docs/rebuild-audit/livebench-reference-study-2026-08-23.md` — LiveBench data
  model, taxonomy, cost method, columns, sorts, filters and chart specifications
- `docs/handoff/2026-08-23-codex-handoff.md` — prior state
- `DESIGN.md`, `docs/rebuild-audit/PRESERVATION_CONTRACT.md`, `docs/data-sources.md`

## 9. Environments

- Production: `https://tokenbench.monomind.one` (legacy Vite app + Pages
  Functions API). Pages project `tokenbench`; production is not auto-promoted
  from `main`.
- Next preview: `https://tokenbench-next.1tm-notion.workers.dev` — the rebuild
  on Cloudflare Workers via `@opennextjs/cloudflare`. Caveats: `unstable_cache`
  writes are no-ops, and Ajv is replaced by build-time precompiled validators.
- Local Next: `cd apps/web && npm run build && TOKENBENCH_UI_DATA_MODE=http
  TOKENBENCH_UI_DATA_BASE_URL=https://tokenbench.monomind.one npm run start --
  --hostname 127.0.0.1 --port 3101`
- **Never run `npm run build` at the repository root** — it rewrites tracked
  `index.html` and scatters generated HTML through the source tree.
