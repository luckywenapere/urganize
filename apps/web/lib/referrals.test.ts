import { describe, expect, it } from 'vitest';
import {
  ATTACH_WINDOW_DAYS,
  addMonthsUtc,
  buildPartnerStatement,
  chargeExclusionWhenRecorded,
  commissionOnCharge,
  decideAttach,
  isPastDue,
  isReferralsEnabled,
  lagosMonth,
  normalizeReferralCode,
  parseReferralAdminAction,
  payoutDueDate,
  REFERRALS_OFF_EXCLUSION_REASON,
  referralLink,
  type LedgerCharge,
} from './referrals';

const TERMS = { commissionBps: 1000, commissionMonths: 12 };
const NOW = new Date('2026-12-20T10:00:00Z');

function charge(over: Partial<LedgerCharge> & { reference: string }): LedgerCharge {
  return {
    workspaceId: 'ws-1',
    amountKobo: 2_200_000,
    chargedAt: '2026-11-05T09:00:00Z',
    source: 'initial',
    excluded: false,
    ...over,
  };
}

describe('the switch', () => {
  it('is off unless the value is exactly true', () => {
    expect(isReferralsEnabled({})).toBe(false);
    expect(isReferralsEnabled({ NEXT_PUBLIC_FEATURE_REFERRALS: '1' })).toBe(false);
    expect(isReferralsEnabled({ NEXT_PUBLIC_FEATURE_REFERRALS: 'yes' })).toBe(false);
    expect(isReferralsEnabled({ NEXT_PUBLIC_FEATURE_REFERRALS: ' TRUE ' })).toBe(true);
  });

  it('writes a payment made while it is off already excluded, so it earns no commission', () => {
    const paidAt = new Date('2026-11-05T09:00:00Z');
    expect(chargeExclusionWhenRecorded(true, paidAt)).toEqual({ excluded_at: null, excluded_reason: null });
    expect(chargeExclusionWhenRecorded(false, paidAt)).toEqual({
      excluded_at: '2026-11-05T09:00:00.000Z',
      excluded_reason: REFERRALS_OFF_EXCLUSION_REASON,
    });
  });

  it('a tagged team earns nothing on a payment recorded while it was off', () => {
    const team = { workspaceId: 'ws-1', name: 'Team', attachedAt: '2026-10-01T00:00:00Z' };
    const off = chargeExclusionWhenRecorded(false, new Date('2026-11-05T09:00:00Z'));
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [charge({ reference: 'paid-while-off', excluded: off.excluded_at !== null })],
      payouts: [],
      now: NOW,
    });
    expect(statement.teams[0].chargeCount).toBe(0);
    expect(statement.teams[0].commissionKobo).toBe(0);
  });
});

describe('codes', () => {
  it('upper-cases and trims a code read off a link', () => {
    expect(normalizeReferralCode('  soundwave ')).toBe('SOUNDWAVE');
    expect(normalizeReferralCode('sw_spot-2')).toBe('SW_SPOT-2');
  });

  it('refuses anything that could not be a code', () => {
    expect(normalizeReferralCode('ab')).toBeNull();
    expect(normalizeReferralCode('a'.repeat(41))).toBeNull();
    expect(normalizeReferralCode('sound wave')).toBeNull();
    expect(normalizeReferralCode('<script>')).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });

  it('builds the link a partner shares', () => {
    expect(referralLink('SOUNDWAVE')).toBe('https://go.urganize.app/onboarding?ref=SOUNDWAVE');
    expect(referralLink('X Y', 'https://example.com/')).toBe('https://example.com/onboarding?ref=X%20Y');
  });
});

describe('tagging a team', () => {
  const base = {
    codeWasValid: true,
    partner: { active: true },
    workspace: { createdAt: '2026-12-18T10:00:00Z' },
    alreadyTagged: false,
    joinedByInvite: false,
    now: NOW,
  };

  it('accepts a new team with a live code', () => {
    expect(decideAttach(base)).toEqual({ ok: true });
  });

  it('refuses each reason with its own answer', () => {
    expect(decideAttach({ ...base, codeWasValid: false })).toEqual({ ok: false, reason: 'bad_code' });
    expect(decideAttach({ ...base, partner: null })).toEqual({ ok: false, reason: 'unknown_code' });
    expect(decideAttach({ ...base, partner: { active: false } })).toEqual({ ok: false, reason: 'inactive_code' });
    expect(decideAttach({ ...base, workspace: null })).toEqual({ ok: false, reason: 'no_team' });
    expect(decideAttach({ ...base, alreadyTagged: true })).toEqual({ ok: false, reason: 'already_tagged' });
    expect(decideAttach({ ...base, joinedByInvite: true })).toEqual({ ok: false, reason: 'joined_by_invite' });
  });

  it('only tags a team inside its first days', () => {
    const edge = new Date(NOW.getTime() - ATTACH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    expect(decideAttach({ ...base, workspace: { createdAt: edge } })).toEqual({ ok: true });
    const over = new Date(NOW.getTime() - (ATTACH_WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1)).toISOString();
    expect(decideAttach({ ...base, workspace: { createdAt: over } })).toEqual({ ok: false, reason: 'too_late' });
  });

  it('lets the founder tag an older team or an invitee by hand, and nothing else', () => {
    const old = { ...base, workspace: { createdAt: '2025-01-01T00:00:00Z' }, skipSelfServiceChecks: true };
    expect(decideAttach(old)).toEqual({ ok: true });
    expect(decideAttach({ ...old, joinedByInvite: true })).toEqual({ ok: true });
    expect(decideAttach({ ...old, alreadyTagged: true })).toEqual({ ok: false, reason: 'already_tagged' });
    expect(decideAttach({ ...old, partner: { active: false } })).toEqual({ ok: false, reason: 'inactive_code' });
    expect(decideAttach({ ...old, workspace: null })).toEqual({ ok: false, reason: 'no_team' });
  });

  it('fails closed on a creation date it cannot read', () => {
    expect(decideAttach({ ...base, workspace: { createdAt: null } })).toEqual({ ok: false, reason: 'too_late' });
    expect(decideAttach({ ...base, workspace: { createdAt: 'nonsense' } })).toEqual({ ok: false, reason: 'too_late' });
  });
});

describe('commission on one payment', () => {
  it('is ten percent, rounded down to the kobo', () => {
    expect(commissionOnCharge(2_200_000, 1000)).toBe(220_000);
    expect(commissionOnCharge(999, 1000)).toBe(99);
    expect(commissionOnCharge(5, 1000)).toBe(0);
  });

  it('is zero for nothing or nonsense', () => {
    expect(commissionOnCharge(0, 1000)).toBe(0);
    expect(commissionOnCharge(-500, 1000)).toBe(0);
    expect(commissionOnCharge(Number.NaN, 1000)).toBe(0);
  });
});

describe('months', () => {
  it('adds calendar months and clamps to the end of a short month', () => {
    expect(addMonthsUtc(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonthsUtc(new Date('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(addMonthsUtc(new Date('2026-03-05T08:30:00Z'), 12).toISOString()).toBe('2027-03-05T08:30:00.000Z');
    expect(addMonthsUtc(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
  });

  it('puts a payment in the Lagos month it cleared in', () => {
    // 23:30 UTC on 31 October is already 00:30 on 1 November in Lagos.
    expect(lagosMonth('2026-10-31T23:30:00Z')).toBe('2026-11');
    expect(lagosMonth('2026-10-31T22:59:00Z')).toBe('2026-10');
    expect(lagosMonth('2026-12-31T23:30:00Z')).toBe('2027-01');
  });

  it('is due on the 10th of the month after', () => {
    expect(payoutDueDate('2026-11')).toBe('2026-12-10');
    expect(payoutDueDate('2026-12')).toBe('2027-01-10');
  });

  it('counts the whole of the 10th as on time', () => {
    expect(isPastDue('2026-11', new Date('2026-12-10T22:30:00Z'))).toBe(false);
    expect(isPastDue('2026-11', new Date('2026-12-10T23:00:00Z'))).toBe(true);
    expect(isPastDue('2026-11', new Date('2026-12-11T09:00:00Z'))).toBe(true);
  });
});

describe('a partner statement', () => {
  const team = { workspaceId: 'ws-1', name: 'Northline', attachedAt: '2026-11-01T00:00:00Z' };

  it('has nothing owed before the first payment', () => {
    const statement = buildPartnerStatement({ terms: TERMS, teams: [team], charges: [], payouts: [], now: NOW });
    expect(statement.totalCommissionKobo).toBe(0);
    expect(statement.months).toEqual([]);
    expect(statement.teams[0]).toMatchObject({ firstChargeAt: null, windowEndsAt: null, earning: true });
  });

  it('pays ten percent of a team payment in the month it cleared', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [charge({ reference: 'a' })],
      payouts: [],
      now: NOW,
    });
    expect(statement.months).toHaveLength(1);
    expect(statement.months[0]).toMatchObject({
      month: '2026-11',
      baseKobo: 2_200_000,
      commissionKobo: 220_000,
      outstandingKobo: 220_000,
      paidKobo: null,
      dueOn: '2026-12-10',
      overdue: true,
    });
    expect(statement.totalOutstandingKobo).toBe(220_000);
  });

  it('never counts a payment from before the team was tagged', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [charge({ reference: 'old', chargedAt: '2026-10-20T00:00:00Z' })],
      payouts: [],
      now: NOW,
    });
    expect(statement.totalCommissionKobo).toBe(0);
  });

  it('skips an excluded (refunded) payment', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [charge({ reference: 'a', excluded: true }), charge({ reference: 'b', chargedAt: '2026-11-09T00:00:00Z' })],
      payouts: [],
      now: NOW,
    });
    expect(statement.months[0].chargeCount).toBe(1);
    expect(statement.totalCommissionKobo).toBe(220_000);
  });

  it('counts twelve months from the first counted payment, and not a day more', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [
        charge({ reference: 'first', chargedAt: '2026-11-05T09:00:00Z' }),
        charge({ reference: 'last-in', chargedAt: '2027-11-05T08:59:59Z', source: 'renewal' }),
        charge({ reference: 'first-out', chargedAt: '2027-11-05T09:00:00Z', source: 'renewal' }),
      ],
      payouts: [],
      now: new Date('2028-01-01T00:00:00Z'),
    });
    expect(statement.teams[0].chargeCount).toBe(2);
    expect(statement.teams[0].earning).toBe(false);
    expect(statement.months.map((line) => line.month).sort()).toEqual(['2026-11', '2027-11']);
  });

  it('starts the window at the first COUNTED payment, so a refunded first payment does not eat a month', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [
        charge({ reference: 'refunded', chargedAt: '2026-11-05T09:00:00Z', excluded: true }),
        charge({ reference: 'real', chargedAt: '2026-12-05T09:00:00Z' }),
      ],
      payouts: [],
      now: NOW,
    });
    expect(statement.teams[0].firstChargeAt).toBe('2026-12-05T09:00:00Z');
    expect(statement.teams[0].windowEndsAt).toBe('2027-12-05T09:00:00.000Z');
  });

  it('keeps teams apart', () => {
    const other = { workspaceId: 'ws-2', name: 'Other', attachedAt: '2026-11-01T00:00:00Z' };
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team, other],
      charges: [
        charge({ reference: 'a', workspaceId: 'ws-1', amountKobo: 1_000_000 }),
        charge({ reference: 'b', workspaceId: 'ws-2', amountKobo: 5_000_000 }),
        charge({ reference: 'c', workspaceId: 'ws-9', amountKobo: 9_000_000 }),
        charge({ reference: 'd', workspaceId: null, amountKobo: 9_000_000 }),
      ],
      payouts: [],
      now: NOW,
    });
    expect(statement.teams.find((t) => t.workspaceId === 'ws-1')?.commissionKobo).toBe(100_000);
    expect(statement.teams.find((t) => t.workspaceId === 'ws-2')?.commissionKobo).toBe(500_000);
    expect(statement.totalCommissionKobo).toBe(600_000);
  });

  it('uses the partner terms, not a hard-coded rate', () => {
    const statement = buildPartnerStatement({
      terms: { commissionBps: 2000, commissionMonths: 1 },
      teams: [team],
      charges: [
        charge({ reference: 'a', chargedAt: '2026-11-05T09:00:00Z' }),
        charge({ reference: 'b', chargedAt: '2026-12-06T09:00:00Z', source: 'renewal' }),
      ],
      payouts: [],
      now: NOW,
    });
    expect(statement.totalCommissionKobo).toBe(440_000);
    expect(statement.teams[0].chargeCount).toBe(1);
  });

  it('shows a month as settled once it is paid in full', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [charge({ reference: 'a' })],
      payouts: [{ month: '2026-11', amountKobo: 220_000, paidAt: '2026-12-09T10:00:00Z' }],
      now: NOW,
    });
    expect(statement.months[0]).toMatchObject({ paidKobo: 220_000, outstandingKobo: 0, overpaidKobo: 0, overdue: false });
    expect(statement.totalOutstandingKobo).toBe(0);
    expect(statement.totalPaidKobo).toBe(220_000);
  });

  it('shows what is left after a part payment', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [charge({ reference: 'a' })],
      payouts: [{ month: '2026-11', amountKobo: 100_000, paidAt: '2026-12-09T10:00:00Z' }],
      now: NOW,
    });
    expect(statement.months[0].outstandingKobo).toBe(120_000);
    expect(statement.months[0].overdue).toBe(true);
  });

  it('shows an overpayment when a refund was excluded after the payout', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [charge({ reference: 'a', excluded: true })],
      payouts: [{ month: '2026-11', amountKobo: 220_000, paidAt: '2026-12-09T10:00:00Z' }],
      now: NOW,
    });
    expect(statement.months[0]).toMatchObject({ commissionKobo: 0, outstandingKobo: 0, overpaidKobo: 220_000 });
    expect(statement.totalOutstandingKobo).toBe(0);
  });

  it('lists the newest month first', () => {
    const statement = buildPartnerStatement({
      terms: TERMS,
      teams: [team],
      charges: [
        charge({ reference: 'a', chargedAt: '2026-11-05T09:00:00Z' }),
        charge({ reference: 'b', chargedAt: '2026-12-05T09:00:00Z', source: 'renewal' }),
      ],
      payouts: [],
      now: NOW,
    });
    expect(statement.months.map((line) => line.month)).toEqual(['2026-12', '2026-11']);
  });
});

describe('admin actions', () => {
  const uuid = '5b2a4f4e-1d3c-4a5b-9c6d-7e8f9a0b1c2d';

  it('creates a partner with a clean code', () => {
    expect(parseReferralAdminAction({ type: 'create_partner', name: ' Sound Wave Spotlight ', code: 'soundwave' })).toEqual({
      ok: true,
      action: { type: 'create_partner', name: 'Sound Wave Spotlight', code: 'SOUNDWAVE', contactEmail: null },
    });
    const withEmail = parseReferralAdminAction({
      type: 'create_partner',
      name: 'X',
      code: 'abc',
      contactEmail: 'Hello@Example.com',
    });
    expect(withEmail.ok && withEmail.action).toMatchObject({ contactEmail: 'hello@example.com' });
  });

  it('refuses a bad partner', () => {
    expect(parseReferralAdminAction({ type: 'create_partner', name: '', code: 'abc' }).ok).toBe(false);
    expect(parseReferralAdminAction({ type: 'create_partner', name: 'X', code: 'a b' }).ok).toBe(false);
    expect(parseReferralAdminAction({ type: 'create_partner', name: 'X', code: 'abc', contactEmail: 'nope' }).ok).toBe(false);
  });

  it('records a payout in kobo from naira, and rejects nonsense', () => {
    const ok = parseReferralAdminAction({ type: 'record_payout', partnerId: uuid, month: '2026-11', amountNaira: 2200.5 });
    expect(ok.ok && ok.action).toMatchObject({ amountKobo: 220_050, note: null });
    expect(parseReferralAdminAction({ type: 'record_payout', partnerId: uuid, month: '2026-13', amountNaira: 1 }).ok).toBe(false);
    expect(parseReferralAdminAction({ type: 'record_payout', partnerId: uuid, month: '2026-11', amountNaira: -1 }).ok).toBe(false);
    expect(parseReferralAdminAction({ type: 'record_payout', partnerId: uuid, month: '2026-11', amountNaira: 'abc' }).ok).toBe(false);
    expect(parseReferralAdminAction({ type: 'record_payout', partnerId: 'x', month: '2026-11', amountNaira: 1 }).ok).toBe(false);
    expect(parseReferralAdminAction({ type: 'record_payout', partnerId: uuid, month: '2026-11', amountNaira: 1e12 }).ok).toBe(false);
  });

  it('needs a reason to exclude a payment', () => {
    expect(parseReferralAdminAction({ type: 'exclude_charge', reference: 'r1', reason: '' }).ok).toBe(false);
    expect(parseReferralAdminAction({ type: 'exclude_charge', reference: 'r1', reason: 'refunded' }).ok).toBe(true);
    expect(parseReferralAdminAction({ type: 'restore_charge', reference: 'r1' }).ok).toBe(true);
  });

  it('tags a team by the owner email', () => {
    const parsed = parseReferralAdminAction({ type: 'attach_team', code: 'soundwave', ownerEmail: 'Owner@Team.com' });
    expect(parsed.ok && parsed.action).toEqual({ type: 'attach_team', code: 'SOUNDWAVE', ownerEmail: 'owner@team.com' });
    expect(parseReferralAdminAction({ type: 'attach_team', code: 'soundwave', ownerEmail: 'x' }).ok).toBe(false);
  });

  it('refuses an unknown action or body', () => {
    expect(parseReferralAdminAction({ type: 'delete_everything' }).ok).toBe(false);
    expect(parseReferralAdminAction(null).ok).toBe(false);
    expect(parseReferralAdminAction('x').ok).toBe(false);
  });
});
