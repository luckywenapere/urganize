import { describe, expect, it } from 'vitest';
import {
  EP_MAX_TRACKS,
  TRM_MARGIN,
  distributionAccess,
  distributionAllowanceCopy,
  distributionReleaseKind,
  teamDistributionPlan,
  tierHighlights,
  trmOwedFor,
} from '@urganize/pricing';
import {
  artistKeyFor,
  checkExtraReleasePayment,
  decideDistributionLimit,
  EXTRA_RELEASE_PRICE_KOBO,
  EXTRA_RELEASE_SOURCE,
  isExtraReleaseReference,
  TRM_PER_RELEASE_KOBO,
  lagosMonth,
  needsPayment,
  type DistributionUseRow,
} from './distribution-limits';

// Distribution limits (founder, 2026-10-26; Pro since 2026-11-07): Pro covers 1
// artist and 7 releases a month, Label 5 artists and 10, and a team paying
// yearly has no monthly cap. Anything beyond is one paid single, ₦2,000.

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

describe('Pro: 1 artist, 7 releases a month', () => {
  it('the first send is inside the plan and makes its artist the plan artist', () => {
    const view = decideDistributionLimit({ tier: 'pro', rows: [], releaseId: 'r1', artistKey: 'id:tems', now: NOW });
    expect(view?.verdict).toBe('ok');
    expect(view?.used).toBe(0);
    expect(view?.planArtists).toEqual([]);
  });

  it('a second artist needs a paid release', () => {
    const rows = [sent({ releaseId: 'r1' })];
    const view = decideDistributionLimit({ tier: 'pro', rows, releaseId: 'r2', artistKey: 'id:ayra', now: NOW });
    expect(view?.verdict).toBe('artist');
    expect(view?.planArtists).toEqual(['Tems']);
    expect(needsPayment(view!.verdict)).toBe(true);
  });

  it('the eighth release this month needs a paid release; last month does not count', () => {
    const rows = Array.from({ length: 7 }, (_, i) => sent({ releaseId: `r${i}` }));
    expect(decideDistributionLimit({ tier: 'pro', rows, releaseId: 'r9', artistKey: 'id:tems', now: NOW })?.verdict).toBe('releases');
    const older = rows.map((row) => ({ ...row, month: '2026-09' }));
    const view = decideDistributionLimit({ tier: 'pro', rows: older, releaseId: 'r9', artistKey: 'id:tems', now: NOW });
    expect(view?.verdict).toBe('ok');
    expect(view?.used).toBe(0);
  });

  it('a release that already counted, or was paid for, sends again for free', () => {
    const full = Array.from({ length: 7 }, (_, i) => sent({ releaseId: `r${i}` }));
    expect(decideDistributionLimit({ tier: 'pro', rows: full, releaseId: 'r3', artistKey: 'id:tems', now: NOW })?.verdict).toBe(
      'already_counted'
    );
    const paid = [...full, sent({ releaseId: 'x1', kind: 'extra', status: 'paid', artistKey: 'id:ayra' })];
    expect(decideDistributionLimit({ tier: 'pro', rows: paid, releaseId: 'x1', artistKey: 'id:ayra', now: NOW })?.verdict).toBe(
      'paid_extra'
    );
  });

  it('a checkout started but not paid does not unlock the release', () => {
    const rows = [sent({ releaseId: 'r1' }), sent({ releaseId: 'x1', kind: 'extra', status: 'pending', artistKey: 'id:ayra' })];
    expect(decideDistributionLimit({ tier: 'pro', rows, releaseId: 'x1', artistKey: 'id:ayra', now: NOW })?.verdict).toBe('artist');
  });

  it('paid extras never use up the plan count or become a plan artist', () => {
    const rows = [sent({ releaseId: 'r1' }), sent({ releaseId: 'x1', kind: 'extra', status: 'used', artistKey: 'id:ayra', artistName: 'Ayra' })];
    const view = decideDistributionLimit({ tier: 'pro', rows, releaseId: 'r2', artistKey: 'id:tems', now: NOW });
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
  it('accepts exactly ₦2,000 in naira, paid, from our own checkout; TRM is owed ₦1,600 of it', () => {
    expect(EXTRA_RELEASE_PRICE_KOBO).toBe(200_000);
    expect(TRM_PER_RELEASE_KOBO).toBe(160_000);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 200_000, metadata: meta })).toEqual({
      ok: true,
      releaseId: 'r1',
      workspaceId: 'w1',
    });
  });

  it('refuses anything else', () => {
    expect(checkExtraReleasePayment({ status: 'abandoned', currency: 'NGN', amountKobo: 200_000, metadata: meta })).toEqual({ ok: false, reason: 'not_paid' });
    // The old ₦2,200 and TRM's share are both wrong amounts now.
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 220_000, metadata: meta }).ok).toBe(false);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 160_000, metadata: meta }).ok).toBe(false);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'USD', amountKobo: 200_000, metadata: meta }).ok).toBe(false);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 200_000, metadata: { ...meta, source: 'credits_purchase' } }).ok).toBe(false);
    expect(checkExtraReleasePayment({ status: 'success', currency: 'NGN', amountKobo: 200_000, metadata: null }).ok).toBe(false);
  });

  it('knows its own references', () => {
    expect(isExtraReleaseReference('urgextra-abc')).toBe(true);
    expect(isExtraReleaseReference('urgcredits-abc')).toBe(false);
  });
});

describe('a team paying yearly is on TRM\'s yearly plan, with no monthly cap', () => {
  it('lets the eighth release this month go without paying', () => {
    const rows = Array.from({ length: 7 }, (_, i) => sent({ releaseId: `r${i}`, artistKey: 'id:tems' }));
    const monthly = decideDistributionLimit({ tier: 'pro', rows, releaseId: 'r9', artistKey: 'id:tems', now: NOW });
    expect(monthly?.verdict).toBe('releases');
    const yearly = decideDistributionLimit({ tier: 'pro', rows, releaseId: 'r9', artistKey: 'id:tems', now: NOW, teamPlan: 'yearly' });
    expect(yearly?.verdict).toBe('ok');
    expect(yearly?.releasesLimit).toBeNull();
  });

  it('still covers only the plan artists', () => {
    const rows = [sent({ releaseId: 'r1', artistKey: 'id:tems' })];
    const view = decideDistributionLimit({ tier: 'pro', rows, releaseId: 'r2', artistKey: 'id:ayra', now: NOW, teamPlan: 'yearly' });
    expect(view?.verdict).toBe('artist');
  });
});

describe('what TRM distributes, and on which plan (TRM, 2026-11-07)', () => {
  it('reads single, EP or album from the type first, then the song count', () => {
    expect(distributionReleaseKind({ releaseType: 'ep', trackCount: 1 })).toBe('ep');
    expect(distributionReleaseKind({ releaseType: null, trackCount: 1 })).toBe('single');
    expect(distributionReleaseKind({ releaseType: null, trackCount: 2 })).toBe('ep');
    expect(distributionReleaseKind({ releaseType: null, trackCount: EP_MAX_TRACKS })).toBe('ep');
    expect(distributionReleaseKind({ releaseType: null, trackCount: EP_MAX_TRACKS + 1 })).toBe('album');
    expect(distributionReleaseKind({ releaseType: 'music_video' })).toBe('single');
    expect(distributionReleaseKind({})).toBe('single');
  });

  it('a single may always go; an EP needs a monthly or yearly plan; an album a yearly one', () => {
    for (const teamPlan of ['none', 'monthly', 'yearly'] as const) {
      expect(distributionAccess({ releaseType: 'single', teamPlan })).toBe('allowed');
    }
    expect(distributionAccess({ releaseType: 'ep', teamPlan: 'none' })).toBe('needs_monthly_plan');
    expect(distributionAccess({ releaseType: 'ep', teamPlan: 'monthly' })).toBe('allowed');
    expect(distributionAccess({ releaseType: 'ep', teamPlan: 'yearly' })).toBe('allowed');
    expect(distributionAccess({ releaseType: 'album', teamPlan: 'none' })).toBe('needs_yearly_plan');
    expect(distributionAccess({ releaseType: 'album', teamPlan: 'monthly' })).toBe('needs_yearly_plan');
    expect(distributionAccess({ releaseType: 'album', teamPlan: 'yearly' })).toBe('allowed');
  });

  it('Pro and Label get the TRM plan that matches how they pay; Solo and Manager get none', () => {
    expect(teamDistributionPlan('pro', 'monthly')).toBe('monthly');
    expect(teamDistributionPlan('pro', 'annual')).toBe('yearly');
    expect(teamDistributionPlan('label', 'semiannual')).toBe('yearly');
    expect(teamDistributionPlan('label', null)).toBe('monthly');
    expect(teamDistributionPlan('solo', 'annual')).toBe('none');
    expect(teamDistributionPlan('manager', 'annual')).toBe('none');
    expect(teamDistributionPlan(null, 'annual')).toBe('none');
  });

  it('we keep 20% of what a team pays TRM through us', () => {
    expect(TRM_MARGIN).toBe(0.2);
    expect(trmOwedFor(200_000)).toBe(160_000);
    expect(trmOwedFor(710_000)).toBe(568_000);
    expect(trmOwedFor(9_000_000)).toBe(7_200_000);
  });
});

describe('the plan cards say the same numbers', () => {
  it('Pro and Label state their allowance and the extra price; Solo and Manager send from their own TRM account (no in-app single checkout yet)', () => {
    expect(distributionAllowanceCopy('pro')).toBe('Distribution for 1 of your artists, 7 releases a month');
    expect(distributionAllowanceCopy('label')).toBe('Distribution for 5 of your artists, 10 releases a month');
    expect(distributionAllowanceCopy('pro', 'annual')).toBe('Distribution for 1 of your artists, no monthly cap');
    expect(distributionAllowanceCopy('manager')).toBeNull();
    expect(tierHighlights('pro')).toContain('Extra singles ₦2,000 each');
    expect(tierHighlights('solo')).toContain('Send singles to stores from your own TRM account');
    expect(tierHighlights('manager')).toContain('Send singles to stores from your own TRM account');
  });
});
