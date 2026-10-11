import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_URL } from './email/links';
import { isEmailConfigured, sendEmail, type EmailSendResult } from './email';
import { firstNameFrom } from './email/format';
import { claimInviteState, type ClaimInviteState } from './claim';
import { whatsappInviteText } from './claim-copy';
import { createClaimInvite, markInviteSent } from './claim-server';
import type { ClaimPageEmailProps } from './email/templates/ClaimPageEmail';
import { normalizeEmail } from './person-identity';

// The rollout owner's side of the claim flow: which credited people have an
// unclaimed profile, and sending one of them the link.
//
// mintClaimLink and emailClaimLink are THE one path a claim link is made and
// emailed. The owner's "Email" button uses them, and so does the automatic
// claim email (lib/claim-auto-email-server.ts, behind
// NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL, default off). Nothing in this file runs
// on its own: the owner presses a button, or the daily cron calls the automatic
// step, which decides who with the pure rules in lib/claim-auto-email.ts.

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
  invite: {
    state: ClaimInviteState;
    channel: 'email' | 'link' | null;
    sentAt: string | null;
    /** Made and emailed by Urganize on its own, not by the owner. */
    automatic: boolean;
  } | null;
  /** When Urganize emailed this person on its own, and the one reminder. */
  autoEmail: { invitedAt: string | null; remindedAt: string | null } | null;
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
  const autoEmails = new Map<string, { invitedAt: string | null; remindedAt: string | null }>();
  if (personIds.length > 0) {
    const profileResult = await admin
      .from('person_profiles')
      .select('id, status, slug, removed_at, removal_requested_at')
      .in('id', personIds);
    for (const row of (profileResult.data || []).map(asRow)) profiles.set(text(row.id), row);

    const inviteResult = await admin
      .from('person_claim_invites')
      .select('id, person_id, channel, sent_at, used_at, revoked_at, expires_at, failed_attempts, created_at, created_by')
      .eq('workspace_id', workspaceId)
      .in('person_id', personIds)
      .order('created_at', { ascending: false });
    for (const row of (inviteResult.data || []).map(asRow)) {
      if (!invites.has(text(row.person_id))) invites.set(text(row.person_id), row);
    }

    // The automatic emails, so the owner sees they went out and does not send
    // a second one. A missing table (migration not applied) reads as none.
    const autoResult = await admin
      .from('person_claim_emails')
      .select('person_id, kind, status, sent_at')
      .in('person_id', personIds);
    for (const row of autoResult.error ? [] : (autoResult.data || []).map(asRow)) {
      if (row.status !== 'sent') continue;
      const entry = autoEmails.get(text(row.person_id)) ?? { invitedAt: null, remindedAt: null };
      if (row.kind === 'invite') entry.invitedAt = text(row.sent_at) || null;
      if (row.kind === 'reminder') entry.remindedAt = text(row.sent_at) || null;
      autoEmails.set(text(row.person_id), entry);
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
            // Urganize's own links carry no creator; a team's always do.
            automatic: !text(invite.created_by) && autoEmails.has(text(row.person_id)),
          }
        : null,
      autoEmail: autoEmails.get(text(row.person_id)) ?? null,
    };
  });
}

// ---- The one path a claim link is made and emailed ---------------------------

export type MintedClaimLink = { inviteId: string; url: string; expiresAt: string };

/** A fresh claim link for one person on behalf of one team. Any earlier open
 *  link for them from that team stops working (one live link at a time). */
export async function mintClaimLink(
  admin: SupabaseClient,
  input: {
    personId: string;
    workspaceId: string;
    releaseId: string;
    /** The owner who pressed the button; null when Urganize made it on its own. */
    createdBy: string | null;
    channel: 'email' | 'link';
  }
): Promise<MintedClaimLink | null> {
  const created = await createClaimInvite(admin, {
    personId: input.personId,
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    releaseId: input.releaseId,
    channel: input.channel,
  });
  if (!created) return null;
  return { inviteId: created.inviteId, url: `${APP_URL}/claim/${created.token}`, expiresAt: created.expiresAt };
}

export type ClaimLinkEmail =
  /** The owner pressed "Email": a note in their voice, always sent. */
  | {
      kind: 'owner';
      props: { recipientName: string; ownerName: string; releaseTitle: string };
      actorUserId: string;
    }
  /** Urganize, on its own: the first email or the one reminder. Unsubscribable. */
  | {
      kind: 'invite' | 'reminder';
      props: Omit<ClaimPageEmailProps, 'claimUrl' | 'unsubscribeUrl'>;
      idempotencyKey: string;
    };

/** Emails a link minted above, and stamps it sent only once the email went. */
export async function emailClaimLink(
  admin: SupabaseClient,
  input: { link: MintedClaimLink; to: string; email: ClaimLinkEmail }
): Promise<EmailSendResult> {
  let sent: EmailSendResult;
  if (input.email.kind === 'owner') {
    const ownerName = input.email.props.ownerName;
    sent = await sendEmail(admin, {
      templateId: 'claim_invite',
      to: input.to,
      props: { ...input.email.props, claimUrl: input.link.url },
      trigger: 'claim_invite_sent',
      actorUserId: input.email.actorUserId,
      fromLabel: ownerName ? `${ownerName} via Urganize` : undefined,
    });
  } else if (input.email.kind === 'invite') {
    sent = await sendEmail(admin, {
      templateId: 'claim_auto_invite',
      to: input.to,
      props: { ...input.email.props, claimUrl: input.link.url },
      trigger: 'claim_auto_invite',
      actorUserId: null,
      idempotencyKey: input.email.idempotencyKey,
    });
  } else {
    sent = await sendEmail(admin, {
      templateId: 'claim_reminder',
      to: input.to,
      props: { ...input.email.props, claimUrl: input.link.url },
      trigger: 'claim_reminder',
      actorUserId: null,
      idempotencyKey: input.email.idempotencyKey,
    });
  }
  if (sent.ok) await markInviteSent(admin, input.link.inviteId);
  return sent;
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

  const created = await mintClaimLink(admin, {
    personId,
    workspaceId: release.workspaceId,
    createdBy: input.user.id,
    releaseId: input.releaseId,
    channel: input.channel,
  });
  if (!created) return { ok: false, status: 500, error: 'Could not make the link. Try again.' };

  const url = created.url;
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

  const sent = await emailClaimLink(admin, {
    link: created,
    to: email,
    email: {
      kind: 'owner',
      props: { recipientName: name, ownerName, releaseTitle: release.title },
      actorUserId: input.user.id,
    },
  });
  if (!sent.ok) return { ok: true, url, emailed: false, whatsappText, reason: sent.skipped ? 'not_configured' : 'send_failed' };
  return { ok: true, url, emailed: true, whatsappText };
}
