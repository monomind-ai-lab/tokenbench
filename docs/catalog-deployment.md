# AI plan catalog deployment

The checked-in source must be deployed separately from Cloudflare resource setup. Do not run deployment or dashboard mutations from an implementation task.

## One-time Cloudflare setup

1. The provisioned D1 database ID is `a80143b2-519b-4cf1-a153-0d38b3d1b053`; keep that exact ID in both Wrangler files and run `npx wrangler d1 migrations apply ai-plan-catalog --remote --config wrangler.toml` from the repository root.
2. Create R2 bucket `ai-plan-catalog-snapshots`. Configure its lifecycle policy in the Cloudflare dashboard to expire objects after the approved retention period (default recommendation: 90 days); snapshots use immutable `source/date/content-hash.json` keys.
3. In the existing Pages project, open **Settings → Functions → D1 database bindings**, add `CATALOG_DB` to `ai-plan-catalog`, then open **Settings → Functions → R2 bucket bindings** and add `SOURCE_SNAPSHOTS` to `ai-plan-catalog-snapshots`. Keep the current production project and custom domain unchanged.
4. Deploy the Pages site from repository root with `npm run build && npx wrangler pages deploy dist --project-name <existing-project>`. Pages Functions will expose `GET /api/catalog`.
5. Deploy the Worker from `workers/catalog-ingest` with `npx wrangler deploy`. Bind its D1 and R2 resources exactly as configured. The cron triggers run OpenRouter every six hours, OpenCode every six hours at a 30-minute offset, and a rotating manual subscription manifest every three hours.

## Workers Builds

For automatic deployments, connect the repository's `main` branch in **Workers & Pages → the existing Pages project → Settings → Builds**, set build root to the repository root, build command to `npm run build`, and output directory to `dist`. Configure the standalone Worker in **Workers & Pages → the ingest Worker → Settings → Builds** with production branch `main`, root directory `workers/catalog-ingest`, and deploy command `npx wrangler deploy`; confirm the D1 and R2 bindings in both preview and production environments before enabling builds.

## Operational invariant

Raw evidence is written to R2 before D1 publication. Each candidate source is validated before a single D1 batch inserts records and switches the active revision; fetch, parsing, schema, R2, or D1 failure records an actionable source refresh error while leaving the last published revision intact. Bootstrap contains only the small source-linked manually verified set checked into `src/catalog/manual-manifests.ts`; providers without a safely verified offer stay provenance-only.
