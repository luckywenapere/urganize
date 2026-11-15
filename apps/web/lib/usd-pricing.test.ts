import { describe, expect, it } from 'vitest';
import {
  CREDIT_PACK_USD,
  EXTRA_RELEASE_PRICE_USD,
  NAIRA_PER_DOLLAR,
  PRICING_TIER_ORDER,
  formatMoney,
  formatTierFromPrice,
  formatTierPrice,
  getTierPriceIn,
  getTierPriceUsd,
  pricingCurrencyForCountry,
  tierHighlights,
  usdCentsToKoboEquivalent,
} from '@urganize/pricing';
import { TOPUP_PACKS, USD_PER_100_CREDITS, packPriceUsd } from './credits/packs';
import { bachsRowAmountMinor, bachsRowCurrency, payerCurrency, remoteCheckoutIsPaid } from './bachs';

// Dollar prices for everyone outside Nigeria (founder, 2026-11-07, #1112 and
// #1120). These pin the numbers the founder chose, so changing one is a
// deliberate edit here, not a side effect.

describe('the dollar ladder', () => {
  it('is Solo $8, Solo Plus $18, Manager $28 and Pro $80 a month', () => {
    expect(getTierPriceUsd('solo', 'monthly')).toEqual({ amount: 8, minorUnit: 800 });
    expect(getTierPriceUsd('solo_plus', 'monthly')).toEqual({ amount: 18, minorUnit: 1_800 });
    expect(getTierPriceUsd('manager', 'monthly')).toEqual({ amount: 28, minorUnit: 2_800 });
    expect(getTierPriceUsd('pro', 'monthly')).toEqual({ amount: 80, minorUnit: 8_000 });
  });

  it('charges ten months for a year, the same rule as Naira', () => {
    expect(getTierPriceUsd('solo', 'annual')?.amount).toBe(80);
    expect(getTierPriceUsd('manager', 'annual')?.amount).toBe(280);
    expect(getTierPriceUsd('pro', 'annual')?.amount).toBe(800);
  });

  it('shows no price for Label in either currency', () => {
    expect(getTierPriceUsd('label', 'monthly')).toBeNull();
    expect(formatTierPrice('label', 'monthly', 'USD')).toBeNull();
    expect(formatTierPrice('label', 'monthly', 'NGN')).toBeNull();
    expect(formatTierFromPrice('label')).toBe('Custom');
    expect(formatTierFromPrice('label', 'annual')).toBe('Custom');
  });

  it('formats dollars the way the cards read them', () => {
    expect(formatTierPrice('manager', 'monthly', 'USD')).toBe('$28/month');
    expect(formatTierPrice('pro', 'annual', 'USD')).toBe('$800/year');
    expect(formatMoney(1.5, 'USD')).toBe('$1.50');
    // Naira is unchanged by default.
    expect(formatTierPrice('manager', 'monthly')).toBe('₦15,000/month');
  });

  it('gives every self-serve tier on the page a dollar price', () => {
    for (const id of PRICING_TIER_ORDER) {
      if (id === 'label') continue;
      expect(getTierPriceIn(id, 'monthly', 'USD'), id).not.toBeNull();
    }
  });

  it('puts the dollar single price on the plan lines outside Nigeria', () => {
    expect(EXTRA_RELEASE_PRICE_USD).toBe(1.5);
    expect(tierHighlights('solo', { currency: 'USD' }).join(' ')).not.toContain('₦');
    expect(tierHighlights('pro', { currency: 'USD' }).join(' ')).toContain('Extra singles $1.50 each');
  });
});

describe('who pays in which currency', () => {
  it('is Naira in Nigeria and when we cannot tell, dollars elsewhere', () => {
    expect(pricingCurrencyForCountry('NG')).toBe('NGN');
    expect(pricingCurrencyForCountry('ng')).toBe('NGN');
    expect(pricingCurrencyForCountry(null)).toBe('NGN');
    expect(pricingCurrencyForCountry('')).toBe('NGN');
    expect(pricingCurrencyForCountry('XYZ')).toBe('NGN');
    expect(pricingCurrencyForCountry('GB')).toBe('USD');
    expect(pricingCurrencyForCountry('GH')).toBe('USD');
  });

  it('only shows dollars to someone Bachs can charge', () => {
    expect(payerCurrency(true, 'US')).toBe('USD');
    expect(payerCurrency(false, 'US')).toBe('NGN');
    expect(payerCurrency(true, 'NG')).toBe('NGN');
  });
});

describe('our books stay in kobo', () => {
  it('records a dollar payment at the fixed naira rate', () => {
    expect(NAIRA_PER_DOLLAR).toBe(1_500);
    expect(usdCentsToKoboEquivalent(2_900)).toBe(4_350_000);
  });
});

describe('dollar credit packs', () => {
  it('are 100 credits for $2, the figure the pricing page shows', () => {
    expect(USD_PER_100_CREDITS).toBe(CREDIT_PACK_USD.priceUsd);
    expect(CREDIT_PACK_USD.credits).toBe(100);
    expect(TOPUP_PACKS.map(packPriceUsd)).toEqual([2, 4, 10, 20]);
  });
});

describe('a Bachs checkout is paid only in the currency it was priced in', () => {
  const paid = { status: 'completed', payment_status: 'succeeded', reference: 'r' };

  it('reads old rows as Naira, asked in kobo', () => {
    expect(bachsRowCurrency({})).toBe('NGN');
    expect(bachsRowAmountMinor({ amount_kobo: 260_000 })).toBe(260_000);
  });

  it('matches a dollar row on cents, not on its naira equivalent', () => {
    const row = { reference: 'r', amount_kobo: 4_350_000, amount_minor: 2_900, currency: 'USD' };
    expect(remoteCheckoutIsPaid({ ...paid, amount: '29.00', currency: 'USD' }, row)).toBe(true);
    expect(remoteCheckoutIsPaid({ ...paid, amount: '29.00', currency: 'NGN' }, row)).toBe(false);
    expect(remoteCheckoutIsPaid({ ...paid, amount: '43500.00', currency: 'USD' }, row)).toBe(false);
    expect(remoteCheckoutIsPaid({ ...paid, amount: '9.00', currency: 'USD' }, row)).toBe(false);
  });
});
