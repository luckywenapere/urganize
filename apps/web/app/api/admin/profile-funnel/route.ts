import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { internalAccountEmails, verifyAdmin } from '../_shared';
import { PROFILE_FUNNEL_WINDOW_DAYS, buildProfileFunnel } from '@/lib/admin-profile-funnel';

// GET /api/admin/profile-funnel (2026-10-11). The profile growth loop, last 30
// days: credits, unclaimed profiles, claim emails, claimed, published, views,
// CTA taps, sign-ups. ADMIN_EMAILS only (verifyAdmin). Read only: every query
// is a select. Our own accounts are left out (internalAccountEmails, the list
// every admin page uses); the rules are in lib/admin-profile-funnel.ts.
//
// Each read is allowed to fail on its own. A table that cannot be read gives
// an empty list, except profile_growth_events, which gives null so the page
// says "Not tracked" (the migration may not be applied yet).

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_LIMIT = 10000;

type Rows<T> = { data: T[] | null; error: unknown };

async function rows<T>(query: PromiseLike<Rows<T>>): Promise<T[] | null> {
  try {
    const { data, error } = await query;
    return error ? null : (data ?? []);
  } catch {
    return null;
  }
}

async function internalUserIds(db: SupabaseClient): Promise<Set<string>> {
  const internal = internalAccountEmails();
  const emails = [...internal];
  // Listed addresses, plus any plus-alias or @urganize.app account, which the
  // set's own rule recognises (lib/internal-accounts.ts).
  const [listed, aliased] = await Promise.all([
    emails.length
      ? rows<{ id: string; email: string | null }>(db.from('profiles').select('id, email').in('email', emails).limit(500))
      : Promise.resolve([] as { id: string; email: string | null }[]),
    rows<{ id: string; email: string | null }>(
      db.from('profiles').select('id, email').or('email.ilike.%+%,email.ilike.%@urganize.app').limit(2000)
    ),
  ]);
  const ids = new Set<string>();
  for (const row of [...(listed ?? []), ...(aliased ?? [])]) {
    if (row.email && internal.has(row.email)) ids.add(row.id);
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;
  const db = adminResult.supabaseAdmin;

  const now = Date.now();
  const since = new Date(now - PROFILE_FUNNEL_WINDOW_DAYS * DAY_MS).toISOString();

  const [internal, credits, unclaimed, invitesSent, invitesMade, claimed, growthEvents] = await Promise.all([
    internalUserIds(db),
    rows<{ owner_user_id: string | null; created_at: string | null }>(
      db.from('release_credit_submissions').select('owner_user_id, created_at').gte('created_at', since).limit(ROW_LIMIT)
    ),
    rows<{ created_at: string | null; created_by_workspace_id: string | null }>(
      db
        .from('person_profiles')
        .select('created_at, created_by_workspace_id')
        .eq('status', 'unclaimed')
        .gte('created_at', since)
        .limit(ROW_LIMIT)
    ),
    rows<{ channel: string | null; sent_at: string | null; created_at: string | null; created_by: string | null }>(
      db
        .from('person_claim_invites')
        .select('channel, sent_at, created_at, created_by')
        .eq('channel', 'email')
        .gte('sent_at', since)
        .limit(ROW_LIMIT)
    ),
    rows<{ channel: string | null; sent_at: string | null; created_at: string | null; created_by: string | null }>(
      db
        .from('person_claim_invites')
        .select('channel, sent_at, created_at, created_by')
        .eq('channel', 'link')
        .gte('created_at', since)
        .limit(ROW_LIMIT)
    ),
    rows<{ user_id: string | null; claimed_at: string | null; visibility: string | null }>(
      db
        .from('person_profiles')
        .select('user_id, claimed_at, visibility')
        .eq('status', 'claimed')
        .gte('claimed_at', since)
        .limit(ROW_LIMIT)
    ),
    rows<{ kind: string; person_id: string | null; user_id: string | null; created_at: string | null }>(
      db.from('profile_growth_events').select('kind, person_id, user_id, created_at').gte('created_at', since).limit(50000)
    ),
  ]);

  // Owners of the teams that made unclaimed profiles, and of the pages that
  // were viewed, so our own can be left out.
  const workspaceIds = [
    ...new Set((unclaimed ?? []).map((row) => row.created_by_workspace_id).filter((id): id is string => Boolean(id))),
  ];
  const personIds = [
    ...new Set((growthEvents ?? []).map((row) => row.person_id).filter((id): id is string => Boolean(id))),
  ];
  const workspaceOwners = new Map<string, string>();
  const personOwners = new Map<string, string>();
  for (let i = 0; i < workspaceIds.length; i += 200) {
    const chunk = await rows<{ id: string; owner_id: string }>(
      db.from('workspaces').select('id, owner_id').in('id', workspaceIds.slice(i, i + 200))
    );
    for (const row of chunk ?? []) workspaceOwners.set(row.id, row.owner_id);
  }
  for (let i = 0; i < personIds.length; i += 200) {
    const chunk = await rows<{ id: string; user_id: string | null }>(
      db.from('person_profiles').select('id, user_id').in('id', personIds.slice(i, i + 200))
    );
    for (const row of chunk ?? []) if (row.user_id) personOwners.set(row.id, row.user_id);
  }

  const funnel = buildProfileFunnel({
    now,
    internalUserIds: internal,
    workspaceOwners,
    personOwners,
    credits: credits ?? [],
    unclaimedProfiles: unclaimed ?? [],
    invites: [...(invitesSent ?? []), ...(invitesMade ?? [])],
    claimedProfiles: claimed ?? [],
    growthEvents,
  });

  return NextResponse.json(
    {
      ...funnel,
      notRead: {
        credits: credits === null,
        unclaimedProfiles: unclaimed === null,
        invites: invitesSent === null,
        claimed: claimed === null,
        growthEvents: growthEvents === null,
      },
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
