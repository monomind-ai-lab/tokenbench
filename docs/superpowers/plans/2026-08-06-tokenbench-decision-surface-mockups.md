# TokenBench Decision-Surface Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce five reviewable, responsive TokenBench HTML mockups that transfer the dark calculator’s decision-workstation details into a unified light/dark system.

**Architecture:** A framework-free mockup layer under `.stitch/designs/` provides shared semantic tokens, shell primitives, interaction behavior, and per-surface CSS modules. Static HTML remains independently openable from disk. Vitest validates content contracts, while a dedicated Playwright configuration verifies accessibility geometry and renders the complete two-theme, two-viewport screenshot matrix.

**Tech Stack:** Semantic HTML5, CSS custom properties, vanilla JavaScript, TypeScript 5.8, Vitest 4, JSDOM, Playwright 1.55, existing TokenBench brand assets.

**Execution Choice:** Subagent-driven execution is preselected by the user. Task 1 runs first on the integration branch. The orchestrator then uses `superpowers:using-git-worktrees` to create sibling worktrees for Tasks 2–4, which run concurrently with disjoint file ownership. Each task receives specification review and code-quality review before Task 5 cherry-picks it; Task 5 remains with the integrating agent.

## Global Constraints

- The existing dark calculator is the visual authority and receives no intentional visual redesign.
- Mockup sources are exactly `.stitch/designs/calculator-light.html`, `.stitch/designs/compare-hub.html`, `.stitch/designs/compare-detail.html`, `.stitch/designs/leaderboards-directory.html`, and `.stitch/designs/leaderboard-value.html`.
- Every source supports `dark` and `light` semantic themes and renders at widths `1440` and `390`; layout remains safe at `320`.
- Raw screenshots use `<stem>-<width>-<theme>.png` in `.stitch/designs/renders/`.
- Dark tokens: canvas `#0f0f0f`, surface `#181818`, container `#222222`, elevated `#2a2a2a`, text `#ffffff`, muted `#a8a8a8`, primary `#0007cd`.
- Light tokens: canvas `#f7f8fc`, surface `#ffffff`, container `#eef1f7`, elevated `#e7ebf3`, divider `#e0e4ef`, text `#111318`, muted `#505866`, selected `#e0e5ff`, primary `#0007cd`.
- Panels use `12px` radii, controls and buttons `8px`, and compact selection rows `4px`.
- Inter is the display/body stack; JetBrains Mono or the production monospace fallback is reserved for evidence, filters, methodology, and measurement labels.
- No external runtime dependencies, remote fonts, invented rankings, winners, subscription mappings, reviewed pairs, testimonials, or universal value score.
- Missing evidence renders the literal text `Unavailable`; zero never substitutes for missing data.
- Controls and links have at least `44px` targets, visible keyboard focus, and non-color state cues.
- Wide tables become fact-equivalent ordered cards on narrow screens; horizontal clipping is prohibited.
- Each HTML body begins with the Impeccable direction contract comment containing `THESIS`, `OWN-WORLD`, `STORY`, `FIRST VIEWPORT`, `FORM`, and the exact `FINISH` sentence from the approved specification workflow.
- Use the production TokenBench header/footer labels and local `public/brand/monomind-tokenbench.png` asset.
- Preserve user changes, do not deploy, and do not modify production APIs, Workers, Pages Functions, schema, or React surfaces in this mockup plan.

## File Structure

- `.stitch/designs/tokenbench-mockup.css` — shared semantic tokens, shell, panel, controls, tables/cards, focus, theme, and responsive primitives.
- `.stitch/designs/tokenbench-mockup.js` — query-driven theme selection, accessible theme toggle, and mobile navigation behavior.
- `.stitch/designs/calculator-mockup.css` — calculator-only control, result, chart, pricing, and recommendation composition.
- `.stitch/designs/compare-mockup.css` — compare hub and pair-detail composition.
- `.stitch/designs/leaderboard-mockup.css` — directory, filter rail, ranked table, and mobile-card composition.
- `scripts/mockup-contract.ts` — reusable static HTML contract validator.
- `scripts/mockup-contract.test.ts` — validator and shared-system unit tests.
- `scripts/calculator-light-mockup.test.ts` — calculator content and parity contract.
- `scripts/compare-mockups.test.ts` — hub/detail truth and structure contract.
- `scripts/leaderboard-mockups.test.ts` — directory/value truth and structure contract.
- `scripts/mockup-manifest.ts` — canonical five-page, two-theme, two-viewport render matrix.
- `scripts/render-tokenbench-mockups.ts` — deterministic full-page screenshot renderer.
- `browser-tests/mockup-browser.ts` — overflow, target-size, focus, theme, table/card, and console checks.
- `playwright.mockups.config.ts` — isolated file-URL Playwright configuration with no application server.
- `.stitch/designs/mockup-manifest.json` — portable artifact index describing authored mockups and generated captures.
- `package.json` — `test:mockups` and `render:mockups` commands.

## Parallel Worktree Topology

After Task 1 commits, run these commands from the primary TokenBench checkout, not from the integration worktree:

```bash
git worktree add ../.worktrees/tokenbench-mockup-calculator -b codex/tokenbench-mockup-calculator codex/tokenbench-platform
git worktree add ../.worktrees/tokenbench-mockup-compare -b codex/tokenbench-mockup-compare codex/tokenbench-platform
git worktree add ../.worktrees/tokenbench-mockup-leaderboards -b codex/tokenbench-mockup-leaderboards codex/tokenbench-platform
```

Task 2 owns the calculator worktree, Task 3 the compare worktree, and Task 4 the leaderboard worktree. Agents must not edit or stage files outside their declared task. The integrating agent verifies each commit and cherry-picks only after both review gates pass.

---

### Task 1: Establish the Shared Mockup Contract and Visual System

**Files:**
- Create: `scripts/mockup-contract.ts`
- Create: `scripts/mockup-contract.test.ts`
- Create: `.stitch/designs/tokenbench-mockup.css`
- Create: `.stitch/designs/tokenbench-mockup.js`

**Interfaces:**
- Consumes: approved tokens and structure from `docs/superpowers/specs/2026-08-05-tokenbench-mockups-design.md`.
- Produces: `validateMockupHtml(html: string, expected: MockupExpectation): string[]`, `validateMockupCss(css: string): string[]`, the shared stylesheet link `tokenbench-mockup.css`, and the shared behavior script `tokenbench-mockup.js` used by Tasks 2–4.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateMockupCss, validateMockupHtml } from './mockup-contract';

const validHtml = `<!doctype html><html lang="en" data-theme="dark"><head>
<link rel="stylesheet" href="tokenbench-mockup.css"></head><body><!--
THESIS: Evidence stays attached to the decision.
OWN-WORLD: Compact neutral panels with electric-blue state.
STORY: Select, inspect, and verify.
FIRST VIEWPORT: Shared shell above the task workspace.
FORM: Decision workstation; approved 2026-08-06.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
--><a class="skip-link" href="#page-content">Skip to page content</a>
<header><a class="brand-home" href="/">TokenBench</a><nav aria-label="Primary navigation"><a href="/tools/">Tools</a><a href="/compare/">Compare</a><a href="/leaderboards/">Leaderboards</a><a href="/guides/">Guides</a></nav><button data-theme-toggle aria-label="Toggle light theme">Theme</button></header>
<main id="page-content"><h1>Fixture</h1></main><script src="tokenbench-mockup.js"></script></body></html>`;

describe('mockup contract', () => {
  it('rejects an artifact without the direction contract or shared assets', () => {
    expect(validateMockupHtml('<html><body><h1>Broken</h1></body></html>', { h1: 'Broken' }))
      .toEqual(expect.arrayContaining(['missing direction contract', 'missing shared stylesheet', 'missing shared behavior']));
  });

  it('accepts a complete semantic shell', () => {
    expect(validateMockupHtml(validHtml, { h1: 'Fixture' })).toEqual([]);
  });

  it('rejects a mutated theme contract and accepts the shipped stylesheet', () => {
    expect(validateMockupCss(`:root { --bg: #ffffff; }`)).toEqual(expect.arrayContaining(['missing dark canvas #0f0f0f', 'missing light canvas #f7f8fc', 'missing 44px target rule', 'missing focus-visible rule']));
    const css = readFileSync('.stitch/designs/tokenbench-mockup.css', 'utf8');
    expect(validateMockupCss(css)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify the RED state**

Run: `npm test -- scripts/mockup-contract.test.ts`

Expected: FAIL because `scripts/mockup-contract.ts` and the shared stylesheet do not exist.

- [ ] **Step 3: Implement the static contract validator**

```ts
import { JSDOM } from 'jsdom';

export interface MockupExpectation {
  readonly h1: string;
  readonly requiredSections?: readonly string[];
}

const contractMarkers = ['THESIS:', 'OWN-WORLD:', 'STORY:', 'FIRST VIEWPORT:', 'FORM:', 'FINISH:'];

export function validateMockupHtml(html: string, expected: MockupExpectation): string[] {
  const document = new JSDOM(html).window.document;
  const errors: string[] = [];
  const first = document.body.firstChild;
  if (first?.nodeType !== 8 || !contractMarkers.every((marker) => first.textContent?.includes(marker))) errors.push('missing direction contract');
  if (!document.querySelector('link[href="tokenbench-mockup.css"]')) errors.push('missing shared stylesheet');
  if (!document.querySelector('script[src="tokenbench-mockup.js"]')) errors.push('missing shared behavior');
  if (document.querySelector('h1')?.textContent?.trim() !== expected.h1) errors.push(`expected H1: ${expected.h1}`);
  if (!document.querySelector('.skip-link[href="#page-content"]')) errors.push('missing skip link');
  if (!document.querySelector('nav[aria-label="Primary navigation"]')) errors.push('missing primary navigation');
  if (!document.querySelector('[data-theme-toggle][aria-label]')) errors.push('missing semantic theme toggle');
  for (const section of expected.requiredSections ?? []) if (!document.querySelector(`[data-mockup-section="${section}"]`)) errors.push(`missing section: ${section}`);
  for (const element of document.querySelectorAll('link[href^="http"], script[src^="http"], img[src^="http"]')) errors.push(`external runtime asset: ${element.outerHTML}`);
  return errors;
}

const cssRequirements = [
  ['#0f0f0f', 'missing dark canvas #0f0f0f'],
  ['#181818', 'missing dark surface #181818'],
  ['#0007cd', 'missing primary #0007cd'],
  ['#f7f8fc', 'missing light canvas #f7f8fc'],
  ['#ffffff', 'missing light surface #ffffff'],
  ['#e0e5ff', 'missing selected surface #e0e5ff'],
] as const;

export function validateMockupCss(css: string): string[] {
  const errors = cssRequirements.filter(([value]) => !css.toLowerCase().includes(value)).map(([, error]) => error);
  if (!/min-height:\s*44px/i.test(css)) errors.push('missing 44px target rule');
  if (!/:focus-visible/i.test(css)) errors.push('missing focus-visible rule');
  if (!/@media\s*\([^)]*max-width:\s*767px/i.test(css)) errors.push('missing mobile shell rule');
  return errors;
}
```

- [ ] **Step 4: Implement the shared semantic CSS and behavior**

Start the stylesheet with the approved tokens and shared primitives:

```css
:root, [data-theme='dark'] {
  color-scheme: dark;
  --bg: #0f0f0f; --surface: #181818; --container: #222222; --elevated: #2a2a2a;
  --text: #ffffff; --muted: #a8a8a8; --outline: #333333; --primary: #0007cd;
  --primary-strong: #9dabff; --selected: #1b2374; --focus: #ffcf91; --shadow: none;
}
[data-theme='light'] {
  color-scheme: light;
  --bg: #f7f8fc; --surface: #ffffff; --container: #eef1f7; --elevated: #e7ebf3;
  --text: #111318; --muted: #505866; --outline: #e0e4ef; --primary: #0007cd;
  --primary-strong: #0005a3; --selected: #e0e5ff; --focus: #8a4700;
  --shadow: 0 4px 18px rgba(31, 45, 64, .08);
}
* { box-sizing: border-box; }
html { min-width: 320px; background: var(--bg); }
body { min-width: 320px; margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
button, a, input, select { min-height: 44px; font: inherit; }
button, a { min-width: 44px; }
:is(button, a, input, select):focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip-link { position: fixed; top: 8px; left: 8px; z-index: 100; display: inline-flex; align-items: center; padding: 10px 14px; transform: translateY(-160%); background: var(--primary); color: #fff; }
.skip-link:focus { transform: translateY(0); }
.mockup-header { position: sticky; top: 0; z-index: 30; min-height: 64px; border-bottom: 1px solid var(--outline); background: color-mix(in srgb, var(--bg) 92%, transparent); }
.mockup-header-inner { width: min(100% - 64px, 1280px); min-height: 64px; margin: 0 auto; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px; }
.brand-home, .primary-nav a, .header-actions { display: inline-flex; align-items: center; }
.primary-nav { display: flex; align-items: stretch; gap: 22px; }
.primary-nav a { color: var(--muted); text-decoration: none; }
.primary-nav a[aria-current='page'] { border-bottom: 2px solid var(--primary); color: var(--text); font-weight: 700; }
.header-actions { justify-self: end; gap: 8px; }
.menu-button { display: none; }
.mockup-main { width: min(100% - 64px, 1280px); margin: 0 auto; padding: 24px 0 72px; display: grid; gap: 28px; }
.mockup-footer { width: min(100% - 64px, 1280px); margin: 0 auto; padding: 28px 0 42px; display: flex; justify-content: space-between; gap: 24px; border-top: 1px solid var(--outline); color: var(--muted); }
.mockup-panel { border: 1px solid var(--outline); border-radius: 12px; background: var(--surface); box-shadow: var(--shadow); }
.mockup-control { min-height: 44px; border: 1px solid var(--outline); border-radius: 8px; background: var(--surface); color: var(--text); }
.mockup-choice { min-height: 44px; border: 1px solid var(--outline); border-radius: 4px; background: var(--surface); }
.mockup-choice[aria-checked='true'], .mockup-choice[aria-selected='true'] { border-color: var(--primary); background: var(--selected); font-weight: 700; }
@media (max-width: 767px) {
  .mockup-header-inner, .mockup-main, .mockup-footer { width: min(100% - 32px, 1280px); }
  .mockup-header-inner { grid-template-columns: 1fr auto auto; gap: 8px; }
  .menu-button { display: inline-flex; align-items: center; justify-content: center; }
  .primary-nav { position: absolute; top: 64px; right: 16px; left: 16px; display: none; padding: 12px; border: 1px solid var(--outline); border-radius: 12px; background: var(--surface); }
  .primary-nav[data-open] { display: grid; }
  .mockup-footer { flex-direction: column; }
}
```

Implement deterministic theme and navigation behavior:

```js
(() => {
  const root = document.documentElement;
  const requested = new URLSearchParams(location.search).get('theme');
  if (requested === 'light' || requested === 'dark') root.dataset.theme = requested;
  const toggle = document.querySelector('[data-theme-toggle]');
  const sync = () => {
    const dark = root.dataset.theme !== 'light';
    toggle?.setAttribute('aria-pressed', String(dark));
    toggle?.setAttribute('aria-label', dark ? 'Toggle light theme' : 'Toggle dark theme');
  };
  toggle?.addEventListener('click', () => { root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light'; sync(); });
  const menu = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-primary-nav]');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav?.toggleAttribute('data-open', open);
  });
  sync();
})();
```

- [ ] **Step 5: Run the shared-system tests**

Run: `npm test -- scripts/mockup-contract.test.ts`

Expected: PASS with three tests and no external network access.

- [ ] **Step 6: Commit the shared system**

```bash
git add scripts/mockup-contract.ts scripts/mockup-contract.test.ts .stitch/designs/tokenbench-mockup.css .stitch/designs/tokenbench-mockup.js
git commit -m "test: establish TokenBench mockup contract"
```

### Task 2: Rebuild the Light Calculator from the Dark Detail Language

**Files:**
- Modify: `.stitch/designs/calculator-light.html`
- Create: `.stitch/designs/calculator-mockup.css`
- Create: `scripts/calculator-light-mockup.test.ts`

**Interfaces:**
- Consumes: `validateMockupHtml`, `tokenbench-mockup.css`, and `tokenbench-mockup.js` from Task 1.
- Produces: a theme-switchable calculator mockup with required sections `selections`, `results`, `subscription-pricing`, `api-pricing`, and `recommendation`.

- [ ] **Step 1: Write the failing calculator parity test**

```ts
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const html = readFileSync('.stitch/designs/calculator-light.html', 'utf8');
const document = new JSDOM(html).window.document;

describe('light calculator mockup', () => {
  it('uses the shared TokenBench shell and complete decision topology', () => {
    expect(validateMockupHtml(html, {
      h1: 'Subscription vs API value calculator',
      requiredSections: ['selections', 'results', 'subscription-pricing', 'api-pricing', 'recommendation'],
    })).toEqual([]);
    expect(html).not.toContain('AI Cost Engine');
    expect([...document.querySelectorAll('nav a')].map((item) => item.textContent?.trim())).toEqual(['Tools', 'Compare', 'Leaderboards', 'Guides']);
  });

  it('keeps decisive non-color states and the dark result hierarchy', () => {
    expect(document.querySelectorAll('.mockup-choice[aria-checked="true"]')).toHaveLength(4);
    expect(document.querySelector('.value-summary-card')).not.toBeNull();
    expect(document.querySelector('.trend-chart[role="img"][aria-label]')).not.toBeNull();
    expect(document.querySelectorAll('table thead th[scope="col"]')).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run the test and verify the RED state**

Run: `npm test -- scripts/calculator-light-mockup.test.ts`

Expected: FAIL because the legacy light mockup lacks the shared shell, direction contract, required section identifiers, and accessible chart semantics.

- [ ] **Step 3: Rewrite the calculator HTML with the approved section order**

Use this exact semantic outline and production copy:

```html
<main id="page-content" class="mockup-main calculator-page">
  <h1 class="sr-only">Subscription vs API value calculator</h1>
  <section class="calculator-grid" data-mockup-section="selections" aria-label="Calculator selections">
    <fieldset class="mockup-panel selection-panel"><legend>Provider selection</legend></fieldset>
    <fieldset class="mockup-panel selection-panel"><legend>Plan selection</legend></fieldset>
    <fieldset class="mockup-panel selection-panel model-panel"><legend>Model selection</legend></fieldset>
    <fieldset class="mockup-panel selection-panel usage-panel"><legend>Usage mix</legend></fieldset>
  </section>
  <section class="result-layout" data-mockup-section="results" aria-label="Calculated value results">
    <article class="value-summary-card"><h2>API-equivalent value</h2><strong>$1,420</strong><p>Illustrative calculator state from the incumbent mockup.</p></article>
    <article class="mockup-panel trend-panel"><h2>Value trend analysis</h2><div class="trend-chart" role="img" aria-label="Five usage levels with the current 1.5 million token level emphasized and a break-even marker at 1.4 million tokens"></div></article>
  </section>
  <section class="mockup-panel pricing-panel" data-mockup-section="subscription-pricing"><h2>Individual subscription plans</h2></section>
  <section class="mockup-panel pricing-panel" data-mockup-section="api-pricing"><h2>API route pricing</h2></section>
  <section class="mockup-panel recommendation-panel" data-mockup-section="recommendation"><h2>Cost-optimization recommendation</h2><p>Review the selected plan, model mix, and evidence before changing purchasing strategy.</p></section>
</main>
```

Populate these exact incumbent rows: providers Alibaba Cloud (Qwen), OpenAI (GPT-4o), Anthropic (Claude), and Google Cloud (Gemini); plans Starter ($100/mo), Enterprise ($2,000/mo), and Unlimited ($8,500/mo); models Qwen-Max, Qwen-Plus, Qwen-Turbo, Qwen-Long, GPT-4o, Claude 3.5 Sonnet, and Llama 3.1 70B. Select Alibaba Cloud, Enterprise, Qwen-Max, and Qwen-Plus. Each selected row uses `aria-checked="true"`, a native input, visible check SVG, heavier label, and blue border. Keep numeric values explicitly labelled as illustrative calculator state, not published benchmark evidence.

- [ ] **Step 4: Implement calculator-only layout CSS**

```css
.calculator-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.selection-panel { min-width: 0; padding: 22px; }
.model-panel, .usage-panel { min-height: 394px; }
.result-layout { display: grid; grid-template-columns: minmax(260px, .72fr) minmax(0, 1.55fr); gap: 24px; }
.value-summary-card { min-height: 410px; padding: 30px; border-radius: 12px; background: #0007cd; color: #fff; }
.trend-panel { min-height: 410px; padding: 24px; }
.pricing-panel { overflow: hidden; }
.recommendation-panel { padding: 28px; }
@media (max-width: 799px) {
  .calculator-grid, .result-layout { grid-template-columns: 1fr; }
  .model-panel, .usage-panel, .value-summary-card, .trend-panel { min-height: auto; }
}
```

- [ ] **Step 5: Run the calculator contract tests**

Run: `npm test -- scripts/mockup-contract.test.ts scripts/calculator-light-mockup.test.ts`

Expected: PASS with the legacy brand removed and all five sections present.

- [ ] **Step 6: Commit the calculator mockup**

```bash
git add .stitch/designs/calculator-light.html .stitch/designs/calculator-mockup.css scripts/calculator-light-mockup.test.ts
git commit -m "feat: align light calculator mockup with dark system"
```

### Task 3: Create Compare Hub and Pair-Detail Mockups

**Files:**
- Create: `.stitch/designs/compare-hub.html`
- Create: `.stitch/designs/compare-detail.html`
- Create: `.stitch/designs/compare-mockup.css`
- Create: `scripts/compare-mockups.test.ts`

**Interfaces:**
- Consumes: Task 1 shared contract, shell, and theme primitives.
- Produces: compare hub sections `workspace`, `reviewed-matchups`, `guides`, `evidence-legend`; detail sections `model-pair`, `metrics`, `workload`, `pricing-context`, `subscription-match`, `provenance`, `related-comparisons`.

- [ ] **Step 1: Write failing compare truth tests**

```ts
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const hubHtml = readFileSync('.stitch/designs/compare-hub.html', 'utf8');
const detailHtml = readFileSync('.stitch/designs/compare-detail.html', 'utf8');

describe('compare mockups', () => {
  it('keeps the empty reviewed-pair state honest', () => {
    const document = new JSDOM(hubHtml).window.document;
    expect(validateMockupHtml(hubHtml, { h1: 'Compare AI models', requiredSections: ['workspace', 'reviewed-matchups', 'guides', 'evidence-legend'] })).toEqual([]);
    expect(document.querySelector('[data-reviewed-pairs]')?.textContent).toContain('No reviewed matchups published yet');
    expect(document.querySelectorAll('[data-reviewed-pairs] a[href^="/compare/"]')).toHaveLength(0);
    expect(document.querySelector<HTMLButtonElement>('[data-compare-action]')?.disabled).toBe(true);
  });

  it('shows a neutral evidence-aware pair without a synthetic winner', () => {
    const document = new JSDOM(detailHtml).window.document;
    expect(validateMockupHtml(detailHtml, { h1: 'Claude 3.7 Sonnet vs GPT-4o', requiredSections: ['model-pair', 'metrics', 'workload', 'pricing-context', 'subscription-match', 'provenance', 'related-comparisons'] })).toEqual([]);
    expect(document.querySelector('[data-winner]')).toBeNull();
    expect(document.querySelectorAll('[data-missing]').length).toBeGreaterThan(0);
    expect([...document.querySelectorAll('[data-missing]')].every((node) => node.textContent?.trim() === 'Unavailable')).toBe(true);
    expect(detailHtml).toContain('No verified subscription match');
  });
});
```

- [ ] **Step 2: Run the tests and verify the RED state**

Run: `npm test -- scripts/compare-mockups.test.ts`

Expected: FAIL because the compare mockup files do not exist.

- [ ] **Step 3: Build the compare hub**

Implement two labelled combobox panels with a semantic swap button, provider/category filters, and a disabled compare action until two distinct models are selected. Use this truth-bearing empty region:

```html
<section class="mockup-panel empty-reviewed" data-mockup-section="reviewed-matchups" data-reviewed-pairs>
  <h2>Reviewed matchups</h2>
  <strong>No reviewed matchups published yet</strong>
  <p>TokenBench lists a pair here only after both models pass the active-revision evidence and editorial quality gates.</p>
</section>
```

The evidence legend defines Supported, Estimated, Stale, and Unavailable in plain language. Related guides link only to existing `/guides/` routes.

- [ ] **Step 4: Build the comparison detail**

Use equal model identity panels around a neutral `VS` marker. The metric and pricing tables keep source names and units but render absent numeric cells exactly as:

```html
<td data-missing>Unavailable</td>
```

Include the three workload radio options with Balanced selected, the text `No verified subscription match`, a link to `/tools/subscriptions-vs-apis/`, a provenance panel naming BenchLM and OpenRouter roles without a publication claim, and an empty related-comparisons state.

- [ ] **Step 5: Implement responsive compare CSS**

```css
.model-picker-grid, .model-pair-grid { display: grid; grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1fr); gap: 16px; align-items: stretch; }
.swap-control, .versus-marker { align-self: center; justify-self: center; }
.compare-filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.metric-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.comparison-mobile-cards { display: none; }
@media (max-width: 767px) {
  .model-picker-grid, .model-pair-grid { grid-template-columns: 1fr; }
  .swap-control { transform: rotate(90deg); }
  .compare-filter-grid { grid-template-columns: 1fr; }
  .metric-table { display: none; }
  .comparison-mobile-cards { display: grid; gap: 12px; }
}
```

- [ ] **Step 6: Run compare tests and commit**

Run: `npm test -- scripts/mockup-contract.test.ts scripts/compare-mockups.test.ts`

Expected: PASS, with no reviewed-pair links and no winner marker.

```bash
git add .stitch/designs/compare-hub.html .stitch/designs/compare-detail.html .stitch/designs/compare-mockup.css scripts/compare-mockups.test.ts
git commit -m "feat: add evidence-aware comparison mockups"
```

### Task 4: Create Leaderboard Directory and Value-Route Mockups

**Files:**
- Create: `.stitch/designs/leaderboards-directory.html`
- Create: `.stitch/designs/leaderboard-value.html`
- Create: `.stitch/designs/leaderboard-mockup.css`
- Create: `scripts/leaderboard-mockups.test.ts`

**Interfaces:**
- Consumes: Task 1 shared contract and the registered route/copy evidence in `src/routing/routes.ts`.
- Produces: directory sections `directory`, `related`, `monomind`; value sections `route-summary`, `filters`, `rankings`, `related`, `monomind`.

- [ ] **Step 1: Write failing leaderboard structure tests**

```ts
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { validateMockupHtml } from './mockup-contract';

const directoryHtml = readFileSync('.stitch/designs/leaderboards-directory.html', 'utf8');
const valueHtml = readFileSync('.stitch/designs/leaderboard-value.html', 'utf8');

describe('leaderboard mockups', () => {
  it('exposes every registered evidence lens without embedding ranks', () => {
    const document = new JSDOM(directoryHtml).window.document;
    expect(validateMockupHtml(directoryHtml, { h1: 'AI model leaderboards', requiredSections: ['directory', 'related', 'monomind'] })).toEqual([]);
    expect(document.querySelectorAll('[data-leaderboard-route]')).toHaveLength(12);
    expect(document.querySelector('[data-rank]')).toBeNull();
  });

  it('keeps desktop rows and mobile cards fact-equivalent and estimates unranked', () => {
    const document = new JSDOM(valueHtml).window.document;
    expect(validateMockupHtml(valueHtml, { h1: 'AI model value frontier', requiredSections: ['route-summary', 'filters', 'rankings', 'related', 'monomind'] })).toEqual([]);
    expect(document.querySelectorAll('table thead th[scope="col"]')).toHaveLength(7);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(document.querySelectorAll('[data-mobile-rank-card]').length);
    expect(document.querySelector('[data-estimated] [data-rank]')?.textContent?.trim()).toBe('Unranked');
    expect(valueHtml).toContain('never presents an opaque universal value score');
    expect(valueHtml).not.toMatch(/Best overall/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify the RED state**

Run: `npm test -- scripts/leaderboard-mockups.test.ts`

Expected: FAIL because the two leaderboard mockup files do not exist.

- [ ] **Step 3: Build the registered leaderboard directory**

Create one route card for each exact registry path: `/leaderboards/llm/overall/`, `/leaderboards/llm/coding/`, `/leaderboards/llm/agentic/`, `/leaderboards/llm/human-preference/`, `/leaderboards/llm/value/`, `/leaderboards/llm/pricing-context/`, `/leaderboards/multimodal/vision-documents/`, `/leaderboards/media/text-to-image/`, `/leaderboards/media/image-editing/`, `/leaderboards/media/text-to-video/`, `/leaderboards/media/image-to-video/`, and `/leaderboards/media/video-editing/`. Each card carries the matching question-oriented summary from `src/routing/routes.ts` and its canonical link. Keep the directory free of models, positions, badges, and embedded rank values.

- [ ] **Step 4: Build the value leaderboard state**

Use a compact filter rail with search, the three workload choices, a sort select, and an unchecked `Include estimated BenchLM models` control. Render a seven-column semantic table and matching mobile cards. Known model labels may demonstrate row density, but rank, capability, price, and freshness values remain `Unavailable` when no active revision is represented. An estimated preview row uses the literal rank label `Unranked`, never a number or badge.

- [ ] **Step 5: Implement leaderboard CSS**

```css
.leaderboard-directory-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.leaderboard-filter-grid { display: grid; grid-template-columns: 1.4fr 1.2fr 1fr 1.1fr; gap: 14px; align-items: end; }
.leaderboard-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.leaderboard-mobile-cards { display: none; }
@media (max-width: 1023px) {
  .leaderboard-directory-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .leaderboard-filter-grid { grid-template-columns: 1fr 1fr; }
  .leaderboard-table { display: none; }
  .leaderboard-mobile-cards { display: grid; gap: 12px; }
}
@media (max-width: 639px) {
  .leaderboard-directory-grid, .leaderboard-filter-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Run leaderboard tests and commit**

Run: `npm test -- scripts/mockup-contract.test.ts scripts/leaderboard-mockups.test.ts`

Expected: PASS with 12 registered routes and fact-equivalent table/card counts.

```bash
git add .stitch/designs/leaderboards-directory.html .stitch/designs/leaderboard-value.html .stitch/designs/leaderboard-mockup.css scripts/leaderboard-mockups.test.ts
git commit -m "feat: add TokenBench leaderboard mockups"
```

### Task 5: Render, Verify, and Finish the Mockup Bundle

**Files:**
- Create: `scripts/mockup-manifest.ts`
- Create: `scripts/render-tokenbench-mockups.ts`
- Create: `browser-tests/mockup-browser.ts`
- Create: `playwright.mockups.config.ts`
- Create: `.stitch/designs/mockup-manifest.json`
- Create: `.stitch/designs/renders/*.png` through the renderer
- Modify: `package.json`

**Interfaces:**
- Consumes: all five HTML sources and shared/surface CSS from Tasks 1–4.
- Produces: `MOCKUP_PAGES`, `MOCKUP_THEMES`, `MOCKUP_VIEWPORTS`, 20 deterministic screenshots, browser verification, detector findings, and finish-review verdict.

- [ ] **Step 1: Integrate the three reviewed surface branches**

```bash
git cherry-pick codex/tokenbench-mockup-calculator
git cherry-pick codex/tokenbench-mockup-compare
git cherry-pick codex/tokenbench-mockup-leaderboards
```

Expected: three clean cherry-picks with no overlapping files. Run `git status --short` and require an empty result before continuing.

- [ ] **Step 2: Write the canonical render manifest**

```ts
export const MOCKUP_PAGES = [
  { id: 'calculator-light', file: '.stitch/designs/calculator-light.html' },
  { id: 'compare-hub', file: '.stitch/designs/compare-hub.html' },
  { id: 'compare-detail', file: '.stitch/designs/compare-detail.html' },
  { id: 'leaderboards-directory', file: '.stitch/designs/leaderboards-directory.html' },
  { id: 'leaderboard-value', file: '.stitch/designs/leaderboard-value.html' },
] as const;
export const MOCKUP_THEMES = ['dark', 'light'] as const;
export const MOCKUP_VIEWPORTS = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }] as const;
```

- [ ] **Step 3: Write the failing Playwright matrix checks**

```ts
import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MOCKUP_PAGES, MOCKUP_THEMES, MOCKUP_VIEWPORTS } from '../scripts/mockup-manifest';

const CHECK_VIEWPORTS = [...MOCKUP_VIEWPORTS, { width: 320, height: 844 }] as const;

for (const mockup of MOCKUP_PAGES) for (const theme of MOCKUP_THEMES) for (const viewport of CHECK_VIEWPORTS) {
  test(`${mockup.id} ${viewport.width}px ${theme}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.goto(`${pathToFileURL(resolve(mockup.file)).href}?theme=${theme}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('h1')).toHaveCount(1);
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      targets: [...document.querySelectorAll<HTMLElement>('button, a, input, select')].filter((node) => getComputedStyle(node).display !== 'none').map((node) => {
        const hitTarget = node.matches('input[type="checkbox"], input[type="radio"]') ? node.closest<HTMLElement>('label') ?? node : node;
        return { width: hitTarget.getBoundingClientRect().width, height: hitTarget.getBoundingClientRect().height };
      }),
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.targets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
    if (mockup.id === 'compare-detail' || mockup.id === 'leaderboard-value') {
      const table = page.locator('table').first();
      const cards = page.locator(mockup.id === 'compare-detail' ? '.comparison-mobile-cards' : '.leaderboard-mobile-cards');
      if (viewport.width < 768) {
        await expect(table).toBeHidden();
        await expect(cards).toBeVisible();
      } else {
        await expect(table).toBeVisible();
        await expect(cards).toBeHidden();
      }
    }
    expect(consoleErrors).toEqual([]);
  });
}

test('keyboard focus is visible in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${pathToFileURL(resolve(MOCKUP_PAGES[0].file)).href}?theme=dark`);
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement;
    const style = getComputedStyle(active);
    return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
  });
  expect(focus.style).toBe('solid');
  expect(Number.parseFloat(focus.width)).toBeGreaterThan(0);
  expect(focus.color).not.toBe('transparent');
});
```

Run: `npx playwright test --config=playwright.mockups.config.ts`

Expected: FAIL until the dedicated config and all cross-surface responsive fixes exist.

- [ ] **Step 4: Implement the isolated Playwright configuration**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  testMatch: 'mockup-browser.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  outputDir: '/tmp/tokenbench-mockup-playwright',
  use: {
    headless: true,
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    trace: 'off', screenshot: 'off', video: 'off',
  },
});
```

- [ ] **Step 5: Implement deterministic screenshot rendering**

```ts
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MOCKUP_PAGES, MOCKUP_THEMES, MOCKUP_VIEWPORTS } from './mockup-manifest';

const output = resolve('.stitch/designs/renders');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
for (const mockup of MOCKUP_PAGES) for (const theme of MOCKUP_THEMES) for (const viewport of MOCKUP_VIEWPORTS) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${pathToFileURL(resolve(mockup.file)).href}?theme=${theme}`);
  await page.screenshot({ path: resolve(output, `${mockup.id}-${viewport.width}-${theme}.png`), fullPage: true });
  await page.close();
}
await browser.close();
```

- [ ] **Step 6: Add repeatable package commands and portable artifact metadata**

Add these scripts to `package.json`:

```json
"test:mockups": "npm test -- scripts/*mockup*.test.ts && playwright test --config=playwright.mockups.config.ts",
"render:mockups": "tsx scripts/render-tokenbench-mockups.ts"
```

Write `.stitch/designs/mockup-manifest.json` with `origin` set to `local-approved-mockup`, the approved spec path, all five HTML paths, and the 20 screenshot paths. Do not change the original authenticated Stitch export provenance in `.stitch/metadata.json`.

- [ ] **Step 7: Run unit, browser, render, and regression checks**

```bash
npm run test:mockups
npm run render:mockups
npm run lint
npm test
git diff --check
```

Expected: all mockup tests pass, 20 PNGs exist, TypeScript passes, the repository suite remains green, and no whitespace errors are reported.

- [ ] **Step 8: Run the bounded visual inspection pass**

Open the 1440 dark/light and 390 dark/light captures for all five screens in one batch. Check first-view hierarchy, theme parity, overflow, text wrapping, controls, table/card equivalence, empty states, and source/methodology visibility. Apply one batched fix across the owning surface files, rerun Steps 7 and 8 once, then stop polishing.

- [ ] **Step 9: Run Impeccable detection and independent finish review**

Run the installed Impeccable detector once against the changed HTML/CSS targets. Fix mechanical findings in one batch. Dispatch a fresh finish reviewer with no forked conversation history and include the user request, approved spec, HTML paths, all screenshot paths, direction contracts, detector findings, and the loaded `craft-floor.md` path. Require the reviewer’s five contract sections and disposition; rerender once after material fixes and request a verdict on every finding.

- [ ] **Step 10: Commit the verified review bundle**

```bash
git add package.json playwright.mockups.config.ts browser-tests/mockup-browser.ts scripts/mockup-manifest.ts scripts/render-tokenbench-mockups.ts scripts/mockup-contract.ts scripts/mockup-contract.test.ts scripts/calculator-light-mockup.test.ts scripts/compare-mockups.test.ts scripts/leaderboard-mockups.test.ts .stitch/designs/mockup-manifest.json .stitch/designs/renders .stitch/designs/tokenbench-mockup.css .stitch/designs/tokenbench-mockup.js .stitch/designs/calculator-mockup.css .stitch/designs/calculator-light.html .stitch/designs/compare-mockup.css .stitch/designs/compare-hub.html .stitch/designs/compare-detail.html .stitch/designs/leaderboard-mockup.css .stitch/designs/leaderboards-directory.html .stitch/designs/leaderboard-value.html
git commit -m "feat: publish TokenBench decision mockups"
```

Record the final commit, test counts, screenshot paths, detector result, reviewer disposition, and unresolved findings in the local progress ledger and derived progress board. Do not merge, push, or deploy without separate authorization.
