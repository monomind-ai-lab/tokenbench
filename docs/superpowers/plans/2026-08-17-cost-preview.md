# Cost Preview Calculators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with review gates.

**Goal:** Build a preview-only `/cost` hub, monthly cost simulator, and seat/token breakeven calculator in the `ui-revamp-3` branch using the approved preview design tokens and existing model fixtures.

**Architecture:** Add three static preview documents and two isolated page scripts to the existing `prototypes/ui-revamp-3` bundle. Both calculators consume the existing `data.js` model records and expose auditable formulas, source-price labels, shareable state, export/print actions, and accessible semantic result tables. The root integration updates the preview bundle copier, route links, shared CSS, and browser/unit coverage; production React routes remain unchanged.

**Tech Stack:** Static HTML, scoped vanilla JavaScript, existing `styles.css`/`common.js`/`data.js`, Chart.js 4.4.7 for the breakeven chart, Vitest, Playwright, Vite, and Cloudflare Pages preview deployment.

## Global Constraints

- Work only in the `ui-revamp-3` worktree and preview deployment; do not modify production routes or APIs.
- Reuse existing preview design tokens from `prototypes/ui-revamp-3/styles.css`; do not introduce hardcoded theme colors in page CSS.
- Keep all values visibly labeled as illustrative staging fixtures; source prices and derived estimates must remain separate.
- `/cost` is the hub; `/cost/calculator` is monthly subscription-versus-API estimation; `/cost/breakeven` is seat/token crossover analysis.
- Cost simulator inputs must include subscription tier, target model, conversations/day, messages/conversation, active days/month, input tokens/message, output tokens/message, cache-read share, cache-write share, and long-context toggle.
- Breakeven inputs must include a 1–50 seat slider, target model choices including DeepSeek V3, Claude 3.5 Sonnet, and GPT-4o, a default `$20` seat price, and a `0–300M` token domain.
- The breakeven chart must show SaaS seat cost, API cost, crossover point, and lower-cost region; the table must preserve the same semantic values.
- Both calculators must include formula, rounding policy, source price, price-effective time, assumptions, timestamp, shareable state, print, and CSV-ready output.
- Interactive controls must have labels, keyboard access, live result announcements where values change, and mobile-safe layout without horizontal overflow.

## Task 1: Cost simulator page

**Files:**
- Create: `prototypes/ui-revamp-3/cost-calculator.html`
- Create: `prototypes/ui-revamp-3/cost-calculator.js`
- Test: `scripts/cost-preview.test.ts`

**Interfaces:**
- Consumes: `TB_MODELS`, `setupShell`, `colors`, `previewComparisonHref`-style URL state conventions, and the existing preview tokens.
- Produces: `window.renderPage` plus a `/cost/calculator` document with a `#monthly-cost-calculator` main landmark, labeled inputs, a source-price table, a derived line-item table, and export/share actions.

- [ ] Write failing tests for default fields, deterministic monthly token math, source-versus-derived labels, URL round trip, CSV download action, and print action.
- [ ] Implement the page with a subscription tier selector, model selector, detailed input/output/cache/long-context controls, a total API-versus-SaaS summary, line-item monthly totals, formula disclosure, assumptions/timestamp block, and native table fallback.
- [ ] Add live recalculation and URL serialization using `URLSearchParams`; preserve valid values when reloading a shared URL.
- [ ] Add accessible CSV, print, and copy-link actions with status text.
- [ ] Run the focused Vitest file and self-review for missing/unavailable fixture fields.

## Task 2: Breakeven calculator page

**Files:**
- Create: `prototypes/ui-revamp-3/cost-breakeven.html`
- Create: `prototypes/ui-revamp-3/cost-breakeven.js`
- Test: `scripts/cost-preview.test.ts`

**Interfaces:**
- Consumes: `TB_MODELS`, `Chart`/`chart` from the shared preview runtime, the 1–50 seat and 0–300M token contracts, and the existing preview tokens.
- Produces: `window.renderPage` plus a `/cost/breakeven` document with `#breakeven-calculator`, an interactive line chart, crossover annotation, lower-cost region, and equivalent semantic table.

- [ ] Write failing tests for seat bounds, model choices, default `$20` seat price, 0–300M token bounds, crossover math, and chart/table parity.
- [ ] Implement seat slider, model dropdown, subscription price control defaulted to `$20`, workload controls, cache/long-context/text-character estimate controls, and source/effective-date disclosures.
- [ ] Render SaaS and API curves across the full token domain, mark the crossover and cheaper region, and preserve a table with the exact sampled values.
- [ ] Add URL share state, print, CSV, formula, rounding, assumptions, timestamp, and live status output.
- [ ] Run the focused Vitest file and verify Chart.js fallback still leaves the semantic table usable.

## Task 3: Hub, bundle integration, and shared tokens

**Files:**
- Create: `prototypes/ui-revamp-3/cost.html`
- Modify: `prototypes/ui-revamp-3/styles.css`
- Modify: `prototypes/ui-revamp-3/common.js`
- Modify: `scripts/make-it-yours-preview.ts`
- Modify: preview navigation/link tests as needed

**Interfaces:**
- Consumes: the two calculator documents/scripts from Tasks 1–2 and existing preview shell navigation/footer helpers.
- Produces: `/cost`, `/cost/calculator`, and `/cost/breakeven` static output with shared nav/footer, canonical preview links, and the two-card hub flow.

- [ ] Add the hub with two clearly separated cards: “Monthly cost simulator” and “Breakeven calculator,” each linking to its canonical route.
- [ ] Copy the three documents and both scripts into the Pages output bundle and rewrite shared asset paths consistently.
- [ ] Extend the preview route map and shell/footer destinations without changing production `ROUTE_PATHS` contracts.
- [ ] Add only token-based CSS for hub/calculator layout, controls, result tables, disclosures, and responsive breakpoints.
- [ ] Add static bundle tests for all three documents, shared assets, and route copy.

## Task 4: Integration QA and review gate

**Files:**
- Modify: `browser-tests/responsive-browser.ts`
- Modify: `scripts/cost-preview.test.ts` if integration assertions require it

- [ ] Add Playwright coverage for `/cost`, `/cost/calculator`, and `/cost/breakeven` at desktop/mobile widths and light/dark themes.
- [ ] Verify keyboard labels, URL share round trips, CSV/print controls, chart fallback, table parity, no overflow, and no console/page errors.
- [ ] Run `npm run lint`, focused tests, `npm test`, `npm run build`, and the full production browser suite.
- [ ] Review the diff for scope and run `git diff --check`.
- [ ] Commit only the cost preview files and tests, then deploy `dist` to Pages project `tokenbench` on branch `ui-revamp-3`.
- [ ] Verify stable and immutable `/cost`, `/cost/calculator`, and `/cost/breakeven` responses, leaving production untouched.
