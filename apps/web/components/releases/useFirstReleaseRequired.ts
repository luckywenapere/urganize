'use client';

import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { isFirstReleaseRequired } from '@/lib/first-release-required';

/**
 * Live reading of `isFirstReleaseRequired` against the auth + release stores
 * (URG-217). Read by CreateReleaseModal (to drop its exits) and by the
 * dashboard landing surfaces (to auto-open it).
 *
 * Co-located with its primary consumer rather than in lib/, matching how
 * useReleaseScope sits in components/workspace/ — and keeping the store
 * imports out of the unit-tested pure module.
 *
 * Returns false on any surface that never loads the release store (/settings,
 * /auth): `isInitialLoading` defaults to true and stays that way, so the
 * predicate fails open there by construction.
 */
export function useFirstReleaseRequired(): boolean {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  // Mirrors AppShell's own `hasCompletedOnboarding` derivation exactly so the
  // onboarding gate and this predicate cannot disagree about who is mid-flow.
  const hasCompletedOnboarding = useAuthStore(
    (state) => state.user?.onboarding_completed === true
  );
  const isInitialLoading = useReleaseStore((state) => state.isInitialLoading);
  const error = useReleaseStore((state) => state.error);
  const releaseCount = useReleaseStore((state) => state.releases.length);

  return isFirstReleaseRequired({
    isAuthenticated,
    isAuthLoading,
    hasCompletedOnboarding,
    isInitialLoading,
    error,
    releaseCount,
  });
}
