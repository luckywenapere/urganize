import { NextRequest, NextResponse } from 'next/server';
import { type MoveFolderItemBody } from '@/lib/folders';
import {
  FOLDER_ITEMS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  ensureFolderItemOwnership,
  ensureFolderOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadReleaseOptionsByIds,
  touchFolder,
  toFolderItem,
  type FolderItemRecord,
} from '../../../../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  const posthogServer = createServerPostHogClient();

  try {
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

    const sourceFolder = await ensureFolderOwnership(adminClient, folderId, auth.user.id);
    if ('error' in sourceFolder) {
      return sourceFolder.error;
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

    const body = (await request.json().catch(() => ({}))) as MoveFolderItemBody;
    const targetFolderId = String(body.targetFolderId || '').trim().slice(0, 80);
    if (!targetFolderId) {
      return NextResponse.json({ error: 'Target folder id is required.' }, { status: 400 });
    }

    const targetFolder = await ensureFolderOwnership(adminClient, targetFolderId, auth.user.id);
    if ('error' in targetFolder) {
      return targetFolder.error;
    }

    if (targetFolderId === folderId) {
      const releaseIds =
        itemOwnership.item.type === 'release'
          ? [String(((itemOwnership.item.metadata || {}) as Record<string, unknown>).releaseId || '')]
          : [];
      const linkedReleaseResult = await loadReleaseOptionsByIds(adminClient, releaseIds.filter(Boolean));
      if ('error' in linkedReleaseResult) {
        return linkedReleaseResult.error;
      }

      return NextResponse.json({
        item: toFolderItem(
          itemOwnership.item,
          linkedReleaseResult.optionsById.get(releaseIds[0] || '') || null
        ),
      });
    }

    const { data, error } = await adminClient
      .from(FOLDER_ITEMS_TABLE)
      .update({
        folder_id: targetFolderId,
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

      return NextResponse.json({ error: error.message || 'Could not move folder item.' }, { status: 500 });
    }

    await Promise.all([
      touchFolder(adminClient, sourceFolder.folder.id),
      touchFolder(adminClient, targetFolder.folder.id),
    ]);

    const movedItem = data as FolderItemRecord;
    const releaseIds =
      movedItem.type === 'release'
        ? [String(((movedItem.metadata || {}) as Record<string, unknown>).releaseId || '')]
        : [];
    const linkedReleaseResult = await loadReleaseOptionsByIds(adminClient, releaseIds.filter(Boolean));
    if ('error' in linkedReleaseResult) {
      return linkedReleaseResult.error;
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('folder_item_moved', {
        from_folder_id: sourceFolder.folder.id,
        to_folder_id: targetFolder.folder.id,
        item_type: itemOwnership.item.type,
      })
    );

    return NextResponse.json({
      item: toFolderItem(
        movedItem,
        linkedReleaseResult.optionsById.get(releaseIds[0] || '') || null
      ),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
