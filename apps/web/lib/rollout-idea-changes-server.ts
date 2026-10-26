// SERVER ONLY. New ideas that update an existing plan (2026-10-26). The rules
// are pure, in lib/rollout-idea-changes.ts; this reads the board, makes the one
// model call, and writes what the owner approved.
//
// Suggesting writes nothing. Applying re-checks what the browser sent against
// the board as it is NOW, then inserts the new tasks and moves the open ones.
// Nothing is deleted and nothing finished is touched. Not charged (like the
// date adds): the call runs on the router's cheap `planner_quick` surface and
// is logged in the usage log.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isAiConfigured } from './ai/provider';
import { generateRoutedStructuredOutput } from './ai/routed';
import { legacyModelFor } from './ai/model-router';
import { recordRequestUsage } from './ai/usage-log-server';
import { createUsageCollector } from './credits/embedded';
import { daysBetween } from './planner-v2/answers';
import { readUndatedTaskMeta } from './planner-v2/when';
import {
  IDEA_CHANGES_JSON_SCHEMA,
  buildIdeaChangesMessages,
  cleanIdeaChanges,
  parseIdeaChanges,
  readIdeaChanges,
  viewIdeaChanges,
  type ChangeContext,
  type ChangeTask,
  type IdeaAdd,
  type IdeaChangeView,
  type IdeaChanges,
  type IdeaMove,
} from './rollout-idea-changes';

const MS_DAY = 86_400_000;
const SUGGEST_TIMEOUT_MS = 25_000;
const SUGGEST_DEADLINE_MS = 45_000;

type BoardRow = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  workspace_id: string | null;
  position: number | null;
  metadata: Record<string, unknown> | null;
};

export type ChangeBoard = { tasks: ChangeTask[]; rows: BoardRow[] };

/** Every task on the rollout, with its time as days from release day. */
export async function loadChangeBoard(
  admin: SupabaseClient,
  releaseId: string,
  releaseDate: string | null
): Promise<ChangeBoard> {
  const { data, error } = await admin
    .from('tasks')
    .select('id,title,status,due_date,workspace_id,position,metadata')
    .eq('release_id', releaseId)
    .order('position', { ascending: true });
  if (error) throw error;
  const rows = (data || []) as BoardRow[];
  const tasks = rows.map((row): ChangeTask => {
    let offsetDays: number | null = null;
    if (row.due_date && releaseDate) offsetDays = daysBetween(releaseDate, row.due_date.slice(0, 10));
    else if (!row.due_date) offsetDays = readUndatedTaskMeta(row.metadata)?.offset_days ?? null;
    return {
      id: row.id,
      title: String(row.title || '').trim() || 'Untitled task',
      status: String(row.status || 'todo'),
      offsetDays,
    };
  });
  return { tasks, rows };
}

export type SuggestResult =
  | { ok: true; changes: IdeaChanges; view: IdeaChangeView }
  | { ok: false; status: number; error: string };

export async function suggestIdeaChanges(
  admin: SupabaseClient,
  params: {
    release: { id: string; title: string | null; artist_name: string | null; release_type: string | null; release_date: string | null };
    ownerUserId: string;
    idea: string;
    todayYmd: string;
    startedAt?: number;
  }
): Promise<SuggestResult> {
  if (!isAiConfigured()) {
    return { ok: false, status: 503, error: 'UrgAns is not set up on this environment.' };
  }
  const releaseDate = params.release.release_date ? params.release.release_date.slice(0, 10) : null;
  const ctx: ChangeContext = { releaseDate, todayYmd: params.todayYmd };
  const board = await loadChangeBoard(admin, params.release.id, releaseDate);
  if (board.tasks.length === 0) {
    return { ok: false, status: 409, error: 'Build the plan first, then add ideas to it.' };
  }

  const collector = createUsageCollector(legacyModelFor('planner_quick') ?? null);
  const startedAt = params.startedAt ?? Date.now();
  let changes: IdeaChanges | null = null;
  try {
    changes = await generateRoutedStructuredOutput<IdeaChanges>({
      surface: 'planner_quick',
      messages: buildIdeaChangesMessages({
        title: params.release.title || 'Untitled rollout',
        artistName: params.release.artist_name || '',
        releaseType: params.release.release_type || 'single',
        idea: params.idea,
        tasks: board.tasks,
        ctx,
      }),
      temperature: 0.6,
      timeoutMs: SUGGEST_TIMEOUT_MS,
      maxRetries: 1,
      parse: (raw) => {
        // The routed wrapper needs a non-null parse to count the answer as usable.
        return readIdeaChanges(raw, ctx, board.tasks);
      },
      invalidFormatMessage: 'The response was not the expected JSON.',
      jsonSchema: { name: 'idea_changes', schema: IDEA_CHANGES_JSON_SCHEMA },
      maxOutputTokens: 2_000,
      reasoningEffort: 'low',
      deadlineMs: startedAt + SUGGEST_DEADLINE_MS,
      onUsage: collector.onUsage,
      onFailure: collector.onFailure,
    });
  } catch {
    changes = null;
  }
  await recordRequestUsage(admin, {
    context: {
      requestId: `embedded:${randomUUID()}`,
      feature: 'plan',
      workspaceId: board.rows.find((row) => row.workspace_id)?.workspace_id ?? null,
      ownerUserId: params.ownerUserId,
      actorUserId: params.ownerUserId,
      releaseId: params.release.id,
    },
    calls: collector.calls,
    failures: collector.failures,
    creditsCharged: 0,
  }).catch(() => undefined);

  if (!changes) {
    return { ok: false, status: 503, error: 'UrgAns could not read the plan just now. Try again.' };
  }
  return { ok: true, changes, view: viewIdeaChanges(changes, ctx, board.tasks) };
}

export type ApplyResult =
  | { ok: true; added: number; moved: number }
  | { ok: false; status: number; error: string };

export async function applyIdeaChanges(
  admin: SupabaseClient,
  params: {
    release: { id: string; release_date: string | null };
    ownerUserId: string;
    adds: ReadonlyArray<IdeaAdd>;
    moves: ReadonlyArray<IdeaMove>;
    todayYmd: string;
  }
): Promise<ApplyResult> {
  const releaseDate = params.release.release_date ? params.release.release_date.slice(0, 10) : null;
  const ctx: ChangeContext = { releaseDate, todayYmd: params.todayYmd };
  const board = await loadChangeBoard(admin, params.release.id, releaseDate);
  // Re-checked against the board as it is now, not as it was when suggested.
  const changes = cleanIdeaChanges({ adds: params.adds, moves: params.moves }, ctx, board.tasks);
  if (changes.adds.length === 0 && changes.moves.length === 0) {
    return { ok: false, status: 409, error: 'Nothing here can be applied any more. Suggest changes again.' };
  }
  const workspaceId = board.rows.find((row) => row.workspace_id)?.workspace_id ?? null;
  if (changes.adds.length > 0 && !workspaceId) {
    return { ok: false, status: 409, error: 'This rollout has no plan to add to yet.' };
  }

  const nowMs = Date.now();
  let added = 0;
  if (changes.adds.length > 0 && workspaceId) {
    const base = board.rows.reduce((max, row) => Math.max(max, Number(row.position) || 0), 0) + 1;
    const rows = changes.adds.map((add, index) => {
      const dueMs = releaseDate ? Date.parse(`${releaseDate}T00:00:00Z`) + add.offsetDays * MS_DAY : null;
      return {
        id: randomUUID(),
        release_id: params.release.id,
        workspace_id: workspaceId,
        group_id: null,
        created_by: params.ownerUserId,
        assigned_to_user_id: params.ownerUserId,
        assigned_to: null,
        assigned_collaborator_id: null,
        title: add.title,
        description: add.why || null,
        status: 'todo',
        priority: 'none',
        state: 'planning',
        position: base + index,
        auto_generated: true,
        due_date: dueMs === null ? null : new Date(dueMs).toISOString(),
        dependencies: [] as string[],
        metadata: {
          // The two keys the task readers classify by (lib/tasks-server.ts).
          template: { task_type: 'task', compressed_runway: dueMs !== null && dueMs < nowMs },
          planner: { origin: 'idea' },
          // An undated rollout keeps the timing as an offset, dated when the date is set.
          ...(dueMs === null ? { planner_v2: { offset_days: add.offsetDays, now: add.now } } : {}),
        },
      };
    });
    const inserted = await admin.from('tasks').insert(rows).select('id');
    if (inserted.error) {
      console.error('[idea-changes] tasks could not be added for', params.release.id, inserted.error.message);
      return { ok: false, status: 500, error: 'Could not add the new activities.' };
    }
    added = (inserted.data ?? []).length;
  }

  let moved = 0;
  const rowById = new Map(board.rows.map((row) => [row.id, row]));
  for (const move of changes.moves) {
    const row = rowById.get(move.taskId);
    if (!row) continue;
    let update;
    if (row.due_date && releaseDate) {
      const dueMs = Date.parse(`${releaseDate}T00:00:00Z`) + move.offsetDays * MS_DAY;
      const metadata = { ...(row.metadata ?? {}) };
      metadata.template = {
        ...((metadata.template ?? {}) as Record<string, unknown>),
        compressed_runway: dueMs < nowMs,
      };
      update = await admin
        .from('tasks')
        .update({ due_date: new Date(dueMs).toISOString(), metadata })
        .eq('id', row.id)
        .eq('release_id', params.release.id);
    } else {
      const metadata = { ...(row.metadata ?? {}) };
      const previous = (metadata.planner_v2 ?? {}) as Record<string, unknown>;
      metadata.planner_v2 = { ...previous, offset_days: move.offsetDays, now: false };
      update = await admin
        .from('tasks')
        .update({ metadata })
        .eq('id', row.id)
        .eq('release_id', params.release.id);
    }
    if (!update.error) moved += 1;
  }

  return { ok: true, added, moved };
}
