import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFERRAL_WINDOW_DAYS, isReferralFresh, parseReferralParam } from './referral-intent';

// Structural guards for referral commission. Commission is money owed to a
// third party, so the rules that keep it correct are held by tests that read the
// real source rather than by a comment. Comments are stripped before matching so
// prose cannot satisfy a check.

const ROOT = join(__dirname, '..');

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('the payment webhook feeds the ledger', () => {
  const source = stripComments(read('app/api/webhooks/paystack/route.ts'));

  it('records the first charge, a renewal and a plan-change top-up, each once', () => {
    for (const kind of ['initial', 'renewal', 'plan_change']) {
      const matches = source.match(new RegExp(`source: '${kind}'`, 'g')) ?? [];
      expect(matches, `source '${kind}'`).toHaveLength(1);
    }
    expect(source.match(/recordSubscriptionCharge\(/g)).toHaveLength(3);
  });

  it('diverts the card check away before anything is recorded, because that charge is refunded and is not a purchase', () => {
    const cardCheck = source.indexOf('handleTrialCardCharge(admin, payment');
    // Inside handleChargeSuccess, where the diversion happens: the first-charge
    // record is the call that follows it.
    const firstRecord = source.indexOf("source: 'initial'");
    expect(cardCheck).toBeGreaterThan(-1);
    expect(firstRecord).toBeGreaterThan(-1);
    expect(cardCheck).toBeLessThan(firstRecord);
  });

  it('every handler that skips the generic success flip marks the payment paid itself', () => {
    // Codex on #843: a diverted handler that forgets this leaves the payer on
    // "still finalizing" at /payment/callback even though they were credited.
    for (const handler of ['handlePlanChangeCharge', 'handleTransferCheckoutCharge', 'handleTrialCardCharge']) {
      const start = source.indexOf(`async function ${handler}(`);
      expect(start, handler).toBeGreaterThan(-1);
      const body = source.slice(start).split(/\r?\n}\r?\n/)[0];
      expect(body, handler).toMatch(/from\('payments'\)\s*\.update\(\{ status: 'success' \}\)/);
    }
  });

  it('records the first charge only after the profile stamp has been checked, so a redelivery can finish the job', () => {
    const stamp = source.indexOf('applied.profileWriteFailed');
    const record = source.indexOf("source: 'initial'");
    expect(stamp).toBeGreaterThan(-1);
    expect(stamp).toBeLessThan(record);
  });
});

describe('who may write the commission tables', () => {
  it('only the referrals module and the webhook touch subscription_charges', () => {
    const offenders = walk(join(ROOT, 'app'))
      .concat(walk(join(ROOT, 'lib')))
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes("'subscription_charges'"))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'));
    expect(offenders).toEqual(['lib/referrals-server.ts']);
  });

  it('only the referrals module touches team_referrals, referral_payouts and referral_partners, bar the scoreboard reading one', () => {
    const readers: Record<string, string[]> = {
      // The scoreboard counts partner-referred signups from this table. Read only.
      team_referrals: ['lib/referrals-server.ts', 'lib/scoreboard-server.ts'],
      referral_payouts: ['lib/referrals-server.ts'],
      referral_partners: ['lib/referrals-server.ts'],
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
});

describe('the switch', () => {
  it('records every payment whether or not referrals are on (the margin view and the TRM fee need them all, 2026-10-22)', () => {
    const source = stripComments(read('lib/referrals-server.ts'));
    const start = source.indexOf('export async function recordSubscriptionCharge');
    const body = source.slice(start).split(/\r?\n}\r?\n/)[0];
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/!\s*isReferralsEnabled\(\)/);
  });

  it('writes a payment made while referrals are off already excluded, so a team tagged earlier earns nothing on it', () => {
    // Codex on #844: the admin statement counts every row for a tagged team, so
    // the flag has to be stamped on the row itself.
    const source = stripComments(read('lib/referrals-server.ts'));
    const start = source.indexOf('export async function recordSubscriptionCharge');
    const body = source.slice(start).split(/\r?\n}\r?\n/)[0];
    expect(body).toContain('chargeExclusionWhenRecorded(isReferralsEnabled(), chargedAt)');
    // In the columns every database has, so the missing-column retry keeps it.
    const base = body.slice(body.indexOf('const base = {'), body.indexOf('const extra = {'));
    expect(base).toContain('chargeExclusionWhenRecorded(');
  });

  it('checks it before auth on the attach route, so a switched-off app answers 404 to everyone', () => {
    const source = stripComments(read('app/api/referrals/attach/route.ts'));
    const post = source.slice(source.indexOf('export async function POST'));
    expect(post.indexOf('isReferralsEnabled()')).toBeGreaterThan(-1);
    expect(post.indexOf('isReferralsEnabled()')).toBeLessThan(post.indexOf('getAuthenticatedUser('));
  });

  it('does NOT put the admin route behind it, so money already owed stays payable', () => {
    const source = stripComments(read('app/api/admin/referrals/route.ts'));
    expect(source).not.toContain('isReferralsEnabled');
    expect(source).toContain('verifyAdmin(request)');
  });

  it('tags the caller\'s own team and never one named in the request', () => {
    const source = stripComments(read('app/api/referrals/attach/route.ts'));
    expect(source).toContain('ownerUserId: auth.user.id');
    expect(source).not.toMatch(/workspaceId|workspace_id/);
  });
});

describe('the remembered code', () => {
  it('reads the code off a link', () => {
    expect(parseReferralParam('?ref=soundwave')).toBe('SOUNDWAVE');
    expect(parseReferralParam('?email=a@b.com&ref=sw-1')).toBe('SW-1');
    expect(parseReferralParam('?ref=')).toBeNull();
    expect(parseReferralParam('?ref=a b')).toBeNull();
    expect(parseReferralParam('')).toBeNull();
  });

  it('forgets it after thirty days, and never trusts a future or broken timestamp', () => {
    const now = Date.parse('2026-12-20T00:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    expect(isReferralFresh(now - 1000, now)).toBe(true);
    expect(isReferralFresh(now - REFERRAL_WINDOW_DAYS * day, now)).toBe(true);
    expect(isReferralFresh(now - REFERRAL_WINDOW_DAYS * day - 1, now)).toBe(false);
    expect(isReferralFresh(now + 1000, now)).toBe(false);
    expect(isReferralFresh('yesterday', now)).toBe(false);
    expect(isReferralFresh(Number.NaN, now)).toBe(false);
  });
});

describe('refunds', () => {
  it('hands a processed refund to the referral handler before the pitch handling reads it', () => {
    const source = stripComments(read('app/api/webhooks/paystack/route.ts'));
    const body = source.slice(source.indexOf('async function handlePitchRefund'));
    const end = body.indexOf('\n}\n');
    const fn = body.slice(0, end);
    expect(fn).toContain("event === 'refund.processed'");
    expect(fn.indexOf('handleRefundForReferrals(')).toBeGreaterThan(-1);
    expect(fn.indexOf('handleRefundForReferrals(')).toBeLessThan(fn.indexOf('handlePitchRefundEvent('));
  });

  it('is NOT behind the switches, so a reward already paid can still be taken back if they are switched off', () => {
    const source = stripComments(read('lib/referrals-server.ts'));
    const start = source.indexOf('export async function handleRefundForReferrals');
    const end = source.indexOf('// ------------------------------------------------------------------ overview');
    const section = source.slice(start, end);
    expect(section).not.toContain('isReferralsEnabled');
    expect(section).not.toContain('isReferralCreditsEnabled');
  });

  it('leaves a reversed reward out of the cap, and out of the stats read', () => {
    const source = stripComments(read('lib/referrals-server.ts'));
    const reward = source.slice(source.indexOf('export async function rewardReferrerOnFirstPayment'));
    expect(reward.slice(0, reward.indexOf('decideReward('))).toContain(".is('reversed_at', null)");
    expect(source).toContain("'rewarded_at,reward_credits,reversed_at'");
  });
});
