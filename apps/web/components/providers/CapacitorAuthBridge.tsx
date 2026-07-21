'use client';

import { useEffect } from 'react';
import { isNativePlatform } from '@/lib/platform';

// Custom URL scheme registered in the native shell (apps/mobile) — see
// docs/mobile/auth-setup.md. Must match NATIVE_OAUTH_SCHEME in auth-store.ts.
const NATIVE_OAUTH_SCHEME = 'com.urganize.app://';

/**
 * Native-only. Google's OAuth consent screen runs in the system browser (see
 * lib/auth-store.ts:loginWithGoogle) because Google blocks it inside embedded
 * webviews; Supabase redirects back to this app via the custom URL scheme
 * above instead of an https URL. Capacitor's `App` plugin surfaces that
 * return as an `appUrlOpen` event — this bridges it back into the existing,
 * already-tested `/auth/callback` page by rewriting the scheme URL into a
 * same-origin path and navigating the webview there, rather than
 * re-implementing the PKCE/hash-token exchange a second time.
 */
export function CapacitorAuthBridge() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const [{ App }, { Browser }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/browser'),
      ]);
      if (cancelled) return;

      const listener = await App.addListener('appUrlOpen', ({ url }) => {
        if (!url.startsWith(NATIVE_OAUTH_SCHEME)) return;
        void Browser.close().catch(() => {});
        const rest = url.slice(NATIVE_OAUTH_SCHEME.length);
        window.location.href = `/${rest}`;
      });
      removeListener = () => void listener.remove();
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  return null;
}
