import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { internalAccountEmails, verifyAdmin } from '../_shared';
import {
  buildSourceLinkStats,
  planFromTeamState,
  sourceLinkWeekStarts,
  type SourceLinkAccount,
  type SourceLinkPlan,
  type SourceLinkSignupRow,
  type SourceLinkTapCount,
} from '@/lib/admin-source-links';
import { resolveAdminTeamAccess } from '@/lib/admin-team-access';
import { SOURCE_LINKS, SOURCE_LINK_HOST } from '@/lib/source-links';
import { SOURCE_LINK_EVENTS_TABLE } from '@/lib/source-links-server';
import { readTestRelease } from '@/lib/test-release';

// GET /api/admin/source-links (2026-11-27, #1409). The short links
// (go.urganize.app/tt, /ig, /x ...): taps and sign-ups per link, this week
// against last week, and what the sign-ups went on to do. ADMIN_EMAILS only
// (verifyAdmin). Read only: every query is a select or a read-only function.
// Our own accounts are left out of sign-ups (internalAccountEmails, the list
// every admin page uses); the rules are in lib/admin-source-links.ts.
//
// TAPS ARE COUNTED IN THE DATABASE (source_link_tap_counts), never by reading
// rows here: the API returns 1,000 rows at most and taps pass that quickly.
// Sign-ups are few, so they are read as rows, a page at a time.
//
// Each read is allowed to fail on its own. Taps or sign-ups that cannot be
// read come back null and the page says "Not tracked" (the migration may not
// be applied yet); a failed read of what the sign-ups did next only costs
// those two columns.

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const MAX_SIGNUP_PAGES = 20;
const CHUNK = 100;
// Rollouts per chunk of accounts, kept small so one chunk stays under the
// 1,000 rows the API returns.
const ROLLOUT_CHUNK = 40;

type Rows<T> = { data: T[] | null; error: unknown };

async function rows<T>(query: PromiseLike<Rows<T>>): Promise<T[] | null> {
  try {
    const { data, error } = await query;
    return error ? null : (data ?? []);
  } catch {
    return null;
  }
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Every sign-up row, newest first. Null when the first page cannot be read. */
async function readSignups(db: SupabaseClient): Promise<SourceLinkSignupRow[] | null> {
  const all: SourceLinkSignupRow[] = [];
  for (let page = 0; page < MAX_SIGNUP_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const batch = await rows<SourceLinkSignupRow>(
      db
        .from(SOURCE_LINK_EVENTS_TABLE)
        .select('slug, user_id, created_at')
        .eq('kind', 'signup')
        .order('created_at', { ascending: false })
        // A second key, so two rows with the same time never swap between pages.
        .order('id', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
    );
    if (batch === null) return page === 0 ? null : all;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

type TapCountRow = {
  slug: string | null;
  total: number | string | null;
  this_week: number | string | null;
  last_week: number | string | null;
  first_at: string | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  artist_name: string | null;
  email: string | null;
  is_subscribed: boolean | null;
  paid_at: string | null;
};

type WorkspaceRow = {
  owner_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  comped_at: string | null;
  billing_plan: string | null;
  billing_locked_amount: number | null;
};

type SubscriptionRow = { user_id: string; status: string | null; expires_at: string | null };

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;
  const db = adminResult.supabaseAdmin;

  const now = Date.now();
  const weeks = sourceLinkWeekStarts(now);

  const [tapRows, signups] = await Promise.all([
    rows<TapCountRow>(
      db.rpc('source_link_tap_counts', {
        p_this_week: new Date(weeks.thisWeek).toISOString(),
        p_last_week: new Date(weeks.lastWeek).toISOString(),
      })
    ),
    readSignups(db),
  ]);

  const taps: SourceLinkTapCount[] | null =
    tapRows === null
      ? null
      : tapRows.map((row) => ({
          slug: String(row.slug ?? ''),
          total: Number(row.total ?? 0),
          thisWeek: Number(row.this_week ?? 0),
          lastWeek: Number(row.last_week ?? 0),
          firstAt: row.first_at,
        }));

  const userIds = [...new Set((signups ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id)))];

  // Who they are, where their own team stands, and whether they made a rollout.
  const idChunks = chunks(userIds, CHUNK);
  const [profileChunks, workspaceChunks, subscriptionChunks, rolloutChunks] = await Promise.all([
    Promise.all(
      idChunks.map((ids) =>
        rows<ProfileRow>(
          db.from('profiles').select('id, name, artist_name, email, is_subscribed, paid_at').in('id', ids)
        )
      )
    ),
    Promise.all(
      idChunks.map((ids) =>
        rows<WorkspaceRow>(
          db
            .from('workspaces')
            .select('owner_id, trial_started_at, trial_ends_at, comped_at, billing_plan, billing_locked_amount')
            .in('owner_id', ids)
        )
      )
    ),
    Promise.all(
      idChunks.map((ids) =>
        rows<SubscriptionRow>(db.from('subscriptions').select('user_id, status, expires_at').in('user_id', ids))
      )
    ),
    Promise.all(
      chunks(userIds, ROLLOUT_CHUNK).map((ids) =>
        rows<{ owner_user_id: string | null; metadata: unknown }>(
          db.from('releases').select('owner_user_id, metadata').in('owner_user_id', ids).limit(PAGE_SIZE)
        )
      )
    ),
  ]);

  const internalEmails = internalAccountEmails();
  const internalUserIds = new Set<string>();
  const accounts = new Map<string, SourceLinkAccount>();
  const profiles = new Map<string, ProfileRow>();
  for (const row of profileChunks.flatMap((chunk) => chunk ?? [])) {
    profiles.set(row.id, row);
    accounts.set(row.id, { name: row.name || row.artist_name || null, email: row.email });
    if (row.email && internalEmails.has(row.email)) internalUserIds.add(row.id);
  }

  const subscriptions = new Map<string, SubscriptionRow>();
  for (const row of subscriptionChunks.flatMap((chunk) => chunk ?? [])) subscriptions.set(row.user_id, row);

  const today = new Date(now);
  const planByUserId = new Map<string, SourceLinkPlan>();
  for (const row of workspaceChunks.flatMap((chunk) => chunk ?? [])) {
    if (!row.owner_id) continue;
    const { resolution } = resolveAdminTeamAccess({
      workspace: row,
      profile: profiles.get(row.owner_id),
      subscription: subscriptions.get(row.owner_id),
      now: today,
    });
    planByUserId.set(row.owner_id, planFromTeamState(resolution.state));
  }

  const rolloutOwnerIds = new Set<string>();
  for (const row of rolloutChunks.flatMap((chunk) => chunk ?? [])) {
    if (!row.owner_user_id) continue;
    if (readTestRelease(row.metadata as Parameters<typeof readTestRelease>[0])) continue;
    rolloutOwnerIds.add(row.owner_user_id);
  }

  const stats = buildSourceLinkStats({
    now,
    links: SOURCE_LINKS,
    taps,
    signups,
    internalUserIds,
    accounts,
    rolloutOwnerIds,
    planByUserId,
  });

  return NextResponse.json(
    {
      ...stats,
      host: SOURCE_LINK_HOST,
      notRead: {
        taps: taps === null,
        signups: signups === null,
        // Who the sign-ups are. Our own accounts are told apart by the email on
        // the profile, so a failed read here can let our own sign-ups through.
        accounts: profileChunks.some((chunk) => chunk === null),
        // What the sign-ups did next: a failed read leaves those columns low.
        // A rollout chunk that came back full may have been cut short.
        after:
          workspaceChunks.some((chunk) => chunk === null) ||
          subscriptionChunks.some((chunk) => chunk === null) ||
          rolloutChunks.some((chunk) => chunk === null || chunk.length >= PAGE_SIZE),
      },
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
