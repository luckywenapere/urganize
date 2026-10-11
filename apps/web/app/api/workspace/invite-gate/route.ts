import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { checkSeatAllowance, countTeamSeats } from '@/lib/seats-server';
import { INVITE_GATE_OFF, isInviteGateEnabled, shouldRequireInvite } from '@/lib/invite-gate';

// GET /api/workspace/invite-gate — does this person have to invite a teammate
// before they keep using the app? See lib/invite-gate.ts for the rules. Every
// failure answers "no": this route can only ever let people through.

async function countRows(run: () => PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const { count, error } = await run();
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isInviteGateEnabled()) return NextResponse.json(INVITE_GATE_OFF);

  try {
    const auth = await requireAuthenticatedAdmin(request);
    if ('error' in auth) return NextResponse.json(INVITE_GATE_OFF);
    const { adminClient } = auth;

    const access = await loadWorkspaceAccessContext(adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    const workspace = access.primaryWorkspace;
    const membership = access.memberships.find((item) => item.workspaceId === workspaceId) || null;
    const ownerUserId = workspace?.ownerId || null;
    if (!workspaceId || !workspace || !membership || !ownerUserId) {
      return NextResponse.json(INVITE_GATE_OFF);
    }

    const [seats, seatVerdict, rollouts, activities] = await Promise.all([
      countTeamSeats(adminClient, workspaceId),
      checkSeatAllowance(adminClient, workspaceId),
      countRows(() =>
        adminClient
          .from('releases')
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', ownerUserId)
      ),
      countRows(() =>
        adminClient
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
      ),
    ]);

    const required = shouldRequireInvite({
      role: membership.role,
      seats,
      seatAvailable: seatVerdict.allowed,
      rollouts,
      activities,
    });

    return NextResponse.json({
      required,
      workspaceId,
      workspaceName: workspace.name || null,
    });
  } catch (error) {
    console.error('[invite-gate] could not decide, letting through:', error);
    return NextResponse.json(INVITE_GATE_OFF);
  }
}
