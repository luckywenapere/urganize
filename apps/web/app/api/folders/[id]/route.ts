import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeFolderColor,
  normalizeFolderIcon,
  sanitizeFolderName,
  type UpdateFolderBody,
} from '@/lib/folders';
import {
  FOLDER_ITEMS_TABLE,
  FOLDERS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  ensureFolderOwnership,
  getAuthenticatedUser,
  getFolderItemStoragePath,
  isOptionalTableMissingError,
  loadFolderItemCounts,
  removeFolderStoragePaths,
  toFolder,
  type FolderRecord,
  type FolderItemRecord,
} from '../_shared';

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

  const countsResult = await loadFolderItemCounts(adminClient, [folderId]);
  if ('error' in countsResult) {
    return countsResult.error;
  }

  return NextResponse.json({
    folder: toFolder(ownership.folder, countsResult.counts.get(folderId) || 0),
  });
}

export async function PATCH(
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

  const body = (await request.json().catch(() => ({}))) as UpdateFolderBody;
  const name = body.name !== undefined ? sanitizeFolderName(body.name) : ownership.folder.name;
  const color = body.color !== undefined ? normalizeFolderColor(body.color) : ownership.folder.color;
  const icon = body.icon !== undefined ? normalizeFolderIcon(body.icon) : ownership.folder.icon;

  if (!name) {
    return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from(FOLDERS_TABLE)
    .update({
      name,
      color,
      icon,
      updated_at: new Date().toISOString(),
    })
    .eq('id', folderId)
    .eq('user_id', auth.user.id)
    .select('id,user_id,name,color,icon,created_at,updated_at')
    .single();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not update folder.' }, { status: 500 });
  }

  const countsResult = await loadFolderItemCounts(adminClient, [folderId]);
  if ('error' in countsResult) {
    return countsResult.error;
  }

  return NextResponse.json({
    folder: toFolder(data as FolderRecord, countsResult.counts.get(folderId) || 0),
  });
}

export async function DELETE(
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

  const itemsResult = await adminClient
    .from(FOLDER_ITEMS_TABLE)
    .select('id,folder_id,user_id,type,title,content,url,metadata,created_at,updated_at')
    .eq('folder_id', folderId)
    .eq('user_id', auth.user.id);

  if (itemsResult.error) {
    if (isOptionalTableMissingError(itemsResult.error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json(
      { error: itemsResult.error.message || 'Could not load folder items.' },
      { status: 500 }
    );
  }

  const itemRows = Array.isArray(itemsResult.data) ? (itemsResult.data as FolderItemRecord[]) : [];
  const storagePaths = itemRows
    .map((item) => getFolderItemStoragePath(item))
    .filter((path): path is string => Boolean(path));

  const removalResult = await removeFolderStoragePaths(adminClient, storagePaths);
  if ('error' in removalResult) {
    return removalResult.error;
  }

  const { error } = await adminClient
    .from(FOLDERS_TABLE)
    .delete()
    .eq('id', folderId)
    .eq('user_id', auth.user.id);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not delete folder.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    folderId,
    name: ownership.folder.name,
  });
}
