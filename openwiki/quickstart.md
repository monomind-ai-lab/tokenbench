# TokenBench code wiki

TokenBench helps people and teams choose AI subscriptions, API routes, and models using price calculations plus source-attributed benchmark evidence. Its defining behavior is **evidence-aware decision support**: pricing, capability measurements, derived workload results, freshness, and unavailable data are distinct rather than collapsed into a universal score.

## Start here

- **Current production-oriented system:** root React/Vite site, Cloudflare Pages Functions, D1, R2, and two scheduled ingestion Workers. See [Architecture](architecture.md) and [Key workflows](workflows.md).
- **Product and data rules:** source rights, provenance, null/unavailable semantics, and the accepted UI contract. See [Domain concepts](domain.md).
- **Operational change:** schedules, bindings, migrations, publication safety, and deployment boundaries. See [Operations](operations.md).
- **Validation:** root and Next checks, browser tests, and focused test locations. See [Testing](testing.md).
- **Where code lives:** practical directory map and change entrypoints. See [Source map](source-map.md).

## Architecture status: two applications during a controlled rebuild

The root application is the established delivery path: `src/main.tsx` starts the preview route resolver, Vite generates static/SSR documents, Pages Functions serve APIs and dynamic pages, and Workers publish revisioned data. Root scripts in `package.json` build and test this system.

`apps/web/` was added in the current `4991758` commit as a separate Next.js App Router rebuild. It contains page/components and local data arrays, while its own `package.json` has independent Next commands. Do **not** treat it as a completed replacement: the readiness audit says Next pages are not wired through the validated gateway, the v1 HTTP producer endpoints are not all present, and cutover is not authorized ([`docs/rebuild-audit/data-pipeline-readiness.md`](../docs/rebuild-audit/data-pipeline-readiness.md)).

## Local development

```bash
npm install
npm run dev                 # root Vite app; predev generates static pages
npm test
npm run lint
npm run build
npm run test:browser
```

For the rebuild only, work from `apps/web/` and use its own install/scripts:

```bash
npm install
npm run dev
npm run lint
npm run build
```

The root Vite development server includes a synthetic local benchmark API because it does not run Cloudflare Pages Functions. It must not be mistaken for production evidence (`vite.config.ts`, `scripts/local-preview-benchmark-api.ts`).

## Non-negotiable engineering rules

1. Preserve source attribution, timestamps, freshness, and explicit `null`/unavailable states. **Unknown is never zero.**
2. Keep catalog, benchmark, runtime observation, projection, and methodology revisions separate; do not mix facts across revisions.
3. Browser code reads published Pages APIs, never upstream benchmark providers directly.
4. Publish immutable R2 evidence before staging D1 and move publication pointers only after complete validation.
5. Artificial Analysis data—including derived contamination—is prohibited. See [Domain concepts](domain.md#source-policy-and-provenance).
6. Do not convert a successful local build into authorization to deploy, modify Cloudflare, or send newsletter email. Follow the checked-in runbooks.

## Git context

The current commit establishes the Next rebuild on the existing authoritative data base and separates leaderboard route definitions from general routing. The preceding history documents a staged React preview migration: accepted UI-data contract, validated gateway, truthful preview query documents, and browser deployment-gate stabilization. This explains why the repository deliberately maintains both the root Vite/Pages pipeline and the new Next application during transition.
