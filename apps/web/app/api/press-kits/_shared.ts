import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
  sanitizeFileName,
} from '@/lib/asset-helpers';
import { deriveSectionStatus } from '@/lib/press-kits';
import {
  PRESS_KIT_SECTIONS,
  type PressKit,
  type PressKitAsset,
  type PressKitSection,
  type PressKitSectionKey,
  type PressKitSectionSource,
  type PressKitSectionStatus,
  type PressKitState,
  type PressKitVisibility,
} from '@/types/press-kits';

// Shared helpers for the press kit route group: table constants, the feature
// flag, row mappers and the access wrapper.
//
// No schema-missing fallback here on purpose: environments are assumed
// migrated (CLAUDE.md, "Patterns being deprecated in v1"), and a missing table
// surfaces as an ordinary 500. This module must never import
// app/api/releases/_shared.ts, which still carries those deprecated helpers —
// lib/schema-fallback-guard.test.ts fails the build for a new file that does.

export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const PRESS_KIT_SECTIONS_TABLE = 'press_kit_sections';
export const PRESS_KIT_SECTION_VERSIONS_TABLE = 'press_kit_section_versions';
export const PRESS_KIT_ASSETS_TABLE = 'press_kit_assets';
export const PRESS_KIT_EVENTS_TABLE = 'press_kit_events';

export const PRESS_KIT_SECTION_COLUMNS =
  'id,kit_id,section,content,published_content,status,source,position,hidden,updated_by,updated_at';

export const PRESS_KIT_SECTION_VERSION_COLUMNS =
  'id,section_id,content,saved_by,created_at';

export const PRESS_KIT_ASSET_COLUMNS =
  'id,kit_id,kind,file_name,file_size,mime_type,storage_bucket,storage_path,width,height,photographer_credit,usage_rights,position,created_at';

/**
 * Where a kit's files live in the shared release-assets bucket.
 *
 * The prefix is deliberately its own: every release asset path starts with a
 * release UUID, so `press-kit/` cannot collide with one, and the record route
 * checks a reported path against this prefix before trusting it. Same reasoning
 * as the workspace logo's `workspace/` prefix.
 */
export const buildPressKitStoragePath = (kitId: string, fileName: string): string =>
  `press-kit/${kitId}/${randomUUID()}-${sanitizeFileName(fileName)}`;

export const pressKitStoragePrefix = (kitId: string): string => `press-kit/${kitId}/`;

/**
 * The whole press kit surface stays dark until NEXT_PUBLIC_FEATURE_PRESS_KITS
 * is 'true'. Every handler checks this FIRST, before auth, so a direct API
 * call cannot reach the feature either and the 404 cannot be told apart from a
 * route that does not exist (the events / EPK / notes precedent).
 */
export const isPressKitsFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true';

export const pressKitsDisabledResponse = () =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

/**
 * Narrow a Supabase row to a plain record.
 *
 * These selects pass a runtime-built column string, so supabase-js widens
 * `data` to include GenericStringError and refuses a direct cast.
 */
export const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

const asContent = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const toPressKit = (row: Record<string, unknown>, artistName = ''): PressKit => ({
  id: String(row.id || ''),
  artistId: String(row.artist_id || ''),
  artistName,
  slug: String(row.slug || ''),
  state: (row.state as PressKitState) || 'incomplete',
  visibility: (row.visibility as PressKitVisibility) || 'public',
  embargoDate: row.embargo_date ? String(row.embargo_date) : null,
  availableForInterview: row.available_for_interview === true,
  publishedAt: row.published_at ? String(row.published_at) : null,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export const toPressKitSection = (row: Record<string, unknown>): PressKitSection => ({
  id: String(row.id || ''),
  section: row.section as PressKitSectionKey,
  content: asContent(row.content),
  publishedContent:
    row.published_content === null || row.published_content === undefined
      ? null
      : asContent(row.published_content),
  status: (row.status as PressKitSectionStatus) || 'empty',
  source: (row.source as PressKitSectionSource) || 'autofill',
  position: typeof row.position === 'number' ? row.position : 0,
  hidden: row.hidden === true,
  updatedBy: row.updated_by ? String(row.updated_by) : null,
  updatedAt: String(row.updated_at || ''),
});

export const toPressKitAsset = (
  row: Record<string, unknown>,
  url: string | null
): PressKitAsset => ({
  id: String(row.id || ''),
  kind: (row.kind as PressKitAsset['kind']) || 'press_photo',
  fileName: String(row.file_name || ''),
  fileSize: Number(row.file_size) || 0,
  mimeType: row.mime_type ? String(row.mime_type) : null,
  url,
  width: typeof row.width === 'number' ? row.width : null,
  height: typeof row.height === 'number' ? row.height : null,
  photographerCredit: String(row.photographer_credit || ''),
  usageRights: String(row.usage_rights || ''),
  position: typeof row.position === 'number' ? row.position : 0,
  createdAt: String(row.created_at || ''),
});

/**
 * Every file on a kit, in display order, each with a signed URL for the
 * thumbnail.
 *
 * Signing is per row through `generateSignedUrl`, which returns null rather
 * than throwing and caches until 80% of the TTL has elapsed. That cache is what
 * keeps the URL string stable between requests, so a browser can actually cache
 * the image instead of re-downloading it on every load. One unsignable photo
 * costs that photo, never the list.
 *
 * Never `next/image` on the other end of these: the URLs expire, and the
 * optimizer's proxying and caching would outlive them.
 */
export const loadPressKitAssets = async (
  adminClient: SupabaseClient,
  kitId: string
): Promise<{ assets: PressKitAsset[] } | { error: string }> => {
  const { data, error } = await adminClient
    .from(PRESS_KIT_ASSETS_TABLE)
    .select(PRESS_KIT_ASSET_COLUMNS)
    .eq('kit_id', kitId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return { error: error.message || 'Could not load the photos.' };
  }

  const rows = (data || []).map((row) => asRow(row));
  const urls = await Promise.all(
    rows.map((row) =>
      generateSignedUrl(
        adminClient,
        String(row.storage_bucket || RELEASE_ASSETS_BUCKET),
        String(row.storage_path || ''),
        ASSET_SIGNED_URL_TTL_SECONDS
      )
    )
  );

  return { assets: rows.map((row, index) => toPressKitAsset(row, urls[index])) };
};

export const isPressKitSectionKey = (value: unknown): value is PressKitSectionKey =>
  typeof value === 'string' && (PRESS_KIT_SECTIONS as readonly string[]).includes(value);

/**
 * The rows a brand new kit starts as: one per section, in the standard order.
 *
 * Written in the same insert as the kit itself rather than lazily on first
 * edit, so the rail always has twelve rows to render and a section save is
 * always an update of a row that exists.
 */
export const buildInitialSectionRows = (kitId: string, ownerUserId: string) =>
  PRESS_KIT_SECTIONS.map((section, index) => ({
    owner_user_id: ownerUserId,
    kit_id: kitId,
    section,
    content: {},
    status: deriveSectionStatus(section, {}, { photoCount: 0 }),
    source: 'autofill' as const,
    position: index + 1,
    hidden: false,
  }));

// Access lives in lib/press-kit-access-server.ts so the embedded-actions runner
// can reach it without a lib -> app dependency. Re-exported here so every
// import site in this route group stays as it was.
export {
  PRESS_KITS_TABLE,
  PRESS_KIT_COLUMNS,
  PRESS_KIT_NOT_FOUND_MESSAGE,
  ensurePressKitAccess,
  type PressKitAccessResult,
} from '@/lib/press-kit-access-server';
