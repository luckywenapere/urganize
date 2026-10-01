import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { shouldLockAfterBackground, type AppLockStatus } from '@urganize/native-bridge';

import { authenticate, getLockStatus, setLock } from './lock';

/**
 * Drives the lock screen. The page never sees any of this: it can only ask
 * whether the lock is available and turn it on or off (the 'lock.*' bridge
 * requests).
 *
 * - On a cold start with the lock on, the app opens locked and asks the phone.
 * - Whenever the app leaves the foreground it is covered at once, so its
 *   contents are not shown in the phone's app switcher.
 * - On return it only asks again if the person was away longer than the grace
 *   period (shouldLockAfterBackground); a quick glance at a notification does
 *   not.
 */
export function useAppLock() {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);

  const enabledRef = useRef(false);
  const leftAtRef = useRef<number | null>(null);
  const askingRef = useRef(false);

  const unlock = useCallback(async () => {
    // The phone's own prompt takes the app out of the foreground for a moment;
    // this stops that from starting a second prompt on top of the first.
    if (askingRef.current) return;
    askingRef.current = true;
    try {
      if (await authenticate('Unlock Urganize')) {
        setLocked(false);
        setCovered(false);
      }
    } finally {
      askingRef.current = false;
    }
  }, []);

  const apply = useCallback((status: AppLockStatus) => {
    enabledRef.current = status.enabled;
    setEnabled(status.enabled);
    if (!status.enabled) {
      setLocked(false);
      setCovered(false);
    }
  }, []);

  // Cold start.
  useEffect(() => {
    let cancelled = false;
    void getLockStatus().then((status) => {
      if (cancelled) return;
      apply(status);
      if (status.enabled) {
        setLocked(true);
        void unlock();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apply, unlock]);

  // Leaving and returning.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (!enabledRef.current) return;
      if (next !== 'active') {
        if (leftAtRef.current === null) leftAtRef.current = Date.now();
        setCovered(true);
        return;
      }
      const lockAgain = shouldLockAfterBackground({
        enabled: true,
        leftAtMs: leftAtRef.current,
        nowMs: Date.now(),
      });
      leftAtRef.current = null;
      if (lockAgain) {
        setLocked(true);
        void unlock();
      } else {
        setCovered(false);
      }
    });
    return () => subscription.remove();
  }, [unlock]);

  const status = useCallback(async (): Promise<AppLockStatus> => {
    const current = await getLockStatus();
    apply(current);
    return current;
  }, [apply]);

  const change = useCallback(
    async (nextEnabled: boolean): Promise<AppLockStatus> => {
      const current = await setLock(nextEnabled);
      apply(current);
      return current;
    },
    [apply]
  );

  return { enabled, showCover: enabled && (locked || covered), locked, unlock, status, change };
}
