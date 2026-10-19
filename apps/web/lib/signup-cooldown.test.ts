import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecentSignupCooldown } from './signup-cooldown';
import { isSafeNextPath } from './email-confirmation';

describe('sign-up cooldown', () => {
  it('reads the per-address cooldown as a link sent seconds ago', () => {
    expect(isRecentSignupCooldown({ message: 'For security purposes, you can only request this after 4 seconds.' })).toBe(true);
    expect(isRecentSignupCooldown({ message: 'For security purposes, you can only request this after 1 second.' })).toBe(true);
  });

  it('leaves the hourly email cap and other errors alone', () => {
    expect(isRecentSignupCooldown({ message: 'email rate limit exceeded' })).toBe(false);
    expect(isRecentSignupCooldown({ message: 'User already registered' })).toBe(false);
    expect(isRecentSignupCooldown(null)).toBe(false);
    expect(isRecentSignupCooldown('x')).toBe(false);
  });
});

describe('/auth keeps next on this site', () => {
  it('rejects off-site next values', () => {
    for (const bad of ['https://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)', '/\t/example.com']) {
      expect(isSafeNextPath(bad)).toBe(false);
    }
    expect(isSafeNextPath('/dashboard/tasks')).toBe(true);
  });

  it('the sign-in page checks next before navigating to it', () => {
    const source = readFileSync(join(__dirname, '..', 'app', 'auth', 'AuthPageClient.tsx'), 'utf8');
    expect(source).toMatch(/isSafeNextPath\(requestedNext\)\s*\?\s*requestedNext\s*:\s*HOME_PATH/);
    expect(source).not.toMatch(/searchParams\?\.get\('next'\)\s*\|\|/);
  });
});
