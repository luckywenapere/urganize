import { NextRequest, NextResponse } from 'next/server';
import {
  CURATOR_PITCH_COLUMNS,
  CURATOR_PITCH_LIST_LIMIT,
  PITCHES_TABLE,
  flagOffResponse,
  isPitchingFeatureEnabled,
  requireCuratorUser,
  toCuratorPitch,
} from '../_shared';

/**
 * The curator inbox: every pitch sent to their playlists, newest first.
 *
 * Note the column list — CURATOR_PITCH_COLUMNS selects no release id, no owner
 * id, no playlist id. Everything the card shows is denormalized onto the pitch
 * row, so this read cannot reach team data even by accident.
 *
 * No status filter param: the client holds the inbox and filters in memory, the
 * same call the notes list makes.
 */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.adminClient
    .from(PITCHES_TABLE)
    .select(CURATOR_PITCH_COLUMNS)
    .eq('curator_user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(CURATOR_PITCH_LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load your pitches.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    pitches: (data || []).map((row) => toCuratorPitch(row as Record<string, unknown>)),
  });
}
