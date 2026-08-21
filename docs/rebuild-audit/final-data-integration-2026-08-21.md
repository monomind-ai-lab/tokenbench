# Final data integration receipt — 2026-08-21

Status: ready for final human review on the local Next.js production preview. This receipt describes the source-backed review configuration only; it does not authorize or record a deployment.

## Operating boundary

- Review mode: `TOKENBENCH_UI_DATA_MODE=http`.
- Published source origin: `https://tokenbench.monomind.one`.
- Local review origin: `http://127.0.0.1:3101`.
- Retained contract evidence is never a production fallback.
- Current published v1 media endpoints are not yet deployed at the canonical origin. The Next server therefore validates the currently published directory, profile, catalog, per-key leaderboard, price-performance, and immutable benchmark-artifact contracts at a compatibility boundary, then projects them into the existing v1 page types.
- Joins use exact canonical slug, model ID, source model ID, route ID, and catalog revision. Display-name matching is not used.
- `null` and unavailable evidence never become zero.

## Source and route matrix

| Surface | Reviewed source | Verified local result |
|---|---|---|
| Home | weekly model directory, exact top-model profiles, reviewed provider catalog | ranked decision snapshot, route prices, two-axis capability comparison when only two shared axes exist, and an exact default subscription calculation |
| Models | weekly directory plus exact benchmark rows and per-model profiles | 143 visible evidence records; profile pages retain full published radar and route facts |
| Model profile / pair comparison | exact `/api/benchmarks/models/:slug` profiles | requested identity, access, capability axes, route price, context, benchmark ledger, and explicit runtime gaps |
| Lifecycle | reviewed `/api/catalog` expiration dates | zero current retirement alerts because the catalog publishes zero active expiration dates; this is a factual empty result, not an unconfigured state |
| Subscribe vs API | reviewed catalog plans, entitlements, supported models, and direct route offers | seven approved provider slots, 23 reviewed plans, 463 model offers, URL-reconstructible exact calculations |
| Popular Models | weekly popularity directory plus exact immutable benchmark-release overlay | 100 weekly rows with exact weekly ranks; full release facts attach only on exact source-identity matches, never by name |
| Make It Yours | immutable current benchmark release | 44 source candidates; 13 currently contain every required seven-category score and aggregate cost-per-success fact and are rankable; 31 remain outside the weighted score with the missing fact disclosed |
| Human preference | paginated per-key leaderboard | 389 source rows across two validated cursor pages |
| Pricing and context | paginated per-key leaderboard | 405 selected-route rows across three validated cursor pages |
| Vision and documents | per-key leaderboard | 16 published rows; provenance strings wrap without page overflow |
| Text to image | per-key leaderboard | 75 published rows |
| Image editing | per-key leaderboard | 52 published rows |
| Text to video | per-key leaderboard | 44 published rows |
| Image to video | per-key leaderboard | 43 published rows |
| Video editing | per-key leaderboard | 7 published rows |
| LLM price vs performance | validated price-performance endpoint | 73 published points; Chart.js line element is registered and the scatter renders without a console error |
| Articles | local substantive content inventory | exactly 6 guides, 2 prototype insights, and 0 news records; empty/unpublished records remain excluded |

## Facts that are genuinely missing

### Runtime observations

The reviewed directory, profiles, benchmark release, and provider catalog do not publish TTFT, tokens-per-second, or uptime observations for the current candidates. Runtime controls remain visible but disabled when no observation exists; capability and evaluation-cost ranking continues without treating runtime as a prerequisite.

Recommended producer solution: add a revisioned runtime-observation feed keyed by exact model and route ID, with measurement conditions, sample size, observed time, TTFT percentiles, output-token throughput percentiles, and uptime window. Join it only when route identity and revision match.

### Cache-write price

Most reviewed route offers publish input, output, and sometimes cache-read prices, but not a distinct cache-write price. A zero cache-write allocation calculates exactly; a positive allocation is blocked when its rate is absent.

Recommended producer solution: add a reviewed `cacheWriteMicroDollarsPerMillion` field to provider ingestion, D1 persistence, catalog output, and the strict subscription route fact. Do not substitute ordinary input price.

### Cross-source category identity

The weekly profile source and the immutable benchmark release publish different taxonomies. Both are retained on their own surfaces. Popular Models attaches release categories and economics only through exact identity matches; it does not relabel `knowledge` or `multimodal` as mathematics, data analysis, language, or instruction following.

Recommended producer solution: persist a reviewed cross-source identity table and a source-taxonomy registry. The registry should keep original category IDs and labels, plus an explicit UI-slot mapping where equivalence has been reviewed. Unknown mappings must remain separate.

### Canonical strict-v1 deployment

The strict v1 models, lifecycle, rankings, comparison, and subscription media routes are implemented locally but are not currently served by the canonical origin. The compatibility boundary makes the Next review factual without fixture fallback, but the canonical deployment should ultimately expose the same validated projections directly.

Recommended release solution: publish the existing strict route handlers behind the canonical origin, run the retained acceptance/rejection suite, validate content negotiation and query reconstruction, and compare every Next route against this receipt before switching off compatibility loading.

## Verification receipt

- Root TypeScript: passed.
- Worker TypeScript: passed.
- Next ESLint: passed.
- Next production build: passed.
- Focused compatibility, pagination, weighted-ranking, projector, and route tests: passed.
- Impeccable detector on changed UI surfaces: zero findings.
- Wide review: no document overflow on the audited data routes after the provenance fix.
- Mobile review: no document/body overflow at the 390px review class across Models, Popular Models, Make It Yours, Subscribe vs API, human preference, vision/documents, price-performance, and Articles.
- Browser console: no errors or warnings in the final wide route sweep.
