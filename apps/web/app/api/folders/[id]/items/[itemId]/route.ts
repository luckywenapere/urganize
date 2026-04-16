import { NextRequest, NextResponse } from 'next/server';
import {
  isFolderItemType,
  sanitizeFolderContent,
  sanitizeFolderTitle,
  validateFolderItemInput,
  type UpdateFolderItemBody,
} from '@/lib/folders';
import {
  FOLDER_ITEMS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  ensureFolderItemOwnership,
  ensureFolderOwnership,
  getAuthenticatedUser,
  getFolderItemStoragePath,
  isOptionalTableMissingError,
  loadOwnedReleaseOption,
  removeFolderStoragePaths,
  touchFolder,
  toFolderItem,
  type FolderItemRecord,
} from '../../../_shared';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id, itemId } = await context.params;
  const folderId = String(id || '').trim();
  const normalizedItemId = String(itemId || '').trim();
  if (!folderId || !normalizedItemId) {
    return NextResponse.json({ error: 'Folder and item ids are required.' }, { status: 400 });
  }

  const folderOwnership = await ensureFolderOwnership(adminClient, folderId, auth.user.id);
  if ('error' in folderOwnership) {
    return folderOwnership.error;
  }

  const itemOwnership = await ensureFolderItemOwnership(
    adminClient,
    folderId,
    normalizedItemId,
    auth.user.id
  );
  if ('error' in itemOwnership) {
    return itemOwnership.error;
  }

  const existingItem = itemOwnership.item;
  const body = (await request.json().catch(() => ({}))) as UpdateFolderItemBody;
  const type = isFolderItemType(body.type) ? body.type : existingItem.type;
  let title =
    body.title !== undefined ? sanitizeFolderTitle(body.title) : existingItem.title;
  const content =
    body.content !== undefined ? sanitizeFolderContent(body.content) : existingItem.content;
  const url =
    body.url !== undefined ? String(body.url || '').trim() || null : existingItem.url;
  let metadata =
    body.metadata !== undefined
      ? ((body.metadata || {}) as Record<string, unknown>)
      : ((existingItem.metadata || {}) as Record<string, unknown>);
  let linkedRelease = null;

  if (type === 'release') {
    const releaseId = String(metadata.releaseId || '').trim();
    const releaseResult = await loadOwnedReleaseOption(adminClient, releaseId, auth.user.id);
    if ('error' in releaseResult) {
      return releaseResult.error;
    }

    if (!releaseResult.release) {
      return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
    }

    linkedRelease = releaseResult.release;
    title = releaseResult.release.title;
    metadata = { releaseId: releaseResult.release.id };
  }

  const validation = validateFolderItemInput(type, {
    title,
    content,
    url,
    metadata,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const previousStoragePath = getFolderItemStoragePath(existingItem);
  const nextStoragePath = getFolderItemStoragePath({
    ...existingItem,
    type,
    url,
    metadata,
  });

  const { data, error } = await adminClient
    .from(FOLDER_ITEMS_TABLE)
    .update({
      type,
      title,
      content,
      url,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedItemId)
    .eq('folder_id', folderId)
    .eq('user_id', auth.user.id)
    .select('id,folder_id,user_id,type,title,content,url,metadata,created_at,updated_at')
    .single();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not update folder item.' }, { status: 500 });
  }

  if (previousStoragePath && previousStoragePath !== nextStoragePath) {
    const removalResult = await removeFolderStoragePaths(adminClient, [previousStoragePath]);
    if ('error' in removalResult) {
      return removalResult.error;
    }
  }

  await touchFolder(adminClient, folderOwnership.folder.id);

  return NextResponse.json({
    item: toFolderItem(data as FolderItemRecord, linkedRelease),
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id, itemId } = await context.params;
  const folderId = String(id || '').trim();
  const normalizedItemId = String(itemId || '').trim();
  if (!folderId || !normalizedItemId) {
    return NextResponse.json({ error: 'Folder and item ids are required.' }, { status: 400 });
  }

  const itemOwnership = await ensureFolderItemOwnership(
    adminClient,
    folderId,
    normalizedItemId,
    auth.user.id
  );
  if ('error' in itemOwnership) {
    return itemOwnership.error;
  }

  const storagePath = getFolderItemStoragePath(itemOwnership.item);
  if (storagePath) {
    const removalResult = await removeFolderStoragePaths(adminClient, [storagePath]);
    if ('error' in removalResult) {
      return removalResult.error;
    }
  }

  const { error } = await adminClient
    .from(FOLDER_ITEMS_TABLE)
    .delete()
    .eq('id', normalizedItemId)
    .eq('folder_id', folderId)
    .eq('user_id', auth.user.id);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not delete folder item.' }, { status: 500 });
  }

  await touchFolder(adminClient, folderId);

  return NextResponse.json({
    ok: true,
    itemId: normalizedItemId,
  });
}
