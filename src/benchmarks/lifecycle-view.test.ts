import { describe, expect, it } from 'vitest';
import { groupLifecycleRecords, migrationDelta, type LifecycleRecord } from './lifecycle-view';

const records: readonly LifecycleRecord[] = [
  {
    modelKey: 'benchlm:action', canonicalSlug: 'action', displayName: 'Action', creator: 'Provider A', status: 'current',
    announcementDate: '2026-07-01', deprecationDate: '2026-08-10', retirementDate: '2026-08-20', replacement: null,
  },
  {
    modelKey: 'benchlm:upcoming', canonicalSlug: 'upcoming', displayName: 'Upcoming', creator: 'Provider A', status: 'current',
    announcementDate: '2026-07-02', deprecationDate: null, retirementDate: '2026-08-30', replacement: null,
  },
  {
    modelKey: 'benchlm:monitoring', canonicalSlug: 'monitoring', displayName: 'Monitoring', creator: 'Provider B', status: 'current',
    announcementDate: '2026-07-03', deprecationDate: null, retirementDate: null, replacement: null,
  },
  {
    modelKey: 'benchlm:archived', canonicalSlug: 'archived', displayName: 'Archived', creator: 'Provider B', status: 'archived',
    announcementDate: '2026-06-01', deprecationDate: null, retirementDate: null, replacement: null,
  },
];

describe('lifecycle evidence selectors', () => {
  it('keeps announcement, deprecation, and retirement facts distinct while grouping records by action horizon', () => {
    const groups = groupLifecycleRecords(records, new Date('2026-08-14T00:00:00.000Z'));

    expect(groups.map((group) => group.id)).toEqual([
      'action_required', 'upcoming', 'monitoring', 'archived',
    ]);
    expect(groups[0]?.records[0]).toMatchObject({
      announcementDate: '2026-07-01', deprecationDate: '2026-08-10', retirementDate: '2026-08-20',
    });
  });

  it('does not calculate a migration delta when host measurements are not comparable', () => {
    expect(migrationDelta({ sourceHost: 'a', targetHost: 'b' })).toEqual({
      cost: null, speed: null, reason: 'Measurement conditions are not comparable',
    });
  });
});
