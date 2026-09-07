import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import {
  summarizeUrgansActions,
  type TeamMonthSummary,
  type UrgansActionRow,
  type UrgansBillingSignalRow,
  type UrgansBillingSignalType,
} from '@/lib/urgans-actions/admin-summary';

// GET /api/admin/urgans — the founder's read on embedded UrgAns actions:
// draft/apply/discard/fail counts, token cost, guard trips and upgrade
// signals, one row per team per month per action type.
//
// NOT flag-gated, the admin/teams precedent exactly: with
// NEXT_PUBLIC_FEATURE_URGANS_ACTIONS off the table simply reads empty, and the
// founder should be able to watch it fill in from day one — including from
// Chappi's OWN generate_release_plan/approve_release_plan tools, which write
// to the SAME urgans_actions... no: those tools never touch this table at all
// (they call release-planning-actions-server.ts directly, bypassing
// runUrgansAction entirely) — a known, documented gap. This console can only
// ever show what ran through the gated action, which is exactly the surface
// worth watching once the flag is live.
//
// Aggregated in TypeScript, not a SQL view — see admin-summary.ts's own
// header for why.

const LOOKBACK_DAYS = 90;
const ACTIONS_QUERY_LIMIT = 5000;
const SIGNAL_TYPES: UrgansBillingSignalType[] = [
  'urgans_guard_tripped',
  'upgrade_prompt_shown',
  'upgrade_clicked',
];

type ActionQueryRow = {
  workspace_id: string | null;
  action_type: string;
  status: UrgansActionRow['status'];
  /** Nullable in the type, not in the column: a row that predates the column
   *  reads as null here and summarizeUrgansActions normalizes it to the
   *  button, which is the door that existed when it was written. */
  source: UrgansActionRow['source'] | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
};

type SignalQueryRow = {
  workspace_id: string | null;
  type: string;
  created_at: string;
};

type WorkspaceQueryRow = {
  id: string;
  name: string | null;
};

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [actionsResult, signalsResult] = await Promise.all([
    client
      .from('urgans_actions')
      .select('workspace_id, action_type, status, source, tokens_in, tokens_out, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ACTIONS_QUERY_LIMIT),
    client
      .from('billing_events')
      .select('workspace_id, type, created_at')
      .in('type', SIGNAL_TYPES)
      .gte('created_at', since)
      .limit(ACTIONS_QUERY_LIMIT),
  ]);

  if (actionsResult.error) {
    return NextResponse.json(
      { error: `Could not read urgans_actions: ${actionsResult.error.message}` },
      { status: 500 }
    );
  }
  if (signalsResult.error) {
    return NextResponse.json(
      { error: `Could not read billing_events: ${signalsResult.error.message}` },
      { status: 500 }
    );
  }

  const actionRows: UrgansActionRow[] = ((actionsResult.data || []) as ActionQueryRow[]).map(
    (row) => ({
      workspaceId: row.workspace_id,
      actionType: row.action_type,
      status: row.status,
      source: row.source ?? 'button',
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      createdAt: row.created_at,
    })
  );

  const signalRows: UrgansBillingSignalRow[] = ((signalsResult.data || []) as SignalQueryRow[])
    .filter((row): row is SignalQueryRow & { type: UrgansBillingSignalType } =>
      (SIGNAL_TYPES as string[]).includes(row.type)
    )
    .map((row) => ({
      workspaceId: row.workspace_id,
      type: row.type,
      createdAt: row.created_at,
    }));

  const summary: TeamMonthSummary[] = summarizeUrgansActions(actionRows, signalRows);

  const workspaceIds = Array.from(new Set(summary.map((row) => row.workspaceId)));
  const workspacesResult = workspaceIds.length
    ? await client.from('workspaces').select('id, name').in('id', workspaceIds)
    : { data: [] as WorkspaceQueryRow[], error: null };

  const teamNames = new Map(
    ((workspacesResult.data || []) as WorkspaceQueryRow[]).map((row) => [row.id, row.name])
  );

  return NextResponse.json({
    lookbackDays: LOOKBACK_DAYS,
    rows: summary.map((row) => ({ ...row, teamName: teamNames.get(row.workspaceId) ?? null })),
  });
}
