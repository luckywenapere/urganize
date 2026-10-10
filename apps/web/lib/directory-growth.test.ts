import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_GROWTH_WEEKS,
  DIRECTORY_LIVE_MONTHS,
  buildDirectoryGrowth,
  buildLiveAtMap,
  type DirectoryGrowthInput,
} from './directory-growth';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function input(over: Partial<DirectoryGrowthInput> = {}): DirectoryGrowthInput {
  return {
    now: NOW,
    profiles: [],
    invites: [],
    rollouts: [],
    requests: [],
    acceptedTracked: true,
    liveAtByReleaseId: new Map(),
    searches: [],
    ...over,
  };
}

const profile = (over: Partial<NonNullable<DirectoryGrowthInput['profiles']>[number]> = {}) => ({
  userId: null,
  workspaceId: null,
  createdAt: ago(1),
  claimedAt: null,
  seeded: true,
  ...over,
});

describe('buildDirectoryGrowth: the weeks', () => {
  it('returns eight rolling weeks, oldest first, the newest ending now', () => {
    const { weeks } = buildDirectoryGrowth(input());
    expect(weeks).toHaveLength(DIRECTORY_GROWTH_WEEKS);
    expect(weeks[weeks.length - 1].endsAt).toBe(NOW.toISOString());
    expect(weeks[0].endsAt < weeks[1].endsAt).toBe(true);
  });

  it('counts a seeded profile in the week it was made, and an unseeded one not at all', () => {
    const { weeks } = buildDirectoryGrowth(
      input({ profiles: [profile({ createdAt: ago(2) }), profile({ createdAt: ago(10) }), profile({ createdAt: ago(1), seeded: false })] })
    );
    expect(weeks[7].seeded).toBe(1);
    expect(weeks[6].seeded).toBe(1);
    expect(weeks.reduce((sum, week) => sum + (week.seeded ?? 0), 0)).toBe(2);
  });

  it('counts a profile claimed in a week by its claim time, not its creation time', () => {
    const { weeks } = buildDirectoryGrowth(
      input({ profiles: [profile({ createdAt: ago(40), claimedAt: ago(3) })] })
    );
    expect(weeks[7].claimed).toBe(1);
    expect(weeks[7].seeded).toBe(0);
  });

  it('counts invites by the week they were sent', () => {
    const { weeks } = buildDirectoryGrowth(input({ invites: [{ createdAt: ago(1), workspaceId: null, ownerUserId: null }, { createdAt: ago(8), workspaceId: null, ownerUserId: null }] }));
    expect(weeks[7].invitesSent).toBe(1);
    expect(weeks[6].invitesSent).toBe(1);
  });

  it('puts a rollout exactly one week back in the earlier week (windows do not overlap)', () => {
    const { weeks } = buildDirectoryGrowth(input({ invites: [{ createdAt: ago(7), workspaceId: null, ownerUserId: null }] }));
    const total = weeks.reduce((sum, week) => sum + (week.invitesSent ?? 0), 0);
    expect(total).toBe(1);
  });

  it('ignores anything older than the eight weeks', () => {
    const { weeks } = buildDirectoryGrowth(input({ invites: [{ createdAt: ago(200), workspaceId: null, ownerUserId: null }] }));
    expect(weeks.reduce((sum, week) => sum + (week.invitesSent ?? 0), 0)).toBe(0);
  });
});

describe('buildDirectoryGrowth: claimed people who started a rollout', () => {
  it('counts a claimed person once, in the week of their first rollout after claiming', () => {
    const { weeks } = buildDirectoryGrowth(
      input({
        profiles: [profile({ userId: 'u1', createdAt: ago(40), claimedAt: ago(20) })],
        rollouts: [
          { ownerUserId: 'u1', createdAt: ago(3) },
          { ownerUserId: 'u1', createdAt: ago(1) },
        ],
      })
    );
    expect(weeks.reduce((sum, week) => sum + (week.startedRollout ?? 0), 0)).toBe(1);
    expect(weeks[7].startedRollout).toBe(1);
  });

  it('does not count a rollout made before the profile was claimed', () => {
    const { weeks } = buildDirectoryGrowth(
      input({
        profiles: [profile({ userId: 'u1', claimedAt: ago(5) })],
        rollouts: [{ ownerUserId: 'u1', createdAt: ago(30) }],
      })
    );
    expect(weeks.reduce((sum, week) => sum + (week.startedRollout ?? 0), 0)).toBe(0);
  });

  it('is not tracked when the rollouts could not be read', () => {
    const { weeks } = buildDirectoryGrowth(
      input({ profiles: [profile({ userId: 'u1', claimedAt: ago(5) })], rollouts: null })
    );
    expect(weeks.every((week) => week.startedRollout === null)).toBe(true);
  });
});

describe('buildDirectoryGrowth: requests and searches', () => {
  it('counts requests sent, answered yes and answered no by week, and the reply rate leaves waiting ones out', () => {
    const { weeks, totals } = buildDirectoryGrowth(
      input({
        requests: [
          { createdAt: ago(1), status: 'new', acceptedReleaseId: null, workspaceId: null, ownerUserId: null },
          { createdAt: ago(2), status: 'interested', acceptedReleaseId: null, workspaceId: null, ownerUserId: null },
          { createdAt: ago(3), status: 'passed', acceptedReleaseId: null, workspaceId: null, ownerUserId: null },
          { createdAt: ago(20), status: 'expired', acceptedReleaseId: null, workspaceId: null, ownerUserId: null },
        ],
      })
    );
    expect(weeks[7].requestsSent).toBe(3);
    expect(weeks[7].accepted).toBe(1);
    expect(weeks[7].passed).toBe(1);
    // Answered 2, closed 1 (the stale one), the waiting one is not in the rate.
    expect(totals.replyRate).toBeCloseTo(2 / 3);
  });

  it('reads a waiting request older than seven days as closed, like the app does', () => {
    const { totals } = buildDirectoryGrowth(
      input({ requests: [{ createdAt: ago(10), status: 'new', acceptedReleaseId: null, workspaceId: null, ownerUserId: null }] })
    );
    expect(totals.replyRate).toBe(0);
  });

  it('has no reply rate when nothing has a known outcome', () => {
    const { totals } = buildDirectoryGrowth(
      input({ requests: [{ createdAt: ago(1), status: 'new', acceptedReleaseId: null, workspaceId: null, ownerUserId: null }] })
    );
    expect(totals.replyRate).toBeNull();
  });

  it('counts searches by week, and is not tracked when the read failed', () => {
    const tracked = buildDirectoryGrowth(input({ searches: [{ createdAt: ago(1), workspaceId: null, ownerUserId: null }] }));
    expect(tracked.weeks[7].searches).toBe(1);
    const missing = buildDirectoryGrowth(input({ searches: null }));
    expect(missing.weeks.every((week) => week.searches === null)).toBe(true);
  });

  it('is not tracked for every profile column when profiles could not be read, never zero', () => {
    const { weeks } = buildDirectoryGrowth(input({ profiles: null }));
    for (const week of weeks) {
      expect(week.seeded).toBeNull();
      expect(week.claimed).toBeNull();
      expect(week.startedRollout).toBeNull();
    }
  });

  it('is not tracked for invites when the invite table could not be read', () => {
    expect(buildDirectoryGrowth(input({ invites: null })).weeks.every((week) => week.invitesSent === null)).toBe(true);
  });

  it('is not tracked for every request column when the requests could not be read', () => {
    const { weeks, totals } = buildDirectoryGrowth(input({ requests: null }));
    expect(weeks.every((week) => week.requestsSent === null && week.accepted === null)).toBe(true);
    expect(totals.replyRate).toBeNull();
  });
});

describe('buildDirectoryGrowth: rollouts live from the directory', () => {
  const accepted = (releaseId: string | null, days = 40) => ({
    createdAt: ago(days),
    status: 'interested',
    acceptedReleaseId: releaseId,
    workspaceId: null,
    ownerUserId: null,
  });

  it('is not tracked when the accepted rollout column does not exist', () => {
    const { live } = buildDirectoryGrowth(input({ acceptedTracked: false, requests: [accepted('r1')] }));
    expect(live.months).toBeNull();
    expect(live.thisMonthLive).toBeNull();
  });

  it('counts a rollout live in the month it went live, and started in the month the request was made', () => {
    const liveAt = Date.parse('2026-10-03T00:00:00.000Z');
    const { live } = buildDirectoryGrowth(
      input({
        requests: [accepted('r1', 5), accepted('r2', 5)],
        liveAtByReleaseId: new Map([
          ['r1', liveAt],
          ['r2', null],
        ]),
      })
    );
    const october = live.months?.find((month) => month.month === '2026-10');
    expect(october?.started).toBe(2);
    expect(october?.live).toBe(1);
    expect(live.thisMonthLive).toBe(1);
  });

  it('does not count a rollout whose live time is still ahead, even later this month', () => {
    const { live } = buildDirectoryGrowth(
      input({
        requests: [accepted('r1', 5)],
        liveAtByReleaseId: new Map([['r1', Date.parse('2026-10-20T00:00:00.000Z')]]),
      })
    );
    expect(live.thisMonthLive).toBe(0);
  });

  it('ignores a request that was answered yes but has no rollout attached', () => {
    const { live } = buildDirectoryGrowth(input({ requests: [accepted(null, 10)] }));
    expect(live.months?.every((month) => month.started === 0)).toBe(true);
  });

  it('counts each rollout once even if two requests name it', () => {
    const { live } = buildDirectoryGrowth(
      input({
        requests: [accepted('r1', 10), accepted('r1', 9)],
        liveAtByReleaseId: new Map([['r1', Date.parse('2026-10-03T00:00:00.000Z')]]),
      })
    );
    expect(live.thisMonthLive).toBe(1);
  });

  it('returns the last six months, oldest first', () => {
    const { live } = buildDirectoryGrowth(input());
    expect(live.months).toHaveLength(DIRECTORY_LIVE_MONTHS);
    expect(live.months?.[DIRECTORY_LIVE_MONTHS - 1].month).toBe('2026-10');
    expect(live.months?.[0].month).toBe('2026-05');
  });
});

describe('buildDirectoryGrowth: our own accounts', () => {
  it('leaves out rows owned by an internal user or workspace', () => {
    const exclusion = { workspaceIds: new Set(['w-ours']), userIds: new Set(['u-ours']) };
    const { weeks } = buildDirectoryGrowth(
      input({
        invites: [
          { createdAt: ago(1), workspaceId: 'w-ours', ownerUserId: null },
          { createdAt: ago(1), workspaceId: 'w-other', ownerUserId: null },
        ],
        requests: [
          { createdAt: ago(1), status: 'new', acceptedReleaseId: null, workspaceId: null, ownerUserId: 'u-ours' },
        ],
        profiles: [profile({ workspaceId: 'w-ours' })],
        exclusion,
      })
    );
    expect(weeks[7].invitesSent).toBe(1);
    expect(weeks[7].requestsSent).toBe(0);
    expect(weeks[7].seeded).toBe(0);
  });
});

describe('buildDirectoryGrowth: the cockpit tile', () => {
  it('reads this week against last week for claims, and carries this month live', () => {
    const { tile } = buildDirectoryGrowth(
      input({
        profiles: [
          profile({ claimedAt: ago(1) }),
          profile({ claimedAt: ago(2) }),
          profile({ claimedAt: ago(9) }),
        ],
      })
    );
    expect(tile.claimedThisWeek).toEqual({ current: 2, previous: 1, delta: 1, pct: 1 });
  });

  it('is not tracked for claims when profiles could not be read', () => {
    const { tile } = buildDirectoryGrowth(input({ profiles: null }));
    expect(tile.claimedThisWeek).toBeNull();
  });
});

describe('buildLiveAtMap', () => {
  const release = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    workspaceId: 'w',
    createdAt: ago(30),
    updatedAt: ago(30),
    releaseDate: null,
    status: 'draft',
    isTest: false,
    taskCount: 0,
    allTasksDone: false,
    lastTaskDoneAt: null,
    ...over,
  });

  it('uses the Scoreboard rule: a past release day is live, a future one is not', () => {
    const map = buildLiveAtMap(['past', 'future'], [release('past', { releaseDate: ago(5).slice(0, 10) }), release('future', { releaseDate: '2026-12-01' })], NOW);
    expect(map.get('past')).not.toBeNull();
    expect(map.get('future')).toBeNull();
  });

  it('reads a missing or test rollout as not live', () => {
    const map = buildLiveAtMap(['gone', 'test'], [release('test', { isTest: true, releaseDate: ago(5).slice(0, 10) })], NOW);
    expect(map.get('gone')).toBeNull();
    expect(map.get('test')).toBeNull();
  });
});
