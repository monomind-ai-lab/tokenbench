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
