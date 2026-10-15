'use client';

// Closed sign-up (2026-10-15). /locked?reason=not_approved: a signed-in account
// nobody has let in yet (most often a stray Google sign-up). Plain and short.
//
// On open it posts whatever invite this browser holds (a /start code, a founder
// /welcome link) and asks whether the account is let in, so someone the founder
// approved while they waited, or who opened their link after signing up, is
// taken into the app instead of being told to wait.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { HELD_COPY } from '@/lib/access-gate';
import { redeemPendingAccess } from '@/lib/access-intent';

const outlinePillClass =
  'flex w-full items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 py-3.5 text-lg font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50';

export function HeldAccountScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) router.replace('/auth');
        return;
      }
      const answer = await redeemPendingAccess(token);
      // Only a real yes moves them on: a failed request must not bounce them
      // home and straight back here.
      if (cancelled || !answer.answered || !answer.approved) return;
      try {
        await checkAuth({ force: true });
      } catch {
        // The next page load re-checks.
      }
      if (!cancelled) router.replace(HOME_PATH);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [checkAuth, router]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace('/auth');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-above flex w-full max-w-sm flex-col items-center text-center">
        <Logo />
        <h1 className="mt-10 font-display text-2xl font-bold text-content-primary">{HELD_COPY.title}</h1>
        <p className="mt-3 text-base text-content-secondary">{HELD_COPY.body}</p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className={`mt-10 ${outlinePillClass}`}
        >
          {HELD_COPY.cta}
        </button>
      </div>
    </div>
  );
}
