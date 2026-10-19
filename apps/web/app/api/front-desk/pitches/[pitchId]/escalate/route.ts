import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireDeskArtistPitch } from '../../../_shared';
import { escalateDeskQuestion, loadDeskTerms } from '@/lib/front-desk/server';
import { isDeskLive } from '@/lib/front-desk/terms';
import { cleanQuestion } from '@/lib/front-desk/text';

// Screen 15: "Ask <curator>" → "Send question". Adds the artist's (edited) draft
// to the pitch's one open question. The curator hears about it in the next
// daily digest, never as an instant ping.
export async function POST(request: NextRequest, context: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await context.params;
  const auth = await requireDeskArtistPitch(request, pitchId);
  if ('error' in auth && auth.error) return auth.error;
  const { pitch, adminClient, user } = auth;

  const body = await readJson(request);
  const text = cleanQuestion(body.question);
  if (text.length < 3) return NextResponse.json({ error: 'Write the question first.' }, { status: 400 });

  try {
    const record = await loadDeskTerms(adminClient, pitch.curatorUserId);
    if (!isDeskLive(record.enabled, record.terms)) {
      return NextResponse.json({ error: 'Message them directly instead.', off: true }, { status: 409 });
    }
    const result = await escalateDeskQuestion(adminClient, {
      pitchId: pitch.id,
      curatorUserId: pitch.curatorUserId,
      askedBy: user.id,
      text,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({
      repeat: result.repeat,
      full: result.full,
      openQuestion: { id: result.question.id, items: result.question.items.map((item) => item.text) },
    });
  } catch {
    return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 500 });
  }
}
