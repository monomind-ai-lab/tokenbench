import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * Preview deployment configuration for the Cloudflare Workers runtime.
 *
 * The incremental cache is backed by the immutable build assets rather than
 * KV or R2 so the preview needs no additional account infrastructure. Prerendered
 * routes are served from the build output; revalidation is a no-op, which is
 * acceptable because every decision surface is `dynamic = "force-dynamic"`.
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
