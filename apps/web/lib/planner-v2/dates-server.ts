/**
 * SERVER-ONLY. What setting a release date does to a planner v2 plan that was
 * built without one (2026-10-26, Oyin). Called by
 * POST /api/releases/[releaseId]/schedule, the one place a date changes, after
 * the date is saved and any dated plan is moved.
 *
 *   1. Every undated task (`due_date` null, offset in `metadata.planner_v2`)
 *      gets its real due date: release day + offset. Prep that lands before
 *      today reads as catch up, never as overdue.
 *   2. Once per rollout, UrgAns adds the date-dependent tasks (./dates.ts):
 *      a short call on the router's `planner_quick` surface, held to the plan
 *      rules, deduped against the board, code-built adds if the gateway fails.
 *
 * A later date change finds no undated tasks and the flag set, so it only
 * shifts due dates (lib/release-plan-dates-server.ts) and never adds twice.
 * Never throws: the date is already saved.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isAiConfigured } from '../ai/provider';
import { generateRoutedStructuredOutput } from '../ai/routed';
import { legacyModelFor } from '../ai/model-router';
import { recordRequestUsage } from '../ai/usage-log-server';
import { reportAiWalletEmpty } from '../ai/wallet-alert-server';
import { createUsageCollector } from '../credits/embedded';
import { parseDraftDoc } from '../release-planning';
import { buildTaskRowsFromDraft } from '../release-planning-server';
import { daysBetween, parsePlannerV2Answers } from './answers';
import {
  DATE_ADDS_JSON_SCHEMA,
  dueDateFor,
  parseDateAdds,
  readUndatedTaskMeta,
  writeDateAdds,
  type DateAddsInput,
} from './dates';
import type { PlanV2 } from './plan';
import { planV2ToDoc } from './server';

/** The release metadata key that says the date-dependent tasks were added. */
export const DATES_ADDED_KEY = 'planner_v2_dates_added';
const DATE_ADDS_TIMEOUT_MS = 20_000;
const DATE_ADDS_DEADLINE_MS = 30_000;

export type DatePlanResult = { dated: number; added: number };

type TaskRow = {
  id: string;
  title: string | null;
  due_date: string | null;
  status: string | null;
  workspace_id: string | null;
  position: number | null;
  metadata: Record<string, unknown> | null;
};

export async function datePlanV2OnSchedule(
  admin: SupabaseClient,
  params: { releaseId: string; releaseDate: string; actorUserId: string; todayYmd: string; startedAt?: number }
): Promise<DatePlanResult> {
  const result: DatePlanResult = { dated: 0, added: 0 };
  try {
    const { data, error } = await admin
      .from('tasks')
      .select('id,title,due_date,status,workspace_id,position,metadata')
      .eq('release_id', params.releaseId);
    if (error || !data) return result;
    const rows = data as TaskRow[];
    const undated = rows
      .map((row) => ({ row, meta: row.due_date ? null : readUndatedTaskMeta(row.metadata) }))
      .filter((entry): entry is { row: TaskRow; meta: NonNullable<typeof entry.meta> } => entry.meta !== null);
    if (undated.length === 0) return result;

    // 1. Real due dates.
    const nowMs = Date.parse(`${params.todayYmd}T00:00:00Z`);
    const writes = undated.map(({ row, meta }) => async () => {
      const due = dueDateFor(params.releaseDate, meta.offset_days);
      const metadata = { ...(row.metadata ?? {}) };
      metadata.template = {
        ...((metadata.template ?? {}) as Record<string, unknown>),
        compressed_runway: Date.parse(due) < nowMs,
      };
      const update = await admin.from('tasks').update({ due_date: due, metadata }).eq('id', row.id).is('due_date', null);
      if (!update.error) {
        result.dated += 1;
        row.due_date = due;
      }
    });
    for (let i = 0; i < writes.length; i += 5) await Promise.all(writes.slice(i, i + 5).map((write) => write()));

    // 2. The date-dependent tasks, once.
    const release = await admin.from('releases').select('metadata').eq('id', params.releaseId).maybeSingle();
    const releaseMeta = ((release.data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    if (releaseMeta[DATES_ADDED_KEY] === true) return result;

    const planRow = await admin
      .from('release_plan_drafts')
      .select('id,doc')
      .eq('release_id', params.releaseId)
      .maybeSingle();
    const parsedDoc = planRow.data ? parseDraftDoc((planRow.data as { doc: unknown }).doc) : null;
    if (!parsedDoc || !parsedDoc.ok || !parsedDoc.doc.planner_v2) return result;
    const doc = parsedDoc.doc;
    const v2 = doc.planner_v2!;
    const answers = parsePlannerV2Answers(v2.answers);
    if (!answers.ok) return result;

    // Claim first so two date saves racing cannot both add.
    await admin
      .from('releases')
      .update({ metadata: { ...releaseMeta, [DATES_ADDED_KEY]: true } })
      .eq('id', params.releaseId);

    const input: DateAddsInput = {
      ctx: { answers: answers.answers, releaseDate: params.releaseDate, todayYmd: params.todayYmd },
      existing: rows.map((row) => ({
        title: row.title ?? '',
        offset_days: row.due_date ? daysBetween(params.releaseDate, row.due_date.slice(0, 10)) : null,
      })),
      spent: v2.budget.total_naira,
    };

    const collector = createUsageCollector(legacyModelFor('planner_quick') ?? null);
    const startedAt = params.startedAt ?? Date.now();
    const written = await writeDateAdds(input, {
      configured: isAiConfigured(),
      call: (messages) =>
        generateRoutedStructuredOutput({
          surface: 'planner_quick',
          messages,
          temperature: 0.7,
          timeoutMs: DATE_ADDS_TIMEOUT_MS,
          maxRetries: 0,
          parse: parseDateAdds,
          invalidFormatMessage: 'The response was not the expected JSON.',
          jsonSchema: { name: 'date_tasks', schema: DATE_ADDS_JSON_SCHEMA },
          maxOutputTokens: 2_500,
          reasoningEffort: 'low',
          deadlineMs: startedAt + DATE_ADDS_DEADLINE_MS,
          onUsage: collector.onUsage,
          onFailure: collector.onFailure,
        }),
    });
    const workspaceId = rows.find((row) => row.workspace_id)?.workspace_id ?? null;
    await recordRequestUsage(admin, {
      context: {
        requestId: `embedded:${randomUUID()}`,
        feature: 'plan',
        workspaceId,
        ownerUserId: params.actorUserId,
        actorUserId: params.actorUserId,
        releaseId: params.releaseId,
      },
      calls: collector.calls,
      failures: collector.failures,
      creditsCharged: 0,
    });
    if (written.walletEmpty) {
      await reportAiWalletEmpty(admin, {
        feature: 'planner dates',
        workspaceId,
        ownerUserId: params.actorUserId,
        actorUserId: params.actorUserId,
      });
    }
    if (written.tasks.length === 0 || !workspaceId) return result;

    // The adds become ordinary plan activities, dated now.
    const addPlan: PlanV2 = {
      built_for: { summary: '', win: '', target: null, constraints: [], start_point: answers.answers.stage },
      budget: { total_naira: 0, lines: [] },
      tasks: written.tasks.map((task) => ({ ...task, key: `date_${task.key}`.slice(0, 12) })),
      warnings: [],
      assumptions: [],
    };
    const addDoc = planV2ToDoc({
      plan: addPlan,
      answers: answers.answers,
      source: written.source,
      releaseDate: params.releaseDate,
      ownerUserId: params.actorUserId,
      templateId: doc.template_id,
      templateVersion: doc.template_version,
      generatedAt: new Date().toISOString(),
    });
    const draftId = (planRow.data as { id: string }).id;
    const { rows: newRows } = buildTaskRowsFromDraft({
      doc: { ...doc, tasks: addDoc.tasks },
      draftId,
      releaseId: params.releaseId,
      releaseDate: params.releaseDate,
      workspaceId,
      ownerUserId: params.actorUserId,
      assignableUserIds: new Set([params.actorUserId]),
      approvedAtMs: Date.now(),
    });
    const base = rows.reduce((max, row) => Math.max(max, Number(row.position) || 0), 0) + 1;
    const inserted = await admin
      .from('tasks')
      .insert(newRows.map((row, index) => ({ ...row, position: base + index })))
      .select('id');
    if (inserted.error) {
      console.error('[plan-v2] date tasks could not be added for', params.releaseId, inserted.error.message);
      await admin.from('releases').update({ metadata: { ...releaseMeta, [DATES_ADDED_KEY]: false } }).eq('id', params.releaseId);
      return result;
    }
    result.added = (inserted.data ?? []).length;

    // The plan record learns them too, so every reader of the plan agrees.
    const nextDoc = { ...doc, tasks: [...doc.tasks, ...addDoc.tasks], generated_for_release_date: params.releaseDate };
    const stamp = await admin.from('release_plan_drafts').update({ doc: nextDoc }).eq('id', draftId);
    if (stamp.error) console.error('[plan-v2] date tasks added but the plan record did not update:', stamp.error.message);
    return result;
  } catch (error) {
    console.error('[plan-v2] dating the plan failed for', params.releaseId, error);
    return result;
  }
}
