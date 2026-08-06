export const API_RESPONSE_CHUNK_MAX_BYTES = 1_400_000;

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * Split an exact JSON response without breaking a Unicode code point. D1 caps
 * strings and rows at 2,000,000 bytes; the lower default leaves ample room for
 * keys and metadata while keeping request-time joins small.
 */
export function splitApiResponseBody(
  body: string,
  maxChunkBytes: number = API_RESPONSE_CHUNK_MAX_BYTES,
): readonly string[] {
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes < 4) {
    throw new Error('API response chunk limit must be an integer of at least four bytes');
  }
  if (body.length === 0) throw new Error('API response body must not be empty');

  const chunks: string[] = [];
  let chunkStart = 0;
  let chunkBytes = 0;
  let index = 0;
  while (index < body.length) {
    const codePoint = body.codePointAt(index);
    if (codePoint === undefined) throw new Error('API response body contains an invalid code point');
    const codeUnits = codePoint > 0xffff ? 2 : 1;
    const characterBytes = utf8ByteLength(codePoint);
    if (chunkBytes + characterBytes > maxChunkBytes) {
      chunks.push(body.slice(chunkStart, index));
      chunkStart = index;
      chunkBytes = 0;
      continue;
    }
    chunkBytes += characterBytes;
    index += codeUnits;
  }
  chunks.push(body.slice(chunkStart));
  return chunks;
}
