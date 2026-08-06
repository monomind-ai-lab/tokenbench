import { describe, expect, it } from 'vitest';
import { splitApiResponseBody } from './api-response-chunks';

describe('API response body chunking', () => {
  it('preserves exact JSON bytes across bounded chunks', () => {
    const body = JSON.stringify({ value: `alpha-${'界'.repeat(12)}-${'😀'.repeat(8)}-omega` });
    const chunks = splitApiResponseBody(body, 17);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(body);
    for (const chunk of chunks) {
      expect(new TextEncoder().encode(chunk).byteLength).toBeLessThanOrEqual(17);
    }
  });

  it('rejects empty bodies and unsafe limits', () => {
    expect(() => splitApiResponseBody('')).toThrow('must not be empty');
    expect(() => splitApiResponseBody('{}', 3)).toThrow('at least four bytes');
  });
});
