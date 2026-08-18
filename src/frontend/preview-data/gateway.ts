import { createValidatedPreviewDataAdapter, type PreviewDataTransport } from './api-adapter';
import type { PreviewDataAdapter } from './contracts';

/** The only boundary that turns raw accepted transport envelopes into page data. */
export function createPreviewDataGateway(transport: PreviewDataTransport): PreviewDataAdapter {
  return createValidatedPreviewDataAdapter(transport);
}
