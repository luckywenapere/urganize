'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { isAllowlistedEmail } from '@/lib/paywall-allowlist';
import {
  isHardPaywallEnabled,
  isHardPaywallGatedPath,
  shouldConsultHardPaywallGate,
  type HardPaywallGateAnswer,
} from '@/lib/team-billing';
import { getTeamAccessClient } from '@/lib/team-billing-client';

// HardPaywallGate — the in-session half of the team wall
// (NEXT_PUBLIC_FEATURE_HARD_PAYWALL). Renders nothing; mounted once by
// AppShell beside the other bridges.
//
// The login bounce in auth-store only fires on full page loads, and this app is
// a SPA once you are in it: a trial that lapses mid-session, or a Back
// navigation from /locked, would otherwise leave someone working inside a
// walled team until their next hard refresh. This closes that by asking on
// every gated navigation.
//
// It is also what delivers the spec's mid-session rule. The server grants a
// 15-minute grace past trial expiry so an in-flight save lands and a
// background poll cannot 402 someone out mid-edit; this gate reads the exact
// answer and moves them on their NEXT navigation. That split is the whole
// mechanism: the server protects the work, the client draws the wall.
//
// Discipline, all load-bearing:
//  - The decision to ASK is pure and unit-tested (shouldConsultHardPaywallGate);
//    the decision to REDIRECT is always the server's fresh answer. The client
//    never re-derives who is walled.
//  - Fail open on everything. A null answer means the flag is off server-side,
//    or we could not tell; either way nothing happens, and the next full page
//    load's bounce is the recurring net.
//  - Unlike the card-trial gate, "walled" is NOT one-way in either direction: a
//    team pays and is unwalled, a trial lapses and is walled. So the answer
//    carries a timestamp and is re-asked on a short TTL rather than cached for
//    the tab. The shared client cache keeps that to one request per navigation.
//  - The redirect re-reads window.location.pathname at RESOLVE time (the
//    MobileNavBar click-time-fresh-read pattern), so a gated→gated navigation
//    mid-fetch still redirects and landing on /locked mid-fetch does not
//    double-fire.
//  - /admin is deliberately not gated (see isHardPaywallGatedPath): a walled
//    founder must still be able to comp or extend a team.
//  - IT MUST NOT REDIRECT A READ-ONLY TEAM, and the reason it does not is that
//    it reads `hasAccess`, which is TRUE for state 'read_only' (a team that paid
//    and then lapsed keeps every read, permanently — see resolveTeamAccess).
//    Do not "tidy" this into a check on `canWrite` or on `state`: that would put
//    the wall back in front of exactly the customers read-only mode exists to
//    keep. TeamReadOnlyStrip is what tells them, and the server's 403 is what
//    refuses their writes. A test in lib/team-billing.test.ts pins this.

const HARD_PAYWALL_ENABLED = isHardPaywallEnabled();

let lastAnswer: HardPaywallGateAnswer = null;
let inFlightUserId: string | null = null;

export function HardPaywallGate() {
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
      !shouldConsultHardPaywallGate({
        enabled: HARD_PAYWALL_ENABLED,
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
        const snapshot = await getTeamAccessClient(evaluatedUserId);
        // Null means no opinion (flag off server-side, no session, failed
        // read). Do not record it as an answer, or a transient failure would
        // suppress the gate for the whole TTL.
        if (!snapshot) return;

        lastAnswer = {
          userId: evaluatedUserId,
          walled: !snapshot.hasAccess,
          checkedAt: Date.now(),
        };

        if (!snapshot.hasAccess && isHardPaywallGatedPath(window.location.pathname)) {
          router.replace('/locked?reason=team_trial_expired');
        }
      } catch {
        // Fail open.
      } finally {
        inFlightUserId = null;
      }
    })();
  }, [pathname, isAuthLoading, isAuthenticated, userId, role, email, router]);

  return null;
}
