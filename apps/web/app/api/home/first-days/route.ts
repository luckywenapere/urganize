import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { buildChecklist, checklistDaysLeft, checklistSummary, isChecklistVisible } from '@/lib/self-serve';
import { hideChecklistAfter, loadChecklistTeam } from '@/lib/self-serve-checklist-server';

// "Your first 14 days" on Home (self-serve checkout, 2026-10-22).
// GET  the card for the signed-in owner's team, or { visible: false }.
// POST { action: 'dismiss' }  closes it for good.
//
// Self-serve teams only: concierge teams get the founder instead, and keeping
// them apart is what makes the two paths comparable on the admin cohort card.
// No AI and no credits. Never fails Home: any problem answers visible false.

export const dynamic = 'force-dynamic';

const HIDDEN = { visible: false } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json(HIDDEN);

  try {
    const team = await loadChecklistTeam(admin, auth.user.id);
    if (!team || team.acquisitionPath !== 'self_serve') return NextResponse.json(HIDDEN);

    const now = new Date();
    const daysLeft = checklistDaysLeft(team.createdAt, now);
    if (!isChecklistVisible({ hiddenAfter: team.hiddenAfter, daysLeft, now })) return NextResponse.json(HIDDEN);

    const steps = buildChecklist(team.facts);
    const allDone = steps.every((step) => step.done);
    // Everything done: say so for one more day, then go.
    if (allDone && !team.hiddenAfter) {
      await hideChecklistAfter(admin, team.workspaceId, new Date(now.getTime() + DAY_MS)).catch(() => undefined);
    }
    return NextResponse.json({
      visible: true,
      allDone,
      steps,
      summary: checklistSummary(steps, daysLeft),
      plan: team.plan,
      focusReleaseId: team.focusReleaseId,
    });
  } catch (error) {
    console.warn('[home/first-days] read failed', String(error));
    return NextResponse.json(HIDDEN);
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  let body: { action?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (body.action !== 'dismiss') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const workspace = await admin.from('workspaces').select('id').eq('owner_id', auth.user.id).maybeSingle();
  const workspaceId = (workspace.data as { id: string } | null)?.id;
  if (!workspaceId) return NextResponse.json({ ok: true });
  await admin
    .from('workspaces')
    .update({ setup_checklist_dismissed_at: new Date().toISOString() })
    .eq('id', workspaceId);
  return NextResponse.json({ ok: true });
}
