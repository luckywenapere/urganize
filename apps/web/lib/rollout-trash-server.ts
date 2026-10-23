// Rollout Trash, server side (SERVER-ONLY). The rules live in rollout-trash.ts.
//
// THE READ-PATH CONVENTION: a rollout is deleted when releases.deleted_at is not
// null. Any query that lists or counts rollouts adds `.is('deleted_at', null)`.
// Any query that lists tasks (or other rows that hang off a rollout) across more
// than one rollout drops the rows of deleted rollouts with
// `dropRowsOfDeletedReleases`. Single-rollout reads go through the access
// helpers (ensureReleaseAccess / ensureReleaseOwnership), which answer 404.

import type { SupabaseClient } from '@supabase/supabase-js';

import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-helpers';
import { withThumbPaths } from '@/lib/image-thumb';
import { purgeCutoff } from '@/lib/rollout-trash';

const ID_CHUNK = 200;

export type TrashedRelease = {
  id: string;
  title: string;
  artistName: string;
  status: string;
  deletedAt: string;
  taskCount: number;
};

type Result = { ok: true } | { ok: false; status: number; error: string };

/** Ids (from `ids`) whose rollout sits in Trash. */
export async function findDeletedReleaseIds(
  admin: SupabaseClient,
  ids: readonly string[]
): Promise<Set<string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const deleted = new Set<string>();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const { data, error } = await admin
      .from('releases')
      .select('id')
      .in('id', chunk)
      .not('deleted_at', 'is', null);
    if (error) throw error;
    for (const row of data ?? []) deleted.add(String((row as { id: unknown }).id));
  }
  return deleted;
}

/** Drop rows whose rollout is in Trash. `getReleaseId` reads the rollout id off
 * a row (tasks use `release_id`). One extra query per 200 distinct rollouts. */
export async function dropRowsOfDeletedReleases<T>(
  admin: SupabaseClient,
  rows: readonly T[],
  getReleaseId: (row: T) => string | null | undefined
): Promise<T[]> {
  if (rows.length === 0) return [];
  const deleted = await findDeletedReleaseIds(
    admin,
    rows.map((row) => String(getReleaseId(row) || ''))
  );
  if (deleted.size === 0) return [...rows];
  return rows.filter((row) => !deleted.has(String(getReleaseId(row) || '')));
}

export async function softDeleteRelease(
  admin: SupabaseClient,
  releaseId: string,
  userId: string,
  now: Date = new Date()
): Promise<Result> {
  const { data, error } = await admin
    .from('releases')
    .update({ deleted_at: now.toISOString(), deleted_by: userId })
    .eq('id', releaseId)
    .eq('owner_user_id', userId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, status: 500, error: error.message || 'Could not delete rollout.' };
  if (!data || data.length === 0) return { ok: false, status: 404, error: 'Rollout not found.' };
  return { ok: true };
}

export async function restoreRelease(
  admin: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<Result> {
  const { data, error } = await admin
    .from('releases')
    .update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
    .eq('id', releaseId)
    .eq('owner_user_id', userId)
    .not('deleted_at', 'is', null)
    .select('id');
  if (error) return { ok: false, status: 500, error: error.message || 'Could not restore rollout.' };
  if (!data || data.length === 0) return { ok: false, status: 404, error: 'Rollout not found in Trash.' };
  return { ok: true };
}

/** Permanent removal: storage objects first (they do not cascade), then the
 * row, whose child rows all carry ON DELETE CASCADE. If storage removal fails
 * nothing else is touched, so a retry is safe. */
export async function purgeRelease(
  admin: SupabaseClient,
  releaseId: string,
  ownerUserId?: string
): Promise<Result> {
  const assets = await admin
    .from('assets')
    .select('storage_bucket, storage_path')
    .eq('release_id', releaseId);
  if (assets.error && !isMissingTable(assets.error)) {
    return { ok: false, status: 500, error: assets.error.message || 'Could not load rollout assets.' };
  }

  const pathsByBucket = new Map<string, string[]>();
  for (const row of assets.data ?? []) {
    const storagePath = String(row.storage_path || '');
    if (!storagePath) continue;
    const bucket = String(row.storage_bucket || RELEASE_ASSETS_BUCKET);
    const paths = pathsByBucket.get(bucket) ?? [];
    paths.push(storagePath);
    pathsByBucket.set(bucket, paths);
  }
  for (const [bucket, paths] of pathsByBucket) {
    // withThumbPaths: cover display copies (lib/image-thumb.ts) go too.
    const removed = await admin.storage.from(bucket).remove(withThumbPaths(paths));
    if (removed.error) {
      return {
        ok: false,
        status: 500,
        error: removed.error.message || 'Could not delete rollout files from storage.',
      };
    }
  }

  let query = admin.from('releases').delete().eq('id', releaseId);
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);
  const deleted = await query;
  if (deleted.error) {
    return { ok: false, status: 500, error: deleted.error.message || 'Could not delete rollout.' };
  }
  return { ok: true };
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  const code = String(error.code || '').toUpperCase();
  return code === '42P01' || code === 'PGRST205';
}

export async function listTrashedReleases(
  admin: SupabaseClient,
  ownerUserId: string
): Promise<TrashedRelease[]> {
  const { data, error } = await admin
    .from('releases')
    .select('id,title,artist_name,status,deleted_at')
    .eq('owner_user_id', ownerUserId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  const counts = new Map<string, number>();
  await Promise.all(
    rows.map(async (row) => {
      const { count } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('release_id', row.id);
      counts.set(String(row.id), count ?? 0);
    })
  );

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title || ''),
    artistName: String(row.artist_name || ''),
    status: String(row.status || 'draft'),
    deletedAt: String(row.deleted_at),
    taskCount: counts.get(String(row.id)) ?? 0,
  }));
}

/** The cron: purge every rollout deleted more than 30 days ago. */
export async function purgeExpiredReleases(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ purged: number; failed: number }> {
  const { data, error } = await admin
    .from('releases')
    .select('id')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', purgeCutoff(now).toISOString())
    .limit(100);
  if (error) throw error;

  let purged = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const result = await purgeRelease(admin, String(row.id));
    if (result.ok) purged += 1;
    else failed += 1;
  }
  return { purged, failed };
}
