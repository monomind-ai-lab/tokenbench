import assert from "node:assert/strict";
import test from "node:test";

import type { ModelDirectoryEnvelope } from "@tokenbench/frontend/model-directory-contracts";

import { mergePublishedDirectoryPages } from "./published-directory-pages";

const timestamp = "2026-08-21T00:00:00.000Z";

function page(
  slug: string,
  cursor: string | null,
  revision = "directory-r1",
): ModelDirectoryEnvelope {
  return {
    revision,
    publishedAt: timestamp,
    freshness: { status: "fresh", checkedAt: timestamp },
    attribution: [{
      sourceId: "benchlm",
      label: "BenchLM",
      url: "https://example.com/benchlm",
      updatedAt: timestamp,
    }],
    data: {
      week: {
        weekStart: "2026-08-17T00:00:00.000Z",
        benchmarkRevision: "bench-r1",
        sourceSnapshotId: "snapshot-r1",
        methodologyVersion: "weekly-r1",
        generatedAt: timestamp,
      },
      nextCursor: cursor,
      models: [{
        modelKey: `source:benchlm:${slug}`,
        canonicalSlug: slug,
        displayName: slug,
        creator: "Example",
        sourceType: "Proprietary",
        reasoningType: null,
        familyId: null,
        variantId: null,
        firstSeenRevision: "bench-r1",
        firstSeenAt: timestamp,
        lastSeenRevision: "bench-r1",
        lastSeenAt: timestamp,
        latestProfileRevision: "profile-r1",
        status: "current",
        sourceId: "benchlm",
        sourceModelId: slug,
        updatedAt: timestamp,
        weeklyRank: null,
        overallScore: null,
        overallRank: null,
        categories: [],
        strongestCategory: null,
        representativePrice: null,
        evidenceStatus: "supported",
        profileRevision: "profile-r1",
        profileFallback: "none",
        profilePublishedAt: timestamp,
        profileCheckedAt: timestamp,
      }],
    },
  };
}

test("merges every coherent directory cursor page without dropping current records", () => {
  const merged = mergePublishedDirectoryPages([
    page("alpha", "opaque-next"),
    page("beta", null),
  ]);

  assert.deepEqual(merged.data.models.map((model) => model.canonicalSlug), ["alpha", "beta"]);
  assert.equal(merged.data.nextCursor, null);
});

test("rejects changed revisions and duplicate route identities across directory pages", () => {
  assert.throws(
    () => mergePublishedDirectoryPages([page("alpha", "opaque-next"), page("beta", null, "directory-r2")]),
    /changed while paginated/,
  );
  assert.throws(
    () => mergePublishedDirectoryPages([page("alpha", "opaque-next"), page("alpha", null)]),
    /repeated an exact model identity/,
  );
});
