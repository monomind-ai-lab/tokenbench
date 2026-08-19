import { createEvidenceTransport, type EvidenceTransportOptions } from './evidence-transport';
import { createPreviewDataGateway } from './gateway';
import type { PreviewDataAdapter } from './contracts';

/** Deterministic accepted evidence for design previews and tests only. */
export function createEvidencePreviewDataComposition(evidence?: EvidenceTransportOptions): PreviewDataAdapter {
  return createPreviewDataGateway(createEvidenceTransport(evidence));
}
