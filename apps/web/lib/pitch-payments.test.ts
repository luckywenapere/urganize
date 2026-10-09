import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PITCHES_PER_CHECKOUT,
  MIN_PAID_FEEDBACK_WORDS,
  PITCH_PLATFORM_FEE_BPS,
  PITCH_PRICE_MAX_KOBO,
  PITCH_PRICE_MIN_KOBO,
  PITCH_REFERENCE_PREFIX,
  PITCH_RESPONSE_WINDOW_HOURS,
  accountNameMatches,
  allocatePaystackFee,
  buildPaystackSplit,
  buildQuoteLines,
  countRecentStrikes,
  countWords,
  findUnrecordedRefund,
  formatNaira,
  generatePitchReference,
  isPitchPaymentReference,
  isPitchPaymentsEnabled,
  isQuoteExpired,
  isReminderDue,
  isValidNubanAccountNumber,
  lastFour,
  nairaToKobo,
  paymentEventKey,
  resolveCuratorPaymentState,
  responseWindowDays,
  splitPitchPrice,
  summarizeQuoteLines,
  toArtistQuoteView,
  validatePaidFeedback,
  validatePitchPrice,
  type PricedPitch,
  type QuoteLine,
} from './pitch-payments';

// The pure half of curator pitch payments. Everything that decides an amount,
// a split or a refund lives here so it can be tested without Paystack or a
// database, and the routes are thin callers of it.

afterEach(() => {
  vi.unstubAllEnvs();
});

const pitch = (over: Partial<PricedPitch> & { pitchId: string }): PricedPitch => ({
  curatorUserId: 'curator-a',
  curatorName: 'SoundRise Uncovered',
  playlistName: 'Fresh Lagos',
  priceKobo: 500_000,
  responseWindowHours: PITCH_RESPONSE_WINDOW_HOURS,
  payoutAccountId: 'payout-a',
  subaccountCode: 'ACCT_a',
  ...over,
});

describe('the feature flag', () => {
  it('needs both pitching and pitch payments switched on', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS', 'true');
    expect(isPitchPaymentsEnabled()).toBe(true);
  });

  it('is off when pitching itself is off, whatever the payments flag says', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', 'false');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS', 'true');
    expect(isPitchPaymentsEnabled()).toBe(false);
  });

  it('is off by default', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS', '');
    expect(isPitchPaymentsEnabled()).toBe(false);
  });
});

describe('formatNaira and nairaToKobo', () => {
  it('are still exported from here, and are the ones in lib/money.ts', async () => {
    const money = await import('./money');
    expect(formatNaira).toBe(money.formatNaira);
    expect(nairaToKobo).toBe(money.nairaToKobo);
  });
});

describe('validatePitchPrice', () => {
  it('accepts the band edges and anything between', () => {
    expect(validatePitchPrice(PITCH_PRICE_MIN_KOBO)).toEqual({ ok: true });
    expect(validatePitchPrice(PITCH_PRICE_MAX_KOBO)).toEqual({ ok: true });
    expect(validatePitchPrice(800_000)).toEqual({ ok: true });
  });

  it('refuses outside the band with the spec copy, naming both edges', () => {
    const below = validatePitchPrice(PITCH_PRICE_MIN_KOBO - 100);
    expect(below).toEqual({ ok: false, error: 'Pick a price between ₦2,000 and ₦20,000.' });
    expect(validatePitchPrice(PITCH_PRICE_MAX_KOBO + 100).ok).toBe(false);
  });

  it('refuses a non-integer amount of kobo', () => {
    expect(validatePitchPrice(500_000.5).ok).toBe(false);
  });
});

describe('splitPitchPrice', () => {
  it('takes the Urganize fee off the price, matching the worked example', () => {
    // ₦5,000 at 20%: the curator gets ₦4,000 and Urganize keeps ₦1,000.
    expect(splitPitchPrice(500_000, 2000)).toEqual({
      curatorShareKobo: 400_000,
      platformFeeKobo: 100_000,
    });
  });

  it('always adds back up to the price, to the kobo', () => {
    for (const price of [200_001, 333_333, 1_999_999, 777_777]) {
      const split = splitPitchPrice(price, PITCH_PLATFORM_FEE_BPS);
      expect(split.curatorShareKobo + split.platformFeeKobo).toBe(price);
    }
  });

  it('rounds the curator share down, so a fraction of a kobo goes to the fee', () => {
    // 333,333 x 0.8 = 266,666.4 kobo.
    expect(splitPitchPrice(333_333, 2000).curatorShareKobo).toBe(266_666);
  });
});

describe('countWords and validatePaidFeedback', () => {
  it('counts words, not punctuation or spacing', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  one   two\nthree ')).toBe(3);
    expect(countWords('great hook — but the mix is muddy ...')).toBe(7);
    expect(countWords("doesn't count twice")).toBe(3);
  });

  it(`asks for at least ${MIN_PAID_FEEDBACK_WORDS} words, with the spec copy`, () => {
    expect(validatePaidFeedback('Nice song.')).toEqual({
      ok: false,
      error: 'Add a few more words. The artist paid for a real reply.',
    });
    const enough = Array.from({ length: MIN_PAID_FEEDBACK_WORDS }, (_, i) => `word${i}`).join(' ');
    expect(validatePaidFeedback(`  ${enough}  `)).toEqual({ ok: true, value: enough });
  });

  it('refuses a reply that is too long to store', () => {
    const long = `${'word '.repeat(500)}`;
    expect(validatePaidFeedback(long).ok).toBe(false);
  });
});

describe('buildQuoteLines', () => {
  it('prices each pitch and splits it', () => {
    const lines = buildQuoteLines({
      pitches: [pitch({ pitchId: 'p1' }), pitch({ pitchId: 'p2', curatorUserId: 'curator-b', subaccountCode: 'ACCT_b' })],
      recoveryAvailable: new Map(),
      feeBps: 2000,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      pitch_id: 'p1',
      price_kobo: 500_000,
      curator_share_kobo: 400_000,
      platform_fee_kobo: 100_000,
      recovery_applied_kobo: 0,
      split_share_kobo: 400_000,
      subaccount_code: 'ACCT_a',
      response_window_hours: PITCH_RESPONSE_WINDOW_HOURS,
    });
  });

  it('takes an open recovery off the curator share, oldest line first, never below zero', () => {
    const lines = buildQuoteLines({
      pitches: [pitch({ pitchId: 'p1' }), pitch({ pitchId: 'p2' })],
      // Owes ₦6,000: all of the first ₦4,000 share and ₦2,000 of the second.
      recoveryAvailable: new Map([['curator-a', 600_000]]),
      feeBps: 2000,
    });
    expect(lines.map((line) => line.recovery_applied_kobo)).toEqual([400_000, 200_000]);
    expect(lines.map((line) => line.split_share_kobo)).toEqual([0, 200_000]);
    // The artist pays the same either way: recovery only moves money between
    // Urganize and the curator.
    expect(summarizeQuoteLines(lines).totalKobo).toBe(1_000_000);
  });

  it('only recovers from the curator who owes', () => {
    const lines = buildQuoteLines({
      pitches: [pitch({ pitchId: 'p1', curatorUserId: 'curator-b' })],
      recoveryAvailable: new Map([['curator-a', 600_000]]),
      feeBps: 2000,
    });
    expect(lines[0].recovery_applied_kobo).toBe(0);
  });
});

describe('summarizeQuoteLines', () => {
  it('adds the worked example up: 3 curators at ₦5,000', () => {
    const lines = buildQuoteLines({
      pitches: [
        pitch({ pitchId: 'p1' }),
        pitch({ pitchId: 'p2', curatorUserId: 'curator-b', subaccountCode: 'ACCT_b' }),
        pitch({ pitchId: 'p3', curatorUserId: 'curator-c', subaccountCode: 'ACCT_c' }),
      ],
      recoveryAvailable: new Map(),
      feeBps: 2000,
    });
    expect(summarizeQuoteLines(lines)).toEqual({
      count: 3,
      totalKobo: 1_500_000,
      curatorShareTotalKobo: 1_200_000,
      platformFeeTotalKobo: 300_000,
    });
  });
});

describe('buildPaystackSplit', () => {
  const base = (over: Partial<QuoteLine>): QuoteLine => ({
    pitch_id: 'p',
    curator_user_id: 'c',
    curator_name: 'C',
    playlist_name: 'P',
    payout_account_id: 'pa',
    subaccount_code: 'ACCT_a',
    price_kobo: 500_000,
    curator_share_kobo: 400_000,
    platform_fee_kobo: 100_000,
    recovery_applied_kobo: 0,
    split_share_kobo: 400_000,
    response_window_hours: 168,
    ...over,
  });

  it('is a flat split with Urganize bearing the Paystack fee', () => {
    expect(buildPaystackSplit([base({})])).toEqual({
      type: 'flat',
      bearer_type: 'account',
      subaccounts: [{ subaccount: 'ACCT_a', share: 400_000 }],
    });
  });

  it('merges two playlists owned by one curator into one subaccount entry', () => {
    const split = buildPaystackSplit([base({ pitch_id: 'p1' }), base({ pitch_id: 'p2' })]);
    expect(split?.subaccounts).toEqual([{ subaccount: 'ACCT_a', share: 800_000 }]);
  });

  it('leaves out a curator whose whole share went to a recovery', () => {
    const split = buildPaystackSplit([
      base({ pitch_id: 'p1', split_share_kobo: 0, recovery_applied_kobo: 400_000 }),
      base({ pitch_id: 'p2', subaccount_code: 'ACCT_b' }),
    ]);
    expect(split?.subaccounts).toEqual([{ subaccount: 'ACCT_b', share: 400_000 }]);
  });

  it('answers null when nothing goes to a subaccount, so the charge is not split at all', () => {
    expect(buildPaystackSplit([base({ split_share_kobo: 0, recovery_applied_kobo: 400_000 })])).toBeNull();
  });
});

describe('allocatePaystackFee', () => {
  it('splits the fee by price and always adds back up to the total', () => {
    const lines = [
      { pitch_id: 'p1', price_kobo: 500_000 },
      { pitch_id: 'p2', price_kobo: 500_000 },
      { pitch_id: 'p3', price_kobo: 500_000 },
    ];
    const allocation = allocatePaystackFee(32_500, lines);
    expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(32_500);
    expect(allocation.p1).toBe(10_833);
    expect(allocation.p3).toBe(10_834);
  });

  it('answers an empty map for a missing or bad fee', () => {
    expect(allocatePaystackFee(null, [{ pitch_id: 'p1', price_kobo: 1 }])).toEqual({});
    expect(allocatePaystackFee(-5, [{ pitch_id: 'p1', price_kobo: 1 }])).toEqual({});
  });
});

describe('references and event keys', () => {
  it('marks pitch references so the webhook can route them without a lookup', () => {
    const reference = generatePitchReference();
    expect(reference.startsWith(PITCH_REFERENCE_PREFIX)).toBe(true);
    expect(isPitchPaymentReference(reference)).toBe(true);
    expect(isPitchPaymentReference('urganize_1700000000_ab12')).toBe(false);
    expect(isPitchPaymentReference(undefined)).toBe(false);
    // Paystack allows letters, numbers, hyphens, dots and equals signs.
    expect(reference).toMatch(/^[a-z0-9-]+$/);
    expect(generatePitchReference()).not.toBe(reference);
  });

  it('keys a refund on its own id, so two refunds on one checkout are both kept', () => {
    const first = paymentEventKey('refund.processed', { id: 11, transaction_reference: 'urgpitch-x' });
    const second = paymentEventKey('refund.processed', { id: 12, transaction_reference: 'urgpitch-x' });
    expect(first).not.toBe(second);
  });

  it('keys a charge on its reference', () => {
    expect(paymentEventKey('charge.success', { reference: 'urgpitch-x' })).toBe('urgpitch-x');
  });
});

describe('findUnrecordedRefund', () => {
  it('adopts a refund Paystack has that we never recorded, instead of refunding twice', () => {
    expect(findUnrecordedRefund([{ id: 7, amountKobo: 500_000, status: 'processed' }], [], 500_000)).toBe(7);
  });

  it('skips refunds already tied to another pitch from the same checkout', () => {
    const refunds = [
      { id: 7, amountKobo: 500_000, status: 'processed' },
      { id: 8, amountKobo: 500_000, status: 'pending' },
    ];
    expect(findUnrecordedRefund(refunds, [7], 500_000)).toBe(8);
    expect(findUnrecordedRefund(refunds, [7, 8], 500_000)).toBeNull();
  });

  it('ignores a different amount and a failed refund', () => {
    expect(findUnrecordedRefund([{ id: 7, amountKobo: 400_000, status: 'processed' }], [], 500_000)).toBeNull();
    expect(findUnrecordedRefund([{ id: 7, amountKobo: 500_000, status: 'failed' }], [], 500_000)).toBeNull();
  });
});

describe('strikes, windows and reminders', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('counts only strikes inside the window and after the last reset', () => {
    const strikes = ['2026-09-20T00:00:00Z', '2026-08-01T00:00:00Z', '2026-05-01T00:00:00Z'];
    expect(countRecentStrikes(strikes, now, null, 90)).toBe(2);
    expect(countRecentStrikes(strikes, now, '2026-09-01T00:00:00Z', 90)).toBe(1);
  });

  it('reads the window as whole days for the copy', () => {
    expect(responseWindowDays(168)).toBe(7);
    expect(responseWindowDays(36)).toBe(2);
  });

  it('expires a quote at its time, not before', () => {
    expect(isQuoteExpired('2026-09-25T12:00:01Z', now)).toBe(false);
    expect(isQuoteExpired('2026-09-25T12:00:00Z', now)).toBe(true);
    expect(isQuoteExpired('not a date', now)).toBe(true);
  });

  it('sends the reminder once, inside the last day', () => {
    expect(isReminderDue('2026-09-26T06:00:00Z', now, null, 24)).toBe(true);
    expect(isReminderDue('2026-09-27T12:00:01Z', now, null, 24)).toBe(false);
    expect(isReminderDue('2026-09-26T06:00:00Z', now, '2026-09-25T11:00:00Z', 24)).toBe(false);
    // Already past the deadline: the sweep expires it instead.
    expect(isReminderDue('2026-09-25T11:00:00Z', now, null, 24)).toBe(false);
  });
});

describe('bank accounts', () => {
  it('takes a 10-digit NUBAN and nothing else', () => {
    expect(isValidNubanAccountNumber('0123456789')).toBe(true);
    expect(isValidNubanAccountNumber('012345678')).toBe(false);
    expect(isValidNubanAccountNumber('01234567890')).toBe(false);
    expect(isValidNubanAccountNumber('01234 56789')).toBe(false);
  });

  it('keeps only the last four digits', () => {
    expect(lastFour('0123456789')).toBe('6789');
  });

  it('matches a bank name in any order, the way Nigerian banks print surname first', () => {
    expect(accountNameMatches('WENAPERE LUCKY TAMUNOBELEMA', ['Lucky Wenapere'])).toBe(true);
    expect(accountNameMatches('ADEBAYO TUNDE JOHN', ['tunde adebayo'])).toBe(true);
  });

  it('needs two names to agree, so a single common first name is not enough', () => {
    expect(accountNameMatches('ADEBAYO TUNDE JOHN', ['Tunde'])).toBe(false);
    expect(accountNameMatches('ADEBAYO TUNDE JOHN', ['SoundRise Uncovered'])).toBe(false);
    expect(accountNameMatches('ADEBAYO TUNDE JOHN', ['Tunde Bakare'])).toBe(false);
  });

  it('checks every candidate name, so the profile name can match when the brand name cannot', () => {
    expect(accountNameMatches('ADEBAYO TUNDE JOHN', ['SoundRise Uncovered', 'Tunde Adebayo'])).toBe(true);
    expect(accountNameMatches('', ['Tunde Adebayo'])).toBe(false);
  });
});

describe('toArtistQuoteView', () => {
  it('never hands an artist the recovery, the real split or anyone\'s ids', () => {
    const lines = buildQuoteLines({
      pitches: [pitch({ pitchId: 'p1' })],
      recoveryAvailable: new Map([['curator-a', 100_000]]),
      feeBps: 2000,
    });
    const view = toArtistQuoteView({
      id: 'q1',
      status: 'open',
      total_kobo: 500_000,
      platform_fee_bps: 2000,
      expires_at: '2026-09-25T12:30:00Z',
      paid_at: null,
      paystack_reference: 'urgpitch-abc',
      lines,
    });
    expect(Object.keys(view).sort()).toEqual(
      ['expiresAt', 'id', 'lines', 'paidAt', 'platformFeeTotalKobo', 'reference', 'status', 'totalKobo'].sort()
    );
    expect(Object.keys(view.lines[0]).sort()).toEqual(
      ['curatorName', 'curatorShareKobo', 'pitchId', 'playlistName', 'priceKobo', 'refund'].sort()
    );
    // The artist sees the NOMINAL share, never the one reduced by a recovery.
    expect(view.lines[0].curatorShareKobo).toBe(400_000);
    expect(view.platformFeeTotalKobo).toBe(100_000);
    expect(view.lines[0].refund).toBeNull();
  });

  it("says when a pitch on the receipt was refunded, from that pitch's own payment", () => {
    const lines = buildQuoteLines({
      pitches: [pitch({ pitchId: 'p1' }), pitch({ pitchId: 'p2' }), pitch({ pitchId: 'p3' })],
      recoveryAvailable: new Map(),
      feeBps: 2000,
    });
    const view = toArtistQuoteView(
      {
        id: 'q1',
        status: 'paid',
        total_kobo: 1_500_000,
        platform_fee_bps: 2000,
        expires_at: '2026-09-25T12:30:00Z',
        paid_at: '2026-09-25T12:10:00Z',
        paystack_reference: 'urgpitch-abc',
        lines,
      },
      new Map([
        ['p1', 'refunded'],
        ['p2', 'refund_failed'],
        ['p3', 'paid'],
      ])
    );
    // A refund that failed at Paystack is still owed, and the founder is on
    // it, so the artist reads it as on its way rather than as a failure.
    expect(view.lines.map((line) => line.refund)).toEqual(['refunded', 'pending', null]);
  });
});

describe('resolveCuratorPaymentState', () => {
  const pricing = { pitch_price_kobo: 500_000, response_window_hours: 168, is_live: true };
  const account = { id: 'payout-a', status: 'active', paystack_subaccount_code: 'ACCT_a' };

  it('is live only with a live price, an active account and an open inbox', () => {
    expect(
      resolveCuratorPaymentState({ curatorUserId: 'c', inboxPausedAt: null, pricing, payoutAccount: account })
    ).toEqual({
      curatorUserId: 'c',
      paused: false,
      priceKobo: 500_000,
      responseWindowHours: 168,
      payoutAccountId: 'payout-a',
      subaccountCode: 'ACCT_a',
    });
  });

  it('falls back to free pitches when any one of the three is missing', () => {
    const cases = [
      { pricing: null, payoutAccount: account, inboxPausedAt: null },
      { pricing: { ...pricing, is_live: false }, payoutAccount: account, inboxPausedAt: null },
      { pricing, payoutAccount: null, inboxPausedAt: null },
      { pricing, payoutAccount: { ...account, status: 'needs_review' }, inboxPausedAt: null },
      { pricing, payoutAccount: { ...account, paystack_subaccount_code: null }, inboxPausedAt: null },
      { pricing, payoutAccount: account, inboxPausedAt: '2026-09-20T00:00:00Z' },
    ];
    for (const entry of cases) {
      const state = resolveCuratorPaymentState({ curatorUserId: 'c', ...entry });
      expect(state.priceKobo).toBeNull();
      expect(state.subaccountCode).toBeNull();
    }
  });

  it('reports a pause even when there is no price at all', () => {
    expect(
      resolveCuratorPaymentState({ curatorUserId: 'c', inboxPausedAt: '2026-09-20T00:00:00Z', pricing: null, payoutAccount: null })
        .paused
    ).toBe(true);
  });
});

describe('limits', () => {
  it('caps a checkout at five pitches', () => {
    expect(MAX_PITCHES_PER_CHECKOUT).toBe(5);
  });
});
