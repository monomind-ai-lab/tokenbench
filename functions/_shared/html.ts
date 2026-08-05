/** Escapes text inserted between HTML elements. */
export function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Escapes text inserted into a quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value)
    .replaceAll("'", '&#39;')
    .replaceAll('"', '&quot;');
}

/** Escapes XML element text without relying on HTML-only named entities. */
export function escapeXmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&apos;')
    .replaceAll('"', '&quot;');
}

/** External attribution links are permitted only for complete HTTPS URLs. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * JSON placed in an application/json script element must not contain a literal
 * closing script delimiter. Escaping these characters also keeps old parsers
 * from treating line and paragraph separators as executable source boundaries.
 */
export function serializeJsonForScript(value: unknown): string {
  const serialized = JSON.stringify(value) ?? 'null';
  return serialized.replace(/[<>&\u2028\u2029]/g, (character) => {
    switch (character) {
      case '<': return '\\u003c';
      case '>': return '\\u003e';
      case '&': return '\\u0026';
      case '\u2028': return '\\u2028';
      case '\u2029': return '\\u2029';
      default: return character;
    }
  });
}
