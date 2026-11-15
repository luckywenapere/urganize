import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  BRIEF_QUESTION_IDS,
  briefAnswerLines,
  clearBriefAnswer,
  type BriefPrefs,
  type BriefQuestionId,
} from '@/lib/chappi/brief-questions';
import { readBriefPrefs, updateBriefPrefs } from '@/lib/chappi/brief-answers-server';
import { lagosDateKey } from '@/lib/chappi/morning-brief';

/**
 * Settings for the brief's daily question (#1314): what the person has told
 * it, a way to clear each answer, and the switch for the questions.
 *
 * GET   -> { questionsOn, answers: [{ key, label, value, at }] }
 * PATCH { questionsOn?: boolean, clear?: question id | "all" } -> same shape
 */
function view(prefs: BriefPrefs) {
  return { questionsOn: !prefs.questionsOff, answers: briefAnswerLines(prefs, lagosDateKey(new Date())) };
}

async function context(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth && auth.error) return { error: auth.error };
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  return { admin, userId: auth.user.id };
}

export async function GET(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return ctx.error;
  const prefs = await readBriefPrefs(ctx.admin, ctx.userId);
  if (!prefs) return NextResponse.json({ error: 'Could not read your answers.' }, { status: 500 });
  return NextResponse.json(view(prefs));
}

export async function PATCH(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as { questionsOn?: unknown; clear?: unknown } | null;
  const clear = body?.clear;
  const validClear =
    clear === undefined || clear === 'all' || (BRIEF_QUESTION_IDS as readonly unknown[]).includes(clear);
  if (!body || !validClear || (body.questionsOn !== undefined && typeof body.questionsOn !== 'boolean')) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const saved = await updateBriefPrefs(ctx.admin, ctx.userId, (current) => {
    let prefs: BriefPrefs = { ...current };
    if (typeof body.questionsOn === 'boolean') {
      if (body.questionsOn) delete prefs.questionsOff;
      else prefs.questionsOff = true;
    }
    if (clear !== undefined) prefs = clearBriefAnswer(prefs, clear as BriefQuestionId | 'all');
    return { prefs, value: null };
  });
  if (!saved.ok) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  const prefs = saved.prefs;
  return NextResponse.json(view(prefs));
}
