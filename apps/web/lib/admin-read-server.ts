import type { SupabaseClient } from '@supabase/supabase-js';

// Paged reads shared by the internal admin numbers: the company scoreboard
// (lib/scoreboard-server.ts) and the usage dashboard (lib/usage-metrics-server.ts).
// Moved here from scoreboard-server.ts on 2026-10-07 so the two cannot drift
// apart on what "a person did something" means. Service-role only.
//
// WHY EVERYTHING IS PAGED. PostgREST caps a response at 1,000 rows by default,
// and a plain read silently returns the first 1,000 (the trap the Growth page
// recorded for sign-up counts). Every read walks pages until a short one comes
// back or its cap is reached, and a read that hits its cap says so.
//
// WHERE ACTIVITY COMES FROM. Only tables that record WHO did something and
// WHEN. Measured 2026-10-02: task changes were recorded nowhere until the task
// update route began writing task_activity the same day, so activity from
// before then undercounts task edits and completions. activity_logs is
// deliberately absent: nothing writes it.

export const PAGE_SIZE = 1000;

export type AdminReadSource = {
  table: string;
  rows: number;
  status: 'ok' | 'missing' | 'error';
  truncated: boolean;
  message?: string;
};

export type Row = Record<string, unknown>;

export type PageQuery = (from: number, to: number) => PromiseLike<{
  data: unknown[] | null;
  error: { message: string; code?: string } | null;
}>;

/** A table or column that does not exist on this database. Reported, never
 *  thrown: one missing optional table must not blank a page. */
export function isMissing(error: { message: string; code?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    /does not exist|could not find/i.test(error.message)
  );
}

export async function readAll(
  table: string,
  query: PageQuery,
  cap: number
): Promise<{ rows: Row[]; source: AdminReadSource }> {
  const rows: Row[] = [];
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap) - 1;
    const { data, error } = await query(from, to);
    if (error) {
      return {
        rows,
        source: {
          table,
          rows: rows.length,
          status: isMissing(error) ? 'missing' : 'error',
          truncated: false,
          message: error.message,
        },
      };
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < to - from + 1) {
      return { rows, source: { table, rows: rows.length, status: 'ok', truncated: false } };
    }
  }
  return { rows, source: { table, rows: rows.length, status: 'ok', truncated: true } };
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** One activity source: a table, the column naming who acted, the column
 *  saying when, any extra filter, and what it means in plain words. */
export type ActivitySource = {
  table: string;
  actor: string;
  at: string;
  /** Only rows whose `type` is one of these (billing_events). */
  types?: string[];
  /** What the person did, for the usage dashboard's "last thing" column. */
  label: string;
};

export const ACTIVITY_SOURCES: ActivitySource[] = [
  { table: 'task_activity', actor: 'actor_id', at: 'created_at', label: 'updated an activity' },
  { table: 'task_comments', actor: 'user_id', at: 'created_at', label: 'commented' },
  { table: 'task_attachments', actor: 'user_id', at: 'created_at', label: 'attached a file' },
  { table: 'tasks', actor: 'created_by', at: 'created_at', label: 'added an activity' },
  { table: 'task_outcomes', actor: 'created_by', at: 'created_at', label: 'said how an activity went' },
  { table: 'notifications', actor: 'actor_id', at: 'created_at', label: 'assigned or updated work' },
  { table: 'assets', actor: 'uploaded_by', at: 'created_at', label: 'uploaded a file' },
  { table: 'release_messages', actor: 'user_id', at: 'created_at', label: 'posted in a rollout chat' },
  { table: 'releases', actor: 'owner_user_id', at: 'created_at', label: 'created a rollout' },
  { table: 'notes', actor: 'owner_user_id', at: 'updated_at', label: 'wrote a note' },
  { table: 'urgans_actions', actor: 'actor_user_id', at: 'created_at', label: 'ran an UrgAns action' },
  { table: 'urgans_conversations', actor: 'owner_user_id', at: 'last_message_at', label: 'chatted with UrgAns' },
  {
    table: 'billing_events',
    actor: 'actor_user_id',
    at: 'created_at',
    // Only the events a member caused by using the product. The table also
    // holds paywall hits and the founder's own admin actions.
    types: ['urgans_action', 'urgans_embedded_action', 'urgans_voice_transcription'],
    label: 'used UrgAns',
  },
  { table: 'playlist_pitches', actor: 'created_by', at: 'created_at', label: 'sent a pitch' },
  { table: 'press_kit_section_versions', actor: 'saved_by', at: 'created_at', label: 'edited a press kit' },
  { table: 'team_brief_sections', actor: 'updated_by', at: 'updated_at', label: 'edited the team brief' },
  { table: 'release_epk_fields', actor: 'updated_by', at: 'updated_at', label: 'edited a pitch kit' },
  { table: 'work_requests', actor: 'sender_user_id', at: 'created_at', label: 'sent a work request' },
];

const ACTIVITY_CAP = 20_000;

export type LatestEvent = { at: number; label: string };

/** Every activity time per person since `sinceIso`, plus each person's most
 *  recent one with what it was. */
export async function readActivity(
  client: SupabaseClient,
  sinceIso: string
): Promise<{
  activity: Map<string, number[]>;
  latest: Map<string, LatestEvent>;
  sources: AdminReadSource[];
  truncated: boolean;
}> {
  const activity = new Map<string, number[]>();
  const latest = new Map<string, LatestEvent>();
  const results = await Promise.all(
    ACTIVITY_SOURCES.map((source) =>
      readAll(
        source.table,
        (from, to) => {
          let query = client
            .from(source.table)
            .select(`${source.actor}, ${source.at}`)
            .gte(source.at, sinceIso)
            .not(source.actor, 'is', null);
          if (source.types) query = query.in('type', source.types);
          return query.order(source.at, { ascending: false }).range(from, to);
        },
        ACTIVITY_CAP
      )
    )
  );

  let truncated = false;
  const sources: AdminReadSource[] = [];
  results.forEach((result, index) => {
    const def = ACTIVITY_SOURCES[index];
    sources.push(result.source);
    if (result.source.truncated) truncated = true;
    for (const row of result.rows) {
      const userId = str(row[def.actor]);
      const at = str(row[def.at]);
      if (!userId || !at) continue;
      const when = Date.parse(at);
      if (!Number.isFinite(when)) continue;
      const list = activity.get(userId) ?? [];
      list.push(when);
      activity.set(userId, list);
      const current = latest.get(userId);
      if (!current || when > current.at) latest.set(userId, { at: when, label: def.label });
    }
  });

  return { activity, latest, sources, truncated };
}
