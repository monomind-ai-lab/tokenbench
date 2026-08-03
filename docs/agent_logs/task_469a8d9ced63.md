# Task 469a8d9ced63: Task 3 audit remediation

## Objective

Resolve every blocking and P2 finding from the Luna whole-branch audit without changing Cloudflare resources.

## Scope and executable plan

1. Add failing catalog, ingestion, API, recommendation, and browser regressions for the reported risks.
2. Make the smallest source changes needed to preserve last-known-good catalog publication and enforce source-linked records.
3. Validate deployment documentation, run the required checks and Worker dry run, inspect the scoped diff, then commit only intended files.

## Progress

- 2026-08-03: Reviewed Task 3 implementation, current catalog/API/worker/frontend seams, and call-graph impact. Catalog validation affects scheduled ingestion and the public API, so these changes require focused integration tests before implementation.
- 2026-08-03: Added and observed failing regressions for legacy fabricated providers, finite timestamps and source ownership, empty upstream payloads, unsupported fixed entitlements, and unallowlisted scheduled fetching; implemented the minimal passing protections.
- 2026-08-03: Expanded worker/API stateful failure coverage and real browser coverage across all required widths, focusable calculator controls, theme/language state, and loading/empty/error/bootstrap/stale states. Browser artifacts remain in `/tmp`.
- 2026-08-03: Final validation passed: 60 Vitest tests, 12 Playwright Chrome tests, TypeScript lint, Vite build, Wrangler 4.118.0 Worker dry run with D1/R2 bindings, and whitespace validation. The approved OpenRouter and OpenCode official JSON source IDs are configured in the Worker allowlist; robots/terms review and manual fallback govern future HTML, unstable, or unapproved adapters. Change-scope analysis against `main` includes the accepted Task 3 baseline plus this narrow remediation; generated `dist` and `.codebase-memory` remain untracked and excluded.

## Risks

- Publication and API validation are shared critical seams; malformed upstream data must never replace the active revision.
- Cloudflare bindings are provisioned but this task is intentionally limited to source configuration and dry-run validation.
