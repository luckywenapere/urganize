import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RECAP_STAT_LABELS,
  formatRecapNumber,
  parseReleaseDate,
  pluralize,
} from './recap-copy';

// Stat gathering + selection for the release recap card.
//
// Selection rule the whole feature hangs on: a stat is only ever rendered when
// it has something to celebrate. Nothing on the card may read as zero, empty or
// "1 person on the team", because a recap poster that admits it has no numbers
// is worse than a recap poster with fewer numbers.

export type RecapStatLine = {
  key: string;
  value: string;
  label: string;
};

export type RecapRawStats = {
  tasksCompleted: number;
  /** Null when the release has no tasks at all, so there is no span to measure. */
  daysOfWork: number | null;
  teamSize: number;
  /** Null (not 0) means the pitches table is absent. Absent and empty differ. */
  pitchesSent: number | null;
  pitchAdds: number | null;
  /** Carried for the eligibility check, which would otherwise re-query tasks. */
  totalTasks: number;
  allTasksDone: boolean;
};

type TaskRow = {
  id?: unknown;
  status?: unknown;
  created_at?: unknown;
  assigned_to_user_id?: unknown;
  assigned_to?: unknown;
};

const TASK_COLUMNS = 'id,status,created_at,assigned_to_user_id,assigned_to';

const MS_PER_DAY = 86_400_000;

/**
 * PostgREST reports a missing table as 42P01, but the message wording has
 * changed across versions, so match both. A missing column is 42703.
 */
function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the table/i.test(error.message || '');
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message || '');
}

// The playlist pitching feature's table. It is owned by a separate feature and
// gated by its own flag, so it may not be migrated in a given environment even
// though the recap is switched on.
export const PLAYLIST_PITCHES_TABLE = 'playlist_pitches';

// playlist_pitches.status is one of new | listened | added | passed. "added" is
// the win worth putting on a poster.
const PITCH_ADDED_STATUS = 'added';

/**
 * Playlist pitch stats come from a table this feature does not own. Every
 * failure mode degrades to "no pitch stats" rather than failing the recap: an
 * unmigrated or half-migrated neighbouring feature must never stop a manager
 * getting a card. Absent (null) and present-but-empty (0) are kept distinct so
 * the selector can tell "no pitching here" from "pitched nothing".
 */
export async function probePitchStats(
  client: SupabaseClient,
  releaseId: string
): Promise<{ pitchesSent: number | null; pitchAdds: number | null }> {
  const absent = { pitchesSent: null, pitchAdds: null };

  try {
    const { data, error } = await client
      .from(PLAYLIST_PITCHES_TABLE)
      .select('id,status')
      .eq('release_id', releaseId);

    if (error) {
      if (isMissingRelationError(error)) return absent;

      // The table exists but the status column has moved: still worth reporting
      // how many pitches went out, just not how many were added.
      if (isMissingColumnError(error)) {
        const { data: idsOnly, error: idsError } = await client
          .from(PLAYLIST_PITCHES_TABLE)
          .select('id')
          .eq('release_id', releaseId);
        if (idsError || !idsOnly) return absent;
        return { pitchesSent: idsOnly.length, pitchAdds: null };
      }

      console.error('[recap] pitch probe failed, omitting pitch stats', error);
      return absent;
    }

    if (!data) return absent;

    const rows = data as Array<{ status?: unknown }>;
    const adds = rows.filter((row) => String(row.status ?? '') === PITCH_ADDED_STATUS).length;
    return { pitchesSent: rows.length, pitchAdds: adds };
  } catch (error) {
    console.error('[recap] pitch probe threw, omitting pitch stats', error);
    return absent;
  }
}

/**
 * Resolve how many distinct people owned at least one task. Prefers the
 * canonical assigned_to_user_id and falls back to the legacy assigned_to
 * (a workspace_members row id) the same way the task read path does, so a
 * release worked before the column swap still counts its team correctly.
 */
async function resolveTeamSize(
  client: SupabaseClient,
  tasks: TaskRow[]
): Promise<number> {
  const userIds = new Set<string>();
  const legacyMemberIds = new Set<string>();

  for (const task of tasks) {
    const userId = task.assigned_to_user_id ? String(task.assigned_to_user_id) : '';
    if (userId) {
      userIds.add(userId);
      continue;
    }
    const memberId = task.assigned_to ? String(task.assigned_to) : '';
    if (memberId) legacyMemberIds.add(memberId);
  }

  if (legacyMemberIds.size > 0) {
    try {
      const { data, error } = await client
        .from('workspace_members')
        .select('id,user_id')
        .in('id', Array.from(legacyMemberIds));

      if (!error && data) {
        for (const row of data as Array<{ user_id?: unknown }>) {
          const userId = row.user_id ? String(row.user_id) : '';
          if (userId) userIds.add(userId);
        }
      }
    } catch (error) {
      // A failed lookup undercounts the team rather than breaking the recap.
      console.error('[recap] legacy assignee lookup failed', error);
    }
  }

  return userIds.size;
}

export async function gatherRecapStats(
  client: SupabaseClient,
  releaseId: string,
  releaseDate: string | null
): Promise<RecapRawStats> {
  const { data, error } = await client
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('release_id', releaseId);

  if (error) {
    throw new Error(error.message || 'Could not load tasks for the recap.');
  }

  const tasks = (data ?? []) as TaskRow[];

  // "Done" is status-based on purpose: tasks.completed_at is only written by
  // the service path, so the checkbox most managers use leaves it null.
  const tasksCompleted = tasks.filter((task) => String(task.status ?? '') === 'done').length;

  const [teamSize, pitchStats] = await Promise.all([
    resolveTeamSize(client, tasks),
    probePitchStats(client, releaseId),
  ]);

  return {
    tasksCompleted,
    daysOfWork: computeDaysOfWork(tasks, releaseDate),
    teamSize,
    ...pitchStats,
    totalTasks: tasks.length,
    allTasksDone: tasks.length > 0 && tasksCompleted === tasks.length,
  };
}

/**
 * The span from the first task created on the release to release day. A release
 * with no date is still in flight, so measure to today instead. Always at least
 * one day, so a same-day release never prints "0 days of work".
 */
export function computeDaysOfWork(
  tasks: Array<{ created_at?: unknown }>,
  releaseDate: string | null,
  now: Date = new Date()
): number | null {
  const createdTimes = tasks
    .map((task) => new Date(String(task.created_at ?? '')).getTime())
    .filter((time) => Number.isFinite(time));

  if (createdTimes.length === 0) return null;

  const start = Math.min(...createdTimes);
  const end = parseReleaseDate(releaseDate)?.getTime() ?? now.getTime();

  if (!Number.isFinite(end) || end < start) return 1;

  return Math.max(1, Math.round((end - start) / MS_PER_DAY));
}

/**
 * Pick the strongest available stats, in a fixed priority order, capped at five.
 * Anything that would render as zero, or a team of one, is dropped rather than
 * shown, so the card never carries a stat that deflates the moment.
 */
export function selectRecapStats(raw: RecapRawStats): RecapStatLine[] {
  const lines: RecapStatLine[] = [];

  if (raw.tasksCompleted >= 1) {
    lines.push({
      key: 'tasksCompleted',
      value: formatRecapNumber(raw.tasksCompleted),
      label: pluralize(
        raw.tasksCompleted,
        RECAP_STAT_LABELS.tasksCompletedSingular,
        RECAP_STAT_LABELS.tasksCompletedPlural
      ),
    });
  }

  if (raw.daysOfWork !== null && raw.daysOfWork >= 1) {
    lines.push({
      key: 'daysOfWork',
      value: formatRecapNumber(raw.daysOfWork),
      label: pluralize(
        raw.daysOfWork,
        RECAP_STAT_LABELS.daysOfWorkSingular,
        RECAP_STAT_LABELS.daysOfWorkPlural
      ),
    });
  }

  // A team of one is the solo manager. True, but not a stat worth printing.
  if (raw.teamSize >= 2) {
    lines.push({
      key: 'teamSize',
      value: formatRecapNumber(raw.teamSize),
      label: RECAP_STAT_LABELS.teamSize,
    });
  }

  if (raw.pitchesSent !== null && raw.pitchesSent >= 1) {
    lines.push({
      key: 'pitchesSent',
      value: formatRecapNumber(raw.pitchesSent),
      label: RECAP_STAT_LABELS.pitchesSent,
    });
  }

  if (raw.pitchAdds !== null && raw.pitchAdds >= 1) {
    lines.push({
      key: 'pitchAdds',
      value: formatRecapNumber(raw.pitchAdds),
      label: RECAP_STAT_LABELS.pitchAdds,
    });
  }

  return lines.slice(0, 5);
}
