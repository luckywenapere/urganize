import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError } from './promo-channels';
import { isValidNextMoveKey } from './next-moves';
import { PITCHES_TABLE } from './pitch-payments-server';

// The stored half of next moves (URG-259): which moves a person dismissed, and
// the two pitch facts the rollout page needs. Everything else about a move is
// worked out in the browser (lib/next-moves.ts).
//
// It never throws. Before the migration is applied the table is missing: reads
// answer "nothing dismissed" and a write reports `stored: false`, so the
// browser's own copy still keeps the card away on that device.

export const NEXT_MOVE_DISMISSALS_TABLE = 'next_move_dismissals';
/** Enough for every rollout a person will ever have open at once. */
export const NEXT_MOVE_DISMISSALS_READ_LIMIT = 500;

export async function readNextMoveDismissals(adminClient: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await adminClient
    .from(NEXT_MOVE_DISMISSALS_TABLE)
    .select('move_key')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(NEXT_MOVE_DISMISSALS_READ_LIMIT);
  if (error) {
    if (!isMissingTableError(error)) console.error('[next-moves] read failed:', error.message);
    return [];
  }
  return ((data || []) as Array<{ move_key: unknown }>)
    .map((row) => String(row.move_key || ''))
    .filter((key) => isValidNextMoveKey(key));
}

export type DismissResult = { ok: true; stored: boolean } | { ok: false; status: 400; error: string };

export async function dismissNextMove(adminClient: SupabaseClient, userId: string, rawKey: unknown): Promise<DismissResult> {
  if (!isValidNextMoveKey(rawKey)) return { ok: false, status: 400, error: 'Unknown move.' };
  const key = rawKey.toLowerCase();
  const { error } = await adminClient
    .from(NEXT_MOVE_DISMISSALS_TABLE)
    .upsert({ user_id: userId, move_key: key }, { onConflict: 'user_id,move_key', ignoreDuplicates: true });
  if (error) {
    if (!isMissingTableError(error)) console.error('[next-moves] dismiss failed:', error.message);
    return { ok: true, stored: false };
  }
  return { ok: true, stored: true };
}

/** How many pitches a rollout has, and how long ago the newest one went out. */
export async function readRolloutPitchFacts(
  adminClient: SupabaseClient,
  releaseId: string,
  now: Date = new Date()
): Promise<{ count: number; lastSentDaysAgo: number | null } | null> {
  const { data, error, count } = await adminClient
    .from(PITCHES_TABLE)
    .select('created_at', { count: 'exact' })
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    if (!isMissingTableError(error)) console.error('[next-moves] pitch read failed:', error.message);
    return null;
  }
  const newest = ((data || []) as Array<{ created_at: unknown }>)[0];
  const sent = newest ? Date.parse(String(newest.created_at || '')) : Number.NaN;
  return {
    count: count ?? (newest ? 1 : 0),
    lastSentDaysAgo: Number.isNaN(sent) ? null : Math.max(0, Math.floor((now.getTime() - sent) / 86_400_000)),
  };
}
