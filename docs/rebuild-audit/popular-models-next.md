# Next Popular Models route — implementation receipt

Date: 2026-08-19  
Branch: `codex/frontend-rebuild`  
Deployment: not performed or authorized

## Approval state

No route-level Next visual approval has been recorded. This receipt documents
implementation and verification boundaries only.

## Outcome

`/popular-models/` now resolves as a dynamic Next App Router page backed by the
strict `ui-data-contract/v1` leaderboard operation. It is a LiveBench capability
workbench, not a hard-coded popularity ranking: every returned source row is
kept in published rank order and unavailable source evidence is never made zero.

The route preserves:

1. Hero, strict-v1 receipt, and a source-scope statement.
2. Search, provider, access, dynamic category, sort, reset, and card/list
   controls with retained query state.
3. Desktop evidence table and equivalent mobile cards, each with expanded source
   details.
4. Source-published aggregate-economics and selected-route Chart.js views.
5. Ordered inline two-to-four-model comparison, source radar/matrices, and a
   handoff to `/compare/?models=...`.
6. Copy-link, PNG, and CSV actions for the visible result surface.

## Strict-v1 receipt and source scope

- The projector consumes only the strict leaderboard envelope. It retains the
  source release, release date/license/provenance, source total, and next cursor
  when those values are published.
- A published next cursor is shown as a receipt, not silently followed or
  discarded; a missing receipt remains unavailable.
- The workbench derives category chips from current source radar axes and
  displays the published taxonomy/task list separately. It does not freeze a
  historical category list.
- `sourceRank` wins over a derived rank. The page does not relabel the result as
  a popularity list or apply a client-side top-N cutoff.

## Economics and evidence boundaries

- Each model keeps source-published aggregate cost per successful evaluation,
  mean output tokens, and Pareto state. The expanded detail preserves every
  published task row: score, questions, evaluation cost, input/output price,
  equivalent successes, cost per success, and mean input/output tokens.
- Selected-route pricing is separate evidence. The displayed balanced value is
  the explicit 50/50 arithmetic view of published input and output price; it is
  not LiveBench task economics and never fills a missing source value.
- Runtime is never projected as a performance metric: an unavailable reason is
  shown when absent, and a present source remains explicitly not projected. No
  TTFT, throughput, or uptime is inferred from a benchmark row.
- Lifecycle is deliberately not projected into this leaderboard view. It stays
  a separate lifecycle-source dependency rather than becoming an invented
  current/retired state.

## Data-mode boundary

- `TOKENBENCH_UI_DATA_MODE=evidence` is permitted only outside production and is
  visibly labeled `Design-only evidence · not live data`.
- `TOKENBENCH_UI_DATA_MODE=http` uses the production HTTP-only adapter. It
  requires the configured v1 service and has no design-evidence fallback.
- A production build with evidence mode returns an explicit unconfigured state;
  loader errors stay visible instead of falling back to fixtures.

## Responsive and accessibility check

- Local design-evidence rendering was checked at 390×844 and 1280×720. The
  desktop evidence table was hidden at the mobile breakpoint while equivalent
  model cards rendered; the table rendered on desktop.
- The checked DOM exposed a skip link, named regions/forms/groups, labeled
  search/select/combobox controls, live result state, labeled Chart.js images,
  focusable overflow regions, and expandable source evidence.
- Search reduced three rows to one and preserved its query state. Reset restored
  the set; the ordered tray retained `alpha,beta,gamma` and linked to the matching
  comparison URL.
- This is not an assistive-technology, automated accessibility, touch-target, or
  production-payload certification. Those checks remain part of the production
  review gate.

## Verification receipt

- Focused contract/adapter transport run — 4 files and 24 tests passed.
- Shared result-action Node test — 4 tests passed; its `.node-test.ts` filename
  intentionally keeps the Next-only alias boundary out of root Vitest discovery.
- Repository-wide Vitest — 192 files and 2,093 tests passed.
- Next ESLint: passed.
- Next production build: passed; `/popular-models/` is request-time dynamic.
- No deployment, endpoint activation, or live infrastructure change occurred.

## Remaining dependencies and next gate

1. Wire a real HTTP LiveBench ranking response and exercise the receipt,
   taxonomy, total/cursor, unavailable selected-route/runtime/lifecycle states,
   and charts against it.
2. Join reviewed catalog identities, selected-route pricing, runtime observations,
   and lifecycle data independently; do not infer them from LiveBench rows.
3. Add an app-level Next test configuration for the action component and run
   end-to-end copy/PNG/CSV checks.
4. After real production wiring, run a mandatory full cross-page review across
   `/popular-models/`, leaderboard routes, models/profiles, compare, and lifecycle
   before changing route-level approval status.
