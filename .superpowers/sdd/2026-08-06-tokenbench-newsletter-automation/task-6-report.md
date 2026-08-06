# Task 6 implementation report: factual campaign drafts

## Outcome

Task 6 adds a draft-only monthly newsletter campaign workflow. It constructs
campaign copy from the frozen cheatsheet artifact bytes and canonical revision
facts, verifies every manifest-listed artifact hash before a remote mutation,
and creates only a Brevo email-campaign draft after acquiring a local receipt
lock. It cannot send, test-send, schedule, or create Brevo lists, templates, or
accounts.

## Delivered surfaces

- `src/newsletter/campaign.ts` defines the campaign artifact bundle, factual
  campaign projection, and editorial-variant validation gate.
- `scripts/create-brevo-campaign-draft.ts` provides the direct HTTPS Brevo
  draft adapter, configuration parsing, receipt book/lock lifecycle, atomic
  receipt write, and the `create:newsletter-draft` CLI.
- `.env.example` documents the server-only campaign credentials; `package.json`
  exposes the CLI command.

The campaign projection requires the generated CSV, HTML, newsletter HTML, PDF,
and subject-variant artifacts. It verifies each declared SHA-256 digest, compares
the newsletter HTML and subject variants against the deterministic renderer, and
requires an HTTPS directory base URL before producing the PDF attachment URL.
The CSV is hash-verified with the rest of the artifact bundle but is not added as
an unsupported Brevo campaign field; the approved draft payload carries the PDF
URL specified by the task brief.

## Safety boundaries

- The only remote URLs reachable by the adapter are bounded paginated
  `GET /v3/emailCampaigns` reconciliation, `POST /v3/emailCampaigns` creation
  when no exact draft exists, and `GET /v3/emailCampaigns/{id}` verification.
- The POST payload has an exact monthly-cheatsheet list mapping from server-only
  configuration and intentionally omits schedule/send/test fields.
- A returned campaign must have the same ID and `draft` status before an atomic
  local receipt is recorded. Matching receipts and held locks fail before fetch.
- Errors and CLI stderr use fixed messages or HTTP status only; they do not emit
  API keys, request/response bodies, or email addresses.
- Optional editorial text has no model/API call. Its validator rejects unknown
  fact IDs, model names, numeric/count/price claims, rank claims, unreviewed
  revisions, and markup.

## Test-first evidence

The new campaign module and draft script began as missing imports in focused
tests. Each feature was then taken through RED/GREEN cycles for factual payload
projection, editorial validation, draft-only POST/GET behavior, idempotent
receipts, typed upstream errors, configuration parsing, receipt locking, artifact
hash preflight, and safe CLI output. Later regressions caught malformed receipt
IDs, mismatched returned campaign IDs, unreviewed fact IDs, unknown named models,
and spelled-out unreviewed counts.

## Verification

```text
npm test -- src/newsletter/revision-diff.test.ts src/newsletter/cheatsheet.test.ts \
  scripts/generate-monthly-cheatsheet.test.ts src/newsletter/campaign.test.ts \
  scripts/create-brevo-campaign-draft.test.ts
  5 files passed; 97 tests passed.

npm run lint
  tsc --noEmit passed.

npm run create:newsletter-draft -- --manifest fixture.json
  exited 1 with the generic safe message; no network request is possible before
  the required arguments/configuration are present.

git diff --check
  passed.
```

All automated draft tests use injected mocked fetch implementations. No live
Brevo call, schedule, send, upload, account/list/template mutation, or external
deployment was performed.

## Review fix round 1

Reviewed head: `8429ab8`.

The trust boundary now requires a canonical
`tokenbench-cheatsheet-deployment-receipt/v1` signed with the runtime-trusted
Task 5 Ed25519 SPKI key. Its signature covers the full previous/current/change
envelope, artifact manifest, declared byte sizes and SHA-256 hashes, immutable
revision/hash URLs, and exact artifact URL inventory. The local manifest,
changes envelope, published base URL, and bounded no-follow artifact reads must
all agree with that receipt before Brevo is queried.

The campaign state is now a durable v2 pending outbox. An exclusive no-follow
lock spans reconciliation and mutation; a pending record is atomically written,
file-fsynced, renamed, and directory-fsynced before POST. Every first attempt or
retry performs bounded read-only draft-list reconciliation. An exact remote
draft is fetched and fully compared with the deterministic payload before its
receipt is fsynced; an ambiguous POST leaves pending state, and a retry either
reconciles the exact draft or refuses a second POST. Requests use only the
official email-campaign list/create/detail endpoints, reject redirects, carry a
10-second timeout, and never send, test-send, or schedule.

Editorial input is limited to the allowlisted template ID and the complete,
ordered set of reviewed claim IDs. Subject, preview, HTML, and download links
are rendered internally from verified facts. Raw prose, injected facts,
missing/duplicate facts, control characters, and unreviewed numbers are not an
accepted editorial surface.

Round-one verification evidence:

```text
npm test -- src/newsletter/revision-diff.test.ts src/newsletter/cheatsheet.test.ts \
  scripts/generate-monthly-cheatsheet.test.ts src/newsletter/campaign.test.ts \
  scripts/create-brevo-campaign-draft.test.ts
  5 files passed; 105 tests passed.

npm test
  65 files passed; 857 tests passed.

npm run lint
  tsc --noEmit passed.

git diff --check
  passed.
```

Evidence SHA-256 values before commit:

```text
b4b2c048959702054953cab651ae9bffa0ad6adcd6420d1b1c8a6b1b9f7b658f  src/newsletter/campaign.ts
19893940617ae15ce032d4337a47a44eada21d6d626aff932cba673f6613bf4f  scripts/create-brevo-campaign-draft.ts
8c860b38379742ada58737ec18115bcaa2c8b772684eaea250498b3b0eb48959  src/newsletter/campaign.test.ts
41f5e6a695445f2b54b2df376bab933b36080d409417f43254e144c8b51f6826  scripts/create-brevo-campaign-draft.test.ts
```

All Brevo behavior, including crash, ambiguous-response, retry,
reconciliation, redirect, pagination, concurrency, and fsync ordering paths,
was tested with injected mocks. No live network request was made. The managed
`progress.md` file was not edited.

## Review fix round 2

Reviewed head: `4c98ef0`.

The low-level Brevo mutation helpers are now private module implementation
details. The only exported mutation workflow requires the trusted signed
deployment receipt, verifies the complete local artifact bundle, and owns the
durable reconciliation/lock/state lifecycle. Runtime arguments are exact and no
longer accept a caller-selected receipt or lock filename. Instead, the workflow
derives one canonical `campaigns/<sha256(dedupeKey)>` directory beneath the
trusted state root with fixed `pending.json`, `receipt.json`, and `draft.lock`
children.

Locks now contain a strict schema, process ID, canonical start time, dedupe
fingerprint, and random ownership token. A lock is reclaimed only after both a
15-minute bound and a dead-owner check succeed. Reclamation and release use
atomic rename/identity checks, restore a concurrently replaced lock without
overwriting it, never steal a live owner, and recheck ownership before the POST
and every durable state transition. Tests cover a real terminated child owner,
a live old owner, a recent dead owner, stale-lock replacement, and live-lock
replacement after POST.

Artifact and state operations retain opened canonical root handles and capture
ancestor device/inode identities. Roots and ancestors are revalidated by
device, inode, type, symlink status, and realpath before and after leaf opens,
state renames, and directory syncs; leaves use `O_NOFOLLOW`. An adversarial test
replaces the canonical campaign state directory with a symlink after POST and
proves that no receipt is written through the replacement.

Brevo verification now consumes realistic documented list/detail shapes rather
than a POST-echo fixture. It requires `type: classic`, `status: draft`, exact
name and deterministic payload fields, expanded sender identity, exact recipient
lists/exclusions, no schedule, and the expected campaign ID before recording a
receipt. Immediately before POST, the adapter reapplies its exact-key payload
grammar, C0/CRLF, header length, HTML byte-size, attachment URL, sender, and
monthly-list-only constraints.

Round-two RED/GREEN evidence included failures for the exported mutation bypass,
documented Brevo response normalization, overlong destination fields, dead-owner
lock recovery, stale-lock replacement, live-lock replacement, and state ancestor
replacement before their respective fixes. All Brevo requests remained injected
mocks; the only documentation lookup used the official Brevo create/list/detail
API references. No live Brevo request or other external mutation was performed.

Round-two verification evidence:

```text
npm test -- src/newsletter/revision-diff.test.ts src/newsletter/cheatsheet.test.ts \
  scripts/generate-monthly-cheatsheet.test.ts src/newsletter/campaign.test.ts \
  scripts/create-brevo-campaign-draft.test.ts
  5 files passed; 114 tests passed.

npm test
  65 files passed; 866 tests passed.

npm run lint
  tsc --noEmit passed.

git diff --check
  passed.
```

Evidence SHA-256 values before commit:

```text
b0df17e5faa85c1ceceab7476255a23cf922338528a2e2c017d7546047e5bd6d  scripts/create-brevo-campaign-draft.ts
d6e7c65ad843a78344e1f781a318d17df27c6fcb5da231ab362d69d071508ba5  scripts/create-brevo-campaign-draft.test.ts
```

The checked-in plan, operator documentation, `.env.example`, and managed
`progress.md` were not modified in this round.

## Review fix round 3

Reviewed head: `6c9276b`.

Durable state publication no longer uses POSIX `rename`, which can replace a
destination created after the preceding absence check. Each fsynced temporary
state file is now atomically hard-linked into its fixed destination. `link`
fails with `EEXIST` without modifying the racer-owned destination; only after a
successful identity-checked install is the temporary link removed and the
opened state directory fsynced. Existing root, ancestor, leaf no-follow, and
device/inode checks remain in force, and the `finally` cleanup removes the
temporary link on collision and other ordinary failures.

Two deterministic filesystem-boundary tests interpose an independent `wx`
write immediately before the production install for `pending.json` and
`receipt.json`. Against the reviewed `rename` implementation both tests were
RED because the workflow resolved successfully and overwrote the independently
installed state. With no-clobber installation both are GREEN: the workflow
returns `EEXIST`, the racer bytes remain exact, no `.tmp` file remains, a pending
collision performs zero POSTs, and a receipt collision preserves the durable
pending record after exactly one mocked POST.

The original safety-boundary prose was also corrected: reconciliation may issue
bounded paginated campaign-list GETs before creation and campaign-detail GETs
for exact candidates, rather than exactly one GET per workflow.

Round-three verification evidence:

```text
npm test -- --run scripts/create-brevo-campaign-draft.test.ts \
  -t 'final-install boundary'
  RED: 2 tests failed because both workflows resolved and overwrote racer state.
  GREEN: 2 tests passed; 36 tests skipped.

npm test -- src/newsletter/revision-diff.test.ts src/newsletter/cheatsheet.test.ts \
  scripts/generate-monthly-cheatsheet.test.ts src/newsletter/campaign.test.ts \
  scripts/create-brevo-campaign-draft.test.ts
  5 files passed; 116 tests passed.

npm test
  65 files passed; 868 tests passed.

npm run lint
  tsc --noEmit passed.

git diff --check
  passed.
```

Evidence SHA-256 values before commit:

```text
72f3898aab790ff2c38a8ecbcb8e5bfa1a8b0d6c852dfc6200e00f93fb0c59d0  scripts/create-brevo-campaign-draft.ts
eceea0a67cb8211ccf517d7c747fe95ec403595b68cf518323aa49d3da7cf4e9  scripts/create-brevo-campaign-draft.test.ts
```

No live Brevo request was made. The checked-in plan, `.env.example`, and managed
`progress.md` were not modified in this round.
