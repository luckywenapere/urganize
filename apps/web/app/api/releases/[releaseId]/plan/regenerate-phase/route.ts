import { NextRequest, NextResponse } from 'next/server';

import {
  PLANNER_MAX_RETRIES,
  PLANNER_TIMEOUT_MS,
  PLAN_DRAFTS_TABLE,
  classifyPlannerFailure,
  createAdminClient,
  getPlannerTemplate,
  isReleasePlannerEnabled,
  loadOwnedRelease,
  loadPlanDraft,
  loadPlannerTeam,
  plannerFailureResponse,
  requireActiveAuthenticatedUser,
  toAssignableMembers,
  todayYmd,
} from '../_shared';
import { generateStructuredAiOutput, isAiConfigured } from '@/lib/ai/provider';
import {
  PLAN_PHASE_ORDER,
  applyDeltaToDraft,
  buildPlannerMessages,
  parsePlannerAiDelta,
  resetPhaseToTemplate,
  toPromptTasks,
  validatePlannerDelta,
  type PlannerAiDelta,
  type PlanPhase,
} from '@/lib/release-planning';

// Same budget as generate: see the note there before changing either constant.
export const maxDuration = 60;

/**
 * POST — redraft one phase of an existing plan.
 *
 * Unlike generate there is no deterministic fallback here. The manager is
 * looking at a working plan and asked for a second opinion on one part of it,
 * so a failure has to leave that plan exactly as it was and say so. Nothing is
 * written unless a valid delta comes back.
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
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { phase?: unknown } | null;
  const phase = body?.phase;
  if (typeof phase !== 'string' || !PLAN_PHASE_ORDER.includes(phase as PlanPhase)) {
    return NextResponse.json({ error: 'A phase to redraft is required.' }, { status: 400 });
  }
  const targetPhase = phase as PlanPhase;

  if (!isAiConfigured()) {
    return plannerFailureResponse('not_configured');
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;
  const release = loaded.release;

  const existing = await loadPlanDraft(adminClient, releaseId, auth.user.id);
  if ('error' in existing) return existing.error;
  if (!existing.draft) {
    return NextResponse.json({ error: 'No plan draft to redraft.' }, { status: 404 });
  }
  if (existing.draft.status === 'approved') {
    return NextResponse.json({ error: 'This plan was already approved.' }, { status: 409 });
  }

  const template = getPlannerTemplate();
  const intake = existing.draft.doc.intake;

  // Start the phase from the playbook again rather than layering a second
  // redraft on top of the first, so repeated attempts stay comparable. Rows
  // the manager edited, and rows the manager added, are left alone by both
  // this reset and the fold below.
  const resetDoc = resetPhaseToTemplate(existing.draft.doc, template, targetPhase, auth.user.id);

  const phaseTasks = resetDoc.tasks.filter(
    (task) => task.phase === targetPhase && task.origin === 'template' && !task.edited
  );
  if (phaseTasks.length === 0) {
    return NextResponse.json(
      { error: 'There is nothing in this phase for UrgAns to redraft.' },
      { status: 400 }
    );
  }

  const team = await loadPlannerTeam(adminClient, releaseId, auth.user);
  const assignable = toAssignableMembers(team.ok ? team.members : []);

  const messages = buildPlannerMessages({
    release: {
      title: release.title || '',
      artistName: release.artist_name || intake.artist_name,
      releaseDate: release.release_date || intake.release_date,
    },
    intake,
    tasks: toPromptTasks(phaseTasks),
    members: assignable.prompt,
    todayYmd: todayYmd(),
    phase: targetPhase,
  });

  let delta: PlannerAiDelta;
  try {
    delta = await generateStructuredAiOutput<PlannerAiDelta>({
      messages,
      timeoutMs: PLANNER_TIMEOUT_MS,
      maxRetries: PLANNER_MAX_RETRIES,
      model: process.env.AI_PLANNER_MODEL || undefined,
      parse: parsePlannerAiDelta,
      invalidFormatMessage: 'The response was not the expected JSON.',
    });
  } catch (error) {
    const failure = classifyPlannerFailure(error);
    console.error('[plan] phase redraft failed for release', releaseId, failure, error);
    return plannerFailureResponse(failure);
  }

  // Ids must come from this phase, not merely from the plan: a redraft of the
  // release week has no business moving a setup task.
  const validation = validatePlannerDelta(
    delta,
    phaseTasks.map((task) => ({ id: task.id, optional: task.optional })),
    Array.from(assignable.ids)
  );
  if (!validation.ok) {
    console.error('[plan] phase redraft rejected for release', releaseId, validation.error);
    return NextResponse.json(
      { error: 'Invalid changes were suggested. No changes made.' },
      { status: 500 }
    );
  }

  const nextDoc = applyDeltaToDraft(resetDoc, delta, { phaseScope: targetPhase });

  const { data, error } = await adminClient
    .from(PLAN_DRAFTS_TABLE)
    .update({ doc: nextDoc })
    .eq('release_id', releaseId)
    .eq('owner_user_id', auth.user.id)
    .eq('status', 'draft')
    .select('id,updated_at');

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save the redrafted phase.' },
      { status: 500 }
    );
  }

  const updated = (data || [])[0] as { id: string; updated_at: string | null } | undefined;
  if (!updated) {
    // Approved between the read and the write. Nothing was applied.
    return NextResponse.json({ error: 'This plan was already approved.' }, { status: 409 });
  }

  return NextResponse.json({
    draft: {
      id: updated.id,
      status: 'draft' as const,
      doc: nextDoc,
      updatedAt: updated.updated_at || '',
      approvedAt: null,
    },
  });
}
