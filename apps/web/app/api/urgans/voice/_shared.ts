import { NextRequest, NextResponse } from 'next/server';
import { requireUrgansAccess } from '@/app/api/_shared/urgans-access';
import { isChappiEnabled, isUrgansRealtimeEnabled } from '@/lib/chappi/config';
import { isCreditsEnabled } from '@/lib/credits/config';
import { getCreditSnapshot, type CreditSnapshot } from '@/lib/credits/credits-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { loadVoiceSession, type VoiceSessionRow } from '@/lib/urgans-voice-realtime-server';

// The gate every /api/urgans/voice route opens with, in the order the other
// UrgAns routes use: the flag BEFORE auth (404 with the isFlagGateOff body, so
// a direct call cannot reach a model through us), then the UrgAns gate (which
// also admits a credits-only team), then the team.

type Admitted = Exclude<Awaited<ReturnType<typeof requireUrgansAccess>>, { error: NextResponse }>;
type Team = Awaited<ReturnType<typeof getTeamAccessForUser>>;

export type VoiceGate = {
  auth: Admitted;
  team: Team;
  workspaceId: string;
};

export function voiceFlagOff(): NextResponse | null {
  if (!isChappiEnabled() || !isUrgansRealtimeEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return null;
}

export async function openVoiceGate(request: NextRequest): Promise<{ error: NextResponse } | VoiceGate> {
  const off = voiceFlagOff();
  if (off) return { error: off };
  const auth = await requireUrgansAccess(request);
  if ('error' in auth) return { error: auth.error };
  // A voice call is paid for in credits, a minute at a time. With credits off
  // there is nothing to bill it against, so it is not offered.
  if (!isCreditsEnabled()) {
    return { error: NextResponse.json({ error: 'Voice calls need credits switched on.' }, { status: 503 }) };
  }
  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (!team.primaryWorkspaceId) {
    return { error: NextResponse.json({ error: 'You need a team to talk to UrgAns.' }, { status: 403 }) };
  }
  return { auth, team, workspaceId: team.primaryWorkspaceId };
}

export async function readCredits(gate: VoiceGate): Promise<CreditSnapshot | null> {
  return getCreditSnapshot(gate.auth.adminClient, {
    workspaceId: gate.workspaceId,
    ownerUserId: gate.team.ownerUserId,
    team: gate.team,
  });
}

/**
 * The caller's own ACTIVE call. A missing, foreign or ended call answers the
 * same 404, so a call id cannot be probed, and a call of another team (the user
 * switched teams mid-call) is refused too.
 */
export async function requireActiveSession(
  gate: VoiceGate,
  sessionId: unknown
): Promise<{ error: NextResponse } | { session: VoiceSessionRow }> {
  const session = typeof sessionId === 'string' ? await loadVoiceSession(gate.auth.adminClient, sessionId, gate.auth.user.id) : null;
  if (!session || session.workspace_id !== gate.workspaceId) {
    return { error: NextResponse.json({ error: 'That call is not running.' }, { status: 404 }) };
  }
  if (session.status !== 'active') {
    return { error: NextResponse.json({ error: 'That call has ended.', ended: true }, { status: 409 }) };
  }
  return { session };
}
