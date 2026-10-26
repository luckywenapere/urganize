import { formatPitchDate } from '@/lib/pitch-payment-copy';

/**
 * What a curator is told when a team sends a song to one of their playlists
 * (free pitches; paid and credit pitches have their own lines). Pure, so the
 * wording is tested without a database.
 */

export const NEW_PITCH_TITLE = 'New pitch';
export const LATE_PITCH_TITLE = 'Sorry, this pitch is late';
export const NEW_PITCH_CTA = 'Open your inbox';
export const NEW_PITCH_FOOTNOTE = 'You are getting this because you take pitches on Urganize.';

/** The email dedupe key. One per pitch, shared by the live send and the backfill. */
export const newPitchDedupeKey = (pitchId: string): string => `pitch-new-${pitchId}`;

export const newPitchLine = (artist: string, song: string, playlist: string): string =>
  playlist
    ? `${artist} sent you ${song} for ${playlist}. Open your inbox to listen and reply.`
    : `${artist} sent you ${song}. Open your inbox to listen and reply.`;

export const latePitchLine = (artist: string, song: string, sentAt: string | null | undefined): string => {
  const when = formatPitchDate(sentAt);
  return `Sorry, we told you late. ${artist} sent you ${song}${when ? ` on ${when}` : ''} and you should have heard from us then. It is still waiting for you. Open your inbox to listen and reply.`;
};
