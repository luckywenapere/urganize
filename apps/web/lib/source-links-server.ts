import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterResponse } from './after-response';
import { buildSourceLinkEventRow, type SourceLinkEventKind, type SourceLinkEventRow } from './source-links';

// Server half of the short links (2026-11-27, #1409): one row in
// public.source_link_events for a tap and for a sign-up, so
// /admin/source-links has something to read. PostHog still gets the events
// (the two routes send them); this is the copy we can count ourselves.
//
// COUNTS ONLY. A tap row is the link and the time. A sign-up row adds the new
// account, nothing else. No IP, no user agent.
//
// NEVER THROWS and never delays the reply (afterResponse). Before the
// migration is applied the insert fails and is logged; the redirect and the
// sign-up are untouched. Missing a data point costs a number; failing a
// redirect because of it would cost a visitor.

export const SOURCE_LINK_EVENTS_TABLE = 'source_link_events';

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function insertRow(row: SourceLinkEventRow): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const { error } = await admin.from(SOURCE_LINK_EVENTS_TABLE).insert(row);
  // 23505: the one-sign-up-per-account index. Already counted, which is fine.
  if (error && error.code !== '23505') {
    console.warn(`[source-links] could not record ${row.kind}:`, error.message);
  }
}

/** One row for the admin page, after the reply. */
export function recordSourceLinkEvent(
  label: string,
  input: { kind: SourceLinkEventKind; slug: unknown; userId?: string | null }
): void {
  const row = buildSourceLinkEventRow(input);
  if (!row) return;
  afterResponse(label, () => insertRow(row));
}
