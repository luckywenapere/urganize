import { describe, expect, it } from 'vitest';
import {
  MAX_LOGIN_LABEL_LENGTH,
  buildEmailShareUrl,
  buildLoginShareMessage,
  buildWhatsAppShareUrl,
  daysUntilExpiry,
  normalizeLoginLabel,
  resolveLoginState,
} from './team-logins';

describe('normalizeLoginLabel', () => {
  it('returns null for empty, blank and nullish input so the column stays NULL', () => {
    expect(normalizeLoginLabel('')).toBeNull();
    expect(normalizeLoginLabel('   ')).toBeNull();
    expect(normalizeLoginLabel(null)).toBeNull();
    expect(normalizeLoginLabel(undefined)).toBeNull();
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeLoginLabel('  Tolu   —   publicist ')).toBe('Tolu — publicist');
    expect(normalizeLoginLabel('line\nbreak')).toBe('line break');
  });

  it('clamps a pasted wall of text to the column bound', () => {
    const label = normalizeLoginLabel('x'.repeat(500));
    expect(label).toHaveLength(MAX_LOGIN_LABEL_LENGTH);
  });

  it('coerces non-strings rather than throwing', () => {
    expect(normalizeLoginLabel(42)).toBe('42');
  });
});

describe('resolveLoginState', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it('is active while unrevoked and unexpired', () => {
    expect(resolveLoginState({ expiresAt: future })).toBe('active');
    expect(resolveLoginState({})).toBe('active');
    expect(resolveLoginState({ expiresAt: null, revokedAt: null })).toBe('active');
  });

  it('is expired once the expiry has passed', () => {
    expect(resolveLoginState({ expiresAt: past })).toBe('expired');
  });

  // Revoked beats expired: a manager who revoked a link should be told they
  // did, not that it merely timed out.
  it('reports revoked even when the link is also past its expiry', () => {
    expect(resolveLoginState({ expiresAt: past, revokedAt: past })).toBe('revoked');
  });

  it('treats an unparseable expiry as active rather than silently killing a live link', () => {
    expect(resolveLoginState({ expiresAt: 'not-a-date' })).toBe('active');
  });
});

describe('daysUntilExpiry', () => {
  const now = Date.parse('2026-08-16T12:00:00.000Z');

  it('returns null when there is no expiry', () => {
    expect(daysUntilExpiry(null, now)).toBeNull();
    expect(daysUntilExpiry('not-a-date', now)).toBeNull();
  });

  it('counts whole days remaining', () => {
    expect(daysUntilExpiry('2026-08-23T12:00:00.000Z', now)).toBe(7);
    expect(daysUntilExpiry('2026-08-17T12:00:00.000Z', now)).toBe(1);
  });

  it('floors at zero rather than going negative', () => {
    expect(daysUntilExpiry('2026-08-01T12:00:00.000Z', now)).toBe(0);
  });
});

describe('buildLoginShareMessage', () => {
  const url = 'https://app.urganize.app/join/AbCdEfGhJkLm';

  it('carries the link and says the recipient picks their own password', () => {
    const message = buildLoginShareMessage({ url, workspaceName: 'Oyin Records' });
    expect(message).toContain(url);
    expect(message).toContain('Oyin Records');
    expect(message.toLowerCase()).toContain('your own password');
  });

  it('names the inviter and release when they are known', () => {
    const message = buildLoginShareMessage({
      url,
      workspaceName: 'Oyin Records',
      releaseTitle: 'Midnight EP',
      inviterName: 'Wenapere',
    });
    expect(message).toContain('Wenapere has added you to Oyin Records');
    expect(message).toContain('Midnight EP');
  });

  it('stays coherent with nothing but a URL', () => {
    const message = buildLoginShareMessage({ url });
    expect(message).toContain("You've been added to a team on Urganize.");
    expect(message).toContain(url);
    // No dangling "undefined"/"null" from missing optional context.
    expect(message).not.toMatch(/undefined|null/);
  });

  // Same string goes to WhatsApp and to email clients, which render markdown
  // differently (or not at all) — so it must contain none.
  it('contains no markdown emphasis', () => {
    const message = buildLoginShareMessage({
      url,
      workspaceName: 'Oyin Records',
      inviterName: 'Wenapere',
    });
    expect(message).not.toMatch(/[*_~`]/);
  });
});

describe('share URLs', () => {
  const message = 'Open this link:\nhttps://app.urganize.app/join/AbCdEfGhJkLm';

  it('builds a wa.me link with no phone number, so the manager picks the chat', () => {
    const url = buildWhatsAppShareUrl(message);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(message);
  });

  it('encodes the newline rather than emitting a raw one', () => {
    expect(buildWhatsAppShareUrl(message)).not.toContain('\n');
  });

  it('builds a mailto with a workspace-aware subject', () => {
    const url = buildEmailShareUrl(message, 'Oyin Records');
    expect(url.startsWith('mailto:?subject=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Your login for Oyin Records on Urganize');
  });

  it('falls back to a generic subject with no workspace name', () => {
    expect(decodeURIComponent(buildEmailShareUrl(message, null))).toContain(
      'subject=Your Urganize login'
    );
  });
});
