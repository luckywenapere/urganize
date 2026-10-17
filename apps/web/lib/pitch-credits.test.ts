import { describe, expect, it } from 'vitest';
import * as copy from './pitch-credits';
import {
  CURATOR_KOBO_PER_CREDIT,
  PITCH_CREDIT_TIERS,
  curatorEarningKobo,
  daysLeft,
  isPitchCreditTier,
  isPitchCreditsEnabled,
  normalizeCreditPrice,
  pitchRefundKey,
  pitchSpendKey,
  pitchesAffordable,
  planCreditCharge,
  selectionTotal,
  smallestCoveringPack,
  splitCreditCharge,
  trayFootnote,
  sentReceipt,
  topUpLead,
} from './pitch-credits';

const ON = {
  NEXT_PUBLIC_FEATURE_PITCHING: 'true',
  NEXT_PUBLIC_FEATURE_URGANS_CREDITS: 'true',
  NEXT_PUBLIC_FEATURE_PITCH_CREDITS: undefined,
};

describe('the switch', () => {
  it('ships on: on unless the env says exactly false', () => {
    expect(isPitchCreditsEnabled(ON)).toBe(true);
    expect(isPitchCreditsEnabled({ ...ON, NEXT_PUBLIC_FEATURE_PITCH_CREDITS: 'true' })).toBe(true);
    expect(isPitchCreditsEnabled({ ...ON, NEXT_PUBLIC_FEATURE_PITCH_CREDITS: 'false' })).toBe(false);
  });

  it('needs pitching and the credits system', () => {
    expect(isPitchCreditsEnabled({ ...ON, NEXT_PUBLIC_FEATURE_PITCHING: 'false' })).toBe(false);
    expect(isPitchCreditsEnabled({ ...ON, NEXT_PUBLIC_FEATURE_URGANS_CREDITS: undefined })).toBe(false);
  });
});

describe('tiers', () => {
  it('are Free 0, Standard 100, Top 250', () => {
    expect([...PITCH_CREDIT_TIERS]).toEqual([0, 100, 250]);
    expect(isPitchCreditTier(100)).toBe(true);
    expect(isPitchCreditTier(150)).toBe(false);
    expect(isPitchCreditTier('100')).toBe(false);
  });

  it('reads a stored price safely (anything odd is Free)', () => {
    expect(normalizeCreditPrice(250)).toBe(250);
    expect(normalizeCreditPrice('100')).toBe(100);
    expect(normalizeCreditPrice(null)).toBe(0);
    expect(normalizeCreditPrice(-5)).toBe(0);
    expect(normalizeCreditPrice(undefined)).toBe(0);
  });

  it('totals a selection, Free counting nothing', () => {
    expect(selectionTotal([100, 0, 100, 100])).toBe(300);
    expect(selectionTotal([0, 0])).toBe(0);
  });
});

describe('charging (mirrors send_credit_pitches)', () => {
  it('draws trial first, then the allowance, then the top-up pool', () => {
    expect(splitCreditCharge(100, { trial: 50, allowance: 30, topup: 500 })).toEqual({ trial: 50, allowance: 30, topup: 20 });
    expect(splitCreditCharge(100, { trial: 0, allowance: 660, topup: 0 })).toEqual({ trial: 0, allowance: 100, topup: 0 });
  });

  it('never goes negative: a short balance is a refusal, not an overshoot', () => {
    expect(splitCreditCharge(100, { trial: 50, allowance: 0, topup: 40 })).toBeNull();
  });

  it('trial credits alone (50) can never reach a paid tier', () => {
    const plan = planCreditCharge([100], { trial: 50, allowance: 0, topup: 0 });
    expect(plan.ok).toBe(false);
  });

  it('charges a whole send against one balance, pitch by pitch', () => {
    const plan = planCreditCharge([100, 0, 250], { trial: 50, allowance: 200, topup: 300 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.total).toBe(350);
    expect(plan.perPitch).toEqual([
      { trial: 50, allowance: 50, topup: 0 },
      { trial: 0, allowance: 0, topup: 0 },
      { trial: 0, allowance: 150, topup: 100 },
    ]);
    expect(plan.after).toEqual({ trial: 0, allowance: 0, topup: 200 });
  });

  it('refuses the whole send when the balance is short, and says by how much', () => {
    const plan = planCreditCharge([100, 100, 100], { trial: 0, allowance: 60, topup: 60 });
    expect(plan).toEqual({ ok: false, total: 300, balance: 120, short: 180 });
  });

  it('keys every ledger row to the pitch and the source, so a retry charges and refunds once', () => {
    expect(pitchSpendKey('p1', 'allowance')).toBe('spend:pitch:p1:allowance');
    expect(pitchRefundKey('p1', 'allowance')).toBe('refund:pitch:p1:allowance');
  });
});

describe('the top-up sheet', () => {
  it('preselects the smallest pack that covers the gap', () => {
    expect(smallestCoveringPack('subscriber', 180)?.pack.priceNaira).toBe(3000);
    expect(smallestCoveringPack('subscriber', 100)?.pack.priceNaira).toBe(1500);
    // Credits-only buys half as many credits for the same price.
    expect(smallestCoveringPack('credits_only', 180)?.pack.priceNaira).toBe(7500);
    expect(smallestCoveringPack('subscriber', 5000)).toBeNull();
  });
});

describe('copy', () => {
  it('reads the balance in pitches, at the Standard tier', () => {
    expect(pitchesAffordable(560)).toBe(5);
    expect(pitchesAffordable(99)).toBe(0);
    expect(pitchesAffordable(-20)).toBe(0);
    expect(trayFootnote(300, 860)).toBe('300 credits · 560 left, enough for 5 pitches');
    expect(trayFootnote(100, 200)).toBe('100 credits · 100 left, enough for 1 pitch');
    expect(trayFootnote(0, 860)).toBe('Free · 860 credits left');
  });

  it('matches the approved mocks', () => {
    expect(copy.PITCH_CREDITS_SUBTITLE).toBe('A listen and a written reply in 7 days, or your credits back.');
    expect(copy.sendButtonLabel(3)).toBe('Send to 3');
    expect(topUpLead(180, 3)).toBe('You need 180 more. Your 3 pitches send once you pay.');
    expect(sentReceipt(300, 260)).toBe('−300 credits · 260 left');
    expect(copy.replyEarningPill(100000)).toBe('₦1,000 for your reply');
    expect(copy.refundedLine(250)).toBe('No reply · +250 credits');
    expect(copy.daysLeftLabel(4)).toBe('4 days left');
    expect(copy.daysLeftLabel(1)).toBe('1 day left');
  });

  const strings = (): string[] =>
    Object.values(copy).flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (typeof value === 'function') {
        try {
          const out = (value as (...args: unknown[]) => unknown)('Ada', 3, 3, 3);
          return typeof out === 'string' ? [out] : [];
        } catch {
          return [];
        }
      }
      return [];
    });

  it('never promises a playlist spot', () => {
    for (const line of strings()) expect(line.toLowerCase()).not.toContain('placement');
  });

  it('never says "credits" to a curator', () => {
    const curatorLines = [
      copy.replyEarningPill(100000),
      copy.curatorReminderLine('Kola', 100000),
      copy.curatorMissedLine('Kola', 1, 3),
      copy.newPaidPitchLine('Kola', 'Midnight Run', 100000),
      copy.PAID_ON_REPLY,
      copy.wordCounter(3, 15),
    ];
    for (const line of curatorLines) expect(line.toLowerCase()).not.toContain('credit');
  });
});

describe('curator earnings and deadlines', () => {
  it('pays ₦10 a credit', () => {
    expect(CURATOR_KOBO_PER_CREDIT).toBe(1000);
    expect(curatorEarningKobo(100)).toBe(100_000);
    expect(curatorEarningKobo(250)).toBe(250_000);
    expect(curatorEarningKobo(0)).toBe(0);
  });

  it('counts whole days left, rounding up, 0 once passed', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    expect(daysLeft('2026-10-24T12:00:00Z', now)).toBe(7);
    expect(daysLeft('2026-10-17T13:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-10-17T11:00:00Z', now)).toBe(0);
    expect(daysLeft(null, now)).toBe(0);
  });
});
