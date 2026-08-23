/**
 * Ajv 2020 stand-in for the Cloudflare Workers runtime.
 *
 * workerd forbids `new Function`, so Ajv cannot compile JSON Schema at request
 * time. This module exposes the small slice of the Ajv API that
 * `src/frontend/preview-data/contract-v1.ts` uses and answers `getSchema` with
 * validators that were compiled ahead of time by
 * `scripts/build-contract-validators.mjs` from the very same
 * `contracts/ui-data-contract/v1` schemas. The accepted-envelope assertion is
 * therefore still performed; only the compilation moves to build time.
 *
 * It is wired in through `turbopack.resolveAlias` and only when
 * `TOKENBENCH_CLOUDFLARE_BUILD=1`, so Node builds keep the stock Ajv.
 */
import { registerFormat } from "./ajv-format-registry.mjs";
import * as precompiled from "./generated/ui-data-contract-v1-validators.mjs";

const ENVELOPE_REF = /#\/\$defs\/([A-Za-z]+)Envelope$/u;

export default class PrecompiledAjv2020 {
  addFormat(name, definition) {
    registerFormat(name, definition);
    return this;
  }

  // The meta-schema and the accepted schema are already baked into the
  // precompiled validators, so registration is a no-op here.
  addMetaSchema() {
    return this;
  }

  addSchema() {
    return this;
  }

  getSchema(ref) {
    const matched = ENVELOPE_REF.exec(String(ref));
    if (!matched) return undefined;
    return precompiled[matched[1]];
  }
}

export { PrecompiledAjv2020 as Ajv2020, PrecompiledAjv2020 as Ajv };
