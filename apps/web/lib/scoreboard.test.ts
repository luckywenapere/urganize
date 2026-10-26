import { describe, expect, it } from 'vitest';
import {
  rolloutOriginSummary,
  activationSummary,
  activeMembersSince,
  buildScoreboard,
  isPayingTeam,
  monthlyRecurringMinor,
  referralSummary,
  releaseLiveAt,
  secondReleaseSummary,
  trialToPaidSummary,
  weekFourRetention,
  weekStartUtc,
  type ScoreboardInput,
  type ScoreboardRelease,
  type ScoreboardSubscription,
  type ScoreboardTeam,
} from './scoreboard';
import { formatNaira, formatRate, formatScoreboardForTeamGroup, referredLine } from './scoreboard-format';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-02T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();
const dateOnly = (iso: string) => iso.slice(0, 10);

function subscription(over: Partial<ScoreboardSubscription> = {}): ScoreboardSubscription {
  return {
    userId: 'owner-1',
    plan: 'manager',
    status: 'active',
    amountMinor: 2_200_000,
    billingInterval: 'monthly',
    expiresAt: daysAhead(20),
    ...over,
  };
}

function team(over: Partial<ScoreboardTeam> & { workspaceId: string }): ScoreboardTeam {
  return {
    name: over.workspaceId,
    ownerUserId: `owner-${over.workspaceId}`,
    createdAt: daysAgo(200),
    ownerSignedUpAt: daysAgo(200),
    memberUserIds: [`owner-${over.workspaceId}`],
    firstInviteAt: null,
    state: 'paid',
    comped: false,
    allowlisted: false,
    subscription: null,
    trialStartedAt: null,
    trialEndsAt: null,
    ownerPaidAt: null,
    ...over,
  };
}

function release(over: Partial<ScoreboardRelease> & { id: string; workspaceId: string }): ScoreboardRelease {
  return {
    createdAt: daysAgo(150),
    updatedAt: daysAgo(150),
    releaseDate: null,
    status: 'draft',
    isTest: false,
    taskCount: 0,
    allTasksDone: false,
    lastTaskDoneAt: null,
    ...over,
  };
}

describe('rolloutOriginSummary (2026-10-24)', () => {
  it('counts real rollouts by why they were made, untagged ones as unknown', () => {
    const summary = rolloutOriginSummary([
      release({ id: 'a', workspaceId: 'w', origin: 'choice' }),
      release({ id: 'b', workspaceId: 'w', origin: 'choice' }),
      release({ id: 'c', workspaceId: 'w', origin: 'hint' }),
      release({ id: 'd', workspaceId: 'w', origin: 'onboarding' }),
      release({ id: 'e', workspaceId: 'w' }),
      release({ id: 'f', workspaceId: 'w', origin: 'choice', isTest: true }),
    ]);
    expect(summary).toEqual({ total: 5, byChoice: 2, fromHint: 1, fromOnboarding: 1, unknown: 1 });
  });
});

describe('weekStartUtc', () => {
  it('returns the Monday at 00:00 UTC of the week', () => {
    // 2026-10-02 is a Friday.
    expect(weekStartUtc(NOW).toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(weekStartUtc(new Date('2026-09-28T00:00:00.000Z')).toISOString()).toBe(
      '2026-09-28T00:00:00.000Z'
    );
    // A Sunday belongs to the week that started six days before.
    expect(weekStartUtc(new Date('2026-10-04T23:59:00.000Z')).toISOString()).toBe(
      '2026-09-28T00:00:00.000Z'
    );
  });
});

describe('isPayingTeam', () => {
  it('counts Manager and Label on a current subscription', () => {
    expect(isPayingTeam(team({ workspaceId: 'a', subscription: subscription() }), NOW)).toBe(true);
    expect(
      isPayingTeam(team({ workspaceId: 'a', subscription: subscription({ plan: 'label' }) }), NOW)
    ).toBe(true);
  });

  it('counts a Group team, recorded by hand as enterprise', () => {
    expect(
      isPayingTeam(team({ workspaceId: 'a', subscription: subscription({ plan: 'enterprise' }) }), NOW)
    ).toBe(true);
  });

  it('counts a yearly Group deal as a twelfth of it in MRR', () => {
    const yearly = subscription({ plan: 'enterprise', amountMinor: 120_000_000, billingInterval: 'annual' });
    expect(monthlyRecurringMinor([yearly], NOW)).toBe(10_000_000);
  });

  it('does not count Solo, which adds MRR but is not a team', () => {
    expect(
      isPayingTeam(team({ workspaceId: 'a', subscription: subscription({ plan: 'solo' }) }), NOW)
    ).toBe(false);
  });

  it('does not count a lapsed, zero-amount, card-trial or comped team', () => {
    expect(
      isPayingTeam(
        team({ workspaceId: 'a', subscription: subscription({ expiresAt: daysAgo(1) }) }),
        NOW
      )
    ).toBe(false);
    expect(
      isPayingTeam(team({ workspaceId: 'a', subscription: subscription({ amountMinor: 0 }) }), NOW)
    ).toBe(false);
    expect(
      isPayingTeam(
        team({ workspaceId: 'a', subscription: subscription({ status: 'trialing' }) }),
        NOW
      )
    ).toBe(false);
    expect(isPayingTeam(team({ workspaceId: 'a', state: 'comped', comped: true }), NOW)).toBe(false);
  });

  it('does not count an allowlisted owner, who pays nothing', () => {
    expect(
      isPayingTeam(
        team({ workspaceId: 'a', allowlisted: true, subscription: subscription() }),
        NOW
      )
    ).toBe(false);
  });

  it('counts a cancelled subscription until its paid period ends', () => {
    expect(
      isPayingTeam(
        team({ workspaceId: 'a', subscription: subscription({ status: 'cancelled' }) }),
        NOW
      )
    ).toBe(true);
  });

  it('counts a legacy team plan, which billed the whole team', () => {
    expect(
      isPayingTeam(team({ workspaceId: 'a', subscription: subscription({ plan: 'annual' }) }), NOW)
    ).toBe(true);
  });
});

describe('monthlyRecurringMinor', () => {
  it('adds monthly plans and divides yearly plans by 12', () => {
    const total = monthlyRecurringMinor(
      [
        subscription({ userId: 'a', amountMinor: 2_200_000, billingInterval: 'monthly' }),
        subscription({ userId: 'b', amountMinor: 50_000_000, billingInterval: 'annual', plan: 'label' }),
        subscription({ userId: 'c', amountMinor: 500_000, plan: 'solo' }),
      ],
      NOW
    );
    // 22,000 + 500,000/12 + 5,000 naira, in kobo, rounded to the kobo.
    expect(total).toBe(2_200_000 + Math.round(50_000_000 / 12) + 500_000);
  });

  it('leaves out cancelled, lapsed, unpaid and card-trial subscriptions', () => {
    expect(
      monthlyRecurringMinor(
        [
          subscription({ status: 'cancelled' }),
          subscription({ expiresAt: daysAgo(1) }),
          subscription({ amountMinor: 0 }),
          subscription({ status: 'trialing' }),
        ],
        NOW
      )
    ).toBe(0);
  });

  it('keeps a past-due subscription, which Paystack is still retrying', () => {
    expect(monthlyRecurringMinor([subscription({ status: 'past_due' })], NOW)).toBe(2_200_000);
  });
});

describe('activeMembersSince', () => {
  it('counts each member once, whatever they did and however often', () => {
    const lastSeen = new Map<string, number>([
      ['u1', NOW.getTime() - 1 * DAY],
      ['u2', NOW.getTime() - 6 * DAY],
      ['u3', NOW.getTime() - 8 * DAY],
    ]);
    expect(activeMembersSince(['u1', 'u2', 'u3', 'u4'], lastSeen, NOW.getTime() - 7 * DAY)).toBe(2);
  });
});

describe('releaseLiveAt', () => {
  it('is the release date once that date has come, release day included', () => {
    const today = dateOnly(NOW.toISOString());
    expect(releaseLiveAt(release({ id: 'r', workspaceId: 'a', releaseDate: today }), NOW)).toBe(
      Date.parse(`${today}T00:00:00.000Z`)
    );
  });

  it('is not live while the release date is still ahead', () => {
    expect(
      releaseLiveAt(release({ id: 'r', workspaceId: 'a', releaseDate: dateOnly(daysAhead(3)) }), NOW)
    ).toBeNull();
  });

  it('falls back to when the last activity was done, if every activity is done', () => {
    const doneAt = daysAgo(10);
    expect(
      releaseLiveAt(
        release({
          id: 'r',
          workspaceId: 'a',
          releaseDate: dateOnly(daysAhead(30)),
          taskCount: 4,
          allTasksDone: true,
          lastTaskDoneAt: doneAt,
        }),
        NOW
      )
    ).toBe(Date.parse(doneAt));
  });

  it('does not treat a release with no activities as done', () => {
    expect(
      releaseLiveAt(release({ id: 'r', workspaceId: 'a', taskCount: 0, allTasksDone: true }), NOW)
    ).toBeNull();
  });
});

describe('secondReleaseSummary', () => {
  it('counts a team that started another release within 90 days of the first going live', () => {
    const teams = [team({ workspaceId: 'a' })];
    const releases = [
      release({ id: 'r1', workspaceId: 'a', createdAt: daysAgo(200), releaseDate: dateOnly(daysAgo(150)) }),
      release({ id: 'r2', workspaceId: 'a', createdAt: daysAgo(100) }),
    ];
    expect(secondReleaseSummary(teams, releases, NOW)).toEqual({
      eligible: 1,
      started: 1,
      rate: 1,
      waiting: 0,
    });
  });

  it('does not count a second release started after the 90 days', () => {
    const teams = [team({ workspaceId: 'a' })];
    const releases = [
      release({ id: 'r1', workspaceId: 'a', createdAt: daysAgo(300), releaseDate: dateOnly(daysAgo(200)) }),
      release({ id: 'r2', workspaceId: 'a', createdAt: daysAgo(50) }),
    ];
    expect(secondReleaseSummary(teams, releases, NOW)).toEqual({
      eligible: 1,
      started: 0,
      rate: 0,
      waiting: 0,
    });
  });

  it('counts a second release started before the first went live', () => {
    const teams = [team({ workspaceId: 'a' })];
    const releases = [
      release({ id: 'r1', workspaceId: 'a', createdAt: daysAgo(200), releaseDate: dateOnly(daysAgo(120)) }),
      release({ id: 'r2', workspaceId: 'a', createdAt: daysAgo(180) }),
    ];
    expect(secondReleaseSummary(teams, releases, NOW).started).toBe(1);
  });

  it('waits on a team whose first release went live less than 90 days ago', () => {
    const teams = [team({ workspaceId: 'a' })];
    const releases = [
      release({ id: 'r1', workspaceId: 'a', releaseDate: dateOnly(daysAgo(30)) }),
    ];
    expect(secondReleaseSummary(teams, releases, NOW)).toEqual({
      eligible: 0,
      started: 0,
      rate: null,
      waiting: 1,
    });
  });

  it('ignores test releases on both sides', () => {
    const teams = [team({ workspaceId: 'a' })];
    const releases = [
      release({ id: 't', workspaceId: 'a', isTest: true, releaseDate: dateOnly(daysAgo(150)) }),
      release({ id: 'r1', workspaceId: 'a', releaseDate: dateOnly(daysAgo(120)) }),
      release({ id: 't2', workspaceId: 'a', isTest: true, createdAt: daysAgo(100) }),
    ];
    expect(secondReleaseSummary(teams, releases, NOW)).toEqual({
      eligible: 1,
      started: 0,
      rate: 0,
      waiting: 0,
    });
  });
});

describe('weekFourRetention', () => {
  it('counts a team active in days 21 to 27 after it was made', () => {
    const created = Date.parse('2026-08-03T10:00:00.000Z'); // a Monday
    const teams = [
      team({ workspaceId: 'a', createdAt: new Date(created).toISOString(), memberUserIds: ['u1'] }),
      team({ workspaceId: 'b', createdAt: new Date(created).toISOString(), memberUserIds: ['u2'] }),
    ];
    const activity = new Map<string, number[]>([
      ['u1', [created + 22 * DAY]],
      ['u2', [created + 29 * DAY]],
    ]);
    const cohorts = weekFourRetention(teams, activity, NOW, 8);
    const cohort = cohorts.find((c) => c.weekStart === '2026-08-03');
    expect(cohort).toEqual({ weekStart: '2026-08-03', teams: 2, retained: 1, rate: 0.5 });
  });

  it('leaves out a cohort whose fourth week has not finished yet', () => {
    const teams = [team({ workspaceId: 'a', createdAt: daysAgo(10) })];
    expect(weekFourRetention(teams, new Map(), NOW, 8)).toEqual([]);
  });
});

describe('trialToPaidSummary', () => {
  it('divides teams that paid by trials that ended, leaving out comped and allowlisted teams', () => {
    const teams = [
      team({ workspaceId: 'a', trialStartedAt: daysAgo(20), trialEndsAt: daysAgo(17), ownerPaidAt: daysAgo(18) }),
      team({ workspaceId: 'b', trialStartedAt: daysAgo(20), trialEndsAt: daysAgo(17), ownerPaidAt: daysAgo(10) }),
      team({ workspaceId: 'c', trialStartedAt: daysAgo(20), trialEndsAt: daysAgo(17) }),
      team({ workspaceId: 'd', trialStartedAt: daysAgo(2), trialEndsAt: daysAhead(1) }),
      team({ workspaceId: 'e', trialStartedAt: daysAgo(20), trialEndsAt: daysAgo(17), comped: true }),
      team({ workspaceId: 'f', trialStartedAt: daysAgo(20), trialEndsAt: daysAgo(17), allowlisted: true }),
    ];
    expect(trialToPaidSummary(teams, NOW, 90)).toEqual({
      ended: 3,
      paid: 2,
      paidBeforeEnd: 1,
      rate: 2 / 3,
    });
  });

  it('does not count a payment from before the trial started', () => {
    const teams = [
      team({ workspaceId: 'a', trialStartedAt: daysAgo(20), trialEndsAt: daysAgo(17), ownerPaidAt: daysAgo(100) }),
    ];
    expect(trialToPaidSummary(teams, NOW, 90).paid).toBe(0);
  });
});

describe('activationSummary', () => {
  it('needs a real release and an invite, both inside the 3 days', () => {
    const teams = [
      team({ workspaceId: 'a', ownerSignedUpAt: daysAgo(10), firstInviteAt: daysAgo(9) }),
      team({ workspaceId: 'b', ownerSignedUpAt: daysAgo(10), firstInviteAt: daysAgo(2) }),
      team({ workspaceId: 'c', ownerSignedUpAt: daysAgo(10), firstInviteAt: null }),
      team({ workspaceId: 'd', ownerSignedUpAt: daysAgo(1), firstInviteAt: daysAgo(1) }),
    ];
    const releases = [
      release({ id: 'ra', workspaceId: 'a', createdAt: daysAgo(9) }),
      release({ id: 'rb', workspaceId: 'b', createdAt: daysAgo(9) }),
      release({ id: 'rc', workspaceId: 'c', createdAt: daysAgo(9) }),
      release({ id: 'rd', workspaceId: 'd', createdAt: daysAgo(1) }),
    ];
    // d signed up a day ago, so its 3 days are not over yet and it is not counted.
    expect(activationSummary(teams, releases, NOW, 30)).toEqual({
      signups: 3,
      activated: 1,
      rate: 1 / 3,
    });
  });

  it('does not let a test release activate a team', () => {
    const teams = [team({ workspaceId: 'a', ownerSignedUpAt: daysAgo(10), firstInviteAt: daysAgo(9) })];
    const releases = [release({ id: 'ra', workspaceId: 'a', createdAt: daysAgo(9), isTest: true })];
    expect(activationSummary(teams, releases, NOW, 30).activated).toBe(0);
  });
});

describe('formatScoreboardForTeamGroup', () => {
  it('writes plain lines a WhatsApp group can read, saying when there is no data yet', () => {
    const board = buildScoreboard({
      now: NOW,
      teams: [],
      releases: [],
      subscriptions: [subscription({ amountMinor: 2_200_000 })],
      activity: new Map(),
      activityTruncated: false,
    });
    const text = formatScoreboardForTeamGroup(board);
    expect(text).toContain('Urganize scoreboard, 2026-10-02');
    expect(text).toContain('Weekly active paying teams: 0 (of 0 paying)');
    expect(text).toContain('MRR: ₦22,000');
    expect(text).toContain('Second-release rate: not enough data yet');
    expect(text).not.toMatch(/[*_#`]/);
    expect(text).not.toContain('—');
  });

  it('warns when the activity read was cut short', () => {
    const board = buildScoreboard({
      now: NOW,
      teams: [],
      releases: [],
      subscriptions: [],
      activity: new Map(),
      activityTruncated: true,
    });
    expect(formatScoreboardForTeamGroup(board)).toContain('the activity numbers are a floor');
  });
});

describe('formatRate and formatNaira', () => {
  it('rounds to whole numbers', () => {
    expect(formatRate(2 / 3)).toBe('67%');
    expect(formatRate(null)).toBe('not enough data yet');
    expect(formatNaira(4_166_667)).toBe('₦41,667');
  });
});

describe('buildScoreboard', () => {
  function input(over: Partial<ScoreboardInput> = {}): ScoreboardInput {
    return {
      now: NOW,
      teams: [],
      releases: [],
      subscriptions: [],
      activity: new Map(),
      activityTruncated: false,
      ...over,
    };
  }

  it('counts a paying team as weekly active only with 2 or more active members', () => {
    const paid = subscription({ userId: 'owner-a' });
    const teams = [
      team({ workspaceId: 'a', ownerUserId: 'owner-a', memberUserIds: ['owner-a', 'm1'], subscription: paid }),
      team({ workspaceId: 'b', ownerUserId: 'owner-b', memberUserIds: ['owner-b', 'm2'], subscription: subscription({ userId: 'owner-b' }) }),
    ];
    const activity = new Map<string, number[]>([
      ['owner-a', [NOW.getTime() - DAY]],
      ['m1', [NOW.getTime() - 2 * DAY]],
      ['owner-b', [NOW.getTime() - DAY]],
    ]);
    const board = buildScoreboard(input({ teams, activity, subscriptions: [paid] }));
    expect(board.weeklyActivePayingTeams).toBe(1);
    expect(board.payingTeams).toBe(2);
    expect(board.weeklyActiveTeams).toBe(1);
  });

  it('reports an active team in the last 30 days with one active member', () => {
    const teams = [team({ workspaceId: 'a', ownerUserId: 'o', memberUserIds: ['o'], state: 'trial' })];
    const activity = new Map<string, number[]>([['o', [NOW.getTime() - 20 * DAY]]]);
    expect(buildScoreboard(input({ teams, activity })).activeTeams30d).toBe(1);
  });

  it('lists each team with its own numbers, most active first', () => {
    const teams = [
      team({ workspaceId: 'quiet', ownerUserId: 'o1', memberUserIds: ['o1'] }),
      team({ workspaceId: 'busy', ownerUserId: 'o2', memberUserIds: ['o2', 'm'] }),
    ];
    const activity = new Map<string, number[]>([
      ['o2', [NOW.getTime() - DAY]],
      ['m', [NOW.getTime() - DAY]],
    ]);
    const board = buildScoreboard(input({ teams, activity }));
    expect(board.teams.map((row) => row.workspaceId)).toEqual(['busy', 'quiet']);
    expect(board.teams[0]).toMatchObject({ members: 2, activeMembers7d: 2 });
  });
});

describe('referralSummary', () => {
  const ids = new Set(['a', 'b', 'c']);
  const paying = new Set(['a']);

  it('counts the last 30 days apart from all time', () => {
    const summary = referralSummary(
      [
        { workspaceId: 'a', attachedAt: daysAgo(3) },
        { workspaceId: 'b', attachedAt: daysAgo(29) },
        { workspaceId: 'c', attachedAt: daysAgo(31) },
      ],
      ids,
      paying,
      NOW
    );
    expect(summary).toEqual({ last30d: 2, allTime: 3, payingNow: 1 });
  });

  it('counts a team once, however many times it appears', () => {
    const summary = referralSummary(
      [
        { workspaceId: 'a', attachedAt: daysAgo(3) },
        { workspaceId: 'a', attachedAt: daysAgo(2) },
      ],
      ids,
      paying,
      NOW
    );
    expect(summary).toEqual({ last30d: 1, allTime: 1, payingNow: 1 });
  });

  it('leaves out a team that is not on the board, such as an invited teammate\'s empty one', () => {
    const summary = referralSummary([{ workspaceId: 'ghost', attachedAt: daysAgo(1) }], ids, paying, NOW);
    expect(summary).toEqual({ last30d: 0, allTime: 0, payingNow: 0 });
  });

  it('ignores a row with a date it cannot read, and a date in the future', () => {
    const summary = referralSummary(
      [
        { workspaceId: 'a', attachedAt: '' },
        { workspaceId: 'b', attachedAt: daysAhead(2) },
      ],
      ids,
      paying,
      NOW
    );
    expect(summary.allTime).toBe(1);
    expect(summary.last30d).toBe(0);
  });

  it('counts only teams that pay today as paying', () => {
    const summary = referralSummary(
      [
        { workspaceId: 'a', attachedAt: daysAgo(5) },
        { workspaceId: 'b', attachedAt: daysAgo(5) },
      ],
      ids,
      paying,
      NOW
    );
    expect(summary.payingNow).toBe(1);
  });
});

describe('referred signups on the board', () => {
  const base = { now: NOW, teams: [team({ workspaceId: 'a' }), team({ workspaceId: 'b' })], releases: [], subscriptions: [], activity: new Map<string, number[]>(), activityTruncated: false };

  it('is not tracked when the referral tables could not be read, never a zero', () => {
    expect(buildScoreboard({ ...base, referrals: null }).referredSignups).toBeNull();
    expect(buildScoreboard(base).referredSignups).toBeNull();
  });

  it('keeps invited-by-a-team and through-a-partner apart', () => {
    const board = buildScoreboard({
      ...base,
      referrals: {
        fromTeams: [{ workspaceId: 'a', attachedAt: daysAgo(2) }],
        fromPartners: [{ workspaceId: 'b', attachedAt: daysAgo(40) }],
      },
    });
    expect(board.referredSignups?.fromTeams).toMatchObject({ last30d: 1, allTime: 1 });
    expect(board.referredSignups?.fromPartners).toMatchObject({ last30d: 0, allTime: 1 });
  });

  it('reads zero as zero when the tables are there and empty', () => {
    const board = buildScoreboard({ ...base, referrals: { fromTeams: [], fromPartners: [] } });
    expect(board.referredSignups?.fromTeams).toEqual({ last30d: 0, allTime: 0, payingNow: 0 });
  });

  it('says so in the Friday post, in the right words for each case', () => {
    const none = buildScoreboard(base);
    expect(referredLine(none)).toBe('Referred signups: not tracked yet');
    expect(formatScoreboardForTeamGroup(none)).toContain('Referred signups: not tracked yet');

    const empty = buildScoreboard({ ...base, referrals: { fromTeams: [], fromPartners: [] } });
    expect(referredLine(empty)).toBe('Referred signups, last 30 days: 0');

    const some = buildScoreboard({
      ...base,
      referrals: {
        fromTeams: [{ workspaceId: 'a', attachedAt: daysAgo(2) }],
        fromPartners: [{ workspaceId: 'b', attachedAt: daysAgo(3) }],
      },
    });
    expect(referredLine(some)).toBe('Referred signups, last 30 days: 2 (1 from teams, 1 from partners)');
    expect(formatScoreboardForTeamGroup(some)).not.toMatch(/[*_#`]/);
    expect(formatScoreboardForTeamGroup(some)).not.toContain('\u2014');
  });
});
