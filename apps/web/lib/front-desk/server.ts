// Server side of the UrgAns front desk. Service-role reads and writes only (the
// three front desk tables have RLS on and no policies), so EVERY function here
// takes ids the caller has already authorised:
//   - artist side: a pitch id whose release the user can see (ensureReleaseVisible)
//   - curator side: the signed-in curator's own user id
// Nothing here ever lists across pitches for an artist, and nothing returns
// release, owner or team data to a curator (the playlist_pitches denormalised
// columns only, the same rule as the curator inbox).

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DeskAnsweredItem,
  DeskOpenQuestion,
  DeskPitchFacts,
  DeskPitchStatus,
  DeskQuestionItem,
  DeskSourceKind,
  DeskTerms,
} from './types';
import { EMPTY_DESK_TERMS, parseDeskTerms } from './terms';
import { cleanQuestion, isRepeatQuestion, mergeOpenItems, normaliseQuestion, draftQuestion } from './text';

export const DESK_TERMS_TABLE = 'curator_desk_terms';
export const DESK_QUESTIONS_TABLE = 'pitch_desk_questions';
export const DESK_ANSWERS_TABLE = 'pitch_desk_answers';

/** Asks per person per pitch per hour. Generous for a person, a wall for a script. */
export const DESK_ASK_LIMIT_PER_HOUR = 40;

/** The pitch columns the front desk reads: the curator-safe denormalised set plus the release id for the artist gate. */
export const DESK_PITCH_COLUMNS =
  'id,release_id,curator_user_id,playlist_name,song_title,artist_name,status,curator_reply,created_at,updated_at,responded_at';

const DESK_STATUSES: DeskPitchStatus[] = ['new', 'listened', 'added', 'passed'];

export type DeskTermsRecord = { exists: boolean; enabled: boolean; terms: DeskTerms; updatedAt: string | null };

export async function loadDeskTerms(admin: SupabaseClient, curatorUserId: string): Promise<DeskTermsRecord> {
  const { data, error } = await admin
    .from(DESK_TERMS_TABLE)
    .select('enabled,terms,updated_at')
    .eq('curator_user_id', curatorUserId)
    .maybeSingle();
  if (error) throw new Error('Could not load the terms.');
  if (!data) return { exists: false, enabled: true, terms: EMPTY_DESK_TERMS, updatedAt: null };
  const row = data as Record<string, unknown>;
  return {
    exists: true,
    enabled: row.enabled !== false,
    terms: parseDeskTerms(row.terms),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function saveDeskTerms(
  admin: SupabaseClient,
  curatorUserId: string,
  enabled: boolean,
  terms: DeskTerms
): Promise<void> {
  const { error } = await admin
    .from(DESK_TERMS_TABLE)
    .upsert({ curator_user_id: curatorUserId, enabled, terms: parseDeskTerms(terms) }, { onConflict: 'curator_user_id' });
  if (error) throw new Error('Could not save the terms.');
}

/**
 * The "From your page" prefill for a curator with no terms yet: genres from
 * their own playlists and the reply window they already set. Their own data only.
 */
export async function loadPagePrefill(
  admin: SupabaseClient,
  curatorUserId: string
): Promise<{ terms: DeskTerms; fromPage: { genres: boolean; timing: boolean } }> {
  const [{ data: playlists }, { data: pricing }] = await Promise.all([
    admin.from('curator_playlists').select('genres').eq('curator_user_id', curatorUserId).limit(100),
    admin.from('curator_pricing').select('response_window_hours').eq('curator_user_id', curatorUserId).maybeSingle(),
  ]);
  const genres = Array.from(
    new Set(
      ((playlists as Array<{ genres?: unknown }> | null) ?? [])
        .flatMap((row) => (Array.isArray(row.genres) ? row.genres.map(String) : []))
        .map((genre) => genre.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
  const hours = Number((pricing as { response_window_hours?: unknown } | null)?.response_window_hours);
  const days = Number.isFinite(hours) && hours > 0 ? Math.max(1, Math.round(hours / 24)) : null;
  const terms = parseDeskTerms({ ...EMPTY_DESK_TERMS, genres, timing: { ...EMPTY_DESK_TERMS.timing, repliesWithinDays: days } });
  return { terms, fromPage: { genres: genres.length > 0, timing: days !== null } };
}

export async function loadCuratorName(admin: SupabaseClient, curatorUserId: string): Promise<string> {
  const { data } = await admin.from('curator_profiles').select('display_name').eq('user_id', curatorUserId).maybeSingle();
  const name = (data as { display_name?: unknown } | null)?.display_name;
  return typeof name === 'string' && name.trim() ? name.trim() : 'The curator';
}

export type DeskPitchRow = {
  id: string;
  releaseId: string;
  curatorUserId: string;
  playlistName: string;
  songTitle: string;
  artistName: string;
  status: string;
  curatorReply: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
};

export const toDeskPitchRow = (row: Record<string, unknown>): DeskPitchRow => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  curatorUserId: String(row.curator_user_id || ''),
  playlistName: String(row.playlist_name || ''),
  songTitle: String(row.song_title || ''),
  artistName: String(row.artist_name || ''),
  status: String(row.status || ''),
  curatorReply: typeof row.curator_reply === 'string' && row.curator_reply.trim() ? row.curator_reply : null,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
  respondedAt: typeof row.responded_at === 'string' ? row.responded_at : null,
});

export async function loadDeskPitch(admin: SupabaseClient, pitchId: string): Promise<DeskPitchRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(pitchId)) return null;
  const { data, error } = await admin.from('playlist_pitches').select(DESK_PITCH_COLUMNS).eq('id', pitchId).maybeSingle();
  if (error) throw new Error('Could not load the pitch.');
  return data ? toDeskPitchRow(data as Record<string, unknown>) : null;
}

/** True for the statuses a front desk can talk about (never unpaid or expired pitches). */
export const isDeskPitchStatus = (status: string): status is DeskPitchStatus =>
  (DESK_STATUSES as string[]).includes(status);

/**
 * The facts of ONE pitch for the engine. A real pitch today has a status and
 * the curator's one reply; it has no agreed fields or thread yet, so the engine
 * answers from terms and status and escalates the rest. Answered front desk
 * questions on THIS pitch are added as curator thread messages.
 */
export function deskPitchFacts(row: DeskPitchRow, answered: DeskOpenQuestion[] = []): DeskPitchFacts {
  const status = isDeskPitchStatus(row.status) ? row.status : 'new';
  return {
    id: row.id,
    songTitle: row.songTitle,
    artistName: row.artistName,
    playlistName: row.playlistName,
    status,
    sentAt: row.createdAt,
    statusAt: status === 'new' ? null : row.respondedAt || row.updatedAt,
    agreed: null,
    thread: answered
      .filter((question) => question.curatorAnswer && question.answeredAt)
      .map((question) => ({ from: 'curator' as const, text: question.curatorAnswer as string, at: question.answeredAt as string })),
  };
}

const toItems = (value: unknown): DeskQuestionItem[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const text = cleanQuestion(row.text);
          return text ? { text, norm: typeof row.norm === 'string' ? row.norm : normaliseQuestion(text), at: String(row.at || '') } : null;
        })
        .filter((item): item is DeskQuestionItem => item !== null)
    : [];

export const toDeskQuestion = (row: Record<string, unknown>): DeskOpenQuestion => ({
  id: String(row.id || ''),
  pitchId: String(row.pitch_id || ''),
  items: toItems(row.items),
  status: row.status === 'answered' ? 'answered' : 'open',
  curatorAnswer: typeof row.curator_answer === 'string' ? row.curator_answer : null,
  proposedRule: typeof row.proposed_rule === 'string' ? row.proposed_rule : null,
  ruleDecision: row.rule_decision === 'added' || row.rule_decision === 'once' ? row.rule_decision : null,
  createdAt: String(row.created_at || ''),
  answeredAt: typeof row.answered_at === 'string' ? row.answered_at : null,
});

const QUESTION_COLUMNS = 'id,pitch_id,items,status,curator_answer,proposed_rule,rule_decision,created_at,answered_at';

/** Every question on ONE pitch, newest first. */
export async function loadPitchQuestions(admin: SupabaseClient, pitchId: string): Promise<DeskOpenQuestion[]> {
  const { data, error } = await admin
    .from(DESK_QUESTIONS_TABLE)
    .select(QUESTION_COLUMNS)
    .eq('pitch_id', pitchId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Could not load questions.');
  return ((data as Record<string, unknown>[] | null) ?? []).map(toDeskQuestion);
}

/** What UrgAns answered on ONE pitch, newest first. */
export async function loadPitchAnswered(admin: SupabaseClient, pitchId: string): Promise<DeskAnsweredItem[]> {
  const { data, error } = await admin
    .from(DESK_ANSWERS_TABLE)
    .select('question,answer,source_kind,source_label,created_at')
    .eq('pitch_id', pitchId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Could not load answers.');
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    question: String(row.question || ''),
    answer: String(row.answer || ''),
    source: { kind: String(row.source_kind || 'terms') as DeskSourceKind, label: String(row.source_label || '') },
    at: String(row.created_at || ''),
  }));
}

export async function recordDeskAnswer(
  admin: SupabaseClient,
  input: { pitchId: string; curatorUserId: string; askedBy: string | null; intent: string; question: string; answer: string; sourceKind: DeskSourceKind; sourceLabel: string }
): Promise<void> {
  // A courtesy log for the curator's "answered N" row; never fails the answer.
  await admin.from(DESK_ANSWERS_TABLE).insert({
    pitch_id: input.pitchId,
    curator_user_id: input.curatorUserId,
    asked_by: input.askedBy,
    intent: input.intent.slice(0, 40),
    question: input.question.slice(0, 300),
    answer: input.answer.slice(0, 600),
    source_kind: input.sourceKind,
    source_label: input.sourceLabel.slice(0, 80),
  });
}

/** How many questions this person asked on this pitch in the last hour (rate limit). */
export async function countRecentAsks(admin: SupabaseClient, pitchId: string, userId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from(DESK_ANSWERS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('pitch_id', pitchId)
    .eq('asked_by', userId)
    .gte('created_at', since);
  return count ?? 0;
}

export type EscalateResult =
  | { ok: true; question: DeskOpenQuestion; repeat: boolean; full: boolean }
  | { ok: false; error: string };

/**
 * Adds a question to the pitch's ONE open escalation, creating it if needed.
 * A repeat of an open item is dropped (the artist is told it's already asked);
 * a new one is appended as the next numbered item. The unique partial index
 * makes two racing first questions safe: the loser re-reads and appends.
 */
export async function escalateDeskQuestion(
  admin: SupabaseClient,
  input: { pitchId: string; curatorUserId: string; askedBy: string | null; text: string }
): Promise<EscalateResult> {
  const text = draftQuestion(input.text);
  if (!text) return { ok: false, error: 'Write the question first.' };
  const now = new Date().toISOString();
  const candidate: DeskQuestionItem = { text, norm: normaliseQuestion(text), at: now };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: openRow, error: readError } = await admin
      .from(DESK_QUESTIONS_TABLE)
      .select(`${QUESTION_COLUMNS},updated_at`)
      .eq('pitch_id', input.pitchId)
      .eq('status', 'open')
      .maybeSingle();
    if (readError) return { ok: false, error: 'Could not send that.' };

    if (!openRow) {
      const { data: inserted, error } = await admin
        .from(DESK_QUESTIONS_TABLE)
        .insert({
          pitch_id: input.pitchId,
          curator_user_id: input.curatorUserId,
          asked_by: input.askedBy,
          items: [candidate],
          status: 'open',
          last_item_at: now,
        })
        .select(QUESTION_COLUMNS)
        .single();
      if (!error && inserted) return { ok: true, question: toDeskQuestion(inserted as Record<string, unknown>), repeat: false, full: false };
      if (error && (error as { code?: string }).code === '23505') continue; // raced: re-read and append
      return { ok: false, error: 'Could not send that.' };
    }

    const open = toDeskQuestion(openRow as Record<string, unknown>);
    const merged = mergeOpenItems(open.items, candidate);
    if (merged.repeatOf !== null) return { ok: true, question: open, repeat: true, full: false };
    if (merged.full) return { ok: true, question: open, repeat: false, full: true };

    // Optimistic: only write if nobody appended since we read (updated_at match).
    const { data: updated, error } = await admin
      .from(DESK_QUESTIONS_TABLE)
      .update({ items: merged.items, last_item_at: now })
      .eq('id', open.id)
      .eq('status', 'open')
      .eq('updated_at', String((openRow as Record<string, unknown>).updated_at || ''))
      .select(QUESTION_COLUMNS)
      .maybeSingle();
    if (error) return { ok: false, error: 'Could not send that.' };
    if (updated) return { ok: true, question: toDeskQuestion(updated as Record<string, unknown>), repeat: false, full: false };
  }
  return { ok: false, error: 'Could not send that. Try again.' };
}

/** A question the curator already answered on this pitch, if the new one repeats it. */
export function findAnsweredRepeat(questions: DeskOpenQuestion[], text: string): { question: DeskOpenQuestion; item: DeskQuestionItem } | null {
  const norm = normaliseQuestion(text);
  for (const question of questions) {
    if (question.status !== 'answered' || !question.curatorAnswer) continue;
    const item = question.items.find((candidate) => isRepeatQuestion(norm, candidate.norm));
    if (item) return { question, item };
  }
  return null;
}
