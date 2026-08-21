import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

test("dark-mode primary text uses the secondary brand accent without changing primary fills", () => {
  assert.match(css, /\.dark \{[\s\S]*--brand: #1111ff;/);
  assert.match(css, /\.dark \{[\s\S]*--brand-secondary: #9dabff;/);
  assert.match(
    css,
    /\.dark \.text-primary,[\s\S]*color: var\(--brand-secondary\);/,
  );
  assert.match(css, /--primary: var\(--brand\);/);
});
