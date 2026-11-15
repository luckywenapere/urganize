// Server side of the brief's daily question (#1314). The 8am job, the answer
// route and the Settings route all change profiles.brief_prefs through
// updateBriefPrefs, so none of them can undo another's save.
//
// The answer and Settings routes touch only the caller's own profile and their
// own brief, so they are open routes (getAuthenticatedUser), like the morning
// brief's own off switch: a team in read-only still gets a brief and can still
// answer its question.
//
// Imports stay light on purpose: only the pure brief modules, never the job.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeBriefPrefs, type BriefPrefs } from './brief-questions';
import { MORNING_BRIEFS_TABLE, sanitizeMorningBrief, type MorningBrief } from './morning-brief';

const MAX_ATTEMPTS = 4;

type Row = { brief_prefs?: unknown };

export async function readBriefPrefs(admin: SupabaseClient, userId: string): Promise<BriefPrefs | null> {
  const { data, error } = await admin.from('profiles').select('brief_prefs').eq('id', userId).maybeSingle();
  if (error) return null;
  return sanitizeBriefPrefs((data as Row | null)?.brief_prefs);
}

/**
 * Reads the prefs, asks `change` for the new ones, and saves them only if
 * nobody saved in between (the `rev` inside the object must still match).
 * When someone did, it reads again and asks `change` again, up to four times.
 * `change` returns prefs: null when there is nothing to save.
 */
export async function updateBriefPrefs<T>(
  admin: SupabaseClient,
  userId: string,
  change: (current: BriefPrefs) => { prefs: BriefPrefs | null; value: T }
): Promise<{ ok: true; prefs: BriefPrefs; value: T } | { ok: false }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await readBriefPrefs(admin, userId);
    if (!current) return { ok: false };
    const { prefs, value } = change(current);
    if (!prefs) return { ok: true, prefs: current, value };

    const next: BriefPrefs = { ...prefs, rev: (current.rev ?? 0) + 1 };
    let query = admin
      .from('profiles')
      .update({ brief_prefs: next, updated_at: new Date().toISOString() })
      .eq('id', userId);
    query = current.rev ? query.eq('brief_prefs->>rev', String(current.rev)) : query.is('brief_prefs->>rev', null);
    const { data, error } = await query.select('id');
    if (error) return { ok: false };
    if ((data ?? []).length > 0) return { ok: true, prefs: next, value };
    // Zero rows: someone saved in between. Read again.
  }
  return { ok: false };
}

/** The brief the server wrote for this person on `date`, or null. */
export async function readStoredBrief(admin: SupabaseClient, userId: string, date: string): Promise<MorningBrief | null> {
  const { data, error } = await admin
    .from(MORNING_BRIEFS_TABLE)
    .select('payload')
    .eq('user_id', userId)
    .eq('brief_date', date)
    .maybeSingle();
  if (error || !data) return null;
  return sanitizeMorningBrief((data as { payload?: unknown }).payload);
}
