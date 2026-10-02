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

  it('only the referrals module writes team_referrals and referral_payouts', () => {
    for (const table of ['team_referrals', 'referral_payouts', 'referral_partners']) {
      const offenders = walk(join(ROOT, 'app'))
        .concat(walk(join(ROOT, 'lib')))
        .filter((file) => stripComments(readFileSync(file, 'utf8')).includes(`'${table}'`))
        .map((file) => relative(ROOT, file).replace(/\\/g, '/'));
      expect(offenders, table).toEqual(['lib/referrals-server.ts']);
    }
  });
});

describe('the switch', () => {
  it('stops the ledger write before it reads anything', () => {
    const source = stripComments(read('lib/referrals-server.ts'));
    const body = source.slice(source.indexOf('export async function recordSubscriptionCharge'));
    expect(body.indexOf('isReferralsEnabled()')).toBeGreaterThan(-1);
    expect(body.indexOf('isReferralsEnabled()')).toBeLessThan(body.indexOf('.from('));
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
