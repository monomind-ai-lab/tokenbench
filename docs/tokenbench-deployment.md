# TokenBench deployment runbook

## Status and scope

This runbook is an evidence template and release procedure for TokenBench. At
creation, it contains no completed Task 14 release evidence: no full local gate,
Impeccable audit, remote migration, Worker deployment, controlled refresh, Pages
deployment, domain change, redirect, or production smoke test has been recorded.

Do not replace pending fields with estimates, planned values, screenshots from a
different build, or copied dashboard data. Record only observed evidence from
the committed release candidate and the approved production target.

The canonical production origin is https://tokenbench.monomind.one. The legacy
ai-plans.monomind.one hostname is retained only long enough to redirect each
path and query to the canonical host with HTTP 301.

## Release inputs

| Input | Required evidence | Current status |
| --- | --- | --- |
| Release commit | Commit SHA, clean scoped diff, and approved branch/remote target. | Pending |
| Design baseline | [../DESIGN.md](../DESIGN.md) reviewed during both UX/UI passes. | Pending review |
| Data-source policy | [data-sources.md](data-sources.md) reviewed for source, attribution, and Artificial Analysis restrictions. | Pending review |
| Data-plane configuration | Root and Worker Wrangler bindings checked against the approved Cloudflare target. | Pending |
| Comparison implementation | Integrated Pages Function, dynamic sitemap, canonicalization tests, and browser coverage. | Pending integration/verification |

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
git diff --check
git status --short
~~~

| Gate | Required outcome | Recorded result |
| --- | --- | --- |
| Unit and API tests | Exit 0. | Pending; not run by this documentation-only stream. |
| Type check | Exit 0. | Pending; not run by this documentation-only stream. |
| Production build | Exit 0. | Pending; not run by this documentation-only stream. |
| Responsive browser suite | Exit 0 across the expanded route, viewport, theme, and state matrix. | Pending; not run by this documentation-only stream. |
| Diff check | Exit 0 with only intentional files. | Pending as a full release gate; a documentation-only diff check is not release evidence. |
| Final worktree inspection | No unintended changes before the authorized release commit. | Pending. |

The release gate must be rerun after integrating comparison, sitemap, browser,
and configuration changes. A passing command from an earlier commit does not
qualify a later release candidate.

## UX/UI audit matrix

Use the installed Impeccable skill for two passes against the production build.
For every route below, inspect 320, 375, 768, 1024, and 1440 CSS-pixel widths in
both light and dark themes. Capture evidence from the release candidate; do not
claim a screenshot exists until its path or immutable review reference is added.

| Route or state | Viewports | Themes | Pass 1 | Pass 2 | Evidence |
| --- | --- | --- | --- | --- | --- |
| Home: / | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Tools: /tools/ | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Calculator: /tools/subscriptions-vs-apis/ | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Leaderboard directory: /leaderboards/ | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Data-dense LLM leaderboard | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Media leaderboard | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Compare hub: /compare/ | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Canonical indexable comparison selected from the active revision | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| Guide hub: /guides/ | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |
| One generated guide article | 320, 375, 768, 1024, 1440 | Light, dark | Pending | Pending | Not captured |

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

No findings are recorded yet because neither audit pass has run.

| Pass | Route | Viewport | Theme | Severity | Evidence screenshot or reference | Expected behavior | Disposition and regression test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| To record after audit | To record | To record | To record | To record | To record | To record | To record |

Critical, high, and medium findings must be fixed and covered by a component or
browser regression before pass 2 can pass. A low-severity finding may remain
only with a concrete DESIGN.md-based rationale in the disposition column.

## Authorization boundaries

Local validation does not grant authority to change external systems. Obtain and
record authorization for each operation below before it occurs.

| Operation | Required authorization and precondition | Evidence to record | Status |
| --- | --- | --- | --- |
| Commit and push release files | Explicit approval to create the scoped commit and push to the approved Git remote and branch. | Commit SHA, remote branch, and clean status after push. | Pending |
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
