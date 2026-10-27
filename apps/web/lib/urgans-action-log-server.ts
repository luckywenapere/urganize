// The UrgAns action log, server half (SERVER-ONLY). See lib/urgans-action-log.ts
// for what the log is and docs/notes/2026-10-27-urgans-action-log.md for why.
//
// Two rules every caller can rely on:
// 1. Nothing here throws. A failed log write is reported and swallowed, so
//    logging can never undo or block the action it records.
// 2. Snapshots are best effort: an object type with no table here simply has
//    no before/after, and the row still records args and the result.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildActionLogRow, type LogObject, type UrgansActionLogInput } from './urgans-action-log';

export const URGANS_ACTION_LOG_TABLE = 'urgans_action_log';

/** Object types whose rows can be read for a before/after. */
const SNAPSHOT_TABLES: Record<string, string> = {
  task: 'tasks',
  release: 'releases',
  artist: 'artists',
  note: 'notes',
  press_kit: 'press_kits',
};

/** At most this many rows in one snapshot (complete_tasks takes a list). */
const MAX_SNAPSHOT_ROWS = 20;

/**
 * The current row(s) for a log object: one row as an object, several as an
 * array, null when there is no table for the type or nothing was found.
 */
export async function snapshotLogObject(
  admin: SupabaseClient,
  object: LogObject | null
): Promise<Record<string, unknown> | Record<string, unknown>[] | null> {
  if (!object) return null;
  const table = SNAPSHOT_TABLES[object.type];
  if (!table) return null;
  try {
    const ids = object.ids.slice(0, MAX_SNAPSHOT_ROWS);
    const { data, error } = await admin.from(table).select('*').in('id', ids);
    if (error || !data || data.length === 0) return null;
    const rows = data as Record<string, unknown>[];
    return object.ids.length === 1 ? rows[0] : rows;
  } catch (error) {
    console.error('[urgans-action-log] snapshot failed:', error);
    return null;
  }
}

/** Writes one log row. Never throws. */
export async function logUrgansAction(admin: SupabaseClient, input: UrgansActionLogInput): Promise<void> {
  try {
    const { error } = await admin.from(URGANS_ACTION_LOG_TABLE).insert(buildActionLogRow(input));
    if (error) console.error('[urgans-action-log] insert failed:', error.message);
  } catch (error) {
    console.error('[urgans-action-log] insert threw:', error);
  }
}
