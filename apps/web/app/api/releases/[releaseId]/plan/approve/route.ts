import { NextRequest, NextResponse } from 'next/server';

import {
  createAdminClient,
  isReleasePlannerEnabled,
  loadOwnedRelease,
  loadPlannerTeam,
  requireActiveAuthenticatedUser,
} from '../_shared';
import { approvePlanDraft } from '@/lib/release-planning-actions-server';

/**
 * POST — approve the draft and schedule the plan.
 *
 * A thin HTTP wrapper around lib/release-planning-actions-server.ts's
 * approvePlanDraft, the one implementation the new release.draft_plan
 * embedded action's apply step also calls. See that function's own comment
 * for the claim/settle mechanics — this file only does auth, params, and
 * turning the result into a response.
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

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;

  const result = await approvePlanDraft(adminClient, {
    release: loaded.release,
    actor: auth.user,
    loadTeam: () => loadPlannerTeam(adminClient, releaseId, auth.user),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    tasksCreated: result.tasksCreated,
    taskIds: result.taskIds,
    warnings: result.warnings,
  });
}
