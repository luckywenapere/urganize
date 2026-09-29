import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildUnsubscribeHeaders,
  buildUnsubscribeUrl,
  readUnsubscribeSecret,
  signUnsubscribeToken,
  unsubscribeScopeFor,
  verifyUnsubscribeToken,
} from './unsubscribe';

const SECRET = 'test-secret';

afterEach(() => vi.unstubAllEnvs());

describe('unsubscribe tokens', () => {
  it('round-trips the address (lowercased) and scope', () => {
    const token = signUnsubscribeToken(SECRET, ' Ada@Example.COM ', 'onboarding');
    expect(verifyUnsubscribeToken(SECRET, token)).toEqual({
      email: 'ada@example.com',
      scope: 'onboarding',
    });
  });

  it('rejects a token signed with another secret', () => {
    const token = signUnsubscribeToken('other', 'a@b.co', 'reminders');
    expect(verifyUnsubscribeToken(SECRET, token)).toBeNull();
  });

  it('rejects a tampered payload even with the original signature', () => {
    const token = signUnsubscribeToken(SECRET, 'a@b.co', 'reminders');
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'victim@b.co', s: 'reminders' })).toString('base64url');
    expect(verifyUnsubscribeToken(SECRET, `${forged}.${sig}`)).toBeNull();
  });

  it('rejects junk without throwing', () => {
    for (const bad of [null, undefined, '', 'x', 'a.b.c', '.'.repeat(5), 'x'.repeat(2000)]) {
      expect(verifyUnsubscribeToken(SECRET, bad)).toBeNull();
    }
  });

  it('rejects a signed payload whose scope is not an unsubscribable one', () => {
    const payload = Buffer.from(JSON.stringify({ e: 'a@b.co', s: 'transactional' })).toString('base64url');
    // Signed correctly, so only the scope check can refuse it.
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
    expect(verifyUnsubscribeToken(SECRET, `${payload}.${sig}`)).toBeNull();
  });
});

describe('links and headers', () => {
  it('builds a page link and one-click headers from the origin', () => {
    expect(buildUnsubscribeUrl('https://app.urganize.app/', 'a b')).toBe(
      'https://app.urganize.app/unsubscribe?t=a%20b'
    );
    expect(buildUnsubscribeHeaders('https://app.urganize.app', 'tok')).toEqual({
      'List-Unsubscribe': '<https://app.urganize.app/api/email/unsubscribe?t=tok>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('only optional categories have an unsubscribe scope', () => {
    expect(unsubscribeScopeFor('onboarding')).toBe('onboarding');
    expect(unsubscribeScopeFor('reminders')).toBe('reminders');
    expect(unsubscribeScopeFor('announcements')).toBe('announcements');
    expect(unsubscribeScopeFor('transactional')).toBeNull();
    expect(unsubscribeScopeFor('internal')).toBeNull();
  });
});

describe('readUnsubscribeSecret', () => {
  it('prefers the explicit secret, else derives from the Resend key, else null', () => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'explicit');
    vi.stubEnv('RESEND_API_KEY', 're_abc');
    expect(readUnsubscribeSecret()).toBe('explicit');

    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', '');
    const derived = readUnsubscribeSecret();
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).not.toContain('re_abc');

    vi.stubEnv('RESEND_API_KEY', '');
    expect(readUnsubscribeSecret()).toBeNull();
  });
});
