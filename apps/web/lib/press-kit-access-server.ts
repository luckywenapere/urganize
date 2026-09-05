import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { decideReleaseAccess } from '@/lib/release-access';
import { buildReadOnlyResponse, loadWorkspaceAccessContext } from '@/lib/tasks-server';

// Who may touch a press kit.
//
// Lives in lib/ rather than in the route group's _shared.ts, matching
// lib/release-access-server.ts: the embedded-actions runner
// (lib/urgans-actions/server.ts) needs it too, and a lib module importing from
// app/api would have the dependency pointing the wrong way. The route group
// re-exports it, so every import site there is unchanged.

export const PRESS_KITS_TABLE = 'press_kits';

export const PRESS_KIT_COLUMNS =
  'id,owner_user_id,artist_id,slug,state,visibility,embargo_date,' +
  'available_for_interview,published_at,created_at,updated_at';

/**
 * The 404 body for "not yours / doesn't exist".
 *
 * Two constraints, both inherited from RELEASE_NOT_FOUND_MESSAGE and both
 * still binding here: never a 403 for a non-member, because a refusal must not
 * confirm the kit exists; and never the exact string 'Not found.', which
 * lib/chappi/tool-families/shared.ts reads as "the feature flag is off".
 */
export const PRESS_KIT_NOT_FOUND_MESSAGE = 'Press kit not found.';

const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

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
