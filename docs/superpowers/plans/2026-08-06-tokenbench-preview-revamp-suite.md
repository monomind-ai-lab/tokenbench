# TokenBench Preview Revamp Plan Suite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved TokenBench information architecture and decision surfaces as four reviewed, test-first workstreams without conflicting edits or invented data.

**Architecture:** The suite preserves the current React/Vite/Cloudflare Pages architecture. Foundation primitives land first; Compare and Leaderboards then consume them; newsletter and deterministic artifact generation land last. Sol owns orchestration, diff review, interface reconciliation, and final verification. Terra workers receive one bounded task at a time and never modify the same shared file concurrently.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, Testing Library, Cloudflare Pages Functions, D1/R2, benchmark-ingest Worker, Playwright, Brevo REST API.

## Approved source

- Design specification: `docs/superpowers/specs/2026-08-06-tokenbench-preview-revamp-design.md`
- Cover-image generation is explicitly deferred.
- BenchAlign is attributed to BenchLM and linked to `https://benchlm.ai/methodology`.
- Network checks for BenchLM are daily while the broader benchmark worker keeps its current twice-daily schedule.
- Brevo automation stops at double-opt-in signup and campaign-draft creation; sending, scheduling, remote artifact upload, and account setup require separate authority.

## Workstream plans

1. `docs/superpowers/plans/2026-08-06-tokenbench-foundation-home-calculator.md`
2. `docs/superpowers/plans/2026-08-06-tokenbench-compare-revamp.md`
3. `docs/superpowers/plans/2026-08-06-tokenbench-leaderboards-data-exports.md`
4. `docs/superpowers/plans/2026-08-06-tokenbench-newsletter-automation.md`

Each child plan defines exact file ownership, public interfaces, RED/GREEN test
steps, focused verification, and task-sized commits. If repository evidence
invalidates an interface, stop that task, update both the affected child plan
and this dependency map, then resume from a new failing test.

## Dependency and ownership map

| Phase | Producer | Consumers | Shared-file rule |
| --- | --- | --- | --- |
| Foundation | routes, `ProviderMark`, `ShareAction`, shell, Home, calculator URL state | Compare, Leaderboards, Newsletter | Finish and review before downstream UI edits |
| Compare | picker, summaries, radar, price-route selection | Newsletter compare alert placement | Newsletter changes the compare call site only after Compare lands |
| Leaderboards | route definitions, decision picks, filters, shared CSV serializer, export endpoint | Home summary handoff, cheatsheet generator | Sol integrates the one-file Home handoff |
| Newsletter | signup, Brevo adapter, revision diffs, cheatsheet, campaign drafts | Footer and Compare call sites | Sol integrates shell/Compare call sites after component tests pass |

`src/routing/routes.ts`, `src/App.tsx`, `src/frontend/app-shell.tsx`,
`src/pages/home-page.tsx`, `.env.example`, `.gitignore`, `package.json`,
deployment docs, `src/index.css`, and browser fixtures are integration-owned
shared surfaces. Foundation owns their baseline; later workstreams receive only
the sequenced handoffs named in their child plans. Only Sol edits a shared
surface during integration, and no two workers touch one concurrently.

## Execution sequence

### Task 1: Foundation primitives and calculator

- [ ] Execute Foundation Tasks 1–4 in order with a fresh Terra worker per bounded task.
- [ ] After each task, Sol inspects the diff, runs the task's focused test command, and checks that only declared files changed.
- [ ] Confirm the methodology page renders in React as well as in generated SEO shells.

### Task 2: Compare

- [ ] Start only after foundation interfaces are integrated.
- [ ] Execute every task in the Compare plan in order with Terra workers and Sol review between tasks.
- [ ] Verify route-aware pricing against direct and router fixtures before accepting the result-page composition.
- [ ] Run the Compare plan's SSR, hydration, responsive, keyboard, reduced-motion, lint, and build gates.

### Task 3: Leaderboard routes, cadence, and summary projections

- [ ] Start after foundation; it may follow Compare sequentially to avoid CSS and browser-test conflicts.
- [ ] Execute Leaderboards Tasks 1–4 in order with Terra workers and Sol review between tasks.
- [ ] Verify daily BenchLM network gating reuses the stored immutable projection and does not change the twice-daily worker schedule.
- [ ] Verify reasoning and knowledge are labeled evidence lenses rather than validated BenchAlign categories.
- [ ] Verify the summary contains category cards plus the four-field Home decision snapshot, including unavailable states.

### Task 4: Home integration, leaderboard exploration, and CSV

- [ ] Execute Foundation Tasks 5–6 now that `HomeDecisionSnapshot` exists; run the full foundation verification gate.
- [ ] Execute Leaderboards Tasks 5–7 with Terra workers and Sol review between tasks.
- [ ] Verify the UI and CSV endpoint use the same strict query contract, filters, sort, complete projection, and formula-safe serializer.
- [ ] Run Worker, Pages Function, unit, browser, lint, and build gates from the Leaderboards plan.

### Task 5: Newsletter and artifact automation

- [ ] Start after Compare and Leaderboards expose their final contracts.
- [ ] Execute every task in the Newsletter plan in order with Terra workers and Sol review between tasks.
- [ ] Integrate the reusable signup into the footer and Compare call site without exposing the Brevo key to the browser.
- [ ] Verify double opt-in, explicit alert consent, failure-state address retention, and no false success state.
- [ ] Generate CSV, print HTML, newsletter HTML, subject/preview JSON, PDF, optional share PNG, and manifest twice from frozen fixtures and compare hashes for deterministic output.
- [ ] Verify the Brevo command creates a draft only and never calls a send or schedule endpoint.
- [ ] Run newsletter unit, browser, lint, and build gates.

### Task 6: Integrated regression and handoff

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm test -- scripts/generate-static-pages.test.ts` and `npm run generate:pages`.
- [ ] Run `npm run test:browser` and `npm run test:browser:production`.
- [ ] Run `git diff --check` and inspect `git diff --stat` plus the full diff for unrelated changes, host-specific paths, secrets, or generated cover assets.
- [ ] Manually inspect Home, calculator result, compare result, leaderboard index/detail, BenchAlign methodology, footer signup, and both themes at 320 px and desktop widths.
- [ ] Assert no `.leaderboard-cover-image` appears and no generated leaderboard cover asset was added to the production bundle.
- [ ] Report shipped behavior, exact verification results, deferred Brevo operational setup, and any residual data limitations.

## Stop conditions

Stop and return to Sol rather than guessing if a task would require a new remote
account/list/template, a production credential, a schema migration not described
in the design, a new benchmark weighting policy, a fabricated logo mapping, or
automatic campaign sending. None of those effects are authorized by this suite.
