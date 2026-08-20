# Checkpoint 3 — remaining Next route coverage

Date: 2026-08-21
Branch: `codex/frontend-rebuild`
Deployment: not performed

## Outcome

The four route families that were still absent from the Next.js app now have
dedicated server boundaries and responsive route implementations:

- `/models/[slug]/`
- `/compare/[pair]/`
- `/make-it-yours/`
- `/llm-price-performance/`

The Next production build includes all four as dynamic routes. The immutable
deployment remains the structural authority; these pages retain explicit empty,
invalid, unavailable, and loading states rather than substituting local facts.

## Route behavior

### Dynamic model profile

- Validates the requested slug without choosing a similarly named fallback.
- Loads the strict profile operation through the environment-selected data
  adapter.
- Preserves identity, capability, pricing, runtime, lifecycle, comparison links,
  provenance timestamps, and unavailable slots.
- Retained local evidence renders at `/models/alpha/`; production remains HTTP
  only.

### Dynamic pair comparison

- Accepts exactly two distinct route-safe slugs in `left-vs-right` order.
- Retains canonical `models=left,right` query state and flags mismatches.
- Preserves the requested pair even when one or both records are unavailable.
- The retained comparison receipt is for a different exact ordered request, so
  the two-model local example remains honestly unavailable; no fixture fallback
  or request reshaping was introduced.

### Make It Yours

- Preserves the six exact ranking axes, provider/access/SLA filters, URL state,
  weighted ranking and SLA/cost charts, semantic tables and mobile cards,
  ordered two-to-four-model tray, and copy/PNG/CSV actions.
- Sends the accepted custom-ranking query unchanged; missing axes or facts remain
  unavailable instead of using a composite-score fallback.
- Retained design evidence is visibly non-production and is disabled in
  production builds.

### LLM price performance

- Preserves URL-backed benchmark lane, creator, status, cost-basis, and price
  range filters; Pareto visualization and detail dialog; table/card result
  views; evidence receipt; and share/export actions.
- Keeps zero prices distinct from missing values and excludes unavailable facts
  from finite score-per-dollar calculations.
- Uses a separately configured validated endpoint. With no endpoint configured,
  the complete page renders its explicit unavailable state for review instead
  of manufacturing preview rows.

## Visible source naming

Per the current UI direction, source organizations are not named on these route
surfaces. The UI uses neutral evidence-role labels while retaining raw
provenance in the data boundary for the future credits/source page.

## Data modes

- `TOKENBENCH_UI_DATA_MODE=evidence` is development-only retained evidence for
  profile, pair, and custom-ranking checks.
- `TOKENBENCH_UI_DATA_MODE=http` is the production-capable strict contract path.
- Price performance has its own explicit preview/production selector and never
  treats preview mode as a production fallback.
- Missing or invalid configuration produces an unavailable page state, not
  synthetic values.

## Verification receipt

- Root TypeScript: passed.
- Next ESLint: passed.
- Next production build: passed; route manifest contains all four route families.
- Route evidence projector: 3/3 tests passed.
- Make It Yours and price-performance projectors: 5/5 tests passed with the
  Next TypeScript path mapping.
- Project-local Impeccable detector: zero findings across the seven new UI
  components.
- Local HTTP checks on port 3100: all four routes returned 200.

Local review URLs:

- `http://127.0.0.1:3100/models/alpha/`
- `http://127.0.0.1:3100/compare/alpha-vs-beta/?models=alpha%2Cbeta`
- `http://127.0.0.1:3100/make-it-yours/`
- `http://127.0.0.1:3100/llm-price-performance/`

## Open gate

This checkpoint establishes route and interaction coverage. It does not approve
the designs and does not claim production data readiness. Checkpoint 4 must wire
and validate the production adapters/endpoints, then repeat the mandatory
cross-page review with real published data.
