import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.resolve(process.cwd(), "../..");

/**
 * The Cloudflare Workers runtime forbids `new Function`, so Ajv cannot compile
 * the accepted UI data contract schemas at request time. For that build only,
 * `ajv/dist/2020.js` resolves to a shim backed by validators compiled from the
 * same schemas at build time, keeping the envelope assertion intact. Node builds
 * are untouched.
 */
const cloudflareBuild = process.env.TOKENBENCH_CLOUDFLARE_BUILD === "1";

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  trailingSlash: true,
  turbopack: {
    // The accepted UI data contract is shared at the repository root so the
    // Next gateway validates the same schema and evidence as the pipeline.
    root: monorepoRoot,
    ...(cloudflareBuild
      ? {
          resolveAlias: {
            "ajv/dist/2020.js": "./src/cloudflare/ajv-2020-precompiled.mjs",
          },
        }
      : {}),
  },
};

export default nextConfig;
