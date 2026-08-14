export type LifecycleGroupId = 'action_required' | 'upcoming' | 'monitoring' | 'archived';

export interface LifecycleReplacementEvidence {
  readonly replacementId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
}

/** A lifecycle row contains only separately sourced lifecycle facts. */
export interface LifecycleRecord {
  readonly modelKey: string;
  readonly canonicalSlug: string;
  readonly displayName: string;
  readonly creator: string;
  readonly status: 'current' | 'archived';
  readonly announcementDate: string | null;
  readonly deprecationDate: string | null;
  readonly retirementDate: string | null;
  readonly replacement: LifecycleReplacementEvidence | null;
}

export interface LifecycleGroup {
  readonly id: LifecycleGroupId;
  readonly label: string;
  readonly records: readonly LifecycleRecord[];
}

export interface MigrationMeasurement {
  readonly sourceHost: string | null;
  readonly targetHost: string | null;
  readonly sourceConditions?: string | null;
  readonly targetConditions?: string | null;
  readonly sourceCost?: number | null;
  readonly targetCost?: number | null;
  readonly sourceSpeed?: number | null;
  readonly targetSpeed?: number | null;
}

export interface MigrationDelta {
  readonly cost: number | null;
  readonly speed: number | null;
  readonly reason: string | null;
}

const UPCOMING_HORIZON_DAYS = 90;

function timestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function onOrBefore(value: string | null, point: number): boolean {
  const parsed = timestamp(value);
  return parsed !== null && parsed <= point;
}

function withinHorizon(value: string | null, point: number, horizonDays: number): boolean {
  const parsed = timestamp(value);
  return parsed !== null && parsed > point && parsed <= point + horizonDays * 86_400_000;
}

function groupFor(record: LifecycleRecord, now: number, horizonDays: number): LifecycleGroupId {
  if (record.status === 'archived') return 'archived';
  if (onOrBefore(record.deprecationDate, now) || onOrBefore(record.retirementDate, now)) return 'action_required';
  if (withinHorizon(record.deprecationDate, now, horizonDays) || withinHorizon(record.retirementDate, now, horizonDays)) return 'upcoming';
  return 'monitoring';
}

/**
 * Provides stable, exhaustive lifecycle groups. Dates are never merged: a
 * first-seen observation is not an announcement, and a deprecation is not a
 * retirement.
 */
export function groupLifecycleRecords(
  records: readonly LifecycleRecord[],
  now: Date,
  horizonDays = UPCOMING_HORIZON_DAYS,
): readonly LifecycleGroup[] {
  const groups: Record<LifecycleGroupId, LifecycleRecord[]> = {
    action_required: [], upcoming: [], monitoring: [], archived: [],
  };
  const current = now.getTime();
  for (const record of records) groups[groupFor(record, current, horizonDays)].push(record);
  return [
    { id: 'action_required', label: 'Action required', records: groups.action_required },
    { id: 'upcoming', label: 'Upcoming changes', records: groups.upcoming },
    { id: 'monitoring', label: 'Monitoring', records: groups.monitoring },
    { id: 'archived', label: 'Archived', records: groups.archived },
  ];
}

/** Returns deltas only when the source identifies comparable host conditions. */
export function migrationDelta(measurement: MigrationMeasurement): MigrationDelta {
  if (measurement.sourceHost === null
    || measurement.targetHost === null
    || measurement.sourceHost !== measurement.targetHost
    || measurement.sourceConditions === undefined
    || measurement.targetConditions === undefined
    || measurement.sourceConditions === null
    || measurement.targetConditions === null
    || measurement.sourceConditions !== measurement.targetConditions) {
    return { cost: null, speed: null, reason: 'Measurement conditions are not comparable' };
  }
  const cost = measurement.sourceCost === null || measurement.sourceCost === undefined
    || measurement.targetCost === null || measurement.targetCost === undefined
    ? null
    : measurement.targetCost - measurement.sourceCost;
  const speed = measurement.sourceSpeed === null || measurement.sourceSpeed === undefined
    || measurement.targetSpeed === null || measurement.targetSpeed === undefined
    ? null
    : measurement.targetSpeed - measurement.sourceSpeed;
  return { cost, speed, reason: cost === null && speed === null ? 'Comparable measurements are unavailable' : null };
}
