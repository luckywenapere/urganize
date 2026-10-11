import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerPostHogClient, captureServerAnalyticsEvent, shutdownServerAnalytics } from './analytics/server';
import { createPostHogEvent } from './analytics/shared';
import { afterResponse } from './after-response';

// The invitee's side of a Directory referral invite (2026-10-11, GitHub #834).
//
// A Directory invite lands on the same /welcome/{token} page as a founder
// seeding link. lib/seeding-server.ts calls the three hooks below so the
// inviter's record (directory_invites) follows along: who invited them (shown
// on the page), when it was opened, when they joined and whether they
// published. A profile with no Directory invite finds no row and nothing
// changes, which is every founder-seeded profile.
//
// NEVER THROWS. Before the migration is applied every read fails and reads as
// "no invite"; the welcome page and the claim work exactly as before.

export const DIRECTORY_INVITES_TABLE = 'directory_invites';

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type InviteForPerson = { id: string; inviterUserId: string; inviterName: string | null; role: string };

/** The newest Directory invite behind this placeholder profile, if any. */
export async function loadDirectoryInviteForPerson(
  admin: SupabaseClient,
  personId: string
): Promise<InviteForPerson | null> {
  try {
    const found = await admin
      .from(DIRECTORY_INVITES_TABLE)
      .select('id, inviter_user_id, role')
      .eq('person_id', personId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (found.error || !found.data || found.data.length === 0) return null;
    const row = asRow(found.data[0]);
    const inviterUserId = text(row.inviter_user_id);
    let inviterName: string | null = null;
    if (inviterUserId) {
      const profile = await admin.from('profiles').select('name').eq('id', inviterUserId).maybeSingle();
      inviterName = text(asRow(profile.data).name).trim() || null;
    }
    return { id: text(row.id), inviterUserId, inviterName, role: text(row.role) };
  } catch {
    return null;
  }
}

function capture(label: string, inviterUserId: string, event: ReturnType<typeof createPostHogEvent>): void {
  if (!inviterUserId) return;
  afterResponse(label, async () => {
    const client = createServerPostHogClient();
    captureServerAnalyticsEvent(client, inviterUserId, event);
    await shutdownServerAnalytics(client);
  });
}

/**
 * The invitee's browser loaded the page. Stamped once per invite (conditional
 * update). Every invite pointing at this profile is stamped: two managers can
 * invite the same person, and both see it.
 */
export async function stampDirectoryInviteOpened(admin: SupabaseClient, personId: string, now: Date): Promise<void> {
  try {
    const updated = await admin
      .from(DIRECTORY_INVITES_TABLE)
      .update({ opened_at: now.toISOString() })
      .eq('person_id', personId)
      .is('opened_at', null)
      .select('id, inviter_user_id, role');
    if (updated.error) return;
    for (const row of (updated.data || []).map(asRow)) {
      capture(
        'directory-invite-opened',
        text(row.inviter_user_id),
        createPostHogEvent('directory_invite_opened', { role: text(row.role) })
      );
    }
  } catch {
    // Bookkeeping only.
  }
}

/**
 * They claimed the profile (an account now holds it). joined_at is stamped
 * once per invite; published_at the first time they also publish. Reported
 * against each inviter, once per invite.
 */
export async function stampDirectoryInviteJoined(
  admin: SupabaseClient,
  input: { personId: string; userId: string; published: boolean; now: Date }
): Promise<void> {
  const at = input.now.toISOString();
  try {
    const joined = await admin
      .from(DIRECTORY_INVITES_TABLE)
      .update({ joined_at: at, joined_user_id: input.userId })
      .eq('person_id', input.personId)
      .is('joined_at', null)
      .select('id, inviter_user_id, role');
    if (joined.error) return;
    for (const row of (joined.data || []).map(asRow)) {
      capture(
        'directory-invite-joined',
        text(row.inviter_user_id),
        createPostHogEvent('directory_invite_joined', { role: text(row.role), published: input.published })
      );
    }
    // Somebody who joined opened it, even if their browser never reported it.
    await admin
      .from(DIRECTORY_INVITES_TABLE)
      .update({ opened_at: at })
      .eq('person_id', input.personId)
      .is('opened_at', null);
    if (input.published) {
      await admin
        .from(DIRECTORY_INVITES_TABLE)
        .update({ published_at: at })
        .eq('person_id', input.personId)
        .is('published_at', null);
    }
  } catch {
    // Bookkeeping only.
  }
}
