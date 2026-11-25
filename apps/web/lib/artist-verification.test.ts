import { describe, expect, it } from 'vitest';
import {
  ARTIST_VERIFICATION_STATUSES,
  applyVerificationAction,
  bannerFor,
  blocksNothing,
  isHiddenStatus,
  nextStatusAfterSubmit,
  parseSender,
  parseVerificationStatus,
  senderFromRole,
  statusLabel,
} from './artist-verification';

describe('parseVerificationStatus', () => {
  it('reads every real status as itself', () => {
    for (const status of ARTIST_VERIFICATION_STATUSES) expect(parseVerificationStatus(status)).toBe(status);
  });

  it('treats anything else as not verified, never as verified', () => {
    for (const bad of [null, undefined, '', 'approved', 'VERIFIED', 42, {}]) {
      expect(parseVerificationStatus(bad)).toBe('unverified');
    }
  });
});

describe('statusLabel and banners', () => {
  it('has a plain label for each status', () => {
    expect(statusLabel('unverified')).toBe('Not verified');
    expect(statusLabel('verified')).toBe('Verified artist');
    expect(statusLabel('taken_down')).toBe('Taken down');
  });

  it('shows no banner once verified', () => {
    expect(bannerFor('verified', 'Dorian', null)).toBeNull();
  });

  it('asks an unverified artist to verify, with a button', () => {
    const banner = bannerFor('unverified', 'Dorian', null);
    expect(banner?.button).toBe('Verify');
    expect(banner?.body).toContain('Dorian');
  });

  it('shows the admin reason on a needs-a-fix banner', () => {
    const banner = bannerFor('needs_fix', 'Dorian', 'The name is cut off.');
    expect(banner?.body).toBe('The name is cut off.');
    expect(banner?.button).toBe('Send a new screenshot');
  });

  it('falls back to a plain line when there is no reason', () => {
    expect(bannerFor('needs_fix', 'Dorian', '  ')?.body).toMatch(/new one/);
  });

  it('gives a checking banner no button, there is nothing to do', () => {
    expect(bannerFor('checking', 'Dorian', null)?.button).toBeNull();
  });

  it('never uses an em dash or a gendered pronoun in the copy', () => {
    for (const status of ARTIST_VERIFICATION_STATUSES) {
      const banner = bannerFor(status, 'Dorian', null);
      if (!banner) continue;
      const text = `${banner.title} ${banner.body} ${banner.button ?? ''}`;
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/\b(he|him|his|she|her)\b/i);
    }
  });
});

describe('nextStatusAfterSubmit', () => {
  it('moves a not-verified or needs-a-fix artist to checking', () => {
    expect(nextStatusAfterSubmit('unverified')).toBe('checking');
    expect(nextStatusAfterSubmit('needs_fix')).toBe('checking');
  });

  it('keeps a taken-down artist taken down until an admin decides', () => {
    expect(nextStatusAfterSubmit('taken_down')).toBe('taken_down');
  });

  it('refuses a second screenshot while one is being checked, and when verified', () => {
    expect(nextStatusAfterSubmit('checking')).toBeNull();
    expect(nextStatusAfterSubmit('verified')).toBeNull();
  });
});

describe('applyVerificationAction', () => {
  it('approves a screenshot that is being checked, or a taken-down artist who sent one', () => {
    expect(applyVerificationAction('checking', 'approve', null)).toEqual({ ok: true, status: 'verified', email: 'approved' });
    expect(applyVerificationAction('taken_down', 'approve', null)).toEqual({ ok: true, status: 'verified', email: 'approved' });
  });

  it('will not approve an artist with nothing waiting', () => {
    expect(applyVerificationAction('unverified', 'approve', null).ok).toBe(false);
    expect(applyVerificationAction('verified', 'approve', null).ok).toBe(false);
  });

  it('asks again with a reason, and refuses without one', () => {
    expect(applyVerificationAction('checking', 'ask_again', 'Name is cut off.')).toEqual({
      ok: true,
      status: 'needs_fix',
      email: 'needs_fix',
    });
    expect(applyVerificationAction('checking', 'ask_again', '   ').ok).toBe(false);
  });

  it('removes a badge only from a verified artist', () => {
    expect(applyVerificationAction('verified', 'remove_badge', null)).toEqual({
      ok: true,
      status: 'unverified',
      email: 'badge_removed',
    });
    expect(applyVerificationAction('unverified', 'remove_badge', null).ok).toBe(false);
  });

  it('takes down only with a reason, and not twice', () => {
    expect(applyVerificationAction('unverified', 'take_down', 'Could not verify.')).toEqual({
      ok: true,
      status: 'taken_down',
      email: 'taken_down',
    });
    expect(applyVerificationAction('verified', 'take_down', '').ok).toBe(false);
    expect(applyVerificationAction('taken_down', 'take_down', 'Again').ok).toBe(false);
  });

  it('brings back a taken-down artist as not verified', () => {
    expect(applyVerificationAction('taken_down', 'bring_back', null)).toEqual({
      ok: true,
      status: 'unverified',
      email: 'brought_back',
    });
    expect(applyVerificationAction('verified', 'bring_back', null).ok).toBe(false);
  });
});

describe('what hides, and what never does', () => {
  it('hides an artist only when taken down', () => {
    for (const status of ARTIST_VERIFICATION_STATUSES) {
      expect(isHiddenStatus(status)).toBe(status === 'taken_down');
    }
  });

  it('blocks nothing for any status except taken down', () => {
    expect(blocksNothing('unverified')).toBe(true);
    expect(blocksNothing('checking')).toBe(true);
    expect(blocksNothing('needs_fix')).toBe(true);
    expect(blocksNothing('verified')).toBe(true);
    expect(blocksNothing('taken_down')).toBe(false);
  });
});

describe('who sent it', () => {
  it('counts a person signed in as an artist as the artist, everyone else as a manager', () => {
    expect(senderFromRole('artist')).toBe('artist');
    expect(senderFromRole('manager')).toBe('manager');
    expect(senderFromRole(null)).toBe('manager');
  });

  it('only accepts the two senders', () => {
    expect(parseSender('artist')).toBe('artist');
    expect(parseSender('team')).toBe('manager');
  });
});
