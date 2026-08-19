# Next leaderboard child routes — implementation receipt

Date: 2026-08-19  
Branch: `codex/frontend-rebuild`  
Deployment: not performed or authorized

## Design approval

Daren approved the shared leaderboard child-route design on 2026-08-19. The
approval covers the desktop and mobile visual system represented by the saved
previews, while retaining the existing source-truth and unavailable-state rules.

## Outcome

All 14 immutable leaderboard child paths now resolve through one Next.js App
Router catch-all. The directory remains a distinct decision-method index. Each
child preserves the immutable section sequence:

1. Route hero and result actions.
2. Route-specific Chart.js evidence visualization when the exact metric exists.
3. URL-backed filter, sort, and workload-profile controls.
4. Responsive result field: semantic table on desktop and equivalent ordered
   cards on mobile.
5. Evidence receipt, methodology, and unavailable-data explanation.
6. All related leaderboard links.
7. MonoMind CTA and the global marketing footer.

Every result surface retains copy-link, PNG, and CSV export controls. Card/list,
dark/light theme, searchable two-column languages, trailing-slash routes, and
the latest global navigation/footer are present.

## Data boundary decision

- Server pages call the accepted `ui-data-contract/v1` rankings adapter.
- `TOKENBENCH_UI_DATA_MODE=http` uses the production HTTP-only composition and
  requires `TOKENBENCH_UI_DATA_BASE_URL`.
- `TOKENBENCH_UI_DATA_MODE=evidence` is accepted only during local development;
  the page labels it `Design evidence` and production builds reject it.
- There is no automatic fixture fallback.
- LiveBench benchmark-only rows with `selectedRoute: null` retain capability
  evidence while route price, context, and runtime stay unavailable.
- Overall and exact LiveBench categories render from published evidence.
- Value and pricing/context render only when a verified selected route exists.
- LMArena human-preference and media routes remain complete, explicit
  unavailable-state pages until that source projection is implemented.

## Query semantics

- Defaults remain route-specific: overall/capability uses `score-desc`, value
  uses `pareto-score-desc`, pricing uses `price-asc`, and source-ranked media or
  preference uses `rank-asc`.
- Default profile/sort values are implicit and omitted from copied canonical
  URLs; non-default search/provider/access/profile/sort/view state is retained.
- Input-heavy is 75/25 input/output, balanced 50/50, and output-heavy 25/75.
- Missing measurements are excluded from charts, never plotted as zero.

## Verification receipt

- Focused Vitest: 2 files, 12 tests passed.
- Repository Vitest: 191 files, 2,087 tests passed.
- Root TypeScript: passed.
- Next ESLint: passed.
- Next production build: passed; the leaderboard catch-all is request-time
  dynamic.
- HTTP route pass: all 14 published trailing-slash routes returned 200; an
  unknown child returned 404.
- Browser pass: desktop 1440×1000 and mobile 390×844; no horizontal overflow;
  desktop table hidden on mobile; all mobile header controls are 44×44.
- Interactions exercised: search/filter reset, card/list state, value profile
  price recalculation, theme toggle, language search, copy link, PNG, and CSV.
- Source-unavailable LMArena route rendered no fabricated chart or rows.
- Impeccable detector: zero findings on the changed leaderboard targets.

## Approval previews

- `docs/design-previews/leaderboard-overall-desktop.png`
- `docs/design-previews/leaderboard-overall-mobile.png`
