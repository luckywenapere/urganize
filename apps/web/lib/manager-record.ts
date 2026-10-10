import { isRecapEligible } from './recap-eligibility';
import { RISING_WINDOW_DAYS, wentLiveInWindow } from './directory-featuring';

/**
 * A manager's record: releases run, artists managed, how many are still active
 * (directory spec, section 4: a manager's profile "leads with releases run,
 * artists managed, how many still active").
 *
 * COMPUTED, NEVER TYPED. A creative's record comes from delivery_records and a
 * manager cannot have one the same way: the release owner is excluded from
 * those on purpose (template instantiation hands the owner every task, so a task
 * on the owner is the unmoved default and proves nothing). So a manager's
 * record is a different, honest question: which rollouts did this person OWN
 * that actually came out.
 *
 * It reuses isRecapEligible, the product's one answer to "has this happened"
 * (the date has passed, or every activity is done), and it ignores the STORED
 * status on purpose. Nothing writes `released`, and `archived` is somebody putting
 * a rollout away, which is not evidence it came out: counting an archived draft
 * as a rollout run would be an invented credential. A rollout that did come out
 * and was archived afterwards still counts, because the date or the tasks say so.
 *
 * Test rollouts never count either way.
 */

export type ManagerRolloutRow = {
  id: string;
  artistId: string | null;
  releaseDate: string | null;
  /** The stored status. Used ONLY to tell an archived rollout from an open one. */
  status: string;
  isTest: boolean;
  totalTasks: number;
  allTasksDone: boolean;
};

export type ManagerRecord = {
  /** Rollouts they owned that came out. */
  releasesRun: number;
  /** Different artists across those rollouts. */
  artistsManaged: number;
  /** Different artists with a rollout still open, or one that came out in the
   *  last 90 days. Never more than artistsManaged plus the artists still in
   *  their first rollout. */
  artistsActive: number;
};

export const EMPTY_MANAGER_RECORD: ManagerRecord = {
  releasesRun: 0,
  artistsManaged: 0,
  artistsActive: 0,
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The one line a manager's card leads with (spec, section 4: "releases run,
 * artists managed, how many still active"). Null for somebody with nothing to
 * show, so a card draws no line at all rather than three zeros that read as a
 * judgement. Plain words, and "rollouts" because that is what the product calls
 * the thing a manager runs.
 */
export function describeManagerRecord(record: ManagerRecord | null | undefined): string | null {
  if (!record) return null;
  if (record.releasesRun <= 0 && record.artistsManaged <= 0 && record.artistsActive <= 0) return null;

  const parts = [
    plural(record.releasesRun, 'rollout run', 'rollouts run'),
    plural(record.artistsManaged, 'artist managed', 'artists managed'),
  ];
  if (record.artistsActive > 0) parts.push(`${record.artistsActive} still active`);
  return parts.join(' · ');
}

export function isRolloutDelivered(row: ManagerRolloutRow, now: Date): boolean {
  return isRecapEligible(
    // The stored status is ignored here: see the header.
    { releaseDate: row.releaseDate, status: 'draft' },
    { totalTasks: row.totalTasks, allTasksDone: row.totalTasks > 0 && row.allTasksDone },
    now
  );
}

export function buildManagerRecord(
  rollouts: readonly ManagerRolloutRow[],
  now: Date = new Date()
): ManagerRecord {
  const managed = new Set<string>();
  const active = new Set<string>();
  let run = 0;

  for (const rollout of rollouts) {
    if (rollout.isTest) continue;

    const delivered = isRolloutDelivered(rollout, now);
    const archived = rollout.status === 'archived';

    if (delivered) {
      run += 1;
      if (rollout.artistId) managed.add(rollout.artistId);
      // Still active: it came out recently enough to be this manager's current
      // work. An older one is history, however good.
      if (rollout.artistId && wentLiveInWindow(rollout.releaseDate, now, RISING_WINDOW_DAYS)) {
        active.add(rollout.artistId);
      }
      continue;
    }

    // Open work. An archived rollout that never came out is neither run nor
    // active: it is a draft somebody put away.
    if (!archived && rollout.artistId) active.add(rollout.artistId);
  }

  return { releasesRun: run, artistsManaged: managed.size, artistsActive: active.size };
}
