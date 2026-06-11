/**
 * Server-side helpers for the workspace logo (record label / team logo).
 *
 * The logo is stored on the `workspaces` row (`logo_storage_path` +
 * `logo_file_name`) with the bytes in the private `release-assets` bucket
 * under `workspace/<workspace_id>/logo/...`. Release asset paths always start
 * with a release UUID, so the `workspace/` prefix cannot collide.
 *
 * Its one product job: releases without their own cover art display the
 * workspace logo as a read-time fallback until real artwork is uploaded.
 * Nothing is written to release rows — the swap is automatic in both
 * directions (see loadWorkspaceLogoFallbackUrl).
 *
 * Gated by NEXT_PUBLIC_FEATURE_WORKSPACE, same as the workspace artist.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
  sanitizeFileName,
} from '@/lib/asset-helpers';
import { isWorkspaceFeatureEnabled } from '@/lib/artists-server';

const WORKSPACES_TABLE = 'workspaces';

export type WorkspaceLogo = {
  storagePath: string;
  fileName: string | null;
};

export function buildWorkspaceLogoStoragePath(workspaceId: string, fileName: string): string {
  return `workspace/${workspaceId}/logo/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

/** Storage-path prefix every logo for this workspace must live under. */
export function workspaceLogoPathPrefix(workspaceId: string): string {
  return `workspace/${workspaceId}/logo/`;
}

/**
 * Read the workspace's logo pointer. Returns null when no logo is set.
 * Throws on query errors so routes surface a 500 (callers that must degrade
 * use loadWorkspaceLogoFallbackUrl instead).
 */
export async function getWorkspaceLogo(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceLogo | null> {
  const { data, error } = await adminClient
    .from(WORKSPACES_TABLE)
    .select('logo_storage_path,logo_file_name')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const storagePath = typeof data?.logo_storage_path === 'string' ? data.logo_storage_path : '';
  if (!storagePath) {
    return null;
  }

  return {
    storagePath,
    fileName: typeof data?.logo_file_name === 'string' ? data.logo_file_name : null,
  };
}

/**
 * Signed URL for the logo of the workspace owned by `ownerUserId`, used as
 * the cover-art fallback for that user's releases (release lists are
 * owner-scoped, so the release owner's workspace is the right scope).
 *
 * Returns null — never throws — when the flag is off, no logo is set, the
 * logo columns don't exist yet (migration not applied), or signing fails.
 * Cover art must degrade to the neutral placeholder, not 500 the list.
 */
export async function loadWorkspaceLogoFallbackUrl(
  adminClient: SupabaseClient,
  ownerUserId: string
): Promise<string | null> {
  if (!isWorkspaceFeatureEnabled()) {
    return null;
  }

  try {
    const { data, error } = await adminClient
      .from(WORKSPACES_TABLE)
      .select('logo_storage_path')
      .eq('owner_id', ownerUserId)
      .maybeSingle();

    if (error || typeof data?.logo_storage_path !== 'string' || !data.logo_storage_path) {
      return null;
    }

    return await generateSignedUrl(
      adminClient,
      RELEASE_ASSETS_BUCKET,
      data.logo_storage_path,
      ASSET_SIGNED_URL_TTL_SECONDS
    );
  } catch {
    return null;
  }
}
