// Release metadata tools (SERVER-ONLY) — the distribution fields a
// distributor handoff needs (ISRC, UPC, genre, language, label, (P)/(C)).
//
// The one trap: PATCH …/metadata is a FULL-REPLACE upsert over its whole
// allowlist, so any field left out of the body is written as null. A sparse
// patch would therefore quietly erase the ISRC while setting the genre. Every
// write here reads the current row and merges first.

import { apiError, argString, callInternalApi, fail, type ChappiTool } from './shared';

/** The exact allowlist PATCH …/metadata accepts, in the order the form shows
 * them. Anything outside this is not writable through that route. */
const METADATA_FIELDS = [
  'isrc',
  'upc',
  'genre',
  'subgenre',
  'language',
  'labelName',
  'cLine',
  'pLine',
] as const;

type MetadataField = (typeof METADATA_FIELDS)[number];

export const METADATA_TOOLS: ChappiTool[] = [
  {
    name: 'get_release_metadata',
    kind: 'read',
    description:
      "Read a release's distribution details: ISRC, UPC, genre, subgenre, language, explicit flag, label name, and the (P)/(C) lines.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/metadata`, {
        method: 'GET',
      });
      if (!res.ok) return fail(apiError(res, 'Could not load the release details.'));

      const metadata = (res.body.metadata ?? {}) as Record<string, unknown>;
      const data: Record<string, unknown> = { explicit: metadata.explicit ?? null };
      for (const field of METADATA_FIELDS) data[field] = metadata[field] ?? null;
      const filled = Object.values(data).filter(
        (value) => value !== null && value !== ''
      ).length;
      return {
        ok: true,
        summary: `${filled} of ${METADATA_FIELDS.length + 1} distribution details filled in.`,
        data,
      };
    },
  },
  {
    name: 'update_release_metadata',
    kind: 'mutate',
    description:
      "Set a release's distribution details. Pass only the fields being changed — the rest are preserved. To clear a field, pass it as an empty string.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        isrc: { type: 'string', description: 'Recording code for the track.' },
        upc: { type: 'string', description: 'Barcode for the release.' },
        genre: { type: 'string' },
        subgenre: { type: 'string' },
        language: { type: 'string', description: 'Language of the lyrics.' },
        explicit: { type: 'boolean', description: 'Whether the lyrics are explicit.' },
        labelName: { type: 'string' },
        cLine: { type: 'string', description: 'Copyright line, e.g. "2026 Example Records".' },
        pLine: { type: 'string', description: 'Phonographic line for the recording.' },
      },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');

      const changed: MetadataField[] = METADATA_FIELDS.filter(
        (field) => typeof args[field] === 'string'
      );
      const explicitChanged = typeof args.explicit === 'boolean';
      if (changed.length === 0 && !explicitChanged) {
        return fail('Nothing to update — provide a detail to change.');
      }

      // Read-then-merge: the route replaces the whole row, so anything absent
      // from the body would be nulled.
      const current = await callInternalApi(ctx, `/api/releases/${releaseId}/metadata`, {
        method: 'GET',
      });
      if (!current.ok) {
        return fail(apiError(current, 'That release was not found in your workspace.'));
      }
      const existing = (current.body.metadata ?? {}) as Record<string, unknown>;

      const body: Record<string, unknown> = {};
      for (const field of METADATA_FIELDS) {
        body[field] = changed.includes(field)
          ? argString(args, field)
          : (existing[field] ?? null);
      }
      body.explicit = explicitChanged ? args.explicit : (existing.explicit ?? null);

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/metadata`, {
        method: 'PATCH',
        body,
      });
      if (!res.ok) return fail(apiError(res, 'Could not save the release details.'));

      const names = [...changed, ...(explicitChanged ? ['explicit'] : [])];
      return {
        ok: true,
        summary: `Updated ${names.join(', ')}.`,
        clientAction: { type: 'refresh' },
      };
    },
  },
];
