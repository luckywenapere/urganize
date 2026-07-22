import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WORKSPACES_TABLE,
  loadWorkspaceAccessContext,
  getAuthenticatedAdmin,
} from '@/lib/tasks-server';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import {
  getWorkspaceLogo,
  workspaceLogoPathPrefix,
} from '@/lib/workspace-logo';

// Workspace logo (record label / team logo). Releases without their own
// cover art display it as a read-time fallback — see lib/workspace-logo.ts.
// Gated by NEXT_PUBLIC_FEATURE_WORKSPACE, same as /api/workspace/artist;
// returns 404 when the flag is off. Scoped to the caller's owned workspace
// (matching release ownership, which is what the fallback resolves against).
const isFlagOn = () => process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

type LogoRecordBody = {
  storage_path?: unknown;
  file_name?: unknown;
};

async function buildLogoPayload(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<{ fileName: string | null; url: string } | null> {
  const logo = await getWorkspaceLogo(adminClient, workspaceId);
  if (!logo) {
    return null;
  }

  const url = await generateSignedUrl(
    adminClient,
    RELEASE_ASSETS_BUCKET,
    logo.storagePath,
    ASSET_SIGNED_URL_TTL_SECONDS
  );

  // A pointer whose object can't be signed (e.g. deleted out-of-band) reads
  // as "no logo" rather than erroring — the user can simply re-upload.
  return url ? { fileName: logo.fileName, url } : null;
}

function removeStorageObject(adminClient: SupabaseClient, storagePath: string) {
  // Best-effort: an orphaned object wastes quota but breaks nothing.
  return adminClient.storage
    .from(RELEASE_ASSETS_BUCKET)
    .remove([storagePath])
    .then(({ error }) => {
      if (error) {
        console.error(`Failed to remove workspace logo object ${storagePath}:`, error);
      }
    });
}

export async function GET(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  try {
    // Read-first resolution, matching /api/workspace/artist -- avoids the
    // unconditional membership UPSERT + full org-member sync that
    // ensureOwnedWorkspace performs on every call (see lib/tasks-server.ts's
    // own comment on loadWorkspaceAccessContext for why that was fixed there
    // once already; this route just never got the same fix applied to it).
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }

    const logo = await buildLogoPayload(adminClient, access.primaryWorkspaceId);

    return NextResponse.json({ workspaceId: access.primaryWorkspaceId, logo });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load workspace logo.' },
      { status: 500 }
    );
  }
}

/**
 * Records the logo for a file the client already uploaded to Supabase Storage
 * via the signed URL from ./upload-url (same three-step flow as release
 * assets). Verifies the upload landed under this workspace's namespace before
 * pointing the workspace at it, and removes the previous logo object after a
 * successful swap.
 */
export async function PUT(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  const body = (await request.json().catch(() => null)) as LogoRecordBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  const storagePath = typeof body.storage_path === 'string' ? body.storage_path.trim() : '';
  if (!storagePath) {
    return NextResponse.json({ error: 'storage_path is required.' }, { status: 400 });
  }

  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  if (!fileName) {
    return NextResponse.json({ error: 'file_name is required.' }, { status: 400 });
  }

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }
    const workspaceId = access.primaryWorkspaceId;

    // Defense in depth: the path must live under this workspace's namespace.
    // Prevents a client from claiming someone else's upload as their logo.
    if (!storagePath.startsWith(workspaceLogoPathPrefix(workspaceId))) {
      return NextResponse.json(
        { error: 'storage_path does not belong to this workspace.' },
        { status: 400 }
      );
    }

    // Confirm the upload actually landed (same check as the release asset
    // record route): list the parent directory and look for the basename.
    const lastSlash = storagePath.lastIndexOf('/');
    const dir = storagePath.slice(0, lastSlash);
    const basename = storagePath.slice(lastSlash + 1);

    const listResult = await adminClient.storage
      .from(RELEASE_ASSETS_BUCKET)
      .list(dir, { limit: 100, search: basename });

    if (listResult.error) {
      return NextResponse.json(
        { error: listResult.error.message || 'Could not verify upload.' },
        { status: 500 }
      );
    }

    if (!(listResult.data || []).some((obj) => obj.name === basename)) {
      return NextResponse.json({ error: 'Upload not found at storage_path.' }, { status: 400 });
    }

    const previousLogo = await getWorkspaceLogo(adminClient, workspaceId);

    const updateResult = await adminClient
      .from(WORKSPACES_TABLE)
      .update({
        logo_storage_path: storagePath,
        logo_file_name: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workspaceId);

    if (updateResult.error) {
      // The bytes are already in storage. Drop them so the user can retry.
      await removeStorageObject(adminClient, storagePath);
      return NextResponse.json(
        { error: updateResult.error.message || 'Could not save workspace logo.' },
        { status: 500 }
      );
    }

    if (previousLogo && previousLogo.storagePath !== storagePath) {
      await removeStorageObject(adminClient, previousLogo.storagePath);
    }

    const logo = await buildLogoPayload(adminClient, workspaceId);
    return NextResponse.json({ workspaceId, logo });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save workspace logo.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isFlagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const { adminClient } = auth;

  try {
    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    if (!access.primaryWorkspaceId) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    }
    const workspaceId = access.primaryWorkspaceId;
    const previousLogo = await getWorkspaceLogo(adminClient, workspaceId);

    if (previousLogo) {
      const updateResult = await adminClient
        .from(WORKSPACES_TABLE)
        .update({
          logo_storage_path: null,
          logo_file_name: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workspaceId);

      if (updateResult.error) {
        return NextResponse.json(
          { error: updateResult.error.message || 'Could not remove workspace logo.' },
          { status: 500 }
        );
      }

      await removeStorageObject(adminClient, previousLogo.storagePath);
    }

    // Idempotent: deleting an absent logo succeeds with logo: null.
    return NextResponse.json({ workspaceId, logo: null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not remove workspace logo.' },
      { status: 500 }
    );
  }
}
