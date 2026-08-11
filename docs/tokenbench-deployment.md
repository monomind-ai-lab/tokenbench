# TokenBench deployment runbook

## Status and scope

This runbook records the completed local release-candidate checks for TokenBench
on 2026-08-06. The comparison implementation,
expanded browser matrix, accessibility smoke pass, two Impeccable UX/UI passes,
and a retained production-preview confirmation are complete. The progress board
is managed separately and is not release evidence.

Production API smoke exposed intermittent Cloudflare 1102 CPU failures in
request-time full-fact derivation. The merged release replaces those paths with
revisioned materialized responses and bounded targeted reads. A production
benchmark refresh then exposed D1's 32 MiB aggregate RPC limit; the follow-up
hotfix stages inactive rows in 16 MiB-bounded calls and promotes both public
pointers in one guarded transaction. The Pages build, migrations through 0006,
and both Worker builds are deployed. Controlled cache publication and final
production smoke passed on the Pages production hostname. The canonical
custom-domain cutover completed on 2026-08-10; legacy-host removal remains
pending and is outside this cutover.

Do not replace pending fields with estimates, planned values, screenshots from a
different build, or copied dashboard data. Record only observed evidence from
the committed release candidate and the approved production target.

The canonical production origin is https://tokenbench.monomind.one. The legacy
ai-plans.monomind.one custom domain and its exact DNS record are removed during
cutover; the underlying legacy Pages project is retained.

## Fetch cadence decision

Keep the checked-in catalog cadence: OpenRouter and OpenCode each refresh four
times per day. Keep benchmark ingestion at twice per day: LMArena and LiteLLM
refresh on both runs, while BenchLM completes at most one successful upstream
network check per UTC calendar day and otherwise reuses its verified immutable
projections. The daily BenchLM lease prevents overlapping cron or controlled
invocations from checking upstream twice. The owner persists a hash-checked
five-artifact daily manifest before completing the lease; failures before that
point release it, while later LMArena, LiteLLM, or publication failures keep the
verified BenchLM check complete for same-day reuse. An overlapping loser checks
every 500 ms for up to 10 seconds to rehydrate the winner's manifest or reclaim
a released lease, and fails before downstream fetches or publication if neither
happens. The shorter polling bound reserves the remaining Workers Paid
1,000-query invocation allowance for maximum-size publication and cleanup. A
304 updates daily check freshness without creating a content revision. The
observed release failures were request-time CPU exhaustion and D1's aggregate
32 MiB RPC limit, not upstream throttling; no 429 pattern was observed. Reduce
an upstream fetch cadence only after repeated provider-policy or rate-limit
evidence. If an upstream becomes unstable without 429s, lower fetch concurrency
before lowering freshness. Manual catalog rotations do not make upstream
requests.

## Release inputs

| Input | Required evidence | Current status |
| --- | --- | --- |
| Release commit | Commit SHA, clean scoped diff, and approved branch/remote target. | Merged PRs #7 and #8; release merge is `65424e4`, with the Worker hotfix at `a857a6a`. |
| Design baseline | [../DESIGN.md](../DESIGN.md) reviewed during both UX/UI passes. | Reviewed in both passes; dark technical hierarchy and the approved light-mode adaptation verified. |
| Data-source policy | [data-sources.md](data-sources.md) reviewed for source, attribution, and Artificial Analysis restrictions. | Reviewed; source allowlists, visible attribution, and the Artificial Analysis prohibition remain intact. |
| Data-plane configuration | Root and Worker Wrangler bindings checked against the approved Cloudflare target. | D1/R2 bindings and production target verified during the Worker deploy; migration history contains 0001-0006 exactly once. |
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
| Unit and API tests | Exit 0. | Pass: 43 files, 517 tests. |
| Type check | Exit 0. | Pass: `tsc --noEmit`. |
| Production build | Exit 0. | Pass: Vite built 23 crawlable fixed pages and the application bundle. |
| Responsive browser suite | Exit 0 across the expanded route, viewport, theme, and state matrix. | Pass: 42/42 Playwright tests, including 100 primary-route navigations. |
| Production-preview browser suite | Build first, serve only generated `dist` assets, and exit 0 across the same suite. | Pass: 42/42 Playwright tests, including 100 primary-route navigations. See the [retained production-preview audit](audit-evidence/2026-08-06/production-preview-audit.md). |
| Diff check | Exit 0 with only intentional files. | Pass on the exact merged implementation tree. |
| Final worktree inspection | No unintended changes before an authorized push. | Clean after merging PR #8 and fast-forwarding local `main`; documentation changes are isolated on `codex/deployment-evidence`. |

The release gate must be rerun after integrating comparison, sitemap, browser,
and configuration changes. A passing command from an earlier commit does not
qualify a later release candidate.

## Newsletter and monthly cheatsheet operations

This section is a local runbook, not authorization to create Brevo resources,
publish files, enable a scheduler, or send email. Keep all identifiers,
credentials, recipient data, and receipt backups out of Git, browser bundles,
logs, screenshots, and this document.

### One-time operator verification

An operator with separate Brevo authorization verifies the setup without
recording values here:

1. Create or identify a dedicated monthly-cheatsheet list and a distinct
   model-and-price-alerts list. The alerts list represents optional consent only;
   it is never a fallback recipient list for the monthly campaign.
2. Prepare and review a Brevo double-opt-in template. It must use the verified
   TokenBench sender, add contacts only after confirmation, use the approved
   canonical confirmation redirect, and expose the required unsubscribe or
   preference-management destination in delivered mail.
3. Verify the campaign sender in Brevo and review its unsubscribe/settings
   page. The recipient list used by the monthly campaign is the monthly list
   only; alerts never receive a campaign just because they opted into alerts.
4. Store the Pages-only double-opt-in bindings (`BREVO_API_KEY`, monthly and
   alerts list IDs, DOI template ID, and DOI redirect URL) as protected Pages
   secrets. Store the campaign credential, sender configuration, monthly list
   ID, Ed25519 verification key, artifact root, and private state root only in
   the local/CI environment that is authorized to create a draft. No value is a
   `VITE_` variable. The corresponding local names are
   `BREVO_CAMPAIGN_API_KEY`, either `BREVO_CAMPAIGN_SENDER_ID` or the sender
   name/email pair, `BREVO_CAMPAIGN_MONTHLY_CHEATSHEET_LIST_ID`,
   `TOKENBENCH_PUBLICATION_VERIFY_KEY`, `TOKENBENCH_NEWSLETTER_ARTIFACT_ROOT`,
   and `TOKENBENCH_NEWSLETTER_STATE_ROOT`; record none of their values here.
   The same `TOKENBENCH_PUBLICATION_VERIFY_KEY` is required by the cheatsheet
   generator to validate the frozen prior-publication receipt in the changes
   envelope and by the draft CLI to validate the signed deployment receipt.
5. Confirm that `/api/newsletter/subscribe` stays browser-only: it requires an
   `Origin` equal to the request URL origin, accepts JSON only, and returns a
   generic response. Direct scripts, back-office servers, and cross-origin
   callers are intentionally unsupported.

The UI always requests double opt-in. The footer's monthly offer is the base
audience and its alert checkbox starts unchecked. The Compare prompt begins
with that same unchecked optional alert consent, then discloses the monthly
cheatsheet before submission. Never infer alert permission from an address,
from a monthly signup, or from a comparison viewed.

### Local, deterministic artifact generation

Work from one frozen published benchmark/catalog revision and its verified
changes envelope. Use explicit local snapshot paths and a new output directory;
the example placeholders below are intentionally not production paths:

~~~sh
npm run generate:cheatsheet -- \
  --benchmarks inputs/frozen-benchmarks.json \
  --catalog inputs/frozen-catalog.json \
  --changes inputs/revision-changes.json \
  --artifact-root newsletter-artifacts \
  --out-dir newsletter-artifacts/2026-08-frozen \
  --share-image
~~~

Run the generator a second time with the same inputs and another new output
directory. Compare the two manifests' revision, catalog revision, filenames,
byte counts, and SHA-256 values before any human review. Retain both manifests
and the changes envelope as local evidence. A mismatch, a stale/non-published
input, or an overwrite attempt is a stop condition—not a reason to hand-edit an
artifact.

This command writes only local artifacts. It does not upload them, put them at
a public URL, create a Brevo list or template, schedule work, create a campaign,
or send email.

### Separately authorized artifact publication and Brevo draft

Publishing the reviewed artifact bundle is a separate, explicitly authorized
operation. It must create immutable public HTTPS URLs for every receipt-listed
file, especially the PDF and CSV, then generate a signed deployment receipt
that names that exact base URL. The receipt's `artifactBaseUrl` must be an
HTTPS trailing-slash URL whose path includes both `manifest.revision` and
`sha256-<canonical-manifest-hash>` (the SHA-256 hex digest of the canonical
manifest JSON). Do not point a receipt at mutable "latest" paths, private URLs,
redirects of unknown provenance, or an unverified CDN response.

Only after that publication and a human factual/editorial review may an
authorized operator create a draft. The `--changes` path below names the exact
verified input envelope retained under the artifact root; it is not a generated
cheatsheet file. All three file arguments are relative to
`TOKENBENCH_NEWSLETTER_ARTIFACT_ROOT`; the distinct, private
`TOKENBENCH_NEWSLETTER_STATE_ROOT` contains only the CLI's internal locks and
verified receipts. The shell guard deliberately refuses to run until an
operator has copied the exact `artifactBaseUrl` from the already verified,
signed deployment receipt—do not construct it by hand:

~~~sh
: "${TOKENBENCH_SIGNED_ARTIFACT_BASE_URL:?copy the signed receipt artifactBaseUrl verbatim}"
npm run create:newsletter-draft -- \
  --manifest 2026-08-frozen/tokenbench-cheatsheet.manifest.json \
  --changes inputs/revision-changes.json \
  --deployment-receipt receipts/2026-08-frozen-deployment.json \
  --artifact-base-url "$TOKENBENCH_SIGNED_ARTIFACT_BASE_URL"
~~~

The command verifies the signed receipt, local file hashes, immutable public
artifact URLs, and campaign dedupe state before creating or reconciling a
Brevo **draft**. It neither uploads artifacts nor calls test-send, schedule, or
send endpoints. Creating a draft is still a remote Brevo mutation and needs its
own authorization; approving, scheduling, or sending that draft is a separate
human action outside this repository.

Deploying the catalog, configuring Pages, and deploying the signup endpoint do
not provision or mutate Brevo resources. Once pre-existing DOI configuration is
present, a user-initiated browser signup can request that DOI flow, but it
cannot create a sender, list, template, or campaign. The explicitly and
separately authorized draft CLI above is the only operator command here that
intentionally creates or reconciles a remote Brevo campaign draft.

Back up the private state root—including receipt and dedupe records—before key
rotation or changing the environment. Retain it with access controls sufficient
to prove that a frozen revision was not drafted twice. Rotate the Ed25519
verification key only alongside a verified backup of the receipts it validates;
do not delete or recreate state merely to retry an ambiguous draft.

### Non-activated monthly automation blueprint

No monthly scheduler is created or enabled by this implementation. If one is
later approved, recommend a UTC trigger only after the historical benchmark
snapshot for that period is available. Each run must:

1. Freeze exactly one active benchmark/catalog revision and its revision diff.
2. Generate and hash the artifact bundle twice from those same inputs.
3. Require human factual review of the subject/preview facts and human editorial
   review of any optional variant that already passed the fact-validation gate.
4. Hand the approved immutable bundle to a separately authorized publication
   job, then verify the signed public receipt and URLs.
5. Create a Brevo draft only after a separately authorized draft operation;
   a human must still decide whether to schedule or send it.

Do not create the trigger, upload job, template, list, campaign, schedule, or
send action as part of this blueprint. Record authorizations and observed
outcomes in the deployment evidence rather than treating a local command as
approval.

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
| Push release files | Explicit approval to push the validated local commits to the approved Git remote and branch. | Commit SHA, remote branch, and clean status after push. | Authorized 2026-08-06 |
| Apply remote D1 migration | Cloudflare credentials, confirmation of the target D1 database, and explicit approval to modify production schema. | Migration output/history showing 0004_benchmarks.sql, 0005_api_response_cache.sql, and 0006_benchmark_publication_ownership.sql exactly once. | Authorized 2026-08-06 |
| Deploy catalog Worker | Approval to change the named Worker when its code or configuration changed. | Worker deployment version and binding verification. | Authorized 2026-08-06 |
| Deploy benchmark Worker | Approval to change the named Worker, plus confirmation that its D1/R2 bindings target the approved resources. | Worker version, deployment output, and binding verification. | Authorized 2026-08-06 |
| Trigger controlled benchmark refresh | Approval to run a Cloudflare scheduled or dashboard trigger; never use the Worker fetch endpoint. | Trigger method/time, active revision, source records, R2 snapshot keys, and empty last_error values. | Authorized 2026-08-06 |
| Deploy Pages | Approval to publish the release candidate to the approved Pages project. | Deployment URL and released commit SHA. | Authorized 2026-08-06 |
| Attach canonical domain | Approval and zone access to attach tokenbench.monomind.one. | Domain status and canonical-host verification. | Authorized 2026-08-06 |
| Remove legacy hostname | Approval and zone access to detach only ai-plans.monomind.one and remove its exact DNS record while retaining the legacy Pages project. | Domain attachment, DNS, and old-host verification. | Authorized 2026-08-06 |
| Production smoke | Approval to access the named production environment after deploy. | Timestamped HTTP/browser outcomes below. | Authorized 2026-08-06 |
| Record and push final evidence | Explicit Git authorization after real deployment evidence exists. | Final documentation commit SHA and push confirmation. | Authorized 2026-08-06 |

## Authorized production sequence

Only an authorized operator may perform this sequence. Stop if an expected
check fails; do not continue to a domain change or hostname removal.

1. Complete the local gate and both audit passes. Ensure no critical, high, or
   medium findings remain.
2. Create and push the validated release commit only after Git authorization.
3. Apply the remote migration:

   ~~~sh
   npx wrangler d1 migrations apply ai-plan-catalog --remote
   ~~~

   Confirm 0004_benchmarks.sql through 0006_benchmark_publication_ownership.sql are applied once
   before deploying changed ingestion or Pages code.
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

7. Attach the canonical domain. Detach only the approved legacy custom domain
   and remove its exact DNS record; retain the legacy Pages project.
8. Execute and record the production smoke checklist. Push final evidence only
   after all reported values are observed.

### Release 1 benchmark reliability gate

For the evidence/scores reliability release, the generic sequence above is not
sufficient by itself. Record each result below from one committed tree and stop
at the first failure:

1. Deploy `workers/benchmark-ingest` first and record its version plus commit.
2. Trigger one authorized controlled refresh using the existing Cloudflare
   scheduler/dashboard mechanism. Record the trigger time and active revision;
   do not send a fetch request to the Worker.
3. Fetch the production summary and coding leaderboard JSON. Confirm HTTP 200,
   non-empty attribution, and the same `revision` value in both responses.
4. In the coding response, locate model slug `gpt-5-6-sol` and record metric
   value `77.95`, metric rank `3`, and source rank `3`. Confirm the rendered
   coding route shows `78.0` and position `#3`; confirm the overall route shows
   the reviewed overall value `81.5` (source value `81.48`).
5. Run `npm run test:browser:local-preview` before production deployment. Its
   local-only `x-tokenbench-preview-state` fixtures must prove both 503 and
   corrupt-envelope recovery without mutating production D1 or cache rows.
6. Deploy Pages from the same commit only after the Worker refresh/API checks
   pass. Record the Pages deployment URL and commit.
7. Validate Home, `/leaderboards/llm/coding/`, and
   `/leaderboards/llm/overall/` at compact and desktop widths. Require visible
   published evidence, no unavailable placeholder while a last-good revision
   exists, the exact browser-fallback banner, canonical/title/description meta
   tags, a secondary Share Leaderboard dialog containing the canonical URL,
   Methodology and Privacy (but no Data sources) in the footer, and no document
   overflow.
8. Inspect fallback records by bounded correlation ID. The only event names are
   `benchmark_fresh_cache_failed`, `benchmark_active_revision_failed`,
   `benchmark_stale_fallback_selected`, and `benchmark_unavailable`. Allowed
   fields are `event`, `endpoint`, `queryId`, `cacheScope`, `cacheKey`, `stage`,
   `errorClass`, optional `activeRevision`, optional `fallbackRevision`,
   `fallbackSelected`, and `correlationId`. Reject evidence containing response
   bodies, request bodies, raw query strings, credentials, cookies, email
   addresses, full URLs, or raw D1/provider errors.

If the refresh fails because a BenchLM public row has no unique `models.json`
match, retain the prior active revision and reconcile source identities. The
strict one-to-one join is intentional; do not skip ambiguous rows or publish a
partial bundle as an incident workaround.

## Production smoke checklist

Record the exact request URL, timestamp, response status, and any relevant
header/body evidence. All entries are pending until performed against the
authorized production deployment.

| Check | Expected result | Recorded result |
| --- | --- | --- |
| Canonical home, tools, calculator, guides, leaderboards, and compare hub | HTTP 200 for each canonical route. | Pass on `https://tokenbench.monomind.one` at 2026-08-10 01:34 UTC: home, tools, calculator, guides, leaderboard directory/detail, compare hub/detail, and fixed sitemap returned HTTP 200. |
| Canonical indexable comparison | HTTP 200 with server-rendered H1, title, canonical metadata, and substantive body before JavaScript enhancement. | Pass on the canonical hostname: HTTP 200 with one server-rendered H1, canonical metadata, and a substantive 42,394-byte response. |
| Reversed valid comparison pair | HTTP 301 to the canonical lexical pair order. | Pass: HTTP 301 to `/compare/claude-opus-5-vs-gpt-5-6-sol`. |
| Unknown comparison model or invalid pair | HTTP 404. | Pass: HTTP 404. |
| Fixed sitemap and comparison sitemap | HTTP 200 with XML; comparison sitemap contains only canonical indexable pairs. | Pass: both fixed and comparison sitemaps return HTTP 200; comparison entries derive from the 32 active indexable pairs. |
| Benchmark API cache validation | First published response supplies ETag; a matching If-None-Match request returns HTTP 304. | Pass: ETag present and exact conditional request returned HTTP 304. |
| Request CPU resilience | Repeated cold/warm catalog, summary, and all UI leaderboard requests return 200/304 with zero 1102 events in a Pages tail. Run at least 20 rounds after cache seed. | Pass: 360/360 tailed requests across 20 rounds returned HTTP 200, with no Pages error-tail event. |
| Paginated leaderboard CPU resilience | The largest materialized leaderboard projection returns 200 for `limit=1`, `limit=200`, and at least one valid cursor request, repeated cold/warm with zero 1102 events. | Pass in every stress round for `limit=1`, `limit=200`, and a valid cursor. |
| Legacy hostname | The custom-domain attachment and exact DNS record are absent; the legacy Pages project remains available at its pages.dev hostname. | Pending |
| Browser network isolation | No upstream benchmark-provider request appears while using published benchmark UI. | Pending |
| Accessibility and visual evidence | Route matrix and screenshot references are complete; zero unresolved critical/high/medium audit findings. | Pass: retained 42/42 source and 42/42 production-preview browser suites and linked audit evidence. |

## Deployment evidence

Populate this table only with observed values from the approved release.

| Field | Value |
| --- | --- |
| Release commit SHA | `f58d920f250922b000a9d55adf0015443d165b0f` |
| Pages deployment URL | `https://57e50712.tokenbench-27t.pages.dev` immutable deployment; `https://tokenbench-27t.pages.dev` production. Cloudflare records deployment `57e50712-7bc9-4fff-a570-3da0088a838a` as successful for the release commit. |
| Canonical domain verification | Active on 2026-08-10: Pages domain, DNS verification, and HTTP certificate validation all report `active`; HTTPS production smoke passed on `https://tokenbench.monomind.one`. |
| Catalog Worker version | `4b87c50b-286b-41fc-bb2c-7a7ddedaf0a0` |
| Benchmark Worker version | `5dbf76ae-07a6-4c4c-9094-1c8a1e996874` |
| Applied D1 migration evidence | Remote history contains 0001-0006 exactly once; 0006 applied at 2026-08-06 05:27:21 UTC. |
| Active catalog revision | `rev_20260806042720324_60e3d2562f08+manual-bootstrap-2026-08-04`; 55 cache keys, 110 chunks, fresh/stale variants. |
| Active benchmark revision | `benchmark_92e723cb7f6b6e87056d76e017b76eca`, observed from the canonical benchmark API during the 2026-08-10 cutover verification. |
| Controlled refresh result | Pass: deployed Cron completed in 21.424 s with outcome `ok`; benchmark cache has 75 keys, 150 chunks, two variants, zero invalid chunk groups, and a maximum chunk length of 1,323,595 characters. The normal `15 */12 * * *` schedule was restored and verified. |
| R2 snapshot verification | Pass: all 23 active source snapshot keys are reachable; active-source refresh state has zero errors and zero revision mismatches. |
| Production smoke summary | Pages production and the canonical hostname passed API/UI/cache/comparison/sitemap checks. The canonical API supplied an ETag and returned HTTP 304 for the matching conditional request; the reversed comparison returned HTTP 301 to the canonical pair and an unknown pair returned HTTP 404. Legacy-host removal remains pending. |
| Final evidence commit SHA | Pending |

## Rollback and incident handling

- Stop the rollout when the local gate, migration verification, controlled
  refresh, binding check, domain attachment, hostname removal, or production smoke check
  fails. Record the failure without replacing it with a planned outcome.
- For a Pages regression, use the authorized Cloudflare rollback mechanism to
  return to the last known-good Pages deployment. Record the deployment selected
  and rerun smoke checks.
- For a Worker regression, deploy the last known-good committed Worker
  configuration only with authorization. Preserve logs and refresh-state errors
  for diagnosis.
- Benchmark publication is revision-based: a failed refresh should leave the
  last published revision active. A failed attempt may leave immutable R2
  evidence or a completed BenchLM daily manifest without moving the publication
  pointer; same-day retries verify and reuse that manifest. Do not manually
  mutate publication-state rows or delete R2 evidence as an ad hoc rollback.
- D1 migrations are append-only. Do not attempt destructive rollback SQL; use a
  reviewed forward migration or restore procedure approved for the affected
  production resource.
- A domain or hostname rollback changes public traffic and requires the same
  explicit Cloudflare authorization as the original change.

After any rollback, record the observed state, scope the corrective change, run
the relevant local and production checks again, and update this runbook with
real evidence before a new release attempt.
