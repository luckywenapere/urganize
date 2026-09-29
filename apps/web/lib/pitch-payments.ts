/**
 * Curator pitch payments: the config values and the pure logic.
 *
 * Client-safe and dependency-free on purpose (the lib/pitching.ts pattern). The
 * curator's price field, the artist's checkout, the quote route, the webhook and
 * the 15-minute sweep all read the SAME numbers from here, so a price band, a
 * fee or a window can never mean one thing on screen and another at Paystack.
 *
 * THE CONFIG VALUES ARE THE FOUNDER'S TO MOVE. The spec lists each one as a
 * placeholder "until you set them", all config rather than code. Changing the
 * fee here changes new quotes only: a quote freezes the fee it was made with
 * (pitch_quotes.platform_fee_bps), so a pitch already paid keeps its fee, which
 * is what the Curator Terms promise.
 *
 * Money is always integer kobo. Nothing in this file does arithmetic on naira.
 */

// ─── config ──────────────────────────────────────────────────────────────────

/** The Urganize fee, in basis points of the pitch price. 2000 = 20%. */
export const PITCH_PLATFORM_FEE_BPS = 2000;

/** The band a curator's price must sit inside: ₦2,000 to ₦20,000. */
export const PITCH_PRICE_MIN_KOBO = 200_000;
export const PITCH_PRICE_MAX_KOBO = 2_000_000;

/** One response window for every curator in v1: 7 days. */
export const PITCH_RESPONSE_WINDOW_HOURS = 168;

/** Most pitches one checkout can carry. Keeps refunds and splits simple. */
export const MAX_PITCHES_PER_CHECKOUT = 5;

/** A paid reply is at least this many words, for Accept and for Pass. */
export const MIN_PAID_FEEDBACK_WORDS = 15;
export const MAX_PAID_FEEDBACK_LENGTH = 2000;

/** Three missed windows in 90 days pauses a curator's inbox. */
export const STRIKE_LIMIT = 3;
export const STRIKE_WINDOW_DAYS = 90;

/** How long a quote holds its prices. */
export const PITCH_QUOTE_TTL_MINUTES = 30;

/** How long before a window closes the curator is reminded. */
export const PITCH_REMINDER_LEAD_HOURS = 24;

/** Account-name lookups per curator per hour. A resolve returns a real
 *  person's name, so it must not be an unlimited lookup service. */
export const PAYOUT_RESOLVE_LIMIT_PER_HOUR = 10;

/** How many times a failed refund call is retried before a human is asked. */
export const MAX_REFUND_ATTEMPTS = 5;

/** The terms each side agreed to, stored with what they agreed to it on. DRAFT
 *  until a Nigerian fintech lawyer has reviewed them: bump both when the
 *  reviewed wording replaces the draft. */
export const CURATOR_TERMS_VERSION = '2026-09-25-draft';
export const ARTIST_PITCH_TERMS_VERSION = '2026-09-25-draft';

/** Every pitch checkout reference starts with this, so the Paystack webhook can
 *  route it without a database lookup and without touching the subscription
 *  code. Paystack allows letters, numbers, hyphens, dots and equals signs. */
export const PITCH_REFERENCE_PREFIX = 'urgpitch-';

/**
 * Both flags, because paid pitching is a layer on pitching: with pitching off
 * there is no inbox to pay for. Read inside the function rather than at module
 * scope so the tests can stub the env; Next still inlines the values at build
 * time either way.
 */
export function isPitchPaymentsEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true' &&
    process.env.NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS === 'true'
  );
}

// ─── naira ───────────────────────────────────────────────────────────────────

const WHOLE_NAIRA = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
const NAIRA_WITH_KOBO = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₦5,000", or "₦5,000.50" when there are kobo. Never negative. */
export function formatNaira(kobo: number): string {
  if (!Number.isFinite(kobo) || kobo <= 0) return '₦0';
  const whole = Math.round(kobo);
  if (whole % 100 === 0) return `₦${WHOLE_NAIRA.format(whole / 100)}`;
  return `₦${NAIRA_WITH_KOBO.format(whole / 100)}`;
}

/**
 * What a curator types into a price field, as kobo. Accepts "5000", "5,000",
 * "₦5,000" and up to two decimal places. Anything else, zero or negative, is
 * null: the caller says so rather than guessing.
 */
export function nairaToKobo(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const kobo = Math.round(value * 100);
    return kobo > 0 ? kobo : null;
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[₦,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [naira, kobo = ''] = cleaned.split('.');
  const total = Number(naira) * 100 + Number(kobo.padEnd(2, '0'));
  return Number.isFinite(total) && total > 0 ? total : null;
}

export type PriceCheck = { ok: true } | { ok: false; error: string };

export function validatePitchPrice(kobo: number): PriceCheck {
  if (
    Number.isInteger(kobo) &&
    kobo >= PITCH_PRICE_MIN_KOBO &&
    kobo <= PITCH_PRICE_MAX_KOBO
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    error: `Pick a price between ${formatNaira(PITCH_PRICE_MIN_KOBO)} and ${formatNaira(PITCH_PRICE_MAX_KOBO)}.`,
  };
}

/**
 * The curator's share and the Urganize fee for one price. The share rounds DOWN,
 * so any fraction of a kobo goes to the fee and the two always add back up to
 * the price exactly — which pitch_payments checks.
 */
export function splitPitchPrice(
  priceKobo: number,
  feeBps: number = PITCH_PLATFORM_FEE_BPS
): { curatorShareKobo: number; platformFeeKobo: number } {
  const price = Math.max(0, Math.round(priceKobo));
  const bps = Math.min(10_000, Math.max(0, Math.round(feeBps)));
  const curatorShareKobo = Math.floor((price * (10_000 - bps)) / 10_000);
  return { curatorShareKobo, platformFeeKobo: price - curatorShareKobo };
}

// ─── written replies ─────────────────────────────────────────────────────────

/** Words, not tokens: a dash or a row of dots is not a word. */
export function countWords(text: string): number {
  if (typeof text !== 'string') return 0;
  return text
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export type FeedbackCheck = { ok: true; value: string } | { ok: false; error: string };

export function validatePaidFeedback(text: unknown): FeedbackCheck {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value.length > MAX_PAID_FEEDBACK_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_PAID_FEEDBACK_LENGTH.toLocaleString('en')} characters.` };
  }
  if (countWords(value) < MIN_PAID_FEEDBACK_WORDS) {
    return { ok: false, error: 'Add a few more words. The artist paid for a real reply.' };
  }
  return { ok: true, value };
}

// ─── quotes ──────────────────────────────────────────────────────────────────

/** One pitch with its curator's live price, as the quote route resolves it. */
export type PricedPitch = {
  pitchId: string;
  curatorUserId: string;
  curatorName: string;
  playlistName: string;
  priceKobo: number;
  responseWindowHours: number;
  payoutAccountId: string;
  subaccountCode: string;
};

/**
 * One line of a quote, stored in pitch_quotes.lines and read by
 * settle_pitch_quote(). snake_case because the database function reads the keys.
 *
 * split_share_kobo is what Paystack actually sends to the curator: their share
 * minus any recovery. It never reaches an artist (toArtistQuoteView).
 */
export type QuoteLine = {
  pitch_id: string;
  curator_user_id: string;
  curator_name: string;
  playlist_name: string;
  payout_account_id: string;
  subaccount_code: string;
  price_kobo: number;
  curator_share_kobo: number;
  platform_fee_kobo: number;
  recovery_applied_kobo: number;
  split_share_kobo: number;
  response_window_hours: number;
};

/**
 * Prices every pitch and takes any open recovery off its curator's share.
 *
 * `recoveryAvailable` is what each curator still owes and is not already
 * reserved by another open quote. It is consumed in line order, so a curator
 * who owes more than one share has the first share cut in full before the
 * second. The artist's total is the same either way: recovery moves money
 * between the curator and Urganize, never onto the artist.
 */
export function buildQuoteLines(input: {
  pitches: PricedPitch[];
  recoveryAvailable: Map<string, number>;
  feeBps?: number;
}): QuoteLine[] {
  const remaining = new Map(input.recoveryAvailable);
  const feeBps = input.feeBps ?? PITCH_PLATFORM_FEE_BPS;

  return input.pitches.map((entry) => {
    const { curatorShareKobo, platformFeeKobo } = splitPitchPrice(entry.priceKobo, feeBps);
    const owed = Math.max(0, remaining.get(entry.curatorUserId) ?? 0);
    const recovery = Math.min(owed, curatorShareKobo);
    if (recovery > 0) remaining.set(entry.curatorUserId, owed - recovery);

    return {
      pitch_id: entry.pitchId,
      curator_user_id: entry.curatorUserId,
      curator_name: entry.curatorName,
      playlist_name: entry.playlistName,
      payout_account_id: entry.payoutAccountId,
      subaccount_code: entry.subaccountCode,
      price_kobo: Math.round(entry.priceKobo),
      curator_share_kobo: curatorShareKobo,
      platform_fee_kobo: platformFeeKobo,
      recovery_applied_kobo: recovery,
      split_share_kobo: curatorShareKobo - recovery,
      response_window_hours: entry.responseWindowHours,
    };
  });
}

export function summarizeQuoteLines(lines: Array<Pick<QuoteLine, 'price_kobo' | 'curator_share_kobo' | 'platform_fee_kobo'>>): {
  count: number;
  totalKobo: number;
  curatorShareTotalKobo: number;
  platformFeeTotalKobo: number;
} {
  let totalKobo = 0;
  let curatorShareTotalKobo = 0;
  let platformFeeTotalKobo = 0;
  for (const line of lines) {
    totalKobo += line.price_kobo;
    curatorShareTotalKobo += line.curator_share_kobo;
    platformFeeTotalKobo += line.platform_fee_kobo;
  }
  return { count: lines.length, totalKobo, curatorShareTotalKobo, platformFeeTotalKobo };
}

export type PaystackFlatSplit = {
  type: 'flat';
  bearer_type: 'account';
  subaccounts: Array<{ subaccount: string; share: number }>;
};

/**
 * The dynamic split for transaction/initialize.
 *
 * FLAT shares in kobo, and bearer_type 'account' so Urganize pays Paystack's fee
 * out of its own cut and a curator always sees a clean number. The main account
 * receives whatever is left: the fees, plus any recovery.
 *
 * Two playlists owned by one curator become ONE subaccount entry, because a
 * split names each subaccount once. A curator whose whole share went to a
 * recovery is left out rather than sent a zero share. When nothing at all goes
 * to a subaccount the answer is null, and the charge is made unsplit.
 */
export function buildPaystackSplit(
  lines: Array<Pick<QuoteLine, 'subaccount_code' | 'split_share_kobo'>>
): PaystackFlatSplit | null {
  const shares = new Map<string, number>();
  for (const line of lines) {
    if (!line.subaccount_code || line.split_share_kobo <= 0) continue;
    shares.set(line.subaccount_code, (shares.get(line.subaccount_code) ?? 0) + line.split_share_kobo);
  }
  if (!shares.size) return null;
  return {
    type: 'flat',
    bearer_type: 'account',
    subaccounts: Array.from(shares, ([subaccount, share]) => ({ subaccount, share })),
  };
}

/**
 * Paystack's fee for the whole charge, spread across its lines by price, for
 * reporting. Floors each share and gives the remainder to the last line, so the
 * parts always add back up to the total.
 */
export function allocatePaystackFee(
  totalFeeKobo: number | null | undefined,
  lines: Array<{ pitch_id: string; price_kobo: number }>
): Record<string, number> {
  if (typeof totalFeeKobo !== 'number' || !Number.isFinite(totalFeeKobo) || totalFeeKobo < 0) return {};
  const fee = Math.round(totalFeeKobo);
  const totalPrice = lines.reduce((sum, line) => sum + Math.max(0, line.price_kobo), 0);
  if (!lines.length || totalPrice <= 0) return {};

  const allocation: Record<string, number> = {};
  let assigned = 0;
  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    const part = isLast ? fee - assigned : Math.floor((fee * Math.max(0, line.price_kobo)) / totalPrice);
    allocation[line.pitch_id] = part;
    assigned += part;
  });
  return allocation;
}

/**
 * What a curator charges right now, from the three rows that decide it.
 *
 * A price is LIVE only when all of these hold: the curator switched paid
 * pitches on, the payout account is active with a Paystack subaccount behind
 * it, and the inbox is not paused. Anything short of that and the curator takes
 * FREE pitches, exactly as before paid pitching existed (founder call: paid is
 * opt-in, free stays free). Computed rather than stored, so retiring a bank
 * account can never leave a stale "live" flag charging artists into nowhere.
 */
export type CuratorPaymentState = {
  curatorUserId: string;
  paused: boolean;
  /** The live price, or null when this curator takes free pitches. */
  priceKobo: number | null;
  responseWindowHours: number;
  payoutAccountId: string | null;
  subaccountCode: string | null;
};

export function resolveCuratorPaymentState(input: {
  curatorUserId: string;
  inboxPausedAt: string | null | undefined;
  pricing: { pitch_price_kobo: number; response_window_hours: number; is_live: boolean } | null | undefined;
  payoutAccount: { id: string; status: string; paystack_subaccount_code: string | null } | null | undefined;
}): CuratorPaymentState {
  const paused = Boolean(input.inboxPausedAt);
  const account = input.payoutAccount;
  const accountLive = Boolean(account && account.status === 'active' && account.paystack_subaccount_code);
  const pricing = input.pricing;
  const priced = Boolean(pricing && pricing.is_live && Number(pricing.pitch_price_kobo) > 0);
  const live = priced && accountLive && !paused;
  return {
    curatorUserId: input.curatorUserId,
    paused,
    priceKobo: live && pricing ? Math.round(Number(pricing.pitch_price_kobo)) : null,
    responseWindowHours:
      pricing && Number(pricing.response_window_hours) > 0
        ? Math.round(Number(pricing.response_window_hours))
        : PITCH_RESPONSE_WINDOW_HOURS,
    payoutAccountId: live && account ? account.id : null,
    subaccountCode: live && account ? account.paystack_subaccount_code : null,
  };
}

export function isQuoteExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  const at = Date.parse(String(expiresAt || ''));
  if (!Number.isFinite(at)) return true;
  return at <= now.getTime();
}

/**
 * Has the reply window on a paid pitch closed? The same rule the reply route
 * enforces: a deadline that cannot be read counts as closed, because a paid
 * pitch always has one and the server refuses a reply it cannot place in time.
 * The inbox uses it to say so before a curator writes a reply the server would
 * turn away.
 */
export function isReplyWindowClosed(responseDueAt: string | null | undefined, now: Date = new Date()): boolean {
  return isQuoteExpired(responseDueAt, now);
}

// ─── references and webhook events ───────────────────────────────────────────

function randomToken(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export function generatePitchReference(): string {
  return `${PITCH_REFERENCE_PREFIX}${randomToken()}`;
}

export function isPitchPaymentReference(reference: unknown): reference is string {
  return typeof reference === 'string' && reference.startsWith(PITCH_REFERENCE_PREFIX);
}

/**
 * The dedupe key for payment_events. A charge is keyed on its reference. A
 * refund is keyed on its OWN id, because one checkout can be refunded several
 * times (one pitch at a time) and every one of those refunds carries the same
 * transaction reference. Keying refunds on the reference would silently drop
 * the second one.
 */
export function paymentEventKey(event: string, data: Record<string, unknown> | null | undefined): string {
  const safe = data || {};
  if (event.startsWith('refund.')) {
    const id = safe.id ?? safe.refund_id ?? safe.refund_reference ?? safe.transaction_reference;
    return `refund:${String(id ?? 'unknown')}`;
  }
  return String(safe.reference ?? safe.id ?? 'unknown');
}

/**
 * Before retrying a refund, is there already one at Paystack that our records
 * never caught? An unrecorded refund of the same amount, not failed, is adopted
 * instead of creating a second one. Refunds already tied to OTHER payments of
 * the same checkout are skipped, so two ₦5,000 pitches refunded from one
 * checkout each keep their own.
 */
export function findUnrecordedRefund(
  refunds: Array<{ id: number | null; amountKobo: number; status: string }>,
  recordedRefundIds: Array<number | null | undefined>,
  amountKobo: number
): number | null {
  const recorded = new Set(recordedRefundIds.filter((id): id is number => typeof id === 'number'));
  for (const refund of refunds) {
    if (refund.id === null || recorded.has(refund.id)) continue;
    if (refund.amountKobo !== amountKobo) continue;
    if (/fail|reject|revers/i.test(refund.status)) continue;
    return refund.id;
  }
  return null;
}

// ─── strikes, windows and reminders ──────────────────────────────────────────

/** Strikes inside the window and after the last admin reset. */
export function countRecentStrikes(
  strikeTimestamps: string[],
  now: Date,
  resetAt: string | null | undefined,
  windowDays: number = STRIKE_WINDOW_DAYS
): number {
  const windowStart = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const reset = Date.parse(String(resetAt || ''));
  const since = Number.isFinite(reset) ? Math.max(windowStart, reset) : windowStart;
  return strikeTimestamps.filter((iso) => {
    const at = Date.parse(iso);
    return Number.isFinite(at) && at > since;
  }).length;
}

/** The window in whole days, for copy like "Replies within 7 days". */
export function responseWindowDays(hours: number = PITCH_RESPONSE_WINDOW_HOURS): number {
  return Math.max(1, Math.round(hours / 24));
}

/** The reminder goes out once, inside the lead time, before the deadline. */
export function isReminderDue(
  dueAt: string | null | undefined,
  now: Date,
  reminderSentAt: string | null | undefined,
  leadHours: number = PITCH_REMINDER_LEAD_HOURS
): boolean {
  if (reminderSentAt) return false;
  const due = Date.parse(String(dueAt || ''));
  if (!Number.isFinite(due)) return false;
  const remaining = due - now.getTime();
  return remaining > 0 && remaining <= leadHours * 60 * 60 * 1000;
}

// ─── bank accounts ───────────────────────────────────────────────────────────

/** A Nigerian NUBAN account number: exactly ten digits. */
export function isValidNubanAccountNumber(value: unknown): value is string {
  return typeof value === 'string' && /^\d{10}$/.test(value);
}

export function lastFour(accountNumber: string): string {
  return String(accountNumber || '').slice(-4);
}

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'chief', 'prof', 'engr', 'barr', 'alhaji', 'alhaja']);

function nameTokens(name: string): string[] {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !HONORIFICS.has(token));
}

/**
 * Does the name the bank returned belong to this curator?
 *
 * ORDER-INSENSITIVE, because Nigerian banks usually print the surname first
 * ("WENAPERE LUCKY TAMUNOBELEMA") while a profile says "Lucky Wenapere". A
 * candidate matches when every one of its names appears in the bank's, and it
 * has at least TWO: a single first name like "Tunde" would match thousands of
 * accounts. A brand name ("SoundRise Uncovered") will not match, which is the
 * case the spec sends to a human rather than trusting.
 */
export function accountNameMatches(resolvedName: string, candidates: string[]): boolean {
  const bank = new Set(nameTokens(resolvedName));
  if (!bank.size) return false;
  return candidates.some((candidate) => {
    const tokens = nameTokens(candidate);
    return tokens.length >= 2 && tokens.every((token) => bank.has(token));
  });
}

// ─── what an artist is allowed to see ────────────────────────────────────────

export type ArtistQuoteLineView = {
  pitchId: string;
  curatorName: string;
  playlistName: string;
  priceKobo: number;
  /** The NOMINAL share (price minus the fee), which is what the receipt shows.
   *  Never the share after a recovery: that would tell an artist the curator
   *  owes money. */
  curatorShareKobo: number;
  /** This pitch's own refund: on its way, done, or none. The artist's own
   *  money, so theirs to see. */
  refund: 'pending' | 'refunded' | null;
};

/** A payment row's status as the artist reads it. A refund that failed at
 *  Paystack is still owed, and a human is on it, so it reads as on its way. */
export function refundStateForArtist(paymentStatus: string | null | undefined): 'pending' | 'refunded' | null {
  if (paymentStatus === 'refunded') return 'refunded';
  if (paymentStatus === 'refund_pending' || paymentStatus === 'refund_failed') return 'pending';
  return null;
}

export type ArtistQuoteView = {
  id: string;
  status: string;
  reference: string;
  totalKobo: number;
  platformFeeTotalKobo: number;
  expiresAt: string;
  paidAt: string | null;
  lines: ArtistQuoteLineView[];
};

/**
 * A quote as the paying team sees it, built FIELD BY FIELD rather than by
 * spreading the row. The stored lines carry a curator's user id, their Paystack
 * subaccount, the recovery taken off their share and the share actually sent to
 * them; none of that is the artist's business. A guard test asserts the exact
 * keys, so a field added to the table cannot leak through here.
 *
 * `paymentStatusByPitch` is each pitch's payment status, for a receipt that has
 * to say which pitches were refunded. Absent for a quote nobody has paid.
 */
export function toArtistQuoteView(
  row: {
    id: string;
    status: string;
    total_kobo: number;
    platform_fee_bps: number;
    expires_at: string;
    paid_at: string | null;
    paystack_reference: string;
    lines: unknown;
  },
  paymentStatusByPitch?: Map<string, string> | null
): ArtistQuoteView {
  const lines = Array.isArray(row.lines) ? (row.lines as Array<Record<string, unknown>>) : [];
  const viewLines: ArtistQuoteLineView[] = lines.map((line) => {
    const pitchId = String(line.pitch_id || '');
    return {
      pitchId,
      curatorName: String(line.curator_name || ''),
      playlistName: String(line.playlist_name || ''),
      priceKobo: Number(line.price_kobo) || 0,
      curatorShareKobo: Number(line.curator_share_kobo) || 0,
      refund: refundStateForArtist(paymentStatusByPitch?.get(pitchId)),
    };
  });
  const platformFeeTotalKobo = lines.reduce((sum, line) => sum + (Number(line.platform_fee_kobo) || 0), 0);
  return {
    id: String(row.id || ''),
    status: String(row.status || ''),
    reference: String(row.paystack_reference || ''),
    totalKobo: Number(row.total_kobo) || 0,
    platformFeeTotalKobo,
    expiresAt: String(row.expires_at || ''),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    lines: viewLines,
  };
}
