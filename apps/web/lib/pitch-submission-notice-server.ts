import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUser } from '@/lib/pitch-payments-server';
import {
  LATE_PITCH_TITLE,
  NEW_PITCH_CTA,
  NEW_PITCH_FOOTNOTE,
  NEW_PITCH_TITLE,
  latePitchLine,
  newPitchDedupeKey,
  newPitchLine,
} from '@/lib/pitch-submission-notice';

const PITCHES_TABLE = 'playlist_pitches';
const EMAIL_LOG_TABLE = 'email_log';

/** Only pitches older than this are swept, so a pitch being sent right now is left to its own live notice. */
const BACKFILL_MIN_AGE_MS = 10 * 60 * 1000;

type PitchRow = {
  id: string;
  curator_user_id: string;
  song_title: string;
  artist_name: string;
  playlist_name: string;
  created_at: string | null;
};

const text = (value: unknown, fallback: string): string => {
  const out = typeof value === 'string' ? value.trim() : '';
  return out || fallback;
};

const toRow = (row: Record<string, unknown>): PitchRow => ({
  id: String(row.id),
  curator_user_id: String(row.curator_user_id || ''),
  song_title: text(row.song_title, 'a song'),
  artist_name: text(row.artist_name, 'An artist'),
  playlist_name: text(row.playlist_name, ''),
  created_at: (row.created_at as string | null) ?? null,
});

/**
 * Tell a curator a free pitch just landed in their inbox: a push and an email.
 * Best effort and never throws (the inbox is the record). The email carries a
 * per-pitch key, so a retry, or the backfill below, can never send a second one.
 */
export async function notifyCuratorOfNewPitch(admin: SupabaseClient, pitchId: string): Promise<void> {
  try {
    const { data } = await admin
      .from(PITCHES_TABLE)
      .select('id,curator_user_id,song_title,artist_name,playlist_name,created_at')
      .eq('id', pitchId)
      .maybeSingle();
    if (!data) return;
    const pitch = toRow(data as Record<string, unknown>);
    await notifyUser(admin, pitch.curator_user_id, {
      title: NEW_PITCH_TITLE,
      body: newPitchLine(pitch.artist_name, pitch.song_title, pitch.playlist_name),
      path: '/curator',
      tag: `pitch-new-${pitch.id}`,
      trigger: 'pitch_new',
      ctaLabel: NEW_PITCH_CTA,
      footnote: NEW_PITCH_FOOTNOTE,
      dedupeKey: newPitchDedupeKey(pitch.id),
    });
  } catch {
    // Best effort.
  }
}

export type MissedPitchNoticeReport = {
  dryRun: boolean;
  /** Free pitches still waiting that no notice was ever sent for. */
  missed: number;
  /** How many of those this call handled (all of them on a dry run). */
  attempted: number;
  sent: number;
  curators: number;
};

/**
 * One-off catch-up (2026-10-26): free pitches never told the curator anything,
 * so every one still waiting gets the late notice with an apology. Pitches that
 * were already answered are left alone, and so is any pitch whose email key is
 * already on the log, which makes running this twice harmless.
 */
export async function sendMissedPitchNotices(
  admin: SupabaseClient,
  options: { dryRun: boolean; limit?: number; now?: number }
): Promise<MissedPitchNoticeReport> {
  const cutoff = new Date((options.now ?? Date.now()) - BACKFILL_MIN_AGE_MS).toISOString();
  const { data, error } = await admin
    .from(PITCHES_TABLE)
    .select('id,curator_user_id,song_title,artist_name,playlist_name,created_at')
    .eq('payment_kind', 'free')
    .eq('status', 'new')
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);

  const pitches = ((data || []) as Array<Record<string, unknown>>).map(toRow).filter((row) => row.curator_user_id);
  const keys = pitches.map((row) => newPitchDedupeKey(row.id));
  const already = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data: logged, error: logError } = await admin
      .from(EMAIL_LOG_TABLE)
      .select('dedupe_key')
      .in('dedupe_key', keys.slice(i, i + 200));
    if (logError) throw new Error(logError.message);
    for (const row of (logged || []) as Array<Record<string, unknown>>) already.add(String(row.dedupe_key));
  }

  const missed = pitches.filter((row) => !already.has(newPitchDedupeKey(row.id)));
  const batch = missed.slice(0, Math.max(1, options.limit ?? 50));
  const report: MissedPitchNoticeReport = {
    dryRun: options.dryRun,
    missed: missed.length,
    attempted: batch.length,
    sent: 0,
    curators: new Set(batch.map((row) => row.curator_user_id)).size,
  };
  if (options.dryRun) return report;

  for (const pitch of batch) {
    await notifyUser(admin, pitch.curator_user_id, {
      title: LATE_PITCH_TITLE,
      body: latePitchLine(pitch.artist_name, pitch.song_title, pitch.created_at),
      path: '/curator',
      tag: `pitch-new-${pitch.id}`,
      trigger: 'pitch_new_late',
      ctaLabel: NEW_PITCH_CTA,
      footnote: NEW_PITCH_FOOTNOTE,
      dedupeKey: newPitchDedupeKey(pitch.id),
    });
    report.sent += 1;
  }
  return report;
}
