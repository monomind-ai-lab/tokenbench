import {
  ACCEPTED_LIFECYCLE_AS_OF,
  type LifecycleQuery,
  type ModelDirectoryQuery,
} from "./preview-data/contracts";

/** The retained review fixture is intentionally bounded to its accepted request. */
export const EVIDENCE_MODEL_DIRECTORY_QUERY = {
  cursor: null,
  limit: 3,
} as const satisfies ModelDirectoryQuery;

/** Production must request the full contract window rather than the review-fixture subset. */
export const PRODUCTION_MODEL_DIRECTORY_QUERY = {
  cursor: null,
  limit: 100,
} as const satisfies ModelDirectoryQuery;

export const EVIDENCE_LIFECYCLE_QUERY = {
  asOf: ACCEPTED_LIFECYCLE_AS_OF,
  horizonDays: 30,
} as const satisfies LifecycleQuery;

export const PRODUCTION_LIFECYCLE_HORIZON_DAYS = 90;

/** Builds a server-owned production query; callers may inject asOf for tests. */
export function productionLifecycleQuery(
  asOf = new Date().toISOString(),
): LifecycleQuery {
  return { asOf, horizonDays: PRODUCTION_LIFECYCLE_HORIZON_DAYS };
}
