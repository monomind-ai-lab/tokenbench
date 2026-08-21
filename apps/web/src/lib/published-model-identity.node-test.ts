import assert from "node:assert/strict";
import test from "node:test";

import type { ModelDirectoryEnvelope } from "@tokenbench/frontend/model-directory-contracts";

import { normalizePublishedModelIds } from "./published-model-identity";

const AT = "2026-08-21T00:00:00.000Z";

function directory(entries: readonly Record<string, unknown>[]): ModelDirectoryEnvelope {
  return {
    revision: "directory-r1",
    publishedAt: AT,
    freshness: { status: "fresh", checkedAt: AT },
    attribution: [],
    data: {
      week: null,
      models: entries,
      nextCursor: null,
    },
  } as unknown as ModelDirectoryEnvelope;
}

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    modelKey: "source:benchlm:model-a",
    sourceId: "benchlm",
    sourceModelId: "model-a",
    canonicalSlug: "model-a",
    ...overrides,
  };
}

test("normalizes a source-prefixed ID only from an exact published identity receipt", () => {
  const ids = normalizePublishedModelIds(
    ["source:benchlm:model-a", "plain-route-id"],
    [directory([entry()])],
  );

  assert.deepEqual(ids, ["model-a", "plain-route-id"]);
});

test("does not guess route IDs from malformed, unsafe, or collapsing source mappings", () => {
  const malformed = normalizePublishedModelIds(
    ["source:benchlm:model-a"],
    [directory([entry({ sourceModelId: "different-model" })])],
  );
  const unsafe = normalizePublishedModelIds(
    ["source:benchlm:model-a"],
    [directory([entry({ canonicalSlug: "provider/model-a" })])],
  );
  const collapsing = normalizePublishedModelIds(
    ["source:benchlm:model-a", "source:benchlm:model-b"],
    [directory([
      entry(),
      entry({ modelKey: "source:benchlm:model-b", sourceModelId: "model-b" }),
    ])],
  );

  assert.deepEqual(malformed, ["source:benchlm:model-a"]);
  assert.deepEqual(unsafe, ["source:benchlm:model-a"]);
  assert.deepEqual(collapsing, ["source:benchlm:model-a", "source:benchlm:model-b"]);
});
