'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { isAndroidApp, isIOSApp, isStandaloneDisplay } from '@/lib/platform';
import { PING_INTERVAL_MS, PING_MIN_GAP_MS, type PresenceSurface } from '@/lib/presence';

/**
 * The "last seen" ping (2026-10-07). Mounted once by AppShell, renders nothing.
 * While the signed-in user has a tab VISIBLE it tells the server so every
 * PING_INTERVAL_MS, and once more when the tab comes back into view. That is
 * what lets /admin/metrics say who is online now and count people who opened
 * the app and only looked around, which no other number in the product sees.
 *
 * Best effort in every way: no retries, no queue, every failure swallowed. A
 * missed ping costs one dot on an internal chart, never anything a user sees.
 */
function currentSurface(): PresenceSurface {
  if (isIOSApp()) return 'ios_app';
  if (isAndroidApp()) return 'android_app';
  if (isStandaloneDisplay()) return 'installed';
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return 'phone_web';
  } catch {
    // Very old browsers without matchMedia: treat as a computer.
  }
  return 'desktop_web';
}

export function PresenceBeacon() {
  const userId = useAuthStore((state) => (state.isAuthenticated && state.user ? state.user.id : null));

  useEffect(() => {
    if (!userId) return;
    let lastPingAt = 0;
    let cancelled = false;

    const ping = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const now = Date.now();
      if (now - lastPingAt < PING_MIN_GAP_MS) return;
      lastPingAt = now;
      try {
        const { supabase } = await import('@/lib/supabase/client');
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || cancelled) return;
        await fetch('/api/presence', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ surface: currentSurface() }),
          keepalive: true,
        });
      } catch {
        // Best effort, see above.
      }
    };

    void ping();
    const timer = window.setInterval(() => void ping(), PING_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [userId]);

  return null;
}
