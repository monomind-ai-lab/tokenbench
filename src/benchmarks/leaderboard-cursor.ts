/** Shared API/client boundary for opaque leaderboard pagination cursors. */
export const LEADERBOARD_CURSOR_MAX_LENGTH = 512;

export function isValidLeaderboardCursor(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= LEADERBOARD_CURSOR_MAX_LENGTH
    && /^[A-Za-z0-9_-]+$/u.test(value);
}

/** Fixed-width identity for canonical filter state embedded in opaque cursors. */
export async function leaderboardFilterFingerprint(filter: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(filter));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}
