'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import { isIOSApp } from '@/lib/platform';
import { isCardTrialGatedPath, shouldConsultCardTrialGate, type CardTrialGateAnswer } from '@/lib/trial-card';

// Card trial for customers abroad (2026-11-14, #1266). Renders nothing.
//
// A new owner outside Nigeria adds a card before using the app. Whenever an
// app page is reached, this asks /api/subscription-status whether this account
// still owes that step (addCardRequired) and sends it to /add-card when it
// does. The server decides; nothing here re-works the rule.
//
// It borrows the retired Paystack gate's two pure helpers (which paths are
// gated, and when to ask) because they are exactly the same questions and are
// already tested. It does not share that gate's answer or its flag.
//
//  - Fails open on everything: no token, a bad response or a network error do
//    nothing.
//  - "No" is remembered for the tab, so an ordinary account asks once.
//    "Yes" is asked again on each app page, so adding the card clears it.
//  - Never in the iPhone app: App Store rules allow no prices there.

let lastAnswer: CardTrialGateAnswer = null;
let inFlightUserId: string | null = null;

export function AddCardGate() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const userId = user?.id ?? null;
  const role = user?.role ?? null;
  const email = user?.email ?? null;

  useEffect(() => {
    if (
      !shouldConsultCardTrialGate({
        enabled: true,
        pathname,
        isAuthLoading,
        isAuthenticated,
        userId,
        role,
        allowlisted: isAllowlistedEmail(email),
        lastAnswer,
      })
    ) {
      return;
    }
    if (isIOSApp()) return;

    const evaluatedUserId = String(userId ?? '').trim();
    if (!evaluatedUserId || inFlightUserId === evaluatedUserId) return;
    inFlightUserId = evaluatedUserId;

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/subscription-status', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as { addCardRequired?: boolean };
        const required = payload.addCardRequired === true;
        lastAnswer = { userId: evaluatedUserId, required };
        if (required && isCardTrialGatedPath(window.location.pathname)) router.replace('/add-card');
      } catch {
        // Fail open.
      } finally {
        inFlightUserId = null;
      }
    })();
  }, [pathname, isAuthLoading, isAuthenticated, userId, role, email, router]);

  return null;
}
