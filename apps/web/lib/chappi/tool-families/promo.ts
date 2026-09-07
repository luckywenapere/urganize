// Promotion tools (SERVER-ONLY): playlist pitching and the release recap card.
//
// `pitch_song` is gated for a reason unlike the deletes: it does not destroy
// anything, it puts a message in a real curator's inbox and cannot be unsent.
//
// The three press kit tools that used to live here were removed 2026-09-05
// with the release-scoped EPK. The standing per-artist kit has no per-release
// link to hand out, so there was no rename available; giving UrgAns tools for
// it is its own piece of work.

import { MAX_PITCH_NOTE_LENGTH, PITCH_PLATFORMS } from '@/lib/pitching';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const PITCHING_OFF = "Playlist pitching isn't enabled yet.";
const RECAP_OFF = "Release recaps aren't enabled yet.";

/** Bound the browse payload — the route returns up to 200 playlists. */
const MAX_LISTED_PLAYLISTS = 30;

export const PROMO_TOOLS: ChappiTool[] = [
  {
    name: 'list_pitch_playlists',
    kind: 'read',
    description:
      'Browse curator playlists a song can be pitched to, optionally filtered by platform or genre.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: [...PITCH_PLATFORMS] },
        genre: { type: 'string' },
      },
    },
    execute: async (ctx, args) => {
      const params = new URLSearchParams();
      const platform = argString(args, 'platform');
      const genre = argString(args, 'genre');
      if (platform) params.set('platform', platform);
      if (genre) params.set('genre', genre);
      const query = params.toString();

      const res = await callInternalApi(
        ctx,
        `/api/pitching/playlists${query ? `?${query}` : ''}`,
        { method: 'GET' }
      );
      if (isFlagGateOff(res)) return fail(PITCHING_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the playlists.'));

      const playlists = Array.isArray(res.body.playlists)
        ? (res.body.playlists as Record<string, unknown>[])
        : [];
      const data = playlists.slice(0, MAX_LISTED_PLAYLISTS).map((playlist) => ({
        id: String(playlist.id ?? ''),
        name: String(playlist.name ?? ''),
        curator: String(playlist.curatorName ?? ''),
        platform: String(playlist.platform ?? ''),
        genres: Array.isArray(playlist.genres) ? playlist.genres.map(String) : [],
        followers: (playlist.followerCount ?? null) as number | null,
      }));
      const truncated =
        playlists.length > data.length ? ` Showing the first ${data.length}.` : '';
      return {
        ok: true,
        summary: `Found ${playlists.length} playlist(s).${truncated}`,
        data,
      };
    },
  },
  {
    name: 'list_pitches',
    kind: 'read',
    description: "See the pitches already sent for a release and how curators answered.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(
        ctx,
        `/api/pitching/pitches?release=${encodeURIComponent(releaseId)}`,
        { method: 'GET' }
      );
      if (isFlagGateOff(res)) return fail(PITCHING_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the pitches.'));

      const pitches = Array.isArray(res.body.pitches)
        ? (res.body.pitches as Record<string, unknown>[])
        : [];
      const data = pitches.map((pitch) => ({
        id: String(pitch.id ?? ''),
        playlist: String(pitch.playlistName ?? ''),
        song: String(pitch.songTitle ?? ''),
        status: String(pitch.status ?? ''),
        reply: (pitch.curatorReply ?? null) as string | null,
      }));
      const added = data.filter((pitch) => pitch.status === 'added').length;
      return {
        ok: true,
        summary: `${data.length} pitch(es) sent, ${added} added to a playlist.`,
        data,
      };
    },
  },
  {
    name: 'pitch_song',
    kind: 'mutate',
    description:
      "Pitch a song from a release to a curator's playlist. Requires the user to approve a confirmation card — calling this only proposes it, and nothing reaches the curator until they approve.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        playlistId: { type: 'string' },
        songTitle: { type: 'string' },
        songUrl: { type: 'string', description: 'A link the curator can listen from.' },
        songPlatform: { type: 'string', enum: [...PITCH_PLATFORMS] },
        note: {
          type: 'string',
          description: `Optional message to the curator, up to ${MAX_PITCH_NOTE_LENGTH} characters.`,
        },
      },
      required: ['releaseId', 'playlistId', 'songTitle', 'songUrl'],
    },
    confirm: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const playlistId = argString(args, 'playlistId');
      const songTitle = argString(args, 'songTitle');
      const songUrl = argString(args, 'songUrl');
      if (!releaseId || !playlistId || !songTitle || !songUrl) {
        return {
          ok: false,
          summary: 'releaseId, playlistId, songTitle and songUrl are all required.',
        };
      }
      const note = argString(args, 'note');
      if (note.length > MAX_PITCH_NOTE_LENGTH) {
        return {
          ok: false,
          summary: `The note is ${note.length} characters; the limit is ${MAX_PITCH_NOTE_LENGTH}. Shorten it and propose again.`,
        };
      }

      // Name the playlist and curator on the card — "pitch to playlist abc123"
      // is not something anyone can meaningfully approve.
      const res = await callInternalApi(ctx, '/api/pitching/playlists', { method: 'GET' });
      if (isFlagGateOff(res)) return { ok: false, summary: PITCHING_OFF };
      const playlists = Array.isArray(res.body.playlists)
        ? (res.body.playlists as Record<string, unknown>[])
        : [];
      const playlist = playlists.find((entry) => String(entry.id ?? '') === playlistId);
      if (!playlist) return { ok: false, summary: 'That playlist was not found.' };

      const curator = String(playlist.curatorName ?? 'the curator');
      return {
        ok: true,
        title: `Pitch "${songTitle}" to ${playlist.name}?`,
        detail: `${curator} gets the song, your link${note ? ' and your note' : ''}, and can answer from their own inbox. A pitch cannot be taken back.`,
        confirmLabel: 'Send pitch',
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      const playlistId = argString(args, 'playlistId');
      const songTitle = argString(args, 'songTitle');
      const songUrl = argString(args, 'songUrl');
      if (!releaseId || !playlistId || !songTitle || !songUrl) {
        return fail('releaseId, playlistId, songTitle and songUrl are all required.');
      }
      const res = await callInternalApi(ctx, '/api/pitching/pitches', {
        method: 'POST',
        body: {
          releaseId,
          playlistId,
          songTitle,
          songUrl,
          songPlatform: argString(args, 'songPlatform') || undefined,
          note: argString(args, 'note') || undefined,
        },
      });
      if (isFlagGateOff(res)) return fail(PITCHING_OFF);
      if (res.status === 409) {
        return fail('That song has already been pitched to this playlist.');
      }
      if (!res.ok) return fail(apiError(res, 'Could not send the pitch.'));
      return { ok: true, summary: `Pitched "${songTitle}".` };
    },
  },
  {
    name: 'get_recap',
    kind: 'read',
    description: "Check whether a finished release has a recap card, and the numbers behind it.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/recap`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return fail(RECAP_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not check the recap.'));
      return {
        ok: true,
        summary: res.body.recap ? 'This release has a recap card.' : 'No recap card yet.',
        data: { hasRecap: Boolean(res.body.recap), stats: res.body.stats ?? null },
      };
    },
  },
  {
    name: 'generate_recap',
    kind: 'mutate',
    description:
      "Build the shareable recap card for a finished release. Only works once the release date has passed or every activity is done. Ask for the highlight in conversation first — it's optional.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        highlight: {
          type: 'string',
          description: 'One thing worth remembering about the release, in the user\'s own words.',
        },
      },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/recap`, {
        method: 'POST',
        body: { highlight: argString(args, 'highlight') || undefined },
      });
      if (isFlagGateOff(res)) return fail(RECAP_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not build the recap.'));
      return {
        ok: true,
        summary: 'Built the recap card and put it in the conversation to save.',
        // Hands the poster over here rather than sending anyone to the
        // release. It used to navigate and say "open the release to share or
        // download it", which pointed at a modal button — that modal was
        // removed 2026-09-07 (founder call: the recap belongs in this
        // conversation), so the pointer would now aim at nothing. The card
        // fetches its own signed URLs, which is why only the id travels.
        clientAction: { type: 'open_recap', releaseId },
      };
    },
  },
  {
    name: 'delete_recap',
    kind: 'mutate',
    description:
      'Delete a release recap card. Requires the user to approve a confirmation card — calling this only proposes it.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    confirm: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return { ok: false, summary: 'releaseId is required.' };
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/recap`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return { ok: false, summary: RECAP_OFF };
      if (res.ok && !res.body.recap) {
        return { ok: false, summary: 'There is no recap card to delete.' };
      }
      return {
        ok: true,
        title: 'Delete this recap card?',
        detail: 'Both image sizes go with it. You can build a new one afterwards.',
        confirmLabel: 'Delete recap',
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/recap`, {
        method: 'DELETE',
      });
      if (isFlagGateOff(res)) return fail(RECAP_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not delete the recap.'));
      return { ok: true, summary: 'Deleted the recap card.' };
    },
  },
];
