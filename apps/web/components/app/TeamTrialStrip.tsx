'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import {
  TEAM_TRIAL_PILL_THRESHOLD_DAYS,
  isHardPaywallEnabled,
} from '@/lib/team-billing';
import {
  getTeamAccessClient,
  peekTeamAccessClient,
  type TeamAccessClientSnapshot,
} from '@/lib/team-billing-client';

// The trial indicator. A slim full-width strip above the topbar, shown once a
// team is inside the last TEAM_TRIAL_PILL_THRESHOLD_DAYS days.
//
// WHY IT LIVES ABOVE THE TOPBAR AND NOT IN IT: the topbar's right cluster is
// width-critical, with a documented budget that already overflows a 375px
// phone at eight controls. Adding a countdown there would break phones. The
// full-width strip slot (the AndroidAppBanner precedent) costs one line of
// height and reads better anyway, because it is a status about the whole
// account rather than another control.
//
// CALM, per the spec. It states the number and offers the action; it does not
// escalate as the number drops, does not turn red, and carries no warning
// icon. It also appears only in the last third of the trial: a countdown from
// day 14 would be nagging rather than informative.
//
// NOT DISMISSIBLE, deliberately, unlike the Android banner. The spec asks for
// a persistent, non-blocking indicator: dismissing it would hide the one piece
// of information that stops the wall being a surprise. It is one line, it never
// covers content, and it disappears by itself the moment the team pays.

const HARD_PAYWALL_ENABLED = isHardPaywallEnabled();

export function TeamTrialStrip() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const userId = user?.id ?? null;

  // Seeded from the shared cache so a navigation that already resolved the
  // answer paints the strip on the first frame instead of popping it in.
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
  if (!team || team.state !== 'trial') return null;
  if (team.trialDaysLeft <= 0 || team.trialDaysLeft > TEAM_TRIAL_PILL_THRESHOLD_DAYS) return null;

  const dayLabel = team.trialDaysLeft === 1 ? '1 day left' : `${team.trialDaysLeft} days left`;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
      <p className="text-sm text-content-secondary">
        <span className="font-medium text-content-primary">Trial: {dayLabel}.</span>{' '}
        {team.isOwnerOrAdmin
          ? 'Activate your plan whenever you are ready.'
          : 'Your team admin can activate the plan any time.'}
      </p>
      {team.isOwnerOrAdmin ? (
        <Link
          href="/locked?intent=activate"
          className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Activate your plan
        </Link>
      ) : null}
    </div>
  );
}
