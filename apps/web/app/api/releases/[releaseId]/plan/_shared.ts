import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { resolveReleaseTaskWorkspace } from '@/lib/tasks-server';
import { canPlanRelease } from '@/lib/release-team';
import type { WorkspaceMember } from '@/types/auth';
import { parseDraftDoc, type ReleasePlanDraft, type ReleasePlanDraftDoc } from '@/lib/release-planning';

// Shared helpers for the plan route: table constant, the feature flag check,
// the local release load, the built-plan read and the team resolver. No
// schema-missing fallback here on purpose: environments are assumed migrated
// (CLAUDE.md "Patterns being deprecated in v1"), and a missing table surfaces
// as a normal 500.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// this group's import sites stay stable (the notes/EPK convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const PLAN_DRAFTS_TABLE = 'release_plan_drafts';
export const RELEASES_TABLE = 'releases';

export const PLAN_DRAFT_COLUMNS = 'id,status,doc,updated_at,approved_at,approved_task_count';

// Feature flag: the whole planner stays dark until
// NEXT_PUBLIC_FEATURE_RELEASE_PLANNER is 'true'. Every handler checks this
// first and 404s when off, so a direct API call cannot reach the feature
// either (the EPK and notes route precedent). Defined in lib/release-planning
// because release creation needs the same check.
export { isReleasePlannerEnabled } from '@/lib/release-planning';

// getPlannerTemplate lives in lib/release-planning-actions-server.ts so the
// release.draft_plan embedded action (a lib module) can resolve a template
// without reaching into an app/api route group's own helpers — the direction
// that dependency would otherwise run. Re-exported here for the route.
export { getPlannerTemplate } from '@/lib/release-planning-actions-server';

export type PlannerReleaseRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  artist_name: string | null;
  release_date: string | null;
  release_type: string | null;
  release_context: unknown;
  metadata: Record<string, unknown> | null;
};

const RELEASE_COLUMNS =
  'id,owner_user_id,title,artist_name,release_date,release_type,release_context,metadata';

/**
 * Load the release and confirm the caller owns it.
 *
 * Deliberately NOT the ensureReleaseOwnership in app/api/releases/_shared.ts,
 * whose module carries the deprecated schema-missing fallback helpers this
 * feature must stay away from (the guard test). Same contract as the notes and
 * EPK copies: 404, never 403, when the release is missing or owned by someone
 * else.
 */
export async function loadOwnedRelease(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  userId: string
): Promise<{ error: NextResponse } | { release: PlannerReleaseRow }> {
  const { data, error } = await adminClient
    .from(RELEASES_TABLE)
    .select(RELEASE_COLUMNS)
    .is('deleted_at', null)
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load rollout.' },
        { status: 500 }
      ),
    };
  }

  const releaseOwnerId = String((data as PlannerReleaseRow | null)?.owner_user_id || '');
  if (!data || !releaseOwnerId) {
    return { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) };
  }
  if (releaseOwnerId !== userId) {
    // #854: a rollout a Manager made in a team they joined is owned by that
    // team's owner, so the Manager must still be able to plan it. Owner, or an
    // active owner/admin of the owner's team (lib/release-team.ts). Only read
    // when the caller is not the owner, so the owner's path costs nothing new.
    const membership = await loadMembershipInOwnersTeam(adminClient, releaseOwnerId, userId);
    if (!canPlanRelease({ userId, releaseOwnerId, membershipInOwnersTeam: membership })) {
      return { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) };
    }
  }

  return { release: data as PlannerReleaseRow };
}

/** The caller's membership in the team `ownerUserId` owns, or null. Never throws. */
export async function loadMembershipInOwnersTeam(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  ownerUserId: string,
  userId: string
): Promise<{ role: string; status: string } | null> {
  try {
    const team = await adminClient
      .from('workspaces')
      .select('id')
      .eq('owner_id', ownerUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const workspaceId = (team.data as { id?: string } | null)?.id;
    if (team.error || !workspaceId) return null;
    const member = await adminClient
      .from('workspace_members')
      .select('role,status')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .neq('status', 'removed')
      .limit(1)
      .maybeSingle();
    const row = member.data as { role?: string; status?: string } | null;
    if (member.error || !row) return null;
    return { role: String(row.role || ''), status: String(row.status || '') };
  } catch {
    return null;
  }
}

type PlanRow = {
  id: string;
  status: string;
  doc: unknown;
  updated_at: string | null;
  approved_at: string | null;
  approved_task_count: number | null;
};

export type CreatedPlanRecord = ReleasePlanDraft & { approvedTaskCount: number | null };

/**
 * Read the plan that was built for a release. Only a built (`approved`) row
 * counts: a `draft` row is a leftover of the retired review flow, or of a
 * build that failed after claiming, and neither is a plan anyone can read.
 * A stored document that no longer parses answers null rather than an error
 * — the summary it feeds is a courtesy, and the activities it describes exist
 * regardless.
 */
export async function loadCreatedPlan(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string
): Promise<{ error: NextResponse } | { plan: CreatedPlanRecord | null }> {
  const { data, error } = await adminClient
    .from(PLAN_DRAFTS_TABLE)
    .select(PLAN_DRAFT_COLUMNS)
    .eq('release_id', releaseId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the plan.' },
        { status: 500 }
      ),
    };
  }

  if (!data) return { plan: null };

  const row = data as PlanRow;
  if (row.status !== 'approved') return { plan: null };

  const parsed = parseDraftDoc(row.doc);
  if (!parsed.ok) {
    console.error('[plan] built plan document could not be read for rollout', releaseId, parsed.error);
    return { plan: null };
  }

  return {
    plan: {
      id: row.id,
      status: 'approved',
      doc: parsed.doc,
      updatedAt: row.updated_at || '',
      approvedAt: row.approved_at,
      approvedTaskCount: row.approved_task_count,
    },
  };
}

/** Serialize a built plan for the client. */
export function toPlanResponse(plan: CreatedPlanRecord) {
  return {
    id: plan.id,
    status: plan.status,
    doc: plan.doc,
    updatedAt: plan.updatedAt,
    approvedAt: plan.approvedAt,
    approvedTaskCount: plan.approvedTaskCount,
  };
}

/** Today in UTC, as YYYY-MM-DD, for prompts and date suggestions. */
export function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve the team for a release, tolerating failure.
 *
 * The caller decides what a failure means: createReleasePlan refuses before
 * any write, because it needs the workspace to file the activities.
 */
export async function loadPlannerTeam(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  user: { id: string; email?: string | null }
): Promise<{ ok: true; workspaceId: string; members: WorkspaceMember[] } | { ok: false }> {
  try {
    const resolved = await resolveReleaseTaskWorkspace(adminClient, releaseId, {
      id: user.id,
      email: user.email || '',
    } as Parameters<typeof resolveReleaseTaskWorkspace>[2]);
    return { ok: true, workspaceId: resolved.workspaceId, members: resolved.members };
  } catch (error) {
    console.error('[plan] could not resolve the team for rollout', releaseId, error);
    return { ok: false };
  }
}

export type { ReleasePlanDraftDoc };
