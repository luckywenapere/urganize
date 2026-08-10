import { NextRequest, NextResponse } from 'next/server';

import {
  PLAN_DRAFTS_TABLE,
  createAdminClient,
  getPlannerTemplate,
  isReleasePlannerEnabled,
  loadOwnedRelease,
  loadPlanDraft,
  requireActiveAuthenticatedUser,
  toPlanDraftResponse,
} from './_shared';
import { parseDraftDoc, parseReleasePlanIntake } from '@/lib/release-planning';

/**
 * The plan draft itself: read it, autosave the manager's edits into it, or
 * throw it away.
 *
 * Generation, per-phase redrafting and approval each live in their own child
 * route because they do materially different work.
 */

/**
 * GET — the draft plus the saved intake answers.
 *
 * The intake comes back separately from the draft so the wizard can prefill
 * from a previous run even when there is no draft yet (the manager generated,
 * discarded, and came back). Answers stored by the superseded tailor-plan
 * feature are a different shape and simply parse to null.
 */
export async function GET(
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

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;

  const draftResult = await loadPlanDraft(adminClient, releaseId, auth.user.id);
  if ('error' in draftResult) return draftResult.error;

  const savedIntake = parseReleasePlanIntake(loaded.release.release_context);

  return NextResponse.json({
    draft: draftResult.draft ? toPlanDraftResponse(draftResult.draft) : null,
    intake: savedIntake.ok ? savedIntake.intake : null,
    releaseDate: loaded.release.release_date,
  });
}

/**
 * PUT — autosave the whole draft document.
 *
 * The document is written whole rather than patched task by task: the review
 * scene holds the entire plan in memory and debounces, so a partial update
 * protocol would buy nothing and could interleave into a half-applied plan.
 *
 * Assignees are NOT checked against workspace membership here. Membership can
 * change while a draft sits open, and failing an autosave over it would throw
 * away the manager's typing. Approval settles assignees instead.
 */
export async function PUT(
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

  const body = (await request.json().catch(() => null)) as { doc?: unknown } | null;
  if (!body) {
    return NextResponse.json({ error: 'A JSON body with a doc is required.' }, { status: 400 });
  }

  const template = getPlannerTemplate();
  const parsed = parseDraftDoc(body.doc, {
    knownTemplateTaskIds: new Set(template.tasks.map((task) => task.id)),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;

  // Ownership and status are both in the statement, so there is no window
  // between checking and writing (the notes route convention). An approved
  // plan is frozen: its tasks already exist.
  const { data, error } = await adminClient
    .from(PLAN_DRAFTS_TABLE)
    .update({ doc: parsed.doc })
    .eq('release_id', releaseId)
    .eq('owner_user_id', auth.user.id)
    .eq('status', 'draft')
    .select('id,updated_at');

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save the plan.' },
      { status: 500 }
    );
  }

  const updated = (data || [])[0] as { id: string; updated_at: string | null } | undefined;
  if (!updated) {
    // Either there is no draft or it has been approved. Tell the two apart so
    // the scene can reload rather than silently dropping the edit.
    const existing = await loadPlanDraft(adminClient, releaseId, auth.user.id);
    if ('error' in existing) return existing.error;
    if (existing.draft && existing.draft.status === 'approved') {
      return NextResponse.json({ error: 'This plan was already approved.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No plan draft to save.' }, { status: 404 });
  }

  return NextResponse.json({ updatedAt: updated.updated_at || '' });
}

/**
 * DELETE — discard a draft the manager never approved. Idempotent, and refuses
 * to touch an approved one (deleting that would erase the provenance of tasks
 * that already exist).
 */
export async function DELETE(
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

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;

  const { error } = await adminClient
    .from(PLAN_DRAFTS_TABLE)
    .delete()
    .eq('release_id', releaseId)
    .eq('owner_user_id', auth.user.id)
    .eq('status', 'draft');

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not discard the plan.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
