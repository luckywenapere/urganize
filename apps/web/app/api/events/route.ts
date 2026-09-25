import { NextRequest, NextResponse } from 'next/server';
import { decideReleaseAccess } from '@/lib/release-access';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { listWorkspaceArtists, type WorkspaceArtist } from '@/lib/artists-server';
import { buildDefaultRunOfShow, parseEventCreate } from '@/lib/events';
import {
  EVENTS_LIST_LIMIT,
  EVENTS_TABLE,
  EVENT_COLUMNS,
  RUN_OF_SHOW_TABLE,
  createAdminClient,
  ensureArtistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  listBookableArtistIds,
  requireActiveAuthenticatedUser,
  toShowEvent,
  asRow,
} from './_shared';

/**
 * GET /api/events — every show the caller can see, soonest first.
 *
 * Reads the whole accessible set and filters in memory through the shared
 * access rule rather than trying to express artist scope in the query. The set
 * is one team's shows, the rule has three branches, and duplicating it as SQL
 * is exactly how the two would drift.
 */
export async function GET(request: NextRequest) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  const ownerIds = access.releaseOwnerIds.length ? access.releaseOwnerIds : [auth.user.id];

  const { data, error } = await adminClient
    .from(EVENTS_TABLE)
    .select(EVENT_COLUMNS)
    .in('owner_user_id', ownerIds)
    .order('set_start_at', { ascending: true, nullsFirst: false })
    .limit(EVENTS_LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load your shows.' },
      { status: 500 }
    );
  }

  // Artist names for display, so a list of shows does not need a join per row.
  // Resolved from the caller's own roster, which also means a show whose
  // artist somehow sits outside it renders with a blank name rather than
  // leaking one.
  const roster: WorkspaceArtist[] = access.primaryWorkspaceId
    ? await listWorkspaceArtists(adminClient, access.primaryWorkspaceId)
    : [];
  const artistNames = new Map<string, string>();
  for (const artist of roster) {
    artistNames.set(artist.id, artist.name);
  }

  const events = (data || [])
    .map((row) => asRow(row))
    .filter(
      (row) =>
        decideReleaseAccess({
          releaseOwnerId: String(row.owner_user_id || ''),
          releaseArtistId: String(row.artist_id || ''),
          userId: auth.user.id,
          access,
          write: false,
        }) === 'allow'
    )
    .map((row) => toShowEvent(row, artistNames.get(String(row.artist_id || '')) || ''));

  return NextResponse.json({
    events,
    // Who "Book a show" may offer. Computed with the same rule the create
    // route enforces, so the form never offers an artist it would refuse and a
    // guest sees no button at all.
    bookableArtistIds: listBookableArtistIds(roster, auth.user, access),
  });
}

/**
 * POST /api/events — book a show.
 *
 * Only a title is required. "We got the Lagos show" should take one field to
 * record; the venue, the promoter and the set time arrive over the following
 * week, which is why every other column is nullable or defaulted.
 */
export async function POST(request: NextRequest) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send the show details.' }, { status: 400 });
  }

  const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : '';
  if (!artistId) {
    return NextResponse.json({ error: 'Which artist is playing?' }, { status: 400 });
  }

  const parsed = parseEventCreate(body);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: parsed.errors[0].message, fieldErrors: parsed.errors },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  // The artist has to be on the CALLER'S roster, AND the caller has to be able
  // to write for it: a guest is read-only and an artist-scoped teammate only
  // books for their own artist (ensureArtistAccess). An artist on someone
  // else's team is indistinguishable from one that does not exist, so this
  // cannot be used to probe for ids.
  const resolved = await ensureArtistAccess(adminClient, auth.user, artistId, true);
  if ('error' in resolved) return resolved.error;
  const { artist } = resolved;

  // STAMPED WITH THE ARTIST'S OWNER, never the acting teammate — the same rule
  // the release scenes follow for their child rows, and here it is what makes
  // team visibility work at all. Every account owns a personal workspace, so an
  // event owned by the teammate who created it would sit in a workspace nobody
  // else belongs to, and the team owner would never see the show they were
  // told about.
  const ownerUserId = resolved.ownerUserId;

  const { data, error } = await adminClient
    .from(EVENTS_TABLE)
    .insert({ ...parsed.columns, owner_user_id: ownerUserId, artist_id: artist.id })
    .select(EVENT_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not book the show.' },
      { status: 500 }
    );
  }

  const row = asRow(data);

  // Seed the run of show so the manager fills in times rather than inventing
  // the list. Best-effort: a show with no run of show is still a usable show,
  // and failing the whole booking over the seed would be the wrong trade.
  const seedError = await adminClient.from(RUN_OF_SHOW_TABLE).insert(
    buildDefaultRunOfShow().map((item) => ({
      ...item,
      event_id: String(row.id),
      owner_user_id: ownerUserId,
    }))
  );
  if (seedError.error) {
    console.error('[events] run of show seed failed', {
      eventId: String(row.id),
      message: seedError.error.message,
    });
  }

  return NextResponse.json({ event: toShowEvent(row, artist.name) }, { status: 201 });
}
