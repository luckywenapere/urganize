import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { internalUserIds, isInternalRow, withoutInternalAccounts } from './admin-internal-accounts';
import { buildFounderCockpit } from './founder-cockpit';
import { churnSummary } from './admin-churn';
import { buildScoreboard, type ScoreboardInput, type ScoreboardSubscription, type ScoreboardTeam } from './scoreboard';

// Our own accounts left out of the cockpit and the Scoreboard (iteration 6,
// 2026-10-10). The rule, that it leaves its input alone (the read cache hands
// one object to both pages), that the two pages still agree, and that every
// admin page reads the same list.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(Date.UTC(2026, 9, 10, 12, 0, 0));
const at = (daysBack: number) => NOW.getTime() - daysBack * DAY;
const daysAgo = (n: number) => new Date(at(n)).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

function paid(userId: string, over: Partial<ScoreboardSubscription> = {}): ScoreboardSubscription {
  return {
    userId,
    plan: 'manager',
    status: 'active',
    amountMinor: 2_200_000,
    billingInterval: 'monthly',
    expiresAt: daysAhead(20),
    startedAt: daysAgo(60),
    ...over,
  };
}

function team(id: string, over: Partial<ScoreboardTeam> = {}): ScoreboardTeam {
  return {
    workspaceId: id,
    name: id,
    ownerUserId: `${id}-owner`,
    createdAt: daysAgo(200),
    ownerSignedUpAt: daysAgo(200),
    memberUserIds: [`${id}-owner`, `${id}-mate`],
    firstInviteAt: null,
    state: 'paid',
    comped: false,
    allowlisted: false,
    subscription: paid(`${id}-owner`),
    trialStartedAt: null,
    trialEndsAt: null,
    ownerPaidAt: daysAgo(60),
    ...over,
  };
}

function fixture(): ScoreboardInput {
  const ours = team('ours');
  const customer = team('customer');
  // One of us helps on a customer team that has only one real person active.
  const helped = team('helped', { memberUserIds: ['helped-owner', 'ours-owner'] });
  const activity = new Map<string, number[]>([
    ['ours-owner', [at(1), at(9)]],
    ['ours-mate', [at(1), at(9)]],
    ['customer-owner', [at(2), at(8)]],
    ['customer-mate', [at(2), at(8)]],
    ['helped-owner', [at(3)]],
  ]);
  return {
    now: NOW,
    teams: [ours, customer, helped],
    releases: [
      { id: 'r-ours', workspaceId: 'ours', createdAt: daysAgo(30), updatedAt: daysAgo(1), releaseDate: null, status: 'draft', isTest: false, taskCount: 1, allTasksDone: false, lastTaskDoneAt: null },
      { id: 'r-customer', workspaceId: 'customer', createdAt: daysAgo(30), updatedAt: daysAgo(1), releaseDate: null, status: 'draft', isTest: false, taskCount: 1, allTasksDone: false, lastTaskDoneAt: null },
    ],
    subscriptions: [ours.subscription!, customer.subscription!, helped.subscription!, paid('ours-mate', { plan: 'solo', amountMinor: 500_000 })],
    activity,
    activityTruncated: false,
    referrals: {
      fromTeams: [{ workspaceId: 'ours', attachedAt: daysAgo(5) }, { workspaceId: 'customer', attachedAt: daysAgo(5) }],
      fromPartners: [],
    },
  };
}

const emails = new Map([
  ['ours-owner', 'Lucky@Urganize.app'],
  ['ours-mate', 'tedum@urganize.app'],
  ['customer-owner', 'manager@example.com'],
  ['helped-owner', 'label@example.com'],
]);
const internal = new Set(['lucky@urganize.app', 'tedum@urganize.app']);

describe('internalUserIds', () => {
  it('matches profile emails to the list, ignoring case', () => {
    expect([...internalUserIds(emails, internal)].sort()).toEqual(['ours-mate', 'ours-owner']);
  });

  it('matches nobody with an empty list (?team=1)', () => {
    expect(internalUserIds(emails, new Set()).size).toBe(0);
  });
});

describe('withoutInternalAccounts', () => {
  const ids = internalUserIds(emails, internal);

  it('drops our teams, their releases and referrals, our people and our subscriptions', () => {
    const { input, workspaceIds } = withoutInternalAccounts(fixture(), ids);
    expect([...workspaceIds]).toEqual(['ours']);
    expect(input.teams.map((t) => t.workspaceId)).toEqual(['customer', 'helped']);
    expect(input.teams.find((t) => t.workspaceId === 'helped')?.memberUserIds).toEqual(['helped-owner']);
    expect(input.releases.map((r) => r.id)).toEqual(['r-customer']);
    expect(input.subscriptions.map((s) => s.userId)).toEqual(['customer-owner', 'helped-owner']);
    expect([...input.activity.keys()].sort()).toEqual(['customer-mate', 'customer-owner', 'helped-owner']);
    expect(input.referrals?.fromTeams.map((r) => r.workspaceId)).toEqual(['customer']);
  });

  it('changes the numbers the way it should', () => {
    const before = buildScoreboard(fixture());
    const after = buildScoreboard(withoutInternalAccounts(fixture(), ids).input);
    // ours (2 of us) and helped (one of us + one customer) were weekly active; only customer is now.
    expect(before.weeklyActiveTeams).toBe(3);
    expect(after.weeklyActiveTeams).toBe(1);
    expect(after.weeklyActivePayingTeams).toBe(1);
    expect(before.mrrMinor).toBe(3 * 2_200_000 + 500_000);
    expect(after.mrrMinor).toBe(2 * 2_200_000);
  });

  it('leaves its input alone (the read cache shares it between pages)', () => {
    const original = fixture();
    const snapshot = JSON.stringify({ ...original, activity: [...original.activity] });
    withoutInternalAccounts(original, ids);
    expect(JSON.stringify({ ...original, activity: [...original.activity] })).toBe(snapshot);
  });

  it('drops our people from the signup list (URG-267) and leaves a missing list missing', () => {
    const withUsers: ScoreboardInput = {
      ...fixture(),
      users: [...emails.keys()].map((userId) => ({ userId, signedUpAt: daysAgo(30) })),
    };
    const kept = withoutInternalAccounts(withUsers, ids).input.users?.map((u) => u.userId) ?? [];
    expect(kept.some((id) => ids.has(id))).toBe(false);
    expect(kept.length).toBe(emails.size - ids.size);
    expect(withoutInternalAccounts(fixture(), ids).input.users).toBeUndefined();
  });

  it('returns the same input when nobody is left out', () => {
    const original = fixture();
    expect(withoutInternalAccounts(original, new Set()).input).toBe(original);
  });

  it('keeps the cockpit and the Scoreboard in agreement', () => {
    const input = withoutInternalAccounts(fixture(), ids).input;
    const board = buildScoreboard(input);
    const cockpit = buildFounderCockpit(input, board);
    expect(cockpit.northStar.current).toBe(board.weeklyActivePayingTeams);
    expect(cockpit.activeTeams.current).toBe(board.weeklyActiveTeams);
    expect(cockpit.mrrMinor).toBe(board.mrrMinor);
    expect(cockpit.payingTeams).toBe(board.payingTeams);
    // Churn reads the same input, so our own subscriptions are out of it too.
    expect(churnSummary(input).months[3].mrrAtStartMinor).toBe(2 * 2_200_000);
  });
});

describe('isInternalRow', () => {
  const exclusion = { workspaceIds: new Set(['ours']), userIds: new Set(['ours-owner']) };
  it('marks usage and ledger rows on our teams or charged to us', () => {
    expect(isInternalRow({ workspaceId: 'ours', ownerUserId: null }, exclusion)).toBe(true);
    expect(isInternalRow({ workspaceId: null, ownerUserId: 'ours-owner' }, exclusion)).toBe(true);
    expect(isInternalRow({ workspaceId: 'customer', ownerUserId: 'customer-owner' }, exclusion)).toBe(false);
    expect(isInternalRow({ workspaceId: null, ownerUserId: null }, exclusion)).toBe(false);
  });
});

describe('one list for every admin page', () => {
  const root = path.resolve(__dirname, '..');
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

  it('the metrics, cockpit and Scoreboard routes all use internalAccountEmails', () => {
    for (const file of [
      'app/api/admin/metrics/route.ts',
      'app/api/admin/cockpit/route.ts',
      'app/api/admin/scoreboard/route.ts',
    ]) {
      expect(read(file), file).toContain('internalAccountEmails()');
    }
    // Nobody keeps a private copy of the list.
    expect(read('app/api/admin/metrics/route.ts')).not.toContain('METRICS_INTERNAL_EMAILS ??');
  });

  it('the cockpit and the Scoreboard both build from the input with us left out', () => {
    for (const file of ['app/api/admin/cockpit/route.ts', 'app/api/admin/scoreboard/route.ts']) {
      const source = read(file);
      expect(source, file).toContain('withoutInternalAccounts(');
      expect(source, file).not.toMatch(/buildScoreboard\(fullInput\)/);
    }
  });

  it('every runway route method checks the admin first', () => {
    const source = read('app/api/admin/runway/route.ts');
    const methods = source.match(/export async function (GET|PUT|DELETE)\(/g) ?? [];
    expect(methods).toHaveLength(3);
    expect(source.match(/await verifyAdmin\(request\)/g)).toHaveLength(3);
  });
});
