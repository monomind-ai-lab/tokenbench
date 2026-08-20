import { describe, expect, it } from "vitest";

import {
  EVIDENCE_LIFECYCLE_QUERY,
  EVIDENCE_MODEL_DIRECTORY_QUERY,
  PRODUCTION_LIFECYCLE_HORIZON_DAYS,
  PRODUCTION_MODEL_DIRECTORY_QUERY,
  productionLifecycleQuery,
} from "./model-surface-lifecycle-query";

describe("model surface lifecycle query selection", () => {
  it("keeps the retained evidence lifecycle request immutable", () => {
    expect(EVIDENCE_LIFECYCLE_QUERY).toEqual({
      asOf: "2026-08-18T00:00:00.000Z",
      horizonDays: 30,
    });
  });

  it("uses an injected server UTC timestamp for production lifecycle requests", () => {
    expect(productionLifecycleQuery("2026-08-21T02:03:04.005Z")).toEqual({
      asOf: "2026-08-21T02:03:04.005Z",
      horizonDays: PRODUCTION_LIFECYCLE_HORIZON_DAYS,
    });
    expect(PRODUCTION_LIFECYCLE_HORIZON_DAYS).toBe(90);
  });

  it("keeps the retained directory request narrow while production requests the contract maximum", () => {
    expect(EVIDENCE_MODEL_DIRECTORY_QUERY).toEqual({ cursor: null, limit: 3 });
    expect(PRODUCTION_MODEL_DIRECTORY_QUERY).toEqual({
      cursor: null,
      limit: 100,
    });
  });
});
