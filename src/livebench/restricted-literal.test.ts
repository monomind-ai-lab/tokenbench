import { describe, expect, it } from 'vitest';
import { parseRestrictedLiteral } from './restricted-literal';

describe('parseRestrictedLiteral', () => {
  it('parses only a bounded export assignment made of literals', () => {
    expect(parseRestrictedLiteral('export const modelLinks = { model: { openweight: true, value: -1.25e2 }, list: [null, "ok"] };', {
      exportName: 'modelLinks',
    })).toEqual({
      model: { openweight: true, value: -125 },
      list: [null, 'ok'],
    });
  });

  it('accepts syntax-only trailing commas in upstream object and array literals', () => {
    expect(parseRestrictedLiteral('export const modelLinks = { values: [1,], };', {
      exportName: 'modelLinks',
    })).toEqual({ values: [1] });
  });

  it('rejects executable syntax, prototype keys, and trailing code without executing it', () => {
    expect(() => parseRestrictedLiteral('export const modelLinks = { value: globalThis.fetch("https://example.com") };', {
      exportName: 'modelLinks',
    })).toThrow();
    expect(() => parseRestrictedLiteral('{ "__proto__": 1 }')).toThrow(/prototype/i);
    expect(() => parseRestrictedLiteral('export const modelLinks = {}; globalThis.fetch("https://example.com");', {
      exportName: 'modelLinks',
    })).toThrow(/trailing/i);
  });
});
