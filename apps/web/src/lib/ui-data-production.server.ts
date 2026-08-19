import "server-only";

import { createProductionHttpDataComposition } from "@tokenbench/frontend/preview-data/composition-http";

/**
 * Production composition requires the separately deployed v1 producer.
 * Absence or failure is fatal; no evidence or design-fixture module is imported.
 */
export function createProductionUiDataAdapter(fetchImpl: typeof fetch = fetch) {
  return createProductionHttpDataComposition(
    process.env.TOKENBENCH_UI_DATA_BASE_URL,
    fetchImpl,
  );
}
