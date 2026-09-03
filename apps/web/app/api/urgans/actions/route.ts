import { NextRequest, NextResponse } from 'next/server';

import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { isUrgansActionsEnabled, runUrgansAction } from '@/lib/urgans-actions/server';

/**
 * POST /api/urgans/actions — run one embedded UrgAns action: draft, don't
 * write. `actionType` is in the BODY rather than a dynamic route segment
 * (`/api/urgans/actions/[actionId]/apply` already claims that shape for the
 * row-scoped steps, and Next.js does not allow two differently-named dynamic
 * segments to coexist at one path level).
 *
 * Everything from "does this caller have access" through "is this team on a
 * plan that includes this" through "has this team hit the runaway-usage
 * cap" through "call the model" lives in runUrgansAction — this file is auth,
 * body shape, and turning the result into a response.
 *
 * Deliberately does NOT gate on isAiConfigured(). release.draft_plan's
 * underlying pipeline (generatePlanDraft) is designed to succeed with no
 * model configured — the untailored template draft IS a valid plan, per this
 * feature's own "AI is a removable polish layer" principle — so refusing the
 * whole run here would make the embedded action WORSE than the legacy
 * /plan/generate route it wraps.
 */
export async function POST(request: NextRequest) {
  if (!isUrgansActionsEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { actionType?: unknown; objectId?: unknown; input?: unknown }
    | null;
  if (!body || typeof body.actionType !== 'string' || !body.actionType.trim()) {
    return NextResponse.json({ error: 'actionType is required.' }, { status: 400 });
  }
  if (typeof body.objectId !== 'string' || !body.objectId.trim()) {
    return NextResponse.json({ error: 'objectId is required.' }, { status: 400 });
  }

  const result = await runUrgansAction(auth.adminClient, {
    actionType: body.actionType,
    objectId: body.objectId,
    actor: auth.user,
    input: body.input,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.minimumPlan ? { minimumPlan: result.minimumPlan } : {}),
      },
      { status: result.status }
    );
  }

  return NextResponse.json({ actionId: result.actionId, output: result.output });
}
