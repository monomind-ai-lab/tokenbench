# TokenBench Model Directory and Profiles

**Date:** 2026-08-11  
**Status:** Approved design, pending written-spec review  
**Release:** 3 of 4

## Outcome

TokenBench publishes a weekly Popular Models top 100 and a durable, evidence-rich detail route for every model that has passed ingestion validation. Leaving the top 100 never removes a model profile.

## Routes

- `/models/` — Popular Models directory and all-model search.
- `/models/:slug/` — durable model profile.
- `/sitemaps/models.xml` — current and retained profile URLs.

Canonical slugs are source-derived, normalized, unique, and immutable after first publication unless a reviewed redirect migration is published. A changed upstream slug produces a canonical redirect from the old route rather than a broken link.

## Durable model directory

The directory is independent of revision-scoped benchmark tables. Each record contains:

- canonical model key and slug;
- display name, creator, source type, and reasoning type;
- family and variant identifiers when the source supplies them;
- first-seen and last-seen revision/time;
- latest valid profile revision;
- current versus archived status;
- current weekly popularity rank when present;
- source identity needed to reconstruct provenance.

Publishing a valid benchmark revision atomically upserts current directory records. Models absent from the new active revision are not deleted; they retain their latest valid profile and become archived only after the complete candidate proves the absence. A failed or partial ingestion cannot archive models.

## Weekly Popular Models snapshot

Popularity uses BenchLM's public `bench-align-v5` overall leaderboard order, not TokenBench page views or an invented engagement score. The first successful eligible ingestion after Monday 00:00 UTC publishes one immutable snapshot for that UTC week.

The snapshot stores:

- week start;
- source and TokenBench revision;
- generated/observed time;
- ordered canonical model keys for ranks 1–100;
- source methodology version.

Later ingestions during the same week may refresh model facts but do not reorder the published weekly top 100. If the first weekly candidate fails, the previous weekly snapshot remains visible as stale until a valid one publishes.

## Models directory page

The default view shows the current weekly top 100. Search covers every durable directory record, including archived models. Desktop uses a sortable table; narrow screens use compact cards with the same facts.

Each entry contains:

- weekly rank when present;
- model and creator;
- current overall score and rank;
- strongest ranking-eligible category with score/rank;
- representative direct API input/output price when available;
- evidence status;
- freshness or archived state;
- link to the profile.

Filters are limited to decision-useful fields: creator/provider, source type, evidence status, and current/archived. Search and filters update a shareable canonical query without generating indexable duplicate parameter pages.

## Model profile contract

The profile API and server-rendered page expose one validated view model containing:

### Identity and decision snapshot

- model name, creator, family/variant where available;
- overall public score and rank;
- evidence status and coverage summary;
- publication and checked times;
- current or archived status;
- concise strongest-evidence and validate-before-choosing statements derived from visible facts.

### Capability radar

The radar uses ranking percentiles, not incomparable raw category values. An axis is null when no eligible percentile exists. Missing axes remain visually blank and have accessible unavailable text. The chart includes an accessible text/table equivalent.

### Category cards

Each category card contains the canonical public category score, eligible rank/field size, percentile, evidence status, and benchmark count. Non-rankable but measured categories may show their score with `Not ranked`; missing categories do not show zero.

### Price and specifications

Show validated route-specific input, cached-input, and output prices; context window and maximum output where available; modalities; release date; source type; and self-hosting availability only when supported. Route conflicts remain visible and attributable.

### Benchmark ledger

Group rows by category. Each row contains benchmark name, raw/display value and unit, best verified comparison when compatible, gap, weight when the source publishes one, evidence status, observed time, and source link. Ledger rows never imply that display-only evidence contributed to a public aggregate unless the source contract says it did.

## Model linking

A single `modelPath(slug)` contract generates internal links. Home decision cards, Leaderboards, Compare, Price vs Performance, calculator evidence, and other model mentions use it whenever a durable model slug exists. Plain text remains only when no validated model identity can be resolved.

## Server rendering and SEO

Directory and profile content must be present in the initial HTML response. The browser hydrates interactions but is not responsible for creating crawlable titles or body content.

### Directory metadata

- unique title and description describing the weekly top 100 and all-model search;
- canonical `/models/`;
- Open Graph/Twitter metadata;
- `CollectionPage` plus `ItemList` JSON-LD for the published weekly entries.

### Profile metadata

- unique title including model name and current public score when available;
- evidence-aware description that avoids unsupported superlatives;
- canonical profile URL;
- Open Graph/Twitter metadata;
- `WebPage` with a benchmark `Dataset` main entity and provider/source attribution;
- publication/modified dates from the selected profile revision.

Archived profiles remain indexable while they retain substantive evidence. Their title/description and visible banner state that the profile is historical. Empty or irrecoverably invalid profiles return a true 404 with noindex metadata.

The model sitemap includes current and retained valid profiles with latest valid modification time. It never emits parameterized search/filter URLs.

## Error behavior

- Current profile read failure falls back to the latest valid durable profile and marks it stale.
- A stale weekly snapshot remains visible with its week and revision.
- Search failure leaves the visible top 100 intact.
- An unknown slug returns a real 404, not Home or a generic unavailable page.
- Source or price omissions remove only the unsupported component, not the whole profile.

## Acceptance criteria

- Every model in a valid ingestion receives a durable unique profile route.
- A fixture that leaves the top 100 remains searchable and its profile remains available.
- A fixture removed from a complete active source revision serves its latest profile with archived/stale status.
- Failed ingestion does not archive or delete any directory record.
- Weekly order changes at most once per UTC week and retains the previous snapshot after failure.
- GPT-5.6 Sol profile shows overall `81.48`, coding `78.0`, coding rank `#3`, and ledger rows with source links.
- Radar tests distinguish percentile, raw score, not-ranked, and missing states.
- Directory table and mobile cards expose equivalent facts and accessible names.
- All intended model mentions link to canonical profile URLs.
- Initial HTML contains profile H1, substantive evidence, metadata, JSON-LD, and canonical.
- Sitemap includes every current and retained valid profile and no search URLs.
- Desktop/mobile browser, keyboard, screen-reader semantics, no-overflow, and 404 tests pass.

## Deployment gate

Apply any additive directory/snapshot migration, run ingestion in controlled mode, and verify record counts before publication. Deploy worker and Pages, publish the first weekly snapshot, then verify the top 100, all-model search, multiple current profiles, one retained fixture/profile path, internal model links, model sitemap, source links, metadata, structured data, console, and responsive layouts before starting Release 4.
