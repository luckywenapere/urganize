import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { IN_LIST_CHUNK, inChunks, readAllPages, type PageResult } from '@/lib/paged-rows';
import { TASK_ATTACHMENTS_BUCKET } from '@/lib/tasks-server';

// Storage objects don't cascade with the DB rows deleted below, so they are
// enumerated and removed first. Unlike the per-release DELETE, a storage
// failure must not block account deletion (the privacy policy promises the
// account goes away) — log and continue; an orphaned blob is recoverable.
//
// Every list here is read a page at a time (2026-10-09, v1.92.10). A single
// `select` stops at 1,000 rows, and one `.in('task_id', ...)` carrying a
// thousand task ids is a URL too long to send, so a team of about sixteen
// rollouts had its attachment files skipped, and orphaned, when it deleted.
async function removeUserStorageObjects(supabaseAdmin: SupabaseClient, userId: string) {
  const pathsByBucket = new Map<string, Set<string>>();
  const collectPath = (bucket: string, path: unknown) => {
    const storagePath = typeof path === 'string' ? path.trim() : '';
    if (!storagePath) return;
    const paths = pathsByBucket.get(bucket) ?? new Set<string>();
    paths.add(storagePath);
    pathsByBucket.set(bucket, paths);
  };
  const logQueryError = (label: string, error: { message?: string } | null) => {
    if (error) {
      console.error(`[account/delete-now] Could not enumerate ${label} for storage cleanup:`, error.message);
    }
  };

  /** Reads one whole list, a page at a time. A failure is logged and reads as empty, like before. */
  const readRows = async <T,>(
    label: string,
    fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>
  ): Promise<T[]> => {
    try {
      const { rows, truncated } = await readAllPages<T>(fetchPage);
      if (truncated) {
        console.warn(`[account/delete-now] ${label} hit the read ceiling; some files may be left behind.`);
      }
      return rows;
    } catch (error) {
      logQueryError(label, error as { message?: string });
      return [];
    }
  };

  // All assets owned by the user — storage_bucket on the row covers both the
  // release-assets and proofs buckets.
  const assets = await readRows<{ storage_bucket: string | null; storage_path: string | null }>(
    'assets',
    (from, to) =>
      supabaseAdmin
        .from('assets')
        .select('storage_bucket, storage_path')
        .eq('owner_user_id', userId)
        .order('id', { ascending: true })
        .range(from, to)
  );
  for (const row of assets) {
    collectPath(String(row.storage_bucket || RELEASE_ASSETS_BUCKET), row.storage_path);
  }

  // Task attachments uploaded by the user anywhere...
  const ownAttachments = await readRows<{ storage_path: string | null }>('task attachments', (from, to) =>
    supabaseAdmin
      .from('task_attachments')
      .select('storage_path')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, to)
  );
  for (const row of ownAttachments) {
    collectPath(TASK_ATTACHMENTS_BUCKET, row.storage_path);
  }

  // ...plus attachments on tasks under the user's releases — those rows
  // cascade-delete with the releases and would orphan their blobs.
  const releases = await readRows<{ id: string | null }>('releases', (from, to) =>
    supabaseAdmin
      .from('releases')
      .select('id')
      .eq('owner_user_id', userId)
      .order('id', { ascending: true })
      .range(from, to)
  );
  const releaseIds = releases.map((row) => String(row.id || '')).filter(Boolean);
  const taskIds: string[] = [];
  for (const group of inChunks(releaseIds, IN_LIST_CHUNK)) {
    const tasks = await readRows<{ id: string | null }>('tasks', (from, to) =>
      supabaseAdmin
        .from('tasks')
        .select('id')
        .in('release_id', group)
        .order('id', { ascending: true })
        .range(from, to)
    );
    for (const row of tasks) {
      const id = String(row.id || '');
      if (id) taskIds.push(id);
    }
  }
  for (const group of inChunks(taskIds, IN_LIST_CHUNK)) {
    const attachments = await readRows<{ storage_path: string | null }>(
      'rollout task attachments',
      (from, to) =>
        supabaseAdmin
          .from('task_attachments')
          .select('storage_path')
          .in('task_id', group)
          .order('id', { ascending: true })
          .range(from, to)
    );
    for (const row of attachments) {
      collectPath(TASK_ATTACHMENTS_BUCKET, row.storage_path);
    }
  }

  // The workspace logo lives in release-assets keyed off the workspaces row,
  // which cascade-deletes with the auth user.
  const workspaceResult = await supabaseAdmin
    .from('workspaces')
    .select('logo_storage_path')
    .eq('owner_id', userId);
  logQueryError('workspace logo', workspaceResult.error);
  for (const row of workspaceResult.data ?? []) {
    collectPath(RELEASE_ASSETS_BUCKET, row.logo_storage_path);
  }

  // A curator profile photo also lives in release-assets (under curator/<id>/),
  // and its row cascade-deletes with the auth user. Enumerated unconditionally,
  // regardless of the pitching flag: an account that joined while the feature
  // was on must still be cleaned up if it is later switched off.
  const curatorProfileResult = await supabaseAdmin
    .from('curator_profiles')
    .select('photo_path')
    .eq('user_id', userId);
  logQueryError('curator profile photo', curatorProfileResult.error);
  for (const row of curatorProfileResult.data ?? []) {
    collectPath(RELEASE_ASSETS_BUCKET, row.photo_path);
  }

  // Profile photos (2026-10-11): the person's directory face and the faces of
  // artists whose rows cascade with this user. Both live in release-assets.
  // Read tolerantly: a missing column only means there is nothing to collect.
  const personPhotoResult = await supabaseAdmin
    .from('person_profiles')
    .select('avatar_storage_path')
    .eq('user_id', userId);
  logQueryError('directory profile photo', personPhotoResult.error);
  for (const row of personPhotoResult.data ?? []) {
    collectPath(RELEASE_ASSETS_BUCKET, row.avatar_storage_path);
  }
  const artistPhotoResult = await supabaseAdmin
    .from('artists')
    .select('photo_path')
    .eq('owner_user_id', userId);
  logQueryError('artist photos', artistPhotoResult.error);
  for (const row of artistPhotoResult.data ?? []) {
    collectPath(RELEASE_ASSETS_BUCKET, row.photo_path);
  }

  for (const [bucket, paths] of pathsByBucket) {
    const removeResult = await supabaseAdmin.storage.from(bucket).remove([...paths]);
    if (removeResult.error) {
      console.error(
        `[account/delete-now] Could not remove ${paths.size} object(s) from ${bucket}:`,
        removeResult.error.message
      );
    }
  }
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const confirmationText = body?.confirmationText as string | undefined;

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);

  if (userError || !user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if ((confirmationText || '').trim() !== 'DELETE') {
    return NextResponse.json({ error: 'Please type DELETE exactly to continue' }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: nowIso })
    .eq('user_id', user.id)
    .eq('status', 'active');

  // The two trial-ledger sentinels survive account deletion on purpose:
  // they're what stops delete-and-resignup from reclaiming a free trial
  // ('trial_claim' from the retired card-on-file flow; 'trial_card' from the
  // live card-before-trial flow — see lib/trial-card.ts).
  await supabaseAdmin
    .from('payments')
    .delete()
    .eq('user_id', user.id)
    .neq('plan', 'trial_claim')
    .neq('plan', 'trial_card');
  await supabaseAdmin.from('subscriptions').delete().eq('user_id', user.id);

  // Must run before the releases delete: the asset / task_attachment rows
  // holding the storage paths cascade away with the releases.
  await removeUserStorageObjects(supabaseAdmin, user.id);

  await supabaseAdmin.from('releases').delete().eq('owner_user_id', user.id);
  await supabaseAdmin.from('profiles').delete().eq('id', user.id);

  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id, false);
  if (deleteAuthError) {
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }

  return NextResponse.json({
    status: 'deleted',
    deleted_at: nowIso,
  });
}
