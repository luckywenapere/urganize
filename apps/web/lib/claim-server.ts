import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimInviteExpiry,
  claimInviteState,
  generateClaimToken,
  hashClaimToken,
  isValidClaimToken,
  maskIdentifier,
  proveContact,
  removalDueAt,
  type ClaimInviteState,
} from './claim';
import type { PersonIdentifier } from './person-identity';
import { IN_LIST_CHUNK, inChunks } from './paged-rows';

// Reading and writing the claim flow (Lane A). Service role only: the person
// opening a claim link, or the removal form, has no session, and the tables
// have no client policies. Every access decision is made by the pure rules in
// lib/claim.ts.
//
// Nothing here throws to a caller. A public page that cannot tell a missing
// link from a broken database says the same thing for both, so it never leaks
// whether a profile exists.

const PROFILES = 'person_profiles';
const IDENTIFIERS = 'person_identifiers';
const INVITES = 'person_claim_invites';
const REMOVALS = 'person_removal_requests';
const SUBMISSIONS = 'release_credit_submissions';
const RELEASES = 'releases';
const RELATIONSHIPS = 'team_relationships';

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type ClaimCredit = {
  submissionId: string;
  releaseId: string;
  releaseTitle: string;
  releaseYear: number | null;
  roles: string[];
  hidden: boolean;
};

async function loadIdentifiers(admin: SupabaseClient, personId: string): Promise<PersonIdentifier[]> {
  const { data } = await admin.from(IDENTIFIERS).select('kind, value').eq('person_id', personId);
  return (data || [])
    .map(asRow)
    .filter((row) => row.kind === 'email' || row.kind === 'phone')
    .map((row) => ({ kind: row.kind as 'email' | 'phone', value: text(row.value) }));
}

/** Every credit pointing at a person, with its rollout, oldest release first. */
export async function loadPersonCredits(
  admin: SupabaseClient,
  personId: string,
  options: { onlyVisible?: boolean } = {}
): Promise<ClaimCredit[]> {
  let query = admin
    .from(SUBMISSIONS)
    .select('id, release_id, roles, confirmed_accurate, person_hidden')
    .eq('person_id', personId)
    .eq('confirmed_accurate', true)
    .limit(200);
  if (options.onlyVisible) query = query.eq('person_hidden', false);
  const { data, error } = await query;
  if (error || !data || data.length === 0) return [];

  const rows = data.map(asRow);
  const releaseIds = [...new Set(rows.map((row) => text(row.release_id)).filter(Boolean))];
  const releases = new Map<string, { title: string; year: number | null }>();
  for (const ids of inChunks(releaseIds, IN_LIST_CHUNK)) {
    const result = await admin.from(RELEASES).select('id, title, release_date').in('id', ids);
    for (const row of (result.data || []).map(asRow)) {
      const date = text(row.release_date);
      const year = date ? Number(date.slice(0, 4)) : NaN;
      releases.set(text(row.id), { title: text(row.title), year: Number.isFinite(year) ? year : null });
    }
  }
  return rows
    .map((row) => {
      const release = releases.get(text(row.release_id));
      return {
        submissionId: text(row.id),
        releaseId: text(row.release_id),
        releaseTitle: release?.title || '',
        releaseYear: release?.year ?? null,
        roles: Array.isArray(row.roles) ? (row.roles as unknown[]).filter((r): r is string => typeof r === 'string') : [],
        hidden: row.person_hidden === true,
      };
    })
    .filter((credit) => credit.releaseTitle)
    .sort((a, b) => (a.releaseYear ?? 0) - (b.releaseYear ?? 0));
}

// ---- Invites ----------------------------------------------------------------

export type CreatedInvite = { token: string; inviteId: string; expiresAt: string };

/**
 * Makes a new claim link for one person on behalf of one team. Any earlier
 * open link for the same person and team is revoked, so there is one live link
 * at a time and an old one in a chat history stops working.
 *
 * The token is returned once and only its hash is stored. Sending the link
 * again means making a new one.
 */
export async function createClaimInvite(
  admin: SupabaseClient,
  input: {
    personId: string;
    workspaceId: string;
    createdBy: string | null;
    releaseId: string | null;
    channel: 'email' | 'link';
  }
): Promise<CreatedInvite | null> {
  try {
    const now = new Date();
    await admin
      .from(INVITES)
      .update({ revoked_at: now.toISOString() })
      .eq('person_id', input.personId)
      .eq('workspace_id', input.workspaceId)
      .is('used_at', null)
      .is('revoked_at', null);

    const token = generateClaimToken();
    const expiresAt = claimInviteExpiry(now).toISOString();
    const { data, error } = await admin
      .from(INVITES)
      .insert({
        person_id: input.personId,
        workspace_id: input.workspaceId,
        token_hash: hashClaimToken(token),
        created_by: input.createdBy,
        expires_at: expiresAt,
        release_id: input.releaseId,
        channel: input.channel,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return { token, inviteId: text(asRow(data).id), expiresAt };
  } catch {
    return null;
  }
}

/** Stamped only once the email actually went out. */
export async function markInviteSent(admin: SupabaseClient, inviteId: string): Promise<void> {
  await admin.from(INVITES).update({ sent_at: new Date().toISOString() }).eq('id', inviteId);
}

/** Turns off one link that was made but never reached anybody (the automatic
 *  claim email could not send it), so it cannot sit open in the owner's panel
 *  as "Link made". Only a link nobody has used. */
export async function revokeUnsentInvite(admin: SupabaseClient, inviteId: string): Promise<void> {
  try {
    await admin
      .from(INVITES)
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId)
      .is('used_at', null)
      .is('sent_at', null)
      .is('revoked_at', null);
  } catch {
    // Harmless if it stays: the next link made for this person revokes it.
  }
}

type InviteLookup = {
  invite: { id: string; personId: string; workspaceId: string; state: ClaimInviteState; failedAttempts: number };
  profile: Record<string, unknown>;
};

async function lookupInvite(admin: SupabaseClient, token: string): Promise<InviteLookup | null> {
  if (!isValidClaimToken(token)) return null;
  const { data } = await admin
    .from(INVITES)
    .select('id, person_id, workspace_id, used_at, revoked_at, expires_at, failed_attempts')
    .eq('token_hash', hashClaimToken(token))
    .maybeSingle();
  if (!data) return null;
  const row = asRow(data);
  const profileResult = await admin
    .from(PROFILES)
    .select('id, user_id, display_name, slug, status, removal_requested_at, removed_at')
    .eq('id', text(row.person_id))
    .maybeSingle();
  if (!profileResult.data) return null;
  return {
    invite: {
      id: text(row.id),
      personId: text(row.person_id),
      workspaceId: text(row.workspace_id),
      failedAttempts: Number(row.failed_attempts) || 0,
      state: claimInviteState({
        usedAt: row.used_at ? text(row.used_at) : null,
        revokedAt: row.revoked_at ? text(row.revoked_at) : null,
        expiresAt: text(row.expires_at),
        failedAttempts: Number(row.failed_attempts) || 0,
      }),
    },
    profile: asRow(profileResult.data),
  };
}

export type ClaimPreview =
  | { ok: true; displayName: string; hint: string; credits: ClaimCredit[] }
  | { ok: false; reason: 'unavailable' | ClaimInviteState };

/**
 * What the claim page shows before anybody signs in: the name on file, which
 * contact to use (masked) and the credits. Never the identifiers themselves,
 * never a release that has not come out (credits only exist for delivered
 * ones), and the same "unavailable" for a bad link, a removed profile and a
 * database blip.
 */
export async function loadClaimPreview(admin: SupabaseClient, token: string): Promise<ClaimPreview> {
  try {
    const found = await lookupInvite(admin, token);
    if (!found) return { ok: false, reason: 'unavailable' };
    const { invite, profile } = found;
    if (profile.removed_at || profile.removal_requested_at) return { ok: false, reason: 'unavailable' };
    if (invite.state !== 'open') return { ok: false, reason: invite.state };
    if (profile.status !== 'unclaimed') return { ok: false, reason: 'used' };

    const identifiers = await loadIdentifiers(admin, invite.personId);
    const preferred = identifiers.find((entry) => entry.kind === 'email') ?? identifiers[0];
    const credits = await loadPersonCredits(admin, invite.personId, { onlyVisible: true });
    return {
      ok: true,
      displayName: text(profile.display_name),
      hint: preferred ? maskIdentifier(preferred) : '',
      credits,
    };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

// ---- Redeeming --------------------------------------------------------------

export type RedeemResult =
  | { ok: true; personId: string; slug: string | null; merged: boolean }
  | {
      ok: false;
      reason: 'unavailable' | 'used' | 'revoked' | 'expired' | 'locked' | 'no_match' | 'nothing_to_check' | 'error';
      attemptsLeft?: number;
    };

const MAX_ATTEMPTS = 5;

/**
 * Takes over an unclaimed profile for the signed-in person.
 *
 * The row is the lock: the profile update is conditional on it still being
 * unclaimed, so two people opening the same link cannot both win. A wrong
 * email or phone counts against the invite, and five lock it.
 *
 * If this person already has a profile of their own (they opted into the
 * directory before they were ever credited), the credits and the teams'
 * contacts move onto it and the unclaimed one is removed, rather than leaving
 * one human with two.
 */
export async function redeemClaim(
  admin: SupabaseClient,
  input: {
    token: string;
    userId: string;
    accountEmail: string | null;
    accountEmailConfirmed: boolean;
    typedContact: string;
  }
): Promise<RedeemResult> {
  try {
    const found = await lookupInvite(admin, input.token);
    if (!found) return { ok: false, reason: 'unavailable' };
    const { invite, profile } = found;
    if (profile.removed_at || profile.removal_requested_at) return { ok: false, reason: 'unavailable' };
    if (invite.state !== 'open') return { ok: false, reason: invite.state };
    if (profile.status !== 'unclaimed') return { ok: false, reason: 'used' };

    const identifiers = await loadIdentifiers(admin, invite.personId);
    const proof = proveContact({
      typed: input.typedContact,
      accountEmail: input.accountEmail,
      accountEmailConfirmed: input.accountEmailConfirmed,
      identifiers,
    });
    if (!proof.ok) {
      if (proof.reason === 'nothing_to_check') return { ok: false, reason: 'nothing_to_check' };
      const failed = invite.failedAttempts + 1;
      await admin.from(INVITES).update({ failed_attempts: failed }).eq('id', invite.id);
      return { ok: false, reason: 'no_match', attemptsLeft: Math.max(0, MAX_ATTEMPTS - failed) };
    }

    const now = new Date().toISOString();
    const own = await admin.from(PROFILES).select('id, slug').eq('user_id', input.userId).maybeSingle();
    if (own.error) return { ok: false, reason: 'error' };

    if (!own.data) {
      const claimed = await admin
        .from(PROFILES)
        .update({ user_id: input.userId, status: 'claimed', claimed_at: now })
        .eq('id', invite.personId)
        .eq('status', 'unclaimed')
        .is('user_id', null)
        .select('id, slug')
        .maybeSingle();
      if (claimed.error) return { ok: false, reason: 'error' };
      if (!claimed.data) return { ok: false, reason: 'used' };
      await admin
        .from(IDENTIFIERS)
        .update({ verified: true })
        .eq('person_id', invite.personId)
        .eq('kind', proof.identifier.kind)
        .eq('value', proof.identifier.value);
      await admin.from(INVITES).update({ used_at: now, used_by: input.userId }).eq('id', invite.id).is('used_at', null);
      return { ok: true, personId: invite.personId, slug: text(asRow(claimed.data).slug) || null, merged: false };
    }

    const ownId = text(asRow(own.data).id);
    await mergeProfile(admin, invite.personId, ownId);
    return { ok: true, personId: ownId, slug: text(asRow(own.data).slug) || null, merged: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Moves everything pointing at the unclaimed profile onto the person's own,
 * then deletes the unclaimed one. A team that holds both as contacts keeps the
 * one that already pointed at the person's own profile.
 */
async function mergeProfile(admin: SupabaseClient, fromId: string, toId: string): Promise<void> {
  await admin.from(SUBMISSIONS).update({ person_id: toId }).eq('person_id', fromId);
  await admin.from('tasks').update({ assigned_person_id: toId }).eq('assigned_person_id', fromId);
  await admin.from('dj_pack_recipients').update({ person_id: toId }).eq('person_id', fromId);
  await admin.from(IDENTIFIERS).update({ person_id: toId, verified: true }).eq('person_id', fromId);

  const { data } = await admin.from(RELATIONSHIPS).select('id').eq('person_id', fromId);
  for (const row of (data || []).map(asRow)) {
    const moved = await admin.from(RELATIONSHIPS).update({ person_id: toId }).eq('id', text(row.id));
    // Unique on (team, person): the team already had them, so drop the extra.
    if (moved.error) await admin.from(RELATIONSHIPS).delete().eq('id', text(row.id));
  }
  await admin.from(PROFILES).delete().eq('id', fromId).eq('status', 'unclaimed');
}

/** A person hides a credit that is not theirs. Only their own profile's. */
export async function setCreditHidden(
  admin: SupabaseClient,
  input: { userId: string; submissionId: string; hidden: boolean }
): Promise<boolean> {
  try {
    const profile = await admin.from(PROFILES).select('id').eq('user_id', input.userId).maybeSingle();
    if (!profile.data) return false;
    const updated = await admin
      .from(SUBMISSIONS)
      .update({ person_hidden: input.hidden })
      .eq('id', input.submissionId)
      .eq('person_id', text(asRow(profile.data).id))
      .select('id')
      .maybeSingle();
    return Boolean(updated.data);
  } catch {
    return false;
  }
}

// ---- Removal ----------------------------------------------------------------

/**
 * Somebody asks to be taken off. The page is hidden at once, the request waits
 * for an admin for up to three days, and the answer is always the same: a
 * stranger cannot learn whether a slug exists by trying it.
 */
export async function requestRemoval(
  admin: SupabaseClient,
  input: { slug: string; contact: string; note: string | null }
): Promise<void> {
  try {
    const slug = input.slug.trim().toLowerCase();
    if (!slug) return;
    const { data } = await admin
      .from(PROFILES)
      .select('id, status, removed_at')
      .eq('slug', slug)
      .maybeSingle();
    const row = asRow(data);
    if (!data || row.status !== 'unclaimed' || row.removed_at) return;

    const now = new Date();
    await admin
      .from(REMOVALS)
      .insert({
        person_id: text(row.id),
        contact: input.contact,
        note: input.note,
        due_at: removalDueAt(now).toISOString(),
      });
    // A second request while one is open hits the unique index and is ignored.
    await admin
      .from(PROFILES)
      .update({ removal_requested_at: now.toISOString() })
      .eq('id', text(row.id))
      .is('removal_requested_at', null);
  } catch {
    // Nothing to tell the person; the form answers the same either way.
  }
}

export type RemovalAction = 'remove' | 'dismiss';

export async function resolveRemoval(
  admin: SupabaseClient,
  input: { requestId: string; action: RemovalAction; adminId: string }
): Promise<boolean> {
  const now = new Date().toISOString();
  const request = await admin
    .from(REMOVALS)
    .update({
      status: input.action === 'remove' ? 'removed' : 'dismissed',
      resolved_at: now,
      resolved_by: input.adminId,
    })
    .eq('id', input.requestId)
    .eq('status', 'open')
    .select('person_id')
    .maybeSingle();
  if (request.error || !request.data) return false;
  const personId = text(asRow(request.data).person_id);

  if (input.action === 'remove') {
    // Permanent: hidden, never linked again, every open claim link revoked. A
    // team's own contact for them is untouched.
    await admin.from(PROFILES).update({ removed_at: now }).eq('id', personId);
    await admin.from(INVITES).update({ revoked_at: now }).eq('person_id', personId).is('used_at', null).is('revoked_at', null);
  } else {
    await admin.from(PROFILES).update({ removal_requested_at: null }).eq('id', personId).is('removed_at', null);
  }
  return true;
}
