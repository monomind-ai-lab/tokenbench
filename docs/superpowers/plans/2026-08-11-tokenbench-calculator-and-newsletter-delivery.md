# TokenBench Calculator and Newsletter Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp Subscribe vs API around message-level workload inputs, keep cost arithmetic independent from plan-capacity evidence, publish a dedicated confirmation page, and deliver a valid blank test PDF immediately after double opt-in confirmation.

**Architecture:** Add a pure integer-unit workload calculator beside the existing catalog contracts, then adapt calculator state and UI to its explicit inputs/results. Resolve a visible default API model deterministically from the selected plan/provider while retaining a complete weighted-mix override. Keep the existing Brevo DOI endpoint; the post-confirmation email is a list-triggered Brevo automation whose versioned public PDF and reviewed HTML are generated and verified in-repository.

**Tech Stack:** TypeScript 5.8, React 19, Cloudflare Pages, Brevo v3 and Automations, Vitest, Testing Library, Playwright.

## Global Constraints

- Primary inputs are conversations/day, messages/conversation, input tokens/message, output tokens/message, and active days/month.
- `monthlyMessages = C × M × D`; monthly input/output tokens multiply that result by `I` and `O` respectively.
- API-equivalent cost uses exact input and output rates per million; no cached-input, batch, or routing discount is assumed.
- Cost recommendation, monthly difference, efficiency, and breakeven are never gated by capacity evidence.
- Capacity coverage is a separate evidence result and may remain not independently verified.
- Zero usage and zero active days are valid; efficiency and breakeven are unavailable when their denominator is zero.
- Defaults and advanced model overrides are visible in results and encoded in share state.
- Double opt-in remains mandatory and no welcome email is sent before confirmation.
- The test cheatsheet is a deterministic valid one-page blank PDF, not a zero-byte or malformed file.
- `/newsletter/confirmed/` exposes one action only, `Start Exploring`, linking to `/`, with `noindex,follow` and complete social/canonical metadata.
- Subscriber identity, names, companies, API keys, and browser form data never enter logs.
- Every task follows RED-GREEN-REFACTOR and ends in a focused commit.

---

## File structure and ownership

- `src/catalog/subscription-api-calculator.ts` owns bounded workload derivation, exact cost arithmetic, cost comparison, efficiency, and breakeven.
- `src/catalog/plan-api-equivalent.ts` resolves and explains the plan's deterministic default direct API offer.
- `src/frontend/calculator-state.ts` owns normalized page state and builds presentation snapshots from the pure calculator.
- `src/frontend/calculator-controls.tsx` owns the five primary workload controls and the Advanced model/mix controls.
- `src/frontend/results-dashboard.tsx` presents arithmetic and capacity evidence as independent results.
- `src/frontend/calculator-share-state.ts` owns normalized query round trips for all primary inputs and model overrides.
- `src/pages/newsletter-confirmed-page.tsx` is a standalone transactional page without `AppShell` navigation/footer actions.
- `src/newsletter/test-cheatsheet.ts` generates deterministic blank-PDF bytes and reviewed welcome-email content.
- `public/downloads/tokenbench-cheatsheet-test-v1.pdf` is the generated immutable public asset.
- `public/_headers` declares the versioned PDF MIME and immutable cache policy.

### Task 1: Exact message-level workload and cost formulas

**Files:**
- Create: `src/catalog/subscription-api-calculator.ts`
- Create: `src/catalog/subscription-api-calculator.test.ts`
- Modify: `src/catalog/calculator.ts`
- Modify: `src/catalog/calculator.test.ts`

**Interfaces:**
- Produces: `normalizeConversationWorkload(value): ConversationWorkload`.
- Produces: `deriveConversationWorkload(workload): DerivedConversationWorkload`.
- Produces: `calculateApiEquivalentCost(derived, rates): ApiEquivalentCost`.
- Produces: `compareSubscriptionWithApi(planCostMicroDollars, derived, apiCost): SubscriptionApiComparison`.
- Bounds: `C 0..10_000`, `M 0..1_000`, `D 0..31`, `I/O 0..1_000_000`, all integers.

- [ ] **Step 1: Add failing formula, zero, signed, and overflow tests**

```ts
it('derives message and directional-token workload exactly', () => {
  expect(deriveConversationWorkload({
    conversationsPerDay: 10,
    messagesPerConversation: 8,
    inputTokensPerMessage: 750,
    outputTokensPerMessage: 250,
    activeDaysPerMonth: 25,
  })).toEqual({ monthlyMessages: 2_000, monthlyInputTokens: 1_500_000, monthlyOutputTokens: 500_000 });
});

it('calculates directional cost, signed efficiency, and breakeven independently of coverage', () => {
  const result = calculateSubscriptionApiResult(fixture({
    planCostMicroDollars: 20_000_000,
    inputMicroDollarsPerMillion: 2_000_000,
    outputMicroDollarsPerMillion: 8_000_000,
  }));
  expect(result.apiCostMicroDollars).toBe(7_000_000);
  expect(result.differenceMicroDollars).toBe(-13_000_000);
  expect(result.efficiencyBasisPoints).toBe(-18_571);
  expect(result.breakEvenMessagesPerDay).toBeGreaterThan(0);
});

it('keeps zero workload valid without inventing finite ratios', () => {
  const result = calculateSubscriptionApiResult(zeroFixture());
  expect(result.apiCostMicroDollars).toBe(0);
  expect(result.efficiencyBasisPoints).toBeNull();
  expect(result.breakEvenMessagesPerDay).toBeNull();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/catalog/subscription-api-calculator.test.ts src/catalog/calculator.test.ts`

Expected: FAIL because the conversation workload and directional cost contract do not exist.

- [ ] **Step 3: Implement bounded BigInt intermediate arithmetic**

```ts
export interface ConversationWorkload {
  readonly conversationsPerDay: number;
  readonly messagesPerConversation: number;
  readonly inputTokensPerMessage: number;
  readonly outputTokensPerMessage: number;
  readonly activeDaysPerMonth: number;
}

export interface SubscriptionApiComparison {
  readonly apiCostMicroDollars: number;
  readonly differenceMicroDollars: number;
  readonly efficiencyBasisPoints: number | null;
  readonly apiCostPerMessageMicroDollars: number | null;
  readonly breakEvenMessagesPerDay: number | null;
  readonly cheaper: 'subscription' | 'api' | 'equal';
}

function roundedMicroDollars(tokens: number, rateMicroDollarsPerMillion: number): number {
  const numerator = BigInt(tokens) * BigInt(rateMicroDollarsPerMillion);
  return safeNumber((numerator + 500_000n) / 1_000_000n, 'API-equivalent cost');
}
```

Validate integer bounds before multiplication. Sum input and output cost after each side is converted to integer microdollars. Derive efficiency in signed basis points from `(A-S)/A`; derive API cost/message and breakeven messages/day only when monthly messages, API cost, and active days are positive. Keep the legacy token helpers exported for existing consumers but route the revamped page through the new functions.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/catalog/subscription-api-calculator.test.ts src/catalog/calculator.test.ts`

Expected: PASS for exact formulas, rounding, zero, zero days, negative efficiency, equality, upper bounds, non-integers, non-finite values, and overflow rejection.

- [ ] **Step 5: Commit workload arithmetic**

```bash
git add src/catalog/subscription-api-calculator.ts src/catalog/subscription-api-calculator.test.ts src/catalog/calculator.ts src/catalog/calculator.test.ts
git commit -m "feat: calculate message-level API equivalents"
```

### Task 2: Deterministic plan-to-API defaults and share state

**Files:**
- Create: `src/catalog/plan-api-equivalent.ts`
- Create: `src/catalog/plan-api-equivalent.test.ts`
- Modify: `src/frontend/calculator-state.ts`
- Modify: `src/frontend/calculator-state.test.ts`
- Modify: `src/frontend/calculator-share-state.ts`
- Modify: `src/frontend/calculator-share-state.test.ts`

**Interfaces:**
- Produces: `defaultApiEquivalentForPlan(plan, offers): ModelOffer | null`.
- Selection order: direct-provider offers in `plan.supportedModelIds` order; if none are declared, direct-provider offers for `plan.providerId` ordered by `modelId` binary; never silently select OpenRouter/OpenCode Zen.
- Share keys: `c`, `m`, `i`, `o`, `d`, `models`, `weights`, `provider`, `plan`; old `input`/`tokens` links decode once and replace to the new normalized form.
- Produces: `CalculatorSnapshot` with derived workload, API mapping disclosure, arithmetic comparison, and independent coverage result.

- [ ] **Step 1: Add failing default resolution and URL round-trip tests**

```ts
it('prefers the first supported direct API model and discloses the resolution', () => {
  const result = defaultApiEquivalentForPlan(plan({ supportedModelIds: ['model-b', 'model-a'] }), offers());
  expect(result?.modelId).toBe('model-b');
  expect(result?.pricingBasis).toBe('direct_provider_api');
});

it('round trips every primary input and explicit weighted override', () => {
  const state = conversationShareState({ c: 12, m: 6, i: 900, o: 300, d: 22 });
  const decoded = decodeCalculatorShareState(encodeCalculatorShareState(state), catalog);
  expect(decoded?.state).toEqual(state);
});

it('normalizes an obsolete legacy token URL without throwing', () => {
  const decoded = decodeCalculatorShareState(new URLSearchParams('provider=p&plan=x&models=p%3Aa&weights=10000&input=5000&tokens=10000000'), catalog);
  expect(decoded?.wasNormalized).toBe(true);
  expect(decoded?.state.workload.activeDaysPerMonth).toBe(30);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/catalog/plan-api-equivalent.test.ts src/frontend/calculator-state.test.ts src/frontend/calculator-share-state.test.ts`

Expected: FAIL because defaults, primary workload fields, and the new URL schema are absent.

- [ ] **Step 3: Implement explicit default/override state and independent coverage**

```ts
export interface CalculatorShareState {
  readonly providerId: string;
  readonly planId: string;
  readonly workload: ConversationWorkload;
  readonly selectedModelIds: readonly string[];
  readonly modelMixBasisPoints: Readonly<Record<string, number>>;
  readonly mappingMode: 'default' | 'override';
}

export interface CapacityEvidenceResult {
  readonly status: 'verified-covered' | 'verified-not-covered' | 'projected' | 'not-verified';
  readonly explanation: string;
}
```

When a plan changes, resolve its default offer and reset `mappingMode` to `default`. Entering Advanced and changing models sets `override`. Build the cost comparison whenever a complete offer mix and plan fee exist. Compute `CapacityEvidenceResult` separately from `PlanEntitlement`/`EntitlementEvidence`; never null arithmetic fields because capacity is dynamic, projected, stale, or measured in incompatible units. Encode integer inputs once and reject duplicate/unbounded/unknown values.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/catalog/plan-api-equivalent.test.ts src/frontend/calculator-state.test.ts src/frontend/calculator-share-state.test.ts`

Expected: PASS for supported-model preference, provider fallback, no direct offer, complete mixes, capacity independence, new round trips, legacy normalization, duplicate keys, removed offers, and bounded inputs.

- [ ] **Step 5: Commit model mapping and state**

```bash
git add src/catalog/plan-api-equivalent.ts src/catalog/plan-api-equivalent.test.ts src/frontend/calculator-state.ts src/frontend/calculator-state.test.ts src/frontend/calculator-share-state.ts src/frontend/calculator-share-state.test.ts
git commit -m "feat: map subscription plans to API workloads"
```

### Task 3: Calculator controls, recommendation, and same-workload table

**Files:**
- Modify: `src/frontend/types.ts`
- Modify: `src/frontend/calculator-controls.tsx`
- Create: `src/frontend/calculator-controls.test.tsx`
- Modify: `src/frontend/results-dashboard.tsx`
- Create: `src/frontend/results-dashboard.test.tsx`
- Modify: `src/frontend/comparison.tsx`
- Create: `src/frontend/comparison.test.tsx`
- Modify: `src/App.tsx`
- Create: `src/App.test.tsx`
- Modify: `src/seo/metadata.ts`
- Modify: `src/seo/metadata.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- `CalculatorControlsProps` replaces monthly-token/input-share primary props with `workload` and `onWorkloadChange`.
- Advanced controls retain `selectedModelIds`, complete basis-point weights, and explicit offer route labels.
- `ResultsDashboard` consumes arithmetic and coverage objects independently.
- Same-workload table calculates each paid individual plan with its own `defaultApiEquivalentForPlan` result.

- [ ] **Step 1: Add failing user-flow and independent-result tests**

```tsx
it('shows finite cost facts while capacity remains not verified', () => {
  renderCalculator({ entitlementStatus: 'dynamic_unknown', apiRate: { input: 2, output: 8 } });
  expect(screen.getByText('API-equivalent monthly cost').nextSibling).toHaveTextContent('$');
  expect(screen.getByText('Breakeven messages per day').nextSibling).not.toHaveTextContent('Unavailable');
  expect(screen.getByText('Efficiency').nextSibling).toHaveTextContent('%');
  expect(screen.getByText('Capacity evidence').nextSibling).toHaveTextContent('Not independently verified');
});

it('exposes five labelled numeric workload inputs and an Advanced override', () => {
  renderCalculator();
  for (const name of ['Conversations per day', 'Messages per conversation', 'Average input tokens per message', 'Average output tokens per message', 'Active days per month']) {
    expect(screen.getByRole('spinbutton', { name })).toBeInTheDocument();
  }
  expect(screen.getByText('Advanced model mapping')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/calculator-controls.test.tsx src/frontend/results-dashboard.test.tsx src/frontend/comparison.test.tsx src/App.test.tsx src/seo/metadata.test.ts`

Expected: FAIL because the UI still asks for monthly tokens/input share and hides arithmetic behind entitlement eligibility.

- [ ] **Step 3: Implement the decision-first calculator UI**

```tsx
<fieldset className="workload-input-grid">
  <NumberField label="Conversations per day" value={workload.conversationsPerDay} min={0} max={10_000} onChange={setConversations} />
  <NumberField label="Messages per conversation" value={workload.messagesPerConversation} min={0} max={1_000} onChange={setMessages} />
  <NumberField label="Average input tokens per message" value={workload.inputTokensPerMessage} min={0} max={1_000_000} onChange={setInputTokens} />
  <NumberField label="Average output tokens per message" value={workload.outputTokensPerMessage} min={0} max={1_000_000} onChange={setOutputTokens} />
  <NumberField label="Active days per month" value={workload.activeDaysPerMonth} min={0} max={31} onChange={setDays} />
</fieldset>
```

Render monthly messages/input/output, plan fee, API-equivalent cost, signed difference, signed efficiency explanation, breakeven messages/day, mapped model/route/source, catalog freshness, and calculation timestamp. Cost recommendation copy is exactly one of `Subscription is cheaper on a token-equivalent basis.`, `API is cheaper on a token-equivalent basis.`, or `The token-equivalent costs are equal.` Put capacity evidence in its own card. Keep Advanced collapsed by default and disclose the default mapping above it. Build the plan table with unavailable cells only when that row lacks a valid direct price; never coerce missing prices to zero.

Update the existing calculator metadata definition to describe conversations, messages, directional tokens, plan fees, and API-equivalent pricing. Preserve canonical `/tools/subscriptions-vs-apis/`, `index,follow`, Open Graph, Twitter, and server-generated JSON-LD.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/calculator-controls.test.tsx src/frontend/results-dashboard.test.tsx src/frontend/comparison.test.tsx src/App.test.tsx src/seo/metadata.test.ts`

Expected: PASS for default workflow, dynamic-unknown coverage, projected/stale/fixed states, zero usage, signed values, Advanced override, per-plan mappings, source links, and keyboard/touch labels.

- [ ] **Step 5: Commit the calculator experience**

```bash
git add src/frontend/types.ts src/frontend/calculator-controls.tsx src/frontend/calculator-controls.test.tsx src/frontend/results-dashboard.tsx src/frontend/results-dashboard.test.tsx src/frontend/comparison.tsx src/frontend/comparison.test.tsx src/App.tsx src/App.test.tsx src/seo/metadata.ts src/seo/metadata.test.ts src/index.css
git commit -m "feat: revamp subscription versus API calculator"
```

### Task 4: Dedicated confirmation route and complete SEO metadata

**Files:**
- Create: `src/pages/newsletter-confirmed-page.tsx`
- Create: `src/pages/newsletter-confirmed-page.test.tsx`
- Modify: `src/routing/routes.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/seo/metadata.test.ts`
- Modify: `src/seo/static-page.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `scripts/generate-static-pages.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/main.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Adds: `{ kind: 'newsletterConfirmed' }`, canonical pathname `/newsletter/confirmed/`, and a fixed generated HTML entry.
- Metadata: unique title/description/canonical/Open Graph/Twitter and `robots: noindex,follow`.
- Page action contract: exactly one link/button, accessible name `Start Exploring`, destination `/`.

- [ ] **Step 1: Add failing route, metadata, static HTML, and action-count tests**

```tsx
it('renders one Start Exploring action and no shell navigation', () => {
  render(<NewsletterConfirmedPage />);
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAccessibleName('Start Exploring');
  expect(links[0]).toHaveAttribute('href', '/');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('publishes noindex confirmation metadata', () => {
  const metadata = metadataForRoute({ kind: 'newsletterConfirmed' });
  expect(metadata.canonical).toBe('https://tokenbench.monomind.one/newsletter/confirmed/');
  expect(metadata.robots).toBe('noindex,follow');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/pages/newsletter-confirmed-page.test.tsx src/routing/routes.test.ts src/seo/metadata.test.ts scripts/generate-static-pages.test.ts src/main.test.tsx`

Expected: FAIL because the URL currently falls through to Home.

- [ ] **Step 3: Implement a standalone transactional route**

```tsx
export function NewsletterConfirmedPage() {
  return (
    <main className="newsletter-confirmed" aria-labelledby="newsletter-confirmed-heading">
      <div className="newsletter-confirmed-mark" aria-hidden="true">TokenBench</div>
      <p className="eyebrow">Email confirmed</p>
      <h1 id="newsletter-confirmed-heading">Your subscription is confirmed.</h1>
      <p>The current TokenBench test cheatsheet will arrive by email.</p>
      <a className="button" href="/">Start Exploring</a>
    </main>
  );
}
```

Generate this route with a special `transactionalChrome` that omits header/footer navigation and contains the same substantive copy before JavaScript. Mount it directly in `main.tsx`; do not wrap it in `AppShell`. Add JSON-LD `WebPage`, canonical, title, description, Open Graph, Twitter, and exact robots metadata.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/pages/newsletter-confirmed-page.test.tsx src/routing/routes.test.ts src/seo/metadata.test.ts scripts/generate-static-pages.test.ts src/main.test.tsx`

Expected: PASS for canonical routing, static generation, one action, exact grammar, no shell actions, hydration, complete metadata, and `noindex,follow`.

- [ ] **Step 5: Commit the confirmation destination**

```bash
git add src/pages/newsletter-confirmed-page.tsx src/pages/newsletter-confirmed-page.test.tsx src/routing/routes.ts src/routing/routes.test.ts src/seo/metadata.ts src/seo/metadata.test.ts src/seo/static-page.ts scripts/generate-static-pages.ts scripts/generate-static-pages.test.ts src/main.tsx src/main.test.tsx src/index.css
git commit -m "feat: add newsletter confirmation page"
```

### Task 5: Blank test PDF and post-confirmation Brevo delivery

**Files:**
- Create: `src/newsletter/test-cheatsheet.ts`
- Create: `src/newsletter/test-cheatsheet.test.ts`
- Create: `scripts/generate-test-cheatsheet.ts`
- Create: `scripts/generate-test-cheatsheet.test.ts`
- Create generated asset: `public/downloads/tokenbench-cheatsheet-test-v1.pdf`
- Create: `public/_headers`
- Modify: `package.json`
- Modify: `docs/catalog-deployment.md`
- Modify: `docs/tokenbench-deployment.md`
- Modify: `browser-tests/responsive-browser.ts`

**Interfaces:**
- Produces: `buildBlankTestCheatsheetPdf(): Uint8Array` with one `/Type /Page`, `/Count 1`, and an empty content stream.
- Produces: `testCheatsheetWelcomeEmail(origin): { subject: string; html: string; text: string; assetUrl: string }`.
- CLI: `npm run generate:test-cheatsheet`; output bytes must be deterministic.
- Public URL: `https://tokenbench.monomind.one/downloads/tokenbench-cheatsheet-test-v1.pdf`.
- Cache policy: `Content-Type: application/pdf`; `Cache-Control: public, max-age=31536000, immutable`.

- [ ] **Step 1: Add failing PDF, header, email-link, and production-download tests**

```ts
it('builds a deterministic valid one-page blank PDF', () => {
  const first = buildBlankTestCheatsheetPdf();
  const second = buildBlankTestCheatsheetPdf();
  expect(first).toEqual(second);
  const text = new TextDecoder('latin1').decode(first);
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text).toContain('/Type /Page');
  expect(text).toContain('/Count 1');
  expect(text).toContain('/Length 0');
  expect(text).not.toMatch(/\bBT\b|\bTj\b/);
});

it('links the reviewed welcome email to the versioned public PDF', () => {
  const email = testCheatsheetWelcomeEmail('https://tokenbench.monomind.one');
  expect(email.assetUrl).toBe('https://tokenbench.monomind.one/downloads/tokenbench-cheatsheet-test-v1.pdf');
  expect(email.text).toContain('test delivery');
  expect(email.html).not.toContain('{{ contact.EMAIL }}');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/newsletter/test-cheatsheet.test.ts scripts/generate-test-cheatsheet.test.ts`

Expected: FAIL because the deterministic PDF and reviewed welcome template are absent.

- [ ] **Step 3: Generate the valid PDF, immutable headers, and exact Brevo runbook**

```ts
export function testCheatsheetWelcomeEmail(origin: string) {
  const assetUrl = `${new URL(origin).origin}/downloads/tokenbench-cheatsheet-test-v1.pdf`;
  return {
    subject: 'Your TokenBench test cheatsheet',
    assetUrl,
    text: `Thanks for confirming. This is the current TokenBench test delivery: ${assetUrl}`,
    html: `<p>Thanks for confirming.</p><p>This is the current TokenBench test delivery.</p><p><a href="${assetUrl}">Download the test cheatsheet PDF</a></p>`,
  } as const;
}
```

Build the PDF object table and xref offsets from ASCII bytes so reruns are byte-identical. Add `generate:test-cheatsheet` and make `prebuild` run it before static page generation. Record the generated SHA-256 in deployment docs after generating the asset. Configure/verify one Brevo automation with trigger `Contact added to list` for `BREVO_CHEATSHEET_LIST_ID`, exactly one send-email step using the reviewed subject/HTML/text, and no pre-confirmation trigger. Document the automation ID, template ID, final list ID, PDF hash, and rollback switch without subscriber identity.

- [ ] **Step 4: Run Release 2 verification and controlled delivery**

Run: `npm run generate:test-cheatsheet && npm test -- src/newsletter/test-cheatsheet.test.ts scripts/generate-test-cheatsheet.test.ts src/frontend/calculator-state.test.ts src/frontend/results-dashboard.test.tsx src/pages/newsletter-confirmed-page.test.tsx`

Expected: PASS and the generated asset hash matches the documented value.

Run: `npm run lint && npm run build && npm run test:browser:local-preview`

Expected: TypeScript/build/browser suites pass, the PDF downloads as `application/pdf`, the confirmation page has one action, calculator values are finite for dynamic-unknown plans, and no mobile overflow occurs.

Operational check: use one authorized test address, confirm no welcome arrives before DOI, complete DOI once, verify exactly one welcome arrives, download the PDF, and compare its SHA-256 with the deployment document.

- [ ] **Step 5: Commit Release 2 delivery assets and evidence**

```bash
git add src/newsletter/test-cheatsheet.ts src/newsletter/test-cheatsheet.test.ts scripts/generate-test-cheatsheet.ts scripts/generate-test-cheatsheet.test.ts public/downloads/tokenbench-cheatsheet-test-v1.pdf public/_headers package.json docs/catalog-deployment.md docs/tokenbench-deployment.md browser-tests/responsive-browser.ts
git commit -m "feat: deliver test cheatsheet after confirmation"
```
