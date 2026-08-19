export interface CsvBounds {
  readonly maxBytes?: number;
  readonly maxRows?: number;
  readonly maxColumns?: number;
  readonly maxFieldLength?: number;
}

export interface ParsedCsv {
  readonly headers: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_ROWS = 25_000;
const DEFAULT_MAX_COLUMNS = 512;
const DEFAULT_MAX_FIELD_LENGTH = 65_536;
const UNSAFE_HEADERS = new Set(['__proto__', 'prototype', 'constructor']);

function decodeCsvInput(input: string | Uint8Array, maxBytes: number): string {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > maxBytes) {
      throw new CsvParseError(`CSV exceeds ${maxBytes} byte limit`);
    }
    return input;
  }
  if (input.byteLength > maxBytes) throw new CsvParseError(`CSV exceeds ${maxBytes} byte limit`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new CsvParseError('CSV is not valid UTF-8');
  }
}

function bounds(input: CsvBounds): Required<CsvBounds> {
  const value = {
    maxBytes: input.maxBytes ?? DEFAULT_MAX_BYTES,
    maxRows: input.maxRows ?? DEFAULT_MAX_ROWS,
    maxColumns: input.maxColumns ?? DEFAULT_MAX_COLUMNS,
    maxFieldLength: input.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH,
  };
  for (const [name, limit] of Object.entries(value)) {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new CsvParseError(`${name} must be a positive integer`);
  }
  return value;
}

/** Parse a bounded RFC 4180-style CSV document into strict header-addressable rows. */
export function parseCsv(input: string | Uint8Array, options: CsvBounds = {}): ParsedCsv {
  const limit = bounds(options);
  let source = decodeCsvInput(input, limit.maxBytes);
  if (source.startsWith('\uFEFF')) source = source.slice(1);

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let justClosedQuote = false;
  let endedWithRecord = false;

  const append = (character: string) => {
    field += character;
    if (field.length > limit.maxFieldLength) throw new CsvParseError(`CSV field exceeds ${limit.maxFieldLength} character limit`);
  };
  const finishRecord = () => {
    row.push(field);
    if (row.length > limit.maxColumns) throw new CsvParseError(`CSV row exceeds ${limit.maxColumns} column limit`);
    records.push(row);
    if (records.length > limit.maxRows) throw new CsvParseError(`CSV exceeds ${limit.maxRows} row limit`);
    row = [];
    field = '';
    justClosedQuote = false;
    endedWithRecord = true;
  };
  const finishField = () => {
    row.push(field);
    if (row.length > limit.maxColumns) throw new CsvParseError(`CSV row exceeds ${limit.maxColumns} column limit`);
    field = '';
    justClosedQuote = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] as string;
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          append('"');
          index += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else {
        append(character);
      }
      endedWithRecord = false;
      continue;
    }

    if (justClosedQuote) {
      if (character === ',') {
        finishField();
        endedWithRecord = false;
        continue;
      }
      if (character === '\r' || character === '\n') {
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        finishRecord();
        continue;
      }
      throw new CsvParseError(`unexpected character after closing quote at offset ${index}`);
    }

    if (character === '"') {
      if (field.length !== 0) throw new CsvParseError(`quote must begin a field at offset ${index}`);
      quoted = true;
      endedWithRecord = false;
      continue;
    }
    if (character === ',') {
      finishField();
      endedWithRecord = false;
      continue;
    }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      finishRecord();
      continue;
    }
    append(character);
    endedWithRecord = false;
  }

  if (quoted) throw new CsvParseError('unterminated quoted CSV field');
  if (!endedWithRecord) finishRecord();
  if (records.length === 0) throw new CsvParseError('CSV must include a header record');

  const headers = records[0] as string[];
  if (headers.length === 0) throw new CsvParseError('CSV must include at least one header');
  const seenHeaders = new Set<string>();
  for (const header of headers) {
    if (!header.trim()) throw new CsvParseError('CSV has a blank header');
    if (header !== header.trim()) throw new CsvParseError(`CSV header ${JSON.stringify(header)} has surrounding whitespace`);
    if (UNSAFE_HEADERS.has(header)) throw new CsvParseError(`unsafe CSV header ${header}`);
    if (seenHeaders.has(header)) throw new CsvParseError(`duplicate header ${header}`);
    seenHeaders.add(header);
  }

  const rows = records.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new CsvParseError(`CSV row ${rowIndex + 2} has column count ${cells.length}; expected ${headers.length}`);
    }
    const record: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      record[header] = cells[columnIndex] as string;
    });
    return record;
  });

  return { headers, rows };
}
