import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveSectionStatus, normalizeKitSlug, shouldCoalesceVersion } from '@/lib/press-kits';
import { applyAutofill } from '@/lib/press-kit-autofill-server';
import { kitLinkPath } from '@/lib/press-kit-public';
import { PRESS_KIT_SECTIONS, type PressKitSection } from '@/types/press-kits';

// "Copy kit link" from a rollout's Pitch this! scene (2026-10-16, founder
// approved: copying the link publishes the kit). Until then a manager had to
// leave the rollout for the artist press kit editor, find the publish switch
// and come back, and no outside manager ever did: 0 outside kits published,
// so a pitch never had a kit to carry.
//
// What this does, and what it deliberately does not:
// - No kit yet: create the artist's kit exactly the way the press kit editor
//   does (same slug candidates, same twelve sections, same autofill).
// - Kit not live: copy every section's content into published_content and
//   stamp it published, the same two writes the editor's Publish makes.
// - Kit ALREADY live: change nothing. Re-copying would publish whatever is
//   half typed in the editor right now, which is the one thing the two
//   columns exist to prevent.
// - The editor's gate is "the contact block is ready", which also wants a job
//   title per contact. The title is left blank on purpose (founder call: the
//   product only knows permission levels), so here the gate is the part that
//   matters to a reader: at least one contact with an email. Nothing is made
//   up to pass it.

const KITS = 'press_kits';
const SECTIONS = 'press_kit_sections';
const KIT_COLUMNS = 'id,artist_id,slug,state,published_at';

export type PublishKitResult =
  | { ok: true; slug: string; path: string; created: boolean; published: boolean }
  | { ok: false; status: number; error: string; code?: 'no_artist' | 'no_contact' };

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const asRow = (value: unknown): Record<string, unknown> => (value || {}) as Record<string, unknown>;

const slugCandidates = (name: string, artistId: string): string[] => {
  const base = normalizeKitSlug(name);
  if (!base) return [`artist-${artistId.slice(0, 8)}`];
  return [base, `${base}-2`, `${base}-3`, `${base}-${artistId.slice(0, 6)}`];
};

/** At least one contact a reader can actually email. */
export function hasEmailableContact(content: unknown): boolean {
  const contacts = asRow(content).contacts;
  if (!Array.isArray(contacts)) return false;
  return contacts.some((entry) => /\S+@\S+\.\S+/.test(text(asRow(entry).email).trim()));
}

async function createKit(
  admin: SupabaseClient,
  artist: { id: string; name: string; workspaceId: string; ownerUserId: string }
): Promise<Record<string, unknown> | null> {
  for (const slug of slugCandidates(artist.name, artist.id)) {
    const attempt = await admin
      .from(KITS)
      .insert({ owner_user_id: artist.ownerUserId, artist_id: artist.id, slug })
      .select(KIT_COLUMNS)
      .maybeSingle();
    if (!attempt.error && attempt.data) {
      const kit = asRow(attempt.data);
      const kitId = text(kit.id);
      const rows = PRESS_KIT_SECTIONS.map((section, index) => ({
        owner_user_id: artist.ownerUserId,
        kit_id: kitId,
        section,
        content: {},
        status: deriveSectionStatus(section, {}, { photoCount: 0 }),
        source: 'autofill' as const,
        position: index + 1,
        hidden: false,
      }));
      const sections = await admin.from(SECTIONS).insert(rows);
      if (sections.error) {
        await admin.from(KITS).delete().eq('id', kitId);
        return null;
      }
      const fresh = PRESS_KIT_SECTIONS.map(
        (section, index): PressKitSection => ({
          id: '',
          section,
          content: {},
          publishedContent: null,
          status: 'empty',
          source: 'autofill',
          position: index + 1,
          hidden: false,
          updatedBy: null,
          updatedAt: '',
        })
      );
      await applyAutofill(admin, {
        kitId,
        artistId: artist.id,
        workspaceId: artist.workspaceId,
        ownerUserId: artist.ownerUserId,
        sections: fresh,
      });
      return kit;
    }
    if (attempt.error?.code !== '23505') return null;
    const raced = await admin.from(KITS).select(KIT_COLUMNS).eq('artist_id', artist.id).maybeSingle();
    if (raced.data) return asRow(raced.data);
  }
  return null;
}

/**
 * Make sure the rollout's artist has a live kit, and hand back the link for
 * this rollout. The caller has already checked write access to the release.
 */
export async function publishReleaseKit(admin: SupabaseClient, releaseId: string): Promise<PublishKitResult> {
  const release = await admin.from('releases').select('id,artist_id').eq('id', releaseId).maybeSingle();
  if (release.error) return { ok: false, status: 500, error: 'Could not load the rollout.' };
  const artistId = text(asRow(release.data).artist_id);
  if (!artistId) {
    return { ok: false, status: 400, code: 'no_artist', error: 'Pick the artist for this rollout first.' };
  }

  const artistResult = await admin
    .from('artists')
    .select('id,workspace_id,owner_user_id,name')
    .eq('id', artistId)
    .maybeSingle();
  const artistRow = asRow(artistResult.data);
  if (artistResult.error || !artistRow.id) {
    return { ok: false, status: 400, code: 'no_artist', error: 'Pick the artist for this rollout first.' };
  }
  const artist = {
    id: artistId,
    name: text(artistRow.name),
    workspaceId: text(artistRow.workspace_id),
    ownerUserId: text(artistRow.owner_user_id),
  };

  let created = false;
  const existing = await admin.from(KITS).select(KIT_COLUMNS).eq('artist_id', artistId).maybeSingle();
  if (existing.error) return { ok: false, status: 500, error: 'Could not load the kit.' };
  let kit = existing.data ? asRow(existing.data) : null;
  if (!kit) {
    kit = await createKit(admin, artist);
    if (!kit) return { ok: false, status: 500, error: 'Could not make the kit. Try again.' };
    created = true;
  }

  const kitId = text(kit.id);
  const slug = text(kit.slug);
  if (kit.published_at) {
    return { ok: true, slug, path: kitLinkPath(slug, releaseId), created, published: false };
  }

  const sectionResult = await admin.from(SECTIONS).select('id,section,content,hidden').eq('kit_id', kitId);
  if (sectionResult.error) return { ok: false, status: 500, error: 'Could not read the kit.' };
  const sections = (sectionResult.data || []).map(asRow);
  const contact = sections.find((row) => row.section === 'contact');
  if (!contact || contact.hidden === true || !hasEmailableContact(contact.content)) {
    return {
      ok: false,
      status: 400,
      code: 'no_contact',
      error: 'Add who to write to under About the artist first.',
    };
  }

  for (const row of sections) {
    const { error } = await admin
      .from(SECTIONS)
      .update({ published_content: row.content ?? {} })
      .eq('id', text(row.id))
      .eq('kit_id', kitId);
    if (error) return { ok: false, status: 500, error: 'Could not publish the kit.' };
  }
  const stamp = await admin
    .from(KITS)
    .update({ state: 'published', published_at: new Date().toISOString() })
    .eq('id', kitId);
  if (stamp.error) return { ok: false, status: 500, error: 'Could not publish the kit.' };

  return { ok: true, slug, path: kitLinkPath(slug, releaseId), created, published: true };
}

// ---------------------------------------------------------------------------
// The artist's bio and contact, edited inline in Pitch this! (2026-10-17,
// founder approved mocks "cuts-3", Option B). The standalone press kit editor
// is hidden, so the About row is the one place a person types the two things
// the kit link needs from the artist: a short bio and who to write to.
//
// - No kit yet: make it the same way "Copy kit link" does (createKit above).
// - Writes bios.short and the first contact's email, nothing else, and marks
//   both sections as typed by a person so autofill leaves them alone.
// - The kit is already live: these two sections are also copied into
//   published_content. With the editor gone there is no other Publish, so an
//   edit made here has to reach the public page. Other sections are left as
//   they are (the "never re-publish half-typed work" rule still holds for them).
// ---------------------------------------------------------------------------

export const MAX_INLINE_BIO_LENGTH = 1000;
export const MAX_INLINE_EMAIL_LENGTH = 254;

export type ArtistKitPatch = { shortBio?: string; contactEmail?: string };

export type SaveArtistKitResult =
  | { ok: true; created: boolean }
  | { ok: false; status: number; error: string; code?: 'no_artist' | 'bad_email' };

const looksLikeEmail = (value: string): boolean => /^\S+@\S+\.\S+$/.test(value);

/** Pure: the contact block after setting the first contact's email. An empty
 *  email drops a contact that carries nothing else, so clearing the box does
 *  not leave a blank person on the public page. */
export function withContactEmail(content: unknown, email: string): Record<string, unknown> {
  const base = { ...asRow(content) };
  const contacts = Array.isArray(base.contacts) ? base.contacts.map((entry) => ({ ...asRow(entry) })) : [];
  const trimmed = email.trim();
  if (contacts.length === 0) {
    if (trimmed) contacts.push({ name: '', role: '', email: trimmed });
  } else if (trimmed) {
    contacts[0] = { ...contacts[0], email: trimmed };
  } else if (!text(contacts[0].name).trim() && !text(contacts[0].role).trim()) {
    contacts.shift();
  } else {
    contacts[0] = { ...contacts[0], email: '' };
  }
  return { ...base, contacts };
}

/** The email shown in the About row: the first contact's, as stored. */
export function firstContactEmail(content: unknown): string {
  const contacts = asRow(content).contacts;
  if (!Array.isArray(contacts) || contacts.length === 0) return '';
  return text(asRow(contacts[0]).email);
}

export async function saveReleaseKitArtist(
  admin: SupabaseClient,
  input: { releaseId: string; actorUserId: string; patch: ArtistKitPatch }
): Promise<SaveArtistKitResult> {
  const { patch } = input;
  if (patch.contactEmail !== undefined) {
    const email = patch.contactEmail.trim();
    if (email.length > MAX_INLINE_EMAIL_LENGTH || (email && !looksLikeEmail(email))) {
      return { ok: false, status: 400, code: 'bad_email', error: 'That email doesn’t look right.' };
    }
  }

  const release = await admin.from('releases').select('id,artist_id').eq('id', input.releaseId).maybeSingle();
  if (release.error) return { ok: false, status: 500, error: 'Could not load the rollout.' };
  const artistId = text(asRow(release.data).artist_id);
  if (!artistId) {
    return { ok: false, status: 400, code: 'no_artist', error: 'Pick the artist for this rollout first.' };
  }
  const artistResult = await admin
    .from('artists')
    .select('id,workspace_id,owner_user_id,name')
    .eq('id', artistId)
    .maybeSingle();
  const artistRow = asRow(artistResult.data);
  if (artistResult.error || !artistRow.id) {
    return { ok: false, status: 400, code: 'no_artist', error: 'Pick the artist for this rollout first.' };
  }

  let created = false;
  const existing = await admin.from(KITS).select(KIT_COLUMNS).eq('artist_id', artistId).maybeSingle();
  if (existing.error) return { ok: false, status: 500, error: 'Could not load the kit.' };
  let kit = existing.data ? asRow(existing.data) : null;
  if (!kit) {
    kit = await createKit(admin, {
      id: artistId,
      name: text(artistRow.name),
      workspaceId: text(artistRow.workspace_id),
      ownerUserId: text(artistRow.owner_user_id),
    });
    if (!kit) return { ok: false, status: 500, error: 'Could not make the kit. Try again.' };
    created = true;
  }
  const kitId = text(kit.id);
  const live = Boolean(kit.published_at);

  const wanted: Array<'bios' | 'contact'> = [];
  if (patch.shortBio !== undefined) wanted.push('bios');
  if (patch.contactEmail !== undefined) wanted.push('contact');
  if (wanted.length === 0) return { ok: true, created };

  const rows = await admin
    .from(SECTIONS)
    .select('id,section,content,owner_user_id')
    .eq('kit_id', kitId)
    .in('section', wanted);
  if (rows.error) return { ok: false, status: 500, error: 'Could not read the kit.' };

  for (const name of wanted) {
    const row = (rows.data || []).map(asRow).find((r) => r.section === name);
    if (!row) return { ok: false, status: 500, error: 'Could not read the kit.' };
    const before = asRow(row.content);
    const content =
      name === 'bios'
        ? { ...before, short: (patch.shortBio ?? '').slice(0, MAX_INLINE_BIO_LENGTH) }
        : withContactEmail(before, patch.contactEmail ?? '');
    if (JSON.stringify(content) === JSON.stringify(before)) continue;

    // File what is being replaced, the same rule as the section autosave.
    if (Object.keys(before).length > 0) {
      const newest = await admin
        .from('press_kit_section_versions')
        .select('created_at,saved_by')
        .eq('section_id', text(row.id))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const newestRow = newest.data ? asRow(newest.data) : null;
      const coalesce = shouldCoalesceVersion(
        newestRow
          ? { createdAt: text(newestRow.created_at), savedBy: newestRow.saved_by ? text(newestRow.saved_by) : null }
          : null,
        input.actorUserId
      );
      if (!coalesce) {
        await admin.from('press_kit_section_versions').insert({
          owner_user_id: text(row.owner_user_id),
          section_id: text(row.id),
          content: before,
          saved_by: input.actorUserId,
        });
      }
    }

    const update: Record<string, unknown> = {
      content,
      status: deriveSectionStatus(name, content, { photoCount: 0 }),
      source: 'user',
      updated_by: input.actorUserId,
    };
    if (live) update.published_content = content;
    const { error } = await admin.from(SECTIONS).update(update).eq('id', text(row.id)).eq('kit_id', kitId);
    if (error) return { ok: false, status: 500, error: 'Could not save that.' };
  }
  return { ok: true, created };
}
