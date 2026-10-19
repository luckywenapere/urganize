'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

/**
 * While Check your inbox is showing, notice the moment the account is
 * confirmed in another tab of this browser (supabase-js syncs the session
 * across tabs) and hand over, once. Focus and visibility re-check as a
 * backstop. Cross-device pick-up is a follow-up (URG-386 notes).
 */
export function useConfirmationPickup(active: boolean, onSignedIn: () => void): void {
  const firedRef = useRef(false);
  const callbackRef = useRef(onSignedIn);
  callbackRef.current = onSignedIn;

  useEffect(() => {
    if (!active) {
      firedRef.current = false;
      return;
    }
    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      callbackRef.current();
    };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) fire();
    });
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.auth.getSession().then(({ data: sessionData }) => {
        if (sessionData.session) fire();
      });
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [active]);
}
