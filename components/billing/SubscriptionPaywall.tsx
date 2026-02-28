'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type SubscriptionPaywallProps = {
  title?: string;
  description?: string;
  compact?: boolean;
  showTrialCta?: boolean;
};

export function SubscriptionPaywall({
  title = 'Subscription required',
  description = 'Upgrade your plan to keep creating and executing campaign steps.',
  compact = false,
  showTrialCta = true,
}: SubscriptionPaywallProps) {
  const [isStartingTrial, setIsStartingTrial] = useState(false);
  const [trialMessage, setTrialMessage] = useState('');

  const startFreeTrial = async () => {
    if (isStartingTrial) return;
    setTrialMessage('');
    setIsStartingTrial(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Session expired. Sign in again and retry.');
      }

      const response = await fetch('/api/trial/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Could not start free trial');
      }

      setTrialMessage('Free trial started. Redirecting...');
      window.location.assign('/dashboard?trialStarted=1');
    } catch (error: any) {
      setTrialMessage(error?.message || 'Could not start free trial');
    } finally {
      setIsStartingTrial(false);
    }
  };

  return (
    <section className="rounded-2xl border border-stroke-default bg-bg-surface p-6 sm:p-7">
      <p className="text-xs uppercase tracking-wide text-content-tertiary">Paywall</p>
      <h2 className="mt-2 text-2xl font-semibold text-content-primary">{title}</h2>
      <p className="mt-2 text-sm text-content-secondary">{description}</p>

      {!compact && (
        <ul className="mt-4 space-y-2 text-sm text-content-secondary">
          <li>Unlimited plan/task generation</li>
          <li>Full onboarding and next-step execution</li>
          <li>Access to individual and group billing options</li>
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {showTrialCta && (
          <button
            type="button"
            onClick={startFreeTrial}
            disabled={isStartingTrial}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
          >
            {isStartingTrial ? 'Starting trial...' : 'Start 10-Day Free Trial'}
          </button>
        )}
        <Link
          href="/settings"
          className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
        >
          Open Billing
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
        >
          Back to Dashboard
        </Link>
      </div>
      {trialMessage && <p className="mt-3 text-sm text-content-secondary">{trialMessage}</p>}
    </section>
  );
}
