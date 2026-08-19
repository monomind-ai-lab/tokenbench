import { createPreviewDataGateway } from './gateway';
import { createHttpTransport } from './http-transport';
import type { PreviewDataAdapter } from './contracts';

type FetchLike = Parameters<typeof createHttpTransport>[0];

function httpBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new TypeError('HTTP UI data composition requires an explicit baseUrl.');
  }
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('HTTP UI data composition baseUrl must use http or https.');
  }
  return parsed.toString();
}

/** Production-only HTTP composition. Transport and validation failures propagate. */
export function createProductionHttpDataComposition(baseUrl: string | undefined, fetchImpl?: FetchLike): PreviewDataAdapter {
  return createPreviewDataGateway(createHttpTransport(fetchImpl, httpBaseUrl(baseUrl)));
}
