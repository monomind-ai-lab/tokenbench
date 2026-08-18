import '@testing-library/jest-dom/vitest';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const NodeUint8Array = new NodeTextEncoder().encode('').constructor;

Object.defineProperties(globalThis, {
  TextDecoder: { configurable: true, value: NodeTextDecoder, writable: true },
  TextEncoder: { configurable: true, value: NodeTextEncoder, writable: true },
  Uint8Array: { configurable: true, value: NodeUint8Array, writable: true },
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => null,
});

const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (args.some((arg) => typeof arg === 'string' && arg.includes("Failed to create chart: can't acquire context from the given item"))) return;
  consoleError(...args);
};

afterEach(() => cleanup());

if (typeof window.localStorage?.clear !== 'function') {
  let values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    clear() { values = new Map(); },
    getItem(key: string) { return values.get(key) ?? null; },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, String(value)); },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
