import { daysUntilDate } from './state';
import type { HomePitchItem, HomePlacements, PitchStatusValue } from './types';

export type RawPitchInput = {
  id: string;
  releaseId: string | null;
  releaseTitle: string | null;
  playlistName: string;
  curatorName: string | null;
  songTitle: string;
  status: PitchStatusValue;
  createdAt: string;
};

/**
 * Placements, from the sent-pitches list.
 *
 * `added` -> Placed. `new`/`listened` -> Under review. `passed` appears in
 * neither list — a passed pitch is neither a placement nor something still
 * pending, so it has no honest home on this card; it stays visible on the
 * team's own Pitching page.
 *
 * There is no recorded "answered at" time (the mapping report's own finding),
 * so `sentDaysAgo` is always measured from `createdAt`, never from when a
 * curator actually answered.
 */
export function buildPlacements(pitches: readonly RawPitchInput[], now: Date = new Date()): HomePlacements {
  const placed: HomePitchItem[] = [];
  const underReview: HomePitchItem[] = [];

  for (const pitch of pitches) {
    const daysAgo = daysUntilDate(pitch.createdAt.slice(0, 10), now);
    const item: HomePitchItem = {
      id: pitch.id,
      releaseId: pitch.releaseId,
      releaseTitle: pitch.releaseTitle,
      playlistName: pitch.playlistName,
      curatorName: pitch.curatorName,
      songTitle: pitch.songTitle,
      status: pitch.status,
      sentDaysAgo: Math.max(0, -(daysAgo ?? 0)),
    };

    if (pitch.status === 'added') {
      placed.push(item);
    } else if (pitch.status === 'new' || pitch.status === 'listened') {
      underReview.push(item);
    }
  }

  return { placed, underReview };
}
