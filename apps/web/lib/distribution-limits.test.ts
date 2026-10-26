import { describe, expect, it } from 'vitest';
import { distributionAllowanceCopy, tierHighlights } from '@urganize/pricing';
import {
  artistKeyFor,
  checkExtraReleasePayment,
  decideDistributionLimit,
  EXTRA_RELEASE_PRICE_KOBO,
  EXTRA_RELEASE_SOURCE,
  isExtraReleaseReference,
  lagosMonth,
  needsPayment,
  type DistributionUseRow,
} from './distribution-limits';

// Distribution limits (founder, 2026-10-26): Manager covers 1 artist and 7
// releases a month, Label 5 artists and 10; anything beyond is ₦2,100 a release.

const NOW = new Date('2026-10-26T12:00:00.000Z');
let seq = 0;
function sent(over: Partial<DistributionUseRow> & { releaseId: string }): DistributionUseRow {
  seq += 1;
  return {
    artistKey: 'id:tems',
    artistName: 'Tems',
    kind: 'plan',
    month: '2026-10',
    status: 'used',
    createdAt: `2026-10-${String(Math.min(seq, 28)).padStart(2, '0')}T09:00:00.000Z`,
    ...over,
  };
}

describe('the Lagos month', () => {
  it('turns at midnight Lagos, an hour before UTC', () => {
    expect(lagosMonth(new Date('2026-10-31T22:59:00.000Z')).key).toBe('2026-10');
    expect(lagosMonth(new Date('2026-10-31T23:00:00.000Z')).key).toBe('2026-11');
    expect(lagosMonth(NOW).nextStartsAt.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(lagosMonth(new Date('2026-12-15T00:00:00.000Z')).key).toBe('2026-12');
    expect(lagosMonth(new Date('2026-12-15T00:00:00.000Z')).nextStartsAt.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });
});

describe('Manager: 1 artist, 7 releases a month', () => {
  it('the first send is inside the plan and makes its artist the plan artist', () => {
    const view = decideDistributionLimit({ tier: 'manager', rows: [], releaseId: 'r1', artistKey: 'id:tems', now: NOW });
    expect(view?.verdict).toBe('ok');
    expect(view?.used).toBe(0);
    expect(view?.planArtists).toEqual([]);
  });

  it('a second artist needs a paid release', () => {
    const rows = [sent({ releaseId: 'r1' })];
    const view = decideDistributionLimit({ tier: 'manager', rows, releaseId: 'r2', artistKey: 'id:ayra', now: NOW });
    expect(view?.verdict).toBe('artist');
    expect(view?.planArtists).toEqual(['Tems']);
    expect(needsPayment(view!.verdict)).toBe(true);
  });

  it('the eighth release this month needs a paid release; last month does not count', () => {
    const rows = Array.from({ length: 7 }, (_, i) => sent({ releaseId: `r${i}` }));
    expect(decideDistributionLimit({ tier: 'manager', rows, releaseId: 'r9', artistKey: 'id:tems', now: NOW })?.verdict).toBe('releases');
    const older = rows.map((row) => ({ ...row, month: '2026-09' }));
    const view = decideDistributionLimit({ tier: 'manager', rows: older, releaseId: 'r9', artistKey: 'id:tems', now: NOW });
    expect(view?.verdict).toBe('ok');
    expect(view?.used).toBe(0);
  });

  it('a release that already counted, or was paid for, sends again for free', () => {
    const full = Array.from({ length: 7 }, (_, i) => sent({ releaseId: `r${i}` }));
    expect(decideDistributionLimit({ tier: 'manager', rows: full, releaseId: 'r3', artistKey: 'id:tems', now: NOW })?.verdict).toBe(
      'already_counted'
    );
    const paid = [...full, sent({ releaseId: 'x1', kind: 'extra', status: 'paid', artistKey: 'id:ayra' })];
    expect(decideDistributionLimit({ tier: 'manager', rows: paid, releaseId: 'x1', artistKey: 'id:ayra', now: NOW })?.verdict).toBe(
      'paid_extra'
    );
  });

  it('a checkout started but not paid does not unlock the release', () => {
    const rows = [sent({ releaseId: 'r1' }), sent({ releaseId: 'x1', kind: 'extra', status: 'pending', artistKey: 'id:ayra' })];
    expect(decideDistributionLimit({ tier: 'manager', rows, releaseId: 'x1', artistKey: 'id:ayra', now: NOW })?.verdict).toBe('artist');
  });

  it('paid extras never use up the plan count or become a plan artist', () => {
    const rows = [sent({ releaseId: 'r1' }), sent({ releaseId: 'x1', kind: 'extra', status: 'used', artistKey: 'id:ayra', artistName: 'Ayra' })];
    const view = decideDistributionLimit({ tier: 'manager', rows, releaseId: 'r2', artistKey: 'id:tems', now: NOW });
    expect(view?.used).toBe(1);
    expect(view?.planArtists).toEqual(['Tems']);
    expect(view?.verdict).toBe('ok');
  });
});

describe('Label: 5 artists, 10 releases a month', () => {
  it('takes five artists, then asks for a paid release for the sixth', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((a, i) => sent({ releaseId: `r${i}`, artistKey: `id:${a}`, artistName: a.toUpperCase() }));
    expect(decideDistributionLimit({ tier: 'label', rows, releaseId: 'r6', artistKey: 'id:c', now: NOW })?.verdict).toBe('ok');
    const view = decideDistributionLimit({ tier: 'label', rows, releaseId: 'r6', artistKey: 'id:f', now: NOW });
    expect(view?.verdict).toBe('artist');
    expect(view?.planArtists).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('ten releases a month', () => {
    const rows = Array.from({ length: 10 }, (_, i) => sent({ releaseId: `r${i}` }));
    expect(decideDistributionLimit({ tier: 'label', rows, releaseId: 'r11', artistKey: 'id:tems', now: NOW })?.verdict).toBe('releases');
  });
});

describe('teams without an allowance', () => {
  it('Solo has no limits to apply (it sends with the artist own TRM plan)', () => {
    expect(decideDistributionLimit({ tier: 'solo', rows: [], releaseId: 'r1', artistKey: null, now: NOW })).toBeNull();
  });
});

describe('who a release is for', () => {
  it('uses the artist row, else the name, else nobody', () => {
    expect(artistKeyFor('abc', 'Tems')).toBe('id:abc');
    expect(artistKeyFor(null, '  Tems ')).toBe('name:tems');
    expect(artistKeyFor(null, ' ')).toBeNull();
  });
});

describe('paying for one extra release', () => {
  const meta = { source: EXTRA_RELEASE_SOURCE, release_id: 'r1', workspace_id: 'w1' };
  it('accepts exactly ₦2,100 in naira, paid, from our own checkout', () => {
    expect(EXTRA_RELEASE_PRICE_KOBO).toBe(210_000);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 210_000, metadata: meta })).toEqual({
      ok: true,
      releaseId: 'r1',
      workspaceId: 'w1',
    });
  });

  it('refuses anything else', () => {
    expect(checkExtraReleasePayment({ status: 'abandoned', currency: 'NGN', amountKobo: 210_000, metadata: meta })).toEqual({ ok: false, reason: 'not_paid' });
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 200_000, metadata: meta }).ok).toBe(false);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'USD', amountKobo: 210_000, metadata: meta }).ok).toBe(false);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 210_000, metadata: { ...meta, source: 'credits_purchase' } }).ok).toBe(false);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 210_000, metadata: null }).ok).toBe(false);
  });

  it('knows its own references', () => {
    expect(isExtraReleaseReference('urgextra-abc')).toBe(true);
    expect(isExtraReleaseReference('urgcredits-abc')).toBe(false);
  });
});

describe('the plan cards say the same numbers', () => {
  it('Manager and Label state their allowance and the extra price; Solo says nothing', () => {
    expect(distributionAllowanceCopy('manager')).toBe('Distribution for 1 artist, 7 releases a month');
    expect(distributionAllowanceCopy('label')).toBe('Distribution for 5 artists, 10 releases a month');
    expect(tierHighlights('manager')).toContain('Extra releases ₦2,100 each');
    expect(tierHighlights('solo').some((line) => /distribution|extra release/i.test(line))).toBe(false);
  });
});
