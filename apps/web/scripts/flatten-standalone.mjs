/**
 * Flattens the Next.js standalone output for the OpenNext Cloudflare adapter.
 *
 * `next.config.ts` traces from the repository root because the app imports the
 * shared UI-data contract and display helpers from `<repo>/src`. Next therefore
 * writes the standalone server to `.next/standalone/apps/web/.next`. The adapter
 * derives its own package path from the nearest lockfile, which is
 * `apps/web/package-lock.json`, so it looks for `.next/standalone/.next` and
 * fails with ENOENT on `pages-manifest.json`.
 *
 * Rather than move a tracked lockfile or narrow the tracing root (which breaks
 * the cross-package imports), this script rewrites only the build output: the
 * nested package directory is hoisted to the standalone root and the two
 * `node_modules` trees are merged, with the app's real packages taking
 * precedence over the root-level traced stubs.
 */
import fs from "node:fs";
import path from "node:path";

const standaloneDir = path.resolve("./.next/standalone");
const nestedDir = path.join(standaloneDir, "apps/web");

if (!fs.existsSync(nestedDir)) {
  if (!fs.existsSync(path.join(standaloneDir, ".next/server/pages-manifest.json"))) {
    throw new Error(`Standalone output is neither nested nor flat at ${standaloneDir}.`);
  }
  console.log("Standalone output is already flat; nothing to do.");
  process.exit(0);
}

/** Copies `from` over `to` without clobbering existing entries. */
function mergeInto(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (!fs.existsSync(target)) {
      fs.renameSync(source, target);
    } else if (entry.isDirectory()) {
      mergeInto(source, target);
    }
  }
}

const rootModules = path.join(standaloneDir, "node_modules");
const nestedModules = path.join(nestedDir, "node_modules");
if (fs.existsSync(rootModules) && fs.existsSync(nestedModules)) {
  // The app tree carries the real packages; the hoisted tree only carries
  // traced `package.json` stubs, so the app tree wins every conflict.
  mergeInto(rootModules, nestedModules);
  fs.rmSync(rootModules, { recursive: true, force: true });
}

for (const entry of fs.readdirSync(nestedDir)) {
  fs.renameSync(path.join(nestedDir, entry), path.join(standaloneDir, entry));
}
fs.rmSync(path.join(standaloneDir, "apps"), { recursive: true, force: true });

const manifest = path.join(standaloneDir, ".next/server/pages-manifest.json");
if (!fs.existsSync(manifest)) {
  throw new Error(`Flattened standalone output is missing ${manifest}.`);
}
console.log("Flattened standalone output to", standaloneDir);
