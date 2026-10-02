import type { SupabaseClient } from '@supabase/supabase-js';
import { isRecapEligible } from './recap-eligibility';
import { isPitchKitEnabled, readKitSummaries, RELEASE_EPK_FIELDS_TABLE } from './release-epk-server';
import { planKitSnapshots, type KitSnapshot } from './release-epk-snapshot';

/**
 * Freezes each delivered release's copy of its artist's press kit.
 *
 * A passenger on /api/cron/due-date-notifications, for the reason the other
 * passengers give: both schedule slots are taken and the Hobby plan caps them
 * at one a day. It rides a sweep rather than hooking a write because a release
 * becomes delivered when its DATE passes, where no write happens at all (the
 * directory's delivery records are decided the same way for the same reason).
 *
 * The cost of a daily cadence is at most a day: a release delivered at noon can
 * still pick up an edit to the bio made before tonight's run. Accepted. The
 * alternative, snapshotting on read, would turn a GET into a write.
 *
 * Never throws, and does nothing while the pitch kit flag is off. Safe to run
 * twice, since a release that already has a copy is never touched.
 */

const RELEASES_TABLE = 'releases';
const TASKS_TABLE = 'tasks';
const KITS_TABLE = 'press_kits';

/** Same generous bounds the delivery sweep uses; a run that reaches one still
 *  makes progress and the next run continues, because frozen releases drop out. */
const RELEASE_SCAN_LIMIT = 2000;
const TASK_SCAN_LIMIT = 100000;
/** PostgREST puts `in(...)` in the URL, so ids go in small groups. */
const ID_CHUNK = 150;
/** One run writes at most this many, so a first run after a long gap cannot
 *  hold the cron open. The rest follow tomorrow. */
const WRITE_LIMIT = 200;

export type KitSnapshotSweepResult =
  | { skipped: true; reason: string }
  | { skipped: false; scanned: number; delivered: number; frozen: number; failed: number };

const chunk = <T,>(items: T[], size: number): T[][] => {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
};

export async function runKitSnapshotSweep(admin: SupabaseClient): Promise<KitSnapshotSweepResult> {
  if (!isPitchKitEnabled()) return { skipped: true, reason: 'flag_off' };

  try {
    const releaseResult = await admin
      .from(RELEASES_TABLE)
      .select('id, owner_user_id, artist_id, release_date, status')
      .order('created_at', { ascending: false })
      .limit(RELEASE_SCAN_LIMIT);
    if (releaseResult.error || !releaseResult.data) return { skipped: true, reason: 'read_failed' };
    const releases = releaseResult.data;
    if (releases.length === 0) return { skipped: false, scanned: 0, delivered: 0, frozen: 0, failed: 0 };

    // Task totals per release, for the "every activity done" clause of the
    // delivered rule. Two queries rather than a join, so a release with 113
    // activities cannot arrive with some of them cut off by the row limit.
    const totals = new Map<string, { total: number; done: number }>();
    for (const ids of chunk(releases.map((r) => String(r.id)), ID_CHUNK)) {
      const taskResult = await admin
        .from(TASKS_TABLE)
        .select('release_id, status')
        .in('release_id', ids)
        .limit(TASK_SCAN_LIMIT);
      if (taskResult.error) return { skipped: true, reason: 'read_failed' };
      for (const row of taskResult.data || []) {
        const id = String(row.release_id || '');
        const entry = totals.get(id) ?? { total: 0, done: 0 };
        entry.total += 1;
        if (row.status === 'done') entry.done += 1;
        totals.set(id, entry);
      }
    }

    const delivered = releases
      .filter((r) => {
        const t = totals.get(String(r.id)) ?? { total: 0, done: 0 };
        return isRecapEligible(
          { releaseDate: r.release_date ? String(r.release_date) : null, status: String(r.status || '') },
          { totalTasks: t.total, allTasksDone: t.total > 0 && t.done === t.total }
        );
      })
      .map((r) => ({
        id: String(r.id),
        ownerUserId: String(r.owner_user_id || ''),
        artistId: String(r.artist_id || ''),
      }))
      .filter((r) => r.ownerUserId);

    // Which of them already have a copy. An unreadable answer ends the run:
    // guessing "none" would re-freeze releases that were frozen long ago.
    const alreadySnapshotted = new Set<string>();
    for (const ids of chunk(delivered.map((r) => r.id), ID_CHUNK)) {
      const frozenResult = await admin
        .from(RELEASE_EPK_FIELDS_TABLE)
        .select('release_id')
        .in('release_id', ids)
        .not('kit_snapshot', 'is', null);
      if (frozenResult.error) return { skipped: true, reason: 'snapshot_column_missing' };
      for (const row of frozenResult.data || []) alreadySnapshotted.add(String(row.release_id));
    }

    const needing = delivered.filter((r) => !alreadySnapshotted.has(r.id) && r.artistId);
    const artistIds = [...new Set(needing.map((r) => r.artistId))];
    const kitsByArtist = new Map<string, KitSnapshot>();
    for (const ids of chunk(artistIds, ID_CHUNK)) {
      const kitResult = await admin
        .from(KITS_TABLE)
        .select('id,artist_id,slug,state,published_at')
        .in('artist_id', ids);
      if (kitResult.error) return { skipped: true, reason: 'read_failed' };
      const summaries = await readKitSummaries(
        admin,
        (kitResult.data || []) as Array<Record<string, unknown>>
      );
      for (const [artistId, summary] of summaries) kitsByArtist.set(artistId, summary);
    }

    const plan = planKitSnapshots({ delivered: needing, alreadySnapshotted, kitsByArtist }).slice(
      0,
      WRITE_LIMIT
    );

    let frozen = 0;
    let failed = 0;
    const takenAt = new Date().toISOString();
    for (const item of plan) {
      // Only these three columns are named, so an existing story and credits
      // are left exactly as they were. A release with no pitch kit row yet
      // gets one with the column defaults, which read as "automatic".
      const write = await admin.from(RELEASE_EPK_FIELDS_TABLE).upsert(
        {
          release_id: item.releaseId,
          owner_user_id: item.ownerUserId,
          kit_snapshot: item.snapshot,
          kit_snapshot_at: takenAt,
        },
        { onConflict: 'release_id' }
      );
      if (write.error) failed += 1;
      else frozen += 1;
    }

    return { skipped: false, scanned: releases.length, delivered: delivered.length, frozen, failed };
  } catch {
    return { skipped: true, reason: 'error' };
  }
}
