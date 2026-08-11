/**
 * Deterministic blank-PDF bytes and reviewed welcome-email copy for the
 * post-confirmation test delivery.
 *
 * The PDF object table and xref offsets are built entirely from fixed ASCII
 * text, so every run (and the committed `public/downloads` asset plus its
 * prebuild regeneration) is byte-identical. The one-page document has an empty
 * content stream, so it is valid but intentionally blank.
 */

export const TEST_CHEATSHEET_FILENAME = 'tokenbench-cheatsheet-test-v1.pdf';
export const TEST_CHEATSHEET_ASSET_PATH = `/downloads/${TEST_CHEATSHEET_FILENAME}`;

const PDF_OBJECTS = [
  '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj',
  '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj',
] as const;

/** Builds a valid one-page blank PDF as deterministic ASCII bytes. */
export function buildBlankTestCheatsheetPdf(): Uint8Array {
  const header = '%PDF-1.4\n';

  // Each object is followed by its own newline, which is exactly how the body
  // is assembled below; offsets are therefore purely a function of the strings.
  let cursor = header.length;
  const offsets = PDF_OBJECTS.map((object) => {
    const offset = cursor;
    cursor += object.length + 1;
    return offset;
  });

  const body = header + PDF_OBJECTS.join('\n') + '\n';
  const xrefOffset = body.length;
  const xref = `xref\n0 ${PDF_OBJECTS.length + 1}\n0000000000 65535 f \n${
    offsets.map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('')
  }`;
  const trailer = `trailer\n<< /Size ${PDF_OBJECTS.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body + xref + trailer);
}

/**
 * The reviewed welcome copy for the post-confirmation test delivery. It never
 * references a subscriber field or a template personalization placeholder:
 * the email platform resolves recipient personalization itself, so no
 * `{{ contact.* }}` token
 * belongs here, and no subscriber identity ever enters a log or artifact.
 */
export function testCheatsheetWelcomeEmail(origin: string): {
  readonly subject: string;
  readonly assetUrl: string;
  readonly text: string;
  readonly html: string;
} {
  const assetUrl = `${new URL(origin).origin}${TEST_CHEATSHEET_ASSET_PATH}`;
  return {
    subject: 'Your TokenBench test cheatsheet',
    assetUrl,
    text: `Thanks for confirming. This is the current TokenBench test delivery: ${assetUrl}`,
    html: `<p>Thanks for confirming.</p><p>This is the current TokenBench test delivery.</p><p><a href="${assetUrl}">Download the test cheatsheet PDF</a></p>`,
  };
}
