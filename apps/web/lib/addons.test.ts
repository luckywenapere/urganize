import { describe, expect, it } from 'vitest';
import {
  ADDON_GRACE_DAYS,
  ADDON_SOURCE,
  addonExtras,
  addonIsLive,
  addonPriceKobo,
  addonRefusal,
  addonTrmOwedKobo,
  checkAddonPayment,
  distributionAddonPlanFor,
  isAddonReference,
  isAddonRenewalReference,
  isCardCheckReference,
  parseAddonRequest,
  periodEndFrom,
  planRenewals,
  type AddonRow,
} from './addons';

const NOW = new Date('2026-11-10T12:00:00Z');
const DAY = 86_400_000;

function row(over: Partial<AddonRow> & { id: string }): AddonRow {
  return {
    kind: 'person',
    quantity: 1,
    interval: 'monthly',
    artistKey: null,
    artistName: null,
    unitPriceKobo: 300_000,
    status: 'active',
    currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    createdAt: '2026-11-01T00:00:00Z',
    ...over,
  };
}

describe('prices', () => {
  it('charges the approved prices, times the quantity', () => {
    expect(addonPriceKobo({ kind: 'person', quantity: 2, interval: 'monthly' })).toBe(600_000);
    expect(addonPriceKobo({ kind: 'artist', quantity: 1, interval: 'monthly' })).toBe(500_000);
    expect(addonPriceKobo({ kind: 'distribution', quantity: 1, interval: 'monthly' })).toBe(710_000);
    expect(addonPriceKobo({ kind: 'distribution', quantity: 1, interval: 'yearly' })).toBe(2_550_000);
  });

  it('owes TRM 80% of distribution and nothing on people or artists', () => {
    expect(addonTrmOwedKobo('distribution', 710_000)).toBe(568_000);
    expect(addonTrmOwedKobo('distribution', 2_550_000)).toBe(2_040_000);
    expect(addonTrmOwedKobo('person', 300_000)).toBe(0);
  });
});

describe('who can buy what', () => {
  it('sells people and artists to Manager and Pro, distribution to Solo and Manager', () => {
    expect(addonRefusal({ tier: 'manager', paying: true, kind: 'person' })).toBeNull();
    expect(addonRefusal({ tier: 'pro', paying: true, kind: 'artist' })).toBeNull();
    expect(addonRefusal({ tier: 'solo', paying: true, kind: 'distribution' })).toBeNull();
    expect(addonRefusal({ tier: 'manager', paying: true, kind: 'distribution' })).toBeNull();
    expect(addonRefusal({ tier: 'solo', paying: true, kind: 'person' })).toMatch(/Manager/);
    expect(addonRefusal({ tier: 'pro', paying: true, kind: 'distribution' })).toMatch(/already includes/);
    expect(addonRefusal({ tier: 'label', paying: true, kind: 'person' })).toMatch(/Talk to us/);
  });

  it('needs a paid plan', () => {
    expect(addonRefusal({ tier: 'manager', paying: false, kind: 'person' })).toMatch(/paid plan/);
    expect(addonRefusal({ tier: null, paying: true, kind: 'person' })).toMatch(/paid plan/);
  });
});

describe('parseAddonRequest', () => {
  it('reads kind, quantity and period, and never a price', () => {
    expect(parseAddonRequest({ kind: 'person', quantity: 3, priceKobo: 1 })).toEqual({
      ok: true,
      request: { kind: 'person', quantity: 3, interval: 'monthly' },
    });
    expect(parseAddonRequest({ kind: 'distribution', interval: 'yearly', quantity: 9 })).toEqual({
      ok: true,
      request: { kind: 'distribution', quantity: 1, interval: 'yearly' },
    });
    expect(parseAddonRequest({ kind: 'person', interval: 'yearly' })).toEqual({
      ok: true,
      request: { kind: 'person', quantity: 1, interval: 'monthly' },
    });
  });

  it('refuses a bad kind or quantity', () => {
    expect(parseAddonRequest({ kind: 'credits' }).ok).toBe(false);
    expect(parseAddonRequest({ kind: 'person', quantity: 0 }).ok).toBe(false);
    expect(parseAddonRequest({ kind: 'person', quantity: 21 }).ok).toBe(false);
    expect(parseAddonRequest({ kind: 'person', quantity: 1.5 }).ok).toBe(false);
  });
});

describe('what an add-on gives', () => {
  it('counts live people and artists', () => {
    const rows = [
      row({ id: 'a', kind: 'person', quantity: 2 }),
      row({ id: 'b', kind: 'artist', quantity: 1 }),
      row({ id: 'c', kind: 'person', status: 'paused' }),
      row({ id: 'd', kind: 'artist', currentPeriodEnd: new Date(NOW.getTime() - (ADDON_GRACE_DAYS + 1) * DAY).toISOString() }),
    ];
    expect(addonExtras(rows, NOW)).toEqual({ seats: 2, artists: 1 });
  });

  it('keeps an unpaid renewal live through the grace days, but a removed one stops at its end', () => {
    const lapsed = new Date(NOW.getTime() - DAY).toISOString();
    expect(addonIsLive({ status: 'active', currentPeriodEnd: lapsed }, NOW)).toBe(true);
    expect(addonIsLive({ status: 'active', currentPeriodEnd: lapsed, cancelAtPeriodEnd: true }, NOW)).toBe(false);
    expect(addonIsLive({ status: 'pending', currentPeriodEnd: null }, NOW)).toBe(false);
  });

  it('tells which TRM plan an artist has', () => {
    const rows = [
      row({ id: 'a', kind: 'distribution', artistKey: 'id:1', interval: 'monthly' }),
      row({ id: 'b', kind: 'distribution', artistKey: 'id:2', interval: 'yearly' }),
      row({ id: 'c', kind: 'distribution', artistKey: 'id:3', status: 'paused' }),
    ];
    expect(distributionAddonPlanFor(rows, 'id:1', NOW)).toBe('monthly');
    expect(distributionAddonPlanFor(rows, 'id:2', NOW)).toBe('yearly');
    expect(distributionAddonPlanFor(rows, 'id:3', NOW)).toBeNull();
    expect(distributionAddonPlanFor(rows, null, NOW)).toBeNull();
  });
});

describe('periods and renewals', () => {
  it('runs a month or a year on', () => {
    expect(periodEndFrom(new Date('2026-11-07T10:00:00Z'), 'monthly').toISOString()).toBe('2026-12-07T10:00:00.000Z');
    expect(periodEndFrom(new Date('2026-11-07T10:00:00Z'), 'yearly').toISOString()).toBe('2027-11-07T10:00:00.000Z');
  });

  it('charges what is due, ends what was removed, pauses what stayed unpaid', () => {
    const due = new Date(NOW.getTime() - 60_000).toISOString();
    const old = new Date(NOW.getTime() - (ADDON_GRACE_DAYS + 0.5) * DAY).toISOString();
    const plan = planRenewals(
      [
        row({ id: 'charge', currentPeriodEnd: due }),
        row({ id: 'cancel', currentPeriodEnd: due, cancelAtPeriodEnd: true }),
        row({ id: 'pause', currentPeriodEnd: old }),
        row({ id: 'later' }),
        row({ id: 'paused', status: 'paused', currentPeriodEnd: old }),
      ],
      NOW
    );
    expect(plan).toEqual({ charge: ['charge'], pause: ['pause'], cancel: ['cancel'] });
  });
});

describe('checkAddonPayment', () => {
  const expected = { addonId: 'a1', workspaceId: 'w1', amountKobo: 300_000 };
  const meta = { source: ADDON_SOURCE, addon_id: 'a1', workspace_id: 'w1' };

  it('accepts exactly the price for the row', () => {
    expect(checkAddonPayment({ status: 'success', currency: 'NGN', amountKobo: 300_000, metadata: meta }, expected)).toEqual({ ok: true });
  });

  it('refuses anything else', () => {
    expect(checkAddonPayment({ status: 'abandoned', currency: 'NGN', amountKobo: 300_000, metadata: meta }, expected)).toEqual({ ok: false, reason: 'not_paid' });
    expect(checkAddonPayment({ status: 'success', currency: 'NGN', amountKobo: 299_999, metadata: meta }, expected)).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkAddonPayment({ status: 'success', currency: 'NGN', amountKobo: 300_000, metadata: { ...meta, addon_id: 'b' } }, expected)).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkAddonPayment({ status: 'success', currency: 'USD', amountKobo: 300_000, metadata: meta }, expected)).toEqual({ ok: false, reason: 'mismatch' });
  });
});

describe('references', () => {
  it('keeps the three prefixes apart', () => {
    expect(isAddonReference('urgaddon-abc')).toBe(true);
    expect(isAddonReference('urgaddren-abc')).toBe(false);
    expect(isAddonRenewalReference('urgaddren-abc')).toBe(true);
    expect(isCardCheckReference('urgcard-abc')).toBe(true);
    expect(isCardCheckReference('urgextra-abc')).toBe(false);
  });
});
