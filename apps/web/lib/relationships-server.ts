import type { SupabaseClient } from '@supabase/supabase-js';
import { buildIdentifiers, type PersonIdentifier } from './person-identity';
import { identifierKey, resolvePerson, type MatchVia } from './person-match';
import { signPhotoPathsPreferThumb } from './profile-photo-server';
import {
  orderPair,
  type RelationshipCreate,
  type RelationshipPatch,
  type RelationshipSource,
} from './relationships';

// Reading and writing a team's relationships (Relationships, Phase 2).
//
// Every function takes the team's workspace id from the caller and scopes every
// query to it. Nothing here trusts an id from a request body: the routes
// resolve the team from the signed-in user and pass it in.
//
// The shared profile (person_profiles) and the identifiers that recognise it
// are SHARED across teams; the relationship is PRIVATE to one. What a team
// reads about a person always comes from its own relationship row, apart from
// the public profile of someone who has claimed it AND chosen to be listed.

const PERSON_PROFILES = 'person_profiles';
const PERSON_IDENTIFIERS = 'person_identifiers';
const RELATIONSHIPS = 'team_relationships';
const DUPLICATE_FLAGS = 'person_duplicate_flags';
const INTERACTIONS = 'relationship_interactions';
/** The person page shows a short log, not a history. */
const INTERACTION_LIMIT = 20;

/** PostgREST puts `in(...)` in the URL, so ids go in small groups. */
const ID_CHUNK = 150;
/** A team's contact book is hundreds, not millions. */
const LIST_LIMIT = 2000;

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

export type RelationshipView = {
  personId: string;
  relationshipId: string;
  label: string;
  role: string;
  /** Where they work, in the team's words. Empty until somebody adds it. */
  company: string;
  /** Kept and still editable through the API; the pages no longer show it. */
  tags: string[];
  /** Kept and still editable through the API; the pages no longer show it. */
  notes: string;
  rateNote: string | null;
  lastContactAt: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  /** True once the person has taken over their profile. */
  claimed: boolean;
  /** Their own photo, only once they have claimed AND listed the profile. */
  avatarUrl: string | null;
  /** Only present for somebody who has claimed AND chosen to be listed. */
  profile: {
    displayName: string;
    city: string | null;
    country: string | null;
    roles: string[];
    slug: string | null;
  } | null;
};

type Failure = { ok: false; error: string; status: number };

const LEGACY_COLUMNS =
  'id, workspace_id, person_id, label, role, tags, notes, rate_note, last_contact_at, email, phone, source, created_at, updated_at';
const RELATIONSHIP_COLUMNS = `${LEGACY_COLUMNS}, company`;

/** Postgres "undefined column". */
const MISSING_COLUMN = '42703';

/**
 * Reads relationship rows, falling back to the columns from before the My
 * People migration (20261015120000) when `company` does not exist yet, so the
 * list keeps working in the window between this code shipping and that
 * migration being applied. Every row then reads an empty company.
 */
async function selectRelationships<T>(
  run: (columns: string) => PromiseLike<{ data: T; error: { code?: string } | null }>
): Promise<{ data: T; error: { code?: string } | null }> {
  const first = await run(RELATIONSHIP_COLUMNS);
  if (first.error && first.error.code === MISSING_COLUMN) return run(LEGACY_COLUMNS);
  return first;
}

function toView(
  row: Record<string, unknown>,
  profile: Record<string, unknown> | null,
  avatarUrl: string | null = null
): RelationshipView {
  const claimed = profile ? text(profile.status) === 'claimed' : false;
  const listed = claimed && profile && text(profile.visibility) !== 'private';
  return {
    personId: text(row.person_id),
    relationshipId: text(row.id),
    label: text(row.label),
    role: text(row.role),
    company: text(row.company),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    notes: text(row.notes),
    rateNote: row.rate_note ? text(row.rate_note) : null,
    lastContactAt: row.last_contact_at ? text(row.last_contact_at) : null,
    email: row.email ? text(row.email) : null,
    phone: row.phone ? text(row.phone) : null,
    source: text(row.source),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    claimed,
    avatarUrl: listed ? avatarUrl : null,
    profile:
      listed && profile
        ? {
            displayName: text(profile.display_name),
            city: profile.city ? text(profile.city) : null,
            country: profile.country ? text(profile.country) : null,
            roles: Array.isArray(profile.roles) ? (profile.roles as string[]) : [],
            slug: text(profile.visibility) === 'public' && profile.slug ? text(profile.slug) : null,
          }
        : null,
  };
}

async function loadProfiles(
  admin: SupabaseClient,
  personIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const ids of chunk([...new Set(personIds)], ID_CHUNK)) {
    const { data } = await admin
      .from(PERSON_PROFILES)
      .select('id, status, display_name, city, country, roles, slug, visibility, avatar_storage_path')
      .in('id', ids);
    for (const row of data || []) map.set(text(asRow(row).id), asRow(row));
  }
  return map;
}

/**
 * Faces for the people who claimed AND listed their profile, keyed by person
 * id. Never throws: a face is decoration, and a signing hiccup shows initials.
 */
async function loadAvatars(
  admin: SupabaseClient,
  profiles: Map<string, Record<string, unknown>>
): Promise<Map<string, string>> {
  // The 52px list face and the 110px header read the 384px copy
  // (lib/image-thumb.ts), falling back to the original for older uploads.
  const rows: Array<{ key: string; path: string }> = [];
  for (const [id, profile] of profiles.entries()) {
    const listed = text(profile.status) === 'claimed' && text(profile.visibility) !== 'private';
    const path = text(profile.avatar_storage_path);
    if (listed && path) rows.push({ key: id, path });
  }
  try {
    return await signPhotoPathsPreferThumb(admin, rows);
  } catch {
    // Initials instead.
    return new Map();
  }
}

/** Every relationship the team has, newest activity first. */
export async function listRelationships(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ ok: true; relationships: RelationshipView[] } | Failure> {
  const { data, error } = await selectRelationships((columns) =>
    admin
      .from(RELATIONSHIPS)
      .select(columns)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)
  );
  if (error) return { ok: false, error: 'Could not load your contacts.', status: 500 };

  const rows = ((data as unknown[]) || []).map(asRow);
  const profiles = await loadProfiles(
    admin,
    rows.map((row) => text(row.person_id))
  );
  const avatars = await loadAvatars(admin, profiles);
  return {
    ok: true,
    relationships: rows.map((row) => {
      const personId = text(row.person_id);
      return toView(row, profiles.get(personId) ?? null, avatars.get(personId) ?? null);
    }),
  };
}

export async function getRelationship(
  admin: SupabaseClient,
  workspaceId: string,
  personId: string
): Promise<{ ok: true; relationship: RelationshipView } | Failure> {
  const { data, error } = await selectRelationships((columns) =>
    admin
      .from(RELATIONSHIPS)
      .select(columns)
      .eq('workspace_id', workspaceId)
      .eq('person_id', personId)
      .maybeSingle()
  );
  if (error) return { ok: false, error: 'Could not load that contact.', status: 500 };
  // Another team's contact and one that does not exist are the same answer.
  if (!data) return { ok: false, error: 'Contact not found.', status: 404 };

  const profiles = await loadProfiles(admin, [personId]);
  const avatars = await loadAvatars(admin, profiles);
  return {
    ok: true,
    relationship: toView(asRow(data), profiles.get(personId) ?? null, avatars.get(personId) ?? null),
  };
}

type Lookup = Map<string, string>;

async function lookupIdentifiers(admin: SupabaseClient, identifiers: PersonIdentifier[]): Promise<Lookup> {
  const found: Lookup = new Map();
  if (identifiers.length === 0) return found;
  const { data } = await admin
    .from(PERSON_IDENTIFIERS)
    .select('person_id, kind, value')
    .in(
      'value',
      identifiers.map((identifier) => identifier.value)
    );
  const wanted = new Set(identifiers.map(identifierKey));
  for (const row of data || []) {
    const record = asRow(row);
    const key = `${text(record.kind)}:${text(record.value)}`;
    if (wanted.has(key)) found.set(key, text(record.person_id));
  }
  return found;
}

export type SeedResult =
  | {
      ok: true;
      personId: string;
      relationshipId: string;
      /** True when this call made the relationship (and maybe the person). */
      created: boolean;
      /** Whether the person already existed, and what recognised them. */
      matchedVia: MatchVia | null;
      /** Possible duplicates recorded for the team to confirm. */
      flagged: number;
    }
  | Failure;

/**
 * Adds somebody to a team's relationships, finding the person first.
 *
 * Email, then phone, finds a person Urganize already knows, across all teams.
 * Otherwise the team's own contact with the same name and role is reused.
 * Otherwise a new UNCLAIMED, PRIVATE profile is made. A name that only
 * resembles one of the team's contacts is flagged for a person to confirm and
 * never merges anything.
 *
 * Calling it again for somebody the team already has changes nothing: it fills
 * in a contact detail the team did not have yet and leaves notes, tags and the
 * rest exactly as they were.
 */
export async function seedRelationship(
  admin: SupabaseClient,
  input: {
    workspaceId: string;
    actorUserId: string;
    data: RelationshipCreate;
    source: RelationshipSource;
  }
): Promise<SeedResult> {
  const { workspaceId, actorUserId, data, source } = input;
  const identifiers = buildIdentifiers({ email: data.email, phone: data.phone });

  const teamResult = await admin
    .from(RELATIONSHIPS)
    .select('person_id, label, role')
    .eq('workspace_id', workspaceId)
    .limit(LIST_LIMIT);
  if (teamResult.error) return { ok: false, error: 'Could not add that contact.', status: 500 };
  const teamContacts = (teamResult.data || []).map((row) => ({
    personId: text(asRow(row).person_id),
    label: text(asRow(row).label),
    role: text(asRow(row).role),
  }));

  const resolveOnce = async () =>
    resolvePerson(
      { label: data.label, role: data.role, identifiers },
      { byIdentifier: await lookupIdentifiers(admin, identifiers), teamContacts }
    );

  let resolution = await resolveOnce();
  let createdPersonId: string | null = null;

  if (resolution.kind === 'create') {
    const created = await admin
      .from(PERSON_PROFILES)
      .insert({
        display_name: data.label,
        status: 'unclaimed',
        visibility: 'private',
        created_by_workspace_id: workspaceId,
      })
      .select('id')
      .single();
    if (created.error || !created.data) return { ok: false, error: 'Could not add that contact.', status: 500 };
    createdPersonId = text(asRow(created.data).id);

    if (identifiers.length > 0) {
      const inserted = await admin
        .from(PERSON_IDENTIFIERS)
        .insert(identifiers.map((identifier) => ({ person_id: createdPersonId, ...identifier })));
      if (inserted.error) {
        // Somebody else added the same address a moment ago. Drop what was just
        // made and use theirs: two profiles for one email is the exact thing
        // the unique index exists to prevent.
        await admin.from(PERSON_PROFILES).delete().eq('id', createdPersonId);
        createdPersonId = null;
        resolution = await resolveOnce();
        if (resolution.kind === 'create') {
          return { ok: false, error: 'Could not add that contact. Try again.', status: 409 };
        }
      }
    }
  }

  const personId =
    resolution.kind === 'match' ? resolution.personId : (createdPersonId as string);
  const matchedVia = resolution.kind === 'match' ? resolution.via : null;

  // Does this team already have them? Then change nothing but a missing contact
  // detail.
  const existing = await admin
    .from(RELATIONSHIPS)
    .select('id, email, phone')
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId)
    .maybeSingle();
  if (existing.error) {
    if (createdPersonId) await admin.from(PERSON_PROFILES).delete().eq('id', createdPersonId);
    return { ok: false, error: 'Could not add that contact.', status: 500 };
  }

  let relationshipId: string;
  let created = false;
  if (existing.data) {
    const row = asRow(existing.data);
    relationshipId = text(row.id);
    const fill: Record<string, unknown> = {};
    if (!row.email && data.email) fill.email = data.email;
    if (!row.phone && data.phone) fill.phone = data.phone;
    if (Object.keys(fill).length > 0) {
      await admin
        .from(RELATIONSHIPS)
        .update(fill)
        .eq('workspace_id', workspaceId)
        .eq('id', relationshipId);
    }
  } else {
    const inserted = await admin
      .from(RELATIONSHIPS)
      .insert({
        workspace_id: workspaceId,
        person_id: personId,
        label: data.label,
        role: data.role,
        // Only sent when there is one, so adding somebody keeps working before
        // the My People migration adds the column.
        ...(data.company ? { company: data.company } : {}),
        tags: data.tags,
        notes: data.notes,
        rate_note: data.rateNote,
        last_contact_at: data.lastContactAt,
        email: data.email,
        phone: data.phone,
        source,
        created_by: actorUserId,
      })
      .select('id')
      .single();
    if (inserted.error || !inserted.data) {
      // Do not leave an unclaimed profile behind that no team points at.
      if (createdPersonId) await admin.from(PERSON_PROFILES).delete().eq('id', createdPersonId);
      return { ok: false, error: 'Could not add that contact.', status: 500 };
    }
    relationshipId = text(asRow(inserted.data).id);
    created = true;
  }

  // A matched person may be missing an identifier the team just supplied (they
  // knew the email, now we have the phone). Add it, but never move an
  // identifier that already belongs to somebody else.
  if (resolution.kind === 'match' && identifiers.length > 0) {
    const known = await lookupIdentifiers(admin, identifiers);
    const missing = identifiers.filter((identifier) => !known.has(identifierKey(identifier)));
    if (missing.length > 0) {
      await admin.from(PERSON_IDENTIFIERS).insert(missing.map((identifier) => ({ person_id: personId, ...identifier })));
    }
  }

  // Flags are about THIS team's own contacts, so both ends must be ones the team
  // has. A profile another team knows is never named in a flag here.
  const teamPeople = new Set(teamContacts.map((contact) => contact.personId));
  teamPeople.add(personId);
  const candidates: string[] = [];
  if (resolution.kind === 'create') for (const dup of resolution.possibleDuplicates) candidates.push(dup.personId);
  if (resolution.kind === 'match') for (const other of resolution.alsoMatched) candidates.push(other);

  let flagged = 0;
  for (const other of [...new Set(candidates)]) {
    if (other === personId || !teamPeople.has(other)) continue;
    const [personA, personB] = orderPair(personId, other);
    const result = await admin.from(DUPLICATE_FLAGS).upsert(
      {
        workspace_id: workspaceId,
        person_a: personA,
        person_b: personB,
        reason: resolution.kind === 'create' ? 'same_name' : 'shared_identifier',
      },
      { onConflict: 'workspace_id,person_a,person_b', ignoreDuplicates: true }
    );
    if (!result.error) flagged += 1;
  }

  return { ok: true, personId, relationshipId, created, matchedVia, flagged };
}

const PATCH_COLUMNS: Record<keyof RelationshipPatch, string> = {
  label: 'label',
  role: 'role',
  company: 'company',
  email: 'email',
  phone: 'phone',
  tags: 'tags',
  notes: 'notes',
  rateNote: 'rate_note',
  lastContactAt: 'last_contact_at',
};

/** A sparse edit to the team's own layer. Never touches the shared profile. */
export async function updateRelationship(
  admin: SupabaseClient,
  workspaceId: string,
  personId: string,
  patch: RelationshipPatch
): Promise<{ ok: true; relationship: RelationshipView } | Failure> {
  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) update[column] = value;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: 'Nothing to save.', status: 400 };

  const { data, error } = await admin
    .from(RELATIONSHIPS)
    .update(update)
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: 'Could not save that.', status: 500 };
  if (!data) return { ok: false, error: 'Contact not found.', status: 404 };
  return getRelationship(admin, workspaceId, personId);
}

/**
 * Removes the team's relationship. The person and their profile stay: others
 * may know them, and a claimed person keeps every credit they delivered.
 */
export async function removeRelationship(
  admin: SupabaseClient,
  workspaceId: string,
  personId: string
): Promise<{ ok: true } | Failure> {
  const { data, error } = await admin
    .from(RELATIONSHIPS)
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId)
    .select('id');
  if (error) return { ok: false, error: 'Could not remove that contact.', status: 500 };
  if (!data || data.length === 0) return { ok: false, error: 'Contact not found.', status: 404 };
  // Flags that named this person for this team no longer mean anything.
  await admin
    .from(DUPLICATE_FLAGS)
    .delete()
    .eq('workspace_id', workspaceId)
    .or(`person_a.eq.${personId},person_b.eq.${personId}`);
  // The team's log about them goes with the relationship, as its notes do.
  await admin.from(INTERACTIONS).delete().eq('workspace_id', workspaceId).eq('person_id', personId);
  return { ok: true };
}

export type InteractionView = {
  id: string;
  body: string;
  happenedAt: string;
};

const toInteraction = (row: Record<string, unknown>): InteractionView => ({
  id: text(row.id),
  body: text(row.body),
  happenedAt: text(row.happened_at),
});

/**
 * The team's short log about one person, newest first. Reads tolerantly: a
 * missing table (migration not applied yet) is an empty log, not an error.
 */
export async function listInteractions(
  admin: SupabaseClient,
  workspaceId: string,
  personId: string
): Promise<InteractionView[]> {
  try {
    const { data, error } = await admin
      .from(INTERACTIONS)
      .select('id, body, happened_at')
      .eq('workspace_id', workspaceId)
      .eq('person_id', personId)
      .order('happened_at', { ascending: false })
      .limit(INTERACTION_LIMIT);
    if (error || !data) return [];
    return data.map((row) => toInteraction(asRow(row)));
  } catch {
    return [];
  }
}

/**
 * Logs one interaction and moves the relationship's last contact to now, which
 * is what the list sorts by. Only for a person the team already has.
 */
export async function logInteraction(
  admin: SupabaseClient,
  input: { workspaceId: string; personId: string; actorUserId: string; body: string; now?: Date }
): Promise<{ ok: true; interaction: InteractionView; lastContactAt: string } | Failure> {
  const { workspaceId, personId, actorUserId, body } = input;
  const happenedAt = (input.now ?? new Date()).toISOString();

  const { data: existing, error: existingError } = await admin
    .from(RELATIONSHIPS)
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId)
    .maybeSingle();
  if (existingError) return { ok: false, error: 'Could not save that.', status: 500 };
  if (!existing) return { ok: false, error: 'Contact not found.', status: 404 };

  const { data, error } = await admin
    .from(INTERACTIONS)
    .insert({
      workspace_id: workspaceId,
      person_id: personId,
      body,
      happened_at: happenedAt,
      created_by: actorUserId,
    })
    .select('id, body, happened_at')
    .single();
  if (error || !data) return { ok: false, error: 'Could not save that.', status: 500 };

  await admin
    .from(RELATIONSHIPS)
    .update({ last_contact_at: happenedAt })
    .eq('workspace_id', workspaceId)
    .eq('person_id', personId);

  return { ok: true, interaction: toInteraction(asRow(data)), lastContactAt: happenedAt };
}

export type DuplicateFlagView = {
  id: string;
  reason: string;
  a: { personId: string; label: string };
  b: { personId: string; label: string };
};

/** Open duplicate flags, each end labelled with what THIS team calls them. */
export async function listDuplicateFlags(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ ok: true; flags: DuplicateFlagView[] } | Failure> {
  const flagResult = await admin
    .from(DUPLICATE_FLAGS)
    .select('id, person_a, person_b, reason')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(200);
  if (flagResult.error) return { ok: false, error: 'Could not load suggestions.', status: 500 };

  const rows = (flagResult.data || []).map(asRow);
  const ids = [...new Set(rows.flatMap((row) => [text(row.person_a), text(row.person_b)]))];
  const labels = new Map<string, string>();
  for (const group of chunk(ids, ID_CHUNK)) {
    const { data } = await admin
      .from(RELATIONSHIPS)
      .select('person_id, label')
      .eq('workspace_id', workspaceId)
      .in('person_id', group);
    for (const row of data || []) labels.set(text(asRow(row).person_id), text(asRow(row).label));
  }

  // A flag whose either end the team no longer has is stale. Leave it out.
  const flags: DuplicateFlagView[] = [];
  for (const row of rows) {
    const a = text(row.person_a);
    const b = text(row.person_b);
    if (!labels.has(a) || !labels.has(b)) continue;
    flags.push({
      id: text(row.id),
      reason: text(row.reason),
      a: { personId: a, label: labels.get(a) as string },
      b: { personId: b, label: labels.get(b) as string },
    });
  }
  return { ok: true, flags };
}

/** "These are different people": the pair stops being suggested. */
export async function dismissDuplicateFlag(
  admin: SupabaseClient,
  workspaceId: string,
  flagId: string,
  actorUserId: string
): Promise<{ ok: true } | Failure> {
  const { data, error } = await admin
    .from(DUPLICATE_FLAGS)
    .update({ status: 'dismissed', resolved_by: actorUserId, resolved_at: new Date().toISOString() })
    .eq('id', flagId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .select('id');
  if (error) return { ok: false, error: 'Could not save that.', status: 500 };
  if (!data || data.length === 0) return { ok: false, error: 'Suggestion not found.', status: 404 };
  return { ok: true };
}
