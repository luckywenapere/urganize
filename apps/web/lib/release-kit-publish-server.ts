import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveSectionStatus, normalizeKitSlug } from '@/lib/press-kits';
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
      error: 'Add a contact email to the artist kit first, so people know who to write to.',
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
