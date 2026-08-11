import { describe, expect, it } from 'vitest';
import { buildBlankTestCheatsheetPdf, testCheatsheetWelcomeEmail } from './test-cheatsheet';

describe('blank test cheatsheet PDF', () => {
  it('builds a deterministic valid one-page blank PDF', () => {
    const first = buildBlankTestCheatsheetPdf();
    const second = buildBlankTestCheatsheetPdf();

    expect(first).toEqual(second);

    const text = new TextDecoder('latin1').decode(first);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Page');
    expect(text).toContain('/Count 1');
    expect(text).toContain('/Length 0');
    expect(text).not.toMatch(/\bBT\b|\bTj\b/);
  });

  it('emits a parseable object table and xref with deterministic offsets', () => {
    const text = new TextDecoder('latin1').decode(buildBlankTestCheatsheetPdf());

    expect(text).toContain('xref\n0 5\n');
    expect(text).toContain('trailer\n<< /Size 5 /Root 1 0 R >>');
    expect(text).toContain('startxref\n');
    expect(text).toContain('%%EOF');
    expect(text).toContain('0000000000 65535 f');
    const addressible = text.split('\n').filter((line) => /^\d{10} \d{5} n $/u.test(line));
    expect(addressible).toHaveLength(4);
  });

  it('keeps the content stream empty without any text operator', () => {
    const text = new TextDecoder('latin1').decode(buildBlankTestCheatsheetPdf());

    expect(text).toContain('<< /Length 0 >>');
    expect(text).toContain('stream');
    expect(text).toContain('endstream');
    expect(text).not.toMatch(/\bBT\b|\bTj\b|\bTf\b/);
  });
});

describe('test cheatsheet welcome email', () => {
  it('links the reviewed welcome email to the versioned public PDF', () => {
    const email = testCheatsheetWelcomeEmail('https://tokenbench.monomind.one');

    expect(email.assetUrl).toBe('https://tokenbench.monomind.one/downloads/tokenbench-cheatsheet-test-v1.pdf');
    expect(email.subject).toBe('Your TokenBench test cheatsheet');
    expect(email.text).toContain('test delivery');
    expect(email.html).toContain('Download the test cheatsheet PDF');
    expect(email.html).not.toContain('{{ contact.EMAIL }}');
    expect(email.text).not.toContain('{{');
  });

  it('resolves the asset URL from the origin regardless of a deeper origin path', () => {
    const email = testCheatsheetWelcomeEmail('https://tokenbench.monomind.one/newsletter/confirmed/');

    expect(email.assetUrl).toBe('https://tokenbench.monomind.one/downloads/tokenbench-cheatsheet-test-v1.pdf');
  });
});
