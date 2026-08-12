import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { MAX_NOTE_BODY_LENGTH } from '@/lib/notes';
import type { Note } from '@/types/notes';

// Shared helpers for the notes route group: table constant, the feature flag
// check, row mapper, validators, and the local release-ownership check. No
// schema-missing fallback here on purpose: environments are assumed migrated
// (CLAUDE.md "Patterns being deprecated in v1"); a missing table surfaces as
// a normal 500.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// the notes route import sites stay stable (the releases/_shared.ts convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const NOTES_TABLE = 'notes';

export const NOTE_COLUMNS = 'id,release_id,body,pinned,created_at,updated_at';

// A single owner's whole notebook is loaded in one request and filtered on
// the client, so this cap is the only pagination the feature has. Well above
// any real v1 notebook; revisit alongside a real pagination story.
export const NOTES_LIST_LIMIT = 200;

// Feature flag: the whole notes surface stays dark until
// NEXT_PUBLIC_FEATURE_NOTES is 'true'. Every handler checks this first and
// 404s when off, so direct API calls cannot reach the feature either (the
// EPK / plan route precedent). The page checks the same flag and
// bounces to /dashboard.
export const isNotesFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

export const toNote = (row: Record<string, unknown>): Note => ({
  id: String(row.id || ''),
  releaseId: row.release_id ? String(row.release_id) : null,
  body: typeof row.body === 'string' ? row.body : '',
  pinned: row.pinned === true,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

/**
 * Validates a body value from a request payload. Returns the string to store
 * or an error response. `null` is rejected rather than coerced: the column is
 * NOT NULL, and a client sending null means a bug worth surfacing, not an
 * intent to blank the note (that's an empty string).
 */
export function parseNoteBody(value: unknown): { error: NextResponse } | { body: string } {
  if (typeof value !== 'string') {
    return { error: NextResponse.json({ error: 'Note body must be text.' }, { status: 400 }) };
  }
  if (value.length > MAX_NOTE_BODY_LENGTH) {
    return {
      error: NextResponse.json(
        { error: `Note is too long. Keep it under ${MAX_NOTE_BODY_LENGTH.toLocaleString()} characters.` },
        { status: 400 }
      ),
    };
  }
  return { body: value };
}

// Local ownership check for this route group, mirroring the EPK one:
// deliberately NOT the ensureReleaseOwnership in app/api/releases/_shared.ts,
// whose module carries the deprecated schema-missing fallback helpers this
// feature must stay away from (the guard test). Same contract: 404 (never
// 403) when the release is missing or owned by someone else.
export async function ensureReleaseOwnership(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  userId: string
): Promise<{ error: NextResponse } | { releaseId: string }> {
  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,owner_user_id')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load release.' }, { status: 500 }) };
  }

  if (!release || String(release.owner_user_id || '') !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return { releaseId: String(release.id || '') };
}
