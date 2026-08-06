# TokenBench Foundation, Home, and Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the approved route hierarchy and shared UI primitives, then rebuild Home and Subscribe vs API around immediate, shareable decisions.

**Architecture:** Keep the current React/Vite/Pages architecture. Centralize routes, provider identity, sharing, and URL-state codecs in pure modules; keep Home highlights derived from active benchmark envelopes and keep calculator math unchanged while reorganizing its presentation.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, Testing Library, Cloudflare Pages Functions, existing CSS token system.

## Global Constraints

- Primary navigation is exactly Home, Subscribe vs API, Compare, Leaderboards, Guides.
- Keep `/tools/subscriptions-vs-apis/` and plural `/leaderboards/` URLs canonical.
- Do not display internal revision IDs in ordinary hero copy.
- Do not invent benchmark values, subscription entitlements, prices, or model-specific logos.
- Brandfetch uses a reviewed provider-domain map and a deterministic local fallback.
- Share URLs contain no personal data and must restore only validated state.
- Preserve keyboard navigation, reduced motion, 44 x 44 px targets, both themes, and 320 px support.
- Generated leaderboard cover images are out of scope.

---

## File ownership

This plan owns:

- `src/routing/routes.ts`, `src/routing/routes.test.ts`
- `src/seo/metadata.ts`, `src/seo/metadata.test.ts`, `src/seo/static-page.ts`
- `scripts/generate-static-pages.ts`, `scripts/generate-static-pages.test.ts`
- `src/frontend/app-shell.tsx`, `src/frontend/app-shell.test.tsx`
- `src/brand/provider-brands.ts`, `src/brand/provider-brands.test.ts`
- `src/frontend/provider-mark.tsx`, `src/frontend/provider-mark.test.tsx`
- `src/frontend/share-action.tsx`, `src/frontend/share-action.test.tsx`
- `src/frontend/calculator-share-state.ts`, `src/frontend/calculator-share-state.test.ts`
- `src/pages/home-page.tsx`, `src/pages/home-page.test.tsx`
- `src/pages/benchalign-methodology-page.tsx`, `src/pages/benchalign-methodology-page.test.tsx`
- `src/frontend/calculator-controls.tsx`, `src/frontend/results-dashboard.tsx`
- `src/App.tsx`, `src/main.test.tsx`
- `src/main.tsx`
- Shared Home/calculator/shell portions of `src/index.css`

Later plans consume `ProviderMark`, `ShareAction`, the new route keys, and the
shared navigation labels without changing their public interfaces.

### Task 1: Route hierarchy, semantic titles, and crawlable shells

**Files:**
- Modify: `src/routing/routes.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `src/seo/metadata.ts`
- Modify: `src/seo/metadata.test.ts`
- Modify: `src/seo/static-page.ts`
- Modify: `scripts/generate-static-pages.ts`
- Modify: `scripts/generate-static-pages.test.ts`
- Modify: `src/frontend/app-shell.tsx`
- Test: `src/frontend/app-shell.test.tsx`
- Create: `src/pages/benchalign-methodology-page.tsx`
- Create: `src/pages/benchalign-methodology-page.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/main.test.tsx`

**Interfaces:**
- Produces: `ROUTE_PATHS.methodologyBenchAlign === '/methodology/benchalign/'`
- Produces: semantic `LEADERBOARD_ROUTES[*].navigationLabel` values consumed by the Leaderboards plan
- Produces: `SiteNavigationPage = 'home' | 'calculator' | 'compare' | 'leaderboards' | 'guides'`
- Produces: a rendered, source-linked `/methodology/benchalign/` React page rather than only an SEO shell

- [ ] **Step 1: Write failing route and navigation tests**

```ts
it('publishes the approved decision hierarchy and canonical redirects', () => {
  expect(matchRoute('/methodology/benchalign/')).toEqual({ kind: 'methodologyBenchAlign' });
  expect(matchRoute('/leaderboard')).toEqual({ kind: 'redirect', to: '/leaderboards/' });
  expect(matchRoute('/leaderboard/llm/coding')).toEqual({ kind: 'redirect', to: '/leaderboards/llm/coding/' });
  expect(matchRoute('/tools/')).toEqual({ kind: 'tools' });
  expect(LEADERBOARD_ROUTES['llm-overall'].navigationLabel).toBe('Overall benchmarks');
  expect(LEADERBOARD_ROUTES['llm-agentic'].navigationLabel).toBe('Agentic performance');
});

it('renders the five approved primary navigation destinations', () => {
  render(<SiteHeader theme="dark" language="en" activePage="home" onThemeToggle={vi.fn()} onLanguageChange={vi.fn()} />);
  expect(within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    .getAllByRole('link').map((link) => link.textContent))
    .toEqual(['Home', 'Subscribe vs API', 'Compare', 'Leaderboards', 'Guides']);
});

it('explains the BenchAlign source boundary without claiming ownership', () => {
  render(<BenchAlignMethodologyPage />);
  expect(screen.getByRole('heading', { name: 'How BenchAlign rankings work' })).toBeVisible();
  expect(screen.getByText(/TokenBench republishes BenchLM's BenchAlign results/i)).toBeVisible();
  expect(screen.getByRole('link', { name: /Read BenchLM's methodology/i })).toHaveAttribute(
    'href',
    'https://benchlm.ai/methodology',
  );
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/routing/routes.test.ts src/frontend/app-shell.test.tsx src/pages/benchalign-methodology-page.test.tsx src/main.test.tsx scripts/generate-static-pages.test.ts`

Expected: FAIL because the new route keys, method route, semantic labels, and navigation links do not exist.

- [ ] **Step 3: Add the route records and approved navigation**

```ts
export const ROUTE_PATHS = {
  home: '/',
  guides: '/guides/',
  tools: '/tools/',
  calculator: '/tools/subscriptions-vs-apis/',
  compareHub: '/compare/',
  leaderboards: '/leaderboards/',
  methodologyBenchAlign: '/methodology/benchalign/',
} as const;

export type SiteNavigationPage = 'home' | 'calculator' | 'compare' | 'leaderboards' | 'guides';
```

Update the fixed-route registry, metadata, generated static page copy, sitemap,
and header links in the same change. Keep `/tools/` as a crawlable compatibility
page with a single primary link to the calculator; do not add it to navigation.
Add explicit singular `/leaderboard` index/detail redirects to their plural
canonical routes and test canonical/sitemap output. Reasoning and Knowledge
route keys land atomically with their definitions in the Leaderboards plan so
the `Record<LeaderboardKey, ...>` invariant never breaks.

Create the React methodology page and dispatch `methodologyBenchAlign` from
`main.tsx` and `App.tsx`. Its exact H1 is “How BenchAlign rankings work.” The
approved content must state that TokenBench republishes BenchLM's
BenchAlign output without recalculating it; explain supported versus estimated
rows, missing-data treatment, weighted versus display-only metrics, and that
runtime is a separate signal. Label Overall, Agentic, and Coding as validated
BenchAlign views; label Reasoning, Multimodal, and Knowledge as BenchLM-published
category evidence lenses. Display the current published method version when it
exists in the active source metadata and “Unavailable” otherwise. Distinguish
BenchLM source refreshes from TokenBench's once-daily source check inside the
twice-daily broader Worker. Link the source-method sentence to BenchLM's
methodology. Update `PageFrame` call sites to use the new `SiteNavigationPage`
names.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/routing/routes.test.ts src/seo/metadata.test.ts src/frontend/app-shell.test.tsx src/pages/benchalign-methodology-page.test.tsx src/main.test.tsx scripts/generate-static-pages.test.ts`

Expected: PASS with the method page in generated inputs, singular canonical redirects, the five-link navigation, and no duplicate sitemap URLs.

- [ ] **Step 5: Commit the route foundation**

```bash
git add src/routing/routes.ts src/routing/routes.test.ts src/seo/metadata.ts src/seo/metadata.test.ts src/seo/static-page.ts scripts/generate-static-pages.ts scripts/generate-static-pages.test.ts src/frontend/app-shell.tsx src/frontend/app-shell.test.tsx src/pages/benchalign-methodology-page.tsx src/pages/benchalign-methodology-page.test.tsx src/App.tsx src/main.tsx src/main.test.tsx
git commit -m "feat: align TokenBench decision routes"
```

### Task 2: Reviewed provider identity and Brandfetch fallback

**Files:**
- Create: `src/brand/provider-brands.ts`
- Create: `src/brand/provider-brands.test.ts`
- Create: `src/frontend/provider-mark.tsx`
- Create: `src/frontend/provider-mark.test.tsx`
- Modify: `.env.example`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `providerBrand(providerId: string): ProviderBrand`
- Produces: `modelBrand(modelId: string): ProviderBrand | null` from an explicit reviewed model-family map only
- Produces: `ProviderMark({ providerId, providerName, size?: 20 | 24 | 32, theme?: 'light' | 'dark', decorative?: boolean })`
- Produces: `ModelMark({ modelId, providerId, providerName, size?, theme?, decorative? })`, falling back to the verified provider mark
- `ProviderBrand = { domain: string | null; label: string; fallback: string }`

- [ ] **Step 1: Write failing mapping and fallback tests**

```ts
it('uses only reviewed domains and deterministic fallbacks', () => {
  expect(providerBrand('openai')).toEqual({ domain: 'openai.com', label: 'OpenAI', fallback: 'O' });
  expect(providerBrand('unknown-lab')).toEqual({ domain: null, label: 'Unknown lab', fallback: 'U' });
});

it('replaces a failed Brandfetch image with a labelled lettermark', () => {
  render(<ProviderMark providerId="anthropic" providerName="Anthropic" size={24} theme="dark" />);
  fireEvent.error(screen.getByRole('img', { name: 'Anthropic' }));
  expect(screen.getByText('A')).toHaveAttribute('aria-label', 'Anthropic');
});

it('reserves dimensions and never guesses an unreviewed model brand', () => {
  render(<ModelMark modelId="unknown/model" providerId="unknown-lab" providerName="Unknown lab" size={32} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Unknown lab')).toHaveStyle({ width: '32px', height: '32px' });
  expect(modelBrand('unknown/model')).toBeNull();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/brand/provider-brands.test.ts src/frontend/provider-mark.test.tsx`

Expected: FAIL because the registry and component are missing.

- [ ] **Step 3: Implement the reviewed registry and component**

```ts
export interface ProviderBrand {
  readonly domain: string | null;
  readonly label: string;
  readonly fallback: string;
}

const BRANDS: Readonly<Record<string, ProviderBrand>> = {
  openai: { domain: 'openai.com', label: 'OpenAI', fallback: 'O' },
  anthropic: { domain: 'anthropic.com', label: 'Anthropic', fallback: 'A' },
  google: { domain: 'google.com', label: 'Google', fallback: 'G' },
  xai: { domain: 'x.ai', label: 'xAI', fallback: 'X' },
  moonshot: { domain: 'moonshot.ai', label: 'Moonshot AI', fallback: 'M' },
};
```

Build logo URLs only when both `domain` and the explicitly public
`import.meta.env.VITE_BRANDFETCH_CLIENT_ID` exist. Label that variable as a
browser-visible public client identifier in `.env.example`; never place a
private credential there. Request an icon variant and the passed theme, using a
deterministic SSR-safe theme default rather than reading `document` during
render. Reserve width and height, use lazy loading outside above-the-fold hero
marks, preserve decorative/labelled semantics, and switch permanently to the
fallback after `onError`. Add only reviewed model-family entries; otherwise
`ModelMark` inherits `ProviderMark`. No test performs a network request.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/brand/provider-brands.test.ts src/frontend/provider-mark.test.tsx`

Expected: PASS for fixed dimensions, light/dark URL variants, decorative and labelled semantics, SSR-safe rendering, lazy-loading policy, error fallback, unknown domains, inherited model marks, and no network dependency.

- [ ] **Step 5: Commit provider identity**

```bash
git add src/brand/provider-brands.ts src/brand/provider-brands.test.ts src/frontend/provider-mark.tsx src/frontend/provider-mark.test.tsx .env.example src/index.css
git commit -m "feat: add resilient provider marks"
```

### Task 3: Shared share action and calculator URL codec

**Files:**
- Create: `src/frontend/share-action.tsx`
- Create: `src/frontend/share-action.test.tsx`
- Create: `src/frontend/calculator-share-state.ts`
- Create: `src/frontend/calculator-share-state.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `ShareAction({ url, title, text, label?: string })`
- Produces: `encodeCalculatorShareState(state: CalculatorShareState): URLSearchParams`
- Produces: `decodeCalculatorShareState(params: URLSearchParams, catalog: Catalog): DecodedCalculatorShareState | null`
- `DecodedCalculatorShareState = { state: CalculatorShareState; wasNormalized: boolean }`
- `CalculatorShareState` contains provider ID, plan ID, selected model IDs, basis-point weights, input-share basis points, and monthly tokens.

- [ ] **Step 1: Write failing native-share, clipboard, and validation tests**

```ts
it('falls back to clipboard and announces success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<ShareAction url="https://tokenbench.monomind.one/compare/a-vs-b" title="A vs B" text="Compare A and B" />);
  fireEvent.click(screen.getByRole('button', { name: 'Share result' }));
  await screen.findByRole('status');
  expect(writeText).toHaveBeenCalledWith('https://tokenbench.monomind.one/compare/a-vs-b');
});

it('recovers a valid provider and model mix when a shared plan/model was removed', () => {
  const params = new URLSearchParams('provider=provider-a&plan=removed&models=provider-a%3Aalpha%3Adirect,removed&weights=7000,3000&input=5000&tokens=1000000&utm_source=test');
  expect(decodeCalculatorShareState(params, FRONTEND_TEST_CATALOG)).toMatchObject({
    wasNormalized: true,
    state: { providerId: 'provider-a', planId: '', selectedModelIds: ['provider-a:alpha:direct'], modelMixBasisPoints: { 'provider-a:alpha:direct': 10000 } },
  });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/frontend/share-action.test.tsx src/frontend/calculator-share-state.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the action and strict codec**

```ts
export interface CalculatorShareState {
  readonly providerId: string;
  readonly planId: string;
  readonly selectedModelIds: readonly string[];
  readonly modelMixBasisPoints: Readonly<Record<string, number>>;
  readonly inputShareBasisPoints: number;
  readonly monthlyTokens: number;
}
```

Use comma-separated encoded model IDs and weights only after validating model
membership in the selected provider. Require integer basis points in `[0, 10000]`,
positive safe-integer tokens, and a selected-model weight total of 10000.
Ignore unknown query keys. If the provider remains valid, clear a removed plan,
retain valid models, and normalize their surviving weights to 10000 with a
stable largest-remainder rule; return `wasNormalized: true` so the caller can
replace the URL with the canonical encoding. Return `null` for an unknown
provider, no surviving model, duplicate state keys, non-finite/malformed values,
or an unsafe token count.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/frontend/share-action.test.tsx src/frontend/calculator-share-state.test.ts`

Expected: PASS for native share, clipboard fallback, failure announcement, round trip, unknown-key ignoring, partial-offer recovery, stable weight normalization, duplicate/malformed rejection, and full invalid-state rejection.

- [ ] **Step 5: Commit sharing primitives**

```bash
git add src/frontend/share-action.tsx src/frontend/share-action.test.tsx src/frontend/calculator-share-state.ts src/frontend/calculator-share-state.test.ts src/index.css
git commit -m "feat: add restorable result sharing"
```

### Task 4: Guided Subscribe vs API experience

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/frontend/calculator-controls.tsx`
- Modify: `src/frontend/results-dashboard.tsx`
- Modify: `src/main.test.tsx`
- Modify: `src/frontend/app-shell.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `ShareAction`, `ProviderMark`, `ModelMark`, `encodeCalculatorShareState`, `decodeCalculatorShareState`
- Preserves: `buildCalculatorSnapshot`, `createInitialSelection`, and existing calculator math contracts
- Uses: existing `recommendCostFirst` eligibility result for recommendation language

- [ ] **Step 1: Write failing guided-flow and shared-state tests**

```ts
it('presents the calculator as four guided steps and a plain-language result', async () => {
  renderAt('/tools/subscriptions-vs-apis/?provider=provider-a&plan=provider-a:starter&models=provider-a:alpha:direct&weights=10000&input=5000&tokens=10000000');
  expect(screen.getByRole('heading', { name: 'Should you subscribe or pay as you go?', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('Estimate the API-equivalent value of an AI subscription using the models, token volume, and input/output mix that match your workload.')).toBeInTheDocument();
  expect(screen.getAllByText(/^Step [1-4]$/)).toHaveLength(4);
  expect(screen.getByRole('heading', { name: 'Choose a provider and plan' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Choose the models you actually use' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Describe your monthly workload' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Review the recommendation' })).toBeInTheDocument();
  expect(await screen.findByRole('region', { name: 'Calculated plan value' })).toHaveTextContent(/subscription|pay as you go/i);
  expect(screen.getByRole('button', { name: 'Share result' })).toBeInTheDocument();
});

it.each(['rolling', 'guardrail', 'credits', 'unsupported-mix', 'no-plan'])(
  'does not call an ineligible %s subscription cheaper', async (fixture) => {
    renderCalculator(calculatorFixture(fixture));
    expect(await screen.findByRole('region', { name: 'Calculated plan value' }))
      .not.toHaveTextContent('Subscription is cheaper');
  },
);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/main.test.tsx src/frontend/app-shell.test.tsx`

Expected: FAIL because the current H1 is screen-reader-only, steps are absent, and result sharing is absent.

- [ ] **Step 3: Recompose the page without changing calculations**

Add the exact approved header/subcopy and a semantic ordered step overview that
returning visitors can collapse. Group existing controls under the four exact
step headings in the test. Step 1 explains price and visibly flags variable,
rolling, credit-based, or unpublished entitlement types. Step 2 supplies the
existing sensible selection and moves model-weight sliders into a `<details>`
element titled “Adjust model usage mix.” Step 3 keeps presets plus direct token
volume and input/output controls with one short example. Step 4 prioritizes
subscription price, API-equivalent cost, difference, breakeven, assumptions,
and unavailable facts. Derive the result sentence
from `recommendCostFirst` eligibility plus
`snapshot.estimatedMonthlySavingsMicroDollars`; never call rolling-limit,
guardrail, credits-only, missing-plan, or unsupported-model outcomes cheaper.
Define explicit copy for subscription-cheaper, API-cheaper, zero-difference,
and unable-to-compare states.
Use reviewed provider/model marks beside labelled provider and selected-model
rows without replacing their visible text.

After catalog readiness, apply decoded query state in a `useEffect` guarded by
an `appliedSharedStateRef` so loading rerenders cannot overwrite user choices.
If decoding recovered a valid partial state, replace the address bar once with
the canonical encoding. Preserve entered valid state when a selected plan was
removed and retest provider changes after hydration. Aside from this one
normalization, update the URL only when the user invokes Share.

At desktop widths place guided controls beside a sticky result summary. On
mobile preserve one reading sequence and a 44 px persistent “View result”
action that focuses the result without hiding any step.

```tsx
<ShareAction
  label="Share result"
  title="TokenBench subscription vs API result"
  text={recommendation}
  url={`${location.origin}${ROUTE_PATHS.calculator}?${encodeCalculatorShareState(shareState)}`}
/>
```

- [ ] **Step 4: Run focused calculator tests and verify GREEN**

Run: `npm test -- src/main.test.tsx src/frontend/calculator-state.test.ts src/catalog/calculator.test.ts`

Expected: PASS with all pre-existing calculation assertions unchanged plus removed-plan recovery, loading-to-ready hydration, provider changes, rolling/guardrail/credits/unsupported eligibility, positive/zero/negative savings, and unable-to-compare copy.

- [ ] **Step 5: Commit the guided calculator**

```bash
git add src/App.tsx src/frontend/calculator-controls.tsx src/frontend/results-dashboard.tsx src/main.test.tsx src/frontend/app-shell.test.tsx src/index.css
git commit -m "feat: guide subscription versus API decisions"
```

### Task 5: Home decision snapshot and clarified product story

**Files:**
- Create: `src/pages/home-page.test.tsx`
- Modify: `src/pages/home-page.tsx`
- Modify: `src/frontend/app-shell.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes after Leaderboards Task 3: `useHomeDecisionSnapshot`, `HomeDecisionSnapshot`, `ProviderMark`, route registry
- Preserves: supported-only winner rules and explicit unavailable states from the materialized summary

- [ ] **Step 1: Write failing Home content and evidence tests**

```ts
it('explains the product and exposes the three primary decisions', async () => {
  render(<HomePage />);
  expect(screen.getByRole('heading', { name: 'Transparent AI Costs. Verified Benchmarks.', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('The free decision engine for your AI stack. Evaluate exact model pricing and source-backed performance data so you can choose the best LLM for your workload.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Compare models' })).toHaveAttribute('href', '/compare/');
  expect(screen.getByRole('link', { name: 'Calculate subscription vs API' })).toHaveAttribute('href', '/tools/subscriptions-vs-apis/');
  expect(screen.getByRole('link', { name: 'Browse leaderboards' })).toHaveAttribute('href', '/leaderboards/');
  expect(screen.queryByText('Benchmark signals')).not.toBeInTheDocument();
  expect(screen.getByText(/up to 90%/i)).toBeInTheDocument();
});

it('renders all four live snapshot slots from one defensible envelope', async () => {
  render(<HomePage />, { wrapper: homeSummaryFixture() });
  expect(await screen.findByRole('region', { name: 'Live decision snapshot' })).toHaveTextContent('BenchAlign leader');
  expect(screen.getByText('Value-frontier leader')).toBeInTheDocument();
  expect(screen.getByText('Lowest verified API rate')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /price versus performance/i })).toHaveAccessibleDescription();
});

it('states unavailable facts without substituting sample data', async () => {
  render(<HomePage />, { wrapper: unavailableHomeSummaryFixture() });
  expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThanOrEqual(4);
  expect(screen.queryByText(/sample|example model/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused Home tests and verify RED**

Run: `npm test -- src/pages/home-page.test.tsx src/frontend/app-shell.test.tsx`

Expected: FAIL on old copy, terminal panes, old benchmark-signal heading, and the 60% service statement.

- [ ] **Step 3: Implement the approved Home hierarchy**

Replace terminal panes with a semantic decision snapshot containing supported
BenchAlign leader, value-frontier leader, lowest available verified rate, and a
small accessible price/performance plot. This task starts only after
Leaderboards Task 3 publishes one `HomeDecisionSnapshot` in the summary
envelope. Do not issue separate leaderboard requests. Every slot is a discriminated
ready/unavailable value; the plot receives exact supported points plus a text
alternative listing model, representative price, performance score, and the
direction of better values. No UI fallback inserts sample facts.

Do not render source links in each teaser. Link every highlight to its relevant
leaderboard and put one “How rankings work” link after the snapshot.

After the snapshot, render the approved sequence: “Make three decisions
faster,” “See the market at a glance,” “What TokenBench gives you,” “Built for
AI builders,” and “MonoMind AI Lab.” Cover exact route pricing, comparable
performance evidence, workload calculations, downloads, and shareable results
in concise feature copy. Remove the old terminal workflow and “Benchmark
signals” section completely, and end the service statement with “cut API bills
by up to 90%.”

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/pages/home-page.test.tsx src/frontend/app-shell.test.tsx src/frontend/use-benchmarks.test.ts`

Expected: PASS for one summary request, ready, stale, unavailable, supported-only leaders, value-frontier selection, representative-rate selection, and plot text alternatives.

- [ ] **Step 5: Commit Home**

```bash
git add src/pages/home-page.tsx src/pages/home-page.test.tsx src/frontend/app-shell.test.tsx src/index.css
git commit -m "feat: clarify the TokenBench home experience"
```

### Task 6: Foundation responsive and static verification

**Files:**
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `browser-tests/tokenbench-fixtures.ts`
- Modify: `scripts/mockup-contract.test.ts` only if its copy assertions cover changed production labels

**Interfaces:**
- Consumes: all interfaces produced by Tasks 1-5
- Produces: browser coverage consumed by final Sol integration

- [ ] **Step 1: Add failing browser assertions**

Add checks for the five navigation labels, Home H1 and three actions, calculator
four-step headings, Share target size, provider-mark fallback, no horizontal
overflow at 320 px, and no internal revision string in the Home/calculator first
viewport.

- [ ] **Step 2: Run the focused browser suite and verify RED**

Run: `npm run test:browser -- --grep "Home|calculator|navigation"`

Expected: FAIL until fixture routes and assertions match the redesigned pages.

- [ ] **Step 3: Update browser fixtures and responsive CSS**

Keep tables/cards outside this plan unchanged. Fix only shell, Home, calculator,
share, and provider-mark selectors. Preserve the existing wide-SSR/compact-client
hydration behavior.

- [ ] **Step 4: Run plan verification**

Run:

```bash
npm test -- src/routing/routes.test.ts src/seo/metadata.test.ts src/frontend/app-shell.test.tsx src/pages/benchalign-methodology-page.test.tsx src/pages/home-page.test.tsx src/brand/provider-brands.test.ts src/frontend/provider-mark.test.tsx src/frontend/share-action.test.tsx src/frontend/calculator-share-state.test.ts src/main.test.tsx scripts/generate-static-pages.test.ts
npm run lint
npm run build
npm run test:browser -- --grep "Home|calculator|navigation"
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit responsive coverage**

```bash
git add browser-tests/responsive-browser.ts browser-tests/tokenbench-fixtures.ts scripts/mockup-contract.test.ts src/index.css
git commit -m "test: cover redesigned decision entry points"
```
