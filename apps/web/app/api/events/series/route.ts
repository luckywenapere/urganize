import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import {
  buildDefaultRunOfShow,
  buildSeriesShowTitle,
  parseSeriesCreate,
  shiftLocalDays,
  toIsoInZone,
} from '@/lib/events';
import {
  EVENTS_TABLE,
  EVENT_COLUMNS,
  RUN_OF_SHOW_TABLE,
  asRow,
  createAdminClient,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
  toShowEvent,
} from '../_shared';

/**
 * POST /api/events/series — book a festival as a SERIES of single shows.
 *
 * One `events` row per artist per day, all carrying the same `series_id`
 * (design-partner ask 2026-09-02; founder call: series of shows, roster
 * artists only — see lib/events.ts "Series" and the migration header). Each
 * row is a complete, ordinary show afterwards: its own setlists, its own DJ
 * pack, deletable on its own. Nothing here is consulted again after the
 * insert; the series exists only as the grouping the shows list renders.
 *
 * Mirrors POST /api/events step for step, so the two cannot drift on the
 * things that matter: flag first, roster-scoped artists, owner stamping, and a
 * best-effort run-of-show seed.
 */
export async function POST(request: NextRequest) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send the festival details.' }, { status: 400 });
  }

  const parsed = parseSeriesCreate(body);
  if (!parsed.value) {
    return NextResponse.json(
      { error: parsed.errors[0]?.message || 'Check the festival details.', fieldErrors: parsed.errors },
      { status: 400 }
    );
  }
  const series = parsed.value;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  if (!access.primaryWorkspaceId) {
    return NextResponse.json({ error: 'No team found.' }, { status: 400 });
  }

  // EVERY artist has to be on the caller's roster, and one that is not is
  // indistinguishable from one that does not exist — the same 404 the single
  // create returns, so this route cannot be used to probe for ids either.
  const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
  const artists = series.artistIds.map((id) => roster.find((candidate) => candidate.id === id));
  if (artists.some((artist) => !artist)) {
    return NextResponse.json({ error: 'That artist is not on your roster.' }, { status: 404 });
  }

  const seriesId = randomUUID();
  const rows: Record<string, unknown>[] = [];
  for (let day = 1; day <= series.days; day += 1) {
    // Same wall clock every day, in the venue's zone — never "+24h", which
    // drifts by an hour across a daylight-saving change (see shiftLocalDays).
    const dayLocal = series.firstDayLocalStart
      ? shiftLocalDays(series.firstDayLocalStart, day - 1)
      : null;
    const setStartAt = dayLocal ? toIsoInZone(dayLocal, series.timezone) : null;

    for (const artist of artists) {
      if (!artist) continue;
      rows.push({
        // STAMPED WITH THE ARTIST'S OWNER, never the acting teammate — the rule
        // every event and child row follows, and what makes team visibility
        // work (see POST /api/events).
        owner_user_id: artist.ownerUserId || auth.user.id,
        artist_id: artist.id,
        title: buildSeriesShowTitle(series.seriesTitle, day, series.days),
        venue_name: series.venueName,
        city: series.city,
        timezone: series.timezone,
        set_start_at: setStartAt,
        set_length_minutes: series.setLengthMinutes,
        series_id: seriesId,
        series_title: series.seriesTitle,
        series_day: day,
      });
    }
  }

  const { data, error } = await adminClient.from(EVENTS_TABLE).insert(rows).select(EVENT_COLUMNS);

  if (error || !data || data.length === 0) {
    return NextResponse.json(
      { error: error?.message || 'Could not book the shows.' },
      { status: 500 }
    );
  }

  const created = data.map((row) => asRow(row));

  // Seed every show's run of show in one insert. Best-effort, as for a single
  // show: a show with no run of show is still a usable show.
  const seeds = created.flatMap((row) =>
    buildDefaultRunOfShow().map((item) => ({
      ...item,
      event_id: String(row.id),
      owner_user_id: String(row.owner_user_id || auth.user.id),
    }))
  );
  const seedError = await adminClient.from(RUN_OF_SHOW_TABLE).insert(seeds);
  if (seedError.error) {
    console.error('[events] series run of show seed failed', {
      seriesId,
      message: seedError.error.message,
    });
  }

  const artistNames = new Map(roster.map((artist) => [artist.id, artist.name]));
  const events = created
    .map((row) => toShowEvent(row, artistNames.get(String(row.artist_id || '')) || ''))
    .sort(
      (a, b) => (a.seriesDay ?? 0) - (b.seriesDay ?? 0) || a.artistName.localeCompare(b.artistName)
    );

  return NextResponse.json({ events }, { status: 201 });
}
