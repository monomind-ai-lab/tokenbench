import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    // The accepted UI data contract is shared at the repository root so the
    // Next gateway validates the same schema and evidence as the pipeline.
    root: monorepoRoot,
  },
};

export default nextConfig;
