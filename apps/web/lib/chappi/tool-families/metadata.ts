// Release metadata tools (SERVER-ONLY) — the distribution fields a
// distributor handoff needs (ISRC, UPC, genre, language, label, (P)/(C)).
//
// The one trap: PATCH …/metadata is a FULL-REPLACE upsert over its whole
// allowlist, so any field left out of the body is written as null. A sparse
// patch would therefore quietly erase the ISRC while setting the genre. Every
// write here reads the current row and merges first.

import {
  apiError,
  argBoolean,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

/** The metadata route 404s with 'Not found.' when NEXT_PUBLIC_FEATURE_METADATA
 * is off. Without translating that, the model would report it the same way it
 * reports ensureReleaseOwnership's 'Release not found.' and tell the user their
 * release does not exist. The create_note precedent. */
const METADATA_OFF = 'Rollout details are not switched on for your team.';

/** The exact allowlist PATCH …/metadata accepts, in the order the form shows
 * them. Anything outside this is not writable through that route. */
const METADATA_FIELDS = [
  'isrc',
  'upc',
  'iswc',
  'genre',
  'subgenre',
  'language',
  'labelName',
  'featuredArtists',
  'cLine',
  'pLine',
] as const;

type MetadataField = (typeof METADATA_FIELDS)[number];

export const METADATA_TOOLS: ChappiTool[] = [
  {
    name: 'get_release_metadata',
    kind: 'read',
    description:
      "Read a rollout's distribution details: ISRC, UPC, ISWC, genre, subgenre, language, explicit flag, label name, featured artists, and the (P)/(C) lines.",
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
      if (isFlagGateOff(res)) return fail(METADATA_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the rollout details.'));

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
      "Set a rollout's distribution details. Pass only the fields being changed — the rest are preserved. To clear a field, pass it as an empty string.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        isrc: { type: 'string', description: 'Recording code for the track.' },
        upc: { type: 'string', description: 'Barcode for the rollout.' },
        iswc: {
          type: 'string',
          description: 'Composition code from the collection society, e.g. "T-123456789-1".',
        },
        genre: { type: 'string' },
        subgenre: { type: 'string' },
        language: { type: 'string', description: 'Language of the lyrics.' },
        explicit: { type: 'boolean', description: 'Whether the lyrics are explicit.' },
        labelName: { type: 'string' },
        featuredArtists: {
          type: 'string',
          description: 'Other artists on the song, e.g. "Tems, Burna Boy". Goes here, not in the title.',
        },
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
      if (isFlagGateOff(current)) return fail(METADATA_OFF);
      if (!current.ok) {
        return fail(apiError(current, 'That rollout was not found on your team.'));
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
      if (isFlagGateOff(res)) return fail(METADATA_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not save the rollout details.'));

      const names = [...changed, ...(explicitChanged ? ['explicit'] : [])];
      return {
        ok: true,
        summary: `Updated ${names.join(', ')}.`,
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'get_release_credits',
    kind: 'read',
    description:
      "The collaborator credits link for a rollout, and what has come back through it: legal names, roles, songwriter and master splits, PRO and publisher details. This is what a distributor handoff needs.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/credits`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(METADATA_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the credits.'));
      const link = res.body.link as Record<string, unknown> | null;
      const submissions = (res.body.submissions || []) as Array<Record<string, unknown>>;
      return {
        ok: true,
        summary: link
          ? `${submissions.length} ${
              submissions.length === 1 ? 'answer' : 'answers'
            } so far. The link is ${link.closedAt ? 'closed' : 'open'}.`
          : 'No credits link on this rollout yet.',
        data: {
          shareUrl: link ? `${ctx.origin}/credits/${String(link.shareToken || '')}` : null,
          isClosed: link ? Boolean(link.closedAt) : null,
          submissions: submissions.map((entry) => ({
            legalName: entry.legalName ?? null,
            stageName: entry.stageName ?? null,
            roles: entry.roles ?? [],
            songwriterSplit: entry.songwriterSplit ?? null,
            masterSplit: entry.masterSplit ?? null,
            pro: entry.pro ?? null,
            publisher: entry.publisher ?? null,
          })),
        },
      };
    },
  },
  {
    name: 'create_credits_link',
    kind: 'mutate',
    description:
      "Create the shareable, no-login link collaborators use to submit their own credits and splits. Safe to call twice — a rollout that already has one gets it back rather than a second link.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/credits`, {
        method: 'POST',
        body: {},
      });
      if (isFlagGateOff(res)) return fail(METADATA_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not create the credits link.'));
      const link = res.body.link as Record<string, unknown> | undefined;
      const token = String(link?.shareToken || '');
      return {
        ok: true,
        summary: token
          ? `Collaborators can submit their credits at ${ctx.origin}/credits/${token}. Anyone with the link can fill it in once.`
          : 'Created the credits link.',
        data: { shareUrl: token ? `${ctx.origin}/credits/${token}` : null },
      };
    },
  },
  {
    // Not gated: closing is reversible by the same tool, the link survives,
    // and every answer already given is kept. It is the pause button, not a
    // revoke — rotating the token is a separate, deliberate act on the page.
    name: 'close_credits_link',
    kind: 'mutate',
    description:
      'Stop or restart a credits link taking answers. Closing keeps the link and everything already submitted; it just stops accepting more. Pass open: true to reopen it.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        open: { type: 'boolean', description: 'True reopens a closed link.' },
      },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const reopen = argBoolean(args, 'open') === true;
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/credits`, {
        method: 'PATCH',
        body: { action: reopen ? 'reopen' : 'close' },
      });
      if (isFlagGateOff(res)) return fail(METADATA_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not change the credits link.'));
      return {
        ok: true,
        summary: reopen
          ? 'The credits link is taking answers again.'
          : 'The credits link is closed. Anyone opening it now is told the request is closed, and nothing already submitted was lost.',
      };
    },
  },
];
