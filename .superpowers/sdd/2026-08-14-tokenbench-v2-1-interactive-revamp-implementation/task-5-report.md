# Task 5 Report — Lifecycle Risk Management and Model Profiles

## Delivered

- Added `groupLifecycleRecords()` and `migrationDelta()` with distinct announcement, deprecation, and retirement fields. Cross-host or condition-mismatched measurements return no cost/speed delta.
- Reworked the lifecycle page around searchable provider/status/horizon controls, stable action/upcoming/monitoring/archived groups, sourced-only replacement language, pagination, and distinct loading, empty, and error states.
- Expanded model dossiers with identity/lifecycle/limits, source methodology and provenance, native-vs-host endpoint matrices, all endpoint price dimensions, measurement conditions, durable revision history, workload prompts, limitations, conflict states, related links, comparison action, and delayed editorial CTA.
- Extended the SSR envelope with validated `EndpointEvidenceRow` data. Route evidence remains hosted unless explicit native evidence is supplied.
- Kept alias requests as 308 canonical redirects; 404 pages now include sanitized close matches when available plus primary recovery links. Partial profiles render unavailable dimensions instead of failing or inventing facts.
- Updated the static lifecycle shell and responsive CSS for the new evidence boundaries.

## Verification

Passed:

```text
npx vitest run src/benchmarks/lifecycle-view.test.ts src/pages/model-lifecycle-page.test.tsx src/pages/model-profile-page.test.tsx src/frontend/model-profile-contracts.test.ts 'functions/models/[slug].test.ts' scripts/generate-static-pages.test.ts
# 6 files passed, 35 tests passed

npm run lint
# tsc --noEmit passed
```

## Evidence Boundaries Retained

- Existing directory records do not become announcement, deprecation, retirement, or migration evidence; absent fields render `Unavailable`.
- Replacement language requires a replacement ID with a source URL and observed date.
- Native endpoint rows are not inferred from hosted route entries; host and native facts are rendered in separate tables.
- Migration deltas require matching source host and measurement conditions.
