import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireDeskArtistPitch } from '../../../_shared';
import {
  DESK_ASK_LIMIT_PER_HOUR,
  countRecentAsks,
  deskPitchFacts,
  escalateDeskQuestion,
  findAnsweredRepeat,
  loadCuratorName,
  loadDeskTerms,
  loadPitchQuestions,
  recordDeskAnswer,
} from '@/lib/front-desk/server';
import { isDeskLive } from '@/lib/front-desk/terms';
import { answerDeskQuestion } from '@/lib/front-desk/answer';
import { cleanQuestion } from '@/lib/front-desk/text';
import { formatDeskDay } from '@/lib/front-desk/format';
import type { DeskAnswer } from '@/lib/front-desk/types';

// Screen 13/15: an artist asks about ONE pitch. The answer comes from the
// deterministic engine (lib/front-desk/answer.ts), never a model, so it can only
// say what the facts say, and it always carries its source.
//
// Escalation (screen 15): when the facts do not answer it and a question is
// already open on this pitch, the new one JOINS it (one message for the
// curator, decision 3's daily digest); an exact repeat is not re-sent. With no
// open question the artist decides: the reply carries a clean draft and the
// escalate route sends it on their tap.
export async function POST(request: NextRequest, context: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await context.params;
  const auth = await requireDeskArtistPitch(request, pitchId);
  if ('error' in auth && auth.error) return auth.error;
  const { pitch, adminClient, user } = auth;

  const body = await readJson(request);
  const question = cleanQuestion(body.question);
  if (!question) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });

  try {
    if ((await countRecentAsks(adminClient, pitch.id, user.id)) >= DESK_ASK_LIMIT_PER_HOUR) {
      return NextResponse.json({ error: "That's a lot of questions. Try again in an hour." }, { status: 429 });
    }

    const [record, curatorName, questions] = await Promise.all([
      loadDeskTerms(adminClient, pitch.curatorUserId),
      loadCuratorName(adminClient, pitch.curatorUserId),
      loadPitchQuestions(adminClient, pitch.id),
    ]);
    if (!isDeskLive(record.enabled, record.terms)) {
      return NextResponse.json({ error: `${curatorName} answers questions themselves.`, off: true }, { status: 409 });
    }

    // Asked and answered before on THIS pitch: the curator's own words, cited.
    const repeat = findAnsweredRepeat(questions, question);
    let result: DeskAnswer | null;
    if (repeat?.question.curatorAnswer) {
      const day = formatDeskDay(repeat.question.answeredAt);
      result = {
        kind: 'answer',
        intent: 'answered_before',
        lead: `${curatorName} said:`,
        rest: `“${repeat.question.curatorAnswer}”`,
        source: { kind: 'thread', label: day ? `Their reply · ${day}` : 'Their reply' },
      };
    } else {
      result = answerDeskQuestion({ curatorName, terms: record.terms, pitch: deskPitchFacts(pitch, questions) }, question);
    }
    if (!result) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });

    if (result.kind === 'answer') {
      await recordDeskAnswer(adminClient, {
        pitchId: pitch.id,
        curatorUserId: pitch.curatorUserId,
        askedBy: user.id,
        intent: result.intent,
        question,
        answer: `${result.lead} ${result.rest}`.trim(),
        sourceKind: result.source.kind,
        sourceLabel: result.source.label,
      }).catch(() => undefined);
      return NextResponse.json({ answer: result });
    }

    const open = questions.find((item) => item.status === 'open');
    if (open) {
      const joined = await escalateDeskQuestion(adminClient, {
        pitchId: pitch.id,
        curatorUserId: pitch.curatorUserId,
        askedBy: user.id,
        text: result.draft,
      });
      if (joined.ok) {
        return NextResponse.json({
          answer: result,
          joined: { repeat: joined.repeat, full: joined.full, items: joined.question.items.map((item) => item.text) },
        });
      }
    }
    return NextResponse.json({ answer: result });
  } catch {
    return NextResponse.json({ error: "I can't load this pitch right now, so I won't guess." }, { status: 500 });
  }
}
