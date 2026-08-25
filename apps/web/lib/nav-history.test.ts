import { describe, expect, it } from 'vitest';
import { resolveWorkspaceBackTarget } from './nav-history';

// The workspace back arrow's destination. Worth pinning hard because none of it
// can be exercised without an authenticated browser session, and because the
// arrow was a silent no-op for long enough that a user reported it as dead.

const RELEASE = '9c08ce0a-d9c4-4fe6-a98b-6f28475ec89f';
const OTHER_RELEASE = '11111111-2222-3333-4444-555555555555';

describe('resolveWorkspaceBackTarget', () => {
  it('returns null when nothing was recorded', () => {
    expect(resolveWorkspaceBackTarget({ previous: null, scopedReleaseId: RELEASE })).toBeNull();
    expect(resolveWorkspaceBackTarget({ previous: '', scopedReleaseId: RELEASE })).toBeNull();
  });

  // THE PING-PONG GUARD. nav-history holds one slot, so right after closing a
  // scene the previous location is that scene's own URL. Pushing it would
  // re-open what the user just closed and trap them between two URLs.
  it('refuses a previous location that still scopes the same release', () => {
    for (const previous of [
      `/dashboard?release=${RELEASE}`,
      `/dashboard?release=${RELEASE}&scene=coverart`,
      `/dashboard?scene=song&release=${RELEASE}`,
      `/dashboard?release=${RELEASE}&scene=calendar&month=2026-10`,
    ]) {
      expect(resolveWorkspaceBackTarget({ previous, scopedReleaseId: RELEASE })).toBeNull();
    }
  });

  it('allows a DIFFERENT release, which is a real place to go back to', () => {
    const previous = `/dashboard?release=${OTHER_RELEASE}`;
    expect(resolveWorkspaceBackTarget({ previous, scopedReleaseId: RELEASE })).toBe(previous);
  });

  it('allows another page, query string and all', () => {
    for (const previous of [
      '/dashboard',
      '/dashboard/notes',
      `/dashboard/notes?release=${RELEASE}`.replace('release', 'filter'),
      '/dashboard/urgans',
      '/settings?tab=team',
    ]) {
      expect(resolveWorkspaceBackTarget({ previous, scopedReleaseId: RELEASE })).toBe(previous);
    }
  });

  it('refuses every flow page, because each one bounces or traps', () => {
    for (const previous of [
      '/auth',
      '/auth/callback',
      '/onboarding',
      '/onboarding?setup=1',
      '/locked',
      '/locked?intent=reactivate',
      '/start-trial',
      '/redeem',
      '/invite/accept?token=abc',
      '/join/CODE',
      '/payment/callback',
    ]) {
      expect(resolveWorkspaceBackTarget({ previous, scopedReleaseId: RELEASE })).toBeNull();
    }
  });

  it('does not treat a lookalike path as a flow page', () => {
    // '/joined' and '/authors' start with a flow prefix as a STRING but are not
    // that route, so prefix matching has to be segment-aware.
    for (const previous of ['/joined', '/authors']) {
      expect(resolveWorkspaceBackTarget({ previous, scopedReleaseId: RELEASE })).toBe(previous);
    }
  });

  it('refuses anything that is not a same-origin relative path', () => {
    for (const previous of [
      'https://evil.example/dashboard',
      '//evil.example/dashboard',
      'dashboard',
      'javascript:alert(1)',
    ]) {
      expect(resolveWorkspaceBackTarget({ previous, scopedReleaseId: RELEASE })).toBeNull();
    }
  });

  it('with no release scoped, only the flow and origin rules apply', () => {
    // Nothing can be "the same release" here, so a scoped URL is a fine target.
    const previous = `/dashboard?release=${RELEASE}`;
    expect(resolveWorkspaceBackTarget({ previous, scopedReleaseId: null })).toBe(previous);
    expect(resolveWorkspaceBackTarget({ previous: '/locked', scopedReleaseId: null })).toBeNull();
  });
});
