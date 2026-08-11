function stripWeakPrefix(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('W/') ? trimmed.slice(2).trimStart() : trimmed;
}

/**
 * If-None-Match uses weak comparison. Cloudflare may therefore expose a
 * generated strong ETag as W/"..." after content encoding; treat only the
 * same opaque tag (or the RFC wildcard) as a match.
 */
export function matchesIfNoneMatch(request: Request, etag: string): boolean {
  const header = request.headers.get('If-None-Match');
  if (!header) return false;
  const expected = stripWeakPrefix(etag);
  return header.split(',').some((candidate) => {
    const trimmed = candidate.trim();
    return trimmed === '*' || stripWeakPrefix(trimmed) === expected;
  });
}
