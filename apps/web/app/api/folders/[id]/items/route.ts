import { NextRequest, NextResponse } from 'next/server';
import {
  isFolderItemType,
  normalizeFolderTypeFilter,
  sanitizeFolderContent,
  sanitizeFolderTitle,
  validateFolderItemInput,
  type CreateFolderItemBody,
} from '@/lib/folders';
import {
  FOLDER_ITEMS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  ensureFolderOwnership,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadFolderItems,
  loadOwnedReleaseOption,
  touchFolder,
  toFolderItem,
  type FolderItemRecord,
} from '../../_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const folderId = String(id || '').trim();
  if (!folderId) {
    return NextResponse.json({ error: 'Folder id is required.' }, { status: 400 });
  }

  const ownership = await ensureFolderOwnership(adminClient, folderId, auth.user.id);
  if ('error' in ownership) {
    return ownership.error;
  }

  const rawType = request.nextUrl.searchParams.get('type');
  const typeFilter = normalizeFolderTypeFilter(rawType);
  if (rawType && !typeFilter) {
    return NextResponse.json({ error: 'Folder item type is invalid.' }, { status: 400 });
  }

  const itemsResult = await loadFolderItems(adminClient, ownership.folder.id, typeFilter);
  if ('error' in itemsResult) {
    return itemsResult.error;
  }

  return NextResponse.json({ items: itemsResult.items });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    const { id } = await context.params;
    const folderId = String(id || '').trim();
    if (!folderId) {
      return NextResponse.json({ error: 'Folder id is required.' }, { status: 400 });
    }

    const ownership = await ensureFolderOwnership(adminClient, folderId, auth.user.id);
    if ('error' in ownership) {
      return ownership.error;
    }

    const body = (await request.json().catch(() => ({}))) as CreateFolderItemBody;
    const type = isFolderItemType(body.type) ? body.type : null;
    if (!type) {
      return NextResponse.json({ error: 'Folder item type is required.' }, { status: 400 });
    }

    let title = sanitizeFolderTitle(body.title);
    const content = sanitizeFolderContent(body.content);
    const url = String(body.url || '').trim() || null;
    let metadata = (body.metadata || {}) as Record<string, unknown>;
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

    const { data, error } = await adminClient
      .from(FOLDER_ITEMS_TABLE)
      .insert({
        folder_id: ownership.folder.id,
        user_id: auth.user.id,
        type,
        title,
        content,
        url,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .select('id,folder_id,user_id,type,title,content,url,metadata,created_at,updated_at')
      .single();

    if (error) {
      if (isOptionalTableMissingError(error)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json({ error: error.message || 'Could not create folder item.' }, { status: 500 });
    }

    await touchFolder(adminClient, ownership.folder.id);

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('folder_item_added', {
        folder_id: ownership.folder.id,
        item_type: type,
      })
    );

    return NextResponse.json(
      { item: toFolderItem(data as FolderItemRecord, linkedRelease) },
      { status: 201 }
    );
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
