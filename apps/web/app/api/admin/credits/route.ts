import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { adjustCredits, getCreditSnapshot } from '@/lib/credits/credits-server';
import type { TeamForAllowance } from '@/lib/credits/allowance';

// GET  /api/admin/credits?workspaceId=<uuid>  a team's balances and its last
//                                              movements, for checking a charge.
// POST /api/admin/credits                      grant or take away top-up credits
//                                              by hand: { workspaceId, credits,
//                                              note? }. Positive grants.
//
// The founder's tool until there is a way to buy credits: goodwill grants,
// corrections, and the first credits a design partner is given. NOT flag-gated,
// the /api/admin/teams precedent, so it works before the feature is switched on
// and a grant made today is waiting when it is.
//
// Writes the TOP-UP pool, which does not expire (see the ledger migration), and
// never touches the allowance, which belongs to the plan.

const MAX_GRANT = 100_000;
const RECENT_ROWS = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WorkspaceRow = { id: string; owner_id: string | null; name: string | null };

async function loadWorkspace(client: SupabaseClient, workspaceId: string): Promise<WorkspaceRow | null> {
  const { data } = await client.from('workspaces').select('id, owner_id, name').eq('id', workspaceId).maybeSingle();
  return (data as WorkspaceRow | null) ?? null;
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  if (!UUID.test(workspaceId)) {
    return NextResponse.json({ error: 'workspaceId must be a team id.' }, { status: 400 });
  }
  const client = admin.supabaseAdmin as SupabaseClient;
  const workspace = await loadWorkspace(client, workspaceId);
  if (!workspace) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });

  // The allowance depends on the plan, which is not known here; show the balances
  // as the ledger holds them, treating the team as unpaid for the granted figure.
  const team: TeamForAllowance = { state: 'trial', tier: null };
  const snapshot = await getCreditSnapshot(client, { workspaceId, ownerUserId: workspace.owner_id, team });

  const { data: rows, error } = await client
    .from('credit_ledger')
    .select('pool, kind, credits, window_start, provider_cost_rodi, metadata, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(RECENT_ROWS);
  if (error) return NextResponse.json({ error: 'Could not read the ledger.' }, { status: 500 });

  return NextResponse.json({
    team: { id: workspace.id, name: workspace.name },
    balances: snapshot
      ? { allowance: snapshot.allowance, topup: snapshot.topup, total: snapshot.total, resetsAt: snapshot.resetsAt }
      : null,
    recent: rows ?? [],
  });
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
    credits?: unknown;
    note?: unknown;
  } | null;

  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : '';
  if (!UUID.test(workspaceId)) {
    return NextResponse.json({ error: 'workspaceId must be a team id.' }, { status: 400 });
  }
  const credits = typeof body?.credits === 'number' ? Math.trunc(body.credits) : NaN;
  if (!Number.isFinite(credits) || credits === 0 || Math.abs(credits) > MAX_GRANT) {
    return NextResponse.json(
      { error: `credits must be a whole number that is not zero and no bigger than ${MAX_GRANT}.` },
      { status: 400 }
    );
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : undefined;

  const client = admin.supabaseAdmin as SupabaseClient;
  const workspace = await loadWorkspace(client, workspaceId);
  if (!workspace) return NextResponse.json({ error: 'Team not found.' }, { status: 404 });

  const ok = await adjustCredits(client, {
    workspaceId,
    ownerUserId: workspace.owner_id,
    actorUserId: admin.userId,
    credits,
    ...(note ? { note } : {}),
  });
  if (!ok) return NextResponse.json({ error: 'Could not record the credits.' }, { status: 500 });

  return NextResponse.json({ ok: true, team: { id: workspace.id, name: workspace.name }, credits });
}
