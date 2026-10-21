import { describe, expect, it } from 'vitest';
import { decideAndroidBack } from '@urganize/native-bridge';

const base = 'https://app.urganize.app';

describe('decideAndroidBack with history', () => {
  it('a page below a tab goes back one level when history exists', () => {
    for (const path of [
      '/dashboard?release=abc',
      '/dashboard?release=abc&scene=brief',
      '/dashboard/artists/42',
      '/dashboard/relationships/9',
      '/dashboard/directory',
      '/dashboard/credits',
      '/onboarding',
    ]) {
      expect(decideAndroidBack(base + path, true)).toBe('go-back');
    }
  });
  it('with no history it still goes Home, as before', () => {
    expect(decideAndroidBack(`${base}/dashboard/artists/42`, false)).toBe('go-home');
    expect(decideAndroidBack(`${base}/dashboard/artists/42`)).toBe('go-home');
  });
  it('tab roots and the paywall flow keep going Home, so Back never reveals the app behind the wall', () => {
    for (const path of ['/dashboard/urgans', '/dashboard/artists', '/locked', '/locked/urgans', '/start-trial', '/payment/callback', '/auth']) {
      expect(decideAndroidBack(base + path, true)).toBe('go-home');
    }
  });
  it('Home exits and the settings pop-up closes first, whatever history says', () => {
    expect(decideAndroidBack(`${base}/dashboard/home`, true)).toBe('exit');
    expect(decideAndroidBack(`${base}/dashboard/artists/1?settings=menu`, true)).toBe('go-back');
  });
});
