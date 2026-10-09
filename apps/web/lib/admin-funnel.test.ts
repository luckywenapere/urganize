import { describe, expect, it } from 'vitest';
import {
  buildFunnel,
  buildFunnels,
  funnelSteps,
  normalizeEmail,
  waitlistStep,
  FUNNEL_WINDOWS,
  type FunnelStep,
} from './admin-funnel';
import {
  FUNNEL_STEP_COPY,
  formatConversion,
  formatShare,
  formatTooNew,
  formatWaitlist,
} from './admin-funnel-format';
import {
  activationSummary,
  buildScoreboard,
  isActivatedTeam,
  type ScoreboardInput,
  type ScoreboardRelease,
  type ScoreboardTeam,
} from './scoreboard';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-09T12:00:00.000Z');
const at = (daysBack: number) => NOW.getTime() - daysBack * DAY;
const daysAgo = (n: number) => new Date(at(n)).toISOString();

function team(over: Partial<ScoreboardTeam> & { workspaceId: string }): ScoreboardTeam {
  return {
    name: over.workspaceId,
    ownerUserId: `${over.workspaceId}-owner`,
    createdAt: daysAgo(10),
    ownerSignedUpAt: daysAgo(10),
    memberUserIds: [`${over.workspaceId}-owner`],
    firstInviteAt: null,
    state: 'trial',
    comped: false,
    allowlisted: false,
    subscription: null,
    trialStartedAt: daysAgo(10),
    trialEndsAt: daysAgo(7),
    ownerPaidAt: null,
    ...over,
  };
}

function release(over: Partial<ScoreboardRelease> & { id: string; workspaceId: string }): ScoreboardRelease {
  return {
    createdAt: daysAgo(9),
    updatedAt: daysAgo(9),
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

const noEmails = new Map<string, string | null>();
const counts = (steps: FunnelStep[]) => steps.map((step) => step.count);

describe('normalizeEmail', () => {
  it('lower-cases and trims, and blanks never match', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('funnelSteps', () => {
  it('counts each step on its own and converts from the step before', () => {
    const steps = funnelSteps([
      { key: 'account', ids: new Set(['a', 'b', 'c', 'd']) },
      { key: 'first_rollout', ids: new Set(['a', 'b']) },
      { key: 'activated', ids: new Set(['a']) },
      { key: 'trial_over', ids: new Set(['a', 'b', 'c', 'd']) },
      // 'c' paid without a rollout: still counted, and carried from trial over.
      { key: 'paid', ids: new Set(['c']) },
    ]);
    expect(counts(steps)).toEqual([4, 2, 1, 4, 1]);
    expect(steps[0]).toEqual({ key: 'account', count: 4, carried: 0, fromPrevious: null, ofAccounts: 1 });
    expect(steps[1]).toMatchObject({ carried: 2, fromPrevious: 0.5, ofAccounts: 0.5 });
    expect(steps[2]).toMatchObject({ carried: 1, fromPrevious: 0.5, ofAccounts: 0.25 });
    // Only 'a' was activated, so 1 of 1 reached trial over from there.
    expect(steps[3]).toMatchObject({ carried: 1, fromPrevious: 1, ofAccounts: 1 });
    expect(steps[4]).toMatchObject({ carried: 1, fromPrevious: 0.25, ofAccounts: 0.25 });
  });

  it('never passes 100% from the step before, even when a later step is bigger', () => {
    const steps = funnelSteps([
      { key: 'account', ids: new Set(['a', 'b', 'c']) },
      { key: 'first_rollout', ids: new Set(['a']) },
      { key: 'activated', ids: new Set(['a', 'b']) },
    ]);
    expect(steps[2].fromPrevious).toBe(1);
    expect(steps[2].carried).toBe(1);
  });

  it('has no rate after an empty step, and none at all with no accounts', () => {
    const steps = funnelSteps([
      { key: 'account', ids: new Set<string>() },
      { key: 'first_rollout', ids: new Set<string>() },
    ]);
    expect(steps[0].ofAccounts).toBeNull();
    expect(steps[1].fromPrevious).toBeNull();
    expect(steps[1].ofAccounts).toBeNull();
  });
});

describe('waitlistStep', () => {
  it('counts each email once, inside the window, and matches accounts case-blind', () => {
    const result = waitlistStep(
      [
        { email: 'ada@x.com', joinedAt: daysAgo(5) },
        { email: 'ADA@x.com ', joinedAt: daysAgo(4) },
        { email: 'bo@x.com', joinedAt: daysAgo(20) },
        { email: 'cy@x.com', joinedAt: daysAgo(40) },
        { email: '', joinedAt: daysAgo(2) },
        { email: 'dee@x.com', joinedAt: 'not a date' },
      ],
      new Set(['ada@x.com', 'cy@x.com']),
      at(30),
      NOW.getTime()
    );
    expect(result).toEqual({ joined: 2, withAccount: 1, rate: 0.5 });
  });

  it('has no rate when nobody joined', () => {
    expect(waitlistStep([], new Set(['a@x.com']), at(30), NOW.getTime())).toEqual({
      joined: 0,
      withAccount: 0,
      rate: null,
    });
  });
});

describe('buildFunnel', () => {
  it('cohorts by owner sign-up: in the window and past the first 3 days', () => {
    const funnel = buildFunnel(
      input({
        teams: [
          team({ workspaceId: 'in' }),
          team({ workspaceId: 'edge', ownerSignedUpAt: daysAgo(3) }),
          team({ workspaceId: 'fresh', ownerSignedUpAt: daysAgo(1) }),
          team({ workspaceId: 'old', ownerSignedUpAt: daysAgo(31) }),
          team({ workspaceId: 'no-profile', ownerSignedUpAt: null }),
        ],
      }),
      30,
      null,
      noEmails
    );
    expect(funnel.steps[0].count).toBe(2);
    expect(funnel.tooNew).toBe(1);
    expect(funnel.windowDays).toBe(30);
    expect(funnel.from).toBe(daysAgo(30));
    expect(funnel.to).toBe(daysAgo(3));
    expect(funnel.waitlist).toBeNull();
  });

  it('counts a real rollout at any time, but never a test one', () => {
    const funnel = buildFunnel(
      input({
        teams: [team({ workspaceId: 'late' }), team({ workspaceId: 'test-only' }), team({ workspaceId: 'none' })],
        releases: [
          release({ id: 'r1', workspaceId: 'late', createdAt: daysAgo(1) }),
          release({ id: 'r2', workspaceId: 'test-only', isTest: true }),
        ],
      }),
      30,
      null,
      noEmails
    );
    expect(counts(funnel.steps).slice(0, 2)).toEqual([3, 1]);
  });

  it('activates only with a rollout and an invite inside 3 days', () => {
    const funnel = buildFunnel(
      input({
        teams: [
          team({ workspaceId: 'yes', firstInviteAt: daysAgo(9) }),
          team({ workspaceId: 'late-invite', firstInviteAt: daysAgo(2) }),
          team({ workspaceId: 'no-invite' }),
        ],
        releases: [
          release({ id: 'r1', workspaceId: 'yes' }),
          release({ id: 'r2', workspaceId: 'late-invite' }),
          release({ id: 'r3', workspaceId: 'no-invite' }),
        ],
      }),
      30,
      null,
      noEmails
    );
    expect(counts(funnel.steps).slice(0, 3)).toEqual([3, 3, 1]);
  });

  it('trial over: ended or paid during it; comped and allowlisted left out', () => {
    const funnel = buildFunnel(
      input({
        teams: [
          team({ workspaceId: 'ended' }),
          team({ workspaceId: 'extended', trialEndsAt: new Date(NOW.getTime() + 5 * DAY).toISOString() }),
          team({
            workspaceId: 'paid-early',
            trialEndsAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
            ownerPaidAt: daysAgo(6),
          }),
          team({ workspaceId: 'comped', comped: true }),
          team({ workspaceId: 'allow', allowlisted: true }),
          team({ workspaceId: 'no-trial', trialEndsAt: null, trialStartedAt: null }),
        ],
      }),
      30,
      null,
      noEmails
    );
    expect(funnel.steps[0].count).toBe(6);
    expect(funnel.steps[3].count).toBe(2);
    expect(funnel.steps[4].count).toBe(1);
  });

  it('paid: money after the trial started, never an old payment or a comped team', () => {
    const funnel = buildFunnel(
      input({
        teams: [
          team({ workspaceId: 'paid', ownerPaidAt: daysAgo(5) }),
          team({ workspaceId: 'old-payment', ownerPaidAt: daysAgo(400) }),
          team({ workspaceId: 'comped-paid', comped: true, ownerPaidAt: daysAgo(5) }),
          // No trial stamp: sign-up is the start.
          team({ workspaceId: 'no-stamp', trialStartedAt: null, trialEndsAt: null, ownerPaidAt: daysAgo(8) }),
        ],
      }),
      30,
      null,
      noEmails
    );
    expect(funnel.steps[4].count).toBe(2);
    // Both payers also count as trial over.
    expect(funnel.steps[4].carried).toBe(2);
  });

  it('matches the waitlist against owner emails over the whole window', () => {
    const funnel = buildFunnel(
      input({ teams: [team({ workspaceId: 'a' })] }),
      30,
      [
        { email: 'Owner@a.com', joinedAt: daysAgo(12) },
        { email: 'lurker@b.com', joinedAt: daysAgo(1) },
        { email: 'early@c.com', joinedAt: daysAgo(60) },
      ],
      new Map([
        ['a', 'owner@a.com'],
        ['b', null],
      ])
    );
    expect(funnel.waitlist).toEqual({ joined: 2, withAccount: 1, rate: 0.5 });
  });

  it("equals the Scoreboard's own Activation over 30 days", () => {
    const teams = [
      team({ workspaceId: 'a', firstInviteAt: daysAgo(9) }),
      team({ workspaceId: 'b', ownerSignedUpAt: daysAgo(25), firstInviteAt: daysAgo(24) }),
      team({ workspaceId: 'c', ownerSignedUpAt: daysAgo(20) }),
      team({ workspaceId: 'd', ownerSignedUpAt: daysAgo(2), firstInviteAt: daysAgo(1) }),
      team({ workspaceId: 'e', ownerSignedUpAt: daysAgo(45), firstInviteAt: daysAgo(44) }),
    ];
    const releases = [
      release({ id: 'r1', workspaceId: 'a' }),
      release({ id: 'r2', workspaceId: 'b', createdAt: daysAgo(23) }),
      release({ id: 'r3', workspaceId: 'c', createdAt: daysAgo(19) }),
      release({ id: 'r4', workspaceId: 'd', createdAt: daysAgo(1) }),
      release({ id: 'r5', workspaceId: 'e', createdAt: daysAgo(44) }),
    ];
    const data = input({ teams, releases });
    const board = buildScoreboard(data);
    const funnel = buildFunnel(data, 30, null, noEmails);
    expect(funnel.steps[0].count).toBe(board.activation.signups);
    expect(funnel.steps[2].count).toBe(board.activation.activated);
    expect(board.activation).toEqual({ signups: 3, activated: 2, rate: 2 / 3 });
  });

  it('buildFunnels gives one funnel per window, smallest first', () => {
    const funnels = buildFunnels(
      input({ teams: [team({ workspaceId: 'a' }), team({ workspaceId: 'b', ownerSignedUpAt: daysAgo(60) })] }),
      null,
      noEmails
    );
    expect(funnels.map((funnel) => funnel.windowDays)).toEqual([...FUNNEL_WINDOWS]);
    expect(funnels.map((funnel) => funnel.steps[0].count)).toEqual([1, 2]);
  });
});

describe('isActivatedTeam (shared with the Scoreboard)', () => {
  it('needs both events inside 3 days and skips test rollouts', () => {
    const t = team({ workspaceId: 'a', firstInviteAt: daysAgo(9) });
    expect(isActivatedTeam(t, [release({ id: 'r', workspaceId: 'a' })])).toBe(true);
    expect(isActivatedTeam(t, [release({ id: 'r', workspaceId: 'a', isTest: true })])).toBe(false);
    expect(isActivatedTeam(t, [release({ id: 'r', workspaceId: 'a', createdAt: daysAgo(2) })])).toBe(false);
    expect(isActivatedTeam({ ...t, firstInviteAt: null }, [release({ id: 'r', workspaceId: 'a' })])).toBe(false);
    expect(isActivatedTeam({ ...t, ownerSignedUpAt: null }, [release({ id: 'r', workspaceId: 'a' })])).toBe(false);
  });

  it('keeps activationSummary unchanged', () => {
    const teams = [team({ workspaceId: 'a', firstInviteAt: daysAgo(9) }), team({ workspaceId: 'b' })];
    const releases = [release({ id: 'r1', workspaceId: 'a' }), release({ id: 'r2', workspaceId: 'b' })];
    expect(activationSummary(teams, releases, NOW, 30)).toEqual({ signups: 2, activated: 1, rate: 0.5 });
  });
});

describe('admin-funnel-format', () => {
  it('formats shares and conversions plainly', () => {
    expect(formatShare(0.375)).toBe('38%');
    expect(formatShare(null)).toBe('—');
    const step: FunnelStep = { key: 'paid', count: 3, carried: 3, fromPrevious: 0.375, ofAccounts: 0.1 };
    expect(formatConversion(step, 8)).toBe('3 of 8 (38%)');
    expect(formatConversion({ ...step, fromPrevious: null, carried: 0 }, 0)).toBe('No one at the step before');
  });

  it('reads the waitlist as Not tracked, empty, or a match', () => {
    expect(formatWaitlist(null)).toBe('Not tracked');
    expect(formatWaitlist({ joined: 0, withAccount: 0, rate: null })).toBe('No one joined in this window');
    expect(formatWaitlist({ joined: 5, withAccount: 2, rate: 0.4 })).toBe('5 joined, 2 have an account (40%)');
    expect(formatWaitlist({ joined: 3, withAccount: 1, rate: 1 / 3 })).toBe('3 joined, 1 has an account (33%)');
  });

  it('mentions newer sign-ups only when there are some', () => {
    const base = buildFunnel(input(), 30, null, noEmails);
    expect(formatTooNew(base)).toBeNull();
    expect(formatTooNew({ ...base, tooNew: 1 })).toMatch(/^1 newer sign-up is/);
    expect(formatTooNew({ ...base, tooNew: 4 })).toMatch(/^4 newer sign-ups are/);
  });

  it('has a label and a definition for every step', () => {
    for (const key of ['account', 'first_rollout', 'activated', 'trial_over', 'paid'] as const) {
      expect(FUNNEL_STEP_COPY[key].label.length).toBeGreaterThan(0);
      expect(FUNNEL_STEP_COPY[key].info.length).toBeGreaterThan(20);
    }
  });
});
