import { NextRequest, NextResponse } from 'next/server';

import {
  createAdminClient,
  isReleasePlannerEnabled,
  loadCreatedPlan,
  loadPlannerTeam,
  requireActiveAuthenticatedUser,
} from '../_shared';
import { ensureReleaseTeamReadAccess, ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { listPlanSuggestions } from '@/lib/plan-core';
import { computeTaskYmd, isTaskPreCompletedByReady, type DraftTask, type ReleasePlanDraftDoc } from '@/lib/release-planning';
import { buildSuggestionTaskRow } from '@/lib/release-planning-server';
import { TASKS_SELECT_COLUMNS, loadTasks } from '@/lib/tasks-server';
import type { WorkspaceMember } from '@/types/auth';

/**
 * A smaller plan's suggestions (URG-318): what the plan kept but did not make
 * an activity of. GET lists them by phase; POST { id } adds one to the board
 * with its date and owner, the one tap the list offers. Plans built before
 * 2026-10-16 have none (lib/plan-core.ts listPlanSuggestions).
 *
 * Team-aware like the other rollout routes: any teammate can read, guests
 * cannot add (ensureReleaseTeamWriteAccess's 403).
 */

type BoardRow = { id: string; metadata: Record<string, unknown> | null };

function isDoneFor(doc: ReleasePlanDraftDoc) {
  return (task: DraftTask) =>
    task.origin === 'template' && isTaskPreCompletedByReady(task, doc.intake.ready_today, doc.template_id);
}

/** draft task id → activity id, for the activities this plan put on the board. */
function boardMap(rows: BoardRow[], draftId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const planner = (row.metadata as { planner?: { draft_id?: unknown; draft_task_id?: unknown } } | null)?.planner;
    if (planner && planner.draft_id === draftId && typeof planner.draft_task_id === 'string') {
      map.set(planner.draft_task_id, row.id);
    }
  }
  return map;
}

function memberName(members: WorkspaceMember[], userId: string | null): string | null {
  if (!userId) return null;
  const member = members.find((m) => m.userId === userId);
  if (!member) return null;
  if (member.isCurrentUser) return 'You';
  return member.name?.split(' ')[0] || member.email || null;
}

async function loadContext(request: NextRequest, releaseId: string, write: boolean) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error };
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }
  const access = write
    ? await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user)
    : await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return { error: access.error };

  const [created, board, team] = await Promise.all([
    loadCreatedPlan(admin, releaseId),
    admin.from('tasks').select('id,metadata').eq('release_id', releaseId),
    loadPlannerTeam(admin, releaseId, auth.user),
  ]);
  if ('error' in created) return { error: created.error };
  if (board.error) {
    return { error: NextResponse.json({ error: 'Could not load the plan.' }, { status: 500 }) };
  }
  return {
    auth,
    admin,
    release: access.release,
    plan: created.plan,
    board: (board.data ?? []) as BoardRow[],
    members: team.ok ? team.members : [],
    workspaceId: team.ok ? team.workspaceId : null,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isReleasePlannerEnabled()) return NextResponse.json({ suggestions: [] });
  const { releaseId } = await context.params;
  const ctx = await loadContext(request, releaseId, false);
  if ('error' in ctx) return ctx.error;
  if (!ctx.plan) return NextResponse.json({ suggestions: [] });

  const doc = ctx.plan.doc;
  const onBoard = new Set(boardMap(ctx.board, ctx.plan.id).keys());
  const releaseDate = ctx.release.releaseDate;
  const suggestions = listPlanSuggestions(doc, onBoard, isDoneFor(doc)).map((s) => ({
    id: s.id,
    title: s.title,
    why: s.why,
    phase: s.phase,
    dueDate: releaseDate ? computeTaskYmd(releaseDate.slice(0, 10), s.offsetDays) : null,
    ownerName: memberName(ctx.members, s.assigneeUserId) ?? memberName(ctx.members, ctx.release.ownerUserId),
  }));
  return NextResponse.json({ suggestions });
}

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  if (!isReleasePlannerEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { releaseId } = await context.params;
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const suggestionId = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!suggestionId) return NextResponse.json({ error: 'Which suggestion?' }, { status: 400 });

  const ctx = await loadContext(request, releaseId, true);
  if ('error' in ctx) return ctx.error;
  if (!ctx.plan || !ctx.workspaceId) {
    return NextResponse.json({ error: 'This rollout has no plan to add from.' }, { status: 404 });
  }
  const releaseDate = ctx.release.releaseDate?.slice(0, 10) ?? null;
  if (!releaseDate) {
    return NextResponse.json({ error: 'Set a release date first.' }, { status: 409 });
  }

  const doc = ctx.plan.doc;
  const onBoardMap = boardMap(ctx.board, ctx.plan.id);
  const offered = listPlanSuggestions(doc, new Set(onBoardMap.keys()), isDoneFor(doc));
  if (!offered.some((s) => s.id === suggestionId)) {
    // Already added (a second tap, another teammate) or not part of this plan.
    return NextResponse.json({ error: 'Already on the plan.', code: 'already_added' }, { status: 409 });
  }
  const task = doc.tasks.find((t) => t.id === suggestionId) as DraftTask;

  const assignable = new Set(
    ctx.members
      .filter((m) => m.status === 'active' && m.userId)
      .map((m) => m.userId as string)
  );
  const ownerUserId = ctx.release.ownerUserId || ctx.auth.user.id;
  assignable.add(ownerUserId);

  const row = buildSuggestionTaskRow({
    doc,
    task,
    draftId: ctx.plan.id,
    releaseId,
    releaseDate,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.auth.user.id,
    ownerUserId,
    assignableUserIds: assignable,
    boardIdsByDraftTaskId: onBoardMap,
    position: ctx.board.length,
    nowMs: Date.now(),
  });

  const inserted = await ctx.admin.from('tasks').insert(row).select(TASKS_SELECT_COLUMNS).single();
  if (inserted.error || !inserted.data) {
    console.error('[plan] could not add suggestion for rollout', releaseId, inserted.error);
    return NextResponse.json({ error: 'Could not add it. Try again.' }, { status: 500 });
  }
  const [added] = await loadTasks(
    ctx.admin,
    [inserted.data as unknown as Parameters<typeof loadTasks>[1][number]],
    ctx.auth.user.id
  );
  return NextResponse.json({ task: added });
}
