// Notes tools (SERVER-ONLY). Reads go through the REST route rather than a
// service — unlike the core family — so the NOTES feature flag and the
// owner-scoping stay defined in exactly one place (the route), and the
// flag-off 404 translation below comes for free.

import {
  apiError,
  argBoolean,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  noteTitle,
  type ChappiTool,
} from './shared';

const NOTES_OFF = "Notes aren't enabled yet.";

/** Bound the payload: the route returns the whole notebook (up to 200 notes,
 * each an arbitrarily long body), which would swamp the model's context. */
const MAX_LISTED_NOTES = 40;

export const NOTE_TOOLS: ChappiTool[] = [
  {
    name: 'list_notes',
    kind: 'read',
    description:
      "List the user's notes (most recent first, pinned first). Returns each note's id, title line, and whether it is linked to a release — not the full text.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: {
          type: 'string',
          description: 'Only notes linked to this release.',
        },
      },
    },
    execute: async (ctx, args) => {
      const res = await callInternalApi(ctx, '/api/notes', { method: 'GET' });
      if (isFlagGateOff(res)) return fail(NOTES_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load your notes.'));

      const releaseFilter = argString(args, 'releaseId');
      const all = Array.isArray(res.body.notes) ? (res.body.notes as Record<string, unknown>[]) : [];
      const filtered = releaseFilter
        ? all.filter((note) => String(note.release_id ?? note.releaseId ?? '') === releaseFilter)
        : all;
      const data = filtered.slice(0, MAX_LISTED_NOTES).map((note) => ({
        id: String(note.id ?? ''),
        title: noteTitle(String(note.body ?? '')),
        pinned: Boolean(note.pinned),
        releaseId: (note.release_id ?? note.releaseId ?? null) as string | null,
      }));
      const truncated = filtered.length > data.length ? ` Showing the first ${data.length}.` : '';
      return {
        ok: true,
        summary: `Found ${filtered.length} note(s).${truncated}`,
        data,
      };
    },
  },
  {
    name: 'update_note',
    kind: 'mutate',
    description:
      "Edit a note's text, pin or unpin it, or link it to a release. Pass only what is changing. To unlink a note from its release, pass releaseId as an empty string.",
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string' },
        body: { type: 'string', description: 'Replacement text for the whole note.' },
        pinned: { type: 'boolean' },
        releaseId: {
          type: 'string',
          description: 'Release to link the note to. Empty string unlinks it.',
        },
      },
      required: ['noteId'],
    },
    execute: async (ctx, args) => {
      const noteId = argString(args, 'noteId');
      if (!noteId) return fail('noteId is required.');

      const patch: Record<string, unknown> = {};
      const body = argString(args, 'body');
      if (body) patch.body = body;
      const pinned = argBoolean(args, 'pinned');
      if (pinned !== undefined) patch.pinned = pinned;
      // The route presence-checks releaseId with `in`, so an explicit null is
      // how an unlink is expressed. '' from the model means "unlink".
      if ('releaseId' in args && typeof args.releaseId === 'string') {
        patch.releaseId = argString(args, 'releaseId') || null;
      }
      if (Object.keys(patch).length === 0) {
        return fail('Nothing to update — provide text, a pin state, or a release to link.');
      }

      const res = await callInternalApi(ctx, `/api/notes/${noteId}`, { method: 'PATCH', body: patch });
      if (isFlagGateOff(res)) return fail(NOTES_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not update the note.'));
      return { ok: true, summary: 'Updated the note.' };
    },
  },
  {
    name: 'delete_note',
    kind: 'mutate',
    description:
      'Permanently delete a note. Requires the user to approve a confirmation card — calling this only proposes the deletion, it does not perform it.',
    inputSchema: {
      type: 'object',
      properties: { noteId: { type: 'string' } },
      required: ['noteId'],
    },
    confirm: async (ctx, args) => {
      const noteId = argString(args, 'noteId');
      if (!noteId) return { ok: false, summary: 'noteId is required.' };

      // Name the note in the card. The list route is the only read path, and
      // it is cheap (owner-scoped, capped at 200).
      const res = await callInternalApi(ctx, '/api/notes', { method: 'GET' });
      if (isFlagGateOff(res)) return { ok: false, summary: NOTES_OFF };
      const all = Array.isArray(res.body.notes) ? (res.body.notes as Record<string, unknown>[]) : [];
      const note = all.find((n) => String(n.id ?? '') === noteId);
      if (!note) return { ok: false, summary: 'That note was not found.' };

      return {
        ok: true,
        title: `Delete "${noteTitle(String(note.body ?? ''))}"?`,
        detail: 'This permanently removes the note. It cannot be undone.',
        confirmLabel: 'Delete note',
      };
    },
    execute: async (ctx, args) => {
      const noteId = argString(args, 'noteId');
      if (!noteId) return fail('noteId is required.');
      const res = await callInternalApi(ctx, `/api/notes/${noteId}`, { method: 'DELETE' });
      if (isFlagGateOff(res)) return fail(NOTES_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not delete the note.'));
      return { ok: true, summary: 'Deleted the note.' };
    },
  },
];
