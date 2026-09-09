import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { resolveReleaseTaskWorkspace } from '@/lib/tasks-server';
import type { WorkspaceMember } from '@/types/auth';
import {
  parseDraftDoc,
  type PlannerPromptMember,
  type PlanDraftFailure,
  type ReleasePlanDraft,
  type ReleasePlanDraftDoc,
} from '@/lib/release-planning';

// Shared helpers for the plan route group: table constant, the feature flag
// check, the local release load, draft loading and the model-error mapping.
// No schema-missing fallback here on purpose: environments are assumed
// migrated (CLAUDE.md "Patterns being deprecated in v1"), and a missing table
// surfaces as a normal 500.

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
export const TASKS_TABLE = 'tasks';

export const PLAN_DRAFT_COLUMNS = 'id,status,doc,updated_at,approved_at,approved_task_count';

/** The provider budget for one tailoring call. See the maxDuration note on each route. */
export const PLANNER_TIMEOUT_MS = 25_000;
export const PLANNER_MAX_RETRIES = 2;

// Feature flag: the whole planner stays dark until
// NEXT_PUBLIC_FEATURE_RELEASE_PLANNER is 'true'. Every handler checks this
// first and 404s when off, so a direct API call cannot reach the feature
// either (the EPK and notes route precedent). Defined in lib/release-planning
// because release creation needs the same check.
export { isReleasePlannerEnabled } from '@/lib/release-planning';

// getPlannerTemplate / getDraftTemplate moved to
// lib/release-planning-actions-server.ts on 2026-09-03, so the
// release.draft_plan embedded action (a lib module) can resolve a template
// without reaching into an app/api route group's own helpers — the direction
// that dependency would otherwise run. Re-exported here so this group's four
// existing import sites (`from '../_shared'` / `from './_shared'`) stay
// stable; see that function's own comment for the "why here" reasoning.
export { getPlannerTemplate, getDraftTemplate } from '@/lib/release-planning-actions-server';

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

  if (!data || String((data as PlannerReleaseRow).owner_user_id || '') !== userId) {
    return { error: NextResponse.json({ error: 'Rollout not found.' }, { status: 404 }) };
  }

  return { release: data as PlannerReleaseRow };
}

type PlanDraftRow = {
  id: string;
  status: string;
  doc: unknown;
  updated_at: string | null;
  approved_at: string | null;
  approved_task_count: number | null;
};

/**
 * Read the draft for a release. A stored document that no longer parses is
 * reported as a corrupt draft rather than crashing the read, so the manager
 * can discard it and start again.
 */
export async function loadPlanDraft(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  userId: string
): Promise<
  | { error: NextResponse }
  | { draft: null }
  | { draft: ReleasePlanDraft; row: PlanDraftRow }
> {
  const { data, error } = await adminClient
    .from(PLAN_DRAFTS_TABLE)
    .select(PLAN_DRAFT_COLUMNS)
    .eq('release_id', releaseId)
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the plan draft.' },
        { status: 500 }
      ),
    };
  }

  if (!data) return { draft: null };

  const row = data as PlanDraftRow;
  const parsed = parseDraftDoc(row.doc);
  if (!parsed.ok) {
    return {
      error: NextResponse.json(
        { error: 'This plan draft could not be read. Discard it and plan again.' },
        { status: 422 }
      ),
    };
  }

  return {
    draft: {
      id: row.id,
      status: row.status === 'approved' ? 'approved' : 'draft',
      doc: parsed.doc,
      updatedAt: row.updated_at || '',
      approvedAt: row.approved_at,
    },
    row,
  };
}

/** Non-removed tasks already generated from a plan or template on this release. */
export async function countAutoGeneratedTasks(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string
): Promise<{ error: NextResponse } | { count: number }> {
  const { count, error } = await adminClient
    .from(TASKS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId)
    .eq('auto_generated', true);

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not check this rollout for existing activities.' },
        { status: 500 }
      ),
    };
  }

  return { count: count ?? 0 };
}

/**
 * Turn a provider failure into the reason we record on the draft.
 *
 * AiProviderError is not exported from lib/ai/provider.ts, so this reads the
 * shape rather than the class, exactly as the superseded tailor-plan route
 * did.
 */
export function classifyPlannerFailure(error: unknown): PlanDraftFailure {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const status = (error as { status?: number } | null)?.status;
  const name = (error as { name?: string } | null)?.name;

  if (name === 'AbortError' || /abort|timed? ?out/i.test(message)) return 'timeout';
  if (status === 429 || /rate[- ]limit/i.test(message)) return 'busy';
  if (/parse|json|format/i.test(message)) return 'invalid_output';
  return 'unavailable';
}

/**
 * The strict response for a failure, used where there is nothing to fall back
 * to. Every message ends with the same reassurance: the plan on screen is
 * exactly as the manager left it.
 */
export function plannerFailureResponse(failure: PlanDraftFailure): NextResponse {
  switch (failure) {
    case 'timeout':
      return NextResponse.json(
        { error: 'That took too long. Try again. No changes made.' },
        { status: 504 }
      );
    case 'busy':
      return NextResponse.json(
        { error: 'UrgAns is busy. Try again in a moment. No changes made.' },
        { status: 503 }
      );
    case 'invalid_output':
      return NextResponse.json(
        { error: "The response couldn't be used. No changes made." },
        { status: 500 }
      );
    case 'not_configured':
      return NextResponse.json(
        { error: 'Plan updates are not available on this environment.' },
        { status: 503 }
      );
    default:
      return NextResponse.json(
        { error: 'UrgAns is unavailable right now. No changes made.' },
        { status: 503 }
      );
  }
}

/** Serialize a draft for the client. */
export function toPlanDraftResponse(draft: ReleasePlanDraft) {
  return {
    id: draft.id,
    status: draft.status,
    doc: draft.doc,
    updatedAt: draft.updatedAt,
    approvedAt: draft.approvedAt,
  };
}

/** Today in UTC, as YYYY-MM-DD, for prompts and date suggestions. */
export function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The team the planner may hand work to.
 *
 * Only members who have actually joined can hold a task: `assigned_to_user_id`
 * is a real auth user id, so someone who was invited but has not signed up yet
 * has nothing to point at. This is the same rule the assignee picker applies.
 */
export function toAssignableMembers(
  members: WorkspaceMember[]
): { prompt: PlannerPromptMember[]; ids: Set<string> } {
  const joined = members.filter((member) => Boolean(member.userId));
  return {
    prompt: joined.map((member) => ({
      user_id: member.userId as string,
      name: member.name || member.email || 'Teammate',
      role: member.role,
    })),
    ids: new Set(joined.map((member) => member.userId as string)),
  };
}

/**
 * Resolve the team for a release, tolerating failure.
 *
 * Generation can proceed with nobody to assign: the plan simply keeps every
 * task with the owner, which is what template instantiation has always done.
 * Approval calls this too but cannot ignore a failure, so it checks the flag.
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
