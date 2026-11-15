import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { applyBriefAnswer, type BriefAnswerResult } from '@/lib/chappi/brief-questions';
import { readStoredBrief, updateBriefPrefs } from '@/lib/chappi/brief-answers-server';
import { lagosDateKey } from '@/lib/chappi/morning-brief';

/**
 * A tap on the morning brief's question (#1314). Body: { date, choiceId },
 * where choiceId is one of the stored question's choices or "skip".
 *
 * The question is read from the brief the server stored, never from the
 * browser, so only an answer that question offered is saved. Only today's
 * question can be answered, once. Returns the words for the person's turn and
 * the reply, which the chat adds as two messages. When it was already answered
 * on another tab or device, returns that answer (`already: true`) so this chat
 * can show it. A closed question answers 409 with `closed: true`.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth && auth.error) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { date?: unknown; choiceId?: unknown } | null;
  const date = typeof body?.date === 'string' ? body.date : '';
  const choiceId = typeof body?.choiceId === 'string' ? body.choiceId : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !choiceId || choiceId.length > 64) {
    return NextResponse.json({ error: 'A date and an answer are required.' }, { status: 400 });
  }
  const closed = () => NextResponse.json({ error: 'This question has closed.', closed: true }, { status: 409 });
  if (date !== lagosDateKey(new Date())) return closed();

  const userId = auth.user.id;
  const brief = await readStoredBrief(admin, userId, date);
  const question = brief?.question;
  if (!question) return closed();

  const saved = await updateBriefPrefs<BriefAnswerResult>(admin, userId, (current) => {
    const result = applyBriefAnswer(current, question, choiceId, date);
    return { prefs: result.ok && !result.already ? result.prefs : null, value: result };
  });
  if (!saved.ok) return NextResponse.json({ error: 'Could not save your answer. Try again.' }, { status: 500 });
  const result = saved.value;
  if (!result.ok) return NextResponse.json({ error: result.error, closed: Boolean(result.closed) }, { status: 409 });
  return NextResponse.json({ label: result.label, ack: result.ack, already: Boolean(result.already) });
}
