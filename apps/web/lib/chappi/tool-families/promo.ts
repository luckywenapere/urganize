// Promotion tools (SERVER-ONLY): playlist pitching, the release recap card, and
// the share sheet.
//
// `pitch_song` is gated for a reason unlike the deletes: it does not destroy
// anything, it puts a message in a real curator's inbox and cannot be unsent.
//
// `share_release` is NOT gated, and the difference is the point: it posts
// nothing. It opens the sheet, the user answers its questions, and anything
// that leaves Urganize leaves from the user's own phone, by their own tap.
//
// The three press kit tools that used to live here were removed 2026-09-05
// with the release-scoped EPK. The standing per-artist kit has no per-release
// link to hand out, so there was no rename available; giving UrgAns tools for
// it is its own piece of work.

import { MAX_PITCH_NOTE_LENGTH, PITCH_PLATFORMS } from '@/lib/pitching';
import { isSocialShareEnabled, shareDisplayTitle } from '@/lib/social-share';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const PITCHING_OFF = "Playlist pitching isn't enabled yet.";
const RECAP_OFF = "Rollout recaps aren't enabled yet.";
const SHARE_OFF = "Sharing to socials isn't switched on for your team yet.";

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
    description:
      'See the pitches already sent and how curators answered. Pass a releaseId for one rollout, or leave it out for every rollout this team has pitched.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
    },
    execute: async (ctx, args) => {
      // TWO BUGS LIVED HERE, both fixed 2026-09-09 and both silent:
      //
      //   1. The query param was `?release=`, and the route reads `releaseId`,
      //      so this tool answered 400 "Release id is required." on every
      //      single call it has ever made.
      //   2. It read `pitch.curatorReply`, but the payload's field is `reply`
      //      (see toSentPitch). So the curator's answer — the one thing worth
      //      asking this tool for — would have come back null even once the
      //      request started working.
      //
      // releaseId is optional now, matching the route's own team-wide mode
      // (added with the Pitching page): "what have we pitched" is a question
      // the model could not previously answer at all.
      const releaseId = argString(args, 'releaseId');
      const query = releaseId ? `?releaseId=${encodeURIComponent(releaseId)}` : '';
      const res = await callInternalApi(ctx, `/api/pitching/pitches${query}`, { method: 'GET' });
      if (isFlagGateOff(res)) return fail(PITCHING_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the pitches.'));

      const pitches = Array.isArray(res.body.pitches)
        ? (res.body.pitches as Record<string, unknown>[])
        : [];
      const data = pitches.map((pitch) => ({
        id: String(pitch.id ?? ''),
        release: (pitch.releaseTitle ?? null) as string | null,
        playlist: String(pitch.playlistName ?? ''),
        song: String(pitch.songTitle ?? ''),
        status: String(pitch.status ?? ''),
        reply: (pitch.reply ?? null) as string | null,
      }));
      const added = data.filter((pitch) => pitch.status === 'added').length;
      const scope = releaseId ? 'for this release' : 'across every release';
      return {
        ok: true,
        summary: `${data.length} pitch(es) sent ${scope}, ${added} added to a playlist.`,
        data,
      };
    },
  },
  {
    name: 'pitch_song',
    kind: 'mutate',
    description:
      "Pitch a song from a rollout to a curator's playlist. Requires the user to approve a confirmation card — calling this only proposes it, and nothing reaches the curator until they approve.",
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
    description: "Check whether a finished rollout has a recap card, and the numbers behind it.",
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
        summary: res.body.recap ? 'This rollout has a recap card.' : 'No recap card yet.',
        data: { hasRecap: Boolean(res.body.recap), stats: res.body.stats ?? null },
      };
    },
  },
  {
    name: 'generate_recap',
    kind: 'mutate',
    description:
      "Build the shareable recap card for a finished rollout. Only works once the release date has passed or every activity is done. Ask for the highlight in conversation first — it's optional.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        highlight: {
          type: 'string',
          description: 'One thing worth remembering about the rollout, in the user\'s own words.',
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
      'Delete a rollout recap card. Requires the user to approve a confirmation card — calling this only proposes it.',
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
  {
    name: 'share_release',
    kind: 'read',
    description:
      "Open the share sheet for a rollout. It turns the rollout into an Instagram post, a WhatsApp status and a message the user can DM to anybody. The sheet asks four quick questions first (who is posting, whether the date can be public, a link for fans, one extra line), then the user posts from their own phone. You post nothing and cannot: this only opens the sheet. Say it is open and let them take it from there.",
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      // Checked here rather than through a route's flag-off 404, unlike every
      // other tool in this file: nothing this tool calls sits behind the share
      // flag. The one route that does renders a poster, far too heavy to call
      // just to learn whether the feature is on. A NEXT_PUBLIC_* read is
      // inlined into the server build exactly as it is into a route, so this
      // gives the same answer the sheet itself would.
      if (!isSocialShareEnabled()) return fail(SHARE_OFF);

      // Read first. This is the visibility check as much as it is a read: the
      // route is team-aware and 404s for a rollout this person cannot see, so
      // the sheet never opens on somebody else's work. It also names the
      // rollout in the reply.
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}`, { method: 'GET' });
      if (!res.ok) return fail(apiError(res, 'Could not find that rollout.'));
      const release = (res.body.release ?? {}) as Record<string, unknown>;
      const title = shareDisplayTitle(typeof release.title === 'string' ? release.title : null);

      return {
        ok: true,
        summary: title
          ? `Opened the share sheet for "${title}". They answer four quick questions, then post from their own phone.`
          : 'Opened the share sheet. They answer four quick questions, then post from their own phone.',
        clientAction: { type: 'open_share', releaseId },
      };
    },
  },
];
