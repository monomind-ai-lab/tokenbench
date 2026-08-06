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

- The only remote URLs reachable by the adapter are `POST /v3/emailCampaigns`
  and a single `GET /v3/emailCampaigns/{id}` verification request.
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
