import { describe, expect, it } from 'vitest';
import {
  resolveCreditsReturnPath,
  CREDITS_REFERENCE_PREFIX,
  buildPurchaseMetadata,
  checkPurchase,
  creditsReference,
  isCreditsReference,
  purchaseDedupeKey,
  type VerifiedPurchase,
} from './purchase';

const meta = (over: Record<string, unknown> = {}) => ({
  ...buildPurchaseMetadata({
    workspaceId: 'ws-1',
    ownerUserId: 'owner-1',
    userId: 'user-1',
    priceNaira: 3000,
    credits: 200,
  }),
  ...over,
});

function paid(over: Partial<VerifiedPurchase> = {}): VerifiedPurchase {
  return { status: 'success', currency: 'NGN', amountKobo: 300_000, metadata: meta(), ...over };
}

describe('references', () => {
  it('are recognised on the prefix alone', () => {
    expect(isCreditsReference(creditsReference('abc'))).toBe(true);
    expect(creditsReference('abc')).toBe(`${CREDITS_REFERENCE_PREFIX}abc`);
    expect(isCreditsReference('urgpitch-abc')).toBe(false);
    expect(isCreditsReference(undefined)).toBe(false);
    expect(isCreditsReference(42)).toBe(false);
  });
});

describe('checkPurchase', () => {
  it('credits a paid pack at either of its two rates', () => {
    expect(checkPurchase(paid())).toMatchObject({ ok: true, credits: 200, priceNaira: 3000, workspaceId: 'ws-1' });
    expect(checkPurchase(paid({ metadata: meta({ credits: 100 }) }))).toMatchObject({ ok: true, credits: 100 });
  });

  it('says not paid for anything but a success, so it is retried', () => {
    for (const status of ['abandoned', 'failed', 'pending', 'ongoing', '']) {
      expect(checkPurchase(paid({ status }))).toEqual({ ok: false, reason: 'not_paid' });
    }
  });

  it('refuses an amount that is not the pack price to the kobo', () => {
    expect(checkPurchase(paid({ amountKobo: 299_999 }))).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkPurchase(paid({ amountKobo: 300_001 }))).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkPurchase(paid({ amountKobo: 150_000 }))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuses a currency that is not naira', () => {
    expect(checkPurchase(paid({ currency: 'USD' }))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuses credits that no pack gives, even at the right price', () => {
    expect(checkPurchase(paid({ metadata: meta({ credits: 5000 }) }))).toEqual({ ok: false, reason: 'mismatch' });
    // 500 is the 7,500 pack's number, not the 3,000 pack's.
    expect(checkPurchase(paid({ metadata: meta({ credits: 500 }) }))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuses a price that is not one of the four packs', () => {
    const result = checkPurchase(paid({ amountKobo: 400_000, metadata: meta({ price_naira: 4000, credits: 200 }) }));
    expect(result).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuses a transaction that was not one of ours', () => {
    expect(checkPurchase(paid({ metadata: meta({ source: 'pitch_checkout' }) }))).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkPurchase(paid({ metadata: null }))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuses a transaction with no team or no payer', () => {
    expect(checkPurchase(paid({ metadata: meta({ workspace_id: '' }) }))).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkPurchase(paid({ metadata: meta({ user_id: '' }) }))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('reads numbers that arrive as text', () => {
    expect(checkPurchase(paid({ metadata: meta({ price_naira: '3000', credits: '200' }) }))).toMatchObject({
      ok: true,
      credits: 200,
    });
  });
});

describe('purchaseDedupeKey', () => {
  it('is one key per reference, which is what makes a purchase land once', () => {
    expect(purchaseDedupeKey('urgcredits-abc')).toBe('topup:urgcredits-abc');
    expect(purchaseDedupeKey('urgcredits-abc')).toBe(purchaseDedupeKey('urgcredits-abc'));
    expect(purchaseDedupeKey('urgcredits-abc')).not.toBe(purchaseDedupeKey('urgcredits-abd'));
  });
});

describe('resolveCreditsReturnPath', () => {
  it('returns to the AI page behind the wall when asked', () => {
    expect(resolveCreditsReturnPath('/locked/urgans')).toBe('/locked/urgans');
    expect(resolveCreditsReturnPath('/dashboard/credits')).toBe('/dashboard/credits');
  });

  it('answers the credits page for anything else, so the browser cannot pick where Paystack sends someone', () => {
    for (const value of [undefined, null, '', 'https://evil.test', '//evil.test', '/locked', '/locked/urgans/', 42]) {
      expect(resolveCreditsReturnPath(value)).toBe('/dashboard/credits');
    }
  });
});
