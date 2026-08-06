# TokenBench deployment runbook

## Status and scope

This runbook records the completed local release-candidate checks for TokenBench
through application commit `7696cfe` on 2026-08-06. The comparison implementation,
expanded browser matrix, accessibility smoke pass, two Impeccable UX/UI passes,
and a retained production-preview confirmation are complete. The progress board
is not release evidence and was not changed by this audit.

No external release action has been taken: the branch has not been pushed, the
remote migration has not been applied, Workers and Pages have not been deployed,
and no domain, redirect, controlled refresh, or production smoke operation has
been performed. Those fields remain pending explicit authorization and observed
production evidence.

Do not replace pending fields with estimates, planned values, screenshots from a
different build, or copied dashboard data. Record only observed evidence from
the committed release candidate and the approved production target.

The canonical production origin is https://tokenbench.monomind.one. The legacy
ai-plans.monomind.one hostname is retained only long enough to redirect each
path and query to the canonical host with HTTP 301.

## Release inputs

| Input | Required evidence | Current status |
| --- | --- | --- |
| Release commit | Commit SHA, clean scoped diff, and approved branch/remote target. | Local application candidate `7696cfe`; evidence documentation follows locally, while the push target and authorization remain pending. |
| Design baseline | [../DESIGN.md](../DESIGN.md) reviewed during both UX/UI passes. | Reviewed in both passes; dark technical hierarchy and the approved light-mode adaptation verified. |
| Data-source policy | [data-sources.md](data-sources.md) reviewed for source, attribution, and Artificial Analysis restrictions. | Reviewed; source allowlists, visible attribution, and the Artificial Analysis prohibition remain intact. |
| Data-plane configuration | Root and Worker Wrangler bindings checked against the approved Cloudflare target. | Binding names, schedules, and shared D1/R2 names inspected locally; remote target/history confirmation pending authorization. |
| Comparison implementation | Integrated Pages Function, dynamic sitemap, canonicalization tests, and browser coverage. | Integrated and verified, including a real handler-rendered document backed by deterministic fake D1 data before browser hydration. |

Do not place Cloudflare API tokens, account identifiers, private dashboard URLs,
or customer data in this document. The checked-in Wrangler configuration remains
the source of truth for binding names and resource identifiers.

## Local release gate

Run all commands from the integrated release tree, after browser coverage and
audit fixes are complete:

~~~sh
npm test
npm run lint
npm run build
npm run test:browser
npm run test:browser:production
git diff --check
git status --short
~~~

| Gate | Required outcome | Recorded result |
| --- | --- | --- |
| Unit and API tests | Exit 0. | Pass: 38 files, 480 tests. |
| Type check | Exit 0. | Pass: `tsc --noEmit`. |
| Production build | Exit 0. | Pass: Vite built 23 crawlable fixed pages and the application bundle. |
| Responsive browser suite | Exit 0 across the expanded route, viewport, theme, and state matrix. | Pass: 42/42 Playwright tests, including 100 primary-route navigations. |
| Production-preview browser suite | Build first, serve only generated `dist` assets, and exit 0 across the same suite. | Pass: 42/42 Playwright tests, including 100 primary-route navigations. See the [retained production-preview audit](audit-evidence/2026-08-06/production-preview-audit.md). |
| Diff check | Exit 0 with only intentional files. | Pass before the evidence commit; rerun on the final exact tree. |
| Final worktree inspection | No unintended changes before an authorized push. | Scoped application, browser, and evidence files verified; final clean-status check remains part of the exact-tree rerun. |

The release gate must be rerun after integrating comparison, sitemap, browser,
and configuration changes. A passing command from an earlier commit does not
qualify a later release candidate.

## UX/UI audit matrix

The two implementation passes used the installed Impeccable skill, source
detection, rendered Playwright coverage, and screenshot inspection. The compiled
assets were then confirmed separately with a production-preview run. For every
route below, that final run inspected 320, 375, 768, 1024, and 1440 CSS-pixel
widths in both light and dark themes. The earlier screenshots remain design-pass
evidence; production-preview evidence is labeled separately.

| Route or state | Viewports | Themes | Pass 1 | Pass 2 | Evidence |
| --- | --- | --- | --- | --- | --- |
| Home: / | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Production matrix](audit-evidence/2026-08-06/production-preview-audit.md) |
| Tools: /tools/ | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Production matrix](audit-evidence/2026-08-06/production-preview-audit.md) |
| Calculator: /tools/subscriptions-vs-apis/ | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Pass 1 light](audit-evidence/2026-08-06/pass-1-calculator-390-light.png), [pass 2 light](audit-evidence/2026-08-06/pass-2-calculator-390-light.png), [production 320 light](audit-evidence/2026-08-06/production-calculator-320-light.png) |
| Leaderboard directory: /leaderboards/ | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Production matrix](audit-evidence/2026-08-06/production-preview-audit.md) |
| Data-dense LLM leaderboard | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Pass 1 dark](audit-evidence/2026-08-06/pass-1-coding-390-dark.png), [pass 2 dark](audit-evidence/2026-08-06/pass-2-coding-390-dark.png), [production 375 dark](audit-evidence/2026-08-06/production-coding-375-dark.png) |
| Media leaderboard | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Production 768 light](audit-evidence/2026-08-06/production-media-768-light.png) |
| Compare hub: /compare/ | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Production matrix](audit-evidence/2026-08-06/production-preview-audit.md) |
| Canonical indexable comparison selected from the active revision | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Pass 2 390 dark](audit-evidence/2026-08-06/pass-2-comparison-390-dark.png), [production 375 dark](audit-evidence/2026-08-06/production-comparison-375-dark.png), [production 1440 light](audit-evidence/2026-08-06/production-comparison-1440-light.png) |
| Guide hub: /guides/ | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Production matrix](audit-evidence/2026-08-06/production-preview-audit.md) |
| One generated guide article | 320, 375, 768, 1024, 1440 | Light, dark | Pass | Pass | [Pass 1 light](audit-evidence/2026-08-06/pass-1-article-390-light.png), [pass 2 light](audit-evidence/2026-08-06/pass-2-article-390-light.png), [production 1024 dark](audit-evidence/2026-08-06/production-article-1024-dark.png) |

Each pass must cover:

- visual hierarchy, spacing rhythm, typography, contrast, and surface elevation
  against DESIGN.md;
- responsive composition, including leaderboard table-to-card transformation;
- mobile navigation, one H1, no horizontal overflow, and theme persistence
  across routes;
- keyboard focus, skip links, landmarks, heading hierarchy, labels, aria-sort,
  reduced motion, chart text alternatives, and meaning without color;
- Google Translate banner suppression;
- loading, empty, stale, unavailable, and error states where those states are
  supported by the route.

### Findings log

The release gate is zero unresolved critical, high, or medium findings. The two
passes used the Impeccable source detector, rendered Playwright coverage, and
manual screenshot inspection, followed by the retained compiled-asset audit.
Impeccable's optional URL wrapper could not run because Puppeteer is not
installed; no package was installed for the audit. Equivalent rendered checks
used the repository's existing Playwright runtime.

| Pass | Route | Viewport | Theme | Severity | Evidence screenshot or reference | Expected behavior | Disposition and regression test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Shared chart surface | All | Both | Medium | [Browser regression](../browser-tests/responsive-browser.ts) | Avoid layout-thrashing height animation and respect reduced motion. | Removed the chart height transition; reduced-motion regression passes. |
| 1 | Guide article | 390 | Light | Medium | [Article verification](audit-evidence/2026-08-06/pass-1-article-390-light.png) | Use a balanced elevated surface instead of a heavy asymmetric side border. | Replaced the four-pixel side border with the approved one-pixel tonal surface; pass 2 remains clean. |
| 1 | Coding leaderboard | 390 | Dark | Medium | [Leaderboard verification](audit-evidence/2026-08-06/pass-1-coding-390-dark.png) | Methodology context should match the restrained dark-mode card language. | Replaced the heavy side rule with a one-pixel tonal border and approved radius. |
| 1 | Calculator recovery state | 390 | Light | Medium | [Calculator verification](audit-evidence/2026-08-06/pass-1-calculator-390-light.png) | One failure should produce one recovery announcement. | Duplicate warning is suppressed when it repeats the catalog error; component regression added. |
| 1 | Home skip link | 390 | Both | Medium | [Keyboard regression](../browser-tests/responsive-browser.ts) | Activating the skip link must move focus to the main landmark. | Confirmed red with focus on `BODY`; made React and generated main targets programmatically focusable; regression passes. |
| 1 | Compact navigation | 375 | Both | Medium | [Keyboard regression](../browser-tests/responsive-browser.ts) | Escape from the focused menu toggle or an open navigation item must close the menu. | Confirmed red on the focused toggle; moved Escape handling to the shared header boundary; regression passes. |
| 1 | Calculator trend chart | 1024 | Both | Medium | [Chart regression](../browser-tests/responsive-browser.ts), [pass 2 light](audit-evidence/2026-08-06/pass-2-calculator-390-light.png) | The text alternative must expose the plotted current token and API-equivalent values. | Added both formatted current values to the chart accessible name; regression passes. |
| Final review | Calculator and guides | 390 | Both | Medium | [Keyboard regression](../browser-tests/responsive-browser.ts) | Every skip link must move keyboard focus, not merely scroll the fragment target, and the target must exist before asynchronous data resolves. | Confirmed red in the loaded and loading paths; moved the calculator ID/focus target to the persistent page wrapper and kept both hydrated guide targets focusable. Five route-specific skip regressions pass. |
| Final review | All primary routes | All | Both | Medium | [Production matrix](audit-evidence/2026-08-06/production-preview-audit.md) | The matrix must prove client hydration, exactly one total H1, and removal of the generated static shell. | Added route-specific hydrated markers, total-H1 count, and static-shell absence across all 100 combinations. Dynamic comparison uses a client-only hydration sentinel and proves a workload-driven recalculation. |
| Final review | Audit provenance | All | Both | Medium | [Production-preview audit](audit-evidence/2026-08-06/production-preview-audit.md) | Release evidence must distinguish Vite source serving from compiled production assets. | Added a build-first production-preview command, retained its 42-test result and matrix manifest, and captured six screenshots from `dist`. |
| 1/2 | Shared dense data surfaces | All | Both | Low | [DESIGN.md](../DESIGN.md) | Compact labels, fluid display endpoints, semantic state tones, and tight radii should remain deliberate rather than accidental drift. | Retained 109 type-ramp, 15 radius, and 5 semantic-color detector notices. They implement the approved dense TokenBench mockups; caption semantics, contrast, hit targets, overflow, and responsive composition pass. |
| 1/2 | Shared typography | All | Both | Low | [DESIGN.md typography](../DESIGN.md) | Use the documented brand typography or its declared open-source substitute. | Retained Inter: DESIGN.md explicitly declares it as the abcDiatype substitute; JetBrains Mono remains limited to technical surfaces. |
| 1/2 | Negative resource-validation fixture | N/A | N/A | Low | [Fixture](../scripts/mockup-contract.test.ts) | Detector findings must distinguish shipped UI from deliberate invalid test input. | The reported broken image is a protocol-relative `srcset` inside a rejection test and is never shipped; no production change required. |

Critical, high, and medium findings must be fixed and covered by a component or
browser regression before pass 2 can pass. A low-severity finding may remain
only with a concrete DESIGN.md-based rationale in the disposition column.

## Authorization boundaries

Local validation does not grant authority to change external systems. Obtain and
record authorization for each operation below before it occurs.

| Operation | Required authorization and precondition | Evidence to record | Status |
| --- | --- | --- | --- |
| Push release files | Explicit approval to push the validated local commits to the approved Git remote and branch. | Commit SHA, remote branch, and clean status after push. | Pending |
| Apply remote D1 migration | Cloudflare credentials, confirmation of the target D1 database, and explicit approval to modify production schema. | Migration output/history showing 0004_benchmarks.sql exactly once. | Pending |
| Deploy catalog Worker | Approval to change the named Worker when its code or configuration changed. | Worker deployment version and binding verification. | Pending |
| Deploy benchmark Worker | Approval to change the named Worker, plus confirmation that its D1/R2 bindings target the approved resources. | Worker version, deployment output, and binding verification. | Pending |
| Trigger controlled benchmark refresh | Approval to run a Cloudflare scheduled or dashboard trigger; never use the Worker fetch endpoint. | Trigger method/time, active revision, source records, R2 snapshot keys, and empty last_error values. | Pending |
| Deploy Pages | Approval to publish the release candidate to the approved Pages project. | Deployment URL and released commit SHA. | Pending |
| Attach canonical domain | Approval and zone access to attach tokenbench.monomind.one while preserving the legacy hostname for redirect. | Domain status and canonical-host verification. | Pending |
| Create redirect rule | Approval and zone access to alter public routing. Rule must preserve path/query, return 301, and exclude preview and localhost hosts. | Rule configuration reference and old-host smoke result. | Pending |
| Production smoke | Approval to access the named production environment after deploy. | Timestamped HTTP/browser outcomes below. | Pending |
| Record and push final evidence | Explicit Git authorization after real deployment evidence exists. | Final documentation commit SHA and push confirmation. | Pending |

## Authorized production sequence

Only an authorized operator may perform this sequence. Stop if an expected
check fails; do not continue to a domain change or public traffic redirect.

1. Complete the local gate and both audit passes. Ensure no critical, high, or
   medium findings remain.
2. Create and push the validated release commit only after Git authorization.
3. Apply the remote migration:

   ~~~sh
   npx wrangler d1 migrations apply ai-plan-catalog --remote
   ~~~

   Confirm 0004_benchmarks.sql is applied once before deploying benchmark code.
4. Deploy a changed catalog Worker when needed and deploy the benchmark Worker:

   ~~~sh
   npx wrangler deploy --config workers/catalog-ingest/wrangler.toml
   npx wrangler deploy --config workers/benchmark-ingest/wrangler.toml
   ~~~

5. Trigger one approved controlled benchmark refresh. The benchmark Worker
   intentionally returns 405 to ordinary fetch requests, so use the approved
   scheduler or dashboard mechanism. Verify a published revision, its source
   records, R2 snapshots, and empty refresh errors before continuing.
6. Build from the committed release tree and deploy Pages:

   ~~~sh
   npm run build
   npx wrangler pages deploy dist --project-name tokenbench
   ~~~

7. Attach the canonical domain and configure the approved legacy-host redirect.
   Do not redirect preview or localhost hosts.
8. Execute and record the production smoke checklist. Push final evidence only
   after all reported values are observed.

## Production smoke checklist

Record the exact request URL, timestamp, response status, and any relevant
header/body evidence. All entries are pending until performed against the
authorized production deployment.

| Check | Expected result | Recorded result |
| --- | --- | --- |
| Canonical home, tools, calculator, guides, leaderboards, and compare hub | HTTP 200 for each canonical route. | Pending |
| Canonical indexable comparison | HTTP 200 with server-rendered H1, title, canonical metadata, and substantive body before JavaScript enhancement. | Pending |
| Reversed valid comparison pair | HTTP 301 to the canonical lexical pair order. | Pending |
| Unknown comparison model or invalid pair | HTTP 404. | Pending |
| Fixed sitemap and comparison sitemap | HTTP 200 with XML; comparison sitemap contains only canonical indexable pairs. | Pending |
| Benchmark API cache validation | First published response supplies ETag; a matching If-None-Match request returns HTTP 304. | Pending |
| Legacy hostname | HTTP 301 to the equivalent tokenbench.monomind.one path and query. | Pending |
| Browser network isolation | No upstream benchmark-provider request appears while using published benchmark UI. | Pending |
| Accessibility and visual evidence | Route matrix and screenshot references are complete; zero unresolved critical/high/medium audit findings. | Pending |

## Deployment evidence

Populate this table only with observed values from the approved release.

| Field | Value |
| --- | --- |
| Release commit SHA | Pending |
| Pages deployment URL | Pending |
| Canonical domain verification | Pending |
| Catalog Worker version | Pending |
| Benchmark Worker version | Pending |
| Applied D1 migration evidence | Pending |
| Active catalog revision | Pending |
| Active benchmark revision | Pending |
| Controlled refresh result | Pending |
| R2 snapshot verification | Pending |
| Production smoke summary | Pending |
| Final evidence commit SHA | Pending |

## Rollback and incident handling

- Stop the rollout when the local gate, migration verification, controlled
  refresh, binding check, domain attachment, redirect, or production smoke check
  fails. Record the failure without replacing it with a planned outcome.
- For a Pages regression, use the authorized Cloudflare rollback mechanism to
  return to the last known-good Pages deployment. Record the deployment selected
  and rerun smoke checks.
- For a Worker regression, deploy the last known-good committed Worker
  configuration only with authorization. Preserve logs and refresh-state errors
  for diagnosis.
- Benchmark publication is revision-based: a failed refresh should leave the
  last published revision active. Do not manually mutate publication-state rows
  or delete R2 evidence as an ad hoc rollback.
- D1 migrations are append-only. Do not attempt destructive rollback SQL; use a
  reviewed forward migration or restore procedure approved for the affected
  production resource.
- A domain or redirect rollback changes public traffic and requires the same
  explicit Cloudflare authorization as the original change.

After any rollback, record the observed state, scope the corrective change, run
the relevant local and production checks again, and update this runbook with
real evidence before a new release attempt.
