import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { decideReleaseAccess } from '@/lib/release-access';
import { buildReadOnlyResponse, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { deriveSectionStatus } from '@/lib/press-kits';
import {
  PRESS_KIT_SECTIONS,
  type PressKit,
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

export const PRESS_KITS_TABLE = 'press_kits';
export const PRESS_KIT_SECTIONS_TABLE = 'press_kit_sections';
export const PRESS_KIT_SECTION_VERSIONS_TABLE = 'press_kit_section_versions';
export const PRESS_KIT_ASSETS_TABLE = 'press_kit_assets';
export const PRESS_KIT_EVENTS_TABLE = 'press_kit_events';

export const PRESS_KIT_COLUMNS =
  'id,owner_user_id,artist_id,slug,state,visibility,embargo_date,' +
  'available_for_interview,published_at,created_at,updated_at';

export const PRESS_KIT_SECTION_COLUMNS =
  'id,kit_id,section,content,published_content,status,source,position,hidden,updated_by,updated_at';

export const PRESS_KIT_SECTION_VERSION_COLUMNS =
  'id,section_id,content,saved_by,created_at';

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
 * The 404 body for "not yours / doesn't exist".
 *
 * Two constraints, both inherited from RELEASE_NOT_FOUND_MESSAGE and both
 * still binding here: never a 403 for a non-member, because a refusal must not
 * confirm the kit exists; and never the exact string 'Not found.', which
 * lib/chappi/tool-families/shared.ts reads as "the feature flag is off".
 */
export const PRESS_KIT_NOT_FOUND_MESSAGE = 'Press kit not found.';

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

export type PressKitAccessResult =
  | { error: NextResponse }
  | { kit: Record<string, unknown>; ownerUserId: string; artistId: string };

/**
 * Who may touch a press kit.
 *
 * REUSES decideReleaseAccess DELIBERATELY, exactly as ensureEventAccess does
 * and for the reason recorded there: that function is named for releases but
 * is generic in fact, reading an owner id and an artist id and consulting the
 * caller's memberships and artist scope. A kit carries exactly those two
 * fields and wants exactly the same rule — a member sees the team's kits, an
 * artist-scoped member sees only their artist's, a guest is read-only, a
 * non-member gets a 404 that does not confirm existence.
 *
 * One rule, three object types now. Cloning it here would restart the
 * copy-propagation this codebase spent a year undoing.
 */
export async function ensurePressKitAccess(
  adminClient: SupabaseClient | null,
  kitId: string,
  user: User,
  write: boolean
): Promise<PressKitAccessResult> {
  if (!adminClient) {
    return {
      error: NextResponse.json(
        { error: 'Server environment is not configured.' },
        { status: 500 }
      ),
    };
  }

  const { data, error } = await adminClient
    .from(PRESS_KITS_TABLE)
    .select(PRESS_KIT_COLUMNS)
    .eq('id', kitId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the press kit.' },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      error: NextResponse.json({ error: PRESS_KIT_NOT_FOUND_MESSAGE }, { status: 404 }),
    };
  }

  const row = asRow(data);
  const ownerUserId = String(row.owner_user_id || '');
  const artistId = String(row.artist_id || '');

  const access = await loadWorkspaceAccessContext(adminClient, user);
  const decision = decideReleaseAccess({
    releaseOwnerId: ownerUserId,
    releaseArtistId: artistId,
    userId: user.id,
    access,
    write,
  });

  if (decision === 'not_found') {
    return {
      error: NextResponse.json({ error: PRESS_KIT_NOT_FOUND_MESSAGE }, { status: 404 }),
    };
  }
  if (decision === 'read_only') {
    return { error: buildReadOnlyResponse() };
  }

  return { kit: row, ownerUserId, artistId };
}
