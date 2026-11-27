// SERVER ONLY. The morning sweep behind the next-morning note to someone who
// stopped before adding their music (#1429). The rules and the words are pure
// in signup-nudge.ts. This reads who made an account yesterday and has not
// finished sign-up, and queues one row each in the email outbox; the outbox
// drain that runs right after it in the same cron sends them, inside the day's
// email limit, with the unsubscribe link and the log every other email gets.
// Queued twice is a no-op (the row's dedupe_key is the person). Never throws.

import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueOutboxRows } from './outbox-server';
import {
  buildSignupNudgeRow,
  shouldNudgeSignup,
  signupNudgeWindow,
  type SignupNudgeOutboxRow,
} from './signup-nudge';

/** A day's sign-ups are a handful; this is only a guard against a runaway read. */
const MAX_CANDIDATES = 300;

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  created_at: string | null;
  onboarding_completed: boolean | null;
};

export type SignupNudgeRunResult = { candidates: number; queued: number; skipped: number };

/** Who among these is invited to, or already in, a team somebody else owns. */
async function loadInSomeoneElsesTeam(admin: SupabaseClient, profiles: ProfileRow[]): Promise<Set<string>> {
  const found = new Set<string>();
  const ids = profiles.map((row) => row.id);
  const idByEmail = new Map<string, string>();
  for (const row of profiles) {
    const email = String(row.email || '').trim().toLowerCase();
    if (email) idByEmail.set(email, row.id);
  }
  const [byUser, byEmail] = await Promise.all([
    admin.from('workspace_members').select('workspace_id,user_id,email').in('user_id', ids).neq('status', 'removed'),
    idByEmail.size
      ? admin
          .from('workspace_members')
          .select('workspace_id,user_id,email')
          .in('email', Array.from(idByEmail.keys()))
          .neq('status', 'removed')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byUser.error || byEmail.error) throw byUser.error || byEmail.error;
  type MemberRow = { workspace_id: string | null; user_id: string | null; email: string | null };
  const memberships = [...((byUser.data ?? []) as MemberRow[]), ...((byEmail.data ?? []) as MemberRow[])];
  const workspaceIds = Array.from(new Set(memberships.map((row) => row.workspace_id).filter((id): id is string => Boolean(id))));
  if (!workspaceIds.length) return found;
  const workspaces = await admin.from('workspaces').select('id,owner_id').in('id', workspaceIds);
  if (workspaces.error) throw workspaces.error;
  const ownerOf = new Map(((workspaces.data ?? []) as Array<{ id: string; owner_id: string | null }>).map((row) => [row.id, row.owner_id]));
  for (const membership of memberships) {
    const person =
      (membership.user_id && ids.includes(membership.user_id) ? membership.user_id : null) ??
      idByEmail.get(String(membership.email || '').trim().toLowerCase()) ??
      null;
    if (!person || !membership.workspace_id) continue;
    if (ownerOf.get(membership.workspace_id) !== person) found.add(person);
  }
  return found;
}

export async function runSignupNudgeSweep(admin: SupabaseClient, now: Date = new Date()): Promise<SignupNudgeRunResult> {
  const result: SignupNudgeRunResult = { candidates: 0, queued: 0, skipped: 0 };
  try {
    const { from, to } = signupNudgeWindow(now);
    const read = await admin
      .from('profiles')
      .select('id,name,email,role,created_at,onboarding_completed')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .eq('onboarding_completed', false)
      .limit(MAX_CANDIDATES);
    if (read.error) {
      console.error('[signup-nudge] could not read yesterday\'s accounts', read.error.message);
      return result;
    }
    const profiles = (read.data ?? []) as ProfileRow[];
    result.candidates = profiles.length;
    if (!profiles.length) return result;

    const inTeam = await loadInSomeoneElsesTeam(admin, profiles);
    const rows: SignupNudgeOutboxRow[] = [];
    for (const profile of profiles) {
      const due = shouldNudgeSignup(
        {
          email: profile.email,
          role: profile.role,
          createdAt: profile.created_at,
          onboardingCompleted: profile.onboarding_completed === true,
          inSomeoneElsesTeam: inTeam.has(profile.id),
        },
        now
      );
      const row = due
        ? buildSignupNudgeRow({ userId: profile.id, email: profile.email || '', name: profile.name || '', now })
        : null;
      if (row) rows.push(row);
      else result.skipped += 1;
    }
    if (!rows.length) return result;

    const written = await enqueueOutboxRows(admin, rows);
    // Rows already queued on an earlier run are not written again, and count as skipped.
    result.queued = written ?? 0;
    result.skipped += rows.length - result.queued;
  } catch (error) {
    console.error('[signup-nudge] sweep failed', error instanceof Error ? error.message : error);
  }
  return result;
}
