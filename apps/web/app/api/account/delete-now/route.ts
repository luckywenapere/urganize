import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { TASK_ATTACHMENTS_BUCKET } from '@/lib/tasks-server';

// Storage objects don't cascade with the DB rows deleted below, so they are
// enumerated and removed first. Unlike the per-release DELETE, a storage
// failure must not block account deletion (the privacy policy promises the
// account goes away) — log and continue; an orphaned blob is recoverable.
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

  // All assets owned by the user — storage_bucket on the row covers both the
  // release-assets and proofs buckets.
  const assetsResult = await supabaseAdmin
    .from('assets')
    .select('storage_bucket, storage_path')
    .eq('owner_user_id', userId);
  logQueryError('assets', assetsResult.error);
  for (const row of assetsResult.data ?? []) {
    collectPath(String(row.storage_bucket || RELEASE_ASSETS_BUCKET), row.storage_path);
  }

  // Task attachments uploaded by the user anywhere...
  const ownAttachmentsResult = await supabaseAdmin
    .from('task_attachments')
    .select('storage_path')
    .eq('user_id', userId);
  logQueryError('task attachments', ownAttachmentsResult.error);
  for (const row of ownAttachmentsResult.data ?? []) {
    collectPath(TASK_ATTACHMENTS_BUCKET, row.storage_path);
  }

  // ...plus attachments on tasks under the user's releases — those rows
  // cascade-delete with the releases and would orphan their blobs.
  const releasesResult = await supabaseAdmin.from('releases').select('id').eq('owner_user_id', userId);
  logQueryError('releases', releasesResult.error);
  const releaseIds = (releasesResult.data ?? []).map((row) => String(row.id || '')).filter(Boolean);
  if (releaseIds.length > 0) {
    const tasksResult = await supabaseAdmin.from('tasks').select('id').in('release_id', releaseIds);
    logQueryError('tasks', tasksResult.error);
    const taskIds = (tasksResult.data ?? []).map((row) => String(row.id || '')).filter(Boolean);
    if (taskIds.length > 0) {
      const releaseAttachmentsResult = await supabaseAdmin
        .from('task_attachments')
        .select('storage_path')
        .in('task_id', taskIds);
      logQueryError('rollout task attachments', releaseAttachmentsResult.error);
      for (const row of releaseAttachmentsResult.data ?? []) {
        collectPath(TASK_ATTACHMENTS_BUCKET, row.storage_path);
      }
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
