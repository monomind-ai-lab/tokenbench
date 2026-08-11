# TokenBench Reliability and Score Corrections

**Date:** 2026-08-11  
**Status:** Approved design, pending written-spec review  
**Release:** 1 of 4

## Outcome

After this release, Home and Leaderboards continue showing the last valid published evidence during recoverable failures, and public BenchLM values match BenchLM's canonical leaderboard contract. GPT-5.6 Sol coding is `77.95` in the API and `78.0` in formatted UI.

This release also replaces leaderboard sharing with an accessible URL-copy dialog and removes the unsupported Data Sources footer link.

## Root causes addressed

1. The current BenchLM projection trusts `models.json` aggregate category fields even when they conflict with BenchLM's public `bench-align-v5` leaderboard API.
2. A corrupt or expired materialized cache can throw before the handler attempts reconstruction from the active revision.
3. A transient API failure replaces valid client state with an empty unavailable state because benchmark hooks do not retain a validated local response.
4. Leaderboard sharing performs an immediate native share or clipboard action instead of showing the requested canonical-URL dialog.
5. The footer's Data Sources link points to Leaderboards rather than a supporting page.

## Source and normalization contract

### Public scores

The ingestion worker fetches and snapshots BenchLM's unfiltered public leaderboard response at `https://benchlm.ai/api/data/leaderboard?mode=bench-align-v5`. A projected model score contains:

- canonical model identity;
- public overall score and rank;
- public category scores and eligible ranks;
- methodology version;
- source snapshot identity and observed time;
- evidence status.

Secondary BenchLM artifacts may enrich the model but cannot replace these public aggregates. The public API row is resolved to BenchLM's canonical model catalog by an exact creator/name match within the same source snapshot, then stored under the catalog's canonical model key. The join must be one-to-one; normalized-name fallback is allowed only when it also resolves uniquely. Ambiguous matches reject the candidate revision.

### Conflict validation

Cross-artifact disagreements are retained as diagnostic source facts when useful, but the public field always uses the leaderboard contract. Missing public leaderboard membership must not be silently filled from the conflicting model aggregate. The candidate either stores an explicitly non-public measurement or rejects the unsupported public ranking claim.

The regression fixture for GPT-5.6 Sol asserts:

- overall score `81.48`;
- coding category `77.95`;
- formatted coding value `78.0`;
- coding rank `#3` when the same source snapshot reports that rank.

The fixture is cross-checked against the public profile at `https://benchlm.ai/models/gpt-5-6-sol`, while the machine-readable API remains the ingestion contract.

## Server fallback sequence

Every benchmark summary and leaderboard handler isolates cache errors from revision reconstruction:

1. Attempt the fresh materialized response.
2. If cache lookup returns no row or throws validation/chunk errors, log that failure and continue.
3. Read and validate the active published revision, then build the response.
4. If active-revision reconstruction fails, read the newest complete materialized response without a freshness cutoff.
5. Return that response with stale freshness and the original revision/source attribution.
6. Return 503 only when no complete valid response can be recovered.

The stale fallback is read-only. It does not promote an older benchmark revision to active or conceal its checked time.

## Browser fallback sequence

Benchmark summary and leaderboard clients persist only envelopes that pass the full runtime validator. Each endpoint and normalized query has a bounded local cache key containing schema version and response identity.

On request failure, malformed JSON, 503, or invalid envelope:

- use the last validated local envelope when available;
- mark the UI stale and explain that the last published revision is shown;
- preserve retry behavior;
- do not overwrite the local cache with an invalid response.

The local fallback is a resilience layer, not the primary source. Storage failures are non-fatal.

## Error logging

Structured logs include:

- event name;
- endpoint and normalized query identity;
- cache scope/key;
- active and fallback revision when available;
- failure stage and safe error class;
- fallback selected;
- request correlation identifier.

Logs exclude response bodies, API credentials, emails, names, companies, and browser storage contents.

## Leaderboard share dialog

`Share Leaderboard` becomes a secondary small button with a share icon and accessible name. Activation opens a modal dialog containing:

- the canonical leaderboard URL in a read-only field;
- a Copy button;
- success or error status text;
- a close control.

The dialog traps focus, closes on Escape or explicit close, restores focus to the trigger, and does not close when copy fails. Native share is not the primary interaction.

## Footer

Remove Data Sources from the Trust group. Keep Methodology and Privacy. No replacement link is added until a real data-sources page exists.

## SEO effects

Existing Home and Leaderboard metadata remain server-rendered. Titles, descriptions, canonicals, Open Graph, Twitter metadata, and JSON-LD must continue matching the corrected visible content. Stale fallback does not change the canonical URL or emit a noindex directive.

## Acceptance criteria

- A corrupt fresh cache falls through to the active revision instead of returning 503.
- Failure to reconstruct the active revision serves the newest complete materialized response as stale.
- A browser with a prior valid envelope keeps data visible during a simulated network failure.
- A cold browser with no server or local data shows the honest unavailable state.
- GPT-5.6 Sol coding is `77.95` in the normalized API and `78.0` in UI and CSV where applicable.
- Home and every Leaderboard retain source links, publication time, checked time, and revision identity under fallback.
- Share dialog keyboard, copy-success, copy-failure, focus-restoration, and canonical-URL tests pass.
- Footer contains no Data Sources link.
- Desktop and mobile production smoke tests show data, no console errors, and correct metadata.

## Deployment gate

Run database/cache contract tests, ingestion tests, frontend tests, TypeScript, production build, and relevant browser suites. Deploy the benchmark worker when ingestion changes, then Pages. Trigger only the authorized refresh path. Verify the active revision, GPT-5.6 Sol values, Home, at least two leaderboards, share dialog, footer, response freshness, and structured fallback logs before starting Release 2.
