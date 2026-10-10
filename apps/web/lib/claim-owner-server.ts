import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_URL } from './email/links';
import { isEmailConfigured, sendEmail } from './email';
import { firstNameFrom } from './email/format';
import { claimInviteState, type ClaimInviteState } from './claim';
import { whatsappInviteText } from './claim-copy';
import { createClaimInvite, markInviteSent } from './claim-server';
import { normalizeEmail } from './person-identity';

// The rollout owner's side of the claim flow: which credited people have an
// unclaimed profile, and sending one of them the link.
//
// Nothing here sends on its own. The owner presses "Email" or "Share", so an
// email to a stranger always has a person behind it.

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type CreditClaimRow = {
  submissionId: string;
  name: string;
  roles: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  /** pending: the profile is made once the rollout has come out. */
  personStatus: 'pending' | 'unclaimed' | 'claimed' | 'removed';
  slug: string | null;
  invite: { state: ClaimInviteState; channel: 'email' | 'link' | null; sentAt: string | null } | null;
};

/** Where a rollout's team lives: its artist's team, else its owner's. */
export async function resolveReleaseWorkspace(
  admin: SupabaseClient,
  releaseId: string
): Promise<{ workspaceId: string; title: string; ownerUserId: string } | null> {
  const { data } = await admin
    .from('releases')
    .select('title, owner_user_id, artist_id')
    .eq('id', releaseId)
    .maybeSingle();
  if (!data) return null;
  const row = asRow(data);
  let workspaceId = '';
  if (text(row.artist_id)) {
    const artist = await admin.from('artists').select('workspace_id').eq('id', text(row.artist_id)).maybeSingle();
    workspaceId = text(asRow(artist.data).workspace_id);
  }
  if (!workspaceId) {
    const owned = await admin.from('workspaces').select('id').eq('owner_id', text(row.owner_user_id)).maybeSingle();
    workspaceId = text(asRow(owned.data).id);
  }
  if (!workspaceId) return null;
  return { workspaceId, title: text(row.title), ownerUserId: text(row.owner_user_id) };
}

export async function listCreditClaims(
  admin: SupabaseClient,
  releaseId: string,
  workspaceId: string
): Promise<CreditClaimRow[]> {
  const { data, error } = await admin
    .from('release_credit_submissions')
    .select('id, legal_name, stage_name, roles, email, phone, person_id, person_hidden')
    .eq('release_id', releaseId)
    .eq('confirmed_accurate', true)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error || !data) return [];
  const rows = data.map(asRow);

  const personIds = [...new Set(rows.map((row) => text(row.person_id)).filter(Boolean))];
  const profiles = new Map<string, Record<string, unknown>>();
  const invites = new Map<string, Record<string, unknown>>();
  if (personIds.length > 0) {
    const profileResult = await admin
      .from('person_profiles')
      .select('id, status, slug, removed_at, removal_requested_at')
      .in('id', personIds);
    for (const row of (profileResult.data || []).map(asRow)) profiles.set(text(row.id), row);

    const inviteResult = await admin
      .from('person_claim_invites')
      .select('person_id, channel, sent_at, used_at, revoked_at, expires_at, failed_attempts, created_at')
      .eq('workspace_id', workspaceId)
      .in('person_id', personIds)
      .order('created_at', { ascending: false });
    for (const row of (inviteResult.data || []).map(asRow)) {
      if (!invites.has(text(row.person_id))) invites.set(text(row.person_id), row);
    }
  }

  return rows.map((row) => {
    const person = profiles.get(text(row.person_id));
    const invite = invites.get(text(row.person_id));
    let personStatus: CreditClaimRow['personStatus'] = 'pending';
    if (person) {
      if (person.removed_at || person.removal_requested_at) personStatus = 'removed';
      else personStatus = person.status === 'claimed' ? 'claimed' : 'unclaimed';
    }
    return {
      submissionId: text(row.id),
      name: text(row.stage_name).trim() || text(row.legal_name).trim(),
      roles: Array.isArray(row.roles) ? (row.roles as unknown[]).filter((r): r is string => typeof r === 'string') : [],
      hasEmail: Boolean(normalizeEmail(row.email)),
      hasPhone: Boolean(text(row.phone).trim()),
      personStatus,
      slug: person && personStatus === 'unclaimed' ? text(person.slug) || null : null,
      invite: invite
        ? {
            state: claimInviteState({
              usedAt: invite.used_at ? text(invite.used_at) : null,
              revokedAt: invite.revoked_at ? text(invite.revoked_at) : null,
              expiresAt: text(invite.expires_at),
              failedAttempts: Number(invite.failed_attempts) || 0,
            }),
            channel: invite.channel === 'email' || invite.channel === 'link' ? invite.channel : null,
            sentAt: invite.sent_at ? text(invite.sent_at) : null,
          }
        : null,
    };
  });
}

export type InviteOutcome =
  | { ok: true; url: string; emailed: boolean; whatsappText: string; reason?: 'not_configured' | 'no_email' | 'send_failed' }
  | { ok: false; status: number; error: string };

/**
 * Makes a fresh claim link for one credited person and, when asked, emails it.
 * Falls back to handing the link back for the owner to share by hand: a failed
 * email must never leave the owner with nothing.
 */
export async function inviteCreditedPerson(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    submissionId: string;
    user: { id: string };
    channel: 'email' | 'link';
  }
): Promise<InviteOutcome> {
  const release = await resolveReleaseWorkspace(admin, input.releaseId);
  if (!release) return { ok: false, status: 404, error: 'Rollout not found.' };

  const submission = await admin
    .from('release_credit_submissions')
    .select('id, legal_name, stage_name, email, person_id')
    .eq('id', input.submissionId)
    .eq('release_id', input.releaseId)
    .maybeSingle();
  if (!submission.data) return { ok: false, status: 404, error: 'Credit not found.' };
  const credit = asRow(submission.data);
  const personId = text(credit.person_id);
  if (!personId) {
    return {
      ok: false,
      status: 409,
      error: 'Their page is made once this rollout is out. Try again then.',
    };
  }

  const profile = await admin
    .from('person_profiles')
    .select('status, removed_at, removal_requested_at')
    .eq('id', personId)
    .maybeSingle();
  const profileRow = asRow(profile.data);
  if (!profile.data || profileRow.removed_at || profileRow.removal_requested_at) {
    return { ok: false, status: 409, error: 'This person asked to be taken off. Do not send a link.' };
  }
  if (profileRow.status !== 'unclaimed') {
    return { ok: false, status: 409, error: 'This page has already been claimed.' };
  }

  const created = await createClaimInvite(admin, {
    personId,
    workspaceId: release.workspaceId,
    createdBy: input.user.id,
    releaseId: input.releaseId,
    channel: input.channel,
  });
  if (!created) return { ok: false, status: 500, error: 'Could not make the link. Try again.' };

  const url = `${APP_URL}/claim/${created.token}`;
  const name = text(credit.stage_name).trim() || text(credit.legal_name).trim();
  const owner = await admin.from('profiles').select('name').eq('id', input.user.id).maybeSingle();
  const ownerName = text(asRow(owner.data).name).trim();
  const whatsappText = whatsappInviteText({
    firstName: firstNameFrom(name),
    ownerName,
    releaseTitle: release.title,
    claimUrl: url,
  });

  if (input.channel !== 'email') return { ok: true, url, emailed: false, whatsappText };

  const email = normalizeEmail(credit.email);
  if (!email) return { ok: true, url, emailed: false, whatsappText, reason: 'no_email' };
  if (!isEmailConfigured()) return { ok: true, url, emailed: false, whatsappText, reason: 'not_configured' };

  const sent = await sendEmail(admin, {
    templateId: 'claim_invite',
    to: email,
    props: { recipientName: name, ownerName, releaseTitle: release.title, claimUrl: url },
    trigger: 'claim_invite_sent',
    actorUserId: input.user.id,
    fromLabel: ownerName ? `${ownerName} via Urganize` : undefined,
  });
  if (!sent.ok) return { ok: true, url, emailed: false, whatsappText, reason: sent.skipped ? 'not_configured' : 'send_failed' };
  await markInviteSent(admin, created.inviteId);
  return { ok: true, url, emailed: true, whatsappText };
}
