import type { SupabaseClient } from '@supabase/supabase-js';
import { getCreditSnapshot } from '@/lib/credits/credits-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { STRIKE_LIMIT, STRIKE_WINDOW_DAYS, PITCH_REMINDER_LEAD_HOURS } from '@/lib/pitch-payments';
import { notifyUser } from '@/lib/pitch-payments-server';
import { INBOX_PAUSED } from '@/lib/pitch-payment-copy';
import {
  CREDIT_PITCH_REPLY_DAYS,
  creditRefundNotice,
  curatorEarningKobo,
  curatorMissedLine,
  curatorReminderLine,
  newPaidPitchLine,
} from '@/lib/pitch-credits';
import { MAX_WAITING_PITCHES_PER_RELEASE } from '@/lib/pitching';
import type { CreditAccount } from '@/lib/credits/allowance';

/**
 * Pitch on credits, the server half (URG-345). The pure rules and the copy are
 * in lib/pitch-credits.ts; the charge itself is the database function
 * send_credit_pitches() in supabase/migrations/20261017120000_pitch_credits.sql.
 *
 * WHICH TEAM PAYS: the caller's primary team, the same one /api/credits/checkout
 * credits a top-up to and UrgAns charges, so a top-up bought from the pitch
 * sheet lands in exactly the balance the pitch is then paid from.
 *
 * BEFORE THE MIGRATION: every read here tolerates the missing column or
 * function (42703 / PGRST202 / 42883) by answering "everything is Free", so the
 * code can reach production before the migration without breaking the free
 * pitch path. The founder applies the migration first anyway.
 */

const PITCHES_TABLE = 'playlist_pitches';
const PROFILES_TABLE = 'curator_profiles';

export type TeamCredits = {
  workspaceId: string;
  ownerUserId: string | null;
  balance: number;
  account: CreditAccount;
  /** Only the owner or an admin may buy credits for the team. */
  canBuy: boolean;
};

/** The caller's team and its credit balance, or null when it cannot be read. */
export async function readTeamCredits(
  admin: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<TeamCredits | null> {
  const team = await getTeamAccessForUser(user.id, user.email);
  if (!team.primaryWorkspaceId) return null;
  const snapshot = await getCreditSnapshot(admin, {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    team,
  });
  if (!snapshot) return null;
  return {
    workspaceId: team.primaryWorkspaceId,
    ownerUserId: team.ownerUserId,
    balance: Math.max(0, snapshot.total),
    account: snapshot.account,
    canBuy: team.isOwnerOrAdmin,
  };
}

/** Postgres / PostgREST answers that only a database without the migration gives. */
export function isMissingSchema(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === '42883' || error.code === 'PGRST202' || error.code === '42P01';
}

export type CreditPitchItem = {
  playlist_id: string;
  release_id: string;
  release_owner_id: string;
  pitcher_name: string;
  song_title: string;
  artist_name: string;
  song_url: string;
  song_platform: string | null;
  note: string;
  curator_name: string;
};

export type SendOutcome =
  | { result: 'sent'; pitchIds: string[]; charged: number; balanceAfter: number }
  | { result: 'insufficient'; needed: number; balance: number; short: number }
  | { result: 'at_limit' }
  | { result: 'duplicate' }
  | { result: 'not_found' }
  | { result: 'paused' }
  | { result: 'unmigrated' }
  | { result: 'error'; message: string };

/** One call to send_credit_pitches(). Never throws. */
export async function sendCreditPitches(
  admin: SupabaseClient,
  input: {
    workspaceId: string;
    ownerUserId: string | null;
    actorUserId: string;
    requestId: string;
    items: CreditPitchItem[];
    now?: Date;
  }
): Promise<SendOutcome> {
  try {
    const { data, error } = await admin.rpc('send_credit_pitches', {
      p_workspace: input.workspaceId,
      p_owner_user_id: input.ownerUserId,
      p_actor_user_id: input.actorUserId,
      p_request: input.requestId,
      p_now: (input.now ?? new Date()).toISOString(),
      p_reply_days: CREDIT_PITCH_REPLY_DAYS,
      p_waiting_limit: MAX_WAITING_PITCHES_PER_RELEASE,
      p_pitches: input.items,
    });
    if (error) {
      if (isMissingSchema(error)) return { result: 'unmigrated' };
      console.error('[pitch-credits] send failed:', error.message);
      return { result: 'error', message: error.message || 'Could not send.' };
    }
    const out = (data || {}) as Record<string, unknown>;
    switch (out.result) {
      case 'sent':
        return {
          result: 'sent',
          pitchIds: Array.isArray(out.pitch_ids) ? out.pitch_ids.map(String) : [],
          charged: Number(out.charged) || 0,
          balanceAfter: Number(out.balance_after) || 0,
        };
      case 'insufficient':
        return {
          result: 'insufficient',
          needed: Number(out.needed) || 0,
          balance: Number(out.balance) || 0,
          short: Number(out.short) || 0,
        };
      case 'at_limit':
      case 'duplicate':
      case 'not_found':
      case 'paused':
        return { result: out.result };
      default:
        return { result: 'error', message: 'Unexpected answer from the database.' };
    }
  } catch (error) {
    console.error('[pitch-credits] send threw:', error);
    return { result: 'error', message: 'Could not send.' };
  }
}

/** Tell each curator a paid-tier pitch is waiting. Best effort, never throws. */
export async function notifyCuratorsOfCreditPitches(admin: SupabaseClient, pitchIds: string[]): Promise<void> {
  for (const pitchId of pitchIds) {
    try {
      const { data } = await admin
        .from(PITCHES_TABLE)
        .select('id,curator_user_id,song_title,artist_name,payment_kind,credits_charged')
        .eq('id', pitchId)
        .maybeSingle();
      const row = data as Record<string, unknown> | null;
      if (!row || row.payment_kind !== 'credits') continue;
      await notifyUser(admin, String(row.curator_user_id || ''), {
        title: 'New pitch',
        body: newPaidPitchLine(
          String(row.artist_name || 'An artist'),
          String(row.song_title || 'a song'),
          curatorEarningKobo(Number(row.credits_charged) || 0)
        ),
        path: '/curator',
        tag: `pitch-credits-${pitchId}`,
        trigger: 'pitch_paid',
        ctaLabel: 'Open your inbox',
        footnote: 'You are getting this because you take pitches on Urganize.',
      });
    } catch {
      // Best effort: the inbox is the record.
    }
  }
}

export type CreditSweepResult = { expired: number; creditsRefunded: number; reminders: number; paused: number; errors: string[] };

const SWEEP_BATCH = 100;

/**
 * The 7-day rule for pitches paid with credits: refund and strike every pitch
 * whose window closed with no reply, and send the one-day reminder. Runs beside
 * the paid-pitch window sweep (every 15 minutes from pg_cron, and the daily
 * Vercel cron as a backstop). Every step is conditional in the database, so
 * running twice is harmless. Never throws. Not behind the feature flag: a
 * refund someone is owed must happen whether or not the flag is on today.
 */
export async function runCreditPitchSweep(admin: SupabaseClient, now: Date = new Date()): Promise<CreditSweepResult> {
  const result: CreditSweepResult = { expired: 0, creditsRefunded: 0, reminders: 0, paused: 0, errors: [] };
  try {
    const { data: due, error: dueError } = await admin
      .from(PITCHES_TABLE)
      .select('id')
      .eq('payment_kind', 'credits')
      .in('status', ['new', 'listened'])
      .is('responded_at', null)
      .lte('response_due_at', now.toISOString())
      .order('response_due_at', { ascending: true })
      .limit(SWEEP_BATCH);
    if (dueError) throw new Error(dueError.message);

    for (const row of (due || []) as Array<Record<string, unknown>>) {
      const pitchId = String(row.id);
      const { data: expiry, error: expiryError } = await admin.rpc('expire_credit_pitch', {
        p_pitch_id: pitchId,
        p_now: now.toISOString(),
        p_strike_limit: STRIKE_LIMIT,
        p_strike_window_days: STRIKE_WINDOW_DAYS,
      });
      if (expiryError) {
        if (!isMissingSchema(expiryError)) result.errors.push(`expire ${pitchId}: ${expiryError.message}`);
        continue;
      }
      const outcome = (expiry || {}) as Record<string, unknown>;
      if (outcome.result !== 'expired') continue;
      result.expired += 1;
      const refunded = Number(outcome.credits_refunded) || 0;
      result.creditsRefunded += refunded;
      await notifyMissedCreditPitch(admin, pitchId, refunded, Number(outcome.strike_count) || 1);
      if (outcome.paused === true) {
        result.paused += 1;
        await notifyUser(admin, String(outcome.curator_user_id || ''), {
          title: 'Your inbox is paused',
          body: INBOX_PAUSED,
          path: '/curator',
          tag: `pitch-paused-${String(outcome.curator_user_id || '')}`,
          trigger: 'curator_inbox_paused',
          ctaLabel: 'Open Urganize',
          footnote: 'You are getting this because you take pitches on Urganize.',
        });
      }
    }

    const leadEnd = new Date(now.getTime() + PITCH_REMINDER_LEAD_HOURS * 60 * 60 * 1000);
    const { data: soon } = await admin
      .from(PITCHES_TABLE)
      .select('id')
      .eq('payment_kind', 'credits')
      .in('status', ['new', 'listened'])
      .is('reminder_sent_at', null)
      .gt('response_due_at', now.toISOString())
      .lte('response_due_at', leadEnd.toISOString())
      .limit(SWEEP_BATCH);
    for (const row of (soon || []) as Array<Record<string, unknown>>) {
      const { data: claimed } = await admin
        .from(PITCHES_TABLE)
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', String(row.id))
        .is('reminder_sent_at', null)
        .select('id,curator_user_id,artist_name,credits_charged')
        .maybeSingle();
      const pitch = claimed as Record<string, unknown> | null;
      if (!pitch) continue;
      result.reminders += 1;
      await notifyUser(admin, String(pitch.curator_user_id || ''), {
        title: '1 day left to reply',
        body: curatorReminderLine(String(pitch.artist_name || 'the artist'), curatorEarningKobo(Number(pitch.credits_charged) || 0)),
        path: '/curator',
        tag: `pitch-reminder-${String(pitch.id)}`,
        trigger: 'pitch_reminder',
        ctaLabel: 'Reply now',
        footnote: 'You are getting this because you take pitches on Urganize.',
      });
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  if (result.errors.length) console.warn('[pitch-credits] sweep errors', result.errors);
  return result;
}

async function notifyMissedCreditPitch(
  admin: SupabaseClient,
  pitchId: string,
  credits: number,
  strikeCount: number
): Promise<void> {
  try {
    const { data } = await admin
      .from(PITCHES_TABLE)
      .select('id,curator_user_id,created_by,artist_name,release_id')
      .eq('id', pitchId)
      .maybeSingle();
    const pitch = data as Record<string, unknown> | null;
    if (!pitch) return;
    const curatorId = String(pitch.curator_user_id || '');
    const { data: profile } = await admin.from(PROFILES_TABLE).select('display_name').eq('user_id', curatorId).maybeSingle();
    const curatorName = String((profile as Record<string, unknown> | null)?.display_name || 'The curator');
    await notifyUser(admin, curatorId, {
      title: 'You missed a pitch',
      body: curatorMissedLine(String(pitch.artist_name || 'an artist'), Math.min(strikeCount, STRIKE_LIMIT), STRIKE_LIMIT),
      path: '/curator',
      tag: `pitch-missed-${pitchId}`,
      trigger: 'pitch_missed_window',
      ctaLabel: 'Open your inbox',
      footnote: 'You are getting this because you take pitches on Urganize.',
    });
    const releaseId = pitch.release_id ? String(pitch.release_id) : '';
    await notifyUser(admin, pitch.created_by ? String(pitch.created_by) : null, {
      title: 'Credits back',
      body: creditRefundNotice(curatorName, credits),
      path: releaseId ? `/dashboard?release=${releaseId}&scene=pitch` : '/dashboard/pitching',
      tag: `pitch-refund-${pitchId}`,
      trigger: 'pitch_auto_refund',
      ctaLabel: 'See your pitches',
      footnote: 'You are getting this because you pitched a curator on Urganize.',
    });
  } catch {
    // Best effort: the Answers list and Credits history are the record.
  }
}
