'use client';

// Day Zero (#1393): finishes a license claim that was waiting for an account.
//
// A signed-out buyer leaves /dayzero/callback with their license held in an
// httpOnly cookie, then signs in (/auth) or makes an account (/onboarding, or
// Google). Whichever way they come back, this sees the readable
// `urg_dz_pending` marker once they are signed in and asks the server to attach
// the license. Then it shows the "Solo Plus is yours" screen, except mid-onboarding,
// where it waits until onboarding is over. Renders nothing; does nothing when
// no license is waiting (one cookie read per route change).

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { invalidateTeamAccessClientCache } from '@/lib/team-billing-client';
import { DAYZERO_PENDING_COOKIE, type DayzeroClaimState } from '@/lib/dayzero-shared';

const ACTIVATED_FLAG = 'urg_dz_activated';

export function clearDayzeroActivatedFlag() {
  try {
    window.sessionStorage.removeItem(ACTIVATED_FLAG);
  } catch {
    // Blocked storage: nothing to clear.
  }
}

const readFlag = () => {
  try {
    return window.sessionStorage.getItem(ACTIVATED_FLAG) === '1';
  } catch {
    return false;
  }
};

const setFlag = () => {
  try {
    window.sessionStorage.setItem(ACTIVATED_FLAG, '1');
  } catch {
    // Blocked storage: they simply do not see the success screen.
  }
};

const hasPendingCookie = () =>
  document.cookie.split(';').some((part) => part.trim() === `${DAYZERO_PENDING_COOKIE}=1`);

/** Places where jumping to the success screen would interrupt the person. */
const isMidFlow = (path: string) => path.startsWith('/onboarding') || path.startsWith('/auth');

export function DayzeroClaimer() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const claimedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    // The activation page does its own claiming.
    if (pathname.startsWith('/dayzero')) return;

    if (readFlag() && !isMidFlow(pathname)) {
      clearDayzeroActivatedFlag();
      router.push('/dayzero/callback?activated=1');
      return;
    }

    if (!hasPendingCookie() || claimedFor.current === userId) return;
    claimedFor.current = userId;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      let state: DayzeroClaimState = 'error';
      try {
        const response = await fetch('/api/dayzero/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: '{}',
        });
        const body = (await response.json().catch(() => ({}))) as { state?: DayzeroClaimState };
        state = body.state ?? 'error';
      } catch {
        return;
      }

      const here = window.location.pathname;
      if (state === 'attached') {
        invalidateTeamAccessClientCache();
        await checkAuth({ force: true }).catch(() => undefined);
        if (isMidFlow(here)) setFlag();
        else router.push('/dayzero/callback?activated=1');
      } else if (state === 'other_account') {
        if (isMidFlow(here)) claimedFor.current = null; // Say so once they are out.
        else router.push('/dayzero/callback?error=other_account');
      } else if (state === 'error') {
        // Let the next route change try again.
        claimedFor.current = null;
      }
    })();
  }, [checkAuth, isAuthenticated, pathname, router, userId]);

  return null;
}
