# AI plan catalog deployment

The checked-in source must be deployed separately from Cloudflare resource setup. Do not run deployment or dashboard mutations from an implementation task.

## One-time Cloudflare setup

1. Create D1 database `ai-plan-catalog`, copy its ID into both Wrangler files, and run `npx wrangler d1 migrations apply ai-plan-catalog --remote --config wrangler.toml` from the repository root.
2. Create R2 bucket `ai-plan-catalog-snapshots`. Configure its lifecycle policy in the Cloudflare dashboard to expire objects after the approved retention period (default recommendation: 90 days); snapshots use immutable `source/date/content-hash.json` keys.
3. In the existing Pages project, add the `CATALOG_DB` D1 binding. Keep its current production project and custom domain unchanged.
4. Deploy the Pages site from repository root with `npm run build && npx wrangler pages deploy dist --project-name <existing-project>`. Pages Functions will expose `GET /api/catalog`.
5. Deploy the Worker from `workers/catalog-ingest` with `npx wrangler deploy`. Bind its D1 and R2 resources exactly as configured. The cron triggers run OpenRouter every six hours, OpenCode every six hours at a 30-minute offset, and a rotating manual subscription manifest every three hours.

## Workers Builds

For automatic deployments, set the Pages build root to the repository root, build command to `npm run build`, and output directory to `dist`. Configure the standalone Worker through Workers Builds with root directory `workers/catalog-ingest` and deploy command `npx wrangler deploy`.

## Operational invariant

Raw evidence is written to R2 before D1 publication. Each candidate source is validated before a single D1 batch inserts records and switches the active revision. A fetch, validation, R2, or D1 failure leaves the last published revision intact. Bootstrap response data has no offers until a valid published revision exists.
