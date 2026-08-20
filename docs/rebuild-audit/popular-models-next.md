# Next Popular Models route — implementation receipt

Date: 2026-08-20  
Branch: `codex/frontend-rebuild`  
Deployment: not performed or authorized

## Approval state

No route-level Next visual approval has been recorded. Exact immutable
three-section parity is implemented, but real HTTP/live data and the final
cross-page review remain required before approval. This receipt documents
implementation and verification boundaries only.

## Outcome

`/popular-models/` now resolves as a dynamic Next App Router page backed by the
strict `ui-data-contract/v1` leaderboard operation. It is a benchmark
workbench, not a hard-coded popularity ranking: every returned row keeps its
published rank and unavailable evidence is never made zero.

The exact immutable section sequence is implemented:

1. `01` **Leaderboard** — one desktop control row matching the immutable
   search/provider/access/visibility functions, a separate fixed category-tag
   row, and the complete compact master table (with equivalent mobile cards and
   expandable detail).
2. `02` **Insights** — exactly two charts, with published aggregate economics
   and selected-route evidence kept distinct.
3. `03` **Compare** — a full-content-width ordered two-to-four-model workspace,
   capability matrices, and exactly three economics charts before the handoff to
   `/compare/?models=...`.

Copy-link, PNG, and CSV actions remain attached to every result section.
Search, provider, open-weights, provider-column visibility, category, sort,
expand, and comparison controls retain their supported query state. The
finetune control remains visible but disabled because the current contract does
not publish that fact.

The rendered page, accessible labels, chart labels, metadata, and CSV headers
use neutral benchmark language. Dataset/provider-of-record and contract names
are deliberately not presented on the page; data-source credits will be handled
by a dedicated future route. The underlying provenance fields remain intact.

## Strict-v1 receipt and source scope

- The projector consumes only the strict leaderboard envelope. It retains the
  source release, release date/license/provenance, source total, and next cursor
  when those values are published.
- A published next cursor is shown as a receipt, not silently followed or
  discarded; a missing receipt remains unavailable.
- The workbench reserves the immutable `All` plus seven category controls and
  table slots: Reasoning, Coding, Agentic coding, Mathematics, Data analysis,
  Language, and Instruction following. Published category IDs/labels map into
  those slots; missing measurements stay visible as unavailable.
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
  visibly labeled with a source-neutral `Preview data` disclosure.
- `TOKENBENCH_UI_DATA_MODE=http` uses the production HTTP-only adapter. It
  requires the configured v1 service and has no design-evidence fallback.
- A production build with evidence mode returns an explicit unconfigured state;
  loader errors stay visible instead of falling back to fixtures.

## Responsive and accessibility check

- Local design-evidence rendering was checked at 390×844 and 1691×1324 in light
  and dark themes. The desktop table fits the 1280px content region without
  internal horizontal scroll; the mobile breakpoint renders equivalent cards
  and a contained horizontal category strip with no page-level overflow.
- The checked DOM exposed a skip link, named regions/forms/groups, labeled
  search/select/combobox controls, live result state, labeled Chart.js images,
  focusable overflow regions, and expandable source evidence.
- Search reduced three rows to one and preserved its query state. Category and
  sort controls changed the expected columns/order, row disclosure expanded,
  and the provider picker opened and closed correctly. The ordered tray added
  and removed `gamma`, updating the canonical comparison query and returning to
  `alpha,beta`.
- This is not an assistive-technology, automated accessibility, touch-target, or
  production-payload certification. Those checks remain part of the production
  review gate.

## Verification receipt

- Focused Popular Models projection/adapter run — 2 files and 24 tests passed.
- Shared result-action Node test — 5 tests passed; its `.node-test.ts` filename
  intentionally keeps the Next-only alias boundary out of root Vitest discovery.
- Chart accent/frontier Node test — 3 tests passed.
- Repository-wide Vitest — 192 files and 2,102 tests passed.
- Next ESLint: passed.
- Next production build: passed; `/popular-models/` is request-time dynamic.
- Impeccable layout detector: no findings on the changed Popular Models route,
  page, charts, and projection files.
- Final browser parity review: passed at 1691px desktop and 390px mobile with all
  13 default master-table columns, eight category controls, five Chart.js
  canvases, a full-width comparison workspace, no page-level overflow, and no
  rendered source/contract names.
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
