import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import { SONG_CATEGORY } from '@/lib/song';
import type { ReleaseSong } from '@/types/song';

/**
 * Shared helpers for the song route group: the feature flag, the local
 * ownership check, the row mapper, and the "what songs does this release have"
 * read every handler needs.
 *
 * NO schema-missing fallback here, deliberately — environments are assumed
 * migrated (CLAUDE.md, "Patterns being deprecated in v1"), a missing table
 * surfaces as a normal 500, and `lib/schema-fallback-guard.test.ts` fails the
 * build for any new file that reaches for those helpers. This is also why the
 * ownership check below is local rather than the one in
 * `app/api/releases/_shared.ts`: that module carries the deprecated pattern.
 * Same contract as the EPK and content-calendar groups it copies — 404, never
 * 403, when the release is missing or someone else's.
 */

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported so this
// group's import sites stay stable (the releases/_shared.ts convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const ASSETS_TABLE = 'assets';

/**
 * The whole song surface stays dark until this is 'true' — the scene, its pill,
 * the UrgAns tools' entry point, and every handler below. Checked FIRST in each
 * handler so a direct API call cannot reach the feature either (the plan/EPK
 * route precedent).
 *
 * Deliberately its own flag rather than NEXT_PUBLIC_FEATURE_FILES: the founder
 * switched the general file cabinet off in URG-182, and putting the song behind
 * that switch would mean the two can only ever be on together. They are
 * different asks — "attach the master to this release" is not "bring back the
 * file manager" — even though they share one storage model underneath.
 */
export const isSongFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';

/** The flag-off answer. Byte-identical to every other flag gate in the app,
 * which is what lets `isFlagGateOff` in the UrgAns tool layer tell it apart
 * from a genuine "that release is not yours" 404. */
export const notFoundResponse = (): NextResponse =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export async function ensureReleaseOwnership(
  adminClient: AdminClient,
  releaseId: string,
  userId: string
): Promise<{ error: NextResponse } | { releaseId: string; ownerUserId: string }> {
  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,owner_user_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load release.' },
        { status: 500 }
      ),
    };
  }

  if (!release || String(release.owner_user_id || '') !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return { releaseId: String(release.id || ''), ownerUserId: String(release.owner_user_id || '') };
}

type AssetRow = {
  id: string;
  release_id: string | null;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string;
  created_at: string;
};

/** Only what the song surfaces render — see the note on ReleaseSong. */
const SONG_COLUMNS = 'id,release_id,file_name,file_size,mime_type,storage_bucket,storage_path,created_at';

export function toReleaseSong(row: AssetRow, downloadUrl: string | null): ReleaseSong {
  return {
    id: String(row.id || ''),
    releaseId: String(row.release_id || ''),
    fileName: String(row.file_name || ''),
    fileSize: Number(row.file_size) || 0,
    mimeType: row.mime_type ?? null,
    storagePath: String(row.storage_path || ''),
    uploadedAt: String(row.created_at || ''),
    downloadUrl,
  };
}

/**
 * Every song on a release, newest first — so the head of the list is "the
 * current song" everywhere without anyone having to store which one that is.
 *
 * Signing is per row and never fatal: `generateSignedUrl` returns null on
 * failure, so one bad URL costs that row its play/download controls rather than
 * failing the whole scene.
 */
export async function loadReleaseSongs(
  adminClient: AdminClient,
  releaseId: string
): Promise<{ error: string } | { songs: ReleaseSong[] }> {
  const { data, error } = await adminClient
    .from(ASSETS_TABLE)
    .select(SONG_COLUMNS)
    .eq('release_id', releaseId)
    .eq('category', SONG_CATEGORY)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message || 'Could not load the song.' };
  }

  const rows = (data || []) as AssetRow[];
  const songs = await Promise.all(
    rows.map(async (row) =>
      toReleaseSong(
        row,
        await generateSignedUrl(
          adminClient,
          row.storage_bucket || RELEASE_ASSETS_BUCKET,
          row.storage_path,
          ASSET_SIGNED_URL_TTL_SECONDS
        )
      )
    )
  );

  return { songs };
}
