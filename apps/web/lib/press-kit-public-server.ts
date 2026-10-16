/**
 * Server-side assembly for the public press kit at /k/{slug}.
 *
 * Shaped after lib/epk-server.ts, which is this codebase's pattern for a
 * public page assembled from several tables: one service-role client, per
 * source tolerance, and ONE answer for every failure. A flag that is off, a
 * slug nobody ever had, a kit that was never published and a database that is
 * down all return null, so the page cannot tell a reader which of those it
 * hit. That is deliberate. A page that says "this kit exists but is not
 * published yet" tells a stranger an artist is preparing something.
 *
 * Never throws.
 */

import { isReleaseIdShape } from '@/lib/press-kit-public';
import { loadPitchKit } from '@/lib/release-epk-server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadArtistPhotoUrls } from './profile-photo-server';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import { isKitLive, publicSections, type PublicKitSection } from '@/lib/press-kit-public';
import type { PressKitSectionContent, PressKitVisibility } from '@/types/press-kits';

export const isPressKitsFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true';

export type PublicKitPhoto = {
  id: string;
  url: string;
  fileName: string;
  photographerCredit: string;
  usageRights: string;
  width: number | null;
  height: number | null;
};

export type PublicPressKit = {
  kitId: string;
  /** The artist the kit is for. Server-side only: the page uses it to check a
   *  `?r=` release belongs to this artist, and never renders it. */
  artistId: string;
  slug: string;
  artistName: string;
  visibility: PressKitVisibility;
  embargoDate: string | null;
  availableForInterview: boolean;
  sections: PublicKitSection[];
  /** Section content keyed for the page's own lookups, so it does not have to
   *  scan the ordered list to find the header. */
  byKey: Record<string, PressKitSectionContent>;
  photos: PublicKitPhoto[];
  /** The artist's profile photo (roster face), signed. Null when none. */
  artistPhotoUrl?: string | null;
};

function createServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/** Mirrors press_kits_slug_shape_check. A cheap check keeps junk paths from
 *  reaching the database at all. */
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

const asContent = (value: unknown): PressKitSectionContent =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as PressKitSectionContent)
    : {};

/**
 * Resolve a slug to the kit a stranger sees, or null.
 *
 * The photos are signed individually and a photo that will not sign is
 * dropped, so one bad object costs that photo rather than the page.
 */
export async function loadPublicPressKit(slug: string): Promise<PublicPressKit | null> {
  if (!isPressKitsFeatureEnabled()) return null;

  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized || normalized.length > 60 || !SLUG_SHAPE.test(normalized)) return null;

  const client = createServiceClient();
  if (!client) return null;

  try {
    const { data: kitData, error: kitError } = await client
      .from('press_kits')
      .select('id,artist_id,slug,visibility,embargo_date,available_for_interview,published_at')
      .eq('slug', normalized)
      .maybeSingle();

    if (kitError) return null;
    const kit = asRow(kitData);
    if (!kit.id) return null;
    if (!isKitLive(kit.published_at ? String(kit.published_at) : null)) return null;

    const kitId = String(kit.id);

    const [artistResult, sectionResult, photoResult] = await Promise.all([
      client.from('artists').select('name').eq('id', String(kit.artist_id || '')).maybeSingle(),
      client
        .from('press_kit_sections')
        .select('section,published_content,hidden,position')
        .eq('kit_id', kitId)
        .order('position', { ascending: true }),
      client
        .from('press_kit_assets')
        .select('id,file_name,storage_bucket,storage_path,width,height,photographer_credit,usage_rights,position')
        .eq('kit_id', kitId)
        .eq('kind', 'press_photo')
        .order('position', { ascending: true }),
    ]);

    // Per source tolerance: a failed read yields a kit without that part rather
    // than no kit. An artist row we cannot read is the one exception, since a
    // press kit with no name on it is not worth rendering.
    const artistName = String(asRow(artistResult.data).name || '').trim();
    if (!artistName) return null;

    const sectionRows = sectionResult.error
      ? []
      : (sectionResult.data || []).map((row) => {
          const record = asRow(row);
          return {
            section: String(record.section || '') as PublicKitSection['section'],
            publishedContent:
              record.published_content === null || record.published_content === undefined
                ? null
                : asContent(record.published_content),
            hidden: record.hidden === true,
          };
        });

    const sections = publicSections(sectionRows);
    const byKey: Record<string, PressKitSectionContent> = {};
    for (const entry of sections) byKey[entry.section] = entry.content;

    const photoRows = photoResult.error ? [] : (photoResult.data || []).map((row) => asRow(row));
    const photoUrls = await Promise.all(
      photoRows.map((row) =>
        generateSignedUrl(
          client,
          String(row.storage_bucket || RELEASE_ASSETS_BUCKET),
          String(row.storage_path || ''),
          ASSET_SIGNED_URL_TTL_SECONDS
        )
      )
    );

    // The roster face, in its own tolerant read: no photo or a failure is
    // simply no face in the header (lib/profile-photo-server.ts).
    const artistPhotoUrl =
      (await loadArtistPhotoUrls(client, [String(kit.artist_id || '')])).get(String(kit.artist_id || '')) ?? null;

    const photos: PublicKitPhoto[] = photoRows
      .map((row, index) => ({
        id: String(row.id || ''),
        url: photoUrls[index] || '',
        fileName: String(row.file_name || ''),
        photographerCredit: String(row.photographer_credit || ''),
        usageRights: String(row.usage_rights || ''),
        width: typeof row.width === 'number' ? row.width : null,
        height: typeof row.height === 'number' ? row.height : null,
      }))
      .filter((photo) => Boolean(photo.url));

    return {
      kitId,
      artistId: String(kit.artist_id || ''),
      slug: String(kit.slug || normalized),
      artistName,
      artistPhotoUrl,
      visibility: (kit.visibility as PressKitVisibility) || 'public',
      embargoDate: kit.embargo_date ? String(kit.embargo_date) : null,
      availableForInterview: kit.available_for_interview === true,
      sections,
      byKey,
      photos,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a slug and a photo id together, for the public download.
 *
 * Both halves matter. The slug has to resolve to a PUBLISHED kit, or a link
 * taken down a minute ago would still hand out files; and the photo has to
 * belong to that kit, or an id lifted from one artist's page would download
 * from another's. The second check is the same defence-in-depth the owner side
 * carries, and it is the reason this does not simply look the asset up by id.
 */
export async function loadPublicKitPhoto(
  slug: string,
  assetId: string
): Promise<{ kitId: string; storageBucket: string; storagePath: string; fileName: string } | null> {
  if (!isPressKitsFeatureEnabled()) return null;

  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized || !SLUG_SHAPE.test(normalized)) return null;
  if (!String(assetId || '').trim()) return null;

  const client = createServiceClient();
  if (!client) return null;

  try {
    const { data: kitData } = await client
      .from('press_kits')
      .select('id,published_at')
      .eq('slug', normalized)
      .maybeSingle();

    const kit = asRow(kitData);
    if (!kit.id) return null;
    if (!isKitLive(kit.published_at ? String(kit.published_at) : null)) return null;

    const kitId = String(kit.id);

    const { data: photoData } = await client
      .from('press_kit_assets')
      .select('id,kit_id,file_name,storage_bucket,storage_path')
      .eq('id', assetId)
      .maybeSingle();

    const photo = asRow(photoData);
    if (!photo.id || String(photo.kit_id || '') !== kitId) return null;

    return {
      kitId,
      storageBucket: String(photo.storage_bucket || RELEASE_ASSETS_BUCKET),
      storagePath: String(photo.storage_path || ''),
      fileName: String(photo.file_name || 'press-photo'),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a slug to its kit id alone, for the view beacon.
 *
 * Deliberately lighter than loadPublicPressKit: recording a view must not cost
 * a second assembly of the whole page.
 */
export async function resolvePublishedKitId(slug: string): Promise<string | null> {
  if (!isPressKitsFeatureEnabled()) return null;
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized || !SLUG_SHAPE.test(normalized)) return null;

  const client = createServiceClient();
  if (!client) return null;

  try {
    const { data } = await client
      .from('press_kits')
      .select('id,published_at')
      .eq('slug', normalized)
      .maybeSingle();
    const kit = asRow(data);
    if (!kit.id) return null;
    if (!isKitLive(kit.published_at ? String(kit.published_at) : null)) return null;
    return String(kit.id);
  } catch {
    return null;
  }
}

/**
 * Record that somebody opened a kit, or took a photo from it.
 *
 * Written with the service-role client on behalf of someone who has no session,
 * which is why press_kit_events has a SELECT policy and no write policy at all.
 *
 * What it can answer: how many times, when, and which photo. What it can NEVER
 * answer is WHO, and that is a consequence of the design rather than an
 * omission. Section 2 of the brief fixes one permanent link per artist, so
 * there are no per-recipient tokens of the kind that let a DJ pack name its
 * reader.
 *
 * Fire and forget. A tracking write must never fail a page view or a download,
 * so every failure is swallowed.
 */
export async function recordPressKitEvent(params: {
  kitId: string;
  action: 'viewed' | 'downloaded_asset' | 'downloaded_all';
  assetId?: string | null;
  assetFileName?: string | null;
}): Promise<void> {
  if (!isPressKitsFeatureEnabled()) return;
  const client = createServiceClient();
  if (!client) return;

  try {
    const { data } = await client
      .from('press_kits')
      .select('owner_user_id')
      .eq('id', params.kitId)
      .maybeSingle();

    const ownerUserId = String(asRow(data).owner_user_id || '');
    if (!ownerUserId) return;

    await client.from('press_kit_events').insert({
      owner_user_id: ownerUserId,
      kit_id: params.kitId,
      action: params.action,
      asset_id: params.assetId || null,
      // Denormalized so the record still reads correctly after the photo it
      // names is replaced or removed.
      asset_file_name: params.assetFileName || null,
    });
  } catch {
    /* a view that went unrecorded is not worth an error page */
  }
}

/** What a rollout adds on top of the artist kit at /k/{slug}?r={releaseId}. */
export type PublicReleaseStory = {
  title: string;
  releaseDate: string | null;
  story: string;
  credits: Array<{ name: string; role: string }>;
  coverUrl: string | null;
};

/**
 * The release block for the merged kit (2026-10-16). Null unless the release
 * exists, belongs to the SAME artist as the published kit, and has a story or
 * credits worth showing: an id lifted from another artist's link, a junk id or
 * an empty kit all quietly render the plain artist kit instead.
 */
export async function loadPublicReleaseStory(
  kit: Pick<PublicPressKit, 'artistId'>,
  releaseId: string | null | undefined
): Promise<PublicReleaseStory | null> {
  if (!isReleaseIdShape(releaseId) || !kit.artistId) return null;
  const client = createServiceClient();
  if (!client) return null;
  try {
    const result = await loadPitchKit(client, releaseId.trim().toLowerCase());
    if ('error' in result) return null;
    const { pitchKit } = result;
    if (pitchKit.release.artistId !== kit.artistId) return null;
    const story = pitchKit.fields.story.trim();
    const credits = pitchKit.credits
      .map((credit) => ({ name: credit.name.trim(), role: credit.role.trim() }))
      .filter((credit) => credit.name);
    if (!story && credits.length === 0) return null;
    return {
      title: pitchKit.release.title,
      releaseDate: pitchKit.release.releaseDate,
      story,
      credits,
      coverUrl: pitchKit.coverUrl,
    };
  } catch {
    return null;
  }
}
