import { describe, it, expect, vi, afterEach } from 'vitest';
import { isEmailConfigured, isAllowedSender, SENDER_ALLOWLIST } from './config';

// readEmailConfig reads process.env per call (no module-scope caching), so
// stubEnv is enough — no resetModules needed.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isEmailConfigured', () => {
  it('needs both the key and the sender to count as configured', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', '');
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv('RESEND_API_KEY', 're_key');
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv('EMAIL_FROM', 'Urganize <team@send.urganize.app>');
    expect(isEmailConfigured()).toBe(true);
  });

  it('treats a whitespace-only value as unset', () => {
    vi.stubEnv('RESEND_API_KEY', '   ');
    vi.stubEnv('EMAIL_FROM', 'Urganize <team@send.urganize.app>');
    expect(isEmailConfigured()).toBe(false);
  });
});

describe('isAllowedSender', () => {
  it('accepts the allowlisted addresses, case- and space-insensitively', () => {
    for (const address of SENDER_ALLOWLIST) {
      expect(isAllowedSender(address)).toBe(true);
      expect(isAllowedSender(`  ${address.toUpperCase()}  `)).toBe(true);
    }
  });

  it('rejects anything not on the list', () => {
    expect(isAllowedSender('attacker@evil.com')).toBe(false);
    expect(isAllowedSender('')).toBe(false);
  });
});
