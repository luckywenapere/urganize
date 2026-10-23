import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readActivity,
  readAll,
  str,
  type AdminReadSource,
  type LatestEvent,
  type Row,
} from './admin-read-server';
import { resolveAdminTeamAccess } from './admin-team-access';
import { readTestRelease } from './test-release';
import type {
  ScoreboardInput,
  ScoreboardRelease,
  ScoreboardSubscription,
  ScoreboardTeam,
} from './scoreboard';

// The reads behind the company scoreboard (2026-10-02). Every decision about
// what a number means lives in ./scoreboard.ts; this file only fetches rows and
// shapes them. Service-role only: the one caller is the admin route, which has
// already passed verifyAdmin.
//
// The paged reader and the activity sources moved to ./admin-read-server.ts on
// 2026-10-07 so the usage dashboard (/admin/metrics) reads activity the same
// way. See that file for why every read is paged and where activity comes from.

const TABLE_CAP = 20_000;
/** Activity older than this cannot change any number on the board: the oldest
 *  window is week-4 retention for the eighth-newest cohort (about 12 weeks). */
export const ACTIVITY_LOOKBACK_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ScoreboardSource = AdminReadSource;

/** What the usage dashboard needs beyond the scoreboard's own input, taken from
 *  rows this function already reads so nothing is read twice. The scoreboard
 *  route ignores it. */
export type ScoreboardExtras = {
  /** Each person's most recent activity and what it was. */
  latestEvents: Map<string, LatestEvent>;
  /** Every release row as read (orphans included), for plan and test counts. */
  releaseRows: Row[];
  /** Every task row as read: id, release_id, status, completed_at, updated_at,
   *  auto_generated, created_at. */
  taskRows: Row[];
  /** Each counted team's owner email (profiles.email), for matching the
   *  waitlist to accounts on the cockpit's funnel. Only the cockpit's "Needs a
   *  message" teams' emails reach the browser (admin-only, see ownerNames). */
  ownerEmails: Map<string, string | null>;
  /** Each counted team's owner name (profiles.name). With ownerEmails, sent to
   *  the browser ONLY for the cockpit's "Needs a message" teams, behind
   *  verifyAdmin, so the founder knows who to write to. */
  ownerNames: Map<string, string | null>;
  /** Every profile this read loaded (each workspace's owner, which is every
   *  account, since each account is given a workspace of its own): user id to
   *  lower-cased email. Used only to leave our own team's accounts out of the
   *  cockpit and the Scoreboard (lib/admin-internal-accounts.ts, 2026-10-10).
   *  Never sent to the browser. */
  emailByUserId: Map<string, string>;
};

export async function loadScoreboardInput(
  client: SupabaseClient,
  now: Date
): Promise<{ input: ScoreboardInput; sources: ScoreboardSource[]; extras: ScoreboardExtras }> {
  const sinceIso = new Date(now.getTime() - ACTIVITY_LOOKBACK_DAYS * DAY_MS).toISOString();

  const [workspaces, members, subscriptions, artists, releases, tasks, activity, teamInvites, partnerTags] =
    await Promise.all([
      readAll(
        'workspaces',
        (from, to) =>
          client
            .from('workspaces')
            .select(
              'id, owner_id, name, created_at, trial_started_at, trial_ends_at, comped_at, billing_plan, billing_locked_amount'
            )
            .order('created_at', { ascending: true })
            .range(from, to),
        TABLE_CAP
      ),
      readAll(
        'workspace_members',
        (from, to) =>
          client
            .from('workspace_members')
            .select('workspace_id, user_id, role, status, invited_at, joined_at')
            .order('created_at', { ascending: true })
            .range(from, to),
        TABLE_CAP
      ),
      readAll(
        'subscriptions',
        (from, to) =>
          client
            .from('subscriptions')
            .select('user_id, plan, status, amount, billing_interval, expires_at, started_at')
            .order('user_id', { ascending: true })
            .range(from, to),
        TABLE_CAP
      ),
      readAll(
        'artists',
        (from, to) =>
          client.from('artists').select('id, workspace_id').order('id').range(from, to),
        TABLE_CAP
      ),
      readAll(
        'releases',
        (from, to) =>
          client
            .from('releases')
            .select('id, owner_user_id, artist_id, created_at, updated_at, release_date, status, metadata')
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .range(from, to),
        TABLE_CAP
      ),
      readAll(
        'tasks (status)',
        (from, to) =>
          client
            .from('tasks')
            .select('id, release_id, status, completed_at, updated_at, auto_generated, created_at')
            .order('id', { ascending: true })
            .range(from, to),
        100_000
      ),
      readActivity(client, sinceIso),
      readAll(
        'user_referrals',
        (from, to) =>
          client
            .from('user_referrals')
            .select('referred_workspace_id, attached_at')
            .order('referred_workspace_id', { ascending: true })
            .range(from, to),
        TABLE_CAP
      ),
      readAll(
        'team_referrals',
        (from, to) =>
          client
            .from('team_referrals')
            .select('workspace_id, attached_at')
            .order('workspace_id', { ascending: true })
            .range(from, to),
        TABLE_CAP
      ),
    ]);

  const sources = [
    workspaces.source,
    members.source,
    subscriptions.source,
    artists.source,
    releases.source,
    tasks.source,
    ...activity.sources,
    teamInvites.source,
    partnerTags.source,
  ];

  // Owners' profiles, read once the owners are known.
  const ownerIds = Array.from(
    new Set(workspaces.rows.map((row) => str(row.owner_id)).filter((id): id is string => !!id))
  );
  const profileRows: Row[] = [];
  for (let i = 0; i < ownerIds.length; i += 200) {
    const chunk = ownerIds.slice(i, i + 200);
    const { data, error } = await client
      .from('profiles')
      .select('id, name, email, is_subscribed, paid_at, created_at')
      .in('id', chunk);
    if (error) {
      sources.push({ table: 'profiles', rows: profileRows.length, status: 'error', truncated: false, message: error.message });
      break;
    }
    profileRows.push(...((data ?? []) as Row[]));
  }
  if (!sources.some((source) => source.table === 'profiles')) {
    sources.push({ table: 'profiles', rows: profileRows.length, status: 'ok', truncated: false });
  }
  const profiles = new Map(profileRows.map((row) => [String(row.id), row]));
  const emailByUserId = new Map<string, string>();
  for (const row of profileRows) {
    const email = str(row.email)?.trim().toLowerCase();
    if (email) emailByUserId.set(String(row.id), email);
  }

  const subscriptionRows: ScoreboardSubscription[] = subscriptions.rows
    .filter((row) => str(row.user_id))
    .map((row) => ({
      userId: String(row.user_id),
      plan: str(row.plan),
      status: str(row.status),
      amountMinor: typeof row.amount === 'number' ? row.amount : null,
      billingInterval: str(row.billing_interval),
      expiresAt: str(row.expires_at),
      startedAt: str(row.started_at),
    }));
  const subscriptionByUser = new Map(subscriptionRows.map((sub) => [sub.userId, sub]));

  // A release belongs to its artist's team. Falling back to the owner's own
  // workspace covers an artist row from before workspace_id existed. Owner
  // alone would misfile a release a teammate created under their own account.
  const workspaceByOwner = new Map<string, string>();
  for (const row of workspaces.rows) {
    const owner = str(row.owner_id);
    if (owner) workspaceByOwner.set(owner, String(row.id));
  }
  const workspaceByArtist = new Map<string, string>();
  for (const row of artists.rows) {
    const workspaceId = str(row.workspace_id);
    if (workspaceId) workspaceByArtist.set(String(row.id), workspaceId);
  }

  // Tasks of a rollout in Trash stay in the table; only live rollouts' tasks count.
  const liveReleaseIds = new Set(releases.rows.map((row) => String(row.id)));
  const liveTaskRows = tasks.rows.filter((row) => liveReleaseIds.has(String(row.release_id)));

  type TaskTotals = { count: number; done: number; lastDoneAt: number | null };
  const taskTotals = new Map<string, TaskTotals>();
  for (const row of liveTaskRows) {
    const releaseId = str(row.release_id);
    if (!releaseId) continue;
    // Cancelled work is out of the count (URG-389): dropped is neither done nor owed.
    if (row.status === 'cancelled') continue;
    const totals = taskTotals.get(releaseId) ?? { count: 0, done: 0, lastDoneAt: null };
    totals.count += 1;
    if (row.status === 'done') {
      totals.done += 1;
      const doneAt = Date.parse(str(row.completed_at) ?? str(row.updated_at) ?? '');
      if (Number.isFinite(doneAt) && (totals.lastDoneAt === null || doneAt > totals.lastDoneAt)) {
        totals.lastDoneAt = doneAt;
      }
    }
    taskTotals.set(releaseId, totals);
  }

  const releaseRows: ScoreboardRelease[] = [];
  const teamsWithReleases = new Set<string>();
  for (const row of releases.rows) {
    const artistId = str(row.artist_id);
    const ownerId = str(row.owner_user_id);
    const workspaceId =
      (artistId ? workspaceByArtist.get(artistId) : undefined) ??
      (ownerId ? workspaceByOwner.get(ownerId) : undefined);
    if (!workspaceId) continue;
    const isTest = readTestRelease(row.metadata as Record<string, unknown> | null);
    if (!isTest) teamsWithReleases.add(workspaceId);
    const totals = taskTotals.get(String(row.id));
    releaseRows.push({
      id: String(row.id),
      workspaceId,
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
      releaseDate: str(row.release_date),
      status: str(row.status),
      isTest,
      taskCount: totals?.count ?? 0,
      allTasksDone: Boolean(totals && totals.count > 0 && totals.done === totals.count),
      lastTaskDoneAt: totals?.lastDoneAt ? new Date(totals.lastDoneAt).toISOString() : null,
    });
  }

  // Members per team, and where each person is a member of someone else's.
  const membersByWorkspace = new Map<string, Set<string>>();
  const firstInviteByWorkspace = new Map<string, number>();
  const foreignMemberships = new Map<string, number>();
  const ownerOf = new Map<string, string>();
  for (const row of workspaces.rows) {
    const owner = str(row.owner_id);
    if (owner) ownerOf.set(String(row.id), owner);
  }
  for (const row of members.rows) {
    const workspaceId = String(row.workspace_id);
    const userId = str(row.user_id);
    const status = str(row.status);
    const isOwnerRow = row.role === 'owner';
    if (!isOwnerRow && status !== 'removed') {
      const invited = Date.parse(str(row.invited_at) ?? str(row.joined_at) ?? '');
      if (Number.isFinite(invited)) {
        const current = firstInviteByWorkspace.get(workspaceId);
        if (current === undefined || invited < current) firstInviteByWorkspace.set(workspaceId, invited);
      }
    }
    if (status !== 'active' || !userId) continue;
    const set = membersByWorkspace.get(workspaceId) ?? new Set<string>();
    set.add(userId);
    membersByWorkspace.set(workspaceId, set);
    if (!isOwnerRow && ownerOf.get(workspaceId) !== userId) {
      foreignMemberships.set(userId, (foreignMemberships.get(userId) ?? 0) + 1);
    }
  }

  const teams: ScoreboardTeam[] = [];
  const ownerEmails = new Map<string, string | null>();
  const ownerNames = new Map<string, string | null>();
  for (const row of workspaces.rows) {
    const workspaceId = String(row.id);
    const ownerId = str(row.owner_id);

    // Every account is given a workspace of its own, so an invited teammate
    // owns an empty one. Counting it would add a dead team to every number.
    // Same rule the app's own access resolver uses: an owned team counts
    // unless its owner belongs to someone else's team and has no releases of
    // their own.
    if (ownerId && (foreignMemberships.get(ownerId) ?? 0) > 0 && !teamsWithReleases.has(workspaceId)) {
      continue;
    }

    const profile = ownerId ? profiles.get(ownerId) : undefined;
    ownerEmails.set(workspaceId, profile ? str(profile.email) : null);
    ownerNames.set(workspaceId, profile ? str(profile.name) : null);
    const subscription = ownerId ? subscriptionByUser.get(ownerId) ?? null : null;
    const { resolution, ownerAllowlisted } = resolveAdminTeamAccess({
      workspace: {
        trial_started_at: str(row.trial_started_at),
        trial_ends_at: str(row.trial_ends_at),
        comped_at: str(row.comped_at),
        billing_plan: str(row.billing_plan),
        billing_locked_amount:
          typeof row.billing_locked_amount === 'number' ? row.billing_locked_amount : null,
      },
      profile: profile
        ? {
            email: str(profile.email),
            is_subscribed: profile.is_subscribed === true,
            paid_at: str(profile.paid_at),
          }
        : null,
      subscription: subscription
        ? { status: subscription.status, expires_at: subscription.expiresAt }
        : null,
      now,
    });

    const memberIds = new Set(membersByWorkspace.get(workspaceId) ?? []);
    if (ownerId) memberIds.add(ownerId);
    const firstInvite = firstInviteByWorkspace.get(workspaceId);

    teams.push({
      workspaceId,
      name: str(row.name),
      ownerUserId: ownerId,
      createdAt: str(row.created_at),
      ownerSignedUpAt: profile ? str(profile.created_at) : null,
      memberUserIds: Array.from(memberIds),
      firstInviteAt: firstInvite === undefined ? null : new Date(firstInvite).toISOString(),
      state: resolution.state,
      comped: Boolean(str(row.comped_at)),
      allowlisted: ownerAllowlisted,
      subscription,
      trialStartedAt: str(row.trial_started_at),
      trialEndsAt: str(row.trial_ends_at),
      ownerPaidAt: profile ? str(profile.paid_at) : null,
    });
  }

  return {
    input: {
      now,
      teams,
      releases: releaseRows,
      subscriptions: subscriptionRows,
      activity: activity.activity,
      activityTruncated: activity.truncated,
      // Every account and when it was made, for the weekly return table by
      // signup week (URG-267). From the profiles read above: each workspace's
      // owner, which is every account, since each account is given a workspace.
      users: profileRows.map((row) => ({ userId: String(row.id), signedUpAt: str(row.created_at) })),
      // Both tables must have been read: a half-read answer would show a zero for
      // one source that is really "not tracked yet".
      referrals:
        teamInvites.source.status === 'ok' && partnerTags.source.status === 'ok'
          ? {
              fromTeams: teamInvites.rows.map((row) => ({
                workspaceId: String(row.referred_workspace_id),
                attachedAt: str(row.attached_at) ?? '',
              })),
              fromPartners: partnerTags.rows.map((row) => ({
                workspaceId: String(row.workspace_id),
                attachedAt: str(row.attached_at) ?? '',
              })),
            }
          : null,
    },
    sources,
    extras: {
      latestEvents: activity.latest,
      releaseRows: releases.rows,
      taskRows: liveTaskRows,
      ownerEmails,
      ownerNames,
      emailByUserId,
    },
  };
}
