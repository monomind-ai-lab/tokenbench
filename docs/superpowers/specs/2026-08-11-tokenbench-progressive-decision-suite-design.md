# TokenBench Progressive Decision Suite

**Date:** 2026-08-11  
**Status:** Approved design, pending written-spec review  
**Visual direction:** Decision-first suite (Direction A)  
**Production origin:** `https://tokenbench.monomind.one`

## Outcome

TokenBench will become a decision-first suite of focused, source-backed pages. The work ships as four progressive production releases so correctness and reliability improvements reach users before the larger directory and chart surfaces are complete.

The suite must:

1. Keep the last valid benchmark evidence visible when refreshes, materialized caches, or network requests fail.
2. use BenchLM's public leaderboard contract for public overall and category scores, including GPT-5.6 Sol coding `77.95`, displayed as `78.0`.
3. Replace the calculator's entitlement-gated recommendation with a message-and-token comparison that separates cost arithmetic from plan-capacity evidence.
4. Deliver an immediate test cheatsheet email after double opt-in using a valid blank PDF.
5. Publish a weekly Popular Models top 100 while retaining durable detail pages for every successfully ingested model.
6. Publish a Price vs Performance decision surface using the same corrected score and price contracts.
7. Give every public route complete server-rendered SEO metadata and appropriate structured data.

## Approved release sequence

| Release | Scope | Production gate |
| --- | --- | --- |
| 1 | Benchmark reliability, score correction, share dialog, footer cleanup | Correct source values, no avoidable empty states, fallback tests, live API and page smoke tests |
| 2 | Subscribe vs API calculator and newsletter test delivery | Deterministic formulas, independent coverage state, controlled double-opt-in delivery test |
| 3 | Popular Models and durable model profiles | Weekly top-100 snapshot, every-model routing, model sitemap, profile SEO and accessibility |
| 4 | Price vs Performance | Correct joins and formulas, accessible chart/table parity, Pareto tests, live responsive verification |

Each release is independently committed, pushed, deployed, and verified. A failed production gate stops the sequence; the prior production deployment remains the rollback target.

## Shared architecture

### Decision-first page family

The primary navigation is:

- Models
- Price vs Performance
- Subscribe vs API
- Compare
- Leaderboards
- Guides

The brand links Home. Each destination has one clear purpose and a durable route. Shared components provide source attribution, freshness, evidence status, model links, metadata, dialogs, tables, cards, and responsive behavior without merging the pages into one stateful dashboard.

### Canonical benchmark contract

BenchLM's `bench-align-v5` public leaderboard API is authoritative for public overall scores, public category scores, and ranks. BenchLM model, benchmark, and pricing artifacts continue to supply identity, coverage, benchmark-ledger facts, and prices. A conflicting aggregate in a secondary artifact cannot override the public leaderboard value.

Candidate revisions are immutable and publish atomically only after cross-artifact validation. Invalid or incomplete candidates leave the active revision unchanged.

### Last-good-data rule

Once TokenBench has published a valid view, a source refresh failure must not turn that view into an empty state. The read order is:

1. valid fresh materialized API response;
2. rebuilt response from the active immutable D1 revision;
3. older valid materialized response, marked stale;
4. browser-side last validated response, marked stale;
5. unavailable only when no valid revision has ever existed for the view.

Every fallback preserves revision identity, source attribution, and checked time. Structured logs record the endpoint, cache key, revision, failure stage, and chosen fallback without secrets or subscriber data.

### Durable model identity

Top-100 membership and model existence are independent. A durable directory stores every successfully ingested model and its most recent valid profile. A model that leaves the top 100 remains available. A model removed from the active upstream catalog retains its latest valid profile with an archived/stale notice.

### SEO contract

Every public page receives server-rendered or statically generated:

- unique title and meta description;
- canonical URL;
- intentional robots directive;
- Open Graph and Twitter metadata;
- relevant JSON-LD;
- one clear H1 and descriptive internal links.

Sitemaps include the directory, every current or retained model profile, Price vs Performance, and changed public routes. Confirmation routes also receive metadata but may intentionally use `noindex,follow`.

## Child specifications

1. [Reliability and score corrections](./2026-08-11-tokenbench-reliability-and-score-corrections-design.md)
2. [Calculator and newsletter delivery](./2026-08-11-tokenbench-calculator-and-newsletter-delivery-design.md)
3. [Popular Models and model profiles](./2026-08-11-tokenbench-model-directory-and-profiles-design.md)
4. [Price vs Performance](./2026-08-11-tokenbench-price-vs-performance-design.md)

## Shared quality gates

Every release must pass relevant unit, contract, TypeScript, build, accessibility, desktop-browser, mobile-browser, metadata, sitemap, and live-production checks. Exact regression coverage includes GPT-5.6 Sol coding `77.95` rendered as `78.0`. Charts require an equivalent accessible table or list. Missing evidence remains blank or explicitly unavailable; it is never converted to zero.

## Out of scope

- Automated production cheatsheet generation; Release 2 uses a deliberately blank, valid test PDF.
- A universal model winner or opaque composite value verdict.
- Replacing current benchmark methodology with a new TokenBench scoring system.
- Deleting historical models because they leave the weekly top 100.
- Rebuilding unrelated guide or comparison content.

