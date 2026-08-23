'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { READ_ONLY_REACTIVATE_HREF, isHardPaywallEnabled } from '@/lib/team-billing';
import {
  getTeamAccessClient,
  peekTeamAccessClient,
  type TeamAccessClientSnapshot,
} from '@/lib/team-billing-client';

// The read-only indicator. A slim full-width strip above the topbar, shown to a
// team that paid before and whose paid period lapsed without a successful
// renewal. Their reads all still work; their writes are refused with a 403.
//
// THIS STRIP IS THE COMMUNICATION. Nothing in the app disables a write button —
// that would mean touching every mutating control in the product — so a
// read-only team learns what is going on here, and each refused action shows the
// gate's own message. Which is exactly why it is not dismissible: hiding it
// would leave someone guessing why their save failed.
//
// It lives above the topbar rather than inside it for the reason TeamTrialStrip
// records: the topbar's right cluster has a documented width budget that already
// overflows a 375px phone at eight controls.
//
// CALM, and factual. No red, no warning icon, no countdown, and nothing about
// losing anything, because nothing is being lost: read-only is permanent, and
// every release, task and file is exactly where they left it. The two states
// this strip can be in differ only by whether this person can act on it.
//
// It cannot collide with TeamTrialStrip: that one renders only for state
// 'trial', this one only for 'read_only'.

const HARD_PAYWALL_ENABLED = isHardPaywallEnabled();

export function TeamReadOnlyStrip() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const userId = user?.id ?? null;

  // Seeded from the shared cache so a navigation that already resolved the
  // answer paints on the first frame instead of popping in.
  const [team, setTeam] = useState<TeamAccessClientSnapshot | null>(() =>
    userId ? peekTeamAccessClient(userId) : null
  );

  useEffect(() => {
    if (!HARD_PAYWALL_ENABLED) return;
    if (isAuthLoading || !isAuthenticated || !userId) return;
    // Curator-only accounts have no team and no billing.
    if (String(user?.role || '').toLowerCase() === 'curator') return;

    let cancelled = false;
    void (async () => {
      const snapshot = await getTeamAccessClient(userId);
      if (!cancelled) setTeam(snapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isAuthenticated, userId, user?.role]);

  if (!HARD_PAYWALL_ENABLED) return null;
  if (!team || team.state !== 'read_only') return null;
  // `state` describes the PRIMARY team while `canWrite` is the combined answer
  // across every team this person belongs to, so someone whose primary team
  // lapsed but who also sits on a paying team can still write. Telling them the
  // app is read only would be false.
  if (team.canWrite) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
      <p className="text-sm text-content-secondary">
        <span className="font-medium text-content-primary">Read only.</span> Your plan
        ended, and everything your team made is still here.{' '}
        {team.isOwnerOrAdmin
          ? 'Update your payment to start working again.'
          : 'Your team admin can update the payment.'}
      </p>
      {team.isOwnerOrAdmin ? (
        <Link
          href={READ_ONLY_REACTIVATE_HREF}
          className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Update payment
        </Link>
      ) : null}
    </div>
  );
}
