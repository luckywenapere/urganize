import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { ensureReleaseVisible, isPitchingFeatureEnabled } from '@/app/api/pitching/_shared';
import { dismissNextMove, readNextMoveDismissals, readRolloutPitchFacts } from '@/lib/next-moves-server';

// Next moves (URG-259). GET: the moves this person dismissed, plus a rollout's
// pitch facts when ?releaseId= names one they can see. POST { key }: dismiss
// one move for good. No flag (live at merge) and no model call.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const releaseId = (new URL(request.url).searchParams.get('releaseId') || '').trim();
  if (releaseId && !UUID.test(releaseId)) {
    return NextResponse.json({ error: 'Unknown rollout.' }, { status: 400 });
  }

  const dismissedPromise = readNextMoveDismissals(auth.adminClient, auth.user.id);
  let pitches: Awaited<ReturnType<typeof readRolloutPitchFacts>> = null;
  if (releaseId && isPitchingFeatureEnabled()) {
    const visible = await ensureReleaseVisible(auth.adminClient, releaseId, auth.user);
    if ('error' in visible) return visible.error;
    pitches = await readRolloutPitchFacts(auth.adminClient, releaseId);
  }

  return NextResponse.json({ dismissed: await dismissedPromise, pitches });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const result = await dismissNextMove(auth.adminClient, auth.user.id, body?.key);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, stored: result.stored });
}
