# Task dcdb935f220e: Luna re-review test-harness remediation

## Objective

Replace non-mutating ingestion fakes with a genuinely stateful atomic transaction fake and strengthen browser focus/evidence assertions without changing production behavior.

## Scope and executable plan

1. Write a failing stateful transaction regression that proves a failed D1 publication cannot alter the active revision, pending candidate rows, or refresh state.
2. Replace test-only fakes with an atomic staged-state harness and cover each scheduled failure path, including R2 snapshot failure.
3. Expand browser assertions for computed focus outlines and usable evidence links, validate all required checks, then commit only the scoped tests, report, and task log.

## Progress

- 2026-08-04: Reviewed the accepted Task 3 remediation and identified the remaining test-only weakness: current worker fakes merely collect SQL text and do not model atomic D1 state.
- 2026-08-04: Wrote a focused RED assertion that exposed the non-mutating fake, then replaced it with a staged-state transaction harness. The focused worker suite now proves scheduled malformed JSON/HTML, changed-schema, duplicate-ID, timeout, R2, and D1 mid-publication failures retain the prior active revision, no candidate rows, and prior refresh facts while recording the error.
- 2026-08-04: Expanded real Chrome coverage to assert computed `3px solid` focus outlines for provider, plan, model, usage, and range controls at every required width, plus visible focusable source evidence links.
- 2026-08-04: Final validation passed: 59 Vitest tests, 13 Playwright Chrome tests, TypeScript lint, Vite build, `rtk npx wrangler deploy --dry-run --config workers/catalog-ingest/wrangler.toml` from the repository root, and whitespace validation. The exact Worker dry run validated `CATALOG_DB`, `SOURCE_SNAPSHOTS`, and `AUTOMATED_SOURCE_IDS="openrouter-models,opencode-zen"` without deployment; scope analysis against `main` includes prior accepted work, while this commit stages only the re-review test harness, browser tests, report, and task log, excluding `dist` and `.codebase-memory`.

## Risks

- The transaction fake must model the publication batch closely enough to detect partial state mutation without redefining production behavior.
