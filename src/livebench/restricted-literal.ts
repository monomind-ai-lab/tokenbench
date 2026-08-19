export type RestrictedLiteral = null | boolean | number | string | RestrictedLiteralArray | RestrictedLiteralObject;

export interface RestrictedLiteralArray extends ReadonlyArray<RestrictedLiteral> {}

export interface RestrictedLiteralObject {
  readonly [key: string]: RestrictedLiteral;
}

export interface RestrictedLiteralOptions {
  /** Require an `export const <name> = ...` declaration instead of a bare literal. */
  readonly exportName?: string;
  /**
   * Read only the literal declaration and intentionally leave the remainder
   * uninterpreted. This is needed for upstream files that colocate UI helpers
   * after their data export; it never evaluates that remainder.
   */
  readonly allowTrailingSource?: boolean;
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export class RestrictedLiteralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestrictedLiteralError';
  }
}

const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_NODES = 50_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor', 'get', 'set']);

function decodeInput(input: string | Uint8Array, maxBytes: number): string {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > maxBytes) {
      throw new RestrictedLiteralError(`restricted literal exceeds ${maxBytes} byte limit`);
    }
    return input;
  }
  if (input.byteLength > maxBytes) {
    throw new RestrictedLiteralError(`restricted literal exceeds ${maxBytes} byte limit`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new RestrictedLiteralError('restricted literal is not valid UTF-8');
  }
}

class Parser {
  private position = 0;
  private nodes = 0;

  constructor(
    private readonly source: string,
    private readonly options: Required<Pick<RestrictedLiteralOptions, 'maxDepth' | 'maxNodes'>>,
  ) {}

  parse(options: RestrictedLiteralOptions): RestrictedLiteral {
    this.skipWhitespace();
    if (this.peekKeyword('export')) {
      this.readKeyword('export');
      this.requireWhitespace('after export');
      const declaration = this.readIdentifier();
      if (declaration !== 'const') {
        this.fail('only an export const literal declaration is allowed');
      }
      this.requireWhitespace('after const');
      const name = this.readIdentifier();
      if (options.exportName && name !== options.exportName) {
        this.fail(`expected export ${options.exportName}`);
      }
      this.skipWhitespace();
      this.expect('=');
      this.skipWhitespace();
    } else if (options.exportName) {
      this.fail(`expected export const ${options.exportName}`);
    }

    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.peek() === ';') {
      this.position += 1;
      this.skipWhitespace();
    }
    if (!options.allowTrailingSource && this.position !== this.source.length) {
      this.fail('trailing executable or non-literal source is not allowed');
    }
    return value;
  }

  private parseValue(depth: number): RestrictedLiteral {
    if (depth > this.options.maxDepth) this.fail(`literal nesting exceeds ${this.options.maxDepth}`);
    this.nodes += 1;
    if (this.nodes > this.options.maxNodes) this.fail(`literal node count exceeds ${this.options.maxNodes}`);

    const next = this.peek();
    if (next === '{') return this.parseObject(depth + 1);
    if (next === '[') return this.parseArray(depth + 1);
    if (next === '"' || next === "'") return this.parseString();
    if (next === '-' || (next >= '0' && next <= '9')) return this.parseNumber();
    if (this.peekKeyword('true')) {
      this.readKeyword('true');
      return true;
    }
    if (this.peekKeyword('false')) {
      this.readKeyword('false');
      return false;
    }
    if (this.peekKeyword('null')) {
      this.readKeyword('null');
      return null;
    }
    this.fail('only object, array, string, finite number, boolean, and null literals are allowed');
  }

  private parseObject(depth: number): Readonly<Record<string, RestrictedLiteral>> {
    this.expect('{');
    this.skipWhitespace();
    const result: Record<string, RestrictedLiteral> = Object.create(null) as Record<string, RestrictedLiteral>;
    if (this.peek() === '}') {
      this.position += 1;
      return result;
    }

    while (true) {
      const key = this.parseObjectKey();
      if (FORBIDDEN_KEYS.has(key)) this.fail(`prototype or accessor key ${key} is not allowed`);
      if (Object.hasOwn(result, key)) this.fail(`duplicate object key ${key}`);
      this.skipWhitespace();
      this.expect(':');
      this.skipWhitespace();
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      if (this.peek() === '}') {
        this.position += 1;
        return result;
      }
      this.expect(',');
      this.skipWhitespace();
      // Trailing commas are syntax-only and occur in the upstream data export.
      // They do not widen the accepted value grammar or enable execution.
      if (this.peek() === '}') {
        this.position += 1;
        return result;
      }
    }
  }

  private parseArray(depth: number): readonly RestrictedLiteral[] {
    this.expect('[');
    this.skipWhitespace();
    const result: RestrictedLiteral[] = [];
    if (this.peek() === ']') {
      this.position += 1;
      return result;
    }

    while (true) {
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      if (this.peek() === ']') {
        this.position += 1;
        return result;
      }
      this.expect(',');
      this.skipWhitespace();
      if (this.peek() === ']') {
        this.position += 1;
        return result;
      }
    }
  }

  private parseObjectKey(): string {
    this.skipWhitespace();
    const next = this.peek();
    if (next === '"' || next === "'") return this.parseString();
    return this.readIdentifier();
  }

  private parseString(): string {
    const quote = this.peek();
    this.position += 1;
    let result = '';
    while (this.position < this.source.length) {
      const character = this.source[this.position] as string;
      this.position += 1;
      if (character === quote) return result;
      if (character < ' ') this.fail('unescaped control character in string literal');
      if (character !== '\\') {
        result += character;
        continue;
      }
      if (this.position >= this.source.length) this.fail('unterminated escape sequence');
      const escaped = this.source[this.position] as string;
      this.position += 1;
      if (escaped === '"' || escaped === "'" || escaped === '\\' || escaped === '/') {
        result += escaped;
      } else if (escaped === 'b') {
        result += '\b';
      } else if (escaped === 'f') {
        result += '\f';
      } else if (escaped === 'n') {
        result += '\n';
      } else if (escaped === 'r') {
        result += '\r';
      } else if (escaped === 't') {
        result += '\t';
      } else if (escaped === 'u') {
        const hex = this.source.slice(this.position, this.position + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('invalid Unicode escape sequence');
        result += String.fromCharCode(Number.parseInt(hex, 16));
        this.position += 4;
      } else {
        this.fail(`unsupported escape sequence \\${escaped}`);
      }
    }
    this.fail('unterminated string literal');
  }

  private parseNumber(): number {
    const rest = this.source.slice(this.position);
    const match = rest.match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) this.fail('invalid number literal');
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail('number literal must be finite');
    this.position += match[0].length;
    return value;
  }

  private readIdentifier(): string {
    const rest = this.source.slice(this.position);
    const match = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!match) this.fail('expected an identifier or quoted key');
    this.position += match[0].length;
    return match[0];
  }

  private peekKeyword(keyword: string): boolean {
    if (!this.source.startsWith(keyword, this.position)) return false;
    const following = this.source[this.position + keyword.length];
    return !following || !/[A-Za-z0-9_$]/.test(following);
  }

  private readKeyword(keyword: string): void {
    if (!this.peekKeyword(keyword)) this.fail(`expected ${keyword}`);
    this.position += keyword.length;
  }

  private requireWhitespace(context: string): void {
    const before = this.position;
    this.skipWhitespace();
    if (before === this.position) this.fail(`expected whitespace ${context}`);
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length && /[ \t\n\r]/.test(this.source[this.position] as string)) {
      this.position += 1;
    }
  }

  private expect(character: string): void {
    if (this.peek() !== character) this.fail(`expected ${character}`);
    this.position += 1;
  }

  private peek(): string {
    return this.source[this.position] ?? '';
  }

  private fail(message: string): never {
    throw new RestrictedLiteralError(`${message} at offset ${this.position}`);
  }
}

/**
 * Parse a deliberately tiny JavaScript-literal subset. It never evaluates the
 * input, imports a module, or invokes a property/getter.
 */
export function parseRestrictedLiteral(
  input: string | Uint8Array,
  options: RestrictedLiteralOptions = {},
): RestrictedLiteral {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RestrictedLiteralError('maxBytes must be positive');
  if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0) throw new RestrictedLiteralError('maxDepth must be positive');
  if (!Number.isSafeInteger(maxNodes) || maxNodes <= 0) throw new RestrictedLiteralError('maxNodes must be positive');

  return new Parser(decodeInput(input, maxBytes), { maxDepth, maxNodes }).parse(options);
}
