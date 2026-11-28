import type { SupabaseClient } from '@supabase/supabase-js';
import { readAll, str, type AdminReadSource, type Row } from './admin-read-server';
import { RODI_PER_USD } from './credits/pricing';
import { PRESENCE_TABLE, parseSurface } from './presence';
import { readPlannedByUrgans } from './release-planned-by-urgans';
import { readPlannerPending } from './release-planner-pending';
import { readTemplatePending } from './release-template-pending';
import { loadScoreboardInput } from './scoreboard-server';
import { readTestRelease } from './test-release';
import { isTouchedTask } from './release-reality';
import {
  buildUsageMetrics,
  QUIET_TO_DAYS,
  type MetricsPerson,
  type MetricsPresence,
  type MetricsRelease,
  type MetricsTask,
  type UsageMetrics,
} from './usage-metrics';

// The reads behind /admin/metrics (2026-10-07). Every rule about what a number
// means lives in ./usage-metrics.ts; this file only fetches rows and shapes
// them. Service-role only: the one caller is the admin route, which has already
// passed verifyAdmin.
//
// It starts from loadScoreboardInput, so teams, members, releases, tasks and
// activity are read exactly as the scoreboard reads them (one definition of a
// team, of a test rollout, of "did something"), then adds what only this page
// needs. Every extra read is optional: a missing table is reported in
// `sources` and the number it feeds shows as not tracked, never as zero.

const DAY_MS = 24 * 60 * 60 * 1000;
const TABLE_CAP = 20_000;
/** All-time app opens: a cut-off read shows as unknown, never as a low count. */
const VISITS_CAP = 100_000;
/** The presence rows needed: thirty days of daily counts plus a little slack. */
const PRESENCE_DAYS = 35;

type Loaded = {
  metrics: UsageMetrics;
  sources: AdminReadSource[];
  /** The emails left out as "our team" that matched an account. */
  hiddenEmails: string[];
};

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Every account from the auth admin API: email, sign-in and creation times. */
async function readAuthUsers(
  client: SupabaseClient
): Promise<{ users: Array<{ id: string; email: string | null; lastSignInAt: string | null; createdAt: string | null }>; source: AdminReadSource }> {
  const users: Array<{ id: string; email: string | null; lastSignInAt: string | null; createdAt: string | null }> = [];
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      return {
        users,
        source: { table: 'auth.users', rows: users.length, status: 'error', truncated: false, message: error.message },
      };
    }
    const batch = data?.users ?? [];
    for (const user of batch) {
      users.push({
        id: user.id,
        email: user.email ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        createdAt: user.created_at ?? null,
      });
    }
    if (batch.length < perPage) {
      return { users, source: { table: 'auth.users', rows: users.length, status: 'ok', truncated: false } };
    }
  }
  return { users, source: { table: 'auth.users', rows: users.length, status: 'ok', truncated: true } };
}

export async function loadUsageMetrics(
  client: SupabaseClient,
  now: Date,
  options: {
    hiddenEmails: Set<string>;
    waitlistTotal: number | null;
    /** A Scoreboard read already made (the Overview passes the shared cached
     *  one, so its 60-second refresh never reads the big tables twice). */
    board?: Awaited<ReturnType<typeof loadScoreboardInput>>;
  }
): Promise<Loaded> {
  const since30 = isoDaysAgo(now, 30);

  const [board, presence, authUsers, profiles, appOpens, drafts, urgansTurns, aiUsage, appOpensAll] = await Promise.all([
    options.board ? Promise.resolve(options.board) : loadScoreboardInput(client, now),
    readAll(
      PRESENCE_TABLE,
      (from, to) =>
        client
          .from(PRESENCE_TABLE)
          .select('user_id, day, last_seen_at, surface')
          .gte('last_seen_at', isoDaysAgo(now, PRESENCE_DAYS))
          .order('last_seen_at', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
    readAuthUsers(client),
    readAll(
      'profiles',
      (from, to) =>
        client
          .from('profiles')
          .select('id, name, email, role, created_at, onboarding_completed')
          .order('created_at', { ascending: true })
          .range(from, to),
      TABLE_CAP
    ),
    // The login-ping queues a momentum_30m row at the start of every app
    // session (lib/engagement-server.ts), so its created_at is when someone
    // opened the app. It reaches back to 2026-07-23, before the presence ping.
    readAll(
      'scheduled_notifications (app opens)',
      (from, to) =>
        client
          .from('scheduled_notifications')
          .select('user_id, created_at')
          .eq('kind', 'momentum_30m')
          .gte('created_at', isoDaysAgo(now, QUIET_TO_DAYS + 1))
          .order('created_at', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
    readAll(
      'release_plan_drafts',
      (from, to) =>
        client
          .from('release_plan_drafts')
          .select('release_id, applied:doc->ai->>applied')
          .order('release_id', { ascending: true })
          .range(from, to),
      TABLE_CAP
    ),
    readAll(
      'billing_events (AI turns)',
      (from, to) =>
        client
          .from('billing_events')
          .select('actor_user_id, created_at')
          .eq('type', 'urgans_action')
          .gte('created_at', since30)
          .order('created_at', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
    readAll(
      'ai_usage_events',
      (from, to) =>
        client
          .from('ai_usage_events')
          .select('actor_user_id, owner_user_id, created_at, cost_rodi')
          .gte('created_at', since30)
          .order('created_at', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
    // Every app open ever (URG-369, the Overview's "Visits all time"). Two
    // narrow columns; the login-ping started on 2026-07-23.
    readAll(
      'scheduled_notifications (all app opens)',
      (from, to) =>
        client
          .from('scheduled_notifications')
          .select('user_id, created_at')
          .eq('kind', 'momentum_30m')
          .order('created_at', { ascending: true })
          .range(from, to),
      VISITS_CAP
    ),
  ]);

  const sources: AdminReadSource[] = [
    ...board.sources,
    presence.source,
    authUsers.source,
    profiles.source,
    appOpens.source,
    drafts.source,
    urgansTurns.source,
    aiUsage.source,
    appOpensAll.source,
  ];

  // AI cost: the usage log when it exists, else what the credit ledger
  // recorded the provider charged for each spend.
  let aiCost: { rows: Array<{ userId: string | null; at: number; usd: number }>; source: string } | null = null;
  const toCostRows = (rows: Row[], costKey: string) =>
    rows
      .map((row) => {
        const at = Date.parse(str(row.created_at) ?? '');
        const rodi = num(row[costKey]);
        if (!Number.isFinite(at) || rodi === null) return null;
        return { userId: str(row.actor_user_id) ?? str(row.owner_user_id), at, usd: rodi / RODI_PER_USD };
      })
      .filter((row): row is { userId: string | null; at: number; usd: number } => row !== null);
  if (aiUsage.source.status === 'ok') {
    aiCost = { rows: toCostRows(aiUsage.rows, 'cost_rodi'), source: 'AI usage log' };
  } else {
    const ledger = await readAll(
      'credit_ledger (spend)',
      (from, to) =>
        client
          .from('credit_ledger')
          .select('actor_user_id, owner_user_id, created_at, provider_cost_rodi')
          .eq('kind', 'spend')
          .gte('created_at', since30)
          .order('created_at', { ascending: false })
          .range(from, to),
      TABLE_CAP
    );
    sources.push(ledger.source);
    if (ledger.source.status === 'ok') {
      aiCost = { rows: toCostRows(ledger.rows, 'provider_cost_rodi'), source: 'credit ledger' };
    }
  }

  // People: every auth account, with what the profile adds.
  const profileById = new Map(profiles.rows.map((row) => [String(row.id), row]));
  const people: MetricsPerson[] = [];
  const seenIds = new Set<string>();
  for (const user of authUsers.users) {
    const profile = profileById.get(user.id);
    seenIds.add(user.id);
    people.push({
      userId: user.id,
      email: user.email ?? (profile ? str(profile.email) : null),
      name: profile ? str(profile.name) : null,
      role: profile ? str(profile.role) : null,
      createdAt: user.createdAt ?? (profile ? str(profile.created_at) : null),
      lastSignInAt: user.lastSignInAt,
      onboardingCompleted: profile?.onboarding_completed === true,
    });
  }
  // A profile whose auth row could not be read (the admin API failed) still
  // counts as an account.
  for (const row of profiles.rows) {
    const id = String(row.id);
    if (seenIds.has(id)) continue;
    people.push({
      userId: id,
      email: str(row.email),
      name: str(row.name),
      role: str(row.role),
      createdAt: str(row.created_at),
      lastSignInAt: null,
      onboardingCompleted: row.onboarding_completed === true,
    });
  }

  const hiddenUserIds = new Set<string>();
  const hiddenEmails: string[] = [];
  for (const person of people) {
    const email = person.email?.trim().toLowerCase();
    if (email && options.hiddenEmails.has(email)) {
      hiddenUserIds.add(person.userId);
      hiddenEmails.push(email);
    }
  }

  // Releases with their team, plan flags and task counts.
  const workspaceByRelease = new Map(board.input.releases.map((release) => [release.id, release.workspaceId]));
  const draftApplied = new Map<string, boolean>();
  for (const row of drafts.rows) {
    const releaseId = str(row.release_id);
    if (releaseId) draftApplied.set(releaseId, row.applied === 'true' || row.applied === true);
  }
  type Counts = { total: number; done: number; auto: number; touched: number };
  const countsByRelease = new Map<string, Counts>();
  const tasks: MetricsTask[] = [];
  for (const row of board.extras.taskRows) {
    const releaseId = str(row.release_id);
    const autoGenerated = row.auto_generated === true;
    tasks.push({
      releaseId,
      status: str(row.status),
      completedAt: str(row.completed_at),
      updatedAt: str(row.updated_at),
      createdAt: str(row.created_at),
      autoGenerated,
    });
    if (!releaseId) continue;
    const counts = countsByRelease.get(releaseId) ?? { total: 0, done: 0, auto: 0, touched: 0 };
    counts.total += 1;
    if (
      isTouchedTask({ status: str(row.status), createdAt: str(row.created_at), updatedAt: str(row.updated_at) })
    ) {
      counts.touched += 1;
    }
    if (row.status === 'done') counts.done += 1;
    if (autoGenerated) counts.auto += 1;
    countsByRelease.set(releaseId, counts);
  }
  const releases: MetricsRelease[] = board.extras.releaseRows.map((row) => {
    const id = String(row.id);
    const metadata = (row.metadata ?? null) as Record<string, unknown> | null;
    const counts = countsByRelease.get(id);
    return {
      id,
      workspaceId: workspaceByRelease.get(id) ?? null,
      ownerUserId: str(row.owner_user_id),
      createdAt: str(row.created_at),
      releaseDate: str(row.release_date),
      status: str(row.status),
      isTest: readTestRelease(metadata),
      plannerPending: readPlannerPending(metadata),
      templatePending: readTemplatePending(metadata),
      plannedByUrgans: readPlannedByUrgans(metadata),
      draftAiApplied: draftApplied.has(id) ? draftApplied.get(id) ?? false : null,
      title: str(row.title),
      touchedCount: counts?.touched ?? 0,
      taskCount: counts?.total ?? 0,
      doneCount: counts?.done ?? 0,
      autoTaskCount: counts?.auto ?? 0,
    };
  });

  const presenceRows: MetricsPresence[] = presence.rows
    .map((row) => {
      const userId = str(row.user_id);
      const day = str(row.day);
      const lastSeenAt = str(row.last_seen_at);
      if (!userId || !day || !lastSeenAt) return null;
      return { userId, day: day.slice(0, 10), lastSeenAt, surface: parseSurface(row.surface) };
    })
    .filter((row): row is MetricsPresence => row !== null);

  const metrics = buildUsageMetrics({
    now,
    people,
    presence: presenceRows,
    activity: board.input.activity,
    latestEvents: board.extras.latestEvents,
    appOpens: appOpens.rows
      .map((row) => ({ userId: str(row.user_id), at: Date.parse(str(row.created_at) ?? '') }))
      .filter((row): row is { userId: string; at: number } => !!row.userId && Number.isFinite(row.at)),
    appOpensAll:
      appOpensAll.source.status === 'ok' && !appOpensAll.source.truncated
        ? appOpensAll.rows
            .map((row) => ({ userId: str(row.user_id), at: Date.parse(str(row.created_at) ?? '') }))
            .filter((row): row is { userId: string; at: number } => !!row.userId && Number.isFinite(row.at))
        : null,
    releases,
    tasks,
    teams: board.input.teams.map((team) => ({
      workspaceId: team.workspaceId,
      name: team.name,
      memberUserIds: team.memberUserIds,
    })),
    urgansTurns: urgansTurns.rows
      .map((row) => ({ userId: str(row.actor_user_id), at: Date.parse(str(row.created_at) ?? '') }))
      .filter((row) => Number.isFinite(row.at)),
    aiCost,
    waitlistTotal: options.waitlistTotal,
    hiddenUserIds,
  });

  return { metrics, sources, hiddenEmails: Array.from(new Set(hiddenEmails)).sort() };
}
