import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_DISCLOSURE,
  EARNINGS_EMPTY,
  FEEDBACK_PROMPT,
  FEEDBACK_TOO_SHORT,
  INBOX_PAUSED,
  NAME_MISMATCH,
  PAYMENT_FAILED,
  PITCH_SENT,
  PLAYLIST_SPOT_HELP_BODY,
  QUOTE_EXPIRED,
  RECEIPT_FOOTER,
  acceptedLine,
  accountLive,
  autoRefundLine,
  checkoutTitle,
  curatorCardPrice,
  earningsRow,
  formatPitchDate,
  formatPitchDeadline,
  inboxCard,
  missedWindowLine,
  nameCheckQuestion,
  passedLine,
  payButton,
  priceFieldHelp,
  priceOutOfBand,
  receiptCuratorLine,
  receiptFeeLine,
  receiptHeader,
  receiptTotalLine,
  reminderLine,
  replyInLine,
  windowNote,
} from './pitch-payment-copy';
import { PITCH_RESPONSE_WINDOW_HOURS, responseWindowDays } from './pitch-payments';

// The spec says "Use this exactly." These tests are the exactly: each string is
// the spec's own sentence with its variables filled in.

describe('the checkout disclosure', () => {
  it('is the spec sentence, character for character, and must never change', () => {
    expect(CHECKOUT_DISCLOSURE).toBe(
      "You're paying for a listen and a written reply. Not a playlist spot. No curator can promise one. No reply in 7 days? You get your money back."
    );
  });

  it('promises the window the product actually enforces', () => {
    // The disclosure is a fixed sentence on purpose, so it cannot follow the
    // window by itself. If the window ever moves, this fails and a person
    // decides the new wording, rather than the promise quietly going wrong.
    expect(CHECKOUT_DISCLOSURE).toContain(`${responseWindowDays(PITCH_RESPONSE_WINDOW_HOURS)} days`);
  });
});

describe('curator side copy', () => {
  it('matches the spec', () => {
    expect(EARNINGS_EMPTY).toBe(
      'Get paid to review songs. Add your bank account. Artists pay you each time you listen and reply to a pitch.'
    );
    expect(nameCheckQuestion('ADEBAYO TUNDE')).toBe('Is this your account? ADEBAYO TUNDE');
    expect(NAME_MISMATCH).toBe(
      "This name doesn't match your profile. We'll check it by hand. It usually takes a day."
    );
    expect(accountLive('GTBank', '1234')).toBe("You're set. Pitches pay out to GTBank ending 1234.");
    expect(priceFieldHelp(400_000)).toBe(
      'Your pitch price. Artists pay this to send you one song. You get ₦4,000 after the Urganize fee.'
    );
    expect(priceOutOfBand(200_000, 2_000_000)).toBe('Pick a price between ₦2,000 and ₦20,000.');
    expect(windowNote()).toBe(
      'You have 7 days to reply to each pitch. Miss it and the artist gets their money back.'
    );
    expect(inboxCard('Dorian', 'Lagos Nights', 'Thu, Oct 2', 400_000)).toBe(
      'Dorian sent you Lagos Nights. Reply by Thu, Oct 2 to earn ₦4,000.'
    );
    expect(FEEDBACK_PROMPT).toBe("Tell them what works and what doesn't. At least 15 words.");
    expect(FEEDBACK_TOO_SHORT).toBe('Add a few more words. The artist paid for a real reply.');
    expect(reminderLine('Dorian', 400_000)).toBe(
      '1 day left to reply to Dorian. Miss it and the ₦4,000 goes back to them.'
    );
    expect(missedWindowLine('Dorian', 400_000, 2)).toBe(
      "You missed Dorian's pitch. We refunded them. ₦4,000 comes off your next earnings. Strike 2 of 3."
    );
    expect(INBOX_PAUSED).toBe(
      'Your inbox is paused. You missed 3 pitches in 90 days. Message us to get back on.'
    );
    expect(earningsRow('Lagos Nights', 'Dorian', 400_000, 'Sep 26, 2026')).toBe(
      'Lagos Nights by Dorian · ₦4,000 · Sent to your bank Sep 26, 2026'
    );
  });
});

describe('artist side copy', () => {
  it('matches the spec', () => {
    expect(curatorCardPrice(500_000)).toBe('₦5,000 · Replies within 7 days');
    expect(checkoutTitle('Lagos Nights', 3)).toBe('Pitch Lagos Nights to 3 curators');
    expect(payButton(1_500_000)).toBe('Pay ₦15,000');
    expect(PITCH_SENT).toBe('Sent. Curators have 7 days to reply.');
    expect(PAYMENT_FAILED).toBe("Payment didn't go through. Your pitch is saved. Try again.");
    expect(QUOTE_EXPIRED).toBe('Prices changed. Check the new total before you pay.');
    expect(replyInLine('SoundRise', 'Lagos Nights')).toBe('SoundRise replied to your pitch for Lagos Nights.');
    expect(acceptedLine('SoundRise', 'Lagos Nights')).toBe('SoundRise said yes to Lagos Nights.');
    expect(passedLine('SoundRise', 'Lagos Nights')).toBe(
      'SoundRise passed on Lagos Nights. Read what they said.'
    );
    expect(autoRefundLine('SoundRise', 500_000)).toBe(
      "SoundRise didn't reply in time. We refunded ₦5,000. It can take up to 10 working days to reach you."
    );
  });

  it('says one curator, not one curators', () => {
    expect(checkoutTitle('Lagos Nights', 1)).toBe('Pitch Lagos Nights to 1 curator');
  });
});

describe('receipt copy', () => {
  it('matches the spec', () => {
    expect(receiptHeader('Sep 25, 2026', 'urgpitch-abc')).toBe('Receipt · Sep 25, 2026 · Ref urgpitch-abc');
    expect(receiptCuratorLine('SoundRise', 'Lagos Nights', 400_000)).toBe(
      'Pitch to SoundRise for Lagos Nights · ₦4,000'
    );
    expect(receiptFeeLine(300_000)).toBe('Urganize fee · ₦3,000');
    expect(receiptTotalLine(1_500_000)).toBe('Total paid · ₦15,000');
    expect(RECEIPT_FOOTER).toBe(
      'Curator amounts are paid straight to each curator through Paystack. Urganize keeps only the Urganize fee.'
    );
  });
});

describe('help copy', () => {
  it('says no, plainly', () => {
    expect(PLAYLIST_SPOT_HELP_BODY.startsWith('No. Streaming services ban paying for playlist spots')).toBe(true);
  });
});

describe('dates', () => {
  it('reads a deadline and a receipt date in Lagos time', () => {
    // 23:30 UTC on the 1st is already the 2nd in Lagos (UTC+1).
    expect(formatPitchDeadline('2026-10-01T23:30:00Z')).toBe('Fri, Oct 2');
    expect(formatPitchDate('2026-09-25T10:00:00Z')).toBe('Sep 25, 2026');
    expect(formatPitchDate('nope')).toBe('');
  });
});
