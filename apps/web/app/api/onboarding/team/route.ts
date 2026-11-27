import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { notApprovedResponse } from '@/app/api/_shared/paywall';
import { isAppAccessAllowed } from '@/lib/access-gate-server';
import { AccessNotApprovedError, CuratorAccountError } from '@/lib/tasks-server';
import { isTeamWhoFor, parseInviteLink } from '@/lib/onboarding-flow';
import {
  createOnboardingTeam,
  joinInvitedTeam,
  joinWithInviteToken,
  loadOnboardingTeamState,
  type ServerResult,
} from '@/lib/onboarding-team-server';

// POST /api/onboarding/team (#854). One of:
//   { action: 'create', auto: true }     the team made for a new account (#1412)
//   { action: 'create', name, whoFor }   name your own team (or rename it)
//   { action: 'join', workspaceId }      join the team an invite is waiting in
//   { action: 'join_link', link }        join with a pasted invite link
// Open route (no paywall): it runs before the team, and its trial, exist.

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function respond<T>(result: ServerResult<T>): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.limitKey ? { limitKey: result.limitKey } : {}) },
      { status: result.status }
    );
  }
  return NextResponse.json(result.value);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth && auth.error) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  if (!(await isAppAccessAllowed(auth.user.id, auth.user.email, admin))) return notApprovedResponse();

  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  try {
    if (body.action === 'create') {
      // `auto` (#1412): the team made for a new account straight after
      // sign-up. No name, and nobody is asked who the team is for.
      const auto = body.auto === true;
      if (!auto && !isTeamWhoFor(body.whoFor)) {
        return NextResponse.json({ error: 'Pick who the team is for.' }, { status: 400 });
      }
      const metadata = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
      const displayName = String(metadata.name || metadata.full_name || '');
      const result = await createOnboardingTeam(admin, auth.user, {
        name: !auto && typeof body.name === 'string' ? body.name : '',
        whoFor: !auto && isTeamWhoFor(body.whoFor) ? body.whoFor : null,
        displayName,
      });
      if (!auto || !result.ok) return respond(result);
      // The project screen opens next and needs the team list. Sending it here
      // saves a phone on bad data one more request. Best effort: the page asks
      // for it itself when it is missing.
      const state = await loadOnboardingTeamState(admin, auth.user, true).catch(() => null);
      return NextResponse.json({ ...result.value, ...(state ? { state } : {}) });
    }
    if (body.action === 'join') {
      const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
      if (!UUID_SHAPE.test(workspaceId)) return NextResponse.json({ error: 'This invite was not found.' }, { status: 404 });
      return respond(await joinInvitedTeam(admin, auth.user, workspaceId));
    }
    if (body.action === 'join_link') {
      const parsed = parseInviteLink(typeof body.link === 'string' ? body.link : '');
      if (!parsed) return NextResponse.json({ error: "That isn't an invite link. Ask for a new one." }, { status: 400 });
      return respond(await joinWithInviteToken(admin, auth.user, parsed.token));
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    if (error instanceof AccessNotApprovedError) return notApprovedResponse();
    if (error instanceof CuratorAccountError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[onboarding/team]', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
