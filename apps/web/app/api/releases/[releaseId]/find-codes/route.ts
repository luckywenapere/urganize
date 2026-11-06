import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { isAltlinkEnabled } from '@/lib/altlink/rules';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { answerCodes, findCodes } from '@/lib/code-finder/server';

// Finding a released song's UPC and ISRC on its own (Nov 2026, #1086), for the
// Out now card on Home and the smart link on Distribute.
//
// GET: look the song up on streaming when it is due (at most every 15 minutes)
// and say what there is to show. POST { answer: 'yes' | 'no' }: the person's
// answer to "Is this your song?". Yes saves the codes and makes the smart link;
// no remembers that result and looks for another.
//
// Both need write access: looking up and answering both change the rollout.
// Nothing here trusts the browser for a title, an artist or a code.

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

async function prepare(request: NextRequest, releaseId: string) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error };
  const admin = createAdminClient(auth.supabaseUrl);
  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return { error: access.error };
  if (!admin) return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  return {
    admin,
    context: {
      actorUserId: auth.user.id,
      workspaceId: team.primaryWorkspaceId ?? null,
      ownerUserId: team.ownerUserId ?? null,
    },
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isAltlinkEnabled()) return notFound();
  const { releaseId } = await context.params;
  const ready = await prepare(request, releaseId);
  if ('error' in ready) return ready.error;
  try {
    const view = await findCodes(ready.admin, releaseId, ready.context);
    return NextResponse.json({ view });
  } catch (error) {
    console.error('[code-finder] find failed', { releaseId, message: error instanceof Error ? error.message : 'error' });
    return NextResponse.json({ error: 'Could not look the song up.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isAltlinkEnabled()) return notFound();
  const { releaseId } = await context.params;
  const ready = await prepare(request, releaseId);
  if ('error' in ready) return ready.error;
  const body = (await request.json().catch(() => null)) as { answer?: unknown } | null;
  if (body?.answer !== 'yes' && body?.answer !== 'no') {
    return NextResponse.json({ error: 'Answer yes or no.' }, { status: 400 });
  }
  try {
    const result = await answerCodes(ready.admin, releaseId, body.answer === 'yes', ready.context);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[code-finder] answer failed', { releaseId, message: error instanceof Error ? error.message : 'error' });
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  }
}
