import type { SupabaseClient } from '@supabase/supabase-js';
import { claimInviteState, removalUrgency, type ClaimInviteState, type RemovalUrgency } from './claim';
import { IN_LIST_CHUNK, inChunks } from './paged-rows';
import { isCreditSweepEnabled } from './claim-sweep-server';

// The admin's read of the claim flow: unclaimed profiles with where each
// invite stands, removal requests with how long they have left, and whether the
// daily profile creation is switched on. Read only; every action goes through
// the admin route.

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type UnclaimedProfileRow = {
  personId: string;
  name: string;
  slug: string | null;
  teamName: string;
  createdAt: string;
  credits: number;
  /** The newest claim link made for them, across every team. */
  invite: { state: ClaimInviteState; channel: 'email' | 'link' | null; sentAt: string | null } | null;
  removalRequested: boolean;
};

export type RemovalRequestRow = {
  requestId: string;
  personId: string;
  name: string;
  slug: string | null;
  contact: string;
  note: string | null;
  requestedAt: string;
  dueAt: string;
  urgency: RemovalUrgency;
};

export type ClaimsQueue = {
  sweepEnabled: boolean;
  unclaimed: UnclaimedProfileRow[];
  removals: RemovalRequestRow[];
  claimedLast30Days: number;
  /** A table that could not be read, by name. */
  unreadable: string[];
};

const LIST_LIMIT = 300;

export async function loadClaimsQueue(admin: SupabaseClient, now: Date = new Date()): Promise<ClaimsQueue> {
  const unreadable: string[] = [];

  const profileResult = await admin
    .from('person_profiles')
    .select('id, display_name, slug, created_at, created_by_workspace_id, removal_requested_at')
    .eq('status', 'unclaimed')
    .is('removed_at', null)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (profileResult.error) unreadable.push('person_profiles');
  const profiles = (profileResult.data || []).map(asRow);
  const ids = profiles.map((row) => text(row.id));

  const credits = new Map<string, number>();
  const invites = new Map<string, Record<string, unknown>>();
  for (const group of inChunks(ids, IN_LIST_CHUNK)) {
    const creditResult = await admin
      .from('release_credit_submissions')
      .select('person_id')
      .in('person_id', group)
      .eq('person_hidden', false);
    if (creditResult.error) unreadable.push('release_credit_submissions');
    for (const row of (creditResult.data || []).map(asRow)) {
      credits.set(text(row.person_id), (credits.get(text(row.person_id)) ?? 0) + 1);
    }
    const inviteResult = await admin
      .from('person_claim_invites')
      .select('person_id, channel, sent_at, used_at, revoked_at, expires_at, failed_attempts, created_at')
      .in('person_id', group)
      .order('created_at', { ascending: false });
    if (inviteResult.error) unreadable.push('person_claim_invites');
    for (const row of (inviteResult.data || []).map(asRow)) {
      if (!invites.has(text(row.person_id))) invites.set(text(row.person_id), row);
    }
  }

  const workspaceIds = [...new Set(profiles.map((row) => text(row.created_by_workspace_id)).filter(Boolean))];
  const teamNames = new Map<string, string>();
  for (const group of inChunks(workspaceIds, IN_LIST_CHUNK)) {
    const result = await admin.from('workspaces').select('id, name').in('id', group);
    for (const row of (result.data || []).map(asRow)) teamNames.set(text(row.id), text(row.name));
  }

  const unclaimed: UnclaimedProfileRow[] = profiles.map((row) => {
    const invite = invites.get(text(row.id));
    return {
      personId: text(row.id),
      name: text(row.display_name),
      slug: text(row.slug) || null,
      teamName: teamNames.get(text(row.created_by_workspace_id)) || '',
      createdAt: text(row.created_at),
      credits: credits.get(text(row.id)) ?? 0,
      invite: invite
        ? {
            state: claimInviteState(
              {
                usedAt: invite.used_at ? text(invite.used_at) : null,
                revokedAt: invite.revoked_at ? text(invite.revoked_at) : null,
                expiresAt: text(invite.expires_at),
                failedAttempts: Number(invite.failed_attempts) || 0,
              },
              now
            ),
            channel: invite.channel === 'email' || invite.channel === 'link' ? invite.channel : null,
            sentAt: invite.sent_at ? text(invite.sent_at) : null,
          }
        : null,
      removalRequested: Boolean(row.removal_requested_at),
    };
  });

  const removalResult = await admin
    .from('person_removal_requests')
    .select('id, person_id, contact, note, due_at, created_at')
    .eq('status', 'open')
    .order('due_at', { ascending: true })
    .limit(LIST_LIMIT);
  if (removalResult.error) unreadable.push('person_removal_requests');
  const removalRows = (removalResult.data || []).map(asRow);
  const personIds = removalRows.map((row) => text(row.person_id));
  const people = new Map<string, Record<string, unknown>>();
  for (const group of inChunks(personIds, IN_LIST_CHUNK)) {
    const result = await admin.from('person_profiles').select('id, display_name, slug').in('id', group);
    for (const row of (result.data || []).map(asRow)) people.set(text(row.id), row);
  }
  const removals: RemovalRequestRow[] = removalRows.map((row) => {
    const person = people.get(text(row.person_id)) ?? {};
    return {
      requestId: text(row.id),
      personId: text(row.person_id),
      name: text(person.display_name),
      slug: text(person.slug) || null,
      contact: text(row.contact),
      note: row.note ? text(row.note) : null,
      requestedAt: text(row.created_at),
      dueAt: text(row.due_at),
      urgency: removalUrgency(text(row.due_at), now),
    };
  });

  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const claimed = await admin
    .from('person_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'claimed')
    .gte('claimed_at', since);

  return {
    sweepEnabled: await isCreditSweepEnabled(admin),
    unclaimed,
    removals,
    claimedLast30Days: claimed.count ?? 0,
    unreadable: [...new Set(unreadable)],
  };
}
