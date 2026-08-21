import { describe, expect, it } from "vitest";

import type { Provenance } from "./preview-data/contracts";
import { presentEvidence } from "./presentation-value";

const source: Provenance = {
  id: "source:example",
  label: "Official source",
  kind: "accepted_pipeline",
  effectiveAt: "2026-08-21T00:00:00.000Z",
  note: "Reviewed source receipt.",
};

describe("presentEvidence", () => {
  it("uses a single dash for unavailable facts while preserving reason and provenance", () => {
    const result = presentEvidence<number>({
      availability: "unavailable",
      reason: "The source did not publish a cache-write price.",
      provenance: source,
    });

    expect(result).toMatchObject({
      availability: "unavailable",
      value: null,
      text: "-",
      reason: "The source did not publish a cache-write price.",
      provenance: [source],
    });
    expect(result.accessibleDescription).toContain("Official source");
  });

  it("formats an available fact without changing its source value", () => {
    const result = presentEvidence({
      availability: "available" as const,
      value: 1.25,
      provenance: source,
    }, (value) => `$${value.toFixed(2)}`);

    expect(result).toMatchObject({
      availability: "available",
      value: 1.25,
      text: "$1.25",
      reason: null,
      provenance: [source],
    });
  });
});
