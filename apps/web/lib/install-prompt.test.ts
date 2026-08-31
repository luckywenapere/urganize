import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INSTALL_PROMPT_DELAY_MS,
  INSTALL_PROMPT_STATE_KEY,
  armInstallPrompt,
  decideInstallPrompt,
  isInstallPromptOwed,
  isInstallPromptState,
  markInstallPromptAccepted,
  markInstallPromptSettled,
  markInstallPromptShown,
  readInstallPromptAccepted,
  readInstallPromptState,
  resolveInstallVariant,
  subscribeInstallPromptSettled,
} from './install-prompt';

// vitest runs node here, so the two Storages are stubbed. Deliberately real
// objects rather than mocks: readInstallPromptState has to survive genuine
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

/** `ua` picks the device: 'node' is a desktop browser, 'iPhone' an iOS tab. */
function installStorages(
  overrides: { setItem?: () => never; ua?: string; standalone?: boolean } = {}
) {
  const session = makeStorage(overrides);
  const local = makeStorage(overrides);
  const ua = overrides.ua ?? 'node';
  vi.stubGlobal('window', {
    sessionStorage: session,
    localStorage: local,
    navigator: { userAgent: ua, platform: '', maxTouchPoints: 0 },
    matchMedia: () => ({ matches: overrides.standalone === true }),
    addEventListener: () => {},
  });
  return { session, local };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveInstallVariant', () => {
  const base = {
    native: false,
    standalone: false,
    ios: false,
    android: false,
    canPromptInstall: false,
  };

  it('teaches Add to Home Screen on an iOS browser tab', () => {
    expect(resolveInstallVariant({ ...base, ios: true })).toBe('ios');
  });

  it('points an Android browser tab at the real app', () => {
    expect(resolveInstallVariant({ ...base, android: true })).toBe('android');
  });

  it('offers the browser install on a desktop browser that has handed us one', () => {
    expect(resolveInstallVariant({ ...base, canPromptInstall: true })).toBe('desktop');
  });

  it('offers NOTHING on a desktop browser that has not — a button that cannot install is worse than no card', () => {
    // Desktop Safari and Firefox never fire beforeinstallprompt.
    expect(resolveInstallVariant(base)).toBeNull();
  });

  it('keeps Android on the real app even when the browser also offers a web install', () => {
    // Chrome on Android fires beforeinstallprompt too. Reaching the desktop
    // branch there would put a second-best web install in front of someone
    // who can have the APK.
    expect(resolveInstallVariant({ ...base, android: true, canPromptInstall: true })).toBe(
      'android'
    );
  });

  it('offers nothing once installed, whichever way it is already installed', () => {
    // Both must be answered BEFORE the UA sniffs: an installed iOS Home
    // Screen app is still an iOS user agent, and would otherwise be told to
    // install the thing it is already running inside.
    expect(resolveInstallVariant({ ...base, ios: true, standalone: true })).toBeNull();
    expect(resolveInstallVariant({ ...base, android: true, standalone: true })).toBeNull();
    expect(resolveInstallVariant({ ...base, ios: true, native: true })).toBeNull();
    expect(resolveInstallVariant({ ...base, android: true, native: true })).toBeNull();
    expect(
      resolveInstallVariant({ ...base, canPromptInstall: true, standalone: true })
    ).toBeNull();
  });
});

describe('decideInstallPrompt', () => {
  const now = 1_700_000_000_000;
  const base = { variant: 'ios' as const, accepted: false };

  it('arms on a first visit with nothing stored', () => {
    expect(decideInstallPrompt({ ...base, state: null, now })).toEqual({ action: 'arm' });
  });

  it('waits out the remaining minute, then fires', () => {
    expect(decideInstallPrompt({ ...base, state: { armedAt: now }, now })).toEqual({
      action: 'wait',
      remainingMs: INSTALL_PROMPT_DELAY_MS,
    });
    expect(
      decideInstallPrompt({ ...base, state: { armedAt: now - 20_000 }, now })
    ).toEqual({ action: 'wait', remainingMs: INSTALL_PROMPT_DELAY_MS - 20_000 });
    expect(
      decideInstallPrompt({ ...base, state: { armedAt: now - INSTALL_PROMPT_DELAY_MS }, now })
    ).toEqual({ action: 'fire' });
    expect(decideInstallPrompt({ ...base, state: { armedAt: now - 600_000 }, now })).toEqual({
      action: 'fire',
    });
  });

  it('is once per visit — shownAt outranks the clock', () => {
    // The card marks itself shown when it FIRES, so leaving app chrome and
    // coming back must not produce a second one.
    expect(
      decideInstallPrompt({
        ...base,
        state: { armedAt: now - 600_000, shownAt: now - 500_000 },
        now,
      })
    ).toEqual({ action: 'skip' });
  });

  it('skips a device with nothing to offer, however long it waits', () => {
    expect(
      decideInstallPrompt({ ...base, variant: null, state: { armedAt: now - 600_000 }, now })
    ).toEqual({ action: 'skip' });
  });

  it('skips a device that already took the install', () => {
    expect(
      decideInstallPrompt({ ...base, accepted: true, state: { armedAt: now - 600_000 }, now })
    ).toEqual({ action: 'skip' });
    // Accepted outranks even a fresh visit, which is what makes the accept
    // durable across sessions while a decline is not.
    expect(decideInstallPrompt({ ...base, accepted: true, state: null, now })).toEqual({
      action: 'skip',
    });
  });

  it('clamps a future armedAt to a full minute rather than trusting a bad clock', () => {
    // Clock skew or hand-edited storage must never produce an hour-long
    // ambush.
    expect(decideInstallPrompt({ ...base, state: { armedAt: now + 86_400_000 }, now })).toEqual({
      action: 'wait',
      remainingMs: INSTALL_PROMPT_DELAY_MS,
    });
  });
});

describe('isInstallPromptState', () => {
  it('accepts the two real shapes and rejects everything else', () => {
    expect(isInstallPromptState({ armedAt: 1 })).toBe(true);
    expect(isInstallPromptState({ armedAt: 1, shownAt: 2 })).toBe(true);
    expect(isInstallPromptState(null)).toBe(false);
    expect(isInstallPromptState({})).toBe(false);
    expect(isInstallPromptState({ armedAt: 'soon' })).toBe(false);
    expect(isInstallPromptState({ armedAt: Number.NaN })).toBe(false);
    expect(isInstallPromptState({ armedAt: 1, shownAt: 'later' })).toBe(false);
  });
});

describe('storage', () => {
  it('round-trips the countdown and the spent offer', () => {
    installStorages();
    expect(readInstallPromptState()).toBeNull();

    expect(armInstallPrompt(1000)).toEqual({ armedAt: 1000 });
    expect(readInstallPromptState()).toEqual({ armedAt: 1000 });

    markInstallPromptShown(2000);
    expect(readInstallPromptState()).toEqual({ armedAt: 1000, shownAt: 2000 });
  });

  it('returns null from armInstallPrompt when the write fails, so no caller runs a private countdown', () => {
    installStorages({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(armInstallPrompt(1000)).toBeNull();
  });

  it('treats junk in storage as no history at all', () => {
    const { session } = installStorages();
    session._map.set(INSTALL_PROMPT_STATE_KEY, 'not json');
    expect(readInstallPromptState()).toBeNull();
    session._map.set(INSTALL_PROMPT_STATE_KEY, '{"armedAt":"soon"}');
    expect(readInstallPromptState()).toBeNull();
    session._map.set(INSTALL_PROMPT_STATE_KEY, '[]');
    expect(readInstallPromptState()).toBeNull();
  });

  it('keeps the accept durable and separate from the visit record', () => {
    installStorages();
    expect(readInstallPromptAccepted()).toBe(false);
    markInstallPromptAccepted();
    expect(readInstallPromptAccepted()).toBe(true);
    // The accept lives in localStorage; the visit record in sessionStorage.
    expect(readInstallPromptState()).toBeNull();
  });

  it('does not throw when the accept cannot be written', () => {
    installStorages({
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => markInstallPromptAccepted()).not.toThrow();
    expect(readInstallPromptAccepted()).toBe(false);
  });
});

describe('markInstallPromptSettled', () => {
  it('spends the visit and hands the outcome to subscribers', () => {
    installStorages();
    const seen: string[] = [];
    const unsubscribe = subscribeInstallPromptSettled((outcome) => seen.push(outcome));

    markInstallPromptSettled('declined', 5000);
    expect(seen).toEqual(['declined']);
    expect(readInstallPromptState()?.shownAt).toBe(5000);
    // A decline is NOT durable — that is what makes the next visit ask again.
    expect(readInstallPromptAccepted()).toBe(false);
    unsubscribe();
  });

  it('makes an accept durable, so the next visit does not ask again', () => {
    installStorages();
    markInstallPromptSettled('accepted', 5000);
    expect(readInstallPromptAccepted()).toBe(true);
  });

  it('still notifies when the writes throw — losing the record costs one repeat offer, losing the signal costs the notification ask entirely', () => {
    installStorages({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    const seen: string[] = [];
    const unsubscribe = subscribeInstallPromptSettled((outcome) => seen.push(outcome));

    expect(() => markInstallPromptSettled('declined', 5000)).not.toThrow();
    expect(seen).toEqual(['declined']);
    unsubscribe();
  });
});

describe('isInstallPromptOwed', () => {
  it('is true on a device that has an install coming this visit', () => {
    installStorages({ ua: 'iPhone' });
    expect(isInstallPromptOwed()).toBe(true);
  });

  it('is false on a device with no install to offer, so the notification ask is never held', () => {
    // A desktop browser that never fired beforeinstallprompt.
    installStorages();
    expect(isInstallPromptOwed()).toBe(false);
  });

  it('is false once the device has accepted', () => {
    installStorages({ ua: 'iPhone' });
    markInstallPromptAccepted();
    expect(isInstallPromptOwed()).toBe(false);
  });

  it('is false once this visit has already been offered the card', () => {
    installStorages({ ua: 'iPhone' });
    markInstallPromptShown(1000);
    expect(isInstallPromptOwed()).toBe(false);
  });

  it('is false when the session store cannot be written — a broken store must never mute the notification ask forever', () => {
    // The fail-closed pairing this module leads with: no card AND no hold.
    // Note the store still READS fine here, which is exactly Safari's private
    // mode — so this can only be caught by probing with a real write.
    installStorages({
      ua: 'iPhone',
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(isInstallPromptOwed()).toBe(false);
  });

  it('is false on an installed Home Screen app even though it is still an iOS user agent', () => {
    installStorages({ ua: 'iPhone', standalone: true });
    expect(isInstallPromptOwed()).toBe(false);
  });
});

describe('the browser install offer', () => {
  type Listener = (event: unknown) => void;

  /** A fresh module per case: the deferred event and the "capture started"
   * latch are module-level by design (the listener must be attachable once,
   * from an eagerly-loaded module), so they cannot be reset any other way. */
  async function freshModule(overrides: { ua?: string } = {}) {
    vi.resetModules();
    const listeners = new Map<string, Listener>();
    const session = makeStorage();
    const local = makeStorage();
    vi.stubGlobal('window', {
      sessionStorage: session,
      localStorage: local,
      navigator: { userAgent: overrides.ua ?? 'node', platform: '', maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    });
    const mod = await import('./install-prompt');
    return { mod, listeners };
  }

  function makeEvent(outcome: 'accepted' | 'dismissed') {
    let prevented = false;
    return {
      event: {
        preventDefault: () => {
          prevented = true;
        },
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome }),
      },
      wasPrevented: () => prevented,
    };
  }

  it('captures the browser offer, suppresses the browser mini-infobar, and tells subscribers', async () => {
    const { mod, listeners } = await freshModule();
    mod.startInstallPromptCapture();
    expect(mod.canPromptDeferredInstall()).toBe(false);

    let notified = 0;
    const unsubscribe = mod.subscribeInstallAvailability(() => {
      notified += 1;
    });

    const { event, wasPrevented } = makeEvent('accepted');
    listeners.get('beforeinstallprompt')?.(event);

    expect(wasPrevented()).toBe(true);
    expect(mod.canPromptDeferredInstall()).toBe(true);
    expect(notified).toBe(1);
    // Only now does a desktop browser have an install worth offering.
    expect(mod.resolveDeviceInstallVariant()).toBe('desktop');
    unsubscribe();
  });

  it('attaches its listeners once, however many times it is called', async () => {
    const { mod, listeners } = await freshModule();
    mod.startInstallPromptCapture();
    const first = listeners.get('beforeinstallprompt');
    mod.startInstallPromptCapture();
    mod.startInstallPromptCapture();
    expect(listeners.get('beforeinstallprompt')).toBe(first);
  });

  it('runs the install and reports what the user chose', async () => {
    const { mod, listeners } = await freshModule();
    mod.startInstallPromptCapture();
    listeners.get('beforeinstallprompt')?.(makeEvent('accepted').event);
    await expect(mod.promptDeferredInstall()).resolves.toBe('accepted');
  });

  it('reports a dismissal as a dismissal', async () => {
    const { mod, listeners } = await freshModule();
    mod.startInstallPromptCapture();
    listeners.get('beforeinstallprompt')?.(makeEvent('dismissed').event);
    await expect(mod.promptDeferredInstall()).resolves.toBe('dismissed');
  });

  it('is one shot — a second call reports unavailable rather than throwing at the user', async () => {
    // Chrome refuses a second prompt() on the same event, so the reference is
    // dropped before it is used.
    const { mod, listeners } = await freshModule();
    mod.startInstallPromptCapture();
    listeners.get('beforeinstallprompt')?.(makeEvent('accepted').event);
    await mod.promptDeferredInstall();
    expect(mod.canPromptDeferredInstall()).toBe(false);
    await expect(mod.promptDeferredInstall()).resolves.toBe('unavailable');
  });

  it('reports unavailable when nothing was ever captured', async () => {
    const { mod } = await freshModule();
    mod.startInstallPromptCapture();
    await expect(mod.promptDeferredInstall()).resolves.toBe('unavailable');
  });

  it('reports unavailable rather than throwing when the browser flow itself fails', async () => {
    const { mod, listeners } = await freshModule();
    mod.startInstallPromptCapture();
    listeners.get('beforeinstallprompt')?.({
      preventDefault: () => {},
      prompt: () => Promise.reject(new Error('InvalidStateError')),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    await expect(mod.promptDeferredInstall()).resolves.toBe('unavailable');
  });

  it('treats an observed install as a durable accept, so a browser tab stops asking too', async () => {
    // The one install we can actually see happen. isStandaloneDisplay() stays
    // false in the tab the install was started from, so without this the card
    // would come back next visit on the very device that just installed.
    const { mod, listeners } = await freshModule();
    mod.startInstallPromptCapture();
    listeners.get('beforeinstallprompt')?.(makeEvent('accepted').event);
    expect(mod.readInstallPromptAccepted()).toBe(false);

    listeners.get('appinstalled')?.({});

    expect(mod.readInstallPromptAccepted()).toBe(true);
    expect(mod.canPromptDeferredInstall()).toBe(false);
    expect(mod.isInstallPromptOwed()).toBe(false);
  });
});
