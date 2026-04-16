'use client';

import type { SubscriptionStatus } from '@/lib/subscription-access';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';

type PaywallModalProps = {
  status: SubscriptionStatus;
  trialDaysLeft: number;
};

export function PaywallModal({ status, trialDaysLeft }: PaywallModalProps) {
  const badgeText =
    status === 'free_trial'
      ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your free trial`
      : status === 'expired'
        ? 'Upgrade required'
        : 'Subscription required';

  return (
    <div className="fixed inset-0 z-[220]">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-[4px]" />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="paywall-title"
          className="w-full max-w-[720px] rounded-[32px] border border-stroke-default bg-bg-surface/98 p-6 shadow-[0_28px_90px_-36px_rgba(0,0,0,0.82)] sm:p-8"
        >
          <div className="inline-flex rounded-full border border-brand/35 bg-brand-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            {badgeText}
          </div>

          <div className="mt-5">
            <SubscriptionPaywall
              compact
              title="Choose a plan to keep using Urganize."
              description="Annual stays front and center with the 3-day free trial. Monthly is available if you want to subscribe right away."
            />
          </div>

          <p className="mt-4 text-center text-xs text-content-tertiary">
            Your first release and all its data stay accessible.
          </p>
        </div>
      </div>
    </div>
  );
}
