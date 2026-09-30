import { NextRequest, NextResponse } from 'next/server';

import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import {
  OUTCOME_NOTE_MAX_LENGTH,
  buildOutcomeAiMessages,
  buildTemplateOutcomeSummary,
  isTaskOutcomeRating,
  mapTaskOutcomeRow,
  parseOutcomeAiResponse,
  type OutcomeAiResult,
} from '@/lib/task-outcomes';
import {
  buildReadOnlyResponse,
  ensureTaskAccess,
  isReadOnlyWorkspaceMember,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';

/**
 * Task outcomes: the answer to "Done. How did it go?".
 *
 * POST saves (or replaces) the outcome for a task; PATCH records the answer
 * to the one optional AI follow-up question. There is no GET — outcomes ride
 * along on GET /api/tasks/[id] via loadTaskDetail.
 *
 * Deliberate choices:
 * - Plain requireAuthenticatedAdmin, NOT the *OrInternal variant: agent and
 *   MCP completions never open the sheet, so the internal actor has no
 *   business writing outcomes.
 * - No `status === 'done'` precondition. A reopen racing this POST would
 *   otherwise turn a benign race into a user-visible failure, and the row is
 *   defined as the story of the LAST completion either way.
 * - DB failures surface as real errors (the user typed that note), but AI
 *   failures never do: the template summary is always a valid summary, so a
 *   slow or broken model degrades silently and the response is still 200.
 * - Errors are mapped to plain statuses here on purpose: this route does not
 *   use the deprecated schema-missing fallback helpers (CLAUDE.md, "Patterns
 *   being deprecated in v1"); a missing table surfaces as a normal 500.
 */

const TASK_OUTCOMES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TASK_OUTCOMES === 'true';
const TASK_OUTCOMES_TABLE = 'task_outcomes';

/** The whole AI budget for one submission. Past this we ship the template. */
const AI_OUTCOME_TIMEOUT_MS = 3_000;

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!TASK_OUTCOMES_ENABLED) return notFound();

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth && auth.error) return auth.error;

  const { adminClient } = auth;
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Task id is required.' }, { status: 400 });
  }

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    if (isReadOnlyWorkspaceMember(access.access, access.task.workspace_id)) {
      return buildReadOnlyResponse();
    }

    const body = (await request.json().catch(() => null)) as
      | { outcome?: unknown; note?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }

    const { outcome } = body;
    if (!isTaskOutcomeRating(outcome)) {
      return NextResponse.json({ error: 'Invalid outcome.' }, { status: 400 });
    }

    let note: string | null = null;
    if (typeof body.note === 'string') {
      const trimmed = body.note.trim();
      if (trimmed.length > OUTCOME_NOTE_MAX_LENGTH) {
        return NextResponse.json({ error: 'Note is too long.' }, { status: 400 });
      }
      note = trimmed || null;
    } else if (body.note !== undefined && body.note !== null) {
      return NextResponse.json({ error: 'Note must be text.' }, { status: 400 });
    }

    const releaseId = access.task.release_id;
    if (!releaseId) {
      return NextResponse.json({ error: 'This task has no rollout.' }, { status: 400 });
    }

    let summary = buildTemplateOutcomeSummary(outcome, note);
    let followupQuestion: string | null = null;

    if (note && isAiConfigured()) {
      try {
        // Routed, but this surface never changes model on a failure: the sheet
        // gives the model three seconds in all, and a second attempt cannot fit.
        // With the router off it is the call it always was.
        const result = await generateRoutedStructuredOutput<OutcomeAiResult>({
          surface: 'outcome',
          messages: buildOutcomeAiMessages({ taskTitle: access.task.title, outcome, note }),
          timeoutMs: AI_OUTCOME_TIMEOUT_MS,
          // Total attempts, not extra ones. One attempt keeps the whole call
          // inside the 3 second budget: with the free auto-router every
          // failure (including our own abort) counts as retryable, so a
          // higher number would stack backoffs on top of the timeout.
          maxRetries: 1,
          parse: parseOutcomeAiResponse,
        });
        summary = result.summary;
        followupQuestion = result.followupQuestion;
      } catch {
        // Fail silent by design: keep the template summary, ask nothing.
      }
    }

    const nowIso = new Date().toISOString();
    const saved = await adminClient
      .from(TASK_OUTCOMES_TABLE)
      .upsert(
        {
          task_id: id,
          release_id: releaseId,
          outcome,
          note,
          summary,
          ai_followup_question: followupQuestion,
          // A replacement outcome starts a fresh exchange: any answer to the
          // previous completion's question belongs to a story we just
          // overwrote.
          ai_followup_answer: null,
          created_by: auth.user.id,
          created_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'task_id' }
      )
      .select('*')
      .single();

    if (saved.error || !saved.data) {
      return NextResponse.json(
        { error: saved.error?.message || 'Could not save outcome.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ outcome: mapTaskOutcomeRow(saved.data) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save outcome.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!TASK_OUTCOMES_ENABLED) return notFound();

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth && auth.error) return auth.error;

  const { adminClient } = auth;
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Task id is required.' }, { status: 400 });
  }

  try {
    const access = await ensureTaskAccess(adminClient, id, auth.user);
    if ('error' in access) return access.error;

    if (isReadOnlyWorkspaceMember(access.access, access.task.workspace_id)) {
      return buildReadOnlyResponse();
    }

    const body = (await request.json().catch(() => null)) as { answer?: unknown } | null;
    const answer = typeof body?.answer === 'string' ? body.answer.trim() : '';
    if (!answer) {
      return NextResponse.json({ error: 'Answer is required.' }, { status: 400 });
    }
    if (answer.length > OUTCOME_NOTE_MAX_LENGTH) {
      return NextResponse.json({ error: 'Answer is too long.' }, { status: 400 });
    }

    // Scoped in the statement so there is no read-then-write window, and
    // gated on a question existing so an answer can never appear without one.
    const saved = await adminClient
      .from(TASK_OUTCOMES_TABLE)
      .update({ ai_followup_answer: answer, updated_at: new Date().toISOString() })
      .eq('task_id', id)
      .not('ai_followup_question', 'is', null)
      .select('*')
      .maybeSingle();

    if (saved.error) {
      return NextResponse.json({ error: saved.error.message || 'Could not save answer.' }, { status: 500 });
    }
    if (!saved.data) {
      return NextResponse.json({ error: 'Outcome not found.' }, { status: 404 });
    }

    return NextResponse.json({ outcome: mapTaskOutcomeRow(saved.data) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save answer.' },
      { status: 500 }
    );
  }
}
