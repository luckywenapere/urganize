import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildIdentifiers, type PersonIdentifier } from './person-identity';
import { suggestSlug, type PersonProfileInput } from './person-profile';
import {
  buildSeedMessages,
  claimInviteState,
  claimLinkExpiry,
  claimUrl,
  isPlausibleClaimToken,
  publishProblems,
  seedState,
  type ClaimBody,
  type SeedMessages,
  type SeedRowInput,
  type SeedState,
} from './seeding';
import {
  loadDirectoryInviteForPerson,
  stampDirectoryInviteJoined,
  stampDirectoryInviteOpened,
} from './directory-invites-claim-server';

// Founder-led seeding, the reads and writes (2026-10-10). The rules are in
// lib/seeding.ts; nothing here decides anything that needs a test of its own.
//
// Every function takes the service-role client and never throws: a database
// failure comes back as a result the route turns into a sentence. The tables
// have RLS on and no policies, so the browser can reach none of this.

const PERSON_PROFILES = 'person_profiles';
const PERSON_IDENTIFIERS = 'person_identifiers';
const CLAIM_INVITES = 'person_claim_invites';
const SEEDED = 'seeded_profiles';
const LIST_LIMIT = 200;

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export function generateClaimToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Only this is stored. The token is shown once, like the OAuth tokens. */
export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Making links

/**
 * Makes a fresh claim link for somebody, ending any unused one first. A link
 * is shown once and cannot be read back, so "get the link again" means "make a
 * new one", and the old one must stop working or two live links would exist.
 */
export async function mintClaimLink(
  admin: SupabaseClient,
  input: {
    personId: string;
    actorUserId: string;
    now?: Date;
    /** The inviter's team, for a Directory invite. Null for the founder's own. */
    workspaceId?: string | null;
    /** Stamp seeded_profiles.invited_at. False for a Directory invite, which
     *  keeps its own record in directory_invites. */
    stampSeed?: boolean;
    /** End this person's unused links first (default). False when a second
     *  manager invites somebody whose unclaimed page another link points at:
     *  that manager's link must keep working. */
    revokeEarlier?: boolean;
  }
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const token = generateClaimToken();

  if (input.revokeEarlier !== false) {
    const revoked = await admin
      .from(CLAIM_INVITES)
      .update({ revoked_at: now.toISOString() })
      .eq('person_id', input.personId)
      .is('used_at', null)
      .is('revoked_at', null);
    if (revoked.error) return { ok: false, error: 'Could not make the link.' };
  }

  const inserted = await admin.from(CLAIM_INVITES).insert({
    person_id: input.personId,
    workspace_id: input.workspaceId ?? null,
    token_hash: hashClaimToken(token),
    created_by: input.actorUserId,
    expires_at: claimLinkExpiry(now),
  });
  if (inserted.error) return { ok: false, error: 'Could not make the link.' };
  if (input.stampSeed === false) return { ok: true, token };

  const stamp = await admin.from(SEEDED).update({ invited_at: now.toISOString() }).eq('person_id', input.personId);
  if (stamp.error) return { ok: false, error: 'Could not make the link.' };
  return { ok: true, token };
}

export type SeedOutcome =
  | { name: string; status: 'created'; personId: string; url: string; messages: SeedMessages }
  | { name: string; status: 'already_on_urganize' }
  | { name: string; status: 'failed'; error: string };

async function knownIdentifier(admin: SupabaseClient, identifiers: PersonIdentifier[]): Promise<boolean | null> {
  for (const identifier of identifiers) {
    const found = await admin
      .from(PERSON_IDENTIFIERS)
      .select('person_id')
      .eq('kind', identifier.kind)
      .eq('value', identifier.value)
      .limit(1);
    if (found.error) return null;
    if ((found.data || []).length > 0) return true;
  }
  return false;
}

/**
 * Creates the profiles and their links, one person at a time.
 *
 * Somebody Urganize already knows by email or phone is NOT given a second
 * profile and is reported back, because two profiles for one person is the
 * thing person_identifiers exists to prevent, and a claimed person must not be
 * sent a "we made you a profile" message. A failure on one row never stops the
 * rest, and leaves nothing half-made behind.
 */
export async function seedManagers(
  admin: SupabaseClient,
  input: { actorUserId: string; rows: SeedRowInput[]; origin: string; now?: Date }
): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = [];
  for (const row of input.rows) {
    const identifiers = buildIdentifiers({ email: row.email, phone: row.phone });
    const known = await knownIdentifier(admin, identifiers);
    if (known === null) {
      outcomes.push({ name: row.name, status: 'failed', error: 'Could not check this person.' });
      continue;
    }
    if (known) {
      outcomes.push({ name: row.name, status: 'already_on_urganize' });
      continue;
    }

    const created = await admin
      .from(PERSON_PROFILES)
      .insert({
        display_name: row.name,
        status: 'unclaimed',
        visibility: 'private',
        roles: ['manager'],
        bio: row.bioStarter,
      })
      .select('id')
      .single();
    if (created.error || !created.data) {
      outcomes.push({ name: row.name, status: 'failed', error: 'Could not create the profile.' });
      continue;
    }
    const personId = text(asRow(created.data).id);
    const undo = async () => {
      await admin.from(PERSON_PROFILES).delete().eq('id', personId);
    };

    const identifiersInserted = await admin
      .from(PERSON_IDENTIFIERS)
      .insert(identifiers.map((identifier) => ({ person_id: personId, ...identifier })));
    if (identifiersInserted.error) {
      await undo();
      outcomes.push({ name: row.name, status: 'failed', error: 'Could not save their contact details.' });
      continue;
    }

    const recorded = await admin.from(SEEDED).insert({
      person_id: personId,
      contact_name: row.name,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
      bio_starter: row.bioStarter,
      created_by: input.actorUserId,
      invited_at: (input.now ?? new Date()).toISOString(),
    });
    if (recorded.error) {
      await undo();
      outcomes.push({ name: row.name, status: 'failed', error: 'Could not save this person.' });
      continue;
    }

    const link = await mintClaimLink(admin, { personId, actorUserId: input.actorUserId, now: input.now });
    if (!link.ok) {
      await undo();
      outcomes.push({ name: row.name, status: 'failed', error: link.error });
      continue;
    }
    const url = claimUrl(input.origin, link.token);
    outcomes.push({
      name: row.name,
      status: 'created',
      personId,
      url,
      messages: buildSeedMessages({ name: row.name, url }),
    });
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// The operator list

export type SeededRow = {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  state: SeedState;
  invitedAt: string;
  openedAt: string | null;
  publishedAt: string | null;
  /** True once they have made the profile theirs, whether or not published. */
  claimed: boolean;
};

export async function listSeeded(
  admin: SupabaseClient
): Promise<{ ok: true; rows: SeededRow[] } | { ok: false; error: string }> {
  const result = await admin
    .from(SEEDED)
    .select('person_id, contact_name, email, phone, notes, invited_at, opened_at, published_at')
    .order('invited_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (result.error) return { ok: false, error: 'Could not load the list.' };
  const base = (result.data || []).map(asRow);

  const ids = base.map((row) => text(row.person_id));
  const claimedIds = new Set<string>();
  if (ids.length > 0) {
    const profiles = await admin.from(PERSON_PROFILES).select('id, status').in('id', ids);
    if (profiles.error) return { ok: false, error: 'Could not load the list.' };
    for (const profile of (profiles.data || []).map(asRow)) {
      if (text(profile.status) === 'claimed') claimedIds.add(text(profile.id));
    }
  }

  return {
    ok: true,
    rows: base.map((row) => {
      const dates = {
        invitedAt: textOrNull(row.invited_at),
        openedAt: textOrNull(row.opened_at),
        publishedAt: textOrNull(row.published_at),
      };
      return {
        personId: text(row.person_id),
        name: text(row.contact_name),
        email: textOrNull(row.email),
        phone: textOrNull(row.phone),
        notes: text(row.notes),
        state: seedState(dates),
        invitedAt: text(row.invited_at),
        openedAt: dates.openedAt,
        publishedAt: dates.publishedAt,
        claimed: claimedIds.has(text(row.person_id)),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// The manager's side

export type ClaimView =
  | { state: 'missing' | 'used' | 'revoked' | 'expired'; invitedBy?: string | null }
  | {
      state: 'ok';
      personId: string;
      /** The manager behind a Directory invite (2026-10-11). Null for the
       *  founder's own seeding links, which the page signs as Oyin. */
      invitedBy?: string | null;
      profile: {
        displayName: string;
        bio: string | null;
        roles: string[];
        city: string | null;
        country: string | null;
        availability: string;
      };
    };

async function loadInvite(admin: SupabaseClient, token: string) {
  if (!isPlausibleClaimToken(token)) return null;
  const found = await admin
    .from(CLAIM_INVITES)
    .select('id, person_id, expires_at, used_at, revoked_at')
    .eq('token_hash', hashClaimToken(token))
    .maybeSingle();
  if (found.error || !found.data) return null;
  const row = asRow(found.data);
  return {
    id: text(row.id),
    personId: text(row.person_id),
    usedAt: textOrNull(row.used_at),
    revokedAt: textOrNull(row.revoked_at),
    expiresAt: text(row.expires_at),
  };
}

/**
 * What the link shows. Looking at it records NOTHING: a chat app's link preview
 * fetches the page on the server the moment the message is sent, and counting
 * that as "opened" would tell the founder somebody read a message they have not
 * seen. The browser reports the open itself (recordClaimOpened) once the page
 * has actually loaded, and crawlers do not run scripts.
 *
 * Every failure to find the link answers 'missing', so a guessed address and a
 * deleted one cannot be told apart.
 */
export async function openClaimLink(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<ClaimView> {
  const invite = await loadInvite(admin, token);
  if (!invite) return { state: 'missing' };
  const directoryInvite = await loadDirectoryInviteForPerson(admin, invite.personId);
  const invitedBy = directoryInvite ? directoryInvite.inviterName ?? 'your manager' : null;
  const state = claimInviteState(invite, now);
  if (state !== 'ok') return { state, invitedBy };

  const person = await admin
    .from(PERSON_PROFILES)
    .select('display_name, bio, roles, city, country, availability, status')
    .eq('id', invite.personId)
    .maybeSingle();
  if (person.error || !person.data) return { state: 'missing' };
  const row = asRow(person.data);
  if (text(row.status) !== 'unclaimed') return { state: 'used', invitedBy };

  return {
    state: 'ok',
    personId: invite.personId,
    invitedBy,
    profile: {
      displayName: text(row.display_name),
      bio: textOrNull(row.bio),
      roles: Array.isArray(row.roles) ? (row.roles as unknown[]).filter((r): r is string => typeof r === 'string') : [],
      city: textOrNull(row.city),
      country: textOrNull(row.country),
      availability: text(row.availability) || 'selective',
    },
  };
}

/**
 * The browser says the page loaded. Recorded once: the conditional update only
 * matches a row with no opened date, so a refresh or a second tab changes
 * nothing, and a link that cannot be used records nothing.
 */
export async function recordClaimOpened(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<void> {
  const invite = await loadInvite(admin, token);
  if (!invite || claimInviteState(invite, now) !== 'ok') return;
  await admin
    .from(SEEDED)
    .update({ opened_at: now.toISOString() })
    .eq('person_id', invite.personId)
    .is('opened_at', null);
  // A Directory invite keeps its own record; a seeding link finds none.
  await stampDirectoryInviteOpened(admin, invite.personId, now);
}

export type ClaimResult =
  | { ok: true; published: boolean; slug: string | null }
  | { ok: false; error: string; status: number };

/**
 * The signed-in manager makes the profile theirs, and optionally publishes.
 *
 * The link is single-use through a conditional update (where used_at is null):
 * the row is the lock, so two requests cannot both claim. If a later step
 * fails the claim is handed back so the link still works.
 *
 * Somebody who already has a profile of their own is refused rather than
 * merged: guessing which of two records is the real one is the exact mistake
 * Relationships is built to avoid.
 */
export async function claimProfile(
  admin: SupabaseClient,
  input: { token: string; userId: string; body: ClaimBody; now?: Date }
): Promise<ClaimResult> {
  const now = input.now ?? new Date();
  const invite = await loadInvite(admin, input.token);
  if (!invite) return { ok: false, error: 'This link is not available.', status: 404 };
  const state = claimInviteState(invite, now);
  if (state !== 'ok') {
    const directoryInvite = await loadDirectoryInviteForPerson(admin, invite.personId);
    const askWho = directoryInvite ? directoryInvite.inviterName ?? 'your manager' : 'Oyin';
    return {
      ok: false,
      error:
        state === 'used'
          ? 'This link has already been used.'
          : state === 'revoked'
            ? `This link was replaced. Ask ${askWho} for a new one.`
            : `This link has expired. Ask ${askWho} for a new one.`,
      status: 410,
    };
  }

  const existing = await admin.from(PERSON_PROFILES).select('id').eq('user_id', input.userId).maybeSingle();
  if (existing.error) return { ok: false, error: 'Could not check your account.', status: 500 };
  if (existing.data) {
    return {
      ok: false,
      error: 'You already have a profile. Open Settings to edit it.',
      status: 409,
    };
  }

  const current = await admin
    .from(PERSON_PROFILES)
    .select('display_name, roles, status')
    .eq('id', invite.personId)
    .maybeSingle();
  if (current.error || !current.data) return { ok: false, error: 'This link is not available.', status: 404 };
  const currentRow = asRow(current.data);
  if (text(currentRow.status) !== 'unclaimed') {
    return { ok: false, error: 'This link has already been used.', status: 410 };
  }

  const { input: fields, publish, visibility } = input.body;
  const displayName = fields.displayName ?? text(currentRow.display_name);
  const roles = fields.roles ?? (Array.isArray(currentRow.roles) ? (currentRow.roles as string[]) : []);
  if (publish) {
    const problems = publishProblems({ displayName, roles });
    if (problems.length > 0) return { ok: false, error: problems[0], status: 400 };
  }

  const claimedInvite = await admin
    .from(CLAIM_INVITES)
    .update({ used_at: now.toISOString(), used_by: input.userId })
    .eq('id', invite.id)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('id');
  if (claimedInvite.error) return { ok: false, error: 'Could not use this link.', status: 500 };
  if ((claimedInvite.data || []).length === 0) {
    return { ok: false, error: 'This link has already been used.', status: 410 };
  }
  const releaseInvite = async () => {
    await admin.from(CLAIM_INVITES).update({ used_at: null, used_by: null }).eq('id', invite.id);
  };

  const slug = publish ? suggestSlug(displayName) : null;
  const patch = profilePatch(fields, input.userId, visibility, now);
  const write = (extra: Record<string, unknown>) =>
    admin.from(PERSON_PROFILES).update({ ...patch, ...extra }).eq('id', invite.personId).eq('status', 'unclaimed').select('id, slug');

  let result = await write(slug ? { slug } : {});
  // A handle WE suggested colliding must not stop somebody publishing: there is
  // no handle field on this screen. Retry without one; they can pick one later.
  if (result.error?.code === '23505' && slug) result = await write({});
  if (result.error || (result.data || []).length === 0) {
    await releaseInvite();
    return { ok: false, error: 'Could not save your profile. Try again.', status: 500 };
  }

  if (publish) {
    await admin
      .from(SEEDED)
      .update({ published_at: now.toISOString() })
      .eq('person_id', invite.personId)
      .is('published_at', null);
  }
  // The manager who invited them (if any) sees they joined. Never throws.
  await stampDirectoryInviteJoined(admin, { personId: invite.personId, userId: input.userId, published: publish, now });
  const saved = asRow((result.data || [])[0]);
  return { ok: true, published: publish, slug: textOrNull(saved.slug) };
}

/** The column values for a claim. Visibility is set here and nowhere else. */
function profilePatch(
  fields: PersonProfileInput,
  userId: string,
  visibility: string,
  now: Date
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    user_id: userId,
    status: 'claimed',
    claimed_at: now.toISOString(),
    visibility,
  };
  if (fields.displayName !== undefined) patch.display_name = fields.displayName;
  if (fields.roles !== undefined) patch.roles = fields.roles;
  if (fields.city !== undefined) patch.city = fields.city;
  if (fields.country !== undefined) patch.country = fields.country;
  if (fields.availability !== undefined) patch.availability = fields.availability;
  if (fields.bio !== undefined) patch.bio = fields.bio;
  if (fields.links !== undefined) patch.links = fields.links;
  return patch;
}
