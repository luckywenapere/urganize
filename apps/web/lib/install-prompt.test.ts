import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INSTALL_PROMPT_MIN_VIEWS,
  INSTALL_PROMPT_VIEWS_KEY,
  decideInstallPrompt,
  installViewKey,
  isInstallPromptOwed,
  markInstallPromptSettled,
  nextInstallViewList,
  readInstallPromptSettled,
  readInstallPromptViews,
  recordInstallPromptView,
  resolveInstallVariant,
  subscribeInstallPromptSettled,
  subscribeInstallPromptViews,
} from './install-prompt';

// vitest runs node here, so the two Storages are stubbed. Deliberately real
// objects rather than mocks: readInstallPromptViews has to survive genuine
// round trips through JSON, and the throw cases below need setItem to throw
// the way a private-mode browser actually does.
function makeStorage(overrides: { setItem?: () => never } = {}) {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem:
      overrides.setItem ??
      ((key: string, value: string) => {
        map.set(key, value);
      }),
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    _map: map,
  };
}

function installStorages(overrides: { setItem?: () => never } = {}) {
  const session = makeStorage(overrides);
  const local = makeStorage(overrides);
  vi.stubGlobal('window', {
    sessionStorage: session,
    localStorage: local,
    navigator: { userAgent: 'node', platform: '', maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false }),
  });
  return { session, local };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('installViewKey', () => {
  it('counts the app surfaces', () => {
    expect(installViewKey('/dashboard')).toBe('/dashboard');
    expect(installViewKey('/dashboard/urgans')).toBe('/dashboard/urgans');
    expect(installViewKey('/dashboard/notes')).toBe('/dashboard/notes');
    expect(installViewKey('/settings')).toBe('/settings');
    expect(installViewKey('/admin/waitlist')).toBe('/admin/waitlist');
  });

  it('ignores flow pages, public pages and the curator side — three bounced flow steps are not browsing', () => {
    for (const url of [
      '/auth',
      '/auth/callback',
      '/onboarding',
      '/start-trial',
      '/locked',
      '/curator',
      '/credits/abc',
      '/epk/abc',
      '/capture/abc',
      '/',
    ]) {
      expect(installViewKey(url), url).toBeNull();
    }
  });

  it('treats a scene and a settings tab as their own surfaces', () => {
    expect(installViewKey('/dashboard?release=r1&scene=calendar')).toBe('/dashboard#calendar');
    expect(installViewKey('/dashboard?release=r1&scene=metadata')).toBe('/dashboard#metadata');
    expect(installViewKey('/settings?tab=team')).toBe('/settings#team');
  });

  it('does NOT treat a different release as a different surface', () => {
    // Flicking through your own catalog is one tab showing other contents.
    expect(installViewKey('/dashboard?release=r1')).toBe('/dashboard');
    expect(installViewKey('/dashboard?release=r2')).toBe('/dashboard');
  });

  it('rejects anything that is not a same-app relative path', () => {
    expect(installViewKey('//evil.example/dashboard')).toBeNull();
    expect(installViewKey('https://evil.example/dashboard')).toBeNull();
    expect(installViewKey('')).toBeNull();
    expect(installViewKey(undefined as unknown as string)).toBeNull();
  });

  it('falls back to the path when the query string is unparseable', () => {
    expect(installViewKey('/dashboard?%')).toBe('/dashboard');
  });
});

describe('nextInstallViewList', () => {
  it('appends a new surface and ignores a repeat', () => {
    expect(nextInstallViewList([], '/dashboard')).toEqual(['/dashboard']);
    expect(nextInstallViewList(['/dashboard'], '/settings')).toEqual(['/dashboard', '/settings']);
    expect(nextInstallViewList(['/dashboard'], '/dashboard')).toEqual(['/dashboard']);
  });

  it('caps the list so a long session cannot grow storage without bound', () => {
    let views: string[] = [];
    for (let i = 0; i < 40; i += 1) views = nextInstallViewList(views, `/dashboard/${i}`);
    expect(views.length).toBeLessThanOrEqual(12);
    expect(views[views.length - 1]).toBe('/dashboard/39');
  });
});

describe('resolveInstallVariant', () => {
  const base = { native: false, standalone: false, ios: false, android: false };

  it('offers the Home Screen steps on an iOS browser tab', () => {
    expect(resolveInstallVariant({ ...base, ios: true })).toBe('ios');
  });

  it('offers the app on an Android browser tab', () => {
    expect(resolveInstallVariant({ ...base, android: true })).toBe('android');
  });

  it('offers nothing on a desktop browser', () => {
    expect(resolveInstallVariant(base)).toBeNull();
  });

  it('offers nothing once installed, whichever way it is already installed', () => {
    // Both must be answered BEFORE the UA sniffs: an installed iOS Home
    // Screen app is still an iOS user agent, and would otherwise be told to
    // install the thing it is already running inside.
    expect(resolveInstallVariant({ ...base, ios: true, standalone: true })).toBeNull();
    expect(resolveInstallVariant({ ...base, android: true, standalone: true })).toBeNull();
    expect(resolveInstallVariant({ ...base, ios: true, native: true })).toBeNull();
    expect(resolveInstallVariant({ ...base, android: true, native: true })).toBeNull();
  });
});

describe('decideInstallPrompt', () => {
  it('waits below the threshold and fires at it', () => {
    expect(decideInstallPrompt({ viewCount: 1, variant: 'ios', settled: false })).toBe('wait');
    expect(
      decideInstallPrompt({
        viewCount: INSTALL_PROMPT_MIN_VIEWS - 1,
        variant: 'ios',
        settled: false,
      })
    ).toBe('wait');
    expect(
      decideInstallPrompt({ viewCount: INSTALL_PROMPT_MIN_VIEWS, variant: 'ios', settled: false })
    ).toBe('fire');
    expect(decideInstallPrompt({ viewCount: 99, variant: 'android', settled: false })).toBe('fire');
  });

  it('skips a device with no install to offer, however much it browses', () => {
    expect(decideInstallPrompt({ viewCount: 99, variant: null, settled: false })).toBe('skip');
  });

  it('skips a device that already answered', () => {
    expect(decideInstallPrompt({ viewCount: 99, variant: 'ios', settled: true })).toBe('skip');
  });
});

describe('recordInstallPromptView', () => {
  it('stores distinct surfaces and notifies subscribers only when the count moves', () => {
    installStorages();
    const seen: string[][] = [];
    const unsubscribe = subscribeInstallPromptViews((views) => seen.push(views));

    recordInstallPromptView('/dashboard');
    recordInstallPromptView('/dashboard'); // repeat — no notification
    recordInstallPromptView('/auth'); // not a tab — no notification
    recordInstallPromptView('/settings?tab=team');

    expect(readInstallPromptViews()).toEqual(['/dashboard', '/settings#team']);
    expect(seen).toHaveLength(2);
    unsubscribe();

    recordInstallPromptView('/dashboard/notes');
    expect(seen).toHaveLength(2); // unsubscribed
    expect(readInstallPromptViews()).toHaveLength(3);
  });

  it('does not notify when the write itself fails — a subscriber must never act on a count that was not stored', () => {
    installStorages({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    const seen: string[][] = [];
    const unsubscribe = subscribeInstallPromptViews((views) => seen.push(views));
    recordInstallPromptView('/dashboard');
    expect(seen).toEqual([]);
    expect(readInstallPromptViews()).toEqual([]);
    unsubscribe();
  });

  it('treats junk in storage as no history at all', () => {
    const { session } = installStorages();
    session._map.set(INSTALL_PROMPT_VIEWS_KEY, '{"not":"an array"}');
    expect(readInstallPromptViews()).toEqual([]);
    session._map.set(INSTALL_PROMPT_VIEWS_KEY, 'not json');
    expect(readInstallPromptViews()).toEqual([]);
    session._map.set(INSTALL_PROMPT_VIEWS_KEY, '["/dashboard", 7, null]');
    expect(readInstallPromptViews()).toEqual(['/dashboard']);
  });
});

describe('markInstallPromptSettled', () => {
  it('records the answer and hands the outcome to subscribers', () => {
    installStorages();
    const seen: string[] = [];
    const unsubscribe = subscribeInstallPromptSettled((outcome) => seen.push(outcome));

    markInstallPromptSettled('declined');
    expect(seen).toEqual(['declined']);
    expect(readInstallPromptSettled()).toBe('declined');
    unsubscribe();
  });

  it('keeps accepted and declined distinct — the notification ask only follows a decline', () => {
    installStorages();
    markInstallPromptSettled('accepted');
    expect(readInstallPromptSettled()).toBe('accepted');
  });

  it('still notifies when the write throws — losing the record costs one repeat offer, losing the signal costs the notification ask entirely', () => {
    // writePersistedState does not guard setItem, so this is a real throw
    // (full quota, Safari private mode), not a hypothetical one.
    installStorages({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    const seen: string[] = [];
    const unsubscribe = subscribeInstallPromptSettled((outcome) => seen.push(outcome));

    expect(() => markInstallPromptSettled('declined')).not.toThrow();
    expect(seen).toEqual(['declined']);
    expect(readInstallPromptSettled()).toBeNull();
    unsubscribe();
  });
});

describe('isInstallPromptOwed', () => {
  it('is false on a device with no install to offer (desktop), so the notification ask is never held', () => {
    installStorages();
    expect(isInstallPromptOwed()).toBe(false);
  });

  it('is false once the device has answered', () => {
    installStorages();
    vi.stubGlobal('window', {
      ...(globalThis as unknown as { window: Window }).window,
      navigator: { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 },
    });
    markInstallPromptSettled('declined');
    expect(isInstallPromptOwed()).toBe(false);
  });

  it('is false when storage is unusable — a broken store must never mute the notification ask forever', () => {
    // The fail-closed pairing this module leads with: no card AND no hold.
    installStorages({
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(isInstallPromptOwed()).toBe(false);
  });
});
