import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET, generateSignedUrl, generateThumbSignedUrls } from './asset-helpers';
import { PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS } from './profile-photo';
import { readTestRelease } from './test-release';
import { pickCreditTiles, pickManagedFaces, type CreditTile, type ManagedFace } from './person-page';

/**
 * What the claimed /p/{slug} page (URG-305) adds on top of loadPublicPerson:
 * the artists the person manages and the cover art of the releases they are on.
 *
 * EVERY READ IS TOLERANT AND NEVER THROWS. Each part answers empty on any
 * failure, and the page hides an empty part, so a hiccup costs the page a row,
 * never the page.
 *
 * COVERS, NEVER TITLES. The 2026-09-05 founder call keeps release titles off
 * this page; the URG-305 design (approved by the founder) puts a credits grid
 * on it. The grid is the artwork only, of releases that came out (a delivery
 * record or an attested, visible credit), minus test rollouts and minus any
 * credit the person hid as "not mine".
 */

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type PersonPageExtras = {
  managed: { count: number; faces: ManagedFace[] };
  /** Distinct releases on the record. Zero hides the stat. */
  releases: number;
  credits: CreditTile[];
};

export const EMPTY_PERSON_PAGE_EXTRAS: PersonPageExtras = {
  managed: { count: 0, faces: [] },
  releases: 0,
  credits: [],
};

async function sign(admin: SupabaseClient, bucket: string, path: string): Promise<string | null> {
  try {
    return (await generateSignedUrl(admin, bucket, path, PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS)) || null;
  } catch {
    return null;
  }
}

async function loadManaged(
  admin: SupabaseClient,
  userId: string,
  thumbs: boolean
): Promise<PersonPageExtras['managed']> {
  try {
    const { data, error } = await admin
      .from('artists')
      .select('id, name, photo_path')
      .eq('owner_user_id', userId)
      .limit(200);
    if (error || !data) return EMPTY_PERSON_PAGE_EXTRAS.managed;
    const rows = data.map(asRow).map((row) => ({
      id: text(row.id),
      name: text(row.name),
      photoPath: text(row.photo_path) || null,
    }));
    const picked = pickManagedFaces(rows);
    // The page draws these at 68px, so it reads the 384px copies
    // (lib/image-thumb.ts). The share card keeps the originals: its renderer
    // takes PNG/JPEG, and a thumb may be WebP.
    const small = thumbs
      ? await generateThumbSignedUrls(
          admin,
          RELEASE_ASSETS_BUCKET,
          picked.map((row) => row.photoPath || '').filter(Boolean),
          PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS
        ).catch(() => new Map<string, string>())
      : new Map<string, string>();
    const faces = await Promise.all(
      picked.map(async (row) => ({
        id: row.id,
        name: row.name,
        photoUrl: row.photoPath
          ? small.get(row.photoPath) ?? (await sign(admin, RELEASE_ASSETS_BUCKET, row.photoPath))
          : null,
      }))
    );
    return { count: rows.filter((row) => row.name).length, faces };
  } catch {
    return EMPTY_PERSON_PAGE_EXTRAS.managed;
  }
}

async function loadCredits(
  admin: SupabaseClient,
  input: { userId: string; personId: string },
  thumbs: boolean
): Promise<Pick<PersonPageExtras, 'releases' | 'credits'>> {
  try {
    const [records, submissions] = await Promise.all([
      admin.from('delivery_records').select('release_id').eq('user_id', input.userId).limit(500),
      admin
        .from('release_credit_submissions')
        .select('release_id, confirmed_accurate, person_hidden')
        .eq('person_id', input.personId)
        .limit(500),
    ]);
    const hidden = new Set<string>();
    const ids = new Set<string>();
    for (const row of (records.data || []).map(asRow)) if (text(row.release_id)) ids.add(text(row.release_id));
    for (const row of (submissions.data || []).map(asRow)) {
      const id = text(row.release_id);
      if (!id) continue;
      if (row.person_hidden === true) hidden.add(id);
      else if (row.confirmed_accurate === true) ids.add(id);
    }
    for (const id of hidden) ids.delete(id);
    if (ids.size === 0) return { releases: 0, credits: [] };

    const { data: releaseRows, error } = await admin
      .from('releases')
      .select('id, artwork_asset_id, release_date, metadata')
      .in('id', [...ids].slice(0, 300));
    if (error || !releaseRows) return { releases: 0, credits: [] };
    const releases = releaseRows
      .map(asRow)
      .filter((row) => !readTestRelease(row.metadata as never))
      .map((row) => ({
        id: text(row.id),
        artworkAssetId: text(row.artwork_asset_id) || null,
        releaseDate: text(row.release_date) || null,
      }));

    const picked = pickCreditTiles(releases);
    const assetIds = picked.map((entry) => entry.artworkAssetId).filter((id): id is string => Boolean(id));
    const assets = new Map<string, { bucket: string; path: string }>();
    if (assetIds.length > 0) {
      const { data: assetRows } = await admin
        .from('assets')
        .select('id, storage_bucket, storage_path, mime_type')
        .in('id', assetIds);
      for (const row of (assetRows || []).map(asRow)) {
        const mime = text(row.mime_type).toLowerCase();
        if (!text(row.storage_path) || (mime && !mime.startsWith('image/'))) continue;
        assets.set(text(row.id), { bucket: text(row.storage_bucket) || RELEASE_ASSETS_BUCKET, path: text(row.storage_path) });
      }
    }
    // The page draws each cover as a ~113-143px tile (a third of the 480px
    // column), so it reads the 384px copies (lib/image-thumb.ts): sharp at 2x,
    // and a few KB instead of a multi-MB master. One batched sign per bucket;
    // a cover with no thumb (uploaded before thumbs) falls back to its
    // original. The share card keeps originals: its renderer takes PNG/JPEG,
    // and a thumb may be WebP.
    const small = new Map<string, string>();
    if (thumbs) {
      const byBucket = new Map<string, string[]>();
      for (const asset of assets.values()) {
        byBucket.set(asset.bucket, [...(byBucket.get(asset.bucket) || []), asset.path]);
      }
      await Promise.all(
        [...byBucket].map(async ([bucket, paths]) => {
          const urls = await generateThumbSignedUrls(admin, bucket, paths, PROFILE_PHOTO_SIGNED_URL_TTL_SECONDS).catch(
            () => new Map<string, string>()
          );
          for (const [path, url] of urls) small.set(`${bucket}/${path}`, url);
        })
      );
    }
    const credits = (
      await Promise.all(
        picked.map(async (entry) => {
          const asset = entry.artworkAssetId ? assets.get(entry.artworkAssetId) : undefined;
          const url = asset
            ? small.get(`${asset.bucket}/${asset.path}`) ?? (await sign(admin, asset.bucket, asset.path))
            : null;
          return url ? { id: entry.id, coverUrl: url } : null;
        })
      )
    ).filter((entry): entry is CreditTile => entry !== null);
    return { releases: releases.length, credits };
  } catch {
    return { releases: 0, credits: [] };
  }
}

export async function loadPersonPageExtras(
  admin: SupabaseClient,
  input: { userId: string; personId: string },
  /** thumbs: managed faces and credit covers from their small copies (the page; never the share card). */
  options: { thumbs?: boolean } = {}
): Promise<PersonPageExtras> {
  if (!input.userId) return EMPTY_PERSON_PAGE_EXTRAS;
  const [managed, credits] = await Promise.all([
    loadManaged(admin, input.userId, options.thumbs === true),
    loadCredits(admin, input, options.thumbs === true),
  ]);
  return { managed, ...credits };
}
