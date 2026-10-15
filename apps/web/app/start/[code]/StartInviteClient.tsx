'use client';

// Closed sign-up (2026-10-15). The page behind a founder invite link.
//
// It remembers the code in this browser first (lib/access-intent.ts), so the
// invite survives whatever sign-up the person picks, Google included, and with
// any email. Signed in already: it redeems at once and opens the app. Signed
// out: it says the link is good and sends them to sign up; the code is redeemed
// after sign-in by /auth/callback, /auth or onboarding.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoIcon } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { looksLikeAccessCode } from '@/lib/access-gate';
import { clearAccessIntent, markAccessIntent, redeemPendingAccess } from '@/lib/access-intent';

type View = 'checking' | 'open' | 'used' | 'expired' | 'revoked' | 'invalid' | 'taken';

const primaryPillClass =
  'flex w-full items-center justify-center rounded-full bg-brand px-5 py-3.5 text-lg font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover';
const outlinePillClass =
  'flex w-full items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 py-3.5 text-lg font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover';

const COPY: Record<Exclude<View, 'checking'>, { title: string; body: string }> = {
  open: { title: "You're invited.", body: 'Create your account to start using Urganize.' },
  used: { title: 'This invite has been used.', body: 'If it was you, sign in.' },
  expired: { title: 'This invite has expired.', body: 'Ask the person who sent it for a new one.' },
  revoked: { title: 'This invite no longer works.', body: 'Ask the person who sent it for a new one.' },
  invalid: { title: "This invite link doesn't work.", body: 'Check the link, or ask for a new one.' },
  taken: { title: 'This invite has been used.', body: 'Another account used it. Ask for a new one.' },
};

export default function StartInviteClient({ code }: { code: string }) {
  const router = useRouter();
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const [view, setView] = useState<View>('checking');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!looksLikeAccessCode(code)) {
        setView('invalid');
        return;
      }
      markAccessIntent(code);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        const answer = await redeemPendingAccess(token);
        if (cancelled) return;
        if (answer.approved) {
          try {
            await checkAuth({ force: true });
          } catch {
            // The app re-checks on load.
          }
          router.replace(HOME_PATH);
          return;
        }
        const outcome = answer.outcome;
        setView(
          outcome === 'expired' || outcome === 'revoked'
            ? outcome
            : outcome === 'used'
              ? 'taken'
              : 'invalid'
        );
        return;
      }

      try {
        const response = await fetch(`/api/access/peek?code=${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as { state?: string };
        if (cancelled) return;
        const state = payload.state;
        if (state === 'open' || state === 'used') {
          setView(state);
          return;
        }
        clearAccessIntent();
        setView(state === 'expired' || state === 'revoked' ? state : 'invalid');
      } catch {
        // Offline or a blip: let them carry on; the redeem after sign-in decides.
        if (!cancelled) setView('open');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [code, checkAuth, router]);

  const copy = view === 'checking' ? null : COPY[view];

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-above flex w-full max-w-sm flex-col items-center text-center">
        <LogoIcon size={64} priority />
        {copy ? (
          <>
            <h1 className="mt-10 font-display text-2xl font-bold text-content-primary">{copy.title}</h1>
            <p className="mt-3 text-base text-content-secondary">{copy.body}</p>
            <div className="mt-10 w-full space-y-3">
              {view === 'open' ? (
                <>
                  <Link href="/onboarding" className={primaryPillClass}>
                    Create my account
                  </Link>
                  <Link href="/auth" className={outlinePillClass}>
                    I already have an account
                  </Link>
                </>
              ) : view === 'used' ? (
                <Link href="/auth" className={primaryPillClass}>
                  Sign in
                </Link>
              ) : null}
            </div>
          </>
        ) : (
          <p className="mt-10 text-base text-content-secondary" role="status">
            Checking your invite…
          </p>
        )}
      </div>
    </main>
  );
}
