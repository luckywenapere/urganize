import { NextResponse, type NextRequest } from 'next/server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { parseDirectoryDemand } from '@/lib/directory-demand';
import { recordDirectoryDemand } from '@/lib/directory-demand-server';
import {
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../_shared';

/**
 * "Somebody looked for this role, and here is whether we had one."
 *
 * The directory filters in the browser (see lib/directory-search.ts), so the
 * server never sees what was searched for. This is the one thing it needs to:
 * the rows where matched is false are the recruiting list, and
 * lib/directory-demand.ts carries why that is worth a durable row rather than
 * an analytics event alone.
 *
 * THE PAYLOAD IS THREE FIELDS AND CANNOT BE WIDENED FROM THE CLIENT. The search
 * box takes a person's name, and a private search must never reach a durable
 * row — parseDirectoryDemand is an allowlist for exactly that reason.
 *
 * Answers 202 whatever happens, including for a payload it throws away. This
 * is a beacon on somebody else's keystroke: there is nothing for a manager to
 * do about a rejected one, and an error here would surface as a failure of the
 * search they were actually running.
 */

export async function POST(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const accepted = NextResponse.json({ ok: true }, { status: 202 });

  const demand = parseDirectoryDemand(await request.json().catch(() => null));
  if (!demand) return accepted;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return accepted;

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  await recordDirectoryDemand(adminClient, {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    actorUserId: auth.user.id,
    demand,
  });

  return accepted;
}
