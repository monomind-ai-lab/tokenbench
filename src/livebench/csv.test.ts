import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses RFC 4180 quotes, commas, and embedded newlines', () => {
    expect(parseCsv('model,label\r\nmodel-a,"quoted, value"\r\nmodel-b,"two\nlines"\r\n')).toEqual({
      headers: ['model', 'label'],
      rows: [
        { model: 'model-a', label: 'quoted, value' },
        { model: 'model-b', label: 'two\nlines' },
      ],
    });
  });

  it('rejects duplicate or blank headers and ragged rows', () => {
    expect(() => parseCsv('model,model\nfirst,second\n')).toThrow(/duplicate header/i);
    expect(() => parseCsv('model, \nfirst,second\n')).toThrow(/blank header/i);
    expect(() => parseCsv('model,score\nmodel-a\n')).toThrow(/column count/i);
  });

  it('rejects malformed UTF-8 before parsing', () => {
    expect(() => parseCsv(new Uint8Array([0xff, 0xfe]))).toThrow(/UTF-8/i);
  });
});
