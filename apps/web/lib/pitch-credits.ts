/**
 * Pitch on credits (URG-345, Phase 1, Oct 17, 2026). Client-safe constants,
 * copy and pure logic, shared by the Pitch this! picker, the send route and the
 * expiry sweep so the three can never disagree about a price, a total or what
 * a line says. No node-only imports.
 *
 * THE MODEL (founder decisions, Oct 17, 2026):
 *   - Every credit a team has (monthly plan allowance, top-up packs, trial)
 *     sits in ONE balance and can pay for a pitch.
 *   - Urganize puts each playlist in a tier: Free (0), Standard (100) or Top
 *     (250) credits a pitch. Curators never set a price. Every playlist starts
 *     Free, so nothing is charged until an admin sets a tier.
 *   - What is bought is a listen and a written reply (15+ words) within 7 days.
 *     Never a playlist spot: no copy here says placement.
 *   - No on-time reply: the credits come back automatically and the curator
 *     gets a strike (the existing 3-in-90-days pause rule).
 *   - An on-time reply earns the curator ₦10 a credit. Curators see naira only,
 *     never the word "credits". Payouts are Phase 2.
 *
 * The charge itself happens in one database function, send_credit_pitches()
 * (supabase/migrations/20261017120000_pitch_credits.sql), which locks the
 * team's balance, checks it and writes the pitches and the ledger spend rows
 * together. The split here (splitCreditCharge) mirrors that function so the
 * logic is tested in TypeScript; the function is the one that runs.
 */

import { SPEND_ORDER, type SourceBalances } from '@/lib/credits/allowance';
import { TOPUP_PACKS, creditsForPack, type TopupPack } from '@/lib/credits/packs';
import type { CreditAccount } from '@/lib/credits/allowance';

/** The tiers, in credits a pitch. Config: move a number here, not in SQL. */
export const PITCH_CREDIT_TIERS = [0, 100, 250] as const;
export type PitchCreditTier = (typeof PITCH_CREDIT_TIERS)[number];

export const PITCH_CREDIT_TIER_LABELS: Record<PitchCreditTier, string> = {
  0: 'Free',
  100: 'Standard',
  250: 'Top',
};

/** What "enough for N pitches" is measured in: the Standard tier. */
export const STANDARD_PITCH_CREDITS = 100;

/** Days a curator has to reply to a paid-tier pitch. */
export const CREDIT_PITCH_REPLY_DAYS = 7;

/** What a curator earns per credit for an on-time reply, in kobo (₦10). */
export const CURATOR_KOBO_PER_CREDIT = 1000;

/** At most this many curators in one send (the waiting cap per rollout is 10). */
export const MAX_CREDIT_PITCHES_PER_SEND = 10;

/**
 * The switch. Ships ON (Oyin, Oct 17, 2026: "always ship on"), so it is on
 * unless the env says exactly 'false', and it only means something with
 * pitching and the credits system both on.
 */
export function isPitchCreditsEnabled(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_FEATURE_PITCHING: process.env.NEXT_PUBLIC_FEATURE_PITCHING,
    NEXT_PUBLIC_FEATURE_URGANS_CREDITS: process.env.NEXT_PUBLIC_FEATURE_URGANS_CREDITS,
    NEXT_PUBLIC_FEATURE_PITCH_CREDITS: process.env.NEXT_PUBLIC_FEATURE_PITCH_CREDITS,
  }
): boolean {
  return (
    String(env.NEXT_PUBLIC_FEATURE_PITCHING ?? '').trim().toLowerCase() === 'true' &&
    String(env.NEXT_PUBLIC_FEATURE_URGANS_CREDITS ?? '').trim().toLowerCase() === 'true' &&
    String(env.NEXT_PUBLIC_FEATURE_PITCH_CREDITS ?? '').trim().toLowerCase() !== 'false'
  );
}

export function isPitchCreditTier(value: unknown): value is PitchCreditTier {
  return typeof value === 'number' && (PITCH_CREDIT_TIERS as readonly number[]).includes(value);
}

/** A stored price read back safely: anything that is not a whole positive number is Free. */
export function normalizeCreditPrice(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function selectionTotal(prices: readonly number[]): number {
  return prices.reduce((sum, price) => sum + normalizeCreditPrice(price), 0);
}

/** "Enough for N pitches", counted at the Standard tier. Never negative. */
export function pitchesAffordable(credits: number): number {
  return Math.max(0, Math.floor(Math.max(0, credits) / STANDARD_PITCH_CREDITS));
}

export type CreditSplit = { trial: number; allowance: number; topup: number };

/**
 * How one pitch's credits are drawn: trial first, then the allowance, then the
 * top-up pool, the order every other charge on the ledger uses (so leftover
 * trial credits stay removable). Unlike a chat turn there is NO overshoot: the
 * caller has already refused a charge the balance cannot cover, so a short
 * split means "refuse", never "go negative". Returns null when short.
 */
export function splitCreditCharge(credits: number, balances: SourceBalances): CreditSplit | null {
  let remaining = Math.max(0, Math.floor(credits));
  const split: CreditSplit = { trial: 0, allowance: 0, topup: 0 };
  for (const source of SPEND_ORDER) {
    const take = Math.min(remaining, Math.max(0, Math.floor(balances[source])));
    split[source] = take;
    remaining -= take;
  }
  return remaining > 0 ? null : split;
}

export type ChargePlan =
  | { ok: true; total: number; perPitch: CreditSplit[]; after: SourceBalances }
  | { ok: false; total: number; balance: number; short: number };

/**
 * A whole send, pitch by pitch, against one balance. All or nothing: if the
 * balance cannot cover the total, nothing is charged.
 */
export function planCreditCharge(prices: readonly number[], balances: SourceBalances): ChargePlan {
  const total = selectionTotal(prices);
  const available = Math.max(0, balances.trial) + Math.max(0, balances.allowance) + Math.max(0, balances.topup);
  if (total > available) {
    return { ok: false, total, balance: available, short: total - available };
  }
  const running: SourceBalances = { ...balances };
  const perPitch: CreditSplit[] = [];
  for (const price of prices) {
    const split = splitCreditCharge(normalizeCreditPrice(price), running);
    if (!split) return { ok: false, total, balance: available, short: total - available };
    running.trial -= split.trial;
    running.allowance -= split.allowance;
    running.topup -= split.topup;
    perPitch.push(split);
  }
  return { ok: true, total, perPitch, after: running };
}

/**
 * The smallest pack that covers what is short, for the top-up sheet. Null when
 * even the biggest pack does not (the sheet then preselects the biggest).
 */
export function smallestCoveringPack(
  account: CreditAccount,
  short: number
): { pack: TopupPack; credits: number } | null {
  for (const pack of TOPUP_PACKS) {
    const credits = creditsForPack(account, pack.priceNaira) ?? 0;
    if (credits >= short) return { pack, credits };
  }
  return null;
}

/** Ledger keys for a pitch: one spend and at most one refund per source. */
export const pitchSpendKey = (pitchId: string, source: string): string => `spend:pitch:${pitchId}:${source}`;
export const pitchRefundKey = (pitchId: string, source: string): string => `refund:pitch:${pitchId}:${source}`;

/** What a curator earns for an on-time reply to a pitch that cost `credits`. */
export const curatorEarningKobo = (credits: number): number => normalizeCreditPrice(credits) * CURATOR_KOBO_PER_CREDIT;

/** Whole days left until a deadline, rounded up; 0 once it has passed. */
export function daysLeft(dueIso: string | null | undefined, now: Date = new Date()): number {
  const due = Date.parse(String(dueIso || ''));
  if (!Number.isFinite(due)) return 0;
  const ms = due - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// ─── copy (artist side: credits, never naira, except inside the top-up sheet) ──

const n = (value: number): string => Math.trunc(value).toLocaleString('en');

export const PITCH_CREDITS_SUBTITLE = 'A listen and a written reply in 7 days, or your credits back.';

export const sendButtonLabel = (count: number): string => `Send to ${count}`;
export const TOP_UP_AND_SEND = 'Top up and send';

/** Under the button when the balance covers the selection. */
export function trayFootnote(total: number, balance: number): string {
  if (total <= 0) return `Free · ${n(balance)} credits left`;
  const left = balance - total;
  const pitches = pitchesAffordable(left);
  return `${n(total)} credits · ${n(left)} left, enough for ${pitches} ${pitches === 1 ? 'pitch' : 'pitches'}`;
}

/** Under the button when it does not: the short part is drawn in warning colour. */
export const trayShortLead = (total: number, balance: number): string => `${n(total)} credits · ${n(balance)} left,`;
export const trayShortTail = (short: number): string => `${n(short)} short`;

export const selectedCount = (count: number): string => `${count} selected`;

export const topUpLead = (short: number, count: number): string =>
  `You need ${n(short)} more. Your ${count === 1 ? 'pitch sends' : `${count} pitches send`} once you pay.`;

export const packCredits = (credits: number): string => `${n(credits)} credits`;
export const payButtonLabel = (naira: number): string => `Pay ₦${n(naira)}`;
export const PAYSTACK_FOOTNOTE = 'Paystack · card, transfer or USSD';
export const TOP_UP_ON_THE_WEB =
  'Open Urganize in your browser to buy more credits. They show up here as soon as you do.';
export const TOP_UP_UNAVAILABLE = 'Buying credits is not open yet.';

export const PAYMENT_DIDNT_GO_THROUGH = 'Payment didn’t go through';
export const NOTHING_SENT_OR_CHARGED = 'Nothing was sent or charged.';
export const CHECKING_TOP_UP = 'Checking your payment…';
export const SENDING_AFTER_TOP_UP = 'Paid. Sending your pitches…';

export const sentTitle = (count: number): string => `Sent to ${count}`;
export function sentReceipt(charged: number, left: number): string {
  if (charged <= 0) return `Free · ${n(left)} credits left`;
  return `−${n(charged)} credits · ${n(left)} left`;
}
export const SENT_NOTE = 'Replies land here within 7 days. No reply, your credits come back.';
export const SENT_NOTE_FREE = 'Replies land here.';
export const PITCH_MORE = 'Pitch more curators';

export const emptyPlatform = (platform: string): string => `No ${platform} curators yet`;
export const EMPTY_PLATFORM_LINE = 'New ones show up here.';
export const LOAD_ERROR = 'Couldn’t load curators.';
export const SONG_LINK_FIRST = 'Add the song link first.';
export const NOT_ENOUGH_CREDITS = 'You need more credits for these pitches.';
export const OWN_TEAM_CURATOR = 'You can’t pitch a curator on your own team.';
export const CURATOR_PAUSED = 'This curator isn’t taking pitches right now.';

export const answersCount = (answered: number, total: number): string => `${answered} of ${total} answered`;
export const ANSWERED = 'Answered';
export const CREDITS_BACK = 'Credits back';
export const WAITING = 'Waiting';
export const daysLeftLabel = (days: number): string =>
  days <= 0 ? 'Due today' : `${days} ${days === 1 ? 'day' : 'days'} left`;
export const refundedLine = (credits: number): string => `No reply · +${n(credits)} credits`;

/** Credits history lines. */
export const pitchSpendHistoryLabel = (curator: string): string => (curator ? `Pitch to ${curator}` : 'Pitch to a curator');
export const pitchRefundHistoryLabel = (curator: string): string =>
  curator ? `Credits back from ${curator}` : 'Credits back from a pitch';

/** The artist's notice when a curator missed the window. */
export const creditRefundNotice = (curator: string, credits: number): string =>
  `${curator} didn't reply in time. Your ${n(credits)} credits are back.`;

// ─── copy (curator side: naira only, never "credits") ──────────────────────────

const naira = (kobo: number): string => `₦${n(Math.round(kobo / 100))}`;

export const replyEarningPill = (kobo: number): string => `${naira(kobo)} for your reply`;
export const curatorDaysLeft = (days: number): string => daysLeftLabel(days);
export const wordCounter = (words: number, min: number): string => `${Math.min(words, 9999)} / ${min} words`;
export const PAID_ON_REPLY = 'Paid on reply';
export const curatorReminderLine = (artist: string, kobo: number): string =>
  `1 day left to reply to ${artist}. Reply in time to earn ${naira(kobo)}.`;
export const curatorMissedLine = (artist: string, strikeNumber: number, limit: number): string =>
  `You missed ${artist}'s pitch, so it went back to them. Strike ${strikeNumber} of ${limit}.`;
export const newPaidPitchLine = (artist: string, song: string, kobo: number): string =>
  `${artist} sent you ${song}. Reply within ${CREDIT_PITCH_REPLY_DAYS} days to earn ${naira(kobo)}.`;
