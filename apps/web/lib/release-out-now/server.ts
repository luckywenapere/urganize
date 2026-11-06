// Release day, on its own (Nov 2026, #1090). Server only.
//
// emailTeamOutNow: once a rollout's smart link exists on release day (or the
// day after), each person on the artist's team gets one email that the song is
// out, with the link. Never for an old release, never twice.
//
// fillArtistRollouts: right after an artist is linked to streaming, every
// rollout of theirs already in Urganize that is out and has no UPC or ISRC is
// matched on the artist's own page; the codes and the smart link fill in.
//
// runOutNowSweep: the daily check (on the morning cron), for songs out today or
// yesterday: match the linked ones, then email any team not emailed yet.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { loadLiveSmartLinkUrl, loadSmartLinkFacts } from '@/lib/altlink/server';
import { lagosYmd } from '@/lib/altlink/rules';
import { isOutNowEmailDay } from '@/lib/code-finder/rules';

export const OUT_NOW_EMAILS_TABLE = 'release_out_now_emails';
/** A team bigger than this still gets the email; the rest of the day's mail must fit too. */
const MAX_RECIPIENTS = 25;
/** Rollouts matched per link, so one artist with a long history cannot run away with the request. */
const FILL_LIMIT = 25;
/** Time for one fill, inside the route's limit. */
const FILL_BUDGET_MS = 150_000;
/** The morning check shares its cron with other jobs. */
const SWEEP_BUDGET_MS = 20_000;

type Recipient = { userId: string; email: string; name: string };

/** Everyone on the artist's team who can see this artist, with an email. */
async function loadRecipients(admin: SupabaseClient, artistId: string): Promise<Recipient[]> {
  const { data: artist } = await admin.from('artists').select('workspace_id').eq('id', artistId).maybeSingle();
  const workspaceId = (artist as { workspace_id?: string | null } | null)?.workspace_id;
  if (!workspaceId) return [];
  const { data: members, error } = await admin
    .from('workspace_members')
    .select('user_id,email,artist_scope_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  const rows = ((members ?? []) as { user_id: string | null; email: string | null; artist_scope_id: string | null }[]).filter(
    (row) => row.user_id && (!row.artist_scope_id || row.artist_scope_id === artistId)
  );
  const ids = rows.map((row) => row.user_id as string);
  const profiles = new Map<string, { email: string; name: string }>();
  if (ids.length > 0) {
    const { data } = await admin.from('profiles').select('id,email,name').in('id', ids);
    for (const profile of (data ?? []) as { id: string; email: string | null; name: string | null }[]) {
      profiles.set(profile.id, { email: String(profile.email ?? '').trim(), name: String(profile.name ?? '').trim() });
    }
  }
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const row of rows) {
    const userId = row.user_id as string;
    const email = (profiles.get(userId)?.email || String(row.email ?? '').trim()).toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push({ userId, email, name: profiles.get(userId)?.name ?? '' });
  }
  return out.slice(0, MAX_RECIPIENTS);
}

export type OutNowEmailOutcome = 'sent' | 'already' | 'not_due' | 'no_link' | 'no_team' | 'not_configured';

/** Emails the team once, when the song is out and its smart link exists. */
export async function emailTeamOutNow(
  admin: SupabaseClient,
  releaseId: string,
  now = Date.now()
): Promise<OutNowEmailOutcome> {
  if (!isEmailConfigured()) return 'not_configured';
  const { data: existing } = await admin.from(OUT_NOW_EMAILS_TABLE).select('release_id').eq('release_id', releaseId).maybeSingle();
  if (existing) return 'already';
  const facts = await loadSmartLinkFacts(admin, releaseId);
  if (!facts || facts.isTest || facts.isArchived || !isOutNowEmailDay(facts.releaseDate, now)) return 'not_due';
  const url = await loadLiveSmartLinkUrl(admin, releaseId);
  if (!url) return 'no_link';

  const { data: release } = await admin.from('releases').select('artist_id').eq('id', releaseId).maybeSingle();
  const artistId = (release as { artist_id?: string | null } | null)?.artist_id;
  const recipients = artistId ? await loadRecipients(admin, artistId) : [];
  if (recipients.length === 0) return 'no_team';

  // The row is the claim: a second trigger at the same moment loses here.
  const claim = await admin
    .from(OUT_NOW_EMAILS_TABLE)
    .insert({ release_id: releaseId, smart_link_url: url, recipients: recipients.length });
  if (claim.error) {
    if (claim.error.code === '23505') return 'already';
    throw new Error(claim.error.message);
  }

  for (const recipient of recipients) {
    try {
      await sendEmail(admin, {
        templateId: 'release_out_now',
        to: recipient.email,
        recipientUserId: recipient.userId,
        trigger: 'release_out_now',
        props: {
          recipientName: recipient.name,
          releaseTitle: facts.title ?? '',
          artistName: facts.artistName ?? '',
          smartLinkUrl: url,
        },
        dedupeKey: `release_out_now:${releaseId}:${recipient.userId}`,
        idempotencyKey: `release_out_now:${releaseId}:${recipient.userId}`,
      });
    } catch (error) {
      console.error('[out-now] email failed', { releaseId, message: error instanceof Error ? error.message : 'error' });
    }
  }
  return 'sent';
}

/** Never throws: a failed email must not undo the link it is about. */
export async function emailTeamOutNowQuietly(admin: SupabaseClient, releaseId: string, now = Date.now()): Promise<void> {
  try {
    await emailTeamOutNow(admin, releaseId, now);
  } catch (error) {
    console.error('[out-now] could not email the team', { releaseId, message: error instanceof Error ? error.message : 'error' });
  }
}

/** Matches every out rollout of a just-linked artist that has no code yet. */
export async function fillArtistRollouts(
  admin: SupabaseClient,
  artistId: string,
  now = Date.now()
): Promise<{ checked: number; confirmed: number }> {
  const { findCodes } = await import('@/lib/code-finder/server');
  const { data: artist } = await admin.from('artists').select('workspace_id').eq('id', artistId).maybeSingle();
  const workspaceId = (artist as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  const { data, error } = await admin
    .from('releases')
    .select('id,owner_user_id')
    .eq('artist_id', artistId)
    .is('deleted_at', null)
    .lte('release_date', lagosYmd(now))
    .order('release_date', { ascending: false })
    .limit(FILL_LIMIT);
  if (error) throw new Error(error.message);
  let checked = 0;
  let confirmed = 0;
  const startedAt = Date.now();
  for (const row of (data ?? []) as { id: string; owner_user_id: string | null }[]) {
    // What is left is picked up by the next morning's check or the next open.
    if (Date.now() - startedAt > FILL_BUDGET_MS) break;
    try {
      const view = await findCodes(admin, row.id, { actorUserId: null, workspaceId, ownerUserId: row.owner_user_id, now });
      if (view.status !== 'has_code' && view.status !== 'not_out') checked += 1;
      if (view.status === 'confirmed') confirmed += 1;
    } catch (cause) {
      console.warn('[out-now] fill failed for a rollout', { releaseId: row.id, message: cause instanceof Error ? cause.message : 'error' });
    }
  }
  return { checked, confirmed };
}

/** The morning check: songs out today or yesterday. Never throws. */
export async function runOutNowSweep(admin: SupabaseClient, now = Date.now()): Promise<{ matched: number; emailed: number }> {
  const result = { matched: 0, emailed: 0 };
  try {
    const { findCodes } = await import('@/lib/code-finder/server');
    const today = lagosYmd(now);
    const yesterday = lagosYmd(now - 86_400_000);
    const { data, error } = await admin
      .from('releases')
      .select('id,owner_user_id,artist_id')
      .is('deleted_at', null)
      .gte('release_date', yesterday)
      .lte('release_date', today)
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; owner_user_id: string | null; artist_id: string | null }[];
    const artistIds = Array.from(new Set(rows.map((row) => row.artist_id).filter((id): id is string => Boolean(id))));
    const linked = new Map<string, string | null>();
    if (artistIds.length > 0) {
      const { data: artists } = await admin
        .from('artists')
        .select('id,workspace_id,deezer_artist_id,spotify_artist_id')
        .in('id', artistIds);
      for (const artist of (artists ?? []) as Record<string, string | null>[]) {
        if (artist.deezer_artist_id || artist.spotify_artist_id) linked.set(String(artist.id), artist.workspace_id ?? null);
      }
    }
    const startedAt = Date.now();
    for (const row of rows) {
      if (Date.now() - startedAt > SWEEP_BUDGET_MS) break;
      try {
        // Only a linked artist is matched without asking; the others wait for the team.
        if (row.artist_id && linked.has(row.artist_id)) {
          const view = await findCodes(admin, row.id, {
            actorUserId: null,
            workspaceId: linked.get(row.artist_id) ?? null,
            ownerUserId: row.owner_user_id,
            now,
          });
          if (view.status === 'confirmed') result.matched += 1;
        }
        if ((await emailTeamOutNow(admin, row.id, now)) === 'sent') result.emailed += 1;
      } catch (cause) {
        console.warn('[out-now] sweep failed for a rollout', { releaseId: row.id, message: cause instanceof Error ? cause.message : 'error' });
      }
    }
  } catch (error) {
    console.error('[out-now] sweep failed', error instanceof Error ? error.message : error);
  }
  return result;
}
