import { describe, expect, it } from 'vitest';
import {
  ACCESS_INVITE_TTL_DAYS,
  HELD_COPY,
  INVITE_ONLY_COPY,
  accessInviteExpiry,
  buildInviteMessage,
  buildStartPath,
  buildWhatsAppShareUrl,
  decideAppAccess,
  emailBindingIsOpen,
  looksLikeAccessCode,
  normalizeAccessEmail,
  resolveAccessInviteState,
} from './access-gate';

const none = { approvedAt: null, allowlisted: false, hasForeignMembership: false, hasEmailInvite: false };

describe('decideAppAccess', () => {
  it('holds an account that matches no rule', () => {
    expect(decideAppAccess({ ...none, signupOpen: false })).toEqual({ allowed: false });
  });

  it('lets a brand-new account in while sign-up is open', () => {
    expect(decideAppAccess({ ...none, signupOpen: true })).toEqual({ allowed: true, stamp: 'open_signup' });
    expect(decideAppAccess(none)).toEqual({ allowed: true, stamp: 'open_signup' });
  });
  it('lets in an approved account without restamping it', () => {
    expect(decideAppAccess({ ...none, approvedAt: '2026-10-15T00:00:00Z' })).toEqual({ allowed: true, stamp: null });
  });
  it('lets in and stamps the allowlist, a team invite and a founder email invite', () => {
    expect(decideAppAccess({ ...none, allowlisted: true })).toEqual({ allowed: true, stamp: 'allowlist' });
    expect(decideAppAccess({ ...none, hasForeignMembership: true })).toEqual({ allowed: true, stamp: 'team_invite' });
    expect(decideAppAccess({ ...none, hasEmailInvite: true })).toEqual({ allowed: true, stamp: 'invite_email' });
  });
  it('prefers a team invite over spending a founder invite', () => {
    expect(decideAppAccess({ ...none, hasForeignMembership: true, hasEmailInvite: true })).toEqual({
      allowed: true,
      stamp: 'team_invite',
    });
  });
});

describe('invite state', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it('used beats revoked beats expired', () => {
    expect(resolveAccessInviteState({ used_at: 'x', revoked_at: 'y', expires_at: '2020-01-01T00:00:00Z' }, now)).toBe('used');
    expect(resolveAccessInviteState({ revoked_at: 'y', expires_at: '2020-01-01T00:00:00Z' }, now)).toBe('revoked');
    expect(resolveAccessInviteState({ expires_at: '2026-10-15T11:59:59Z' }, now)).toBe('expired');
    expect(resolveAccessInviteState({ expires_at: '2026-10-29T12:00:00Z' }, now)).toBe('open');
    expect(resolveAccessInviteState({ expires_at: null }, now)).toBe('open');
  });
  it('the email binding ignores the clock', () => {
    expect(emailBindingIsOpen({ expires_at: '2020-01-01T00:00:00Z' })).toBe(true);
    expect(emailBindingIsOpen({ used_at: 'x' })).toBe(false);
    expect(emailBindingIsOpen({ revoked_at: 'x' })).toBe(false);
  });
  it('a link lasts 14 days', () => {
    expect(ACCESS_INVITE_TTL_DAYS).toBe(14);
    expect(accessInviteExpiry(undefined, now)).toBe('2026-10-29T12:00:00.000Z');
  });
});

describe('inputs', () => {
  it('normalizes emails and rejects junk', () => {
    expect(normalizeAccessEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(normalizeAccessEmail('nope')).toBe('');
    expect(normalizeAccessEmail(42)).toBe('');
  });
  it('shape-checks codes before any read', () => {
    expect(looksLikeAccessCode('AbCdEfGh23456789')).toBe(true);
    expect(looksLikeAccessCode('short')).toBe(false);
    expect(looksLikeAccessCode('has space here!!')).toBe(false);
    expect(looksLikeAccessCode(undefined)).toBe(false);
  });
});

describe('sharing', () => {
  it('builds the start path and a first-name message', () => {
    expect(buildStartPath('AbCdEfGh23456789')).toBe('/start/AbCdEfGh23456789');
    expect(buildInviteMessage('https://app.urganize.app/start/x', 'Ada Lovelace')).toBe(
      "Hi Ada, you're in. Start using Urganize here: https://app.urganize.app/start/x"
    );
    expect(buildInviteMessage('L', '')).toBe("Hi, you're in. Start using Urganize here: L");
  });
  it('prefills WhatsApp, opening the chat when a number is known', () => {
    expect(buildWhatsAppShareUrl('hi there')).toBe('https://wa.me/?text=hi%20there');
    expect(buildWhatsAppShareUrl('hi', '+234 803 123 4567')).toBe('https://wa.me/2348031234567?text=hi');
    expect(buildWhatsAppShareUrl('hi', '08031234567')).toBe('https://wa.me/2348031234567?text=hi');
  });
});

describe('copy', () => {
  it('says exactly what the founder asked for', () => {
    expect(INVITE_ONLY_COPY.title).toBe('Urganize is invite-only for now.');
    expect(INVITE_ONLY_COPY.body).toBe("Join the waitlist and we'll reach out.");
    expect(INVITE_ONLY_COPY.cta).toBe('Join the waitlist');
    expect(`${INVITE_ONLY_COPY.signInLead} ${INVITE_ONLY_COPY.signInLink}`).toBe('Have an invite? Sign in.');
    expect(`${HELD_COPY.title} ${HELD_COPY.body}`).toBe("You're on the list. We'll let you in soon.");
    expect(HELD_COPY.cta).toBe('Sign out');
  });
});
