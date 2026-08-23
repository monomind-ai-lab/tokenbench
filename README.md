# TokenBench

A responsive calculator for comparing verified paid individual AI subscriptions with current API token prices.

## Platform

TokenBench is the decision engine for AI costs and model benchmarks. Its release
surface combines:

- subscription-versus-API cost analysis at
  [Tools](/tools/subscriptions-vs-apis/);
- a revisioned catalog of verified subscription and API offers;
- source-attributed benchmark directories and workload-aware leaderboards;
- a compare hub and canonical, server-rendered model-pair pages;
- crawlable guides that connect cost, model-selection, and source-methodology
  decisions.

Catalog and benchmark data are published by separate scheduled Cloudflare
Workers. The browser consumes the published Pages APIs; it does not fetch
benchmark providers directly. Published data retains source attribution,
timestamps, and explicit unavailable or stale states rather than silently
substituting values.

## Newsletter and monthly cheatsheet

The footer offers **The Monthly LLM API Cost & Benchmark Cheatsheet (PDF/CSV)**
through Brevo double opt-in. Its monthly-cheatsheet audience is distinct from
the optional, initially unchecked alert consent for new models and price drops.
The compact Compare prompt begins with that optional alert consent and reveals
the email form only after it is selected.

Local generation and draft-only campaign operations are documented in
[docs/tokenbench-deployment.md](docs/tokenbench-deployment.md#newsletter-and-monthly-cheatsheet-operations).
They operate on one frozen published revision and never grant authority to
upload artifacts, enable a schedule, test-send, or send email. The campaign
command can create a Brevo draft only after a separately authorized publication
has made the signed artifact URLs public.

## What it calculates

- A blended API cost per million tokens from the selected models and input/output mix.
- API-equivalent monthly value at the expected usage level.
- Estimated monthly savings: API-equivalent value minus the selected subscription price.
- Subscription breakeven volume and a five-point value trend.
- Separate paid individual subscription and API price tables, with active selections highlighted.

Variable, rolling, credit-based, and guardrail-limited subscriptions stay explicitly variable. The calculator does not invent token caps when a provider has not published one.

## Catalog scope

The plan selector admits only verified, non-zero, monthly individual subscriptions. Current manual manifests cover:

- Alibaba Cloud Coding Plan Pro
- Alibaba Cloud Token Plan Personal Edition Lite, Standard, and Pro
- Claude Pro and Max individual tiers
- Gemini (Google AI) Plus, Pro, and Ultra individual tiers
- Grok (x.ai) SuperGrok
- Moonshot (Kimi) Moderato, Allegretto, Allegro, and Vivace
- ChatGPT Go, Plus, and Pro individual tiers
- z.ai (GLM) Lite, Pro, and Max

DeepSeek remains API-only because no verified paid individual subscription is published in the catalog; it is still available as a selectable direct/API provider. Live API prices retain distinct direct-provider, OpenRouter, and OpenCode Zen identities.

Every catalog record links back to its evidence source. Manual price manifests are kept separate from the live API adapters and are published through the same validated, revisioned catalog pipeline.

## Design

[`DESIGN.md`](DESIGN.md) is the design authority for the Next rebuild in `apps/web`. It defines the token
system, typography, data-value semantics, and interaction rules, and it defers to
[`docs/rebuild-audit/PRESERVATION_CONTRACT.md`](docs/rebuild-audit/PRESERVATION_CONTRACT.md) for what content
and behavior every route must keep. Literal token values live in `apps/web/src/app/globals.css`.

The legacy root Vite app implements an earlier exported Stitch project; its synced HTML, screenshots, and
metadata remain under `.stitch/`, with normalized tokens in `resources/style-guide.json`. That material is
**history for the root app only** and is not the authority for the Next rebuild.

## Development

This repository contains **two applications**:

| App | Location | Status | Commands run from |
| --- | --- | --- | --- |
| Legacy Vite app (currently deployed to Cloudflare Pages) | repository root | in production | repository root |
| Next.js rebuild | `apps/web` | not yet deployed | `apps/web` |

### Next.js rebuild (`apps/web`)

```bash
cd apps/web
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

Server data loaders require explicit configuration; without it they return a
`TOKENBENCH_UI_DATA_BASE_URL is not configured.` error rather than falling back to fixtures. To review a
production build against the canonical origin:

```bash
cd apps/web
npm run build
TOKENBENCH_UI_DATA_MODE=http \
TOKENBENCH_UI_DATA_BASE_URL=https://tokenbench.monomind.one \
npm run start -- --hostname 127.0.0.1 --port 3101
```

### Legacy root app

```bash
npm install
npm run dev     # http://localhost:3000
```

Validation commands:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

> **`npm run build` at the repository root writes into the source tree.** Its `prebuild` step runs
> `generate:pages`, which overwrites the tracked `index.html` and emits route HTML beside the source. Use
> `cd apps/web && npm run build` when you only need to check the Next rebuild.

The root app uses React, TypeScript, Vite, Cloudflare Workers/D1/R2 for catalog ingestion, and Playwright for
responsive browser coverage. The rebuild uses Next.js 16, React 19, Base UI primitives, and Chart.js.

## Deployment and operations

The release procedure, evidence template, authorization boundaries, rollback
guidance, and production smoke checklist are in
[docs/tokenbench-deployment.md](docs/tokenbench-deployment.md). For the shared
catalog/benchmark data plane, bindings, schedules, integrity invariants, and
public API contract, see
[docs/catalog-deployment.md](docs/catalog-deployment.md). Source rights and
visible-attribution rules are documented in
[docs/data-sources.md](docs/data-sources.md).

Do not treat a successful local build as authorization to mutate Cloudflare,
attach a domain, create a redirect, or push a release commit. Those operations
are intentionally separated in the deployment runbook.
