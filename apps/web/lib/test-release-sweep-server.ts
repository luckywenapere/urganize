import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyReleaseReality, isPlaceholderTitle, isTouchedTask, TEST_AFTER_DAYS } from './release-reality';
import {
  clearTestReleaseBySweep,
  readTestRelease,
  readTestReleaseAuto,
  readTestReleaseDismissed,
  writeTestReleaseBySweep,
} from './test-release';

// The daily sweep that tags test rollouts on its own (#1442, founder, 2026-11-28:
// "we need to automatically tag the test rollouts").
//
// A passenger on /api/cron/due-date-notifications, like every other daily job:
// the Vercel plan allows two cron slots and both are taken.
//
// It tags a rollout only when lib/release-reality.ts reads it as a test: at
// least a week old, nobody has worked on any of its activities, and it has a
// placeholder name or no release date. It never touches a rollout somebody has
// said is real (test_release_dismissed), and never lifts a tag a PERSON set.
// It does lift its OWN tag (test_release_auto) once the rollout reads as real
// (a name, a date and work done), so a slow start that turned into a real
// rollout does not stay a test for ever.
//
// The tag is the same marker "Try a test release" sets, so the rollout gets the
// Test pill, the test banner (with Delete and the undo) and drops out of the
// counts that already leave tests out. test_release_auto records that the sweep,
// not a person, set it.
//
// Never throws: a failed read or write is logged and the cron carries on.

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;
const MAX_ROWS = 20000;
// Small, and paged below: PostgREST returns at most 1,000 rows a request and a
// playbook rollout has 64 to 113 activities, so a big chunk silently cuts off
// activities and makes worked-on rollouts look untouched.
const TASK_CHUNK = 20;
const TASK_PAGE = 1000;
/** A ceiling on writes per run, so one bad rule cannot tag the whole catalogue in a morning. */
export const MAX_TAGS_PER_RUN = 200;

type ReleaseRow = {
  id: string;
  title: string | null;
  release_date: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type TestReleaseSweepResult = {
  checked: number;
  tagged: number;
  /** Automatic tags lifted because the rollout now reads as real. */
  cleared: number;
  failed: number;
  error?: string;
};

export async function runTestReleaseSweep(
  client: SupabaseClient,
  now: Date = new Date()
): Promise<TestReleaseSweepResult> {
  const result: TestReleaseSweepResult = { checked: 0, tagged: 0, cleared: 0, failed: 0 };
  try {
    const olderThan = new Date(now.getTime() - TEST_AFTER_DAYS * DAY_MS).toISOString();

    // Rollouts old enough to judge, not deleted.
    const rows: ReleaseRow[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await client
        .from('releases')
        .select('id, title, release_date, created_at, metadata')
        .is('deleted_at', null)
        .lte('created_at', olderThan)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        result.error = `could not read rollouts: ${error.message}`;
        console.error('[test-release-sweep]', result.error);
        return result;
      }
      rows.push(...((data ?? []) as ReleaseRow[]));
      if ((data ?? []).length < PAGE) break;
    }

    // Only rollouts that could be a test: not already tagged, not said to be
    // real, and missing a real name or a date. Plus every rollout the sweep
    // tagged itself, to see whether it has turned real since.
    const candidates = rows.filter(
      (row) =>
        !readTestRelease(row.metadata) &&
        !readTestReleaseDismissed(row.metadata) &&
        (isPlaceholderTitle(row.title) || !row.release_date)
    );
    const autoTagged = rows.filter((row) => readTestRelease(row.metadata) && readTestReleaseAuto(row.metadata));
    result.checked = candidates.length + autoTagged.length;
    if (result.checked === 0) return result;
    const toRead = [...candidates, ...autoTagged];

    const touched = new Map<string, number>();
    for (let index = 0; index < toRead.length; index += TASK_CHUNK) {
      const ids = toRead.slice(index, index + TASK_CHUNK).map((row) => row.id);
      for (let from = 0; ; from += TASK_PAGE) {
        const { data, error } = await client
          .from('tasks')
          .select('id, release_id, status, created_at, updated_at')
          .in('release_id', ids)
          .order('id', { ascending: true })
          .range(from, from + TASK_PAGE - 1);
        if (error) {
          // Without the task read we cannot tell untouched from worked on, so we
          // change nothing rather than guess.
          result.error = `could not read activities: ${error.message}`;
          console.error('[test-release-sweep]', result.error);
          return result;
        }
        const page = (data ?? []) as Array<Record<string, unknown>>;
        for (const task of page) {
          const releaseId = typeof task.release_id === 'string' ? task.release_id : null;
          if (!releaseId) continue;
          const worked = isTouchedTask({
            status: typeof task.status === 'string' ? task.status : null,
            createdAt: typeof task.created_at === 'string' ? task.created_at : null,
            updatedAt: typeof task.updated_at === 'string' ? task.updated_at : null,
          });
          if (worked) touched.set(releaseId, (touched.get(releaseId) ?? 0) + 1);
        }
        if (page.length < TASK_PAGE) break;
      }
    }

    const readsAs = (row: ReleaseRow) =>
      classifyReleaseReality(
        {
          isTest: false,
          title: row.title,
          releaseDate: row.release_date,
          createdAt: row.created_at,
          touchedCount: touched.get(row.id) ?? 0,
        },
        now
      );

    for (const row of candidates) {
      if (result.tagged >= MAX_TAGS_PER_RUN) break;
      if (readsAs(row) !== 'test') continue;
      // Only if nobody tagged it or said it is real since we read it: an
      // "It's real, undo" during the run must not be overwritten.
      const { data, error } = await client
        .from('releases')
        .update({ metadata: writeTestReleaseBySweep(row.metadata) })
        .eq('id', row.id)
        .is('metadata->>test_release', null)
        .is('metadata->>test_release_dismissed', null)
        .select('id');
      if (error) {
        result.failed += 1;
        console.error('[test-release-sweep] could not tag', row.id, error.message);
      } else if ((data ?? []).length > 0) {
        result.tagged += 1;
      }
    }

    for (const row of autoTagged) {
      if (readsAs(row) !== 'real') continue;
      const { data, error } = await client
        .from('releases')
        .update({ metadata: clearTestReleaseBySweep(row.metadata) })
        .eq('id', row.id)
        .eq('metadata->>test_release_auto', 'true')
        .select('id');
      if (error) {
        result.failed += 1;
        console.error('[test-release-sweep] could not lift the tag on', row.id, error.message);
      } else if ((data ?? []).length > 0) {
        result.cleared += 1;
      }
    }
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'unknown error';
    console.error('[test-release-sweep]', result.error);
    return result;
  }
}
