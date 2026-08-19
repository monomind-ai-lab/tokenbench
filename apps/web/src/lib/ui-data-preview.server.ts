import "server-only";

import { createEvidencePreviewDataComposition } from "@tokenbench/frontend/preview-data/composition-evidence";

/** Retained accepted evidence for the local design/rebuild preview only. */
export function createDesignEvidenceDataAdapter() {
  return createEvidencePreviewDataComposition();
}
