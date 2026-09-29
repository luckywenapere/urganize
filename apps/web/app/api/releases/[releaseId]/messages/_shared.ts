import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { loadProfilesByIds } from '@/lib/tasks-server';
import { getInitials } from '@/lib/tasks';
import type { ReleaseMessage } from '@/types/release-message';

/**
 * Shared helpers for the release-messages route group: the feature flag, the
 * row mapper, and the "every message on this release, in order" read every
 * handler needs. Modeled directly on the song route group's `_shared.ts`.
 *
 * NO schema-missing fallback here, deliberately — environments are assumed
 * migrated (CLAUDE.md, "Patterns being deprecated in v1"), a missing table
 * surfaces as a normal 500, and `lib/schema-fallback-guard.test.ts` fails the
 * build for any new file that reaches for those helpers.
 */

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported so this
// group's import sites stay stable (the releases/_shared.ts convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  createAdminClient,
} from '@/app/api/_shared/auth';

// Release access is the shared team-aware pair (whole-workspace visibility;
// guests read-only on writes) — re-exported so this group's import sites
// stay stable, same convention as the auth helpers above. Unlike task
// threads (see hasTaskThreadAccess in lib/tasks-server.ts), a release thread
// is NOT narrowed below general release visibility: the PRD asks for it to
// be visible to everyone with release access, which is exactly what these
// already grant.
export {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';

export const RELEASE_MESSAGES_TABLE = 'release_messages';

/**
 * The whole release-chat surface stays dark until this is 'true' — the
 * scene, its pill, and every handler below. Checked FIRST in each handler so
 * a direct API call cannot reach the feature either (the song/EPK/content-
 * calendar precedent).
 */
export const isReleaseChatEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_RELEASE_CHAT === 'true';

/** The flag-off answer. Byte-identical to every other flag gate in the app,
 * which is what lets `isFlagGateOff` in the UrgAns tool layer tell it apart
 * from a genuine "that release is not yours" 404. */
export const notFoundResponse = (): NextResponse =>
  NextResponse.json({ error: 'Not found.' }, { status: 404 });

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type ReleaseMessageRow = {
  id: string;
  release_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
};

const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();

/**
 * Every message on a release, oldest first — a chat thread reads top-to-
 * bottom, unlike the song list's newest-first ("the current song").
 */
export async function loadReleaseMessages(
  adminClient: AdminClient,
  releaseId: string,
  currentUserId: string
): Promise<ReleaseMessage[]> {
  const result = await adminClient
    .from(RELEASE_MESSAGES_TABLE)
    .select('id,release_id,user_id,content,created_at,edited_at')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true });

  if (result.error) {
    throw result.error;
  }

  const rows = (result.data || []) as ReleaseMessageRow[];
  const profilesById = await loadProfilesByIds(
    adminClient,
    rows.map((row) => row.user_id)
  );

  return rows.map((row) => {
    const profile = profilesById.get(row.user_id) || null;
    const authorName = String(profile?.name || '').trim() || normalizeEmail(profile?.email) || 'Team member';
    const authorEmail = normalizeEmail(profile?.email) || null;

    return {
      id: row.id,
      releaseId: row.release_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      authorName,
      authorEmail,
      authorInitials: getInitials(authorName),
      isOwnMessage: row.user_id === currentUserId,
    };
  });
}
