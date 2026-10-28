'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import {
  HOME_DISTRIBUTE_COPY as COPY,
  HOME_DISTRIBUTE_HREF,
  decideDistributeCard,
} from '@/lib/home/distribute-card';
import { checkoutPath } from '@/lib/self-serve';
import {
  getTeamAccessClient,
  peekTeamAccessClient,
  type TeamAccessClientSnapshot,
} from '@/lib/team-billing-client';

/**
 * Distribute on Home (2026-10-27, founder approved): an extra way in. The
 * Distribute step inside each rollout is unchanged. Manager, Label and Group
 * teams get a button to the Distribute tab; every other team is offered the
 * Manager plan through the existing checkout. Draws nothing until the team's
 * plan is known, so it never flashes the wrong button. Rules in
 * lib/home/distribute-card.ts.
 */
export function HomeDistributeCard() {
  const router = useRouter();
  const headingId = useId();
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const [access, setAccess] = useState<TeamAccessClientSnapshot | null>(() =>
    userId ? peekTeamAccessClient(userId) : null
  );

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void getTeamAccessClient(userId).then((snapshot) => {
      if (live) setAccess(snapshot);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const view = decideDistributeCard(access);
  if (view === 'hidden') return null;

  const upgrade = () => {
    captureAnalyticsEvent(
      createPostHogEvent('upgrade_to_manager_clicked', {
        path: 'self_serve',
        plan: 'manager',
        source: 'home_distribute',
      }),
      { userId }
    );
    router.push(checkoutPath({ plan: 'manager' }));
  };

  const buttonClass =
    'motion-focus motion-press mt-4 flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold';

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[20px] border border-stroke-default bg-bg-surface p-5"
      data-home-block="distribute"
    >
      <span className="inline-flex h-6 items-center rounded-full border border-stroke-default px-2.5 text-[11px] font-semibold text-content-secondary">
        {COPY.label}
      </span>
      <h2 id={headingId} className="mt-3 font-display text-[1.4rem] leading-[1.25] text-content-primary">
        {COPY.title}
      </h2>
      {view === 'upgrade' ? (
        <>
          <p className="mt-1.5 text-sm text-content-secondary">{COPY.upgradeLine}</p>
          <button
            type="button"
            onClick={upgrade}
            className={`${buttonClass} bg-brand text-content-inverse hover:bg-brand-hover`}
          >
            {COPY.upgradeAction}
          </button>
        </>
      ) : (
        <Link
          href={HOME_DISTRIBUTE_HREF}
          className={`${buttonClass} border border-stroke-default text-content-primary hover:border-stroke-strong`}
        >
          {COPY.distributeAction}
        </Link>
      )}
    </section>
  );
}
