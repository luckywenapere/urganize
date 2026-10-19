import { NextRequest, NextResponse } from 'next/server';
import { requireDeskArtistPitch } from '../../_shared';
import { deskPitchFacts, loadCuratorName, loadDeskTerms, loadPitchQuestions } from '@/lib/front-desk/server';
import { isDeskLive } from '@/lib/front-desk/terms';
import { agreedNowRows, suggestedDeskQuestions } from '@/lib/front-desk/answer';

// Screen 13, artist side: what the "Ask about this pitch" card needs for ONE
// pitch the caller's team sent. Never another pitch, never the curator's inbox.
export async function GET(request: NextRequest, context: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await context.params;
  const auth = await requireDeskArtistPitch(request, pitchId);
  if ('error' in auth && auth.error) return auth.error;
  const { pitch, adminClient } = auth;
  try {
    const [record, curatorName, questions] = await Promise.all([
      loadDeskTerms(adminClient, pitch.curatorUserId),
      loadCuratorName(adminClient, pitch.curatorUserId),
      loadPitchQuestions(adminClient, pitch.id),
    ]);
    const facts = { curatorName, terms: record.terms, pitch: deskPitchFacts(pitch, questions) };
    const open = questions.find((question) => question.status === 'open') ?? null;
    const answered = questions.filter((question) => question.status === 'answered' && question.curatorAnswer).slice(0, 5);
    return NextResponse.json({
      live: isDeskLive(record.enabled, record.terms),
      curatorName,
      pitch: {
        id: pitch.id,
        songTitle: pitch.songTitle,
        artistName: pitch.artistName,
        playlistName: pitch.playlistName,
        status: facts.pitch.status,
      },
      agreedNow: agreedNowRows(facts),
      suggestions: suggestedDeskQuestions(facts),
      openQuestion: open ? { id: open.id, items: open.items.map((item) => item.text), createdAt: open.createdAt } : null,
      answered: answered.map((question) => ({
        items: question.items.map((item) => item.text),
        answer: question.curatorAnswer,
        answeredAt: question.answeredAt,
      })),
    });
  } catch {
    return NextResponse.json({ error: "I can't load this pitch right now." }, { status: 500 });
  }
}
