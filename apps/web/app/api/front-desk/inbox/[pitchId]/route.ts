import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireDeskCuratorPitch } from '../../_shared';
import {
  DESK_QUESTIONS_TABLE,
  loadDeskTerms,
  loadPitchAnswered,
  loadPitchQuestions,
  saveDeskTerms,
  toDeskQuestion,
} from '@/lib/front-desk/server';
import { MAX_DESK_QUESTION_LENGTH } from '@/lib/front-desk/text';
import { addLearnedRule, proposeRuleFromAnswer } from '@/lib/front-desk/terms';

// Screen 16, one pitch on the curator's side: what UrgAns answered (quiet row),
// the one open question, the reply, and the one-tap "Add to my terms".
export async function GET(request: NextRequest, context: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await context.params;
  const auth = await requireDeskCuratorPitch(request, pitchId);
  if ('error' in auth && auth.error) return auth.error;
  const { pitch, adminClient } = auth;
  try {
    const [answered, questions] = await Promise.all([
      loadPitchAnswered(adminClient, pitch.id),
      loadPitchQuestions(adminClient, pitch.id),
    ]);
    const open = questions.find((question) => question.status === 'open') ?? null;
    // The latest answered one whose rule is still undecided: the learn prompt.
    const learn = questions.find((question) => question.status === 'answered' && question.proposedRule && !question.ruleDecision) ?? null;
    return NextResponse.json({
      pitch: { id: pitch.id, songTitle: pitch.songTitle, artistName: pitch.artistName, service: pitch.playlistName, status: pitch.status },
      answered,
      openQuestion: open,
      learn,
    });
  } catch {
    return NextResponse.json({ error: 'Could not load this pitch.' }, { status: 500 });
  }
}

const MAX_ANSWER = 600;

/**
 * POST { action: 'answer', questionId, answer }  → closes the open question with the curator's words
 * POST { action: 'rule', questionId, decision: 'added' | 'once', text? } → the one tap (decision 4)
 */
export async function POST(request: NextRequest, context: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await context.params;
  const auth = await requireDeskCuratorPitch(request, pitchId);
  if ('error' in auth && auth.error) return auth.error;
  const { pitch, adminClient, user } = auth;
  const body = await readJson(request);
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  try {
    if (body.action === 'answer') {
      const answer = typeof body.answer === 'string' ? body.answer.replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER) : '';
      if (answer.length < 2) return NextResponse.json({ error: 'Write your reply first.' }, { status: 400 });
      const { data, error } = await adminClient
        .from(DESK_QUESTIONS_TABLE)
        .update({
          status: 'answered',
          curator_answer: answer,
          proposed_rule: proposeRuleFromAnswer(answer).slice(0, 160) || null,
          answered_at: new Date().toISOString(),
        })
        .eq('id', questionId)
        .eq('pitch_id', pitch.id)
        .eq('curator_user_id', user.id)
        .eq('status', 'open')
        .select('id,pitch_id,items,status,curator_answer,proposed_rule,rule_decision,created_at,answered_at')
        .maybeSingle();
      if (error) throw new Error('write');
      if (!data) return NextResponse.json({ error: 'That question was already answered.' }, { status: 409 });
      return NextResponse.json({ question: toDeskQuestion(data as Record<string, unknown>) });
    }

    if (body.action === 'rule') {
      const decision = body.decision === 'added' ? 'added' : body.decision === 'once' ? 'once' : null;
      if (!decision) return NextResponse.json({ error: 'Pick one.' }, { status: 400 });
      const questions = await loadPitchQuestions(adminClient, pitch.id);
      const question = questions.find((item) => item.id === questionId && item.status === 'answered');
      if (!question) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      const text =
        typeof body.text === 'string' && body.text.trim()
          ? body.text.replace(/\s+/g, ' ').trim().slice(0, Math.min(160, MAX_DESK_QUESTION_LENGTH))
          : question.proposedRule || '';
      if (decision === 'added') {
        if (!text) return NextResponse.json({ error: 'Write the rule first.' }, { status: 400 });
        const record = await loadDeskTerms(adminClient, user.id);
        const next = addLearnedRule(record.terms, text, new Date().toISOString());
        await saveDeskTerms(adminClient, user.id, record.enabled, next);
      }
      const { error } = await adminClient
        .from(DESK_QUESTIONS_TABLE)
        .update({ rule_decision: decision, proposed_rule: text || null })
        .eq('id', questionId)
        .eq('curator_user_id', user.id);
      if (error) throw new Error('write');
      return NextResponse.json({ decision, rule: text });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }
}
