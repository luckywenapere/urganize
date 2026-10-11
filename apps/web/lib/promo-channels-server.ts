// The database side of the promo channel directory (GitHub #833). Every write
// is a service-role call from a route: the table's only policy is a select of
// listed rows, so a signed-in client can read the directory and change nothing.
//
// A missing table (the migration not applied yet) reads as "not ready" and the
// screens show a quiet empty state; see isMissingTableError in lib/promo-channels.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PROMO_CHANNEL_COLUMNS,
  isMissingTableError,
  toPromoChannel,
  type PromoChannel,
  type PromoChannelRow,
  type PromoSuggestionInput,
} from '@/lib/promo-channels';

export const PROMO_CHANNELS_TABLE = 'promo_channels';

/** A listed directory is small (tens of rows); this is a ceiling, not a page. */
const LIST_LIMIT = 500;

export type PromoDirectoryRead =
  | { ok: true; channels: PromoChannel[] }
  | { ok: false; reason: 'not_ready' | 'error'; message: string };

export async function listListedPromoChannels(admin: SupabaseClient): Promise<PromoDirectoryRead> {
  const { data, error } = await admin
    .from(PROMO_CHANNELS_TABLE)
    .select(PROMO_CHANNEL_COLUMNS)
    .eq('status', 'listed')
    .order('name', { ascending: true })
    .limit(LIST_LIMIT);
  if (error) {
    if (isMissingTableError(error)) return { ok: false, reason: 'not_ready', message: 'Promo channels are not set up yet.' };
    return { ok: false, reason: 'error', message: error.message };
  }
  const channels = ((data || []) as PromoChannelRow[])
    .map(toPromoChannel)
    .filter((channel): channel is PromoChannel => channel !== null);
  return { ok: true, channels };
}

/** The rollout's genre from its metadata row, or null. Best effort: a failed
 *  read means no genre, never an error, because it only ranks suggestions. */
export async function loadReleaseGenre(admin: SupabaseClient, releaseId: string): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('release_metadata')
      .select('genre')
      .eq('release_id', releaseId)
      .maybeSingle();
    if (error || !data) return null;
    const genre = (data as { genre?: unknown }).genre;
    return typeof genre === 'string' && genre.trim() ? genre.trim() : null;
  } catch {
    return null;
  }
}

/** Pending suggestions one person may have waiting at once. */
export const MAX_PENDING_SUGGESTIONS_PER_USER = 10;

export type PromoSuggestionResult =
  | { ok: true; id: string }
  | { ok: false; status: number; message: string };

export async function createPromoSuggestion(
  admin: SupabaseClient,
  userId: string,
  input: PromoSuggestionInput
): Promise<PromoSuggestionResult> {
  const { count, error: countError } = await admin
    .from(PROMO_CHANNELS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('suggested_by', userId)
    .eq('status', 'pending');
  if (countError) {
    if (isMissingTableError(countError)) {
      return { ok: false, status: 503, message: 'Suggestions are not open yet. Try again soon.' };
    }
    return { ok: false, status: 500, message: 'Could not send your suggestion.' };
  }
  if (count === null) return { ok: false, status: 500, message: 'Could not send your suggestion.' };
  if (count >= MAX_PENDING_SUGGESTIONS_PER_USER) {
    return { ok: false, status: 429, message: 'You have 10 suggestions waiting. We will review them first.' };
  }

  const { data, error } = await admin
    .from(PROMO_CHANNELS_TABLE)
    .insert({
      name: input.name,
      kind: input.kind,
      country: input.country,
      url: input.url,
      how_to_submit: input.howToSubmit,
      suggestion_note: input.note,
      status: 'pending',
      suggested_by: userId,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, status: 500, message: 'Could not send your suggestion.' };
  return { ok: true, id: String((data as { id: string }).id) };
}

// ── Admin ──────────────────────────────────────────────────────────────────

export type AdminPromoChannel = PromoChannel & {
  status: 'listed' | 'pending' | 'rejected';
  suggestionNote: string | null;
  suggestedByEmail: string | null;
  createdAt: string;
};

export type AdminPromoPayload = {
  ready: boolean;
  pending: AdminPromoChannel[];
  listed: AdminPromoChannel[];
};

type AdminRow = PromoChannelRow & {
  status: string;
  suggestion_note: string | null;
  suggested_by: string | null;
  created_at: string;
};

export async function loadAdminPromoChannels(admin: SupabaseClient): Promise<AdminPromoPayload> {
  const { data, error } = await admin
    .from(PROMO_CHANNELS_TABLE)
    .select(`${PROMO_CHANNEL_COLUMNS},status,suggestion_note,suggested_by,created_at`)
    .in('status', ['pending', 'listed'])
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    if (isMissingTableError(error)) return { ready: false, pending: [], listed: [] };
    throw new Error(error.message);
  }
  const rows = (data || []) as AdminRow[];

  const suggesterIds = [...new Set(rows.map((row) => row.suggested_by).filter((id): id is string => Boolean(id)))];
  const emails = new Map<string, string>();
  if (suggesterIds.length) {
    const { data: profiles } = await admin.from('profiles').select('id,email').in('id', suggesterIds);
    for (const profile of (profiles || []) as Array<{ id: string; email: string | null }>) {
      if (profile.email) emails.set(profile.id, profile.email);
    }
  }

  const mapped = rows
    .map((row): AdminPromoChannel | null => {
      const channel = toPromoChannel(row);
      if (!channel) return null;
      const status = row.status === 'listed' ? 'listed' : row.status === 'rejected' ? 'rejected' : 'pending';
      return {
        ...channel,
        status,
        suggestionNote: row.suggestion_note || null,
        suggestedByEmail: row.suggested_by ? emails.get(row.suggested_by) ?? null : null,
        createdAt: row.created_at,
      };
    })
    .filter((row): row is AdminPromoChannel => row !== null);

  return {
    ready: true,
    pending: mapped.filter((row) => row.status === 'pending'),
    listed: mapped.filter((row) => row.status === 'listed').sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type PromoReviewDecision = 'list' | 'reject' | 'unlist';

/**
 * Approve, reject or take down a channel. Only moves a row from the state the
 * decision expects (a pending row to listed or rejected, a listed row to
 * rejected), so two admins acting at once cannot undo each other silently.
 */
export async function reviewPromoChannel(
  admin: SupabaseClient,
  id: string,
  decision: PromoReviewDecision,
  adminUserId: string
): Promise<boolean> {
  const from = decision === 'unlist' ? 'listed' : 'pending';
  const to = decision === 'list' ? 'listed' : 'rejected';
  const { data, error } = await admin
    .from(PROMO_CHANNELS_TABLE)
    .update({ status: to, reviewed_at: new Date().toISOString(), reviewed_by: adminUserId })
    .eq('id', id)
    .eq('status', from)
    .select('id');
  if (error) return false;
  return Array.isArray(data) && data.length === 1;
}
