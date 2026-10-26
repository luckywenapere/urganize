import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { afterResponse } from '@/lib/after-response';
import { chimeInAskRecipients } from '@/lib/rollout-ideas';
import { loadIdeasPeople, notifyChimeInAsk } from '@/lib/rollout-ideas-server';
import {
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
  toIdeasRelease,
} from '../_shared';

/**
 * "Ask to chime in" (2026-10-26): push and email the teammates ticked in "Who
 * should chime in?". Only people who can already see the rollout can be asked;
 * anyone new comes in through an invite link instead. Sends after the reply.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = toIdeasRelease(access.release);

  const body = (await request.json().catch(() => ({}))) as { userIds?: unknown };
  const people = await loadIdeasPeople(adminClient, release);
  const userIds = chimeInAskRecipients({
    requested: body.userIds,
    allowedIds: people.map((person) => person.userId),
    askerId: auth.user.id,
  });
  if (!userIds.length) return NextResponse.json({ error: 'Pick someone to ask.' }, { status: 400 });

  const askId = randomUUID();
  afterResponse('rollout chime in ask', () =>
    notifyChimeInAsk(adminClient, { release, askerId: auth.user.id, userIds, people, askId })
  );

  return NextResponse.json({ ok: true, asked: userIds.length });
}
