import { describe, expect, it } from 'vitest';
import { buildDeliveryRecords, summarizeByRole, type DeliverySourceRelease } from './delivery-records';

/**
 * What the product is willing to assert about a person.
 *
 * Every rule here is one that, if it broke, would credit somebody with work
 * they did not do. That is worse than an empty directory, so each is
 * mutation tested.
 */

const OWNER = 'owner-1';
const ADA = 'ada-1';
const CHIDI = 'chidi-1';

function release(over: Partial<DeliverySourceRelease> & { id: string }): DeliverySourceRelease {
  return {
    title: 'Ohema',
    ownerUserId: OWNER,
    releaseDate: '2026-01-01',
    status: 'draft',
    tasks: [],
    ...over,
  };
}

function task(over: { id: string; assignedToUserId?: string | null; templateTaskId?: string | null; status?: string; completedAt?: string | null }) {
  return {
    id: over.id,
    assignedToUserId: over.assignedToUserId === undefined ? ADA : over.assignedToUserId,
    templateTaskId: over.templateTaskId === undefined ? 'w6_cover_art_first_draft' : over.templateTaskId,
    status: over.status ?? 'done',
    completedAt: over.completedAt ?? null,
  };
}

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('delivery records', () => {
  it('credits a teammate for a delivered artwork step', () => {
    const records = buildDeliveryRecords(
      [release({ id: 'r1', tasks: [task({ id: 't1' })] })],
      NOW
    );
    expect(records).toEqual([
      { userId: ADA, role: 'graphic_designer', releaseId: 'r1', completedAt: null },
    ]);
  });

  it('NEVER credits the release owner', () => {
    // Template instantiation assigns every task to the release owner, so a row
    // still sitting on them is the unmoved default and not evidence of
    // anything. Crediting it would hand one person 60 deliveries per release,
    // which is the invented credential the brief forbids.
    const records = buildDeliveryRecords(
      [release({ id: 'r1', tasks: [task({ id: 't1', assignedToUserId: OWNER })] })],
      NOW
    );
    expect(records).toEqual([]);
  });

  it('counts one record per release, not per task', () => {
    // A designer who delivered a draft and then the final approved artwork
    // delivered ONE release's artwork. Two rows would read as two releases.
    const records = buildDeliveryRecords(
      [
        release({
          id: 'r1',
          tasks: [
            task({ id: 't1', templateTaskId: 'w6_cover_art_first_draft' }),
            task({ id: 't2', templateTaskId: 'w5_cover_art_final_approved' }),
          ],
        }),
      ],
      NOW
    );
    expect(records).toHaveLength(1);
  });

  it('keeps two people apart on the same release and role', () => {
    const records = buildDeliveryRecords(
      [
        release({
          id: 'r1',
          tasks: [
            task({ id: 't1', assignedToUserId: ADA }),
            task({ id: 't2', assignedToUserId: CHIDI, templateTaskId: 'w5_cover_art_final_approved' }),
          ],
        }),
      ],
      NOW
    );
    expect(records).toHaveLength(2);
    expect(new Set(records.map((r) => r.userId))).toEqual(new Set([ADA, CHIDI]));
  });

  it('ignores a task that is not done', () => {
    const records = buildDeliveryRecords(
      [release({ id: 'r1', tasks: [task({ id: 't1', status: 'in_progress' })] })],
      NOW
    );
    expect(records).toEqual([]);
  });

  it('ignores a step no role maps to', () => {
    const records = buildDeliveryRecords(
      [release({ id: 'r1', tasks: [task({ id: 't1', templateTaskId: 'w8_set_rollout_budget' })] })],
      NOW
    );
    expect(records).toEqual([]);
  });

  it('ignores an unassigned task', () => {
    const records = buildDeliveryRecords(
      [release({ id: 'r1', tasks: [task({ id: 't1', assignedToUserId: null })] })],
      NOW
    );
    expect(records).toEqual([]);
  });

  describe('the release has to have been delivered', () => {
    it('credits nothing while the release is still ahead and unfinished', () => {
      // Note the second, unfinished task. A release whose every task is done
      // counts as delivered whatever its date says, which is isRecapEligible's
      // deliberate behaviour and not something this module overrides.
      const records = buildDeliveryRecords(
        [
          release({
            id: 'r1',
            releaseDate: '2026-12-31',
            tasks: [task({ id: 't1' }), task({ id: 't2', status: 'todo', templateTaskId: null })],
          }),
        ],
        NOW
      );
      expect(records).toEqual([]);
    });

    it('credits an early finish even with the date ahead', () => {
      const records = buildDeliveryRecords(
        [release({ id: 'r1', releaseDate: '2026-12-31', tasks: [task({ id: 't1' })] })],
        NOW
      );
      expect(records).toHaveLength(1);
    });

    it('credits once the release date has passed', () => {
      const records = buildDeliveryRecords(
        [release({ id: 'r1', releaseDate: '2026-05-31', tasks: [task({ id: 't1' })] })],
        NOW
      );
      expect(records).toHaveLength(1);
    });

    it('credits a dateless release whose every task is done', () => {
      // The only route for a release whose date was never set, and the reason
      // this reuses isRecapEligible rather than reading releases.status:
      // nothing in the product ever writes 'released'.
      const records = buildDeliveryRecords(
        [release({ id: 'r1', releaseDate: null, tasks: [task({ id: 't1' })] })],
        NOW
      );
      expect(records).toHaveLength(1);
    });

    it('credits nothing on a dateless release with work outstanding', () => {
      const records = buildDeliveryRecords(
        [
          release({
            id: 'r1',
            releaseDate: null,
            tasks: [task({ id: 't1' }), task({ id: 't2', status: 'todo', templateTaskId: null })],
          }),
        ],
        NOW
      );
      expect(records).toEqual([]);
    });
  });

  it('carries a completed_at when the row has one', () => {
    const records = buildDeliveryRecords(
      [release({ id: 'r1', tasks: [task({ id: 't1', completedAt: '2026-02-02T00:00:00.000Z' })] })],
      NOW
    );
    expect(records[0].completedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('summarizes per role for a dry run', () => {
    const records = buildDeliveryRecords(
      [
        release({ id: 'r1', tasks: [task({ id: 't1' }), task({ id: 't2', templateTaskId: 'w8_lock_master', assignedToUserId: CHIDI })] }),
        release({ id: 'r2', tasks: [task({ id: 't3' })] }),
      ],
      NOW
    );
    expect(summarizeByRole(records)).toEqual([
      { role: 'graphic_designer', records: 2, people: 1 },
      { role: 'master_engineer', records: 1, people: 1 },
    ]);
  });
});
