// The Home tab's data load. GATHERS data (releases/tasks via the shared
// command-center loader, plus Home-only reads: role facts, roster, shows,
// setlists, DJ pack receipts, pitches) and hands it to the pure lib/home/*
// functions to COMPUTE the payload — the same split as everywhere else in
// this codebase (I/O here, decisions in lib/home/*).
//
// WHY THIS WRITES ITS OWN QUERIES RATHER THAN IMPORTING THE THREE EXISTING
// ROUTE HANDLERS (pitching/pitches, setlists/[id]/pack, events). Those routes
// answer "everything about ONE thing" (one release's pitches, one set's pack,
// one show's detail) behind their own access checks tailored to a single
// row. Home asks a structurally different question — "what, across
// everything visible, needs attention in the next N days" — and answering it
// without an N+1 query per release/show needs batched `.in()` reads those
// single-row handlers don't have a shape for. So this module imports their
// ALREADY-EXPORTED primitives (table/column constants, row mappers, the pure
// helpers in lib/dj-pack.ts / lib/setlist.ts / lib/events.ts /
// lib/pitching.ts) rather than duplicating them, and writes its own
// aggregate queries on top — never touching or modifying the three routes
// themselves.

import type { Timings } from '@/lib/server-timing';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { getSubscriptionSnapshot } from '@/lib/subscription-access';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { decideReleaseAccess } from '@/lib/release-access';
import { loadCommandCenterData } from '@/lib/command-center-server';
import type { SchedulableShow } from '@/lib/events';
import type { SetlistSummaryItem } from '@/lib/setlist';
import {
  PITCHES_TABLE,
  SENT_PITCH_COLUMNS,
  SENT_PITCH_LIST_LIMIT,
  isPitchingFeatureEnabled,
} from '@/app/api/pitching/_shared';
import type { SentPitch } from '@/types/pitching';
import type { CommandCenterData, ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { buildHomeHeader } from '@/lib/home/header';
import { resolveHomeRole } from '@/lib/home/role';
import {
  resolveArtistState,
  resolveLabelState,
  resolveManagerState,
  isReleaseInFlight,
  isTaskLate,
  toHomeStateKey,
} from '@/lib/home/state';
import { buildArtistChips } from '@/lib/home/artists';
import { buildYourTasks, buildWaitingOnOthers } from '@/lib/home/tasks';
import { buildReleaseSummary } from '@/lib/home/releases';
import { buildPlacements } from '@/lib/home/placements';
import { buildNextShow, selectNextShow } from '@/lib/home/shows';
import { LABEL_ROSTER_GAP_DAYS } from '@/lib/home/config';
import type { HomePayload, HomeWaitingDjLink } from '@/lib/home/types';

type WorkspaceAccessContext = Awaited<ReturnType<typeof loadWorkspaceAccessContext>>;

const EVENTS_TABLE = 'events';
const SETLISTS_TABLE = 'setlists';
const SETLIST_ITEMS_TABLE = 'setlist_items';
const SONGS_TABLE = 'songs';
const SONG_VERSIONS_TABLE = 'song_versions';
const DJ_PACKS_TABLE = 'dj_packs';
const DJ_PACK_RECIPIENTS_TABLE = 'dj_pack_recipients';
const DJ_PACK_ACCESS_LOG_TABLE = 'dj_pack_access_log';
const ARTISTS_TABLE = 'artists';
const PROFILES_TABLE = 'profiles';

const EVENT_COLUMNS =
  'id,owner_user_id,artist_id,title,venue_name,city,timezone,set_start_at,set_length_minutes,status';

/** How far ahead Home looks for shows at all — DJ-link waiting can matter for
 * a show further out than the 14-day "next show" window, so this is wider on
 * purpose (see lib/home/config.ts's NEXT_SHOW_WINDOW_DAYS for the narrower
 * window "next show" itself is filtered to). */
const SHOW_LOOKAHEAD_DAYS = 30;

const isEventsFeatureEnabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';

function readErr(label: string, error: { message?: string } | null): void {
  // Never throws — every Home-only read degrades to empty data rather than
  // failing the whole tab (the releases/tasks load above this already owns
  // the one failure mode that SHOULD 500 the request). Logged so a real
  // outage is visible in the Vercel runtime log rather than a silently thin
  // Home screen (the command-center activity closure's own precedent).
  if (error) console.error(`[home] ${label} failed:`, error.message);
}

async function loadArtistNames(adminClient: SupabaseClient, artistIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(artistIds.filter(Boolean)));
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data, error } = await adminClient.from(ARTISTS_TABLE).select('id,name').in('id', ids);
  readErr('artist names', error);
  for (const row of (data || []) as Array<{ id: string; name: string }>) {
    names.set(String(row.id), String(row.name || ''));
  }
  return names;
}

// ── Role + team facts ───────────────────────────────────────────────────────

type RoleFacts = {
  role: HomePayload['role'];
  teamName: string | null;
  primaryOwnerId: string;
  roster: Array<{ id: string; name: string }>;
  viewerName: string | null;
};

async function loadRoleFacts(adminClient: SupabaseClient, user: User, access: WorkspaceAccessContext): Promise<RoleFacts> {
  const [teamSnapshot, profileResult] = await Promise.all([
    getTeamAccessForUser(user.id, user.email),
    adminClient.from(PROFILES_TABLE).select('name,role').eq('id', user.id).maybeSingle(),
  ]);

  readErr('profile read', profileResult.error);
  const profileRow = (profileResult.data || null) as { name?: string | null; role?: string | null } | null;

  const ownerSnapshot = teamSnapshot.ownerUserId ? await getSubscriptionSnapshot(teamSnapshot.ownerUserId) : null;

  const isArtistScopedOnPrimary = Boolean(
    access.primaryWorkspaceId && access.artistScopeByWorkspaceId[access.primaryWorkspaceId]
  );

  const role = resolveHomeRole({
    isOwnerOrAdmin: teamSnapshot.isOwnerOrAdmin,
    teamState: teamSnapshot.state,
    ownerPlan: ownerSnapshot?.plan ?? null,
    profileRole: profileRow?.role ?? null,
    isArtistScopedOnPrimary,
  });

  const primaryOwnerId = teamSnapshot.ownerUserId || user.id;
  const roster = teamSnapshot.primaryWorkspaceId
    ? (await listWorkspaceArtists(adminClient, teamSnapshot.primaryWorkspaceId)).map((artist) => ({
        id: artist.id,
        name: artist.name,
      }))
    : [];

  return { role, teamName: teamSnapshot.teamName, primaryOwnerId, roster, viewerName: profileRow?.name ?? null };
}

// ── Shows: next show + DJ-link waits, batched regardless of show count ─────

type ShowRow = {
  id: string;
  ownerUserId: string;
  artistId: string;
  artistName: string;
  title: string;
  venueName: string | null;
  city: string | null;
  timezone: string;
  setStartAt: string | null;
  setLengthMinutes: number;
  status: string;
};

async function loadVisibleShows(
  adminClient: SupabaseClient,
  user: User,
  access: WorkspaceAccessContext,
  now: Date
): Promise<ShowRow[]> {
  if (!isEventsFeatureEnabled()) return [];

  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + SHOW_LOOKAHEAD_DAYS * 86_400_000).toISOString();

  const { data, error } = await adminClient
    .from(EVENTS_TABLE)
    .select(EVENT_COLUMNS)
    .neq('status', 'cancelled')
    .gte('set_start_at', windowStart)
    .lte('set_start_at', windowEnd)
    .order('set_start_at', { ascending: true })
    .limit(100);

  readErr('events', error);
  const rows = (data || []) as Array<Record<string, unknown>>;

  const visible = rows.filter(
    (row) =>
      decideReleaseAccess({
        releaseOwnerId: String(row.owner_user_id || ''),
        releaseArtistId: String(row.artist_id || ''),
        userId: user.id,
        access,
        write: false,
      }) === 'allow'
  );

  const artistNames = await loadArtistNames(adminClient, visible.map((row) => String(row.artist_id || '')));

  return visible.map((row) => ({
    id: String(row.id || ''),
    ownerUserId: String(row.owner_user_id || ''),
    artistId: String(row.artist_id || ''),
    artistName: artistNames.get(String(row.artist_id || '')) || '',
    title: String(row.title || ''),
    venueName: row.venue_name ? String(row.venue_name) : null,
    city: row.city ? String(row.city) : null,
    timezone: String(row.timezone || 'Africa/Lagos'),
    setStartAt: row.set_start_at ? String(row.set_start_at) : null,
    setLengthMinutes: typeof row.set_length_minutes === 'number' ? row.set_length_minutes : 30,
    status: String(row.status || 'draft'),
  }));
}

type PackWaitInfo = { djLinksWaiting: HomeWaitingDjLink[]; openedByShowId: Map<string, { opened: number; total: number }> };

/**
 * The FIRST setlist per show, the OLDEST pack per setlist, its recipients and
 * access log — all in `.in()` batches, so this costs a fixed handful of
 * queries no matter how many shows are in `shows`. Mirrors the single-show
 * logic in app/api/setlists/[setlistId]/pack/route.ts (oldest pack wins,
 * receipts rolled up per recipient) without importing that route.
 */
async function loadShowPackWaits(
  adminClient: SupabaseClient,
  shows: readonly ShowRow[],
  primaryOwnerId: string,
  now: Date
): Promise<PackWaitInfo> {
  const empty: PackWaitInfo = { djLinksWaiting: [], openedByShowId: new Map() };
  if (!shows.length) return empty;

  const showIds = shows.map((show) => show.id);
  const { data: setlistRows, error: setlistError } = await adminClient
    .from(SETLISTS_TABLE)
    .select('id,event_id,created_at')
    .in('event_id', showIds)
    .order('created_at', { ascending: true });
  readErr('setlists', setlistError);

  const firstSetlistByShow = new Map<string, string>();
  for (const row of (setlistRows || []) as Array<{ id: string; event_id: string }>) {
    if (!firstSetlistByShow.has(row.event_id)) firstSetlistByShow.set(row.event_id, row.id);
  }
  const setlistIds = Array.from(firstSetlistByShow.values());
  if (!setlistIds.length) return empty;

  const { data: packRows, error: packError } = await adminClient
    .from(DJ_PACKS_TABLE)
    .select('id,setlist_id,created_at')
    .in('setlist_id', setlistIds)
    .order('created_at', { ascending: true });
  readErr('dj packs', packError);

  const packBySetlist = new Map<string, string>();
  for (const row of (packRows || []) as Array<{ id: string; setlist_id: string }>) {
    if (!packBySetlist.has(row.setlist_id)) packBySetlist.set(row.setlist_id, row.id);
  }
  const packIds = Array.from(packBySetlist.values());
  if (!packIds.length) return empty;

  const showBySetlist = new Map(Array.from(firstSetlistByShow, ([showId, setlistId]) => [setlistId, showId]));
  const showByPackId = new Map<string, string>();
  for (const [setlistId, packId] of packBySetlist) {
    const showId = showBySetlist.get(setlistId);
    if (showId) showByPackId.set(packId, showId);
  }

  const [recipientsResult, logResult] = await Promise.all([
    adminClient
      .from(DJ_PACK_RECIPIENTS_TABLE)
      .select('id,pack_id,recipient_name,revoked_at,created_at')
      .in('pack_id', packIds),
    adminClient.from(DJ_PACK_ACCESS_LOG_TABLE).select('recipient_id,pack_id,action,created_at').in('pack_id', packIds),
  ]);
  readErr('dj pack recipients', recipientsResult.error);
  readErr('dj pack access log', logResult.error);

  const openedRecipientIds = new Set(
    ((logResult.data || []) as Array<{ recipient_id: string; action: string }>)
      .filter((row) => row.action === 'viewed' || String(row.action || '').startsWith('downloaded'))
      .map((row) => row.recipient_id)
  );

  const djLinksWaiting: HomeWaitingDjLink[] = [];
  const openedByShowId = new Map<string, { opened: number; total: number }>();
  const showById = new Map(shows.map((show) => [show.id, show]));

  const recipients = ((recipientsResult.data || []) as Array<{
    id: string;
    pack_id: string;
    recipient_name: string;
    revoked_at: string | null;
    created_at: string;
  }>).filter((row) => !row.revoked_at);

  const recipientsByShow = new Map<string, typeof recipients>();
  for (const recipient of recipients) {
    const showId = showByPackId.get(recipient.pack_id);
    if (!showId) continue;
    const list = recipientsByShow.get(showId) ?? [];
    list.push(recipient);
    recipientsByShow.set(showId, list);
  }

  for (const [showId, showRecipients] of recipientsByShow) {
    const show = showById.get(showId);
    const opened = showRecipients.filter((r) => openedRecipientIds.has(r.id)).length;
    openedByShowId.set(showId, { opened, total: showRecipients.length });

    // "Waiting" is scoped to shows you RUN — the same owner-scoping every
    // other waiting-on-others item uses.
    if (!show || show.ownerUserId !== primaryOwnerId) continue;

    for (const recipient of showRecipients) {
      if (openedRecipientIds.has(recipient.id)) continue;
      const hoursWaiting = (now.getTime() - Date.parse(recipient.created_at)) / (60 * 60 * 1000);
      if (!Number.isFinite(hoursWaiting) || hoursWaiting < 48) continue;
      djLinksWaiting.push({
        showId,
        recipientId: recipient.id,
        recipientName: recipient.recipient_name,
        showLabel: [show.artistName, show.venueName].filter(Boolean).join(' · ') || show.title,
        hoursWaiting: Math.round(hoursWaiting),
      });
    }
  }

  return { djLinksWaiting, openedByShowId };
}

async function loadSetlistItemsForDuration(
  adminClient: SupabaseClient,
  setlistId: string
): Promise<SetlistSummaryItem[]> {
  const { data, error } = await adminClient
    .from(SETLIST_ITEMS_TABLE)
    .select('id,item_type,song_id,song_version_id,duration_seconds')
    .eq('setlist_id', setlistId);
  readErr('setlist items', error);

  const rows = (data || []) as Array<{
    item_type: string | null;
    song_id: string | null;
    song_version_id: string | null;
    duration_seconds: number | null;
  }>;
  if (!rows.length) return [];

  const songIds = Array.from(new Set(rows.map((row) => row.song_id).filter((id): id is string => Boolean(id))));
  const versionIds = Array.from(
    new Set(rows.map((row) => row.song_version_id).filter((id): id is string => Boolean(id)))
  );

  const [songsResult, versionsResult] = await Promise.all([
    songIds.length
      ? adminClient.from(SONGS_TABLE).select('id,duration_seconds').in('id', songIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? adminClient.from(SONG_VERSIONS_TABLE).select('id,duration_seconds').in('id', versionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  readErr('songs', songsResult.error as { message?: string } | null);
  readErr('song versions', versionsResult.error as { message?: string } | null);

  const songDuration = new Map(
    ((songsResult.data || []) as Array<{ id: string; duration_seconds: number | null }>).map((row) => [
      row.id,
      row.duration_seconds,
    ])
  );
  const versionDuration = new Map(
    ((versionsResult.data || []) as Array<{ id: string; duration_seconds: number | null }>).map((row) => [
      row.id,
      row.duration_seconds,
    ])
  );

  return rows.map((row) => ({
    itemSeconds: row.duration_seconds,
    versionSeconds: row.song_version_id ? versionDuration.get(row.song_version_id) ?? null : null,
    songSeconds: row.song_id ? songDuration.get(row.song_id) ?? null : null,
    itemType: (row.item_type as SetlistSummaryItem['itemType']) ?? undefined,
  }));
}

// ── Placements (pitching) ───────────────────────────────────────────────────

async function loadTeamPitches(
  adminClient: SupabaseClient,
  user: User,
  access: WorkspaceAccessContext,
  releasesPromise: Promise<readonly ExecutionRelease[]>
): Promise<SentPitch[]> {
  if (!isPitchingFeatureEnabled()) return [];

  const ownerIds = access.releaseOwnerIds.length ? access.releaseOwnerIds : [user.id];
  const { data, error } = await adminClient
    .from(PITCHES_TABLE)
    .select(SENT_PITCH_COLUMNS)
    .in('owner_user_id', ownerIds)
    .order('created_at', { ascending: false })
    .limit(SENT_PITCH_LIST_LIMIT);
  readErr('pitches', error);

  const rows = (data || []) as Array<Record<string, unknown>>;
  const releaseById = new Map((await releasesPromise).map((release) => [release.id, release]));

  // Same double-filter as the team-wide GET /api/pitching/pitches: owner ids
  // are a team boundary, not a per-release one, so an artist-scoped teammate
  // must not see a pitch for a release outside their scope.
  const readable = rows.filter((row) => {
    const releaseId = String(row.release_id || '');
    if (!releaseId) return true;
    const release = releaseById.get(releaseId);
    if (!release) return false;
    return (
      decideReleaseAccess({
        releaseOwnerId: release.ownerUserId,
        releaseArtistId: release.artistId,
        userId: user.id,
        access,
        write: false,
      }) === 'allow'
    );
  });

  return readable.map((row) => ({
    id: String(row.id || ''),
    releaseId: row.release_id ? String(row.release_id) : null,
    releaseTitle: row.release_id ? releaseById.get(String(row.release_id))?.title ?? null : null,
    playlistId: row.playlist_id ? String(row.playlist_id) : null,
    playlistName: String(row.playlist_name || ''),
    curatorName: 'Playlist owner',
    songTitle: String(row.song_title || ''),
    songUrl: String(row.song_url || ''),
    songPlatform: (row.song_platform as SentPitch['songPlatform']) ?? null,
    note: String(row.note || ''),
    status: (row.status as SentPitch['status']) || 'new',
    reply: row.curator_reply ? String(row.curator_reply) : null,
    pitcherName: String(row.pitcher_name || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }));
}

// ── Assembly ─────────────────────────────────────────────────────────────

/**
 * `commandCenter` carries the SAME shape /api/command-center returns
 * (releases, tasks, activity, todaysDirective — the FULL whole-workspace-
 * visible set, not the "releases you run" summaries in `home.releases`).
 * The client applies it through useReleaseStore's loadCommandCenterVia() so
 * this one request also satisfies the catalog's own store — a navigation to
 * the catalog right after Home costs no second fetch (the approved plan's
 * "one load, not two"). `home` is the derived, Home-only payload.
 */
export type HomeLoadResult = {
  commandCenter: CommandCenterData;
  home: HomePayload;
};

export async function loadHomeData(
  adminClient: SupabaseClient,
  user: User,
  timings?: Timings
): Promise<HomeLoadResult> {
  const now = new Date();
  const step = <T>(name: string, work: () => Promise<T>): Promise<T> =>
    timings ? timings.time(name, work) : work();

  // Access is resolved ONCE and shared. It used to run twice in parallel (here
  // and again inside loadCommandCenterData), and everything Home adds waited
  // for the whole catalog load even though role, shows and pitches need only
  // the access context. Now the catalog load, the role read and the shows read
  // all start as soon as access lands, so Home costs about the catalog load
  // plus nothing, instead of the catalog load plus a serial second stage.
  const access = await step('home_access', () => loadWorkspaceAccessContext(adminClient, user));

  const commandCenterPromise = step('cc_total', () =>
    loadCommandCenterData(adminClient, user, { timings, access })
  );
  // Pitches need the releases only to filter and label rows AFTER their own
  // query, so the query starts now and waits for the releases at that point.
  const releasesPromise = commandCenterPromise.then((data) => data.releases);

  const [commandCenter, roleFacts, visibleShows, pitches] = await Promise.all([
    commandCenterPromise,
    step('home_role', () => loadRoleFacts(adminClient, user, access)),
    step('home_shows', () => loadVisibleShows(adminClient, user, access, now)),
    step('home_pitches', () => loadTeamPitches(adminClient, user, access, releasesPromise)),
  ]);
  const { releases, tasks } = commandCenter;

  const { role, teamName, primaryOwnerId, roster, viewerName } = roleFacts;

  const header = buildHomeHeader({ name: viewerName, teamName, now });

  const releasesYouRun = releases.filter((release) => release.ownerUserId === primaryOwnerId);
  const releaseIdsYouRun = new Set(releasesYouRun.map((release) => release.id));
  const releaseLookup = new Map(
    releases.map((release) => [release.id, { title: release.title, artistName: release.artistName }])
  );

  const tasksByRelease = new Map<string, ExecutionTask[]>();
  for (const task of tasks) {
    if (!task.releaseId) continue;
    const list = tasksByRelease.get(task.releaseId) ?? [];
    list.push(task);
    tasksByRelease.set(task.releaseId, list);
  }
  const hasOpenTasks = (releaseId: string) =>
    (tasksByRelease.get(releaseId) ?? []).some((task) => task.status !== 'done' && task.status !== 'cancelled');

  const inFlightReleasesYouRun = releasesYouRun.filter((release) =>
    isReleaseInFlight(release, hasOpenTasks(release.id), now)
  );

  const artists = buildArtistChips(
    inFlightReleasesYouRun.map((release) => ({ artistId: release.artistId, artistName: release.artistName })),
    roster
  );

  const yourTasks = buildYourTasks(tasks, user.id, releaseLookup, now);
  const waitingTasksPart = buildWaitingOnOthers(tasks, user.id, releaseIdsYouRun, releaseLookup, now);

  const releaseSummaries = inFlightReleasesYouRun.map((release) =>
    buildReleaseSummary(release, tasksByRelease.get(release.id) ?? [], user.id, now)
  );

  const placements = buildPlacements(
    pitches.map((pitch) => ({
      id: pitch.id,
      releaseId: pitch.releaseId,
      releaseTitle: pitch.releaseTitle,
      playlistName: pitch.playlistName,
      curatorName: pitch.curatorName,
      songTitle: pitch.songTitle,
      status: pitch.status,
      createdAt: pitch.createdAt,
    })),
    now
  );

  const packWaits = await step('home_packs', () =>
    loadShowPackWaits(adminClient, visibleShows, primaryOwnerId, now)
  );

  const nextShowRow = selectNextShow(
    visibleShows.map((show) => ({ ...show })) as Array<ShowRow & SchedulableShow>,
    now
  );

  let nextShow: HomePayload['nextShow'] = null;
  if (nextShowRow) {
    const firstSetlist = await adminClient
      .from(SETLISTS_TABLE)
      .select('id')
      .eq('event_id', nextShowRow.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    readErr('next show setlist', firstSetlist.error);

    const setlistId = (firstSetlist.data as { id: string } | null)?.id ?? null;
    const setlistItems = setlistId ? await loadSetlistItemsForDuration(adminClient, setlistId) : null;
    const djStats = packWaits.openedByShowId.get(nextShowRow.id) ?? null;

    nextShow = buildNextShow(
      {
        id: nextShowRow.id,
        artistName: nextShowRow.artistName,
        venueName: nextShowRow.venueName,
        city: nextShowRow.city,
        setStartAt: nextShowRow.setStartAt,
        timezone: nextShowRow.timezone,
        setLengthMinutes: nextShowRow.setLengthMinutes,
        setlistItems,
        djLinksOpened: djStats?.opened ?? null,
        djLinksTotal: djStats?.total ?? null,
      },
      now
    );
  }

  const waiting: HomePayload['waiting'] = {
    tasks: waitingTasksPart.tasks,
    onTimeCount: waitingTasksPart.onTimeCount,
    djLinks: packWaits.djLinksWaiting,
  };

  // "All clear": nothing actionable is outstanding — no late work (yours or
  // someone else's on a release you run), no DJ link past its 48h wait, and
  // no pitch still waiting on a curator's answer. The release progress card
  // and next-show card stay visible either way (they're informational, not
  // problems), so their presence never blocks this.
  const sectionsAllEmpty =
    yourTasks.late.length === 0 &&
    yourTasks.today.length === 0 &&
    waiting.tasks.length === 0 &&
    waiting.djLinks.length === 0 &&
    placements.underReview.length === 0;

  const state = resolveHomeStateForRole(role, {
    hasRosterArtist: roster.length > 0,
    releaseCount: releasesYouRun.length,
    inFlightCount: inFlightReleasesYouRun.length,
    sectionsAllEmpty,
    hasLateTask: yourTasks.late.length > 0 || waiting.tasks.length > 0,
    hasArtistWithNoUpcomingRelease: roster.some(
      (artist) =>
        !releasesYouRun.some(
          (release) =>
            release.artistId === artist.id &&
            release.releaseDate !== null &&
            (Date.parse(release.releaseDate) - now.getTime()) / 86_400_000 <= LABEL_ROSTER_GAP_DAYS &&
            (Date.parse(release.releaseDate) - now.getTime()) / 86_400_000 >= -LABEL_ROSTER_GAP_DAYS
        )
    ),
  });

  return {
    commandCenter,
    home: {
      role,
      state,
      header,
      primaryOwnerId,
      artists,
      yourTasks,
      waiting,
      releases: releaseSummaries,
      placements,
      nextShow,
    },
  };
}

function resolveHomeStateForRole(
  role: HomePayload['role'],
  input: {
    hasRosterArtist: boolean;
    releaseCount: number;
    inFlightCount: number;
    sectionsAllEmpty: boolean;
    hasLateTask: boolean;
    hasArtistWithNoUpcomingRelease: boolean;
  }
): HomePayload['state'] {
  if (role === 'label') {
    return toHomeStateKey(
      'label',
      resolveLabelState({
        hasRosterArtist: input.hasRosterArtist,
        hasLateTask: input.hasLateTask,
        hasArtistWithNoUpcomingRelease: input.hasArtistWithNoUpcomingRelease,
      })
    );
  }
  if (role === 'artist') {
    return toHomeStateKey(
      'artist',
      resolveArtistState({ releaseCount: input.releaseCount, inFlightCount: input.inFlightCount })
    );
  }
  return toHomeStateKey(
    'manager',
    resolveManagerState({
      hasRosterArtist: input.hasRosterArtist,
      releaseCount: input.releaseCount,
      inFlightCount: input.inFlightCount,
      sectionsAllEmpty: input.sectionsAllEmpty,
    })
  );
}

// Re-exported so app/api/home/route.ts and the client store can rebuild the
// live Waiting-on-others / Your-tasks sections after a tick without a second
// network round trip — see the approved plan's "task sections are worked out
// in the browser" point.
export { isTaskLate };
