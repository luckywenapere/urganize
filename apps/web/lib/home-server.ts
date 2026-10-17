// The Home tab's data load. GATHERS data (releases/tasks via the shared
// command-center loader, plus Home-only reads: role facts, roster, pitches)
// and hands it to the pure lib/home
// functions to COMPUTE the payload — the same split as everywhere else in
// this codebase (I/O here, decisions in lib/home).
//
// WHY THIS WRITES ITS OWN QUERIES RATHER THAN IMPORTING THE EXISTING ROUTE
// HANDLERS (pitching/pitches). Those routes answer "everything about ONE
// thing" (one release's pitches) behind their own access checks tailored to a single
// row. Home asks a structurally different question — "what, across
// everything visible, needs attention in the next N days" — and answering it
// without an N+1 query per release needs batched `.in()` reads those
// single-row handlers don't have a shape for. So this module imports their
// ALREADY-EXPORTED primitives (table/column constants, row mappers, the pure
// helpers in lib/pitching.ts) rather than duplicating them, and writes its
// own aggregate queries on top — never touching or modifying the routes
// themselves. (Shows, setlists and DJ packs were deleted Oct 17, 2026.)

import { loadTeamPresenceMembers } from '@/lib/home/team-presence-server';
import { loadHomeOpportunities } from '@/lib/home/opportunities-server';
import type { Timings } from '@/lib/server-timing';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { getSubscriptionSnapshot } from '@/lib/subscription-access';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { decideReleaseAccess } from '@/lib/release-access';
import { loadCommandCenterData } from '@/lib/command-center-server';
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
import { LABEL_ROSTER_GAP_DAYS } from '@/lib/home/config';
import type { HomePayload } from '@/lib/home/types';

type WorkspaceAccessContext = Awaited<ReturnType<typeof loadWorkspaceAccessContext>>;

const ARTISTS_TABLE = 'artists';
const PROFILES_TABLE = 'profiles';

function readErr(label: string, error: { message?: string } | null): void {
  // Never throws — every Home-only read degrades to empty data rather than
  // failing the whole tab (the releases/tasks load above this already owns
  // the one failure mode that SHOULD 500 the request). Logged so a real
  // outage is visible in the Vercel runtime log rather than a silently thin
  // Home screen (the command-center activity closure's own precedent).
  if (error) console.error(`[home] ${label} failed:`, error.message);
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

  // The owner's plan and the roster depend only on the team snapshot, not on
  // each other, so they share one round trip (URG-314).
  const [ownerSnapshot, rosterArtists] = await Promise.all([
    teamSnapshot.ownerUserId ? getSubscriptionSnapshot(teamSnapshot.ownerUserId) : null,
    teamSnapshot.primaryWorkspaceId ? listWorkspaceArtists(adminClient, teamSnapshot.primaryWorkspaceId) : [],
  ]);

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
  const roster = rosterArtists.map((artist) => ({
    id: artist.id,
    name: artist.name,
  }));

  return { role, teamName: teamSnapshot.teamName, primaryOwnerId, roster, viewerName: profileRow?.name ?? null };
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
  // for the whole catalog load even though role and pitches need only the
  // access context. Now the catalog load and the role read all start as soon as access lands, so Home costs about the catalog load
  // plus nothing, instead of the catalog load plus a serial second stage.
  const access = await step('home_access', () => loadWorkspaceAccessContext(adminClient, user));

  const commandCenterPromise = step('cc_total', () =>
    loadCommandCenterData(adminClient, user, { timings, access })
  );
  // Pitches need the releases only to filter and label rows AFTER their own
  // query, so the query starts now and waits for the releases at that point.
  const releasesPromise = commandCenterPromise.then((data) => data.releases);

  // Home is one request (URG-320): the team strip and the opportunities ride in
  // this payload instead of their own fetches after paint. Both start with the
  // access context and never fail Home.
  const teamPromise = step('home_team', () =>
    loadTeamPresenceMembers(adminClient, user, access.primaryWorkspaceId, now)
  );
  const opportunitiesPromise = step('home_opportunities', () =>
    loadHomeOpportunities(
      adminClient,
      access.primaryWorkspaceId,
      Boolean(access.primaryWorkspaceId && access.artistScopeByWorkspaceId[access.primaryWorkspaceId]),
      now
    )
  );

  const roleFactsPromise = step('home_role', () => loadRoleFacts(adminClient, user, access));
  const [commandCenter, roleFacts, pitches, team, opportunities] = await Promise.all([
    commandCenterPromise,
    roleFactsPromise,
    step('home_pitches', () => loadTeamPitches(adminClient, user, access, releasesPromise)),
    teamPromise,
    opportunitiesPromise,
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

  const waiting: HomePayload['waiting'] = {
    tasks: waitingTasksPart.tasks,
    onTimeCount: waitingTasksPart.onTimeCount,
  };

  // "All clear": nothing actionable is outstanding — no late work (yours or
  // someone else's on a release you run) and no pitch still waiting on a
  // curator's answer. The release progress card stays visible either way
  // (it's informational, not a problem), so its presence never blocks this.
  const sectionsAllEmpty =
    yourTasks.late.length === 0 &&
    yourTasks.today.length === 0 &&
    waiting.tasks.length === 0 &&
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
      team,
      opportunities,
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
