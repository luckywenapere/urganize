import { describe, expect, it } from 'vitest';
import { isAllowlistedEmail, PAYWALL_ALLOWLIST_EMAILS } from './paywall-allowlist';

// Ported from the former standalone runtime check (paywall-allowlist.test.mts)
// so the same matrix runs under `pnpm test`: every listed email bypasses,
// casing/whitespace normalize, and nothing else gets through.

describe('isAllowlistedEmail', () => {
  it.each([
    'luckydio10@gmail.com',
    'luckywenapere@gmail.com',
    'aesthetique.toine@gmail.com',
    'adamukabiru772@gmail.com',
    'itsderah@gmail.com',
    'ewaoluwaadenaiye@gmail.com',
    'officialworldpope@gmail.com',
    'uzoaruqueen98@gmail.com',
  ])('allows listed address %s', (email) => {
    expect(isAllowlistedEmail(email)).toBe(true);
  });

  it('normalizes casing and whitespace', () => {
    expect(isAllowlistedEmail('LUCKYDIO10@GMAIL.COM')).toBe(true);
    expect(isAllowlistedEmail('  itsderah@gmail.com  ')).toBe(true);
    expect(isAllowlistedEmail('Itsderah@Gmail.com')).toBe(true);
  });

  it('blocks everything not on the list', () => {
    expect(isAllowlistedEmail('random.person@gmail.com')).toBe(false);
    expect(isAllowlistedEmail('lucky.wenapere@pentagonsecurities.net')).toBe(false);
  });

  it('is safe on empty / null / undefined / non-string input', () => {
    expect(isAllowlistedEmail('')).toBe(false);
    expect(isAllowlistedEmail(null)).toBe(false);
    expect(isAllowlistedEmail(undefined)).toBe(false);
    expect(isAllowlistedEmail(42 as unknown as string)).toBe(false);
  });

  it('exposes the normalized, deduplicated list for UI/debug surfaces', () => {
    expect(PAYWALL_ALLOWLIST_EMAILS.length).toBeGreaterThan(0);
    for (const email of PAYWALL_ALLOWLIST_EMAILS) {
      expect(email).toBe(email.trim().toLowerCase());
      expect(isAllowlistedEmail(email)).toBe(true);
    }
  });
});
