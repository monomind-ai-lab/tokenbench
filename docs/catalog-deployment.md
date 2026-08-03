# AI plan catalog deployment

The checked-in source must be deployed separately from Cloudflare resource setup. Do not run deployment or dashboard mutations from an implementation task.

## One-time Cloudflare setup

1. The provisioned D1 database ID is `a80143b2-519b-4cf1-a153-0d38b3d1b053`; keep that exact ID in both Wrangler files and run `npx wrangler d1 migrations apply ai-plan-catalog --remote --config wrangler.toml` from the repository root.
2. Create R2 bucket `ai-plan-catalog-snapshots`. Configure its lifecycle policy in the Cloudflare dashboard to expire objects after the approved retention period (default recommendation: 90 days); snapshots use immutable `source/date/content-hash.json` keys.
3. `wrangler.toml` and `workers/catalog-ingest/wrangler.toml` are the source of truth for Wrangler-managed D1 and R2 bindings. Do not create a second, divergent binding in the dashboard for a Wrangler deployment; use **Settings → Functions** only to verify that the deployed Pages project exposes `CATALOG_DB` and `SOURCE_SNAPSHOTS` with the checked-in names. Keep the current production project and custom domain unchanged.
4. Deploy the Pages site from repository root with `npm run build && npx wrangler pages deploy dist --project-name <existing-project>`. Pages Functions will expose `GET /api/catalog`.
5. Deploy the Worker from `workers/catalog-ingest` with `npx wrangler deploy`. Bind its D1 and R2 resources exactly as configured. The cron triggers run the approved official JSON model adapters every six hours (OpenRouter on the hour and OpenCode at the 30-minute offset) and rotate the manual subscription manifest every three hours.

## Workers Builds

For automatic deployments, connect the repository's `main` branch in **Workers & Pages → the existing Pages project → Settings → Builds**, set build root to the repository root, build command to `npm run build`, and output directory to `dist`. Configure the standalone Worker in **Workers & Pages → the ingest Worker → Settings → Builds** with production branch `main`, root directory `workers/catalog-ingest`, and deploy command `npx wrangler deploy`; confirm the D1 and R2 bindings in both preview and production environments before enabling builds.

## Operational invariant

Raw evidence is written to R2 before D1 publication. Each candidate source is validated before a single D1 batch inserts records and switches the active revision; fetch, parsing, schema, R2, or D1 failure records an actionable source refresh error while leaving the last published revision intact. Bootstrap contains only the small source-linked manually verified set checked into `src/catalog/manual-manifests.ts`; providers without a safely verified offer stay provenance-only.

## Automated-source allowlist and manual fallback

No browser scraping is permitted. The Worker `AUTOMATED_SOURCE_IDS` allowlist explicitly enables the approved official JSON adapters, `openrouter-models` and `opencode-zen`, and rejects any other automated source with an actionable refresh-state error instead of a request.

Before adding any HTML, browser, unstable, or otherwise unapproved adapter, record the reviewer, date, endpoint, robots result, and terms result in the deployment change record; only then add its source ID to `AUTOMATED_SOURCE_IDS`. This review must confirm the exact endpoint, cadence, snapshot storage, attribution, and downstream redistribution are permitted. The approved JSON adapters are not HTML scraping and remain scheduled as configured.

Until then, use a manually reviewed manifest: preserve the last published revision on a fetch or validation failure, add only a source-linked record with an evidence URL and review status, and leave a provider provenance-only when an accurate current offer cannot be verified. Never substitute a stale price, inferred token allowance, or zero-offer upstream response for the published catalog.
