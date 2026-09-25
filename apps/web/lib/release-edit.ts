// What an edit to a rollout's own row is allowed to write.
//
// WHY THIS EXISTS (2026-09-25): PATCH /api/releases/[releaseId] was a PUT in
// PATCH's clothing. It wrote title, slug, release_date, description,
// artist_name and status from the body on EVERY call, so any field the caller
// left out was overwritten — release_date with NULL. UrgAns's rename tool sent
// only `{ title, description }`, so asking it to rename a rollout wiped the
// rollout's release date. The rollout's main view (the timeline) lays every
// activity out against release day, so a 64-activity plan vanished behind
// "Set a release date first" and the date card asked for a date it already had.
// Every UrgAns rename since v0.53.0 (2026-08-14) did this.
//
// The rule now, and it is the whole point of this module: A FIELD THAT IS NOT
// IN THE BODY IS NOT TOUCHED. Presence is tested with hasOwnProperty, never
// truthiness, because "absent" and "empty" mean different things for a
// description (absent = leave it, empty = clear it).
//
// The release DATE is deliberately not writable here at all. Changing it has
// consequences this handler must not own — building a waiting plan, moving an
// existing plan so it still lines up with release day — and those live in
// POST /api/releases/[releaseId]/schedule. Sending the CURRENT date back is
// accepted as a no-op, so a client that echoes the whole row stays safe; sending
// a different date, or clearing it, is refused with a pointer to the schedule
// route. Clearing was never a feature anywhere in the product: it was only ever
// the bug.
//
// Pure: no I/O, no env reads, so vitest can hold every rule (release-edit.test.ts).

import { normalizeReleaseSlug } from '@/lib/release-ops';
import { isValidReleaseStatusValue } from '@/lib/release-activity';
import { RELEASE_STATUS_OPTIONS } from '@/types/releases';

/** The limits the create route applies (sanitizeTextField in POST /api/releases).
 * An edit must not be a way round them. */
export const RELEASE_TITLE_MAX_LENGTH = 140;
export const RELEASE_DESCRIPTION_MAX_LENGTH = 400;
const ARTIST_NAME_MAX_LENGTH = 120;

export type ReleaseEditCurrent = {
  title: string;
  slug: string;
  /** YYYY-MM-DD, or null when the rollout has no date. */
  releaseDate: string | null;
  /** '' when there is none. */
  description: string;
  status: string;
  artistName: string;
};

export type ReleaseEditField = 'title' | 'description' | 'status' | 'artistName';

export type ReleaseEditErrorCode =
  | 'invalid_body'
  | 'invalid_title'
  | 'invalid_date'
  | 'date_via_schedule'
  | 'invalid_status';

export type ReleaseEditPlan =
  | { ok: false; error: string; code: ReleaseEditErrorCode }
  | {
      ok: true;
      /** snake_case columns to write, and ONLY the ones that change. Empty
       * means nothing changed; the caller should not write at all. */
      update: Record<string, string | null>;
      changed: ReleaseEditField[];
      /** Values after the edit, for the metadata write-through and the audit. */
      next: { title: string; artistName: string };
    };

/** Same cleaning the create route applies: trim, collapse runs of whitespace,
 * cap the length. */
function sanitizeText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

/**
 * Reads a date the way every date in this schema is stored: a calendar day.
 * Accepts a full ISO timestamp for the same day, because a client that read a
 * timestamp and sent it back must not trip the guard below.
 */
function normalizeDate(value: unknown): { value: string | null } | { error: string } {
  if (value === null) return { value: null };
  if (typeof value !== 'string') return { error: 'Release date must use YYYY-MM-DD format.' };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  const day = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (trimmed.length > 10 && trimmed[10] !== 'T')) {
    return { error: 'Release date must use YYYY-MM-DD format.' };
  }
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    return { error: 'Release date is invalid.' };
  }
  return { value: day };
}

export function planReleaseEdit(
  body: unknown,
  current: ReleaseEditCurrent,
  options: {
    /** False when artists are managed through the roster (the workspace flag):
     * the release row's artist_name is then a write-through cache that only
     * the artist rename and move routes may change. */
    artistNameEditable: boolean;
  }
): ReleaseEditPlan {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      code: 'invalid_body',
      error: 'Send the fields to change as a JSON object.',
    };
  }
  const input = body as Record<string, unknown>;

  const update: Record<string, string | null> = {};
  const changed: ReleaseEditField[] = [];
  let nextTitle = current.title;
  let nextArtistName = current.artistName;

  if (has(input, 'title')) {
    if (typeof input.title !== 'string') {
      return { ok: false, code: 'invalid_title', error: 'Rollout title must be text.' };
    }
    const title = sanitizeText(input.title, RELEASE_TITLE_MAX_LENGTH);
    if (!title) {
      return { ok: false, code: 'invalid_title', error: 'Rollout title is required.' };
    }
    if (title !== current.title) {
      update.title = title;
      // Recomputed only when the title moves. Nothing reads release slugs as a
      // public address and there is no unique index on them, so a collision
      // with another rollout of the same name is harmless.
      update.slug = normalizeReleaseSlug(title) || current.slug;
      changed.push('title');
      nextTitle = title;
    }
  }

  if (has(input, 'releaseDate')) {
    const requested = normalizeDate(input.releaseDate);
    if ('error' in requested) {
      return { ok: false, code: 'invalid_date', error: requested.error };
    }
    const existing = normalizeDate(current.releaseDate);
    const existingValue = 'value' in existing ? existing.value : null;
    if (requested.value !== existingValue) {
      return {
        ok: false,
        code: 'date_via_schedule',
        error:
          'Change the release date through the schedule endpoint, so the plan moves with it. This edit left the date alone.',
      };
    }
    // Equal: an echo of the current value. Nothing to do.
  }

  if (has(input, 'description')) {
    const raw = input.description;
    if (raw !== null && typeof raw !== 'string') {
      return { ok: false, code: 'invalid_body', error: 'Rollout description must be text.' };
    }
    const description = raw === null ? null : sanitizeText(raw, RELEASE_DESCRIPTION_MAX_LENGTH) || null;
    if ((description ?? '') !== (current.description ?? '')) {
      update.description = description;
      changed.push('description');
    }
  }

  if (has(input, 'status')) {
    const raw = typeof input.status === 'string' ? input.status.trim() : '';
    // An empty status is ignored rather than written, which is what this route
    // always did (`statusInput || current`).
    if (raw) {
      if (!isValidReleaseStatusValue(raw)) {
        return {
          ok: false,
          code: 'invalid_status',
          error: `Rollout status must be one of: ${RELEASE_STATUS_OPTIONS.join(', ')}.`,
        };
      }
      if (raw !== current.status) {
        update.status = raw;
        changed.push('status');
      }
    }
  }

  if (options.artistNameEditable && has(input, 'artistName')) {
    const raw = typeof input.artistName === 'string' ? input.artistName : '';
    const artistName = sanitizeText(raw, ARTIST_NAME_MAX_LENGTH);
    if (artistName && artistName !== current.artistName) {
      update.artist_name = artistName;
      changed.push('artistName');
      nextArtistName = artistName;
    }
  }

  return {
    ok: true,
    update,
    changed,
    next: { title: nextTitle, artistName: nextArtistName },
  };
}
