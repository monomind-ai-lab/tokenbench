# Checkpoint 4 — strict data wiring and review boundary

Date: 2026-08-21
Branch: `codex/frontend-rebuild`
Deployment: not performed

## Outcome

The Next rebuild no longer uses the hard-coded model catalog, synthetic runtime
series, or browser-side subscription price fixtures as factual data. The page
families below now enter through validated, environment-selected server
boundaries:

- Home;
- `/models/`, `/model-profile/`, `/models/[slug]/`, and `/model-lifecycle/`;
- `/compare/` and `/compare/[pair]/`;
- `/popular-models/` and the approved leaderboard family;
- `/subscribe-vs-api/`;
- `/make-it-yours/`;
- `/llm-price-performance/`.

Local evidence mode is development-only and accepts only the retained exact
contract requests. Production mode is HTTP-only. A missing producer, request
mismatch, missing source fact, or unavailable field remains visible as
unavailable; no page silently switches to evidence, a fixture catalog, or a
similarly named model.

## Model and comparison surfaces

- The model directory requests the exact three-row retained receipt in local
  evidence mode and up to the v1 maximum of 100 rows in production.
- The workbench retains its audited frontier/log-scale controls, ordered 2–4
  model tray, search/provider/access/sort controls, card/list views, result
  actions, lifecycle context, and observation timeline.
- Pareto membership is derived only from records with both an accepted
  capability value and accepted price. Missing values are excluded, never
  treated as zero.
- Profile and comparison routes preserve the exact requested slug order. The
  server does not replace an unavailable slug with a catalog neighbor.
- Runtime charts and fields render only independently published observations.

## Lifecycle source and producer

The catalog ingestion path now retains the official endpoint
`expiration_date` field as a validated calendar date. Migration
`0015_catalog_model_expiration.sql` stores it alongside the revisioned model
offer and adds a revision/date index.

`GET /api/benchmarks/lifecycle` reads only the active published catalog
revision and projects expiration events into strict `ui-data-contract/v1`:

- a future date inside the requested horizon becomes `sunset_scheduled`;
- a date at or before `asOf`, bounded to the same historical horizon, becomes
  `retired`;
- a missing replacement stays unavailable because the catalog does not publish
  a successor;
- an absent source returns a contract-valid 404 unavailable envelope;
- a D1/schema/projection fault returns 503 instead of masquerading as a cold
  source.

Local retained evidence keeps its exact accepted 30-day request. Production
uses a server-generated canonical UTC `asOf` and a 90-day horizon.

## Subscription catalog and calculation boundary

The approved page keeps all six sections, inputs, charts/tables, URL state, and
copy/PNG/CSV/print actions. Its provider scope is exactly the seven requested
rows: OpenAI, Anthropic, Google, xAI, Z.AI, Perplexity, and Microsoft.

The strict catalog response publishes only reviewed plan, price, and usage-limit
facts. Providers without a reviewed row remain present as unavailable slots.
Plans without an exact model-to-route binding cannot produce a cost result.
Cache-read or cache-write pricing is never copied from the standard input rate;
a positive allocation requires its own reviewed rate.

For an exact direct offer, the producer emits the established
`<modelSlug>-direct` binding and validates the selected provider, plan,
supported model, route, workload, and cache allocation before calculating. A
source-unknown cache rate is permitted only when its allocated token count is
zero, and the absent zero-token line is omitted rather than emitted with a fake
zero rate. Every evidence/HTTP response must echo the exact requested catalog
or calculate operation before the page accepts it.

## Other decision routes

- Popular Models and all approved leaderboard children continue to use the
  strict rankings operation and retain published rank, taxonomy, pagination,
  task economics, and unavailable route/runtime fields.
- Make It Yours uses the accepted custom-ranking request in local evidence mode
  and production HTTP only. Its required six-axis/SLA/cost output stays
  unavailable when the producer cannot satisfy that exact matrix.
- Price-performance accepts its route-specific base URL or the shared strict
  data base URL. The canonical validated endpoint currently parses 73 points.

## Known production gates

- The canonical hosted rankings endpoint currently rejects custom ranking POST
  with 405, so production Make It Yours remains honestly unavailable.
- Catalog/runtime identity joins are still required before source-only
  benchmark configurations can publish complete route price, TTFT, throughput,
  and uptime facts.
- No live migration, ingestion run, endpoint activation, deployment, or
  infrastructure change was authorized or performed in this checkpoint.
- A real-data cross-page visual/interaction review remains mandatory after the
  new migrations and producers are deployed by separate authorization.

## Verification receipt

- Focused checkpoint-4 adapters/projectors/endpoints/ingesters: 93 tests passed
  (17 Node tests and 76 Vitest tests).
- Repository-wide regression: 195 files and 2,119 tests passed.
- Root TypeScript and both worker TypeScript projects passed.
- Next ESLint and production build passed; all decision routes are request-time
  dynamic where data requires it.
- Project-local Impeccable detector returned `[]` for the eight data-wired UI
  components.
- `git diff --check` passed.

Local review URLs:

- `http://127.0.0.1:3100/`
- `http://127.0.0.1:3100/models/`
- `http://127.0.0.1:3100/model-profile/?model=alpha`
- `http://127.0.0.1:3100/model-lifecycle/`
- `http://127.0.0.1:3100/compare/?models=alpha%2Cbeta%2Cgamma`
- `http://127.0.0.1:3100/subscribe-vs-api/`
- `http://127.0.0.1:3100/make-it-yours/`
- `http://127.0.0.1:3100/llm-price-performance/`
