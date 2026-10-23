'use client';

// The page behind a waitlist share link. It remembers the code in this browser
// (lib/access-intent.ts), so it survives whatever sign-up the person picks,
// Google included, then sends them to sign up. Signed in already: it credits
// them to the sharer at once and takes them on. The sharer is credited by
// POST /api/access/redeem, which does the real checks.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoIcon } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { markFriendIntent, redeemPendingAccess } from '@/lib/access-intent';
import { looksLikeShareCode } from '@/lib/waitlist-share';

const primaryPillClass =
  'flex w-full items-center justify-center rounded-full bg-brand px-5 py-3.5 text-lg font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover';
const outlinePillClass =
  'flex w-full items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 py-3.5 text-lg font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover';

export default function FriendLinkClient({ code }: { code: string }) {
  const router = useRouter();
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const [view, setView] = useState<'checking' | 'open' | 'invalid'>('checking');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!looksLikeShareCode(code)) {
        setView('invalid');
        return;
      }
      markFriendIntent(code);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) setView('open');
        return;
      }
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
      router.replace('/locked?reason=not_approved');
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [code, checkAuth, router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-above flex w-full max-w-sm flex-col items-center text-center">
        <LogoIcon size={64} priority />
        {view === 'checking' ? (
          <p className="mt-10 text-base text-content-secondary" role="status">
            One moment…
          </p>
        ) : view === 'invalid' ? (
          <>
            <h1 className="mt-10 font-display text-2xl font-bold text-content-primary">This link doesn&apos;t work.</h1>
            <p className="mt-3 text-base text-content-secondary">Check the link, or ask your friend to send it again.</p>
          </>
        ) : (
          <>
            <h1 className="mt-10 font-display text-2xl font-bold text-content-primary">A friend invited you.</h1>
            <p className="mt-3 text-base text-content-secondary">
              Join the waitlist for Urganize. You both move up the line.
            </p>
            <div className="mt-10 w-full space-y-3">
              <Link href="/onboarding" className={primaryPillClass}>
                Join the waitlist
              </Link>
              <Link href="/auth" className={outlinePillClass}>
                I already have an account
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
