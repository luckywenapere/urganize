import { NextRequest, NextResponse } from 'next/server';

import {
  PLAN_DRAFTS_TABLE,
  createAdminClient,
  getDraftTemplate,
  isReleasePlannerEnabled,
  loadOwnedRelease,
  loadPlanDraft,
  requireActiveAuthenticatedUser,
  toPlanDraftResponse,
} from './_shared';
import { parseDraftDoc, parseReleasePlanIntake } from '@/lib/release-planning';
import { discardPlanDraft } from '@/lib/release-planning-actions-server';
import { findLatestDraftedActionId } from '@/lib/urgans-actions/server';

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

  // Re-derived on every load rather than threaded through client state, so a
  // reload, a deep link, or a draft started on another device all resolve the
  // same answer. Only looked up for a live draft — an approved one has
  // nothing left to apply/discard, and findLatestDraftedActionId itself
  // fails to null on every error (flag off, migration not yet applied), so
  // this can never break loading the draft it accompanies.
  const actionId =
    draftResult.draft && draftResult.draft.status === 'draft'
      ? await findLatestDraftedActionId(adminClient, {
          objectType: 'release',
          objectId: releaseId,
          actionType: 'release.draft_plan',
        })
      : null;

  return NextResponse.json({
    draft: draftResult.draft ? toPlanDraftResponse(draftResult.draft) : null,
    intake: savedIntake.ok ? savedIntake.intake : null,
    releaseDate: loaded.release.release_date,
    actionId,
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

  // Flag-BLIND, and read from the doc the client is saving rather than from the
  // release row: the template is only here to supply the set of legitimate
  // template task ids. An EP draft generated while the EP flag was on carries
  // ep_v0.1 ids, and if the flag is rolled back mid-draft a flag-aware lookup
  // would fall back to the single playbook, call every one of those ids forged,
  // and 400 every autosave — losing the manager's edits.
  const template = getDraftTemplate(
    (body.doc as { release_type?: unknown } | null)?.release_type as string | null
  );
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
 *
 * A thin wrapper around lib/release-planning-actions-server.ts's
 * discardPlanDraft, the one implementation the new release.draft_plan
 * embedded action's discard step also calls.
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

  const result = await discardPlanDraft(adminClient, { releaseId, ownerUserId: auth.user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
