import { NextRequest, NextResponse } from 'next/server';
import { internalAccountEmails, verifyAdmin } from '../_shared';
import { readAll, type AdminReadSource } from '@/lib/admin-read-server';
import {
  parseFounderMinutes,
  parseRecordTransfer,
  summarizeCohorts,
  type CohortTeam,
} from '@/lib/admin-self-serve-cohort';
import { recordDirectTransfer } from '@/lib/self-serve-server';
import { logBillingEvent } from '@/lib/billing-events-server';
import { invalidateTeamAccess } from '@/lib/team-billing-server';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';

// /api/admin/self-serve (self-serve checkout, 2026-10-22). ADMIN_EMAILS only.
//
// GET: the cohort card (self-serve against concierge teams from the last 180
// days, our own accounts left out) and the team list the founder sets minutes on.
// POST { action: 'record_transfer', ... }: money that came in straight to the
//   company account. Sets the paid period, writes the payment, the partner
//   ledger row and a transfer_recorded event naming who recorded it.
// POST { action: 'founder_minutes', workspaceId, minutes }: how long the founder
//   spent helping this team, for the cohort's founder-minutes number.
// Writes nothing else. No key, email or bank detail is logged.

const WINDOW_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

type WorkspaceRow = {
  id: string;
  owner_id: string;
  name: string | null;
  created_at: string;
  acquisition_path: string | null;
  payment_method: string | null;
  founder_minutes: number | null;
};

export async function GET(request: NextRequest) {
  const gate = await verifyAdmin(request);
  if (!gate.ok) return gate.response;
  const admin = gate.supabaseAdmin;
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString();
  const sources: AdminReadSource[] = [];

  const workspaces = await readAll(
    'workspaces',
    (from, to) =>
      admin
        .from('workspaces')
        .select('id,owner_id,name,created_at,acquisition_path,payment_method,founder_minutes')
        .in('acquisition_path', ['self_serve', 'concierge'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(from, to),
    5000
  );
  sources.push(workspaces.source);
  const teams = workspaces.rows as unknown as WorkspaceRow[];
  const ownerIds = [...new Set(teams.map((team) => team.owner_id))];
  const workspaceIds = teams.map((team) => team.id);

  const [profiles, subscriptions, members, activity] = await Promise.all([
    ownerIds.length
      ? admin.from('profiles').select('id,email,name,paid_at').in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? admin.from('subscriptions').select('user_id,plan,status,expires_at').in('user_id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
    workspaceIds.length
      ? admin.from('workspace_members').select('workspace_id,user_id,status').in('workspace_id', workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    readAll(
      'task_activity',
      (from, to) =>
        admin.from('task_activity').select('actor_id,created_at').gte('created_at', since).range(from, to),
      20000
    ),
  ]);
  sources.push(activity.source);

  const internal = internalAccountEmails();
  const profileById = new Map<string, { email: string | null; name: string | null; paid_at: string | null }>();
  for (const row of (profiles.data ?? []) as Array<{ id: string; email: string | null; name: string | null; paid_at: string | null }>) {
    profileById.set(row.id, row);
  }
  const planByOwner = new Map<string, string>();
  for (const row of (subscriptions.data ?? []) as Array<{ user_id: string; plan: string | null; status: string | null; expires_at: string | null }>) {
    const live = row.status === 'active' || row.status === 'past_due';
    const current = !row.expires_at || Date.parse(row.expires_at) > now.getTime();
    if (row.plan && live && current) planByOwner.set(row.user_id, row.plan);
  }
  const peopleByTeam = new Map<string, Set<string>>();
  for (const team of teams) peopleByTeam.set(team.id, new Set([team.owner_id]));
  for (const row of (members.data ?? []) as Array<{ workspace_id: string; user_id: string | null; status: string | null }>) {
    if (row.user_id && row.status !== 'removed') peopleByTeam.get(row.workspace_id)?.add(row.user_id);
  }
  const timesByActor = new Map<string, string[]>();
  for (const row of activity.rows as Array<{ actor_id?: unknown; created_at?: unknown }>) {
    if (typeof row.actor_id !== 'string' || typeof row.created_at !== 'string') continue;
    const list = timesByActor.get(row.actor_id) ?? [];
    list.push(row.created_at);
    timesByActor.set(row.actor_id, list);
  }

  const cohortTeams: CohortTeam[] = [];
  const list: Array<Record<string, unknown>> = [];
  for (const team of teams) {
    const owner = profileById.get(team.owner_id);
    const email = owner?.email?.toLowerCase() ?? null;
    if (email && internal.has(email)) continue;
    const people = peopleByTeam.get(team.id) ?? new Set<string>();
    const taskActionTimes = [...people].flatMap((id) => timesByActor.get(id) ?? []);
    const plan = planByOwner.get(team.owner_id) ?? null;
    cohortTeams.push({
      workspaceId: team.id,
      createdAt: team.created_at,
      acquisitionPath: team.acquisition_path,
      plan,
      paymentMethod: team.payment_method,
      paid: Boolean(owner?.paid_at),
      founderMinutes: team.founder_minutes ?? 0,
      taskActionTimes,
    });
    list.push({
      workspaceId: team.id,
      name: team.name,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      createdAt: team.created_at,
      acquisitionPath: team.acquisition_path,
      paymentMethod: team.payment_method,
      plan,
      paid: Boolean(owner?.paid_at),
      founderMinutes: team.founder_minutes ?? 0,
    });
  }

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    summary: summarizeCohorts({ teams: cohortTeams, now }),
    teams: list,
    sources,
  });
}

export async function POST(request: NextRequest) {
  const gate = await verifyAdmin(request);
  if (!gate.ok) return gate.response;
  const admin = gate.supabaseAdmin;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === 'founder_minutes') {
    const parsed = parseFounderMinutes(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const team = await admin.from('workspaces').select('id,owner_id').eq('id', parsed.workspaceId).maybeSingle();
    const row = team.data as { id: string; owner_id: string } | null;
    if (team.error || !row) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    const update = await admin.from('workspaces').update({ founder_minutes: parsed.minutes }).eq('id', row.id);
    if (update.error) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
    await logBillingEvent(admin, {
      workspaceId: row.id,
      ownerUserId: row.owner_id,
      actorUserId: gate.userId,
      type: 'founder_minutes_set',
      metadata: { minutes: parsed.minutes },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, minutes: parsed.minutes });
  }

  if (action === 'record_transfer') {
    const parsed = parseRecordTransfer(body, new Date());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const owner = await admin.from('profiles').select('id').ilike('email', parsed.value.ownerEmail.replace(/[%_]/g, (c) => `\\${c}`)).limit(2);
    const owners = (owner.data ?? []) as Array<{ id: string }>;
    if (owner.error || owners.length !== 1) {
      return NextResponse.json({ error: 'No single account has that email.' }, { status: 404 });
    }
    const userId = owners[0].id;
    const workspace = await admin.from('workspaces').select('id').eq('owner_id', userId).maybeSingle();
    const result = await recordDirectTransfer(admin, {
      userId,
      workspaceId: (workspace.data as { id: string } | null)?.id ?? null,
      amountKobo: parsed.value.amountKobo,
      receivedAt: parsed.value.receivedAt,
      bankReference: parsed.value.bankReference,
      plan: parsed.value.plan,
      period: parsed.value.period,
      periodEnd: parsed.value.periodEnd,
      recordedBy: gate.userId,
      note: parsed.value.note,
    });
    if (!result.ok) {
      console.error('[admin/self-serve] record transfer failed');
      return NextResponse.json({ error: 'Could not record that transfer.' }, { status: 500 });
    }
    invalidateSubscriptionSnapshot(userId);
    invalidateTeamAccess(userId);
    return NextResponse.json({ ok: true, periodEnd: result.periodEnd });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
