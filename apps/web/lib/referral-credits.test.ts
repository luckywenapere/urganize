import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  PERSONAL_CODE_LENGTH,
  REFERRAL_REWARD_CAP,
  REFERRAL_REWARD_CREDITS,
  buildReferralStats,
  clawbackDedupeKey,
  decideClawback,
  decideReward,
  generatePersonalCode,
  isReferralCreditsEnabled,
  rewardDedupeKey,
} from './referral-credits';
import { REFERRAL_CODE_PATTERN, decideAttach } from './referrals';
import { buildHistory } from './credits/history';

describe('the switch', () => {
  it('is off unless the value is exactly true', () => {
    expect(isReferralCreditsEnabled({})).toBe(false);
    expect(isReferralCreditsEnabled({ NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS: '1' })).toBe(false);
    expect(isReferralCreditsEnabled({ NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS: ' True ' })).toBe(true);
  });
});

describe('personal codes', () => {
  it('has a fixed shape that is also a valid signup-link code', () => {
    const code = generatePersonalCode(() => 0);
    expect(code).toHaveLength(PERSONAL_CODE_LENGTH);
    expect(code.startsWith('U')).toBe(true);
    expect(REFERRAL_CODE_PATTERN.test(code)).toBe(true);
  });

  it('draws every character from the alphabet, and only there', () => {
    let calls = 0;
    const code = generatePersonalCode((max) => {
      expect(max).toBe(CODE_ALPHABET.length);
      calls += 1;
      return (calls * 7) % max;
    });
    for (const char of code.slice(1)) expect(CODE_ALPHABET).toContain(char);
    expect(calls).toBe(PERSONAL_CODE_LENGTH - 1);
  });

  it('leaves out the characters people misread', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) expect(CODE_ALPHABET).not.toContain(bad);
  });

  it('follows its random source, so two draws can differ', () => {
    const a = generatePersonalCode(() => 0);
    const b = generatePersonalCode(() => CODE_ALPHABET.length - 1);
    expect(a).not.toBe(b);
  });
});

describe('when the reward is paid', () => {
  it('pays the default credits for a first payment', () => {
    expect(decideReward({ referral: { rewardedAt: null }, rewardsAlreadyPaid: 0 })).toEqual({
      reward: true,
      credits: REFERRAL_REWARD_CREDITS,
    });
  });

  it('pays nothing for a team nobody invited', () => {
    expect(decideReward({ referral: null, rewardsAlreadyPaid: 0 })).toEqual({ reward: false, reason: 'not_referred' });
  });

  it('pays nothing twice for the same team', () => {
    expect(decideReward({ referral: { rewardedAt: '2026-10-05T00:00:00Z' }, rewardsAlreadyPaid: 1 })).toEqual({
      reward: false,
      reason: 'already_rewarded',
    });
  });

  it('stops at the cap, on the cap exactly', () => {
    const open = decideReward({ referral: { rewardedAt: null }, rewardsAlreadyPaid: REFERRAL_REWARD_CAP - 1 });
    expect(open).toMatchObject({ reward: true });
    const shut = decideReward({ referral: { rewardedAt: null }, rewardsAlreadyPaid: REFERRAL_REWARD_CAP });
    expect(shut).toEqual({ reward: false, reason: 'cap_reached' });
  });

  it('pays when the count cannot be read, because withholding a promised reward is the worse mistake', () => {
    expect(decideReward({ referral: { rewardedAt: null }, rewardsAlreadyPaid: null })).toMatchObject({ reward: true });
  });

  it('keys the credit on the invited team, so a redelivery cannot pay twice', () => {
    expect(rewardDedupeKey('ws-123')).toBe('referral:ws-123');
    expect(rewardDedupeKey('ws-123')).not.toBe(rewardDedupeKey('ws-456'));
  });
});

describe('what the inviting team sees', () => {
  it('counts invited, subscribed and earned', () => {
    const stats = buildReferralStats([
      { rewardedAt: '2026-10-05T00:00:00Z', rewardCredits: 100 },
      { rewardedAt: null, rewardCredits: null },
      { rewardedAt: '2026-10-09T00:00:00Z', rewardCredits: 100 },
    ]);
    expect(stats).toEqual({ invited: 3, rewarded: 2, creditsEarned: 200, capReached: false });
  });

  it('is empty before anyone is invited', () => {
    expect(buildReferralStats([])).toEqual({ invited: 0, rewarded: 0, creditsEarned: 0, capReached: false });
  });

  it('says when the cap is reached', () => {
    const rows = Array.from({ length: REFERRAL_REWARD_CAP }, () => ({ rewardedAt: '2026-10-05T00:00:00Z', rewardCredits: 100 }));
    expect(buildReferralStats(rows).capReached).toBe(true);
  });
});

describe('tagging with a team code', () => {
  const base = {
    codeWasValid: true,
    partner: { active: true },
    workspace: { createdAt: '2026-12-18T10:00:00Z' },
    alreadyTagged: false,
    joinedByInvite: false,
    now: new Date('2026-12-20T10:00:00Z'),
  };

  it('refuses a team using its own code', () => {
    expect(decideAttach({ ...base, selfReferral: true })).toEqual({ ok: false, reason: 'own_code' });
  });

  it('still refuses a team that is already tagged, before anything else', () => {
    expect(decideAttach({ ...base, alreadyTagged: true, selfReferral: true })).toEqual({
      ok: false,
      reason: 'already_tagged',
    });
  });

  it('applies the same new-team and invite rules as a partner code', () => {
    expect(decideAttach({ ...base, joinedByInvite: true })).toEqual({ ok: false, reason: 'joined_by_invite' });
    expect(decideAttach({ ...base, workspace: { createdAt: '2026-01-01T00:00:00Z' } })).toEqual({
      ok: false,
      reason: 'too_late',
    });
  });
});

describe('the credit history', () => {
  it('names a referral reward plainly', () => {
    const lines = buildHistory([
      {
        id: '1',
        kind: 'adjust',
        pool: 'topup',
        credits: 100,
        dedupe_key: 'referral:ws-1',
        metadata: { source: 'referral', note: 'A team you invited subscribed.' },
        created_at: '2026-10-05T00:00:00Z',
      },
    ]);
    expect(lines[0]).toMatchObject({ label: 'Reward for inviting a team', credits: 100, detail: '' });
  });

  it('still names an admin adjustment as before', () => {
    const lines = buildHistory([
      {
        id: '2',
        kind: 'adjust',
        pool: 'topup',
        credits: 50,
        dedupe_key: null,
        metadata: { source: 'admin', note: 'Goodwill' },
        created_at: '2026-10-05T00:00:00Z',
      },
    ]);
    expect(lines[0]).toMatchObject({ label: 'Credits added by Urganize', detail: 'Goodwill' });
  });
});

// ---------------------------------------------------------------- structure

const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('the reward path', () => {
  const server = stripComments(read('lib/referrals-server.ts'));
  const reward = server.slice(server.indexOf('export async function rewardReferrerOnFirstPayment'));

  it('needs both switches before it reads anything', () => {
    expect(reward.indexOf('isReferralsEnabled()')).toBeGreaterThan(-1);
    expect(reward.indexOf('isReferralCreditsEnabled()')).toBeGreaterThan(-1);
    expect(reward.indexOf('isReferralCreditsEnabled()')).toBeLessThan(reward.indexOf('.from('));
  });

  it('writes the credit before it marks the reward paid', () => {
    const grant = reward.indexOf('adjustCredits(');
    const mark = reward.indexOf("rewarded_at: new Date()");
    expect(grant).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(grant);
  });

  it('keys the credit on the invited team', () => {
    expect(reward).toContain('dedupeKey: rewardDedupeKey(referredId)');
  });

  it('is called from the payment webhook after the first charge and from Mark paid, nowhere else', () => {
    const callers = walk(join(ROOT, 'app'))
      .concat(walk(join(ROOT, 'lib')))
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes('rewardReferrerOnFirstPayment('))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'))
      .sort();
    expect(callers).toEqual(['app/api/admin/teams/route.ts', 'app/api/webhooks/paystack/route.ts', 'lib/referrals-server.ts']);

    const webhook = stripComments(read('app/api/webhooks/paystack/route.ts'));
    const record = webhook.indexOf("source: 'initial'");
    const rewardCall = webhook.indexOf('rewardReferrerOnFirstPayment(');
    expect(rewardCall).toBeGreaterThan(record);
    // Never on a renewal or a plan-change top-up: only a first payment pays.
    expect(webhook.match(/rewardReferrerOnFirstPayment\(/g)).toHaveLength(1);
  });

  it('is the only place that grants referral credits', () => {
    const offenders = walk(join(ROOT, 'app'))
      .concat(walk(join(ROOT, 'lib')))
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes("source: 'referral'"))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'));
    expect(offenders).toEqual(['lib/referrals-server.ts']);
  });

  it('keeps a plain admin adjustment labelled as the admin\'s', () => {
    const credits = stripComments(read('lib/credits/credits-server.ts'));
    expect(credits).toContain("source: input.source ?? 'admin'");
  });
});

describe('the invite link route', () => {
  const route = stripComments(read('app/api/referrals/mine/route.ts'));

  it('checks both switches before auth', () => {
    const get = route.slice(route.indexOf('export async function GET'));
    expect(get.indexOf('isReferralsEnabled()')).toBeLessThan(get.indexOf('getAuthenticatedUser('));
    expect(get.indexOf('isReferralCreditsEnabled()')).toBeLessThan(get.indexOf('getAuthenticatedUser('));
  });

  it('finds the team from the signed-in user and never from the request', () => {
    expect(route).toContain(".eq('owner_id', auth.user.id)");
    expect(route).not.toMatch(/searchParams|workspaceId\s*=\s*.*request/);
  });
});

describe('who may touch the invite tables', () => {
  it('only the referrals module reads or writes them, bar the scoreboard, which only reads', () => {
    const readers: Record<string, string[]> = {
      referral_codes: ['lib/referrals-server.ts'],
      // The scoreboard counts referred signups from this table. Read only: the
      // next test pins that it never writes.
      user_referrals: ['lib/referrals-server.ts', 'lib/scoreboard-server.ts'],
    };
    for (const [table, expected] of Object.entries(readers)) {
      const offenders = walk(join(ROOT, 'app'))
        .concat(walk(join(ROOT, 'lib')))
        .filter((file) => stripComments(readFileSync(file, 'utf8')).includes(`'${table}'`))
        .map((file) => relative(ROOT, file).replace(/\\/g, '/'))
        .sort();
      expect(offenders, table).toEqual(expected);
    }
  });

  it('keeps the scoreboard to reading them', () => {
    const board = stripComments(read('lib/scoreboard-server.ts'));
    expect(board).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it('stops a partner taking a code a team already holds', () => {
    const server = stripComments(read('lib/referrals-server.ts'));
    const create = server.slice(server.indexOf("case 'create_partner'"), server.indexOf("case 'set_partner_active'"));
    expect(create).toContain("from('referral_codes')");
    expect(create.indexOf("from('referral_codes')")).toBeLessThan(create.indexOf("from('referral_partners').insert"));
  });
});

describe('taking a reward back after a refund', () => {
  const rewarded = { rewardedAt: '2026-10-01T10:00:00Z', reversedAt: null, rewardCredits: 100 };
  const base = {
    referral: rewarded,
    refundedReference: 'ref_first',
    firstChargeReference: 'ref_first',
    chargeAmountKobo: 500_000,
    refundAmountKobo: 500_000,
    referrerCredits: 400,
  };

  it('takes the whole reward back on a full refund of the first payment', () => {
    expect(decideClawback(base)).toEqual({ clawback: true, take: 100, shortfall: 0 });
  });

  it('does nothing when the team was never rewarded or was not invited', () => {
    expect(decideClawback({ ...base, referral: null })).toEqual({ clawback: false, reason: 'not_rewarded' });
    expect(decideClawback({ ...base, referral: { ...rewarded, rewardedAt: null } })).toEqual({
      clawback: false,
      reason: 'not_rewarded',
    });
  });

  it('does nothing twice', () => {
    expect(decideClawback({ ...base, referral: { ...rewarded, reversedAt: '2026-10-02T00:00:00Z' } })).toEqual({
      clawback: false,
      reason: 'already_reversed',
    });
  });

  it('ignores a refund of a later payment, because the reward was for the first', () => {
    expect(decideClawback({ ...base, refundedReference: 'ref_renewal' })).toEqual({
      clawback: false,
      reason: 'not_the_first_charge',
    });
    expect(decideClawback({ ...base, firstChargeReference: null })).toEqual({
      clawback: false,
      reason: 'not_the_first_charge',
    });
  });

  it('ignores a partial refund', () => {
    expect(decideClawback({ ...base, refundAmountKobo: 499_999 })).toEqual({ clawback: false, reason: 'partial_refund' });
    expect(decideClawback({ ...base, chargeAmountKobo: 0, refundAmountKobo: 0 })).toEqual({
      clawback: false,
      reason: 'partial_refund',
    });
  });

  it('takes only what the inviter still has, and never pushes the balance below zero', () => {
    expect(decideClawback({ ...base, referrerCredits: 40 })).toEqual({ clawback: true, take: 40, shortfall: 60 });
    expect(decideClawback({ ...base, referrerCredits: 0 })).toEqual({ clawback: true, take: 0, shortfall: 100 });
    expect(decideClawback({ ...base, referrerCredits: -25 })).toEqual({ clawback: true, take: 0, shortfall: 100 });
  });

  it('takes nothing when the balance cannot be read', () => {
    expect(decideClawback({ ...base, referrerCredits: null })).toEqual({
      clawback: false,
      reason: 'balance_unreadable',
    });
  });

  it('has its own ledger key, apart from the reward key', () => {
    expect(clawbackDedupeKey('team_a')).toBe('referral-clawback:team_a');
    expect(clawbackDedupeKey('team_a')).not.toBe(rewardDedupeKey('team_a'));
  });

  it('stops counting a reversed reward, as earned and against the cap', () => {
    const rows = [
      { rewardedAt: '2026-10-01T00:00:00Z', rewardCredits: 100, reversedAt: null },
      { rewardedAt: '2026-10-02T00:00:00Z', rewardCredits: 100, reversedAt: '2026-10-03T00:00:00Z' },
    ];
    expect(buildReferralStats(rows)).toEqual({ invited: 2, rewarded: 1, creditsEarned: 100, capReached: false });
    const full = Array.from({ length: REFERRAL_REWARD_CAP }, (_, i) => ({
      rewardedAt: '2026-10-01T00:00:00Z',
      rewardCredits: 100,
      reversedAt: i === 0 ? '2026-10-03T00:00:00Z' : null,
    }));
    expect(buildReferralStats(full).capReached).toBe(false);
  });

  it('shows a taken-back reward in the history under its own label', () => {
    const entries = buildHistory([
      {
        id: 'x',
        kind: 'adjust',
        pool: 'topup',
        credits: -100,
        dedupe_key: 'referral-clawback:ws-1',
        metadata: { source: 'referral' },
        created_at: '2026-10-03T10:00:00Z',
      },
    ]);
    expect(entries[0].label).toBe('Invite reward taken back');
  });
});
