import { describe, expect, it } from 'vitest';
import {
  activeMembersBetween,
  atRiskTeams,
  attachOwnerContacts,
  buildFounderCockpit,
  compoundedGrowth,
  firstRolloutSummary,
  median,
  pooledRetention,
  weekChange,
  weeklyActiveSeries,
  COCKPIT_WEEKS,
} from './founder-cockpit';
import {
  formatDays,
  formatSignedPercent,
  formatWeekChange,
  formatWeekEnd,
  growthVerdict,
} from './founder-cockpit-format';
import {
  buildScoreboard,
  type ScoreboardInput,
  type ScoreboardRelease,
  type ScoreboardSubscription,
  type ScoreboardTeam,
} from './scoreboard';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-09T12:00:00.000Z');
const at = (daysBack: number) => NOW.getTime() - daysBack * DAY;
const daysAgo = (n: number) => new Date(at(n)).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

function subscription(over: Partial<ScoreboardSubscription> = {}): ScoreboardSubscription {
  return {
    userId: 'owner',
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
    ownerUserId: `${over.workspaceId}-owner`,
    createdAt: daysAgo(200),
    ownerSignedUpAt: daysAgo(200),
    memberUserIds: [`${over.workspaceId}-owner`, `${over.workspaceId}-mate`],
    firstInviteAt: null,
    state: 'trial',
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
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
    releaseDate: null,
    status: 'draft',
    isTest: false,
    taskCount: 0,
    allTasksDone: false,
    lastTaskDoneAt: null,
    ...over,
  };
}

function input(over: Partial<ScoreboardInput> = {}): ScoreboardInput {
  return {
    now: NOW,
    teams: [],
    releases: [],
    subscriptions: [],
    activity: new Map(),
    activityTruncated: false,
    referrals: null,
    ...over,
  };
}

/** Both members of `id` active on each of the given days back. */
function bothActive(activity: Map<string, number[]>, id: string, ...daysBack: number[]) {
  for (const who of [`${id}-owner`, `${id}-mate`]) {
    activity.set(who, [...(activity.get(who) ?? []), ...daysBack.map(at)]);
  }
}

describe('weekChange', () => {
  it('reports the change and the share of last week', () => {
    expect(weekChange(6, 4)).toEqual({ current: 6, previous: 4, delta: 2, pct: 0.5 });
    expect(weekChange(3, 4)).toEqual({ current: 3, previous: 4, delta: -1, pct: -0.25 });
  });

  it('has no percentage when last week was zero, never infinity', () => {
    expect(weekChange(3, 0)).toEqual({ current: 3, previous: 0, delta: 3, pct: null });
    expect(weekChange(0, 0).pct).toBeNull();
  });
});

describe('compoundedGrowth', () => {
  it('compounds per period', () => {
    // 10 -> 16 over 4 weeks is about 12.5% a week, not 15% (60% / 4).
    expect(compoundedGrowth(10, 16, 4)).toBeCloseTo(Math.pow(1.6, 0.25) - 1, 10);
    expect(compoundedGrowth(10, 10, 4)).toBe(0);
    expect(compoundedGrowth(16, 1, 4)).toBeCloseTo(-0.5, 10);
  });

  it('is null from zero or with no periods', () => {
    expect(compoundedGrowth(0, 5, 4)).toBeNull();
    expect(compoundedGrowth(5, 6, 0)).toBeNull();
  });
});

describe('median', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('activeMembersBetween', () => {
  it('counts each person once, inside [from, to)', () => {
    const activity = new Map([
      ['a', [at(1), at(2)]],
      ['b', [at(8)]],
      ['c', [at(7)]],
    ]);
    expect(activeMembersBetween(['a', 'a', 'b', 'c'], activity, at(7), at(0))).toBe(2);
    // The end is open: something exactly at `to` belongs to the next week.
    expect(activeMembersBetween(['c'], activity, at(14), at(7))).toBe(0);
  });
});

describe('weeklyActiveSeries', () => {
  it('needs 2 members active in the same week', () => {
    const activity = new Map<string, number[]>([
      ['a-owner', [at(1)]],
      ['a-mate', [at(9)]],
    ]);
    const weeks = weeklyActiveSeries(input({ teams: [team({ workspaceId: 'a' })], activity }), 2);
    expect(weeks.map((week) => week.activeTeams)).toEqual([0, 0]);
  });

  it('runs oldest first and counts paying teams with today’s paying status', () => {
    const activity = new Map<string, number[]>();
    bothActive(activity, 'paid', 1, 8);
    bothActive(activity, 'free', 1);
    const teams = [
      team({ workspaceId: 'paid', subscription: subscription(), state: 'paid' }),
      team({ workspaceId: 'free' }),
    ];
    const weeks = weeklyActiveSeries(input({ teams, activity }), 3);
    expect(weeks).toHaveLength(3);
    expect(weeks.map((week) => week.activeTeams)).toEqual([0, 1, 2]);
    expect(weeks.map((week) => week.activePayingTeams)).toEqual([0, 1, 1]);
    expect(weeks[2].endsAt).toBe(NOW.toISOString());
    expect(weeks[1].endsAt).toBe(daysAgo(7));
  });

  it('leaves a team out of weeks that ended before it was made', () => {
    const activity = new Map<string, number[]>();
    // Activity stamped before the team existed (a member of another team).
    bothActive(activity, 'new', 9, 2);
    const teams = [team({ workspaceId: 'new', createdAt: daysAgo(3) })];
    const weeks = weeklyActiveSeries(input({ teams, activity }), 2);
    expect(weeks.map((week) => week.activeTeams)).toEqual([0, 1]);
  });

  it('agrees with the Scoreboard about this week', () => {
    const activity = new Map<string, number[]>();
    bothActive(activity, 'a', 0, 3);
    bothActive(activity, 'b', 6.9);
    bothActive(activity, 'c', 7.1);
    const teams = ['a', 'b', 'c'].map((id) =>
      team({ workspaceId: id, subscription: subscription(), state: 'paid' })
    );
    const data = input({ teams, activity });
    const board = buildScoreboard(data);
    const latest = weeklyActiveSeries(data, 1)[0];
    expect(latest.activeTeams).toBe(board.weeklyActiveTeams);
    expect(latest.activePayingTeams).toBe(board.weeklyActivePayingTeams);
    expect(latest.activeTeams).toBe(2);
  });
});

describe('firstRolloutSummary', () => {
  it('measures sign-up to first real rollout, test rollouts left out', () => {
    const teams = [
      team({ workspaceId: 'fast', ownerSignedUpAt: daysAgo(20) }),
      team({ workspaceId: 'slow', ownerSignedUpAt: daysAgo(30) }),
      team({ workspaceId: 'none', ownerSignedUpAt: daysAgo(10) }),
      team({ workspaceId: 'test-only', ownerSignedUpAt: daysAgo(10) }),
      team({ workspaceId: 'old', ownerSignedUpAt: daysAgo(200) }),
    ];
    const releases = [
      release({ id: 'f2', workspaceId: 'fast', createdAt: daysAgo(15) }),
      release({ id: 'f1', workspaceId: 'fast', createdAt: daysAgo(19) }),
      release({ id: 's1', workspaceId: 'slow', createdAt: daysAgo(24) }),
      release({ id: 't1', workspaceId: 'test-only', createdAt: daysAgo(9), isTest: true }),
      release({ id: 'o1', workspaceId: 'old', createdAt: daysAgo(199) }),
    ];
    const summary = firstRolloutSummary(input({ teams, releases }), 90);
    expect(summary.signups).toBe(4);
    expect(summary.withRollout).toBe(2);
    // fast: 1 day, slow: 6 days.
    expect(summary.medianDays).toBeCloseTo(3.5, 10);
  });

  it('counts a rollout made before the owner signed up as day 0', () => {
    const teams = [team({ workspaceId: 'a', ownerSignedUpAt: daysAgo(5) })];
    const releases = [release({ id: 'r', workspaceId: 'a', createdAt: daysAgo(6) })];
    expect(firstRolloutSummary(input({ teams, releases }), 90).medianDays).toBe(0);
  });

  it('is honest with no sign-ups', () => {
    expect(firstRolloutSummary(input(), 90)).toEqual({ signups: 0, withRollout: 0, medianDays: null });
  });
});

describe('pooledRetention', () => {
  it('adds cohorts together rather than averaging their rates', () => {
    const pooled = pooledRetention([
      { weekStart: '2026-08-31', teams: 1, retained: 1, rate: 1 },
      { weekStart: '2026-08-24', teams: 3, retained: 0, rate: 0 },
    ]);
    expect(pooled).toEqual({ cohorts: 2, teams: 4, retained: 1, rate: 0.25 });
  });

  it('is null with nothing to divide by', () => {
    expect(pooledRetention([]).rate).toBeNull();
  });
});

describe('atRiskTeams', () => {
  it('lists paying teams below the bar, and teams that went quiet this week', () => {
    const activity = new Map<string, number[]>();
    bothActive(activity, 'paid-busy', 1);
    activity.set('paid-quiet-owner', [at(2)]);
    bothActive(activity, 'slipped', 10);
    bothActive(activity, 'always-quiet', 40);
    bothActive(activity, 'steady', 2, 9);
    const teams = [
      team({ workspaceId: 'paid-busy', subscription: subscription(), state: 'paid' }),
      team({ workspaceId: 'paid-quiet', subscription: subscription(), state: 'paid' }),
      team({ workspaceId: 'slipped' }),
      team({ workspaceId: 'always-quiet' }),
      team({ workspaceId: 'steady' }),
    ];
    const data = input({ teams, activity });
    const risk = atRiskTeams(data, buildScoreboard(data), 10);
    expect(risk.map((row) => [row.workspaceId, row.reason])).toEqual([
      ['paid-quiet', 'paying_quiet'],
      ['slipped', 'went_quiet'],
    ]);
    expect(risk[0]).toMatchObject({ paying: true, members: 2, activeMembers7d: 1 });
  });

  it('stops at the limit, paying teams first', () => {
    const activity = new Map<string, number[]>();
    const teams: ScoreboardTeam[] = [];
    for (let i = 0; i < 5; i += 1) {
      bothActive(activity, `free${i}`, 8 + i);
      teams.push(team({ workspaceId: `free${i}` }));
    }
    teams.push(team({ workspaceId: 'paid', subscription: subscription(), state: 'paid' }));
    const data = input({ teams, activity });
    const risk = atRiskTeams(data, buildScoreboard(data), 3);
    expect(risk).toHaveLength(3);
    expect(risk[0].workspaceId).toBe('paid');
  });
});

describe('atRiskTeams: the stage each team stalled at', () => {
  it('places each slipped team at its first unfinished lifecycle stage', () => {
    const activity = new Map<string, number[]>();
    // All went quiet this week after a busy week before.
    for (const id of ['no-rollout', 'free-with-rollout', 'paid-not-live', 'paid-live']) {
      bothActive(activity, id, 10);
    }
    const teams = [
      team({ workspaceId: 'no-rollout' }),
      team({ workspaceId: 'free-with-rollout' }),
      team({ workspaceId: 'paid-not-live', subscription: subscription(), state: 'paid' }),
      team({ workspaceId: 'paid-live', subscription: subscription(), state: 'paid' }),
    ];
    const releases = [
      release({ id: 'r1', workspaceId: 'free-with-rollout' }),
      release({ id: 'r2', workspaceId: 'paid-not-live', releaseDate: '2026-12-01' }),
      release({ id: 'r3', workspaceId: 'paid-live', releaseDate: '2026-09-01', createdAt: daysAgo(60) }),
    ];
    const data = input({ teams, activity, releases });
    const byId = new Map(atRiskTeams(data, buildScoreboard(data), 10).map((row) => [row.workspaceId, row]));
    expect(byId.get('no-rollout')?.stalledAt).toEqual({ stage: 'activate', missing: 'No rollout yet' });
    expect(byId.get('free-with-rollout')?.stalledAt.stage).toBe('convert');
    expect(byId.get('paid-not-live')?.stalledAt.stage).toBe('first_release');
    expect(byId.get('paid-live')?.stalledAt.stage).toBe('second_release');
    // Contacts are filled in by the route, never guessed here.
    expect(byId.get('no-rollout')).toMatchObject({ ownerName: null, ownerEmail: null });
  });

  it('attachOwnerContacts adds name and email by team, nulls when unknown', () => {
    const activity = new Map<string, number[]>();
    bothActive(activity, 'a', 10);
    bothActive(activity, 'b', 10);
    const data = input({ teams: [team({ workspaceId: 'a' }), team({ workspaceId: 'b' })], activity });
    const listed = atRiskTeams(data, buildScoreboard(data), 10);
    const withContacts = attachOwnerContacts(
      listed,
      new Map([['a', 'Ada Obi']]),
      new Map<string, string | null>([['a', 'ada@example.com'], ['b', null]])
    );
    const byId = new Map(withContacts.map((row) => [row.workspaceId, row]));
    expect(byId.get('a')).toMatchObject({ ownerName: 'Ada Obi', ownerEmail: 'ada@example.com' });
    expect(byId.get('b')).toMatchObject({ ownerName: null, ownerEmail: null });
    // The input list is not changed.
    expect(listed.every((row) => row.ownerEmail === null)).toBe(true);
  });
});

describe('buildFounderCockpit', () => {
  it('is all zeros and nulls on an empty database, never a made-up number', () => {
    const data = input();
    const cockpit = buildFounderCockpit(data, buildScoreboard(data));
    expect(cockpit.weeks).toHaveLength(COCKPIT_WEEKS);
    expect(cockpit.northStar).toEqual({ current: 0, previous: 0, delta: 0, pct: null });
    expect(cockpit.activeTeams.pct).toBeNull();
    expect(cockpit.activeTeamsWeeklyGrowth).toBeNull();
    expect(cockpit.activation.rate).toBeNull();
    expect(cockpit.firstRollout.medianDays).toBeNull();
    expect(cockpit.retention.latest).toBeNull();
    expect(cockpit.retention.pooled.rate).toBeNull();
    expect(cockpit.atRisk).toEqual([]);
    expect(cockpit.mrrMinor).toBe(0);
  });

  it('takes this week against last week, and growth over four weeks', () => {
    const activity = new Map<string, number[]>();
    // Active teams by week, oldest of the last five first: 2, 2, 3, 3, 4.
    bothActive(activity, 'a', 1, 8, 15, 22, 29);
    bothActive(activity, 'b', 1, 8, 15, 22, 29);
    bothActive(activity, 'c', 1, 8, 15);
    bothActive(activity, 'd', 1);
    const teams = ['a', 'b', 'c', 'd'].map((id) => team({ workspaceId: id }));
    teams[0] = team({ workspaceId: 'a', subscription: subscription(), state: 'paid' });
    const data = input({ teams, activity });
    const cockpit = buildFounderCockpit(data, buildScoreboard(data));
    expect(cockpit.activeTeams).toEqual({ current: 4, previous: 3, delta: 1, pct: 1 / 3 });
    expect(cockpit.northStar).toEqual({ current: 1, previous: 1, delta: 0, pct: 0 });
    expect(cockpit.activeTeamsWeeklyGrowth).toBeCloseTo(Math.pow(4 / 2, 1 / 4) - 1, 10);
    expect(cockpit.payingTeams).toBe(1);
    expect(cockpit.mrrMinor).toBe(0);
  });
});

describe('the cockpit in words', () => {
  it('formats a signed percentage, and none from zero', () => {
    expect(formatSignedPercent(0.125)).toBe('+13%');
    expect(formatSignedPercent(-0.25)).toBe('-25%');
    expect(formatSignedPercent(0.001)).toBe('0%');
    expect(formatSignedPercent(null)).toBe('No % yet');
  });

  it('says which way the week went', () => {
    expect(formatWeekChange(weekChange(5, 3))).toBe('Up 2 from 3 last week');
    expect(formatWeekChange(weekChange(1, 4))).toBe('Down 3 from 4 last week');
    expect(formatWeekChange(weekChange(2, 2))).toBe('Same as last week');
  });

  it("judges weekly growth against YC's bars", () => {
    expect(growthVerdict(null)).toBe('Not enough weeks to tell yet');
    expect(growthVerdict(0.12)).toBe("Faster than YC's best pace");
    expect(growthVerdict(0.1)).toBe("Faster than YC's best pace");
    expect(growthVerdict(0.06)).toBe("On YC's good pace");
    expect(growthVerdict(0.05)).toBe("On YC's good pace");
    expect(growthVerdict(0.03)).toBe("Growing, under YC's 5% a week");
    expect(growthVerdict(0.01)).toBe('Flat');
    expect(growthVerdict(0)).toBe('Flat');
    expect(growthVerdict(-0.05)).toBe('Shrinking');
  });

  it('reads days plainly', () => {
    expect(formatDays(null)).toBe('No rollouts yet');
    expect(formatDays(0.4)).toBe('Under a day');
    expect(formatDays(1.2)).toBe('1 day');
    expect(formatDays(3.5)).toBe('4 days');
  });

  it('names the day a week ended in UTC', () => {
    expect(formatWeekEnd('2026-10-09T23:30:00.000Z')).toBe('9 Oct');
    expect(formatWeekEnd('nonsense')).toBe('');
  });
});
