# Next Popular Models route — implementation receipt

Date: 2026-08-19  
Branch: `codex/frontend-rebuild`  
Deployment: not performed or authorized

## Approval state

No route-level Next visual approval has been recorded. Exact immutable
three-section parity is implemented, but real HTTP/live data and the final
cross-page review remain required before approval. This receipt documents
implementation and verification boundaries only.

## Outcome

`/popular-models/` now resolves as a dynamic Next App Router page backed by the
strict `ui-data-contract/v1` leaderboard operation. It is a LiveBench capability
workbench, not a hard-coded popularity ranking: every returned source row is
kept in published rank order and unavailable source evidence is never made zero.

The exact immutable section sequence is implemented:

1. `01` **Leaderboard** — hero/strict-v1 receipt, source-scope statement,
   controls, and the master evidence table (with equivalent mobile cards and
   expanded source detail).
2. `02` **Insights** — exactly two source-aware charts, with published
   aggregate economics and selected-route evidence kept distinct.
3. `03` **Compare** — ordered two-to-four-model comparison, source
   radar/matrices, and exactly three economics charts before the handoff to
   `/compare/?models=...`.

Copy-link, PNG, and CSV actions remain attached to the visible result surface.
Search, provider, access, dynamic category, sort, reset, and card/list controls
retain their supported query state.

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

- Focused Popular Models projection/adapter run — 2 files and 21 tests passed.
- Shared result-action Node test — 5 tests passed; its `.node-test.ts` filename
  intentionally keeps the Next-only alias boundary out of root Vitest discovery.
- Chart accent/frontier Node test — 3 tests passed.
- Repository-wide Vitest — 192 files and 2,099 tests passed.
- Next ESLint: passed.
- Next production build: passed; `/popular-models/` is request-time dynamic.
- Final browser parity review: passed at desktop and true mobile-card widths with
  five Chart.js canvases, no page-level overflow, and no current app-origin error.
- No deployment, endpoint activation, or live infrastructure change occurred.

## Remaining dependencies and next gate

1. Wire a real HTTP LiveBench ranking response and exercise the receipt,
   taxonomy, total/cursor, unavailable selected-route/runtime/lifecycle states,
   and charts against it.
2. Join reviewed catalog identities, selected-route pricing, runtime observations,
   and lifecycle data independently; do not infer them from LiveBench rows.
3. Add an app-level Next test configuration for the action component and run
   end-to-end copy/PNG/CSV checks.
4. After real HTTP/live-data wiring, run a mandatory final cross-page review
   across `/popular-models/`, leaderboard routes, models/profiles, compare, and
   lifecycle before changing route-level approval status.
