import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';
import { applyHandoffAction, loadHandoff, type HandoffAction } from '@/lib/handoff-server';
import { isHandoffItemKey, isHandoffLeadDays } from '@/lib/handoff';

/**
 * The handoff to the distributor (URG-322). GET reads the three rows and keeps
 * their tasks in step (lib/handoff-server.ts); POST is one action on them:
 * approve, mark sent, un-send, change an item's owner, or change the lead time.
 *
 * Team-aware like every scene route group: any member reads, a guest is
 * read-only, a non-member gets the existence-hiding 404. Who may act on a row
 * (the rollout owner or the item's owner) and who may change the lead time (the
 * rollout owner) is decided again here, never trusted from the screen.
 */

const couldNotLoad = () =>
  NextResponse.json({ error: 'Couldn’t load the handoff. Try again.' }, { status: 500 });

export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const loaded = await loadHandoff(admin, releaseId, auth.user.id);
  if (!loaded) return couldNotLoad();
  return NextResponse.json({ handoff: loaded.payload });
}

function readAction(body: Record<string, unknown> | null): HandoffAction | null {
  if (!body) return null;
  const action = body.action;
  if (action === 'lead') {
    return isHandoffLeadDays(body.leadDays) ? { action: 'lead', leadDays: body.leadDays } : null;
  }
  if (!isHandoffItemKey(body.item)) return null;
  if (action === 'approve' || action === 'send' || action === 'unsend') return { action, item: body.item };
  if (action === 'owner' && typeof body.ownerUserId === 'string' && body.ownerUserId) {
    return { action: 'owner', item: body.item, ownerUserId: body.ownerUserId };
  }
  return null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const change = readAction((await request.json().catch(() => null)) as Record<string, unknown> | null);
  if (!change) return NextResponse.json({ error: 'That change isn’t one we know.' }, { status: 400 });

  // Read (and sync) first, so the decision is made on the stored rollout.
  const loaded = await loadHandoff(admin, releaseId, auth.user.id);
  if (!loaded) return couldNotLoad();

  const result = await applyHandoffAction(admin, { releaseId, actorUserId: auth.user.id, loaded, change });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Answer with the fresh rows, tasks already moved for a lead-time change.
  const fresh = await loadHandoff(admin, releaseId, auth.user.id);
  if (!fresh) return couldNotLoad();
  return NextResponse.json({ handoff: fresh.payload });
}
