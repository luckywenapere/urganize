import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '../_shared/paywall';
import {
  normalizeFolderColor,
  normalizeFolderIcon,
  sanitizeFolderName,
  type CreateFolderBody,
} from '@/lib/folders';
import {
  FOLDERS_TABLE,
  buildMissingSchemaResponse,
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  loadFolderItemCounts,
  toFolder,
  type FolderRecord,
} from './_shared';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(FOLDERS_TABLE)
    .select('id,user_id,name,color,icon,created_at,updated_at')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return buildMissingSchemaResponse();
    }

    return NextResponse.json({ error: error.message || 'Could not load folders.' }, { status: 500 });
  }

  const folderRows = Array.isArray(data) ? (data as FolderRecord[]) : [];
  const countsResult = await loadFolderItemCounts(
    adminClient,
    folderRows.map((folder) => folder.id)
  );
  if ('error' in countsResult) {
    return countsResult.error;
  }

  return NextResponse.json({
    folders: folderRows.map((folder) => toFolder(folder, countsResult.counts.get(folder.id) || 0)),
  });
}

export async function POST(request: NextRequest) {
  const posthogServer = createServerPostHogClient();

  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) {
      return auth.error;
    }

    const paywallResponse = await requirePaidAccess(auth.user.id, {
      feature: 'folders',
      message: 'Upgrade required to create folders.',
    });
    if (paywallResponse) return paywallResponse;

    const adminClient = createAdminClient(auth.supabaseUrl);
    if (!adminClient) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const body = (await request.json().catch(() => ({}))) as CreateFolderBody;
    const name = sanitizeFolderName(body.name);
    const color = normalizeFolderColor(body.color);
    const icon = normalizeFolderIcon(body.icon);

    if (!name) {
      return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from(FOLDERS_TABLE)
      .insert({
        user_id: auth.user.id,
        name,
        color,
        icon,
        updated_at: new Date().toISOString(),
      })
      .select('id,user_id,name,color,icon,created_at,updated_at')
      .single();

    if (error) {
      if (isOptionalTableMissingError(error)) {
        return buildMissingSchemaResponse();
      }

      return NextResponse.json({ error: error.message || 'Could not create folder.' }, { status: 500 });
    }

    captureServerAnalyticsEvent(
      posthogServer,
      auth.user.id,
      createPostHogEvent('folder_created', {
        folder_id: String(data.id || ''),
      })
    );

    return NextResponse.json({ folder: toFolder(data as FolderRecord, 0) }, { status: 201 });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}
