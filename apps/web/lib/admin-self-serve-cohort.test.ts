import { describe, expect, it } from 'vitest';
import {
  cohortCell,
  median,
  parseFounderMinutes,
  parseRecordTransfer,
  summarizeCohorts,
  week2ActiveFor,
  type CohortTeam,
} from './admin-self-serve-cohort';

const NOW = new Date('2026-10-22T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function team(over: Partial<CohortTeam> = {}): CohortTeam {
  return {
    workspaceId: 'w',
    createdAt: new Date(NOW.getTime() - 30 * DAY).toISOString(),
    acquisitionPath: 'self_serve',
    plan: null,
    paymentMethod: null,
    paid: false,
    founderMinutes: 0,
    taskActionTimes: [],
    ...over,
  };
}

describe('week2ActiveFor', () => {
  it('counts a task action on days 8 to 14 only', () => {
    const created = new Date(NOW.getTime() - 30 * DAY);
    const at = (days: number) => new Date(created.getTime() + days * DAY).toISOString();
    expect(week2ActiveFor(team({ createdAt: created.toISOString(), taskActionTimes: [at(7)] }), NOW)).toBe(true);
    expect(week2ActiveFor(team({ createdAt: created.toISOString(), taskActionTimes: [at(13.9)] }), NOW)).toBe(true);
    expect(week2ActiveFor(team({ createdAt: created.toISOString(), taskActionTimes: [at(6.9)] }), NOW)).toBe(false);
    expect(week2ActiveFor(team({ createdAt: created.toISOString(), taskActionTimes: [at(14)] }), NOW)).toBe(false);
  });

  it('does not judge a team younger than 14 days', () => {
    expect(week2ActiveFor(team({ createdAt: new Date(NOW.getTime() - 10 * DAY).toISOString() }), NOW)).toBeNull();
  });
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('cohortCell', () => {
  it('takes founder minutes from paying teams only', () => {
    const cell = cohortCell(
      [team({ paid: true, founderMinutes: 30 }), team({ paid: true, founderMinutes: 10 }), team({ founderMinutes: 0 })],
      NOW
    );
    expect(cell.signUps).toBe(3);
    expect(cell.paid).toBe(2);
    expect(cell.paidRate).toBeCloseTo(2 / 3);
    expect(cell.medianFounderMinutes).toBe(20);
  });

  it('reports no rate instead of zero when there is nothing to divide', () => {
    const cell = cohortCell([], NOW);
    expect(cell.paidRate).toBeNull();
    expect(cell.week2Rate).toBeNull();
    expect(cell.medianFounderMinutes).toBeNull();
  });
});

describe('summarizeCohorts', () => {
  it('splits self-serve from concierge and leaves legacy out', () => {
    const summary = summarizeCohorts({
      now: NOW,
      teams: [
        team({ acquisitionPath: 'self_serve', plan: 'manager', paymentMethod: 'card', paid: true }),
        team({ acquisitionPath: 'concierge', plan: 'manager', paymentMethod: 'transfer', paid: true }),
        team({ acquisitionPath: 'legacy', plan: 'manager', paid: true }),
      ],
    });
    expect(summary.all.selfServe.signUps).toBe(1);
    expect(summary.all.concierge.signUps).toBe(1);
    expect(summary.byPlan.find((row) => row.key === 'manager')?.selfServe.paid).toBe(1);
    expect(summary.byMethod.find((row) => row.key === 'transfer')?.concierge.paid).toBe(1);
    expect(summary.byMethod.find((row) => row.key === 'card')?.concierge.signUps).toBe(0);
  });
});

describe('parseRecordTransfer', () => {
  const good = {
    ownerEmail: ' Ada@Example.com ',
    amountNaira: '30000',
    receivedAt: '2026-10-20',
    bankReference: 'GTB 123',
    plan: 'manager',
    period: 'monthly',
  };

  it('accepts a full form and turns naira into kobo', () => {
    const parsed = parseRecordTransfer(good, NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.ownerEmail).toBe('ada@example.com');
    expect(parsed.value.amountKobo).toBe(3_000_000);
    expect(parsed.value.periodEnd).toBeNull();
  });

  it('refuses a missing reference, a future date and an end before the start', () => {
    expect(parseRecordTransfer({ ...good, bankReference: ' ' }, NOW).ok).toBe(false);
    expect(parseRecordTransfer({ ...good, receivedAt: '2026-11-30' }, NOW).ok).toBe(false);
    expect(parseRecordTransfer({ ...good, periodEnd: '2026-10-19' }, NOW).ok).toBe(false);
    expect(parseRecordTransfer({ ...good, plan: 'group' }, NOW).ok).toBe(false);
    expect(parseRecordTransfer({ ...good, amountNaira: 0 }, NOW).ok).toBe(false);
  });

  it('keeps an end date the admin sets', () => {
    const parsed = parseRecordTransfer({ ...good, periodEnd: '2026-12-20' }, NOW);
    expect(parsed.ok && parsed.value.periodEnd?.toISOString().slice(0, 10)).toBe('2026-12-20');
  });
});

describe('parseFounderMinutes', () => {
  it('takes whole minutes for a team id', () => {
    expect(parseFounderMinutes({ workspaceId: '11111111-1111-1111-1111-111111111111', minutes: 45 })).toEqual({
      ok: true,
      workspaceId: '11111111-1111-1111-1111-111111111111',
      minutes: 45,
    });
    expect(parseFounderMinutes({ workspaceId: 'x', minutes: 1 }).ok).toBe(false);
    expect(parseFounderMinutes({ workspaceId: '11111111-1111-1111-1111-111111111111', minutes: 1.5 }).ok).toBe(false);
  });
});
