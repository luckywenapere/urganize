import type { SupabaseClient } from '@supabase/supabase-js';
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
// WHY EVERYTHING IS PAGED. PostgREST caps a response at 1,000 rows by default,
// and a plain read silently returns the first 1,000 (the trap the Growth page
// recorded for sign-up counts). Every read here walks pages until a short one
// comes back or its cap is reached, and an activity table that hits its cap
// marks the whole board as a floor rather than the truth.
//
// WHERE ACTIVITY COMES FROM. Only tables that record WHO did something and
// WHEN. Measured 2026-10-02: task changes were recorded nowhere until the task
// update route began writing task_activity the same day, so a team's activity
// from before then undercounts task edits and completions. activity_logs is
// deliberately absent: nothing writes it.

const PAGE_SIZE = 1000;
const TABLE_CAP = 20_000;
const ACTIVITY_CAP = 20_000;
/** Activity older than this cannot change any number on the board: the oldest
 *  window is week-4 retention for the eighth-newest cohort (about 12 weeks). */
export const ACTIVITY_LOOKBACK_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ScoreboardSource = {
  table: string;
  rows: number;
  status: 'ok' | 'missing' | 'error';
  truncated: boolean;
  message?: string;
};

type Row = Record<string, unknown>;

type PageQuery = (from: number, to: number) => PromiseLike<{
  data: unknown[] | null;
  error: { message: string; code?: string } | null;
}>;

/** A table or column that does not exist on this database. Reported, never
 *  thrown: one missing optional table must not blank the board. */
function isMissing(error: { message: string; code?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    /does not exist|could not find/i.test(error.message)
  );
}

async function readAll(
  table: string,
  query: PageQuery,
  cap: number
): Promise<{ rows: Row[]; source: ScoreboardSource }> {
  const rows: Row[] = [];
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap) - 1;
    const { data, error } = await query(from, to);
    if (error) {
      return {
        rows,
        source: {
          table,
          rows: rows.length,
          status: isMissing(error) ? 'missing' : 'error',
          truncated: false,
          message: error.message,
        },
      };
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < to - from + 1) {
      return { rows, source: { table, rows: rows.length, status: 'ok', truncated: false } };
    }
  }
  return { rows, source: { table, rows: rows.length, status: 'ok', truncated: true } };
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** One activity source: a table, the column naming who acted, the column
 *  saying when, and any extra filter. */
type ActivitySource = {
  table: string;
  actor: string;
  at: string;
  /** Only rows whose `type` is one of these (billing_events). */
  types?: string[];
};

const ACTIVITY_SOURCES: ActivitySource[] = [
  { table: 'task_activity', actor: 'actor_id', at: 'created_at' },
  { table: 'task_comments', actor: 'user_id', at: 'created_at' },
  { table: 'task_attachments', actor: 'user_id', at: 'created_at' },
  { table: 'tasks', actor: 'created_by', at: 'created_at' },
  { table: 'task_outcomes', actor: 'created_by', at: 'created_at' },
  { table: 'notifications', actor: 'actor_id', at: 'created_at' },
  { table: 'assets', actor: 'uploaded_by', at: 'created_at' },
  { table: 'release_messages', actor: 'user_id', at: 'created_at' },
  { table: 'releases', actor: 'owner_user_id', at: 'created_at' },
  { table: 'notes', actor: 'owner_user_id', at: 'updated_at' },
  { table: 'urgans_actions', actor: 'actor_user_id', at: 'created_at' },
  { table: 'urgans_conversations', actor: 'owner_user_id', at: 'last_message_at' },
  {
    table: 'billing_events',
    actor: 'actor_user_id',
    at: 'created_at',
    // Only the events a member caused by using the product. The table also
    // holds paywall hits and the founder's own admin actions.
    types: ['urgans_action', 'urgans_embedded_action', 'urgans_voice_transcription'],
  },
  { table: 'playlist_pitches', actor: 'created_by', at: 'created_at' },
  { table: 'press_kit_section_versions', actor: 'saved_by', at: 'created_at' },
  { table: 'team_brief_sections', actor: 'updated_by', at: 'updated_at' },
  { table: 'release_epk_fields', actor: 'updated_by', at: 'updated_at' },
  { table: 'work_requests', actor: 'sender_user_id', at: 'created_at' },
];

async function readActivity(
  client: SupabaseClient,
  sinceIso: string
): Promise<{ activity: Map<string, number[]>; sources: ScoreboardSource[]; truncated: boolean }> {
  const activity = new Map<string, number[]>();
  const results = await Promise.all(
    ACTIVITY_SOURCES.map((source) =>
      readAll(
        source.table,
        (from, to) => {
          let query = client
            .from(source.table)
            .select(`${source.actor}, ${source.at}`)
            .gte(source.at, sinceIso)
            .not(source.actor, 'is', null);
          if (source.types) query = query.in('type', source.types);
          return query.order(source.at, { ascending: false }).range(from, to);
        },
        ACTIVITY_CAP
      )
    )
  );

  let truncated = false;
  const sources: ScoreboardSource[] = [];
  results.forEach((result, index) => {
    const def = ACTIVITY_SOURCES[index];
    sources.push(result.source);
    if (result.source.truncated) truncated = true;
    for (const row of result.rows) {
      const userId = str(row[def.actor]);
      const at = str(row[def.at]);
      if (!userId || !at) continue;
      const when = Date.parse(at);
      if (!Number.isFinite(when)) continue;
      const list = activity.get(userId) ?? [];
      list.push(when);
      activity.set(userId, list);
    }
  });

  return { activity, sources, truncated };
}

export async function loadScoreboardInput(
  client: SupabaseClient,
  now: Date
): Promise<{ input: ScoreboardInput; sources: ScoreboardSource[] }> {
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
            .select('user_id, plan, status, amount, billing_interval, expires_at')
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
            .order('created_at', { ascending: true })
            .range(from, to),
        TABLE_CAP
      ),
      readAll(
        'tasks (status)',
        (from, to) =>
          client
            .from('tasks')
            .select('id, release_id, status, completed_at, updated_at')
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
      .select('id, email, is_subscribed, paid_at, created_at')
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

  const subscriptionRows: ScoreboardSubscription[] = subscriptions.rows
    .filter((row) => str(row.user_id))
    .map((row) => ({
      userId: String(row.user_id),
      plan: str(row.plan),
      status: str(row.status),
      amountMinor: typeof row.amount === 'number' ? row.amount : null,
      billingInterval: str(row.billing_interval),
      expiresAt: str(row.expires_at),
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

  type TaskTotals = { count: number; done: number; lastDoneAt: number | null };
  const taskTotals = new Map<string, TaskTotals>();
  for (const row of tasks.rows) {
    const releaseId = str(row.release_id);
    if (!releaseId) continue;
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
  };
}
