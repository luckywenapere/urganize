/**
 * Shows, sets, the song catalogue and the DJ pack.
 *
 * The release's sibling. A show hangs off the ARTIST, not off a release, and
 * the song is the join between the two — see the 2026-08-30 scope expansion in
 * CLAUDE.md. That is why nearly every tool here starts from an artist id and
 * why list_artists (tool-families/artists.ts) is usually the first call in a
 * shows conversation.
 *
 * Every read goes through the REST routes rather than the tables, so the
 * events feature flag and its access rules stay defined in exactly one place
 * and a switched-off surface reaches the model as a translatable 404. The
 * events route group was written knowing about this: the header of
 * app/api/events/_shared.ts names isFlagGateOff and explains why an ownership
 * miss must never answer 'Not found.'.
 *
 * The two things a show actually gets wrong in real life, per the founder's
 * own reasoning for building it, are the DJ arriving without the tracks and a
 * 38-minute set built for a 25-minute slot. get_show answers the second in one
 * call (it carries every set's running total and fit) and get_show plus
 * send_dj_pack answer the first.
 */

import {
  COMMON_RECIPIENT_ROLES,
  defaultPackExpiry,
  describeReceipt,
  type RecipientReceipt,
} from '@/lib/dj-pack';
import { EVENT_STATUSES, formatShowDateTime } from '@/lib/events';
import { describeSetlistFit, formatDuration, type SetlistSummary } from '@/lib/setlist';
import type { ShowEvent } from '@/types/events';
import {
  apiError,
  argNumber,
  argString,
  argStringArray,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const SHOWS_OFF = "Shows aren't switched on for this workspace yet.";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
//
// Exported and tested directly (shows.test.ts) rather than exercised through a
// tool, which would need a Supabase client and a live fetch. The insights.ts
// split: the tools stay thin callers and the decisions are testable.
// ─────────────────────────────────────────────────────────────────────────────

/** A show as one line a manager can read at a glance. */
export function describeShow(event: ShowEvent, now: Date = new Date()): string {
  const where = [event.venueName, event.city].filter(Boolean).join(', ');
  const when = event.setStartAt
    ? formatShowDateTime(event.setStartAt, event.timezone)
    : 'no set time yet';
  const parts = [event.title, where || null, when, `${event.setLengthMinutes} min slot`];
  if (event.status !== 'confirmed') parts.push(event.status);
  if (event.seriesTitle) parts.push(event.seriesTitle);
  // Deliberately not "in 3 days": a show is read off its own date, in the
  // VENUE's zone, and a relative day computed against the reader's clock is
  // the timezone sloppiness lib/events.ts exists to avoid.
  void now;
  return parts.filter(Boolean).join(' · ');
}

/**
 * Split a show list into what is still coming and what has been and gone.
 *
 * A show with no set time counts as UPCOMING, not past: the promoter has not
 * confirmed a time, which is a thing to chase rather than a thing to archive.
 * Cancelled shows stay in whichever half their date puts them — they are still
 * the answer to "what was on that weekend".
 */
export function partitionShows(
  events: readonly ShowEvent[],
  now: Date = new Date()
): { upcoming: ShowEvent[]; past: ShowEvent[] } {
  const cutoff = now.getTime();
  const upcoming: ShowEvent[] = [];
  const past: ShowEvent[] = [];
  for (const event of events) {
    if (!event.setStartAt) {
      upcoming.push(event);
      continue;
    }
    const at = Date.parse(event.setStartAt);
    if (Number.isNaN(at) || at >= cutoff) upcoming.push(event);
    else past.push(event);
  }
  // Soonest first for what is coming, most recent first for what is done —
  // both orders answer "and then what?" from where the reader is standing.
  upcoming.sort((a, b) => rank(a) - rank(b));
  past.sort((a, b) => rank(b) - rank(a));
  return { upcoming, past };
}

/** Sort key. A show with no time sorts to the front of the upcoming half: an
 *  unconfirmed set time is the most urgent thing on the list. */
function rank(event: ShowEvent): number {
  if (!event.setStartAt) return -Infinity;
  const at = Date.parse(event.setStartAt);
  return Number.isNaN(at) ? -Infinity : at;
}

/** The running total and whether it fits, as one sentence. Reuses the copy the
 *  set builder itself shows, so the assistant and the screen cannot disagree
 *  about whether a set overruns. */
export function describeSetTotal(summary: SetlistSummary, itemCount: number): string {
  const total = formatDuration(summary.totalSeconds);
  const measured = summary.isPartial ? `${total} so far` : total;
  return `${itemCount} ${itemCount === 1 ? 'item' : 'items'}, ${measured}. ${describeSetlistFit(
    summary
  )}`;
}

/** Who has the pack and what they have done with it. The point of the feature,
 *  so it is stated per person rather than summed. */
export function describePackState(
  receipts: readonly RecipientReceipt[],
  now: Date = new Date()
): string {
  const live = receipts.filter((receipt) => !receipt.revokedAt);
  if (live.length === 0) return 'The pack exists but nobody has been sent it yet.';
  return live
    .map((receipt) => {
      const who = receipt.role ? `${receipt.name} (${receipt.role})` : receipt.name;
      return `${who}: ${describeReceipt(receipt, now)}`;
    })
    .join('; ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools
// ─────────────────────────────────────────────────────────────────────────────

type ShowsResponse = { events?: ShowEvent[] };

async function loadShows(
  ctx: Parameters<ChappiTool['execute']>[0],
  artistId?: string
): Promise<{ error: string } | { events: ShowEvent[] }> {
  // GET /api/events takes NO artistId parameter — it returns the whole team's
  // shows, each carrying its own artistId. Passing one as a query string would
  // be silently ignored, so a tool that claimed to narrow by artist would list
  // everybody's shows and say it had filtered. Filter here instead.
  const res = await callInternalApi(ctx, '/api/events', { method: 'GET' });
  if (isFlagGateOff(res)) return { error: SHOWS_OFF };
  if (!res.ok) return { error: apiError(res, 'Could not load the shows.') };
  const all = ((res.body as ShowsResponse).events || []) as ShowEvent[];
  const events = artistId ? all.filter((event) => event.artistId === artistId) : all;
  return { events };
}

const compactShow = (event: ShowEvent) => ({
  id: event.id,
  artistId: event.artistId,
  artist: event.artistName,
  title: event.title,
  venue: event.venueName,
  city: event.city,
  timezone: event.timezone,
  setStartAt: event.setStartAt,
  setLengthMinutes: event.setLengthMinutes,
  status: event.status,
  series: event.seriesTitle,
  seriesDay: event.seriesDay,
  line: describeShow(event),
});

export const SHOW_TOOLS: ChappiTool[] = [
  {
    name: 'list_shows',
    kind: 'read',
    description:
      "List the team's shows — upcoming first, then past. Optionally narrow to one artist. Use this to find a show id.",
    inputSchema: {
      type: 'object',
      properties: {
        artistId: { type: 'string', description: 'Optional: only this artist’s shows.' },
      },
    },
    execute: async (ctx, args) => {
      const loaded = await loadShows(ctx, argString(args, 'artistId') || undefined);
      if ('error' in loaded) return fail(loaded.error);
      const { upcoming, past } = partitionShows(loaded.events);
      return {
        ok: true,
        summary:
          loaded.events.length === 0
            ? 'No shows booked yet.'
            : `${upcoming.length} upcoming, ${past.length} past.`,
        data: {
          upcoming: upcoming.map(compactShow),
          // A rollout runs for weeks and a roster plays year round, so the
          // past half is capped: the recent ones answer "how did that go",
          // and the whole history would crowd out the conversation.
          past: past.slice(0, 10).map(compactShow),
        },
      };
    },
  },
  {
    name: 'get_show',
    kind: 'read',
    description:
      'Get one show in full: venue, set time, slot length, the run of show, every setlist with its running total and whether it fits the slot, and who has the DJ pack.',
    inputSchema: {
      type: 'object',
      properties: { showId: { type: 'string', description: 'The show id.' } },
      required: ['showId'],
    },
    execute: async (ctx, args) => {
      const showId = argString(args, 'showId');
      if (!showId) return fail('showId is required.');

      const res = await callInternalApi(ctx, `/api/events/${showId}`, { method: 'GET' });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load that show.'));
      const event = res.body.event as ShowEvent | undefined;
      if (!event) return fail('That show was not found.');

      const setsRes = await callInternalApi(ctx, `/api/events/${showId}/setlists`, {
        method: 'GET',
      });
      const setlists = setsRes.ok
        ? ((setsRes.body.setlists || []) as Array<{ id: string; name: string }>)
        : [];

      // Each set's total needs its own read, so this is one call per set. A
      // show has one or two; the founder's own festival case is one set per
      // artist per day, and each of those is a separate show.
      const sets = [];
      for (const set of setlists) {
        const itemsRes = await callInternalApi(ctx, `/api/setlists/${set.id}/items`, {
          method: 'GET',
        });
        if (!itemsRes.ok) {
          sets.push({ id: set.id, name: set.name, total: 'Could not load this set.' });
          continue;
        }
        const items = (itemsRes.body.items || []) as Array<Record<string, unknown>>;
        const summary = itemsRes.body.summary as SetlistSummary | undefined;
        sets.push({
          id: set.id,
          name: set.name,
          itemCount: items.length,
          total: summary ? describeSetTotal(summary, items.length) : 'No running total.',
          items: items.map((item) => ({
            id: String(item.id || ''),
            type: String(item.itemType || 'song'),
            title: String(item.songTitle || item.label || ''),
            duration: formatDuration(
              typeof item.durationSeconds === 'number' ? item.durationSeconds : null
            ),
          })),
        });
      }

      // The pack hangs off a SET, not the show, so it is read per set. Most
      // shows have one, and a failure here must not lose the set totals.
      const packs = [];
      for (const set of setlists) {
        const packRes = await callInternalApi(ctx, `/api/setlists/${set.id}/pack`, {
          method: 'GET',
        });
        if (!packRes.ok || !packRes.body.pack) continue;
        const receipts = (packRes.body.receipts || []) as RecipientReceipt[];
        packs.push({
          setlistId: set.id,
          setName: set.name,
          state: describePackState(receipts),
        });
      }

      return {
        ok: true,
        summary: describeShow(event),
        data: {
          show: compactShow(event),
          notes: event.notes,
          promoter: event.promoterName,
          runOfShow: (res.body.runOfShow || []) as unknown,
          setlists: sets,
          packs,
        },
      };
    },
  },
  {
    name: 'list_songs',
    kind: 'read',
    description:
      "List an artist's song catalogue — what can be dragged into a setlist. Needed before add_setlist_item, which takes a song id.",
    inputSchema: {
      type: 'object',
      properties: { artistId: { type: 'string', description: 'The artist id.' } },
      required: ['artistId'],
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      if (!artistId) return fail('artistId is required.');
      const res = await callInternalApi(
        ctx,
        `/api/songs?artistId=${encodeURIComponent(artistId)}`,
        { method: 'GET' }
      );
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the catalogue.'));
      const songs = (res.body.songs || []) as Array<Record<string, unknown>>;
      return {
        ok: true,
        summary: `${songs.length} ${songs.length === 1 ? 'song' : 'songs'} in the catalogue.`,
        data: {
          songs: songs.map((song) => ({
            id: String(song.id || ''),
            title: String(song.title || ''),
            duration: formatDuration(
              typeof song.durationSeconds === 'number' ? song.durationSeconds : null
            ),
            bpm: song.bpm ?? null,
            key: song.musicalKey ?? null,
          })),
        },
      };
    },
  },
  {
    name: 'create_song',
    kind: 'mutate',
    description:
      "Add a song to an artist's catalogue so it can go in a setlist. Give a duration when you know it — a set with unmeasured songs cannot be told whether it fits.",
    inputSchema: {
      type: 'object',
      properties: {
        artistId: { type: 'string' },
        title: { type: 'string' },
        durationSeconds: { type: 'number', description: 'Length in seconds.' },
        bpm: { type: 'number' },
        musicalKey: { type: 'string', description: 'e.g. "Am".' },
      },
      required: ['artistId', 'title'],
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      const title = argString(args, 'title');
      if (!artistId || !title) return fail('artistId and title are required.');
      const res = await callInternalApi(ctx, '/api/songs', {
        method: 'POST',
        body: {
          artistId,
          title,
          durationSeconds: argNumber(args, 'durationSeconds'),
          bpm: argNumber(args, 'bpm'),
          musicalKey: argString(args, 'musicalKey') || undefined,
        },
      });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not add the song.'));
      return { ok: true, summary: `Added "${title}" to the catalogue.` };
    },
  },
  {
    name: 'create_show',
    kind: 'mutate',
    description:
      'Book a show for an artist. The timezone is the VENUE\'s, not the user\'s — an IANA name like "Africa/Lagos". Set length is the slot in minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        artistId: { type: 'string', description: 'Which roster artist is playing.' },
        title: { type: 'string', description: 'What the show is called.' },
        venueName: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string' },
        timezone: { type: 'string', description: 'IANA zone of the venue, e.g. Africa/Lagos.' },
        setStartAt: { type: 'string', description: 'ISO instant the set starts.' },
        setLengthMinutes: { type: 'number', description: 'The slot, in minutes.' },
        stage: { type: 'string' },
        promoterName: { type: 'string' },
        promoterPhone: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['artistId', 'title'],
    },
    execute: async (ctx, args) => {
      const artistId = argString(args, 'artistId');
      const title = argString(args, 'title');
      if (!artistId || !title) return fail('artistId and title are required.');
      const res = await callInternalApi(ctx, '/api/events', {
        method: 'POST',
        body: {
          artistId,
          title,
          venueName: argString(args, 'venueName') || undefined,
          city: argString(args, 'city') || undefined,
          country: argString(args, 'country') || undefined,
          timezone: argString(args, 'timezone') || undefined,
          setStartAt: argString(args, 'setStartAt') || undefined,
          setLengthMinutes: argNumber(args, 'setLengthMinutes'),
          stage: argString(args, 'stage') || undefined,
          promoterName: argString(args, 'promoterName') || undefined,
          promoterPhone: argString(args, 'promoterPhone') || undefined,
          notes: argString(args, 'notes') || undefined,
        },
      });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not book the show.'));
      const event = res.body.event as ShowEvent | undefined;
      return {
        ok: true,
        summary: event ? `Booked ${describeShow(event)}` : `Booked "${title}".`,
        data: { showId: event?.id ?? null },
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'update_show',
    kind: 'mutate',
    description:
      'Change a show. Send only the fields that are changing; anything left out is preserved. Use this to confirm, complete or cancel a show via status.',
    inputSchema: {
      type: 'object',
      properties: {
        showId: { type: 'string' },
        title: { type: 'string' },
        venueName: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string' },
        timezone: { type: 'string' },
        setStartAt: { type: 'string', description: 'ISO instant.' },
        setLengthMinutes: { type: 'number' },
        stage: { type: 'string' },
        promoterName: { type: 'string' },
        promoterPhone: { type: 'string' },
        status: { type: 'string', enum: [...EVENT_STATUSES] },
        notes: { type: 'string' },
      },
      required: ['showId'],
    },
    execute: async (ctx, args) => {
      const showId = argString(args, 'showId');
      if (!showId) return fail('showId is required.');

      // This PATCH is genuinely sparse — only the keys present are written
      // (the route says so at app/api/events/[eventId]/route.ts). So unlike
      // update_release_metadata there is no read-then-merge here: sending the
      // whole row back would be the thing that loses a field.
      const body: Record<string, unknown> = {};
      for (const key of [
        'title',
        'venueName',
        'city',
        'country',
        'timezone',
        'setStartAt',
        'stage',
        'promoterName',
        'promoterPhone',
        'status',
        'notes',
      ]) {
        const value = argString(args, key);
        if (value) body[key] = value;
      }
      const minutes = argNumber(args, 'setLengthMinutes');
      if (minutes !== undefined) body.setLengthMinutes = minutes;
      if (Object.keys(body).length === 0) return fail('Nothing to change.');

      const res = await callInternalApi(ctx, `/api/events/${showId}`, { method: 'PATCH', body });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not update the show.'));
      const event = res.body.event as ShowEvent | undefined;
      return {
        ok: true,
        summary: event ? `Updated: ${describeShow(event)}` : 'Updated the show.',
        clientAction: { type: 'refresh' },
      };
    },
  },
  {
    name: 'delete_show',
    kind: 'mutate',
    description: 'Delete a show and everything attached to it — its sets and their DJ packs.',
    inputSchema: {
      type: 'object',
      properties: { showId: { type: 'string' } },
      required: ['showId'],
    },
    confirm: async (ctx, args) => {
      const showId = argString(args, 'showId');
      if (!showId) return { ok: false, summary: 'showId is required.' };
      const res = await callInternalApi(ctx, `/api/events/${showId}`, { method: 'GET' });
      if (isFlagGateOff(res)) return { ok: false, summary: SHOWS_OFF };
      if (!res.ok) return { ok: false, summary: apiError(res, 'Could not find that show.') };
      const event = res.body.event as ShowEvent | undefined;
      if (!event) return { ok: false, summary: 'That show was not found.' };
      const setsRes = await callInternalApi(ctx, `/api/events/${showId}/setlists`, {
        method: 'GET',
      });
      const sets = setsRes.ok ? ((setsRes.body.setlists || []) as unknown[]).length : 0;
      return {
        ok: true,
        title: `Delete "${event.title}"?`,
        detail:
          sets > 0
            ? `${describeShow(event)}. Its ${sets} ${sets === 1 ? 'set' : 'sets'} and any DJ packs go too. This cannot be undone.`
            : `${describeShow(event)}. This cannot be undone.`,
        confirmLabel: 'Delete show',
      };
    },
    execute: async (ctx, args) => {
      const showId = argString(args, 'showId');
      if (!showId) return fail('showId is required.');
      const res = await callInternalApi(ctx, `/api/events/${showId}`, { method: 'DELETE' });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not delete the show.'));
      return { ok: true, summary: 'Deleted the show.', clientAction: { type: 'refresh' } };
    },
  },
  {
    name: 'create_setlist',
    kind: 'mutate',
    description:
      'Add a set to a show. A show can have several — a main set and an encore, or one per artist at a festival.',
    inputSchema: {
      type: 'object',
      properties: {
        showId: { type: 'string' },
        name: { type: 'string', description: 'Defaults to "Main set".' },
      },
      required: ['showId'],
    },
    execute: async (ctx, args) => {
      const showId = argString(args, 'showId');
      if (!showId) return fail('showId is required.');
      const name = argString(args, 'name');
      const res = await callInternalApi(ctx, `/api/events/${showId}/setlists`, {
        method: 'POST',
        body: name ? { name } : {},
      });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not add the set.'));
      const setlist = res.body.setlist as { id?: string; name?: string } | undefined;
      return {
        ok: true,
        summary: `Added the set "${setlist?.name || name || 'Main set'}".`,
        data: { setlistId: setlist?.id ?? null },
      };
    },
  },
  {
    name: 'update_setlist',
    kind: 'mutate',
    description: 'Rename a set, e.g. to "Victony\'s setlist" at a festival.',
    inputSchema: {
      type: 'object',
      properties: { setlistId: { type: 'string' }, name: { type: 'string' } },
      required: ['setlistId', 'name'],
    },
    execute: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      const name = argString(args, 'name');
      if (!setlistId || !name) return fail('setlistId and name are required.');
      const res = await callInternalApi(ctx, `/api/setlists/${setlistId}`, {
        method: 'PATCH',
        body: { name },
      });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not rename the set.'));
      return { ok: true, summary: `Renamed the set to "${name}".` };
    },
  },
  {
    name: 'delete_setlist',
    kind: 'mutate',
    description: 'Delete a whole set, and the DJ pack built from it.',
    inputSchema: {
      type: 'object',
      properties: { setlistId: { type: 'string' } },
      required: ['setlistId'],
    },
    confirm: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      if (!setlistId) return { ok: false, summary: 'setlistId is required.' };
      const res = await callInternalApi(ctx, `/api/setlists/${setlistId}/items`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return { ok: false, summary: SHOWS_OFF };
      if (!res.ok) return { ok: false, summary: apiError(res, 'Could not find that set.') };
      const count = ((res.body.items || []) as unknown[]).length;
      return {
        ok: true,
        title: 'Delete this set?',
        detail: `${count} ${count === 1 ? 'item' : 'items'} and any DJ pack sent from it go too. This cannot be undone.`,
        confirmLabel: 'Delete set',
      };
    },
    execute: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      if (!setlistId) return fail('setlistId is required.');
      const res = await callInternalApi(ctx, `/api/setlists/${setlistId}`, { method: 'DELETE' });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not delete the set.'));
      return { ok: true, summary: 'Deleted the set.' };
    },
  },
  {
    name: 'add_setlist_item',
    kind: 'mutate',
    description:
      'Add something to the end of a set. Either a song from the catalogue (songId), or a slot that is not a song — a break, a talk, a guest — with a label and a length. Call it once per item.',
    inputSchema: {
      type: 'object',
      properties: {
        setlistId: { type: 'string' },
        songId: { type: 'string', description: 'A song from list_songs.' },
        label: { type: 'string', description: 'For a non-song slot, e.g. "Crowd talk".' },
        itemType: {
          type: 'string',
          description: 'Leave out for a song. Otherwise the kind of slot.',
        },
        durationSeconds: {
          type: 'number',
          description: "Length in seconds. Needed for a non-song slot, and overrides the song's own length.",
        },
        cueNote: { type: 'string', description: 'A note for whoever is playing it.' },
      },
      required: ['setlistId'],
    },
    execute: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      if (!setlistId) return fail('setlistId is required.');
      const songId = argString(args, 'songId');
      const label = argString(args, 'label');
      if (!songId && !label) return fail('Give either a songId or a label for the slot.');
      const body: Record<string, unknown> = {};
      if (songId) body.songId = songId;
      if (label) body.label = label;
      const itemType = argString(args, 'itemType');
      if (itemType) body.itemType = itemType;
      const duration = argNumber(args, 'durationSeconds');
      if (duration !== undefined) body.durationSeconds = duration;
      const cueNote = argString(args, 'cueNote');
      if (cueNote) body.cueNote = cueNote;

      const res = await callInternalApi(ctx, `/api/setlists/${setlistId}/items`, {
        method: 'POST',
        body,
      });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not add that to the set.'));

      // The POST answers with { item } and no running total, so read the set
      // back for one. Worth the extra call: "does it still fit the slot" is
      // the question adding a song raises, and answering it a turn later is
      // how a 38-minute set gets built for a 25-minute slot.
      const after = await callInternalApi(ctx, `/api/setlists/${setlistId}/items`, {
        method: 'GET',
      });
      const summary = after.ok ? (after.body.summary as SetlistSummary | undefined) : undefined;
      return {
        ok: true,
        summary: summary ? `Added it. ${describeSetlistFit(summary)}` : 'Added it to the set.',
        data: { itemId: String((res.body.item as Record<string, unknown>)?.id || '') },
      };
    },
  },
  {
    // remove_, not delete_, and the name is the decision: every delete_* tool
    // in this registry must be confirmation-gated (tool-registry.test.ts), and
    // taking one song out of a list is trivially reversible — you add it back.
    // A permission card for that trains people to dismiss cards. The name is
    // also just honest: this removes from a list, it does not destroy a song.
    name: 'remove_setlist_item',
    kind: 'mutate',
    description: 'Take one item out of a set. The song stays in the catalogue.',
    inputSchema: {
      type: 'object',
      properties: { setlistId: { type: 'string' }, itemId: { type: 'string' } },
      required: ['setlistId', 'itemId'],
    },
    execute: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      const itemId = argString(args, 'itemId');
      if (!setlistId || !itemId) return fail('setlistId and itemId are required.');
      const res = await callInternalApi(ctx, `/api/setlists/${setlistId}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not remove that item.'));
      return { ok: true, summary: 'Removed it from the set.' };
    },
  },
  {
    name: 'reorder_setlist',
    kind: 'mutate',
    description:
      'Reorder a set. Pass EVERY item id in the order you want them played, from get_show.',
    inputSchema: {
      type: 'object',
      properties: {
        setlistId: { type: 'string' },
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Every item id, in the new running order.',
        },
      },
      required: ['setlistId', 'itemIds'],
    },
    execute: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      const itemIds = argStringArray(args, 'itemIds');
      if (!setlistId) return fail('setlistId is required.');
      if (itemIds.length === 0) return fail('Pass the item ids in the order you want them.');
      const res = await callInternalApi(ctx, `/api/setlists/${setlistId}/reorder`, {
        method: 'POST',
        body: { itemIds },
      });
      if (isFlagGateOff(res)) return fail(SHOWS_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not reorder the set.'));
      return { ok: true, summary: 'Reordered the set.' };
    },
  },
  {
    name: 'send_dj_pack',
    kind: 'mutate',
    description:
      "Send a set's tracks to one person — the DJ, the sound engineer — as their own private link, and report back when they open it. Each recipient gets a separate link, which is what makes the read receipts per person.",
    inputSchema: {
      type: 'object',
      properties: {
        setlistId: { type: 'string' },
        recipientName: { type: 'string', description: 'Who it is for.' },
        role: {
          type: 'string',
          description: `Their job, e.g. ${COMMON_RECIPIENT_ROLES.join(', ')}.`,
        },
        passcode: { type: 'string', description: 'Optional four digits to lock the link.' },
      },
      required: ['setlistId', 'recipientName'],
    },
    confirm: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      const recipientName = argString(args, 'recipientName');
      if (!setlistId || !recipientName) {
        return { ok: false, summary: 'setlistId and recipientName are required.' };
      }
      const res = await callInternalApi(ctx, `/api/setlists/${setlistId}/items`, {
        method: 'GET',
      });
      if (isFlagGateOff(res)) return { ok: false, summary: SHOWS_OFF };
      if (!res.ok) return { ok: false, summary: apiError(res, 'Could not find that set.') };
      const count = ((res.body.items || []) as unknown[]).length;
      if (count === 0) {
        return {
          ok: false,
          summary: 'That set is empty, so there is nothing to send. Add the songs first.',
        };
      }
      return {
        ok: true,
        title: `Send the pack to ${recipientName}?`,
        detail: `${count} ${count === 1 ? 'track' : 'tracks'}. They get their own private link, and it cannot be unsent — though you can revoke it afterwards.`,
        confirmLabel: 'Send pack',
      };
    },
    execute: async (ctx, args) => {
      const setlistId = argString(args, 'setlistId');
      const recipientName = argString(args, 'recipientName');
      if (!setlistId || !recipientName) {
        return fail('setlistId and recipientName are required.');
      }

      // The pack is per SET and creating it is idempotent, so this is safe to
      // call for a set that already has one — it returns the existing pack
      // rather than minting a second set of links for the same songs.
      const packRes = await callInternalApi(ctx, `/api/setlists/${setlistId}/pack`, {
        method: 'POST',
        body: { passcode: argString(args, 'passcode') || undefined },
      });
      if (isFlagGateOff(packRes)) return fail(SHOWS_OFF);
      if (!packRes.ok) return fail(apiError(packRes, 'Could not build the pack.'));
      const packId = String((packRes.body.pack as Record<string, unknown>)?.id || '');
      if (!packId) return fail('The pack was built but came back without an id.');

      const res = await callInternalApi(ctx, `/api/packs/${packId}/recipients`, {
        method: 'POST',
        body: { name: recipientName, role: argString(args, 'role') || undefined },
      });
      if (!res.ok) {
        return fail(
          apiError(res, `The pack is ready but ${recipientName} could not be added to it.`)
        );
      }
      const recipient = res.body.recipient as Record<string, unknown> | undefined;
      const token = String(recipient?.token || '');
      return {
        ok: true,
        summary: token
          ? `${recipientName} can collect the tracks at ${ctx.origin}/pack/${token}. Send them that link.`
          : `Added ${recipientName} to the pack.`,
        data: {
          packUrl: token ? `${ctx.origin}/pack/${token}` : null,
          expiresAt: defaultPackExpiry(null),
        },
      };
    },
  },
];
