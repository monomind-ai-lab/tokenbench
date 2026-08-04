# AI Cost Engine

A responsive calculator for comparing verified paid individual AI subscriptions with current API token prices.

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

The responsive light and dark interfaces implement the exported [Stitch project](https://stitch.withgoogle.com/projects/15996347374407149271?pli=1):

- Modern Professional for light mode
- Obsidian Flux for dark mode

Synced Stitch HTML, screenshots, metadata, and design-system references live under `.stitch/`; normalized tokens live in `resources/style-guide.json`.

## Development

```bash
npm install
npm run dev
```

The development server runs at `http://localhost:3000`.

Validation commands:

```bash
npm test
npm run lint
npm run build
npm run test:browser
```

The app uses React, TypeScript, Vite, Cloudflare Workers/D1/R2 for catalog ingestion, and Playwright for responsive browser coverage.
