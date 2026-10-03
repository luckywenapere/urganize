import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  PERSONAL_CODE_LENGTH,
  REFERRAL_REWARD_CAP,
  REFERRAL_REWARD_CREDITS,
  buildReferralStats,
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
  it('only the referrals module reads or writes them', () => {
    for (const table of ['referral_codes', 'user_referrals']) {
      const offenders = walk(join(ROOT, 'app'))
        .concat(walk(join(ROOT, 'lib')))
        .filter((file) => stripComments(readFileSync(file, 'utf8')).includes(`'${table}'`))
        .map((file) => relative(ROOT, file).replace(/\\/g, '/'));
      expect(offenders, table).toEqual(['lib/referrals-server.ts']);
    }
  });

  it('stops a partner taking a code a team already holds', () => {
    const server = stripComments(read('lib/referrals-server.ts'));
    const create = server.slice(server.indexOf("case 'create_partner'"), server.indexOf("case 'set_partner_active'"));
    expect(create).toContain("from('referral_codes')");
    expect(create.indexOf("from('referral_codes')")).toBeLessThan(create.indexOf("from('referral_partners').insert"));
  });
});
