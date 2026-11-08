import { describe, expect, it } from 'vitest';
import { decideOwnDistribution, isBlocked, needsPayment, type DistributionUseRow } from './distribution-limits';

// Solo and Manager (#1112): pay ₦2,000 per single, or send under the artist's
// Distribution add-on.

const NOW = new Date('2026-11-10T12:00:00Z');

function use(over: Partial<DistributionUseRow> & { releaseId: string }): DistributionUseRow {
  return {
    artistKey: 'id:a',
    artistName: 'Ayo Kings',
    kind: 'addon',
    month: '2026-11',
    status: 'used',
    createdAt: '2026-11-02T00:00:00Z',
    ...over,
  };
}

const base = { tier: 'manager' as const, releaseId: 'r1', artistKey: 'id:a', artistName: 'Ayo Kings', now: NOW };

describe('no add-on', () => {
  it('asks ₦2,000 for a single', () => {
    const view = decideOwnDistribution({ ...base, rows: [], addonPlan: null, releaseType: 'single' });
    expect(view).toMatchObject({ mode: 'per_single', verdict: 'single', canPay: true, extraPriceKobo: 200_000 });
    expect(needsPayment(view.verdict)).toBe(true);
  });

  it('sends a paid single, and a resend costs nothing', () => {
    const rows = [use({ releaseId: 'r1', kind: 'extra', status: 'paid' })];
    expect(decideOwnDistribution({ ...base, rows, addonPlan: null }).verdict).toBe('paid_extra');
  });

  it('sends an EP or album only with the add-on', () => {
    for (const releaseType of ['ep', 'album']) {
      const view = decideOwnDistribution({ ...base, rows: [], addonPlan: null, releaseType });
      expect(view.verdict).toBe('needs_addon');
      expect(view.canPay).toBe(false);
      expect(needsPayment(view.verdict)).toBe(false);
      expect(isBlocked(view.verdict)).toBe(true);
    }
  });
});

describe('with the add-on', () => {
  it('covers 7 releases a month on monthly', () => {
    const six = Array.from({ length: 6 }, (_, i) => use({ releaseId: `old${i}` }));
    expect(decideOwnDistribution({ ...base, rows: six, addonPlan: 'monthly' })).toMatchObject({
      mode: 'addon',
      verdict: 'ok',
      used: 6,
      releasesLimit: 7,
      planArtists: ['Ayo Kings'],
    });
    const seven = [...six, use({ releaseId: 'old6' })];
    expect(decideOwnDistribution({ ...base, rows: seven, addonPlan: 'monthly' }).verdict).toBe('releases');
  });

  it('counts only this artist and this month', () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => use({ releaseId: `b${i}`, artistKey: 'id:b' })),
      ...Array.from({ length: 7 }, (_, i) => use({ releaseId: `oct${i}`, month: '2026-10' })),
    ];
    expect(decideOwnDistribution({ ...base, rows, addonPlan: 'monthly' }).verdict).toBe('ok');
  });

  it('has no cap on yearly, and takes albums only there', () => {
    const many = Array.from({ length: 20 }, (_, i) => use({ releaseId: `x${i}` }));
    expect(decideOwnDistribution({ ...base, rows: many, addonPlan: 'yearly', releaseType: 'album' }).verdict).toBe('ok');
    expect(decideOwnDistribution({ ...base, rows: [], addonPlan: 'monthly', releaseType: 'album' }).verdict).toBe('needs_addon');
    expect(decideOwnDistribution({ ...base, rows: [], addonPlan: 'monthly', releaseType: 'ep' }).verdict).toBe('ok');
  });

  it('never counts a release twice', () => {
    expect(decideOwnDistribution({ ...base, rows: [use({ releaseId: 'r1' })], addonPlan: 'monthly' }).verdict).toBe('already_counted');
  });
});
