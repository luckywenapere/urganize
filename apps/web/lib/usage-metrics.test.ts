import { describe, expect, it } from 'vitest';
import {
  buildUsageMetrics,
  classifyPlan,
  isOpenRollout,
  shortDayLabel,
  trailingWeeks,
  weekStartDay,
  type MetricsPerson,
  type MetricsRelease,
  type UsageMetricsInput,
} from './usage-metrics';

// 13:00 in Lagos on Wednesday 7 October 2026.
const NOW = new Date('2026-10-07T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function person(userId: string, over: Partial<MetricsPerson> = {}): MetricsPerson {
  return {
    userId,
    email: `${userId}@example.com`,
    name: userId,
    role: 'manager',
    createdAt: '2026-06-01T00:00:00.000Z',
    lastSignInAt: null,
    onboardingCompleted: true,
    ...over,
  };
}

function release(id: string, over: Partial<MetricsRelease> = {}): MetricsRelease {
  return {
    id,
    workspaceId: 'team',
    ownerUserId: 'ada',
    createdAt: '2026-06-01T00:00:00.000Z',
    releaseDate: null,
    status: 'draft',
    isTest: false,
    plannerPending: false,
    templatePending: false,
    plannedByUrgans: false,
    draftAiApplied: null,
    taskCount: 0,
    doneCount: 0,
    autoTaskCount: 0,
    ...over,
  };
}

function input(over: Partial<UsageMetricsInput> = {}): UsageMetricsInput {
  return {
    now: NOW,
    people: [],
    presence: [],
    activity: new Map(),
    latestEvents: new Map(),
    appOpens: [],
    releases: [],
    tasks: [],
    teams: [],
    urgansTurns: [],
    aiCost: null,
    waitlistTotal: null,
    hiddenUserIds: new Set(),
    ...over,
  };
}

describe('dates', () => {
  it('labels a day plainly', () => {
    expect(shortDayLabel('2026-10-07')).toBe('Oct 7');
  });

  it('starts a week on Monday', () => {
    expect(weekStartDay('2026-10-07')).toBe('2026-10-05');
    expect(weekStartDay('2026-10-05')).toBe('2026-10-05');
    expect(weekStartDay('2026-10-04')).toBe('2026-09-28');
  });

  it('lists the last twelve weeks oldest first, ending with this one', () => {
    const weeks = trailingWeeks(NOW, 12);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toBe('2026-10-05');
    expect(weeks[0]).toBe('2026-07-20');
  });
});

describe('online now', () => {
  it('lists people whose last ping is within five minutes, newest first', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [person('ada'), person('ben'), person('cy')],
        presence: [
          { userId: 'ada', day: '2026-10-07', lastSeenAt: ago(60 * 1000), surface: 'phone_web' },
          { userId: 'ben', day: '2026-10-07', lastSeenAt: ago(20 * 1000), surface: 'desktop_web' },
          { userId: 'cy', day: '2026-10-07', lastSeenAt: ago(10 * 60 * 1000), surface: 'ios_app' },
        ],
      })
    );
    expect(metrics.online.map((p) => p.userId)).toEqual(['ben', 'ada']);
    expect(metrics.online[1].surface).toBe('phone_web');
  });
});

describe('active people', () => {
  it('counts a person once a day whatever told us they were there', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [person('ada', { lastSignInAt: ago(2 * DAY) }), person('ben')],
        presence: [{ userId: 'ada', day: '2026-10-07', lastSeenAt: ago(60 * 60 * 1000), surface: 'desktop_web' }],
        activity: new Map([['ada', [NOW.getTime() - 3 * 60 * 60 * 1000]]]),
        appOpens: [{ userId: 'ben', at: NOW.getTime() - 20 * DAY }],
      })
    );
    expect(metrics.active.today).toBe(1);
    expect(metrics.active.last7d).toBe(1);
    expect(metrics.active.last30d).toBe(2);
    expect(metrics.active.stickiness).toBe(0.5);
    const todayPoint = metrics.active.daily[metrics.active.daily.length - 1];
    expect(todayPoint.key).toBe('2026-10-07');
    expect(todayPoint.value).toBe(1);
  });

  it('counts someone who only had the app open, which no write ever records', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [person('ada')],
        presence: [{ userId: 'ada', day: '2026-10-06', lastSeenAt: ago(DAY), surface: 'desktop_web' }],
      })
    );
    expect(metrics.active.last7d).toBe(1);
    expect(metrics.recent[0].lastThing).toBe('had the app open');
  });

  it('counts new people who joined and came back in the last week', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [person('new', { createdAt: ago(2 * DAY), lastSignInAt: ago(DAY) }), person('old', { lastSignInAt: ago(DAY) })],
      })
    );
    expect(metrics.active.newPeople7d).toBe(1);
  });

  it('measures weekly growth against the 7 days before, with the +10% target', () => {
    const at = (days: number) => NOW.getTime() - days * DAY;
    const metrics = buildUsageMetrics(
      input({
        people: ['a', 'b', 'c', 'd'].map((id) => person(id)),
        activity: new Map([
          ['a', [at(1), at(9)]],
          ['b', [at(2)]],
          ['c', [at(3)]],
          ['d', [at(10)]],
        ]),
      })
    );
    expect(metrics.active.last7d).toBe(3);
    expect(metrics.active.prev7d).toBe(2);
    expect(metrics.active.growth7d).toBe(0.5);
    expect(metrics.active.targetFor10pct).toBe(4);
    expect(metrics.active.weekly).toHaveLength(12);
    const total = metrics.active.weekly.reduce((sum, point) => sum + point.value, 0);
    // a is in two weeks; b, c and d in one each, whichever weeks those days fall in.
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(5);
  });

  it('counts a person once a week however many days they came', () => {
    const at = (hours: number) => NOW.getTime() - hours * 60 * 60 * 1000;
    const metrics = buildUsageMetrics(
      input({ people: [person('a')], activity: new Map([['a', [at(1), at(2), at(3)]]]) })
    );
    expect(metrics.active.weekly[metrics.active.weekly.length - 1].value).toBe(1);
  });

  it('has no weekly growth when nobody was active the week before', () => {
    const metrics = buildUsageMetrics(
      input({ people: [person('a')], activity: new Map([['a', [NOW.getTime() - DAY]]]) })
    );
    expect(metrics.active.growth7d).toBeNull();
    expect(metrics.active.targetFor10pct).toBe(2);
  });

  it('has no stickiness when nobody was active', () => {
    expect(buildUsageMetrics(input()).active.stickiness).toBeNull();
  });
});

describe('our team is hidden', () => {
  it('leaves hidden people out of every count and list', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [person('founder'), person('ada')],
        presence: [
          { userId: 'founder', day: '2026-10-07', lastSeenAt: ago(30 * 1000), surface: 'desktop_web' },
          { userId: 'ada', day: '2026-10-07', lastSeenAt: ago(30 * 1000), surface: 'desktop_web' },
        ],
        releases: [release('r1', { ownerUserId: 'founder' }), release('r2', { ownerUserId: 'ada' })],
        urgansTurns: [
          { userId: 'founder', at: NOW.getTime() - DAY },
          { userId: 'ada', at: NOW.getTime() - DAY },
        ],
        hiddenUserIds: new Set(['founder']),
      })
    );
    expect(metrics.online.map((p) => p.userId)).toEqual(['ada']);
    expect(metrics.active.today).toBe(1);
    expect(metrics.rollouts.total).toBe(1);
    expect(metrics.accounts.total).toBe(1);
    expect(metrics.work.urgansTurns7d).toBe(1);
    expect(metrics.recent.map((p) => p.userId)).toEqual(['ada']);
  });
});

describe('rollouts', () => {
  it('counts real rollouts and test ones apart', () => {
    const metrics = buildUsageMetrics(
      input({
        releases: [
          release('r1', { createdAt: ago(DAY) }),
          release('r2', { createdAt: ago(10 * DAY) }),
          release('t1', { isTest: true, createdAt: ago(DAY) }),
        ],
      })
    );
    expect(metrics.rollouts.total).toBe(2);
    expect(metrics.rollouts.tests).toBe(1);
    expect(metrics.rollouts.last7d).toBe(1);
    expect(metrics.rollouts.last30d).toBe(2);
    expect(metrics.rollouts.weekly.reduce((sum, point) => sum + point.value, 0)).toBe(2);
  });

  it('counts rollouts going out soon and out recently, leaving archived ones out', () => {
    const metrics = buildUsageMetrics(
      input({
        releases: [
          release('soon', { releaseDate: '2026-10-07' }),
          release('later', { releaseDate: '2026-11-06' }),
          release('too-far', { releaseDate: '2026-11-07' }),
          release('out', { releaseDate: '2026-09-07' }),
          release('archived', { releaseDate: '2026-10-10', status: 'archived' }),
        ],
      })
    );
    expect(metrics.rollouts.goingOutNext30d).toBe(2);
    expect(metrics.rollouts.outLast30d).toBe(1);
  });

  it('splits how plans were made', () => {
    expect(classifyPlan(release('a', { draftAiApplied: true }))).toBe('urgans');
    expect(classifyPlan(release('a', { draftAiApplied: false, autoTaskCount: 60 }))).toBe('playbook');
    expect(classifyPlan(release('a', { autoTaskCount: 64, taskCount: 64 }))).toBe('playbook');
    expect(classifyPlan(release('a', { taskCount: 5 }))).toBe('own');
    expect(classifyPlan(release('a', { plannerPending: true }))).toBe('none');
    expect(classifyPlan(release('a', { templatePending: true }))).toBe('none');
    expect(classifyPlan(release('a'))).toBe('none');
    expect(classifyPlan(release('a', { plannedByUrgans: true }))).toBe('urgans');
  });

  it('counts a plan the model did not change as the playbook, even though the build stamped it', () => {
    // planned_by_urgans is written whenever the planner builds a plan, tailored
    // or not, so the draft's own record of whether the AI applied wins.
    expect(
      classifyPlan(release('a', { plannedByUrgans: true, draftAiApplied: false, autoTaskCount: 60, taskCount: 60 }))
    ).toBe('playbook');
  });

  it('never counts a test rollout in the plan split', () => {
    const metrics = buildUsageMetrics(
      input({ releases: [release('t', { isTest: true, autoTaskCount: 64, taskCount: 64 })] })
    );
    expect(metrics.rollouts.plans).toEqual({ urgans: 0, playbook: 0, own: 0, none: 0 });
  });
});

describe('isOpenRollout', () => {
  it('is open with a date ahead, or with no date and work left', () => {
    expect(isOpenRollout(release('a', { releaseDate: '2026-10-07' }), '2026-10-07')).toBe(true);
    expect(isOpenRollout(release('a', { releaseDate: '2026-10-06' }), '2026-10-07')).toBe(false);
    expect(isOpenRollout(release('a', { taskCount: 3, doneCount: 1 }), '2026-10-07')).toBe(true);
    expect(isOpenRollout(release('a', { taskCount: 3, doneCount: 3 }), '2026-10-07')).toBe(false);
    expect(isOpenRollout(release('a', { releaseDate: '2026-12-01', isTest: true }), '2026-10-07')).toBe(false);
    expect(isOpenRollout(release('a', { releaseDate: '2026-12-01', status: 'archived' }), '2026-10-07')).toBe(false);
  });
});

describe('between releases and gone quiet', () => {
  it('lists active people whose teams have nothing coming up', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [
          person('busy', { lastSignInAt: ago(DAY) }),
          person('idle', { lastSignInAt: ago(DAY) }),
          person('curator', { role: 'curator', lastSignInAt: ago(DAY) }),
        ],
        teams: [
          { workspaceId: 'busy-team', name: 'Busy', memberUserIds: ['busy'] },
          { workspaceId: 'idle-team', name: 'Idle', memberUserIds: ['idle'] },
        ],
        releases: [
          release('r1', { workspaceId: 'busy-team', releaseDate: '2026-11-01' }),
          release('r2', { workspaceId: 'idle-team', releaseDate: '2026-08-01' }),
        ],
      })
    );
    expect(metrics.betweenReleases.map((p) => p.userId)).toEqual(['idle']);
    expect(metrics.betweenReleases[0].team).toBe('Idle');
  });

  it('lists people last seen 31 to 90 days ago as gone quiet', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [
          person('recent', { lastSignInAt: ago(5 * DAY) }),
          person('quiet', { lastSignInAt: ago(40 * DAY) }),
          person('long-gone', { lastSignInAt: ago(120 * DAY) }),
        ],
      })
    );
    expect(metrics.goneQuiet.map((p) => p.userId)).toEqual(['quiet']);
    expect(metrics.goneQuietCount).toBe(1);
  });
});

describe('recently active', () => {
  it('says what each person did last and counts their actions', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [person('ada', { lastSignInAt: ago(5 * DAY) })],
        activity: new Map([['ada', [NOW.getTime() - DAY, NOW.getTime() - 2 * DAY, NOW.getTime() - 20 * DAY]]]),
        latestEvents: new Map([['ada', { at: NOW.getTime() - DAY, label: 'created a rollout' }]]),
      })
    );
    expect(metrics.recent[0]).toMatchObject({
      userId: 'ada',
      lastThing: 'created a rollout',
      actions7d: 2,
      actions30d: 3,
    });
  });

  it('falls back to the email name, then a short id, when there is no name', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [
          person('a1', { name: null, email: 'kemi@example.com', lastSignInAt: ago(DAY) }),
          person('a2', { name: ' ', email: null, lastSignInAt: ago(2 * DAY) }),
        ],
      })
    );
    expect(metrics.recent.map((p) => p.name)).toEqual(['kemi', 'Account a2']);
  });
});

describe('accounts and work', () => {
  it('counts accounts, curators and onboarding', () => {
    const metrics = buildUsageMetrics(
      input({
        people: [
          person('a', { createdAt: ago(DAY) }),
          person('b', { onboardingCompleted: false, createdAt: ago(20 * DAY) }),
          person('c', { role: 'curator', onboardingCompleted: false }),
        ],
        waitlistTotal: 104,
      })
    );
    expect(metrics.accounts).toMatchObject({ total: 3, curators: 1, new7d: 1, new30d: 2, waitlist: 104 });
    expect(metrics.accounts.onboardingRate).toBe(0.5);
  });

  it('counts activities done and added by hand, and AI cost', () => {
    const metrics = buildUsageMetrics(
      input({
        tasks: [
          { releaseId: 'r', status: 'done', completedAt: ago(DAY), updatedAt: null, createdAt: ago(40 * DAY), autoGenerated: true },
          { releaseId: 'r', status: 'done', completedAt: null, updatedAt: ago(10 * DAY), createdAt: ago(40 * DAY), autoGenerated: true },
          { releaseId: 'r', status: 'todo', completedAt: null, updatedAt: null, createdAt: ago(DAY), autoGenerated: false },
        ],
        aiCost: {
          source: 'ai_usage_events',
          rows: [
            { userId: 'a', at: NOW.getTime() - DAY, usd: 0.25 },
            { userId: 'a', at: NOW.getTime() - 40 * DAY, usd: 5 },
          ],
        },
      })
    );
    expect(metrics.work).toMatchObject({
      activitiesDone7d: 1,
      activitiesDone30d: 2,
      addedByHand7d: 1,
      aiCostUsd30d: 0.25,
      aiCostSource: 'ai_usage_events',
    });
  });

  it('reports AI cost as not tracked rather than zero when nothing could be read', () => {
    expect(buildUsageMetrics(input()).work.aiCostUsd30d).toBeNull();
  });
});
