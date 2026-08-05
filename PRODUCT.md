# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

TokenBench serves people and teams evaluating AI subscriptions, API routes, and models. They need to understand cost, capability, source quality, and workload fit before selecting a provider, plan, or model.

## Product Purpose

TokenBench is the decision engine for AI costs and model benchmarks. It combines verified subscription and API pricing with source-attributed benchmark evidence so a user can compare buying options, inspect leaderboard lenses, and evaluate model pairs without treating incomplete evidence as certainty.

Success means a user can identify the relevant evidence, understand its freshness and limits, apply a disclosed workload profile, and make a defensible next decision.

## Positioning

TokenBench keeps source metrics, provider pricing, workload calculations, and unavailable states visibly distinct. It does not collapse unlike evidence into an opaque universal score or invent rankings, prices, subscription mappings, or benchmark results.

## Operating Context

- Compare paid individual AI subscriptions with direct or routed API usage.
- Inspect model capability, coding, agentic, human-preference, value, pricing, context, multimodal, image, and video evidence through dedicated leaderboard lenses.
- Compare two known models using canonical pair pages, exact source metrics, workload-aware costs, and reviewed subscription mappings.
- Verify source attribution, publication time, freshness, and methodology before purchasing or deploying.

## Capabilities and Constraints

- The calculator uses verified catalog revisions and preserves explicit variable or unavailable plan limits.
- Benchmark pages read only complete active revisions and retain null measurements as `Unavailable`.
- BenchLM, LMArena, OpenRouter, LiteLLM, and TokenBench calculations have defined, separate roles.
- Estimated BenchLM entries are opt-in, visibly differentiated, unranked, and ineligible for winner badges or value claims.
- Comparison pages may render any valid pair, but search indexing is restricted to reviewed, evidence-qualified pairs.
- The initial editorial comparison allowlist is empty; interfaces must not imply reviewed popular matchups exist.
- Public pages use the shared TokenBench shell and support light and dark themes.

## Brand Commitments

- Product name: TokenBench.
- Parent organization: MonoMind AI Lab.
- Tagline: “The Decision Engine for AI Costs & Model Benchmarks.”
- Voice: technical, concise, evidence-aware, and explicit about uncertainty.
- The user has approved the dark calculator’s compact, technical detail language as the visual basis for both themes and new decision surfaces. Light mode must be a semantic translation of that system, not a separate visual identity.
- Electric blue `#0007cd` is the scarce primary decision and evidence accent.

## Evidence on Hand

- Verified subscription manifests and revisioned catalog contracts in the repository.
- Public API pricing and metadata adapters, including provider-specific routes.
- Benchmark ingestion and normalization contracts for BenchLM, LMArena, OpenRouter, and LiteLLM.
- Transparent workload calculations and Pareto-frontier derivations.
- Existing dark and light calculator mockups under `.stitch/designs/`.
- The current TokenBench shell, tokens, responsive behavior, and implemented leaderboard experience in `src/`.
- The implementation contract in `docs/superpowers/plans/2026-08-05-tokenbench-platform.md`.

No customer claims, testimonials, universal winners, or unpublished benchmark values are available for fabrication.

## Product Principles

1. Show provenance with the decision, not behind it.
2. Preserve uncertainty and unavailable evidence instead of manufacturing completeness.
3. Keep workload assumptions visible and adjustable.
4. Use one coherent interaction and theme system across tools, comparisons, and leaderboards.
5. Make evidence usable on small screens without hiding or horizontally clipping it.

## Accessibility & Inclusion

- Support keyboard navigation, visible focus, semantic headings and tables, and non-color state cues.
- Keep interactive targets at least 44 by 44 CSS pixels.
- Replace wide comparison and leaderboard tables with equivalent ordered cards on narrow screens.
- Maintain readable contrast and usable states in both light and dark themes.
- Preserve reduced-motion behavior and a minimum supported viewport width of 320 pixels.
