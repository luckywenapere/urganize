import { afterEach, describe, expect, it, vi } from 'vitest';

import { URGANS_PASS_HEADER, URGANS_PASS_TTL_MS, mintUrgansPass, verifyUrgansPass } from './urgans-pass';
import { mintPassForUser, requestHasUrgansPass } from './urgans-pass-server';

const SECRET = 'a-server-only-secret';
const NOW = 1_800_000_000_000;

describe('the pass', () => {
  it('is good for the user it was minted for, until it expires', () => {
    const pass = mintUrgansPass(SECRET, 'user-1', NOW);
    expect(pass).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(verifyUrgansPass(SECRET, pass, 'user-1', NOW)).toBe(true);
    expect(verifyUrgansPass(SECRET, pass, 'user-1', NOW + URGANS_PASS_TTL_MS - 1)).toBe(true);
  });

  it('stops working the moment it expires', () => {
    const pass = mintUrgansPass(SECRET, 'user-1', NOW);
    expect(verifyUrgansPass(SECRET, pass, 'user-1', NOW + URGANS_PASS_TTL_MS)).toBe(false);
    expect(verifyUrgansPass(SECRET, pass, 'user-1', NOW + URGANS_PASS_TTL_MS + 1)).toBe(false);
  });

  it('names one user: it does nothing for anybody else', () => {
    const pass = mintUrgansPass(SECRET, 'user-1', NOW);
    expect(verifyUrgansPass(SECRET, pass, 'user-2', NOW)).toBe(false);
    expect(verifyUrgansPass(SECRET, pass, 'USER-1', NOW)).toBe(false);
    expect(verifyUrgansPass(SECRET, pass, '', NOW)).toBe(false);
  });

  it('cannot be made without the secret, and a different secret does not verify', () => {
    const pass = mintUrgansPass(SECRET, 'user-1', NOW);
    expect(verifyUrgansPass('another-secret', pass, 'user-1', NOW)).toBe(false);
    expect(mintUrgansPass(null, 'user-1', NOW)).toBe('');
    expect(mintUrgansPass('', 'user-1', NOW)).toBe('');
    expect(mintUrgansPass(SECRET, '', NOW)).toBe('');
    expect(verifyUrgansPass(null, pass, 'user-1', NOW)).toBe(false);
  });

  it('cannot be stretched: a later expiry on the same signature is refused', () => {
    const pass = mintUrgansPass(SECRET, 'user-1', NOW);
    const [expiry, signature] = pass.split('.');
    expect(verifyUrgansPass(SECRET, `${Number(expiry) + 60_000}.${signature}`, 'user-1', NOW)).toBe(false);
  });

  it('refuses an expiry further out than a pass is ever minted for, even with a signature that would match', () => {
    // A pass the server never issues: signed for a day, presented as valid.
    const far = NOW + 24 * 60 * 60 * 1000;
    const forged = mintUrgansPass(SECRET, 'user-1', far - URGANS_PASS_TTL_MS);
    expect(verifyUrgansPass(SECRET, forged, 'user-1', NOW)).toBe(false);
  });

  it('refuses a tampered, truncated or malformed value without throwing', () => {
    const pass = mintUrgansPass(SECRET, 'user-1', NOW);
    const [expiry, signature] = pass.split('.');
    const bad = [
      '',
      '.',
      'abc',
      `${expiry}.`,
      `.${signature}`,
      `${expiry}.${signature.slice(0, -2)}`,
      `${expiry}.${signature}00`,
      `${expiry}.${'0'.repeat(64)}`,
      `not-a-number.${signature}`,
      `${expiry}.${signature.toUpperCase()}`,
      `1.5.${signature}`,
      `${expiry}x.${signature}`,
      null,
      undefined,
    ];
    for (const value of bad) expect(verifyUrgansPass(SECRET, value as string, 'user-1', NOW), String(value)).toBe(false);
  });

  it('never mints the same value for two users', () => {
    expect(mintUrgansPass(SECRET, 'user-1', NOW)).not.toBe(mintUrgansPass(SECRET, 'user-2', NOW));
  });
});

describe('the server half', () => {
  afterEach(() => vi.unstubAllEnvs());

  const request = (value: string | null) => ({ headers: { get: (name: string) => (name === URGANS_PASS_HEADER ? value : null) } });

  it('mints and recognises a pass using a secret derived from the service key', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    const pass = mintPassForUser('user-1');
    expect(pass).not.toBe('');
    expect(requestHasUrgansPass(request(pass), 'user-1')).toBe(true);
    expect(requestHasUrgansPass(request(pass), 'user-2')).toBe(false);
    expect(requestHasUrgansPass(request(null), 'user-1')).toBe(false);
  });

  it('does not use the service key itself as the signing secret', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    const pass = mintPassForUser('user-1');
    // A pass signed straight with the raw key must not verify.
    const raw = mintUrgansPass('service-role-key', 'user-1');
    expect(requestHasUrgansPass(request(raw), 'user-1')).toBe(false);
    expect(requestHasUrgansPass(request(pass), 'user-1')).toBe(true);
  });

  it('has no pass to give, and accepts none, when the server has no key', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(mintPassForUser('user-1')).toBe('');
    expect(requestHasUrgansPass(request('123.abc'), 'user-1')).toBe(false);
  });

  it('does not honour a pass signed under a different key', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key-one');
    const pass = mintPassForUser('user-1');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key-two');
    expect(requestHasUrgansPass(request(pass), 'user-1')).toBe(false);
  });
});
