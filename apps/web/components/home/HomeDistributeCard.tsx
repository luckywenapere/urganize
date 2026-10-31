'use client';

import { useEffect, useId, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useHiddenNudge } from '@/lib/hidden-nudges';
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
 * Manager plan through the existing checkout, and a teammate who cannot pay
 * for the team asks their admin instead (2026-10-31). Draws nothing until the team's
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

  // "Not now" puts the upgrade offer away for 30 days in this browser. The
  // Distribute button for teams that have it is a way in, not an offer, and stays.
  const [offerHidden, hideOffer] = useHiddenNudge('home-distribute-upgrade', 30);

  const [askState, setAskState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const view = decideDistributeCard(access);
  if (view === 'hidden') return null;
  if ((view === 'upgrade' || view === 'ask_admin') && offerHidden) return null;

  // A teammate who is not an owner or admin nudges the owner instead of paying:
  // the self-serve checkout would charge their own account, not the team's.
  // The server limits this to once a day per person, and answers a repeat as
  // sent, so the button never tells them it failed when it did not.
  const askAdmin = async () => {
    if (askState === 'sending' || askState === 'sent') return;
    setAskState('sending');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('signed out');
      const response = await fetch('/api/billing/notify-admin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ask: 'distribute' }),
      });
      if (!response.ok) throw new Error('failed');
      captureAnalyticsEvent(
        createPostHogEvent('upgrade_to_manager_clicked', {
          path: 'ask_admin',
          plan: 'manager',
          source: 'home_distribute',
        }),
        { userId }
      );
      setAskState('sent');
    } catch {
      setAskState('error');
    }
  };

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
      {view === 'ask_admin' ? (
        <>
          <p className="mt-1.5 text-sm text-content-secondary">{COPY.askAdminLine}</p>
          <button
            type="button"
            onClick={askAdmin}
            disabled={askState === 'sending' || askState === 'sent'}
            className={`${buttonClass} bg-brand text-content-inverse hover:bg-brand-hover disabled:opacity-60`}
          >
            {askState === 'sent' ? COPY.askAdminSent : COPY.askAdminAction}
          </button>
          {askState === 'error' ? (
            <p role="alert" className="mt-2 text-center text-sm text-status-error">
              {COPY.askAdminFailed}
            </p>
          ) : null}
          {askState !== 'sent' ? (
            <button
              type="button"
              onClick={hideOffer}
              className="motion-focus mt-1 flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              {COPY.notNow}
            </button>
          ) : null}
        </>
      ) : view === 'upgrade' ? (
        <>
          <p className="mt-1.5 text-sm text-content-secondary">{COPY.upgradeLine}</p>
          <button
            type="button"
            onClick={upgrade}
            className={`${buttonClass} bg-brand text-content-inverse hover:bg-brand-hover`}
          >
            {COPY.upgradeAction}
          </button>
          <button
            type="button"
            onClick={hideOffer}
            className="motion-focus mt-1 flex h-11 w-full items-center justify-center rounded-full text-sm font-medium text-content-secondary hover:text-content-primary"
          >
            {COPY.notNow}
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
