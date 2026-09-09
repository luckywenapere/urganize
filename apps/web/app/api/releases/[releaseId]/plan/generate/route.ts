import { NextRequest, NextResponse } from 'next/server';

import {
  createAdminClient,
  getPlannerTemplate,
  isReleasePlannerEnabled,
  loadOwnedRelease,
  loadPlannerTeam,
  requireActiveAuthenticatedUser,
  todayYmd,
} from '../_shared';
import { parseReleasePlanIntake } from '@/lib/release-planning';
import { generatePlanDraft } from '@/lib/release-planning-actions-server';

// Same arithmetic as the route this supersedes. Vercel's plan-default function
// timeout (10-15s) would kill the invocation before the provider's retry
// budget produces a handled failure, and 60 is the Hobby-plan ceiling, so the
// budget has to fit inside it: 2 attempts x PLANNER_TIMEOUT_MS + ~1.5s backoff
// + auth/DB pre-work is about 55s worst case. Raising either constant means
// redoing this math.
export const maxDuration = 60;

/**
 * POST — turn the intake answers into a draft plan.
 *
 * A thin HTTP wrapper: auth, params and body validation stay here (the
 * 400-before-500 precedence), everything from "does a draft already exist"
 * onward is lib/release-planning-actions-server.ts's generatePlanDraft, the
 * one implementation the new release.draft_plan embedded action also calls.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isReleasePlannerEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { intake?: unknown; replace?: unknown }
    | null;
  if (!body) {
    return NextResponse.json({ error: 'A JSON body with intake answers is required.' }, { status: 400 });
  }

  const intakeResult = parseReleasePlanIntake(body.intake);
  if (!intakeResult.ok) {
    return NextResponse.json({ error: intakeResult.error }, { status: 400 });
  }
  const intake = intakeResult.intake;
  const replace = body.replace === true;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;
  const release = loaded.release;

  const { template, fallbackToSingle } = getPlannerTemplate(intake.release_type);

  const result = await generatePlanDraft(adminClient, {
    release,
    actor: auth.user,
    intake,
    replace,
    todayYmd: todayYmd(),
    template,
    fallbackToSingle,
    loadTeam: () => loadPlannerTeam(adminClient, releaseId, auth.user),
    plannerModel: process.env.AI_PLANNER_MODEL || undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status }
    );
  }

  return NextResponse.json({
    draft: {
      id: result.draft.id,
      status: result.draft.status,
      doc: result.draft.doc,
      updatedAt: result.draft.updatedAt,
      approvedAt: result.draft.approvedAt,
    },
  });
}
