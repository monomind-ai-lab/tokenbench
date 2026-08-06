# TokenBench Newsletter and Cheatsheet Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe Brevo double-opt-in signup and reproducibly generate monthly TokenBench PDF/CSV cheatsheets, change alerts, and Brevo campaign drafts from frozen published data.

**Architecture:** Keep Brevo behind server-only adapters and Pages Functions. Build artifacts and campaign payloads from pure typed fact projections; use direct HTTPS calls rather than a runtime SDK, and keep campaign sending disabled so automation stops at an auditable draft until separately authorized.

**Tech Stack:** TypeScript 5.8, Cloudflare Pages Functions, React 19, Vitest, Testing Library, existing Playwright Chromium, Brevo v3 REST API.

## Global Constraints

- All marketing signup uses double opt-in.
- The alerts preference is unchecked by default and maps to a separate list/consent scope.
- Brevo API keys and list/template identifiers never enter browser bundles or logs.
- Browser responses do not reveal whether an email already exists.
- Numbers, ranks, model names, and prices are deterministic outputs of a frozen TokenBench revision.
- Optional AI-written headlines cannot change or introduce data facts.
- Initial automation creates drafts only; automatic sending is out of scope.
- Missing Brevo configuration disables signup safely without losing or pretending to accept an address.
- No Brevo account, list, template, campaign, or remote schedule is created without deployment credentials and separate operational authorization.

---

## File ownership

This plan owns:

- `functions/_shared/brevo.ts`, `functions/_shared/brevo.test.ts`
- `functions/api/newsletter/subscribe.ts`, `functions/api/newsletter/subscribe.test.ts`
- `src/frontend/newsletter-signup.tsx`, `src/frontend/newsletter-signup.test.tsx`
- `src/newsletter/contracts.ts`, `src/newsletter/contracts.test.ts`
- `src/newsletter/revision-diff.ts`, `src/newsletter/revision-diff.test.ts`
- `src/newsletter/cheatsheet.ts`, `src/newsletter/cheatsheet.test.ts`
- `src/newsletter/campaign.ts`, `src/newsletter/campaign.test.ts`
- `scripts/generate-monthly-cheatsheet.ts`, `scripts/generate-monthly-cheatsheet.test.ts`
- `scripts/create-brevo-campaign-draft.ts`, `scripts/create-brevo-campaign-draft.test.ts`
- Newsletter portions of `src/index.css`, `.env.example`, `package.json`, and deployment docs
- `.gitignore` entry for local newsletter artifact output

After the foundation and Compare commits are integrated, Sol alone applies the
two call-site edits in `src/frontend/app-shell.tsx` and
`src/pages/compare-hub-page.tsx`; Terra owns the reusable signup component and
its tests. `.env.example`, `package.json`, docs, CSS, and browser fixtures are
also serialized Sol integration surfaces.

### Task 1: Newsletter contracts and server-only Brevo adapter

**Files:**
- Create: `src/newsletter/contracts.ts`
- Create: `src/newsletter/contracts.test.ts`
- Create: `functions/_shared/brevo.ts`
- Create: `functions/_shared/brevo.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `parseNewsletterSignup(value: unknown): NewsletterSignup | null`
- `NewsletterSignup = { email: string; monthlyCheatsheet: true; modelAndPriceAlerts: boolean; context: 'footer' | 'compare'; honeypot: string }`
- Produces: `createDoubleOptInContact(config, signup, fetchImpl): Promise<void>`
- Produces: `BrevoConfig` parsed only from Pages Function bindings

- [ ] **Step 1: Write failing contract and Brevo request tests**

```ts
it('accepts only the explicit signup contract', () => {
  expect(parseNewsletterSignup({
    email: 'builder@example.com', monthlyCheatsheet: true,
    modelAndPriceAlerts: false, context: 'footer', honeypot: '',
  })).toEqual({
    email: 'builder@example.com', monthlyCheatsheet: true,
    modelAndPriceAlerts: false, context: 'footer', honeypot: '',
  });
  expect(parseNewsletterSignup({ email: 'not-an-email', monthlyCheatsheet: true })).toBeNull();
});

it('maps alert consent to a second Brevo list through double opt in', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
  await createDoubleOptInContact(config(), signup({ modelAndPriceAlerts: true }), fetchImpl);
  expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({
    email: 'builder@example.com', includeListIds: [11, 12], templateId: 21,
    redirectionUrl: 'https://tokenbench.monomind.one/newsletter/confirmed/',
  });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/newsletter/contracts.test.ts functions/_shared/brevo.test.ts`

Expected: FAIL because the contracts and adapter do not exist.

- [ ] **Step 3: Implement strict parsing and the DOI request**

```ts
export interface BrevoConfig {
  readonly apiKey: string;
  readonly cheatsheetListId: number;
  readonly alertsListId: number;
  readonly doiTemplateId: number;
  readonly doiRedirectUrl: string;
}
```

POST to `https://api.brevo.com/v3/contacts/doubleOptinConfirmation` with
`content-type: application/json` and the `api-key` header. Include the
cheatsheet list always, the alerts list only for explicit consent, and serialize
the reviewed `doiRedirectUrl` as Brevo's `redirectionUrl`. Accept only the
documented success status. Throw a
typed `BrevoUpstreamError` containing status but never response body or request
email.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/newsletter/contracts.test.ts functions/_shared/brevo.test.ts`

Expected: PASS for valid/invalid emails, whitespace normalization, unexpected keys, preference mapping, non-201 status, timeout, and secret-free errors.

- [ ] **Step 5: Commit contracts and adapter**

```bash
git add src/newsletter/contracts.ts src/newsletter/contracts.test.ts functions/_shared/brevo.ts functions/_shared/brevo.test.ts .env.example
git commit -m "feat: add Brevo double opt-in adapter"
```

### Task 2: Privacy-safe newsletter Pages Function

**Files:**
- Create: `functions/api/newsletter/subscribe.ts`
- Create: `functions/api/newsletter/subscribe.test.ts`

**Interfaces:**
- Route: `POST /api/newsletter/subscribe`
- Produces: one `onRequest` dispatcher so non-POST methods receive an explicit 405
- Consumes: `parseNewsletterSignup`, `createDoubleOptInContact`
- Response: `{ status: 'confirmation-required' }` for accepted requests

- [ ] **Step 1: Write failing endpoint tests**

```ts
it('accepts a valid same-origin signup without exposing contact state', async () => {
  const response = await onRequest(context(validRequest(), configuredEnv(), fetch201));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: 'confirmation-required' });
});

it('does not call Brevo for a filled honeypot', async () => {
  const fetchImpl = vi.fn();
  const response = await onRequest(context(validRequest({ honeypot: 'spam' }), configuredEnv(), fetchImpl));
  expect(response.status).toBe(202);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('rejects cross-origin and oversized requests', async () => {
  expect((await onRequest(context(crossOriginRequest(), configuredEnv(), fetch201))).status).toBe(403);
  expect((await onRequest(context(oversizedRequest(), configuredEnv(), fetch201))).status).toBe(413);
});

it.each([
  ['GET', 405], ['OPTIONS-without-preflight-contract', 405], ['POST-text-plain', 415],
  ['POST-missing-origin', 403], ['POST-malformed-json', 400],
])('rejects %s with %i', async (fixture, status) => {
  expect((await onRequest(context(requestFixture(fixture), configuredEnv(), fetch201))).status).toBe(status);
});

it('returns a generic retryable response without leaking the address or Brevo body', async () => {
  const response = await onRequest(context(validRequest(), configuredEnv(), fetch503WithBody('builder@example.com')));
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"status":"temporarily-unavailable"}');
});
```

- [ ] **Step 2: Run endpoint tests and verify RED**

Run: `npm test -- functions/api/newsletter/subscribe.test.ts`

Expected: FAIL because the route is absent.

- [ ] **Step 3: Implement request boundaries and generic responses**

Allow only POST JSON under 8 KiB. Require `Origin` to equal the request URL's
origin; this is intentionally a browser-form-only endpoint and the deployment
docs state that clients without Origin are rejected. Return 400 for invalid
form data/body read failure, 403 for missing/mismatched origin, 405 with `Allow:
POST` for other methods, 413 for size, 415 for wrong content type,
503 with `{ status: 'temporarily-unavailable' }` when configuration or Brevo is
unavailable, and 202 for successful or honeypot requests. Do not log request
bodies, email addresses, API response bodies, or API keys.

- [ ] **Step 4: Run endpoint tests and verify GREEN**

Run: `npm test -- functions/api/newsletter/subscribe.test.ts functions/_shared/brevo.test.ts`

Expected: PASS for method/Allow header, content type, missing/mismatched origin, size, malformed JSON/body failures, validation, honeypot, configured/unconfigured state, timeout/non-201 upstream failure, no request logging, and generic response content with no address or upstream body.

- [ ] **Step 5: Commit the signup endpoint**

```bash
git add functions/api/newsletter/subscribe.ts functions/api/newsletter/subscribe.test.ts
git commit -m "feat: accept private newsletter signups"
```

### Task 3: Footer and comparison signup experiences

**Files:**
- Create: `src/frontend/newsletter-signup.tsx`
- Create: `src/frontend/newsletter-signup.test.tsx`
- Modify after integration: `src/frontend/app-shell.tsx`
- Modify after integration: `src/pages/compare-hub-page.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `NewsletterSignup({ context, compact?, alertLabel? })`
- Consumes: `/api/newsletter/subscribe`

- [ ] **Step 1: Write failing consent and status tests**

```ts
it('leaves alerts unchecked and explains double opt in', () => {
  render(<NewsletterSignup context="footer" />);
  expect(screen.getByRole('heading', { name: 'The Monthly LLM API Cost & Benchmark Cheatsheet (PDF/CSV)' })).toBeInTheDocument();
  expect(screen.getByText('A downloadable, printable reference sheet listing top models, current per-1M token rates, context windows, and category ranks.')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /new models or price drops/i })).not.toBeChecked();
  expect(screen.getByText(/confirmation email/i)).toBeInTheDocument();
});

it('announces confirmation-required and keeps the address on retryable failure', async () => {
  render(<NewsletterSignup context="compare" alertLabel="Notify me when new models or price drops are added to TokenBench" />);
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
  expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i);
});

it('does not claim confirmation on a retryable 503', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    '{"status":"temporarily-unavailable"}',
    { status: 503, headers: { 'content-type': 'application/json' } },
  )));
  render(<NewsletterSignup context="footer" />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'builder@example.com' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Newsletter signup' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i);
  expect(screen.getByLabelText('Email address')).toHaveValue('builder@example.com');
  expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- src/frontend/newsletter-signup.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the reusable form**

Use a real `<form>`, visible email label, hidden off-screen honeypot, unchecked
alerts checkbox, in-flight disabled state, and one status region. Keep entered
email on retryable failure; clear it only after 202. The footer version always
subscribes to the monthly cheatsheet. The compact compare version uses the
exact general alert label “Notify me when new models or price drops are added
to TokenBench” and still includes monthly cheatsheet consent in plain language.
It does not promise pair-specific or ranking-change alerts because no targeting
contract exists. In compact Compare mode, render only the unchecked alert
control initially and reveal the email/monthly-consent form after opt-in; the
footer form shows its email field immediately.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/newsletter-signup.test.tsx src/frontend/app-shell.test.tsx src/pages/compare-hub-page.test.tsx`

Expected: PASS for default consent, keyboard submission, invalid email, loading, success, failure, footer placement, and compare placement.

- [ ] **Step 5: Commit the signup UI**

```bash
git add src/frontend/newsletter-signup.tsx src/frontend/newsletter-signup.test.tsx src/frontend/app-shell.tsx src/pages/compare-hub-page.tsx src/index.css
git commit -m "feat: add newsletter and model alerts signup"
```

### Task 4: Revision-diff facts for new-model and price-drop alerts

**Files:**
- Create: `src/newsletter/revision-diff.ts`
- Create: `src/newsletter/revision-diff.test.ts`

**Interfaces:**
- Produces: `diffPublishedRevisions(previous, current): RevisionChanges`
- `RevisionChanges = { fromRevision: string; toRevision: string; newModels: readonly NewModelFact[]; priceDrops: readonly PriceDropFact[] }`

- [ ] **Step 1: Write failing exact-route diff tests**

```ts
it('detects new models and verified price drops without conflating routes', () => {
  const changes = diffPublishedRevisions(previousSnapshot(), currentSnapshot());
  expect(changes.newModels.map((fact) => fact.modelKey)).toEqual(['provider:new-model']);
  expect(changes.priceDrops).toEqual([{
    modelKey: 'provider:alpha', providerId: 'provider', routeId: 'direct:alpha',
    previousInputUsdPerMillion: 2, currentInputUsdPerMillion: 1.5,
    previousOutputUsdPerMillion: 6, currentOutputUsdPerMillion: 5,
  }]);
});
```

- [ ] **Step 2: Run diff tests and verify RED**

Run: `npm test -- src/newsletter/revision-diff.test.ts`

Expected: FAIL because no revision-diff module exists.

- [ ] **Step 3: Implement deterministic, verified-only diffs**

Match models by `modelKey` and prices by
`modelKey + providerId + routeId`. Include a new model only when absent from the
previous published snapshot. Include a price drop only for finite non-negative
rates whose verification state is `primary`, and only when at least one present
rate decreases. Sort by model key, provider, and route. Never infer a change
from a missing previous or current field. Give every fact a stable identity of
`toRevision + kind + modelKey + providerId + routeId` (with empty provider/route
for a new-model fact), collapse duplicate identities before returning, and
include a stable `dedupeKey` on `RevisionChanges` for campaign receipts.

- [ ] **Step 4: Run diff tests and verify GREEN**

Run: `npm test -- src/newsletter/revision-diff.test.ts`

Expected: PASS for additions, decreases, increases, unchanged routes, missing fields, router/direct separation, estimated models, duplicate inputs, stable fact identities, one campaign dedupe key, and stable order.

- [ ] **Step 5: Commit revision diffs**

```bash
git add src/newsletter/revision-diff.ts src/newsletter/revision-diff.test.ts
git commit -m "feat: derive model and price update alerts"
```

### Task 5: Deterministic cheatsheet facts, CSV, HTML, and PDF

**Files:**
- Create: `src/newsletter/cheatsheet.ts`
- Create: `src/newsletter/cheatsheet.test.ts`
- Create: `scripts/generate-monthly-cheatsheet.ts`
- Create: `scripts/generate-monthly-cheatsheet.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `buildCheatsheet(snapshot, catalog): CheatsheetDocument`
- Produces: `renderCheatsheetCsv(document): string`
- Produces: `renderCheatsheetHtml(document): string`
- Produces: `renderNewsletterHtml(document, changes): string` and `subjectPreviewSet(document, changes): readonly SubjectPreview[]`
- Produces: `normalizePdfMetadata(bytes, frozenGeneratedAt): Uint8Array`
- CLI: `npm run generate:cheatsheet -- --benchmarks <snapshot.json> --catalog <catalog.json> --changes <changes.json> --out-dir <new-directory> [--share-image]`

- [ ] **Step 1: Write failing frozen-fixture tests**

```ts
it('builds one printable fact table from a frozen revision', () => {
  const document = buildCheatsheet(benchmarkFixture(), catalogFixture());
  expect(document.revision).toBe('benchmark_fixture');
  expect(document.categories.map((category) => category.key)).toEqual([
    'llm-overall', 'llm-agentic', 'llm-coding', 'llm-reasoning', 'multimodal-vision-documents', 'llm-knowledge',
  ]);
  expect(document.categories.every((category) => category.entries.length <= 10)).toBe(true);
  expect(document.categories.flatMap((category) => category.entries).some((entry) => entry.evidenceStatus === 'estimated')).toBe(false);
});

it('writes the full factual artifact set with the same revision', async () => {
  const output = await generateMonthlyCheatsheet(cliFixtureArgs());
  expect(output.files.map((file) => file.name).sort()).toEqual([
    'tokenbench-cheatsheet.csv', 'tokenbench-cheatsheet.html',
    'tokenbench-cheatsheet-newsletter.html', 'tokenbench-cheatsheet.pdf',
    'tokenbench-cheatsheet-share.png', 'tokenbench-cheatsheet-subjects.json',
    'tokenbench-cheatsheet.manifest.json',
  ]);
  expect(output.manifest.revision).toBe('benchmark_fixture');
});

it('is byte-for-byte reproducible for one frozen input revision', async () => {
  const first = await generateMonthlyCheatsheet(cliFixtureArgs({ outDir: tempPath('first'), shareImage: true }));
  const second = await generateMonthlyCheatsheet(cliFixtureArgs({ outDir: tempPath('second'), shareImage: true }));
  expect(first.manifest.files).toEqual(second.manifest.files);
});
```

- [ ] **Step 2: Run generator tests and verify RED**

Run: `npm test -- src/newsletter/cheatsheet.test.ts scripts/generate-monthly-cheatsheet.test.ts`

Expected: FAIL because the document and CLI do not exist.

- [ ] **Step 3: Implement the fact document and renderers**

Build supported top-ten rows for the six approved categories plus route pricing,
context, and method labels. Reuse leaderboard derivation and CSV escaping rather
than duplicating ranking logic; import `csvCell` from
`src/benchmarks/leaderboard-csv.ts`. Render semantic print HTML with an embedded
print stylesheet and no external image/font requests. Generate newsletter HTML
and a small factual subject/preview set from the same typed fact object. Render
the optional social/share PNG from a fixed-size local HTML template; no Canva,
OpenDesign, image model, or network dependency is required at runtime.

The CLI reads explicit local JSON inputs, verifies their revision/catalog/change
relationship, and requires a new output directory. It builds in a unique sibling
staging directory, launches existing Playwright Chromium with UTC/fixed locale,
sets only local HTML, calls `page.pdf({ format: 'A4', printBackground: true })`,
and closes browser/page in `finally`. Normalize Chromium `/CreationDate` and
`/ModDate` fields to the frozen revision timestamp with fixed-length values,
then require a two-run fixture test to catch any remaining nondeterminism. Render
the optional PNG with fixed viewport/device scale. Calculate SHA-256 for every
artifact, write the manifest last, and atomically rename the staging directory
to the requested output path. On failure, remove only the validated staging
directory. Add the documented local artifact root to `.gitignore`; never write
generated binaries into source directories.

- [ ] **Step 4: Run generator tests and verify GREEN**

Run: `npm test -- src/newsletter/cheatsheet.test.ts scripts/generate-monthly-cheatsheet.test.ts`

Expected: PASS for supported-only data, exact prices/context, unavailable cells, deterministic ordering, safe CSV, print/newsletter HTML, factual subject/preview variants, optional share PNG, normalized PDF metadata, two-run byte/hash equality, atomic staging cleanup, browser cleanup, manifest hashes, and mismatched revisions.

- [ ] **Step 5: Commit artifact generation**

```bash
git add src/newsletter/cheatsheet.ts src/newsletter/cheatsheet.test.ts scripts/generate-monthly-cheatsheet.ts scripts/generate-monthly-cheatsheet.test.ts package.json .gitignore
git commit -m "feat: generate monthly TokenBench cheatsheets"
```

### Task 6: Factual newsletter payload and Brevo campaign draft

**Files:**
- Create: `src/newsletter/campaign.ts`
- Create: `src/newsletter/campaign.test.ts`
- Create: `scripts/create-brevo-campaign-draft.ts`
- Create: `scripts/create-brevo-campaign-draft.test.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `campaignFromArtifacts(bundle, changes, artifactBaseUrl): CampaignDraft`
- Produces: `validateEditorialVariant(variant, factObject): EditorialValidationResult`
- Produces: `BrevoCampaignConfig = { apiKey: string; sender: { id: number } | { name: string; email: string }; monthlyCheatsheetListId: number }`
- `CampaignDraft = { dedupeKey: string; audience: 'monthly-cheatsheet'; name: string; subject: string; previewText: string; htmlContent: string; recipients: { listIds: readonly number[] }; attachmentUrl: string }`
- CLI: `npm run create:newsletter-draft -- --manifest <manifest.json> --changes <changes.json> --artifact-base-url <https-url> --receipt-file <state.json>`

- [ ] **Step 1: Write failing fact-fidelity and draft-only tests**

```ts
it('uses only manifest and revision-change facts in campaign copy', () => {
  const draft = campaignFromArtifacts(manifest(), changes());
  expect(draft.subject).toBe('TokenBench August 2026: 2 new models and 1 verified price drop');
  expect(draft.htmlContent).toContain('benchmark_fixture');
  expect(draft.htmlContent).not.toContain('best model for everyone');
});

it('creates a Brevo draft without calling the send endpoint', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response('{"id":42}', { status: 201 }))
    .mockResolvedValueOnce(new Response('{"id":42,"status":"draft"}', { status: 200 }));
  await createCampaignDraft(config(), campaignDraft(), fetchImpl);
  expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.brevo.com/v3/emailCampaigns');
  expect(String(fetchImpl.mock.calls[1][0])).toBe('https://api.brevo.com/v3/emailCampaigns/42');
  expect(fetchImpl.mock.calls.map(([url]) => String(url)).join(' ')).not.toMatch(/sendNow|sendTest|schedule/i);
});

it('does not create the same revision draft twice', async () => {
  const fetchImpl = vi.fn();
  await expect(createCampaignDraftFromReceipt(existingReceipt(), config(), campaignDraft(), fetchImpl))
    .rejects.toThrow(/already drafted/i);
  expect(fetchImpl).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run campaign tests and verify RED**

Run: `npm test -- src/newsletter/campaign.test.ts scripts/create-brevo-campaign-draft.test.ts`

Expected: FAIL because campaign projection and CLI are absent.

- [ ] **Step 3: Implement deterministic copy and draft creation**

Subject and preview text use the generated factual variants; HTML is the
generated newsletter artifact and contains only facts present in the
manifest/change objects. Require an HTTPS artifact base URL that already serves
the exact manifest filenames; remote upload is not part of this plan. Reject a
missing/mismatched base URL rather than creating broken links.

Resolve `audience: 'monthly-cheatsheet'` only to
`monthlyCheatsheetListId`; the alerts list is never a recipient of this monthly
campaign by accident. Optional AI-assisted headline copy can consume only the
structured fact object and must pass `validateEditorialVariant`, which rejects
unknown model names and any rank, price, count, or revision not exactly present.
This plan supplies the validation gate but performs no model/API call.

Acquire an exclusive local receipt-file lock keyed by
`RevisionChanges.dedupeKey` before the remote mutation. POST to
`/v3/emailCampaigns` with sender, subject, preview text, monthly list, HTML, and
PDF URL; do not pass `scheduledAt`. GET the returned campaign once and require
`status === 'draft'` before recording the ID with an atomic receipt-file rename
and printing it. On rerun, reject before network access. Never call send, test,
or schedule endpoints, and fail closed on an unexpected lifecycle status.

- [ ] **Step 4: Run campaign tests and verify GREEN**

Run: `npm test -- src/newsletter/campaign.test.ts scripts/create-brevo-campaign-draft.test.ts`

Expected: PASS for zero/multiple changes, HTML escaping, exact fact use, editorial-variant rejection/acceptance, HTTPS artifact URL validation, monthly-list-only recipients, missing configuration, receipt-lock contention/reruns, API errors without secret leakage, returned draft verification, unexpected-status rejection, and no send/test/schedule calls.

- [ ] **Step 5: Commit campaign drafting**

```bash
git add src/newsletter/campaign.ts src/newsletter/campaign.test.ts scripts/create-brevo-campaign-draft.ts scripts/create-brevo-campaign-draft.test.ts package.json .env.example
git commit -m "feat: create monthly Brevo campaign drafts"
```

### Task 7: Operational documentation and full verification

**Files:**
- Modify: `docs/catalog-deployment.md`
- Modify: `docs/tokenbench-deployment.md`
- Modify: `README.md`
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `browser-tests/tokenbench-fixtures.ts`

**Interfaces:**
- Consumes: Tasks 1-6
- Documents: local artifact generation, secret names, DOI template/list setup, draft review, and separately authorized activation

- [ ] **Step 1: Add failing browser assertions for both signup placements**

Cover footer and compare forms at mobile/desktop widths, unchecked alert consent,
keyboard submission, loading, confirmation-required, retryable failure, and no
horizontal overflow.

- [ ] **Step 2: Run focused browser tests and verify RED**

Run: `npm run test:browser -- --grep "newsletter|alerts"`

Expected: FAIL until browser fixtures intercept the signup endpoint and selectors match the new forms.

- [ ] **Step 3: Document the non-mutating activation boundary**

Document how an operator creates/verifies Brevo lists, DOI template, sender,
unsubscribe page, and secrets without recording values. Document the local
generator command and campaign-draft command. State explicitly that neither
command authorizes uploading artifacts, scheduling a job, or sending a campaign.
Document the browser-only Origin policy, public artifact URL prerequisite,
receipt-file backup/rotation, deterministic artifact checks, and the distinction
between the monthly-cheatsheet audience and optional alerts consent.
Include a non-activated monthly automation blueprint: freeze one active
benchmark/catalog revision, generate and hash artifacts twice, require human
review of the factual subject/preview set and optional validated editorial
variant, publish artifacts only in a separately authorized job, then create a
Brevo draft. Recommend a monthly UTC trigger after the historical snapshot is
available, but do not add or enable a remote schedule in this task.

- [ ] **Step 4: Run plan verification**

Run:

```bash
npm test -- src/newsletter/contracts.test.ts functions/_shared/brevo.test.ts functions/api/newsletter/subscribe.test.ts src/frontend/newsletter-signup.test.tsx src/newsletter/revision-diff.test.ts src/newsletter/cheatsheet.test.ts src/newsletter/campaign.test.ts scripts/generate-monthly-cheatsheet.test.ts scripts/create-brevo-campaign-draft.test.ts
npm run lint
npm run build
npm run test:browser -- --grep "newsletter|alerts"
git diff --check
```

Expected: all commands exit 0 without a live Brevo request.

- [ ] **Step 5: Commit docs and browser coverage**

```bash
git add docs/catalog-deployment.md docs/tokenbench-deployment.md README.md browser-tests/responsive-browser.ts browser-tests/tokenbench-fixtures.ts
git commit -m "docs: define newsletter activation controls"
```
