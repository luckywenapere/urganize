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

import { randomUUID } from 'node:crypto';
import { MAX_PITCH_NOTE_LENGTH, PITCH_PLATFORMS, PITCH_PLATFORM_LABELS } from '@/lib/pitching';
import { isPitchCreditsEnabled } from '@/lib/pitch-credits';
import { isSocialShareEnabled, shareDisplayTitle } from '@/lib/social-share';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
  type ChappiToolContext,
  type InternalApiResponse,
} from './shared';

const PITCHING_OFF = "Playlist pitching isn't enabled yet.";
const RECAP_OFF = "Rollout recaps aren't enabled yet.";
const SHARE_OFF = "Sharing to socials isn't switched on for your team yet.";

/** A playlist's credit price as the route sends it; missing means Free. */
function creditsOf(playlist: Record<string, unknown>): number {
  const credits = Number(playlist.creditPrice);
  return Number.isFinite(credits) && credits > 0 ? Math.floor(credits) : 0;
}

const plural = (count: number) => `${count} credit${count === 1 ? '' : 's'}`;

/**
 * Why a pitch did not go out, in words the user can act on. Every refusal
 * from the pitch routes carries its own reason, so it is passed on as is;
 * the tool used to call every 409 "already pitched", which hid the real one
 * (#1236). Two answers are reworded: the credits shortfall, to name the
 * numbers, and the credits route's duplicate, which speaks of several curators.
 */
export function pitchRefusal(res: InternalApiResponse): string {
  if (res.status === 402 && res.body.code === 'insufficient') {
    const needed = Number(res.body.needed);
    const balance = Number(res.body.balance);
    if (Number.isFinite(needed) && Number.isFinite(balance)) {
      return `This pitch costs ${plural(needed)} and you have ${balance}. Buy more credits, then ask me again. Nothing was charged.`;
    }
    return 'You need more credits for this pitch. Buy more credits, then ask me again. Nothing was charged.';
  }
  if (res.status === 409 && res.body.code === 'duplicate') {
    return 'This playlist already has a pitch from this rollout waiting for a reply.';
  }
  return apiError(res, 'Could not send the pitch.');
}

/** Bound the browse payload — the route returns up to 200 playlists. */
const MAX_LISTED_PLAYLISTS = 30;

// ── Finding the playlist the user means (#1267) ─────────────────────────────
//
// The model is asked for a playlist id and, in practice, hands over whatever
// the user said: a name. The one user who tried this named Spotify and Apple
// Music playlists that are not on Urganize at all, and the tool answered "That
// playlist was not found." seven times without ever saying which playlists
// CAN be pitched. So a name is accepted as well as an id, and a miss hands the
// real list back, in words the model can pass straight on.

type Playlist = Record<string, unknown>;

/** A name with case, spacing and punctuation taken out, for comparing. */
function nameKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type PlaylistMatch =
  | { kind: 'found'; playlist: Playlist }
  | { kind: 'ambiguous'; matches: Playlist[] }
  | { kind: 'missing' };

/**
 * The playlist `wanted` points at: by id first, then by its whole name. Never
 * by part of a name: a pitch cannot be taken back, so "Fridays" must not
 * become "Afro Fridays" on a guess. Two playlists can share a name (one
 * curator, the same list on two platforms), and that is for the user to settle.
 */
export function matchPlaylist(playlists: Playlist[], wanted: string): PlaylistMatch {
  const byId = playlists.find((entry) => String(entry.id ?? '') === wanted);
  if (byId) return { kind: 'found', playlist: byId };

  const key = nameKey(wanted);
  if (!key) return { kind: 'missing' };
  const byName = playlists.filter((entry) => nameKey(String(entry.name ?? '')) === key);
  if (byName.length === 1) return { kind: 'found', playlist: byName[0] };
  if (byName.length > 1) return { kind: 'ambiguous', matches: byName };
  return { kind: 'missing' };
}

/** A curator's own words (a playlist or display name) kept to one line, so they cannot break out of a list. */
function oneLine(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** "Afro Fridays (Spotify, by Tolu, 100 credits)": one playlist, as a line the model can show. */
function describePlaylist(playlist: Playlist): string {
  const platform = String(playlist.platform ?? '');
  const parts = [
    PITCH_PLATFORM_LABELS[platform as keyof typeof PITCH_PLATFORM_LABELS] ?? platform,
    playlist.curatorName ? `by ${oneLine(playlist.curatorName)}` : '',
  ];
  if (isPitchCreditsEnabled()) {
    const credits = creditsOf(playlist);
    parts.push(credits > 0 ? plural(credits) : 'free');
  }
  return `${oneLine(playlist.name)} (${parts.filter(Boolean).join(', ')})`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notOnUrganize(wanted: string, playlists: Playlist[]): string {
  // An id the model made up is not something to quote back as a name.
  const what = UUID.test(wanted) ? 'That playlist' : `"${wanted}"`;
  if (playlists.length === 0) {
    return `${what} is not on Urganize, and there are no playlists to pitch to right now. Tell the user that plainly.`;
  }
  const shown = playlists.slice(0, MAX_LISTED_PLAYLISTS);
  const more =
    playlists.length > shown.length
      ? `\nThere are ${playlists.length - shown.length} more: call list_pitch_playlists with a platform or genre to see them.`
      : '';
  return [
    `${what} is not on Urganize, so it cannot be pitched from here. Only playlists whose curators have joined Urganize can be pitched. Spotify and Apple Music editorial playlists, and any other playlist outside Urganize, cannot.`,
    'Tell the user that plainly, show them these playlists, and ask which one they want:',
    ...shown.map((playlist) => `- ${describePlaylist(playlist)}`),
    `Pass the name exactly as it is written here (if two share a name, ask the user which platform first). Do not try another name that is not on this list.${more}`,
  ].join('\n');
}

function sharedName(wanted: string, matches: Playlist[]): string {
  return [
    `${matches.length} playlists are called "${wanted}". Ask the user which one they mean, then call pitch_song again with that playlist's id:`,
    ...matches.map((playlist) => `- ${describePlaylist(playlist)}, id ${String(playlist.id ?? '')}`),
  ].join('\n');
}

type PlaylistLookup = { ok: true; playlist: Playlist } | { ok: false; summary: string };

/**
 * Reads the playlists a team can pitch to and picks out the one meant. Used by
 * the card and by the send, because an approved card carries the model's own
 * arguments: a name on the card is still a name when it is sent.
 *
 * A list that cannot be read gives its own reason. It used to fall through to
 * "That playlist was not found.", which blamed the playlist for a paywall or a
 * server error.
 */
async function findPitchPlaylist(ctx: ChappiToolContext, wanted: string): Promise<PlaylistLookup> {
  const res = await callInternalApi(ctx, '/api/pitching/playlists', { method: 'GET' });
  if (isFlagGateOff(res)) return { ok: false, summary: PITCHING_OFF };
  if (!res.ok) return { ok: false, summary: apiError(res, 'Could not load the playlists.') };

  const playlists = Array.isArray(res.body.playlists) ? (res.body.playlists as Playlist[]) : [];
  const match = matchPlaylist(playlists, wanted);
  if (match.kind === 'found') return { ok: true, playlist: match.playlist };
  if (match.kind === 'ambiguous') return { ok: false, summary: sharedName(wanted, match.matches) };
  return { ok: false, summary: notOnUrganize(wanted, playlists) };
}

export const PROMO_TOOLS: ChappiTool[] = [
  {
    name: 'list_pitch_playlists',
    kind: 'read',
    level: 'read',
    description:
      'The only playlists a song can be pitched to from Urganize: the ones whose curators have joined. Call this before you propose a pitch and show the user the ones that fit. Optionally filtered by platform or genre. `credits` is what one pitch costs (0 means free).',
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
        // 0 is a free pitch; anything else is charged from the team's credits.
        credits: creditsOf(playlist),
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
    level: 'read',
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
    level: 'confirm',
    description:
      "Pitch a song from a rollout to a curator's playlist. Only a playlist from list_pitch_playlists can be pitched: call that first. Spotify and Apple Music editorial playlists, and any playlist outside Urganize, cannot be pitched from here. A paid playlist is charged from the team's credits when sent. Requires the user to approve a confirmation card — calling this only proposes it, and nothing reaches the curator until they approve.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: { type: 'string' },
        playlistId: {
          type: 'string',
          description: "The playlist's id from list_pitch_playlists. Its exact name also works.",
        },
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
      const found = await findPitchPlaylist(ctx, playlistId);
      if (!found.ok) return { ok: false, summary: found.summary };
      const playlist = found.playlist;

      const curator = String(playlist.curatorName ?? 'the curator');
      const credits = creditsOf(playlist);
      const cost = !isPitchCreditsEnabled()
        ? ''
        : credits > 0
          ? ` This uses ${plural(credits)}.`
          : ' This pitch is free.';
      return {
        ok: true,
        title: `Pitch "${songTitle}" to ${playlist.name}?`,
        detail: `${curator} gets the song, your link${note ? ' and your note' : ''}, and can answer from their own inbox. A pitch cannot be taken back.${cost}`,
        confirmLabel: 'Send pitch',
        // Approving replays these. Pin the real id (and the name, for the
        // closing line) so the pitch goes to the playlist the card showed,
        // even if the name the model used changes hands before the tap (#1272).
        args: {
          ...args,
          playlistId: String(playlist.id ?? playlistId),
          playlistName: oneLine(playlist.name).slice(0, 120),
        },
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
      const note = argString(args, 'note') || undefined;

      // A card built by `confirm` carries the real id and the playlist's name
      // (#1272), so it goes straight to the route: the route gives its own
      // reason for a paused curator or a playlist that is gone, and nothing is
      // read twice. A call that did not come through a card (or an old card)
      // can still carry a name in `playlistId`: look that up, send the real
      // id, and say where it went.
      let realPlaylistId = playlistId;
      const pinnedName = oneLine(argString(args, 'playlistName')).slice(0, 120);
      let sent = pinnedName ? `Pitched "${songTitle}" to ${pinnedName}.` : `Pitched "${songTitle}".`;
      if (!UUID.test(playlistId)) {
        const found = await findPitchPlaylist(ctx, playlistId);
        if (!found.ok) return fail(found.summary);
        realPlaylistId = String(found.playlist.id ?? '');
        sent = `Pitched "${songTitle}" to ${oneLine(found.playlist.name) || 'the playlist'}.`;
      }

      // With pitch credits on, every pitch goes through the credits route,
      // the same one Pitch this! uses: it charges a paid playlist and sends a
      // Free one for nothing. The free route refuses paid playlists, so it is
      // only for when credits are off. One request id per approved card: the
      // route charges a retry of the same id once, and the one-waiting-pitch
      // rule stops a second card from pitching the same playlist twice.
      if (isPitchCreditsEnabled()) {
        const res = await callInternalApi(ctx, '/api/pitching/send', {
          method: 'POST',
          body: { releaseId, playlistIds: [realPlaylistId], songTitle, songUrl, note, requestId: randomUUID() },
        });
        if (isFlagGateOff(res)) return fail(PITCHING_OFF);
        if (!res.ok) return fail(pitchRefusal(res));
        const charged = Number(res.body.charged);
        const balance = res.body.balance;
        const cost =
          Number.isFinite(charged) && charged > 0
            ? ` ${plural(charged)} used${typeof balance === 'number' ? `, ${balance} left` : ''}.`
            : '';
        return { ok: true, summary: `${sent}${cost}` };
      }

      const res = await callInternalApi(ctx, '/api/pitching/pitches', {
        method: 'POST',
        body: {
          releaseId,
          playlistId: realPlaylistId,
          songTitle,
          songUrl,
          songPlatform: argString(args, 'songPlatform') || undefined,
          note,
        },
      });
      if (isFlagGateOff(res)) return fail(PITCHING_OFF);
      if (!res.ok) return fail(pitchRefusal(res));
      return { ok: true, summary: sent };
    },
  },
  {
    name: 'get_recap',
    kind: 'read',
    level: 'read',
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
    level: 'auto',
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
    level: 'confirm',
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
    level: 'read',
    description:
      "Open the share sheet for a rollout. It turns the rollout into posts for Instagram, WhatsApp status, X and Snapchat, and a message the user can DM to anybody. The sheet asks four quick questions first (who is posting, whether the date can be public, a link for fans, one extra line), then the user posts from their own phone. You post nothing and cannot: this only opens the sheet. Say it is open and let them take it from there.",
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
