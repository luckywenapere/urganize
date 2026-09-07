/**
 * The artist roster.
 *
 * Small, and load-bearing out of proportion to its size: a show and a press
 * kit both hang off an ARTIST rather than a release, so list_artists is
 * usually the first call in any conversation about either. Without it the
 * model has no artist ids and cannot book a show or start a kit at all.
 *
 * Gated by NEXT_PUBLIC_FEATURE_WORKSPACE, which has been on since 2026-06-01
 * and which the whole workspace depends on — so in practice these are always
 * live. The flag translation is here anyway, because a tool that reports "not
 * found" for a switched-off feature is the failure isFlagGateOff exists for,
 * and being right by accident is not being right.
 */

import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const ROSTER_OFF = "The artist roster isn't switched on for this workspace.";

type Artist = { id: string; name: string; slug: string };

export const ARTIST_TOOLS: ChappiTool[] = [
  {
    name: 'list_artists',
    kind: 'read',
    description:
      "List the artists on the team's roster. Call this first for anything about a show or a press kit — both belong to an artist, and both need an artist id.",
    inputSchema: { type: 'object', properties: {} },
    execute: async (ctx) => {
      const res = await callInternalApi(ctx, '/api/workspace/artists', { method: 'GET' });
      if (isFlagGateOff(res)) return fail(ROSTER_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the roster.'));
      const artists = (res.body.artists || []) as Artist[];
      const limit = res.body.artistLimit;
      return {
        ok: true,
        summary:
          artists.length === 0
            ? 'No artists on the roster yet.'
            : `${artists.length} on the roster: ${artists.map((a) => a.name).join(', ')}.`,
        data: {
          artists: artists.map((artist) => ({ id: artist.id, name: artist.name })),
          // Null means no ceiling on this plan. Worth passing through so the
          // model can say "you are at your limit" rather than just relaying a
          // refusal it cannot explain.
          artistLimit: typeof limit === 'number' ? limit : null,
        },
      };
    },
  },
  {
    name: 'create_artist',
    kind: 'mutate',
    description: "Add an artist to the team's roster.",
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The artist name.' } },
      required: ['name'],
    },
    execute: async (ctx, args) => {
      const name = argString(args, 'name');
      if (!name) return fail('name is required.');
      const res = await callInternalApi(ctx, '/api/workspace/artists', {
        method: 'POST',
        body: { name },
      });
      if (isFlagGateOff(res)) return fail(ROSTER_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not add the artist.'));
      const artist = res.body.artist as Artist | undefined;
      return {
        ok: true,
        summary: `Added ${artist?.name || name} to the roster.`,
        data: { artistId: artist?.id ?? null },
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'rename_artist',
    kind: 'mutate',
    description:
      'Rename an artist. The new name follows through to every release of theirs, so this is how a name is corrected — never by editing releases one at a time.',
    inputSchema: {
      type: 'object',
      properties: { artistId: { type: 'string' }, name: { type: 'string' } },
      required: ['artistId', 'name'],
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      const name = argString(args, 'name');
      if (!artistId || !name) return fail('artistId and name are required.');
      const res = await callInternalApi(ctx, `/api/workspace/artists/${artistId}`, {
        method: 'PATCH',
        body: { name },
      });
      if (isFlagGateOff(res)) return fail(ROSTER_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not rename the artist.'));
      return {
        ok: true,
        summary: `Renamed them to ${name}. Their releases say so too.`,
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    // remove_, not delete_, and NOT confirmation-gated. The route refuses when
    // the artist has releases, has a teammate scoped to them, or is the last
    // one on the roster — so what can actually reach it removes an artist with
    // nothing attached, which is undoing a typo. CLAUDE.md makes exactly this
    // argument for the roster UI using a plain window.confirm rather than a
    // real dialog: a card here is a slip guard, not a decision point, and the
    // refusals are the thing that carries the weight.
    name: 'remove_artist',
    kind: 'mutate',
    description:
      'Remove an artist from the roster. Only works if nothing is attached to them — it refuses, and says why, if they have releases, a teammate scoped to them, or are the last artist left.',
    inputSchema: {
      type: 'object',
      properties: { artistId: { type: 'string' } },
      required: ['artistId'],
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      if (!artistId) return fail('artistId is required.');
      const res = await callInternalApi(ctx, `/api/workspace/artists/${artistId}`, {
        method: 'DELETE',
      });
      if (isFlagGateOff(res)) return fail(ROSTER_OFF);
      // The route's refusal names the count and what to do about it, so it is
      // relayed rather than replaced.
      if (!res.ok) return fail(apiError(res, 'Could not remove the artist.'));
      return {
        ok: true,
        summary: 'Removed them from the roster.',
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'move_release_to_artist',
    kind: 'mutate',
    description:
      'File a release under a different artist on the roster. Use this when a release was created against the wrong one. It changes who can see it: a teammate scoped to one artist sees only that artist’s releases.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        artistId: { type: 'string', description: 'The artist to move it to.' },
      },
      required: ['releaseId', 'artistId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const artistId = argString(args, 'artistId');
      if (!releaseId || !artistId) return fail('releaseId and artistId are required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/artist`, {
        method: 'POST',
        body: { artistId },
      });
      // This route is deliberately NOT flag-gated — its own header says so,
      // on the reasoning that the roster UI is its only caller and that UI is
      // already behind NEXT_PUBLIC_FEATURE_WORKSPACE. This tool is a second
      // caller, so that reasoning now rests on something else instead: UrgAns
      // itself only renders when the same flag is on. The check below is
      // therefore belt-and-braces rather than live, kept so the tool still
      // behaves if the route ever grows a gate of its own.
      if (isFlagGateOff(res)) return fail(ROSTER_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not move the release.'));
      const changed = res.body.changed;
      return {
        ok: true,
        summary:
          changed === false
            ? 'It was already filed under that artist, so nothing changed.'
            : 'Moved the release. Anyone scoped to the old artist will no longer see it.',
        clientAction: { type: 'refresh' },
      };
    },
  },
];
