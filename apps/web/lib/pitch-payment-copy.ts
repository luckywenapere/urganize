/**
 * Every sentence curator pitch payments shows a person, in one place.
 *
 * Taken WORD FOR WORD from the "Product copy" section of the Curator Payments
 * Build Spec (2026-09-25), which says to use it exactly. The screens, the push
 * notifications and the emails all read these functions, so a curator reads the
 * same sentence in the inbox as in the notification that brought them there.
 *
 * THE ONE LINE THAT MUST NEVER CHANGE is CHECKOUT_DISCLOSURE. It is what keeps
 * paid pitching clear of the streaming services' rules against paying for
 * playlist placement, and lib/pitch-payment-copy.test.ts pins it character for
 * character. If it ever has to move, that is a founder and legal decision.
 *
 * Two small departures from the spec's table, both grammar, not wording:
 *   * "Pitch {Song} to {n} curators" says "1 curator" when n is 1.
 *   * The "7 days" in several lines is computed from the response window, so it
 *     cannot disagree with the window the product actually enforces.
 *
 * Pure and client-safe: no React, no I/O.
 */

import {
  MIN_PAID_FEEDBACK_WORDS,
  PITCH_RESPONSE_WINDOW_HOURS,
  STRIKE_LIMIT,
  STRIKE_WINDOW_DAYS,
  formatNaira,
  responseWindowDays,
} from './pitch-payments';

const days = (hours: number = PITCH_RESPONSE_WINDOW_HOURS): string => {
  const count = responseWindowDays(hours);
  return count === 1 ? '1 day' : `${count} days`;
};

// ─── dates ───────────────────────────────────────────────────────────────────

/**
 * "Thu, Oct 2" for a deadline. Lagos time by default, because the emails and
 * push notifications are rendered on a server that does not know where the
 * reader is, and every Urganize user is in Nigeria today.
 */
export function formatPitchDeadline(iso: string | null | undefined, timeZone = 'Africa/Lagos'): string {
  const at = Date.parse(String(iso || ''));
  if (!Number.isFinite(at)) return '';
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(new Date(at));
}

/** "Sep 25, 2026" for a receipt or an earnings row. */
export function formatPitchDate(iso: string | null | undefined, timeZone = 'Africa/Lagos'): string {
  const at = Date.parse(String(iso || ''));
  if (!Number.isFinite(at)) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(new Date(at));
}

// ─── curator side ────────────────────────────────────────────────────────────

export const EARNINGS_EMPTY =
  'Get paid to review songs. Add your bank account. Artists pay you each time you listen and reply to a pitch.';

export const ADD_BANK_ACCOUNT = 'Add bank account';

export const nameCheckQuestion = (accountName: string): string => `Is this your account? ${accountName}`;
export const NAME_CHECK_YES = "Yes, that's me";
export const NAME_CHECK_NO = 'No, edit';

export const NAME_MISMATCH =
  "This name doesn't match your profile. We'll check it by hand. It usually takes a day.";

export const accountLive = (bankName: string, last4: string): string =>
  `You're set. Pitches pay out to ${bankName} ending ${last4}.`;

export const priceFieldHelp = (shareKobo: number): string =>
  `Your pitch price. Artists pay this to send you one song. You get ${formatNaira(shareKobo)} after the Urganize fee.`;

export const priceOutOfBand = (minKobo: number, maxKobo: number): string =>
  `Pick a price between ${formatNaira(minKobo)} and ${formatNaira(maxKobo)}.`;

export const windowNote = (hours: number = PITCH_RESPONSE_WINDOW_HOURS): string =>
  `You have ${days(hours)} to reply to each pitch. Miss it and the artist gets their money back.`;

export const inboxCard = (artist: string, song: string, deadline: string, shareKobo: number): string =>
  `${artist} sent you ${song}. Reply by ${deadline} to earn ${formatNaira(shareKobo)}.`;

export const FEEDBACK_PROMPT = "Tell them what works and what doesn't. At least 15 words.";

export const FEEDBACK_TOO_SHORT = 'Add a few more words. The artist paid for a real reply.';

export const ACCEPT_LABEL = 'Accept';
export const PASS_LABEL = 'Pass';

export const reminderLine = (artist: string, shareKobo: number): string =>
  `1 day left to reply to ${artist}. Miss it and the ${formatNaira(shareKobo)} goes back to them.`;

export const missedWindowLine = (artist: string, shareKobo: number, strikeNumber: number): string =>
  `You missed ${artist}'s pitch. We refunded them. ${formatNaira(shareKobo)} comes off your next earnings. Strike ${strikeNumber} of ${STRIKE_LIMIT}.`;

export const INBOX_PAUSED = `Your inbox is paused. You missed ${STRIKE_LIMIT} pitches in ${STRIKE_WINDOW_DAYS} days. Message us to get back on.`;

export const earningsRow = (song: string, artist: string, shareKobo: number, date: string): string =>
  `${song} by ${artist} · ${formatNaira(shareKobo)} · Sent to your bank ${date}`;

// ─── artist side ─────────────────────────────────────────────────────────────

export const curatorCardPrice = (priceKobo: number, hours: number = PITCH_RESPONSE_WINDOW_HOURS): string =>
  `${formatNaira(priceKobo)} · Replies within ${days(hours)}`;

export const checkoutTitle = (song: string, curatorCount: number): string =>
  `Pitch ${song} to ${curatorCount} ${curatorCount === 1 ? 'curator' : 'curators'}`;

/** Above the Pay button, always visible. Must never change: see the header. */
export const CHECKOUT_DISCLOSURE =
  "You're paying for a listen and a written reply. Not a playlist spot. No curator can promise one. No reply in 7 days? You get your money back.";

export const payButton = (totalKobo: number): string => `Pay ${formatNaira(totalKobo)}`;

export const PITCH_SENT = `Sent. Curators have ${days()} to reply.`;

export const PAYMENT_FAILED = "Payment didn't go through. Your pitch is saved. Try again.";

export const QUOTE_EXPIRED = 'Prices changed. Check the new total before you pay.';

export const replyInLine = (curator: string, song: string): string =>
  `${curator} replied to your pitch for ${song}.`;

export const acceptedLine = (curator: string, song: string): string => `${curator} said yes to ${song}.`;

export const passedLine = (curator: string, song: string): string =>
  `${curator} passed on ${song}. Read what they said.`;

export const autoRefundLine = (curator: string, priceKobo: number): string =>
  `${curator} didn't reply in time. We refunded ${formatNaira(priceKobo)}. It can take up to 10 working days to reach you.`;

// ─── receipt ─────────────────────────────────────────────────────────────────

export const receiptHeader = (date: string, reference: string): string =>
  `Receipt · ${date} · Ref ${reference}`;

export const receiptCuratorLine = (curator: string, song: string, shareKobo: number): string =>
  `Pitch to ${curator} for ${song} · ${formatNaira(shareKobo)}`;

export const receiptFeeLine = (feeTotalKobo: number): string => `Urganize fee · ${formatNaira(feeTotalKobo)}`;

export const receiptTotalLine = (totalKobo: number): string => `Total paid · ${formatNaira(totalKobo)}`;

export const RECEIPT_FOOTER =
  'Curator amounts are paid straight to each curator through Paystack. Urganize keeps only the Urganize fee.';

// ─── not in the spec's table ─────────────────────────────────────────────────
// The spec's copy table covers the moments it designed. These cover the edges
// a real route hits that the table does not name: a second reply, a reply
// after the window, a curator who stopped taking paid pitches between the quote
// and the payment. Same voice, same rules, and kept here so every sentence this
// feature shows still lives in one file.

export const ALREADY_REPLIED = 'You already replied to this pitch.';

export const WINDOW_CLOSED = 'Time ran out on this pitch. The artist gets their money back.';

export const DECIDE_WITH_REPLY = 'Accept or pass, and write your reply.';

export const CURATOR_UNAVAILABLE = "This curator isn't taking paid pitches right now.";

export const CURATOR_NOW_PAID = 'This curator charges for pitches now. Check the price before you send.';

export const CANNOT_PAY_YOURSELF = "You can't pay to pitch your own playlist.";

export const TOO_MANY_IN_ONE_CHECKOUT = (max: number): string => `Pick up to ${max} curators at a time.`;

export const PAYMENTS_UNAVAILABLE = "Paid pitches aren't available right now. Try again later.";

export const UNPAID_PITCH_EXISTS =
  "You started a paid pitch to this playlist. Pay for it or remove it first.";

export const PITCHES_CHANGED = 'Some of these pitches changed. Start the payment again.';

export const ALREADY_PAID = 'This pitch is already paid.';

export const PAYMENT_IN_REVIEW = "We're checking this payment. We'll message you soon.";

export const ONLY_UNPAID_REMOVABLE = 'Only a pitch nobody has paid for can be removed.';

export const TERMS_CHANGED = 'The terms changed. Read them again, then pay.';

export const BY_PAYING_YOU_AGREE = 'By paying, you agree to the Artist Terms.';

export const PAY_ON_THE_WEB = 'Paid pitches are on the web. Open Urganize in your browser to pay.';

export const REVIEW_AND_PAY = 'Review and pay';

export const PAY_NOW = 'Pay now';

export const REMOVE_UNPAID = 'Remove';

export const replyDueLine = (deadline: string): string => `Reply due ${deadline}`;

export const CHECKING_PAYMENT = 'Checking your payment…';

export const PAID_ELSEWHERE =
  "If you paid, your pitch is on its way. Open Urganize to see it.";

export const ACCEPT_CURATOR_TERMS = 'I accept the Curator Terms';

export const TAKE_PAID_PITCHES = 'Take paid pitches';

export const STOP_PAID_PITCHES = 'Go back to free pitches';

export const priceNotLiveYet = (reason: 'no_account' | 'account_review' | 'paused' | 'off'): string => {
  if (reason === 'no_account') return 'Add your bank account to start charging.';
  if (reason === 'account_review') return "We're checking your bank account. Your price goes live after that.";
  if (reason === 'paused') return "Your inbox is paused, so artists can't pitch you right now.";
  return 'Paid pitches are off. Artists can pitch you for free.';
};

export const strikesLine = (count: number): string =>
  `Strikes: ${Math.min(count, STRIKE_LIMIT)} of ${STRIKE_LIMIT} in the last ${STRIKE_WINDOW_DAYS} days.`;

export const recoveryOwedLine = (kobo: number): string =>
  `${formatNaira(kobo)} comes off your next earnings.`;

/** Under an earnings row that paid down an earlier missed pitch. */
export const recoveryAppliedLine = (kobo: number): string =>
  `${formatNaira(kobo)} of this went to an earlier missed pitch.`;

/** An earnings row whose own pitch was later refunded — the whole share owed
 *  back, not sent to the bank. */
export const rowRefundedLine = 'Refunded. The window was missed on this one.';

/** Under the reply box on a paid pitch, counting toward the minimum. */
export const feedbackWordCount = (words: number): string => {
  if (words >= MIN_PAID_FEEDBACK_WORDS) return words === 1 ? '1 word' : `${words} words`;
  return `${words} of ${MIN_PAID_FEEDBACK_WORDS} words`;
};

export const REFUNDED_LABEL = 'Refunded';

export const REFUND_ON_ITS_WAY = 'Refund on its way';

// ─── help ────────────────────────────────────────────────────────────────────

export const PLAYLIST_SPOT_HELP_TITLE = 'Can I pay for a playlist spot?';

export const PLAYLIST_SPOT_HELP_BODY =
  'No. Streaming services ban paying for playlist spots, and songs caught doing it can be taken down. On Urganize you pay for a curator\'s time and an honest reply. If they like the song, they add it because they want to.';
