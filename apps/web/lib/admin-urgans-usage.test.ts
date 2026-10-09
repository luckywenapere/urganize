import { describe, expect, it } from 'vitest';
import {
  buildUrgansUsage,
  costRodiBetween,
  creditsSpentByWeek,
  rolloutsLiveBetween,
  teamResolver,
  urgansShare,
  weekWindow,
  weeklyActiveTeamIds,
  CREDIT_WEEKS,
  URGANS_WEEKLY_TARGET,
  type AiUsageRow,
  type CreditLedgerRow,
  type UrgansShare,
} from './admin-urgans-usage';
import {
  formatAiCostFact,
  formatCredits,
  formatLastWeekShare,
  formatLiveChange,
  formatPercent,
  formatSecondReleaseFact,
  formatShareFact,
  formatTargetGap,
  formatUsd,
} from './admin-urgans-usage-format';
import { toAiUsageRows, toCreditLedgerRows } from './admin-urgans-usage-server';
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
const RODI_PER_USD = 743;

function paid(over: Partial<ScoreboardSubscription> = {}): ScoreboardSubscription {
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
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
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

function bothActive(activity: Map<string, number[]>, id: string, ...daysBack: number[]) {
  for (const who of [`${id}-owner`, `${id}-mate`]) {
    activity.set(who, [...(activity.get(who) ?? []), ...daysBack.map(at)]);
  }
}

function use(over: Partial<AiUsageRow> & { workspaceId: string | null }): AiUsageRow {
  return {
    ownerUserId: null,
    releaseId: 'rel',
    feature: 'chat',
    createdAt: daysAgo(1),
    costRodi: 10,
    ...over,
  };
}

function ledgerRow(over: Partial<CreditLedgerRow>): CreditLedgerRow {
  return {
    workspaceId: 'a',
    ownerUserId: null,
    kind: 'spend',
    credits: -5,
    createdAt: daysAgo(1),
    providerCostRodi: 20,
    ...over,
  };
}

/** Four paying teams, all active this week; a and b active last week too. */
function world() {
  const activity = new Map<string, number[]>();
  for (const id of ['a', 'b', 'c', 'd']) bothActive(activity, id, 1);
  bothActive(activity, 'a', 9);
  bothActive(activity, 'b', 9);
  bothActive(activity, 'free', 2);
  const teams = [
    ...['a', 'b', 'c', 'd'].map((id) => team({ workspaceId: id, subscription: paid({ userId: `${id}-owner` }) })),
    team({ workspaceId: 'free', state: 'trial' }),
  ];
  return input({ teams, activity });
}

describe('weekWindow', () => {
  it('is open at the end for this week and closed for earlier weeks', () => {
    expect(weekWindow(NOW.getTime(), 0)).toEqual({ fromMs: at(7), toMs: Number.POSITIVE_INFINITY });
    expect(weekWindow(NOW.getTime(), 1)).toEqual({ fromMs: at(14), toMs: at(7) });
  });
});

describe('weeklyActiveTeamIds', () => {
  it("matches the Scoreboard's North Star and weekly active teams this week", () => {
    const data = world();
    const board = buildScoreboard(data);
    const { fromMs, toMs } = weekWindow(NOW.getTime(), 0);
    const ids = weeklyActiveTeamIds(data, fromMs, toMs);
    expect(ids.paying.size).toBe(board.weeklyActivePayingTeams);
    expect(ids.all.size).toBe(board.weeklyActiveTeams);
    expect(ids.paying.size).toBe(4);
    expect(ids.all.size).toBe(5);
  });

  it('leaves out a team made after the window ended', () => {
    const activity = new Map<string, number[]>();
    bothActive(activity, 'new', 9);
    const data = input({ teams: [team({ workspaceId: 'new', createdAt: daysAgo(3) })], activity });
    const { fromMs, toMs } = weekWindow(NOW.getTime(), 1);
    expect(weeklyActiveTeamIds(data, fromMs, toMs).all.size).toBe(0);
  });
});

describe('teamResolver', () => {
  it('uses the workspace, then the team the owner owns, else nothing', () => {
    const resolve = teamResolver([team({ workspaceId: 'a' })]);
    expect(resolve({ workspaceId: 'a', ownerUserId: null })).toBe('a');
    expect(resolve({ workspaceId: null, ownerUserId: 'a-owner' })).toBe('a');
    expect(resolve({ workspaceId: 'gone', ownerUserId: 'a-owner' })).toBe('a');
    expect(resolve({ workspaceId: 'gone', ownerUserId: 'stranger' })).toBeNull();
    expect(resolve({ workspaceId: null, ownerUserId: null })).toBeNull();
  });
});

describe('urgansShare', () => {
  const resolve = teamResolver(['a', 'b', 'c', 'd'].map((id) => team({ workspaceId: id })));
  const payingActive = new Set(['a', 'b', 'c', 'd']);
  const { fromMs, toMs } = weekWindow(NOW.getTime(), 0);

  it('counts a team once, only inside a release, only chosen features', () => {
    const share = urgansShare(
      payingActive,
      [
        use({ workspaceId: 'a' }),
        use({ workspaceId: 'a', feature: 'plan' }),
        use({ workspaceId: 'b', releaseId: null }), // chat outside a release
        use({ workspaceId: 'c', feature: 'status' }), // made on the side
        use({ workspaceId: 'd', feature: 'outcome' }),
        use({ workspaceId: null, ownerUserId: 'd-owner', feature: 'spotify_pitch', costRodi: null }), // failed still counts
      ],
      resolve,
      fromMs,
      toMs
    );
    expect(share).toEqual({ activePayingTeams: 4, usingInReleases: 2, usingAnywhere: 3, rate: 0.5 });
  });

  it('ignores teams that are not active and paying, and calls outside the window', () => {
    const share = urgansShare(
      new Set(['a']),
      [use({ workspaceId: 'b' }), use({ workspaceId: 'a', createdAt: daysAgo(8) })],
      resolve,
      fromMs,
      toMs
    );
    expect(share).toEqual({ activePayingTeams: 1, usingInReleases: 0, usingAnywhere: 0, rate: 0 });
  });

  it('has no rate with no active paying team', () => {
    expect(urgansShare(new Set(), [use({ workspaceId: 'a' })], resolve, fromMs, toMs).rate).toBeNull();
  });
});

describe('creditsSpentByWeek', () => {
  it('nets refunds against spends per week and ignores grants', () => {
    const weeks = creditsSpentByWeek(
      [
        ledgerRow({ credits: -10, createdAt: daysAgo(1) }),
        ledgerRow({ kind: 'refund', credits: 3, createdAt: daysAgo(2) }),
        ledgerRow({ kind: 'allowance', credits: 660, createdAt: daysAgo(2) }),
        ledgerRow({ kind: 'topup', credits: 100, createdAt: daysAgo(2) }),
        ledgerRow({ credits: -4, createdAt: daysAgo(10) }),
        ledgerRow({ credits: -99, createdAt: daysAgo(80) }),
      ],
      NOW.getTime(),
      CREDIT_WEEKS
    );
    expect(weeks).toHaveLength(CREDIT_WEEKS);
    expect(weeks[weeks.length - 1]).toEqual({ endsAt: NOW.toISOString(), credits: 7 });
    expect(weeks[weeks.length - 2].credits).toBe(4);
    expect(weeks.slice(0, -2).every((week) => week.credits === 0)).toBe(true);
  });

  it('never shows a negative week when refunds outrun spends', () => {
    const weeks = creditsSpentByWeek([ledgerRow({ kind: 'refund', credits: 5 })], NOW.getTime(), 1);
    expect(weeks[0].credits).toBe(0);
  });
});

describe('costRodiBetween', () => {
  it('sums known costs in the window; unknown costs add nothing', () => {
    expect(
      costRodiBetween(
        [
          { createdAt: daysAgo(1), cost: 10 },
          { createdAt: daysAgo(2), cost: null },
          { createdAt: daysAgo(8), cost: 50 },
          { createdAt: 'bad', cost: 7 },
        ],
        at(7),
        Number.POSITIVE_INFINITY
      )
    ).toBe(10);
  });
});

describe('rolloutsLiveBetween', () => {
  it("uses the Scoreboard's live rule and skips test rollouts", () => {
    const data = input({
      releases: [
        release({ id: 'date', workspaceId: 'a', releaseDate: daysAgo(2).slice(0, 10) }),
        release({ id: 'done', workspaceId: 'a', taskCount: 3, allTasksDone: true, lastTaskDoneAt: daysAgo(3) }),
        release({ id: 'test', workspaceId: 'a', releaseDate: daysAgo(2).slice(0, 10), isTest: true }),
        release({ id: 'future', workspaceId: 'a', releaseDate: daysAhead(5).slice(0, 10) }),
        release({ id: 'last-week', workspaceId: 'a', releaseDate: daysAgo(10).slice(0, 10) }),
      ],
    });
    expect(rolloutsLiveBetween(data, at(7), NOW.getTime() + 1)).toBe(2);
    expect(rolloutsLiveBetween(data, at(14), at(7))).toBe(1);
  });
});

describe('buildUrgansUsage', () => {
  it('puts the pieces together', () => {
    const data = world();
    data.releases = [release({ id: 'r', workspaceId: 'a', releaseDate: daysAgo(1).slice(0, 10) })];
    const board = buildScoreboard(data);
    const usage = buildUrgansUsage(
      data,
      board.secondRelease,
      [
        use({ workspaceId: 'a', costRodi: 743 }),
        use({ workspaceId: 'b', costRodi: 743 * 2 }),
        use({ workspaceId: 'a', createdAt: daysAgo(9) }),
      ],
      [ledgerRow({ credits: -25 })],
      RODI_PER_USD
    );
    expect(usage.target).toBe(URGANS_WEEKLY_TARGET);
    expect(usage.share?.current).toEqual({ activePayingTeams: 4, usingInReleases: 2, usingAnywhere: 2, rate: 0.5 });
    expect(usage.share?.previous).toEqual({ activePayingTeams: 2, usingInReleases: 1, usingAnywhere: 1, rate: 0.5 });
    expect(usage.weeklyActiveTeams).toBe(5);
    expect(usage.creditsPerActiveTeam).toBe(5);
    expect(usage.aiCost).toEqual({ usdThisWeek: 3, perActiveTeamUsd: 3 / 5, source: 'usage_log' });
    expect(usage.liveRollouts).toEqual({ current: 1, previous: 0 });
    expect(usage.secondRelease).toEqual(board.secondRelease);
  });

  it('falls back to the ledger for cost, and shows Not tracked (null) without either', () => {
    const data = world();
    const board = buildScoreboard(data);
    const fromLedger = buildUrgansUsage(data, board.secondRelease, null, [ledgerRow({ providerCostRodi: 743 * 5 })], RODI_PER_USD);
    expect(fromLedger.share).toBeNull();
    expect(fromLedger.aiCost).toEqual({ usdThisWeek: 5, perActiveTeamUsd: 1, source: 'credit_ledger' });

    const nothing = buildUrgansUsage(data, board.secondRelease, null, null, RODI_PER_USD);
    expect(nothing.share).toBeNull();
    expect(nothing.creditWeeks).toBeNull();
    expect(nothing.creditsPerActiveTeam).toBeNull();
    expect(nothing.aiCost).toBeNull();
  });

  it('has no per-team figures with no active team, never a division by zero', () => {
    const usage = buildUrgansUsage(input(), buildScoreboard(input()).secondRelease, [], [], RODI_PER_USD);
    expect(usage.weeklyActiveTeams).toBe(0);
    expect(usage.creditsPerActiveTeam).toBeNull();
    expect(usage.aiCost).toEqual({ usdThisWeek: 0, perActiveTeamUsd: null, source: 'usage_log' });
    expect(usage.share?.current.rate).toBeNull();
  });
});

describe('row shaping (server half)', () => {
  it('reads numbers given as strings and drops rows it cannot place', () => {
    expect(
      toAiUsageRows([
        { workspace_id: 'a', owner_user_id: null, release_id: 'r', feature: 'chat', created_at: daysAgo(1), cost_rodi: '12.5' },
        { workspace_id: 'a', feature: 'chat', created_at: null },
        { workspace_id: 'a', feature: null, created_at: daysAgo(1) },
        { workspace_id: 'a', feature: 'plan', created_at: daysAgo(1), cost_rodi: null },
      ])
    ).toEqual([
      { workspaceId: 'a', ownerUserId: null, releaseId: 'r', feature: 'chat', createdAt: daysAgo(1), costRodi: 12.5 },
      { workspaceId: 'a', ownerUserId: null, releaseId: null, feature: 'plan', createdAt: daysAgo(1), costRodi: null },
    ]);
    expect(
      toCreditLedgerRows([
        { workspace_id: 'a', kind: 'spend', credits: -3, created_at: daysAgo(1), provider_cost_rodi: '4.2' },
        { workspace_id: 'a', kind: 'spend', credits: null, created_at: daysAgo(1) },
      ])
    ).toEqual([
      { workspaceId: 'a', ownerUserId: null, kind: 'spend', credits: -3, createdAt: daysAgo(1), providerCostRodi: 4.2 },
    ]);
  });
});

describe('admin-urgans-usage-format', () => {
  const share = (over: Partial<UrgansShare>): UrgansShare => ({
    activePayingTeams: 5,
    usingInReleases: 1,
    usingAnywhere: 2,
    rate: 0.2,
    ...over,
  });

  it('reads the share, the gap to half, and last week', () => {
    expect(formatPercent(0.2)).toBe('20%');
    expect(formatPercent(null)).toBe('No data yet');
    expect(formatShareFact(share({}))).toBe('1 of 5 active paying teams');
    expect(formatShareFact(share({ activePayingTeams: 1 }))).toBe('1 of 1 active paying team');
    expect(formatShareFact(share({ activePayingTeams: 0 }))).toBe('No paying team was active this week');
    // Half of 5 rounds up to 3 teams.
    expect(formatTargetGap(share({}), 0.5)).toBe('2 more teams to reach half');
    expect(formatTargetGap(share({ usingInReleases: 2 }), 0.5)).toBe('1 more team to reach half');
    expect(formatTargetGap(share({ activePayingTeams: 4, usingInReleases: 2 }), 0.5)).toBe('At or above the target of half');
    expect(formatTargetGap(share({ activePayingTeams: 0 }), 0.5)).toBeNull();
    expect(formatLastWeekShare(share({}))).toBe('Last week: 1 of 5 (20%)');
    expect(formatLastWeekShare(share({ activePayingTeams: 0 }))).toBe('Last week: no paying team was active');
  });

  it('reads credits, dollars and the live change', () => {
    expect(formatCredits(12.345)).toBe('12.3 credits');
    expect(formatCredits(1)).toBe('1 credit');
    expect(formatCredits(null)).toBe('Not tracked');
    expect(formatUsd(0.456)).toBe('$0.46');
    expect(formatUsd(1234.4)).toBe('$1,234');
    expect(formatUsd(null)).toBe('Not tracked');
    expect(formatLiveChange(3, 1)).toBe('Up 2 from 1 last week');
    expect(formatLiveChange(1, 3)).toBe('Down 2 from 3 last week');
    expect(formatLiveChange(2, 2)).toBe('Same as last week');
  });

  it('reads the AI cost fact and its source', () => {
    const base = buildUrgansUsage(world(), buildScoreboard(world()).secondRelease, [use({ workspaceId: 'a', costRodi: 743 })], null, RODI_PER_USD);
    expect(formatAiCostFact(base)).toBe('$1.00 this week over 5 active teams (AI usage log)');
    expect(formatAiCostFact({ ...base, aiCost: null })).toBeNull();
    expect(formatAiCostFact({ ...base, weeklyActiveTeams: 0 })).toBe('$1.00 this week, no active team (AI usage log)');
  });

  it('reads the second-release fact', () => {
    expect(formatSecondReleaseFact({ eligible: 0, started: 0, rate: null, waiting: 0 })).toBe(
      'No paying team has had a rollout live yet'
    );
    expect(formatSecondReleaseFact({ eligible: 0, started: 0, rate: null, waiting: 2 })).toBe(
      'No paying team is past 90 days yet; 2 still inside their 90 days'
    );
    expect(formatSecondReleaseFact({ eligible: 3, started: 2, rate: 2 / 3, waiting: 1 })).toBe(
      '2 of 3 paying teams, 1 still inside its 90 days'
    );
    expect(formatSecondReleaseFact({ eligible: 1, started: 1, rate: 1, waiting: 0 })).toBe('1 of 1 paying team');
  });
});
