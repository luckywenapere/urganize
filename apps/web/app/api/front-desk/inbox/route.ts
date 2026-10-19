import { NextRequest, NextResponse } from 'next/server';
import { requireDeskCurator } from '../_shared';
import { DESK_ANSWERS_TABLE, DESK_QUESTIONS_TABLE, toDeskQuestion } from '@/lib/front-desk/server';

// Screen 16 inbox: the curator's own pitches that have front desk activity,
// with "1 question for you" or a quiet "UrgAns answered 3". Curator-safe
// columns only (no release, owner or team data).
export async function GET(request: NextRequest) {
  const auth = await requireDeskCurator(request);
  if ('error' in auth && auth.error) return auth.error;
  const { adminClient, user } = auth;
  try {
    const [{ data: questions, error: qError }, { data: answers, error: aError }] = await Promise.all([
      adminClient
        .from(DESK_QUESTIONS_TABLE)
        .select('id,pitch_id,items,status,curator_answer,proposed_rule,rule_decision,created_at,answered_at,last_item_at')
        .eq('curator_user_id', user.id)
        .order('last_item_at', { ascending: false })
        .limit(200),
      adminClient
        .from(DESK_ANSWERS_TABLE)
        .select('pitch_id')
        .eq('curator_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(2000),
    ]);
    if (qError || aError) throw new Error('read');

    const answeredByPitch = new Map<string, number>();
    for (const row of (answers as Array<{ pitch_id: string }> | null) ?? []) {
      answeredByPitch.set(row.pitch_id, (answeredByPitch.get(row.pitch_id) ?? 0) + 1);
    }
    const openByPitch = new Map<string, number>();
    const lastAt = new Map<string, string>();
    for (const raw of (questions as Record<string, unknown>[] | null) ?? []) {
      const question = toDeskQuestion(raw);
      if (question.status === 'open') openByPitch.set(question.pitchId, question.items.length);
      const at = String(raw.last_item_at || question.createdAt);
      if (!lastAt.has(question.pitchId) || at > (lastAt.get(question.pitchId) as string)) lastAt.set(question.pitchId, at);
    }
    const pitchIds = Array.from(new Set([...answeredByPitch.keys(), ...openByPitch.keys()]));
    if (!pitchIds.length) return NextResponse.json({ pitches: [] });

    const { data: pitches, error: pError } = await adminClient
      .from('playlist_pitches')
      .select('id,song_title,artist_name,playlist_name,status,created_at')
      .eq('curator_user_id', user.id)
      .in('id', pitchIds.slice(0, 200));
    if (pError) throw new Error('read');

    const rows = ((pitches as Record<string, unknown>[] | null) ?? []).map((row) => {
      const id = String(row.id);
      return {
        id,
        songTitle: String(row.song_title || ''),
        artistName: String(row.artist_name || ''),
        service: String(row.playlist_name || ''),
        openItems: openByPitch.get(id) ?? 0,
        answered: answeredByPitch.get(id) ?? 0,
        lastAt: lastAt.get(id) ?? String(row.created_at || ''),
      };
    });
    // Questions for you first, then the quiet ones, newest first within each.
    rows.sort((a, b) => (b.openItems > 0 ? 1 : 0) - (a.openItems > 0 ? 1 : 0) || (a.lastAt < b.lastAt ? 1 : -1));
    return NextResponse.json({ pitches: rows });
  } catch {
    return NextResponse.json({ error: 'Could not load your questions.' }, { status: 500 });
  }
}
