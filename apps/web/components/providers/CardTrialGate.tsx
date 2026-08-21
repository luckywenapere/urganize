'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import {
  isCardTrialEnabled,
  isCardTrialGatedPath,
  shouldConsultCardTrialGate,
  type CardTrialGateAnswer,
} from '@/lib/trial-card';

// CardTrialGate — the in-session half of the card-before-trial bounce
// (NEXT_PUBLIC_FEATURE_CARD_TRIAL). Renders nothing; mounted once by AppShell
// beside the other bridges.
//
// The login-time bounce in auth-store only fires on full page loads, and both
// signup funnels end in client-side navigations while the pathname is still a
// safe auth path — so a brand-new signup can reach the dashboard, create a
// blank-rollout release and use the whole app without ever seeing billing
// (see the pure-halves block in lib/trial-card.ts for the three concrete
// escape paths). This gate closes them: whenever a gated chrome path
// (/dashboard, /settings, /admin) is reached in-session, it asks the server's
// /api/subscription-status whether this account still owes the card step and
// routes it to /start-trial when the answer is yes.
//
// Discipline, all load-bearing:
//  - The decision to ASK is pure and unit-tested (shouldConsultCardTrialGate);
//    the decision to REDIRECT is always the server's fresh cardTrialRequired —
//    the client never re-derives the predicate.
//  - Fail open on everything: no token, a non-OK response, a network error, an
//    unexpected payload all do nothing. The auth-store bounce on the next full
//    load is the recurring net.
//  - `required: false` is cached per user for the rest of the tab (the
//    predicate is one-way — see CardTrialGateAnswer's doc); `required: true`
//    is re-asked on every gated entry so completing checkout clears it
//    without a reload.
//  - The redirect re-reads window.location.pathname at RESOLVE time (the
//    MobileNavBar click-time-fresh-read pattern) rather than trusting the
//    mount-time closure: navigating gated→gated mid-fetch must still bounce,
//    and navigating onto /start-trial itself mid-fetch must not double-fire.
//  - Module-level (not store) state on purpose: it is keyed by user id at
//    answer time, so a same-tab logout→login as a DIFFERENT user misses the
//    cache and re-asks (the lib/scene-memory.ts lesson about load-time-cached
//    ids does not apply — nothing here is read at module load).

const CARD_TRIAL_ENABLED = isCardTrialEnabled();

let lastAnswer: CardTrialGateAnswer = null;
let inFlightUserId: string | null = null;

export function CardTrialGate() {
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
        enabled: CARD_TRIAL_ENABLED,
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
        const payload = (await response.json().catch(() => ({}))) as {
          cardTrialRequired?: boolean;
        };
        const required = payload.cardTrialRequired === true;
        lastAnswer = { userId: evaluatedUserId, required };
        if (required && isCardTrialGatedPath(window.location.pathname)) {
          router.replace('/start-trial');
        }
      } catch {
        // Fail open — the next full page load's auth-store bounce is the net.
      } finally {
        inFlightUserId = null;
      }
    })();
  }, [pathname, isAuthLoading, isAuthenticated, userId, role, email, router]);

  return null;
}
