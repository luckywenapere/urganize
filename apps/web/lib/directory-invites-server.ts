import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, isEmailConfigured } from './email';
import { APP_URL } from './email/links';
import { buildIdentifiers } from './person-identity';
import { claimUrl } from './seeding';
import { mintClaimLink } from './seeding-server';
import { isMissingTableError } from './promo-channels';
import { afterResponse } from './after-response';
import { createServerPostHogClient, captureServerAnalyticsEvent, shutdownServerAnalytics } from './analytics/server';
import { createPostHogEvent } from './analytics/shared';
import { DIRECTORY_INVITES_TABLE } from './directory-invites-claim-server';
import {
  DAILY_LIMIT_MESSAGE,
  DIRECTORY_INVITE_DAILY_LIMIT,
  directoryInviteShareText,
  directoryInviteStatus,
  inviteLimitReached,
  roleWithArticle,
  type DirectoryInviteInput,
  type DirectoryInviteStatus,
} from './directory-invites';

// Directory referral invites, the inviter's side (2026-10-11, GitHub #834).
// The rules are in lib/directory-invites.ts; the invitee's side is the
// founder-seeding /welcome/{token} flow, which calls
// lib/directory-invites-claim-server.ts to keep this record current.
//
// An invite is three rows, made in this order so a failure leaves nothing
// half-made: a private, unclaimed person_profiles row (unless Urganize already
// knows them by that email), the directory_invites row, then the link
// (person_claim_invites, via seeding-server's mintClaimLink, the one place a
// welcome link is made). Then, only if asked, one email.
//
// NEVER THROWS. A missing directory_invites table (migration not applied)
// answers `not_ready`, and the Directory hides the invite row.

const PERSON_PROFILES = 'person_profiles';
const PERSON_IDENTIFIERS = 'person_identifiers';
const LIST_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export type DirectoryInviteView = {
  id: string;
  name: string;
  role: string;
  channel: 'email' | 'link';
  emailed: boolean;
  status: DirectoryInviteStatus;
  createdAt: string;
};

function toView(row: Row): DirectoryInviteView {
  return {
    id: text(row.id),
    name: text(row.invitee_name),
    role: text(row.role),
    channel: row.channel === 'email' ? 'email' : 'link',
    emailed: Boolean(row.email_sent_at),
    status: directoryInviteStatus({
      openedAt: textOrNull(row.opened_at),
      joinedAt: textOrNull(row.joined_at),
      publishedAt: textOrNull(row.published_at),
    }),
    createdAt: text(row.created_at),
  };
}

/** How many invites this person made in the last 24 hours. Null when unreadable;
 *  'missing' when the table is not there yet. */
async function countLastDay(
  admin: SupabaseClient,
  userId: string,
  now: Date
): Promise<number | null | 'missing'> {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const result = await admin
    .from(DIRECTORY_INVITES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('inviter_user_id', userId)
    .gte('created_at', since);
  if (result.error) return isMissingTableError(result.error) ? 'missing' : null;
  return typeof result.count === 'number' ? result.count : null;
}

export type DirectoryInviteList =
  | { ready: false }
  | { ready: true; invites: DirectoryInviteView[]; sentToday: number; dailyLimit: number };

/** The caller's own invites, newest first. Only ever their own rows. */
export async function listDirectoryInvites(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<DirectoryInviteList> {
  try {
    const result = await admin
      .from(DIRECTORY_INVITES_TABLE)
      .select('id, invitee_name, role, channel, email_sent_at, opened_at, joined_at, published_at, created_at')
      .eq('inviter_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (result.error) return { ready: false };
    const rows = (result.data || []).map(asRow);
    const since = now.getTime() - DAY_MS;
    const sentToday = rows.filter((row) => Date.parse(text(row.created_at)) > since).length;
    return { ready: true, invites: rows.map(toView), sentToday, dailyLimit: DIRECTORY_INVITE_DAILY_LIMIT };
  } catch {
    return { ready: false };
  }
}

type KnownPerson = { personId: string; status: string; removed: boolean };

async function findKnownPerson(admin: SupabaseClient, email: string): Promise<KnownPerson | null | 'error'> {
  const found = await admin
    .from(PERSON_IDENTIFIERS)
    .select('person_id')
    .eq('kind', 'email')
    .eq('value', email)
    .limit(1);
  if (found.error) return 'error';
  const personId = text(asRow((found.data || [])[0]).person_id);
  if (!personId) return null;
  const profile = await admin
    .from(PERSON_PROFILES)
    .select('id, status, removed_at, removal_requested_at')
    .eq('id', personId)
    .maybeSingle();
  if (profile.error) return 'error';
  if (!profile.data) return null;
  const row = asRow(profile.data);
  return { personId, status: text(row.status), removed: Boolean(row.removed_at || row.removal_requested_at) };
}

export type CreateInviteResult =
  | {
      ok: true;
      invite: DirectoryInviteView;
      url: string;
      shareText: string;
      emailed: boolean;
      /** Why an asked-for email did not go: the link still works. */
      emailProblem?: 'not_configured' | 'send_failed';
    }
  | { ok: false; status: number; error: string; reason?: 'not_ready' | 'limit' };

export async function createDirectoryInvite(
  admin: SupabaseClient,
  input: {
    inviter: { id: string; name: string | null };
    workspaceId: string | null;
    data: DirectoryInviteInput;
    now?: Date;
  }
): Promise<CreateInviteResult> {
  const now = input.now ?? new Date();
  const { data } = input;

  try {
    const count = await countLastDay(admin, input.inviter.id, now);
    if (count === 'missing') {
      return { ok: false, status: 503, error: 'Invites are coming soon.', reason: 'not_ready' };
    }
    if (inviteLimitReached(count)) {
      return {
        ok: false,
        status: count === null ? 500 : 429,
        error: count === null ? 'Could not send the invite. Try again.' : DAILY_LIMIT_MESSAGE,
        reason: count === null ? undefined : 'limit',
      };
    }

    // Somebody Urganize already knows by this email is never given a second
    // profile (the seeding rule). A claimed person is already in; somebody who
    // asked to be taken off is never asked again; an unclaimed page (from a
    // credit, or another manager's invite) is reused, and its earlier links keep
    // working.
    let personId = '';
    let createdProfile = false;
    if (data.email) {
      const known = await findKnownPerson(admin, data.email);
      if (known === 'error') return { ok: false, status: 500, error: 'Could not check this person. Try again.' };
      if (known) {
        if (known.removed) return { ok: false, status: 409, error: 'This person asked not to be listed.' };
        if (known.status === 'claimed') {
          return { ok: false, status: 409, error: 'They are already on Urganize. Search for them above.' };
        }
        personId = known.personId;
      }
    }

    if (!personId) {
      const created = await admin
        .from(PERSON_PROFILES)
        .insert({
          display_name: data.name,
          status: 'unclaimed',
          visibility: 'private',
          roles: [data.role],
        })
        .select('id')
        .single();
      if (created.error || !created.data) return { ok: false, status: 500, error: 'Could not make the invite. Try again.' };
      personId = text(asRow(created.data).id);
      createdProfile = true;
    }
    const undo = async () => {
      if (createdProfile) await admin.from(PERSON_PROFILES).delete().eq('id', personId);
    };

    if (createdProfile) {
      const identifiers = buildIdentifiers({ email: data.email });
      if (identifiers.length > 0) {
        const saved = await admin
          .from(PERSON_IDENTIFIERS)
          .insert(identifiers.map((identifier) => ({ person_id: personId, ...identifier })));
        if (saved.error) {
          await undo();
          return { ok: false, status: 500, error: 'Could not make the invite. Try again.' };
        }
      }
    }

    const recorded = await admin
      .from(DIRECTORY_INVITES_TABLE)
      .insert({
        inviter_user_id: input.inviter.id,
        workspace_id: input.workspaceId,
        person_id: personId,
        invitee_name: data.name,
        role: data.role,
        email: data.email,
        channel: data.send ? 'email' : 'link',
      })
      .select('id, invitee_name, role, channel, email_sent_at, opened_at, joined_at, published_at, created_at')
      .single();
    if (recorded.error || !recorded.data) {
      await undo();
      return isMissingTableError(recorded.error)
        ? { ok: false, status: 503, error: 'Invites are coming soon.', reason: 'not_ready' }
        : { ok: false, status: 500, error: 'Could not make the invite. Try again.' };
    }
    const inviteRow = asRow(recorded.data);
    const inviteId = text(inviteRow.id);

    const link = await mintClaimLink(admin, {
      personId,
      actorUserId: input.inviter.id,
      workspaceId: input.workspaceId,
      stampSeed: false,
      // Another manager's open link to the same unclaimed page keeps working.
      revokeEarlier: createdProfile,
      now,
    });
    if (!link.ok) {
      await admin.from(DIRECTORY_INVITES_TABLE).delete().eq('id', inviteId);
      await undo();
      return { ok: false, status: 500, error: 'Could not make the invite. Try again.' };
    }

    const url = claimUrl(APP_URL, link.token);
    const shareText = directoryInviteShareText({ name: data.name, role: data.role, url });

    let emailed = false;
    let emailProblem: 'not_configured' | 'send_failed' | undefined;
    if (data.send && data.email) {
      if (!isEmailConfigured()) {
        emailProblem = 'not_configured';
      } else {
        const inviterName = (input.inviter.name || '').trim();
        const sent = await sendEmail(admin, {
          templateId: 'directory_invite',
          to: data.email,
          props: {
            recipientName: data.name,
            inviterName,
            roleWithArticle: roleWithArticle(data.role),
            inviteUrl: url,
          },
          trigger: 'directory_invite_sent',
          actorUserId: input.inviter.id,
          fromLabel: inviterName ? `${inviterName} via Urganize` : undefined,
          idempotencyKey: `directory-invite:${inviteId}`,
        });
        if (sent.ok) {
          emailed = true;
          await admin.from(DIRECTORY_INVITES_TABLE).update({ email_sent_at: now.toISOString() }).eq('id', inviteId);
        } else {
          emailProblem = sent.skipped ? 'not_configured' : 'send_failed';
        }
      }
    }

    const inviterId = input.inviter.id;
    afterResponse('directory-invite-sent', async () => {
      const client = createServerPostHogClient();
      captureServerAnalyticsEvent(
        client,
        inviterId,
        createPostHogEvent('directory_invite_sent', { role: data.role, channel: data.send ? 'email' : 'link', emailed })
      );
      await shutdownServerAnalytics(client);
    });

    return {
      ok: true,
      invite: toView({ ...inviteRow, email_sent_at: emailed ? now.toISOString() : null }),
      url,
      shareText,
      emailed,
      ...(emailProblem ? { emailProblem } : {}),
    };
  } catch (error) {
    console.error('[directory-invites] create failed', error instanceof Error ? error.message : error);
    return { ok: false, status: 500, error: 'Could not make the invite. Try again.' };
  }
}
