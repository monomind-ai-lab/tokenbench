# Task 3 implementation report: integrated production readiness

## Executive summary

Task 3 reconciles the catalog pipeline, application semantics, and Cloudflare deployment configuration with the approved plan. It adds compatible metadata storage and API mappings, corrects the OpenCode Zen route, makes failed upstream refreshes record actionable state without replacing the active revision, and prevents a variable subscription fee from being presented as the overall recommendation. All repository checks pass: 48 Vitest tests, six Chrome browser tests, TypeScript lint, production build, and whitespace validation.

## Verified source decisions

- Alibaba Coding Plan Pro is retained at $50/month with published request quotas and exact supported model names from `https://www.alibabacloud.com/help/en/model-studio/coding-plan`; it remains a variable/request-limited entitlement, never a token quota.
- Claude Pro ($20/month), Max 5x ($100/month), and Max 20x ($200/month) are retained from the current Claude Help Center plan table at `https://support.claude.com/en/articles/11049762-choose-a-claude-plan`; no fixed token allowance is inferred.
- ChatGPT Pro 5x ($100/month) and 20x ($200/month) are retained as guardrail-limited from `https://help.openai.com/en/articles/9793128-chatgpt-pro`. DeepSeek-V4-Flash direct API rates remain $0.14 input, $0.0028 cached input, and $0.28 output per million tokens with its published 1M context and 384K maximum output at `https://api-docs.deepseek.com/quick_start/pricing/`.
- xAI, Kimi, and Z.AI remain source-linked but provenance-only until a current official source safely establishes a plan name and price; no stale manual subscription row remains. OpenCode Zen uses `https://opencode.ai/zen/v1/models`, while the Go route is intentionally not treated as Zen pay-as-you-go pricing.

## Integration changes

- Added optional, validated contracts and D1/API persistence for plan billing cycle and supported models; model context, maximum output, and availability; and provenance content hash, parser version, evidence locator, and review status. The frontend exposes model availability and uses supported-model metadata when evaluating subscription eligibility.
- The recommendation now compares the active workload API estimate only with subscription offers that both publish support for all selected models and a sufficient fixed token entitlement; otherwise it recommends the calculated API route and surfaces access, route, freshness, and confidence caveats rather than relabeling the cheapest subscription as a cost-first result.
- Worker publication still writes snapshots before publication, now records fetch/timeout/parse/schema failure detail in `source_refresh_state`, and keeps the active revision unchanged on failure. The provisioned D1 ID and Pages/Worker `SOURCE_SNAPSHOTS` binding are configured, and the deployment guide documents exact Pages and Workers Builds dashboard actions for `main`.

## TDD evidence

- RED/GREEN tests first demonstrated that variable subscriptions won a lowest-fee recommendation, the OpenCode Go endpoint was used, manually retained pricing was stale, and refresh failure metadata was absent.
- Further RED/GREEN API and component tests demonstrated omitted catalog metadata mapping and absent availability rendering; the resulting behavior is now covered in calculator, validation, worker, API, and app-shell tests.

## Validation

```text
npm test             8 files, 48 tests passed with clean output
npm run test:browser 6 local-Chrome responsive and keyboard tests passed
npm run lint         tsc --noEmit passed
npm run build        Vite production build passed
git diff --check     passed
```

## Remaining external actions

Apply migration `0002_catalog_metadata.sql` to the provisioned D1 database, confirm `CATALOG_DB` and `SOURCE_SNAPSHOTS` bindings in both Pages environments, configure the R2 lifecycle retention policy, and enable the documented Pages/Worker Builds settings for `main`. No Cloudflare deployment or dashboard mutation was performed by this task.

## Audit remediation (Task 469a8d9ced63)

- Removed the obsolete fabricated provider/price/token catalogue from `src/types.ts`; the module now exposes language data only, while a regression validates the checked-in bootstrap with the source-link validator.
- Validation now requires finite ISO timestamps and enforces provenance ownership for subscription/direct offers while retaining OpenRouter/OpenCode route ownership. Stored D1 JSON is parsed through a safe boundary before catalog validation, so malformed entitlement or supported-model metadata returns the marked bootstrap fallback instead of an unhandled response.
- Upstream adapters reject empty offer sets; malformed JSON/HTML, schema drift, duplicate IDs, R2/D1 failures, and timeout paths are covered with stateful tests that retain the active revision and record source refresh errors. The fetch seam is injected through `refreshSource`, and scheduled automated sources now require an explicit `AUTOMATED_SOURCE_IDS` allowlist.
- Recommendations distinguish a provider that does not publish support for the selected model mix from one with a variable or insufficient entitlement. Browser coverage now runs real Chrome at 320, 375, 768, 1024, and 1440px, Tabs through the calculator controls, and validates dark/language, loading, empty, error/bootstrap, and stale behavior with output under `/tmp`.
- Deployment documentation makes Wrangler configuration authoritative for bindings and records the robots/terms allowlist gate: the approved OpenRouter Models API and OpenCode JSON model endpoint are configured to refresh on schedule, while HTML, unstable, and unapproved adapters require review and manual fallback. No Cloudflare resource was changed.

### Remediation validation

```text
npm test                        9 files, 60 tests passed with clean output
npm run test:browser            12 local-Chrome responsive, keyboard, and state tests passed
npm run lint                    tsc --noEmit passed
npm run build                   Vite production build passed
npx wrangler deploy --dry-run  Worker bundle and provisioned D1/R2 bindings validated; no deployment
git diff --check                passed
```

## Luna final re-review closure (Task 87f6631a3600)

- The stateful transaction regression now throws at statement 9, after candidate source and model rows, prior-revision supersede, candidate publication, and active-pointer mutation have all been applied to the staged clone. The committed state remains on `rev-known-good`, has no pending candidate revision or rows, retains the previous refresh success/revision, and receives only the scheduled failure message.
- Header and evidence accessibility coverage now uses actual keyboard Tab traversal rather than programmatic `.focus()`. It verifies computed `:focus-visible` outlines for the language selector, theme toggle, and evidence link are solid, nonzero-width, and nontransparent, while all five responsive primary-control tests remain in place.

### Final re-review validation

```text
npm test                        9 files, 59 tests passed with clean output
npm run test:browser            13 local-Chrome checks passed
npm run lint                    tsc --noEmit passed
npm run build                   Vite production build passed
rtk npx wrangler deploy --dry-run --config workers/catalog-ingest/wrangler.toml
                                Run from repository root; Worker bindings validated without deployment
git diff --check                passed
```

## Luna re-review test-harness closure (Task dcdb935f220e)

- Replaced SQL-collecting worker fakes with a genuinely stateful D1 transaction harness that applies every publication statement to a staged clone and commits only after the full batch completes. It injects a mid-batch D1 failure and proves no pending candidate revision or candidate rows leak into the active state; the prior active revision and prior refresh success/revision are retained while scheduled error recording adds the failure reason.
- Scheduled regressions now exercise malformed JSON/HTML, changed schema, duplicate offer IDs, AbortController timeout, R2 snapshot failure, and D1 publication failure against that same state model. The R2 case specifically runs through `scheduled`, proving its error is recorded rather than relying on a direct publication call.
- Browser regressions retain all five width checks and now assert actual computed `3px solid` focus outlines after keyboard Tab reaches provider, plan, model, number, and range controls. They also verify a visible, focusable evidence link exposes an HTTPS destination with safe new-tab attributes.

### Re-review validation

```text
npm test                        9 files, 59 tests passed with clean output
npm run test:browser            13 local-Chrome checks passed
npm run lint                    tsc --noEmit passed
npm run build                   Vite production build passed
rtk npx wrangler deploy --dry-run --config workers/catalog-ingest/wrangler.toml
                                Run from repository root; Worker bundle plus `CATALOG_DB`, `SOURCE_SNAPSHOTS`,
                                and `AUTOMATED_SOURCE_IDS="openrouter-models,opencode-zen"` validated; no deployment
git diff --check                passed
```
