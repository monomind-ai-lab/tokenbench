# Models Frontier and Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Models Workbench Pareto frontier and publish a new evidence-led TokenBench homepage at `/`.

**Architecture:** Keep the approved vanilla preview architecture. The Models change remains inside `prototypes/ui-revamp-3/index.html`; the homepage is a new `home.html` document copied to the root by the existing Vite preview plugin and powered by the shared shell/data assets plus a small page-local controller.

**Tech Stack:** HTML, CSS custom properties, vanilla JavaScript, Chart.js, Vite, Vitest, Playwright.

## Global Constraints

- Use existing `ui-revamp-3` tokens and global shell components.
- Do not fabricate benchmark, source, price, or savings claims.
- Label all prototype calculations and benchmark values as illustrative.
- Preserve 320px minimum viewport support and 44px interactive targets.
- Route the cost CTA to `/cost/calculator`.

---

### Task 1: Models frontier line

**Files:**
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `prototypes/ui-revamp-3/index.html`

**Interfaces:**
- Consumes: `frontier(models)`, `colors().accentText`, and the shared `chart()` wrapper.
- Produces: a Chart.js dataset labeled `Pareto frontier`.

- [ ] Add a browser test that loads `/models`, verifies the disclosure is absent, and inspects the real chart configuration for the seven ordered fixture frontier IDs.
- [ ] Run the focused Playwright test and confirm it fails because the disclosure still exists and the dataset is absent.
- [ ] Remove the disclosure markup/table update and add the ordered line dataset with `type: 'line'`, `borderWidth: 2`, `pointRadius: 0`, `fill: false`, and `order: 1`.
- [ ] Re-run the test and confirm it passes.
- [ ] Commit only the task-owned hunks.

### Task 2: Homepage bundle and route contract

**Files:**
- Create: `prototypes/ui-revamp-3/home.html`
- Modify: `scripts/make-it-yours-preview.ts`
- Modify: `scripts/make-it-yours-preview.test.ts`
- Modify: `scripts/preview-navigation-links.test.ts`
- Modify: `src/routing/routes.ts`
- Modify: `src/routing/routes.test.ts`
- Modify: `public/_redirects`

**Interfaces:**
- Consumes: shared `/ui-revamp-3-assets/{styles.css,data.js,common.js,chart.umd.js}`.
- Produces: `/index.html`, `PREVIEW_PATHS.home === '/'`, and `PREVIEW_ROUTE_PATHS.home === '/'`.

- [ ] Add failing tests for root bundle output, homepage title/content, canonical home links, and removal of the root redirect.
- [ ] Run the targeted Vitest files and confirm the expected contract failures.
- [ ] Add `home.html` to `previewPageBundles`, update both preview route maps, and delete only the `/ /models 301` redirect.
- [ ] Create the semantic homepage document with the supplied hero and five linked sections.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 3: Homepage responsive behavior and interaction

**Files:**
- Modify: `prototypes/ui-revamp-3/styles.css`
- Modify: `prototypes/ui-revamp-3/home.html`
- Modify: `browser-tests/responsive-browser.ts`

**Interfaces:**
- Consumes: `TB_MODELS`, `score(model)`, `setupShell()`, and shared theme tokens.
- Produces: responsive preview tables/cards and the `#home-cost-prompts` slider output.

- [ ] Add a failing Playwright test covering the hero routes, five sections, popular grid ID, slider output change, mobile single-column layout, and no overflow.
- [ ] Run the focused test and confirm it fails against the current root behavior.
- [ ] Add scoped homepage styles and the minimal slider/filter controller.
- [ ] Run the focused test at desktop and mobile widths and confirm it passes.

### Task 4: Verification and deployment

**Files:**
- Verify all task-owned files.

**Interfaces:**
- Consumes: the production Vite bundle.
- Produces: stable and immutable Cloudflare Pages previews.

- [ ] Run targeted Vitest, focused production Playwright, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Capture desktop and mobile screenshots in one batch and perform one bounded corrective pass.
- [ ] Run the Impeccable detector once on changed UI files and address scoped mechanical findings.
- [ ] Commit task-owned changes without staging unrelated working-tree edits.
- [ ] Deploy `dist` to Cloudflare Pages project `tokenbench` on branch `ui-revamp-3`.
- [ ] Verify `/` and `/models` on both the stable alias and immutable deployment URL.
