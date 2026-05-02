'use client';

import Link from 'next/link';
import { MONTHLY_PLAN_PRICE } from '@/lib/billing';
import { formatCurrencyAmount } from '@/lib/pricing';
import { usePaywall } from '@/hooks/usePaywall';

type TrialStatusBannerProps = {
  compact?: boolean;
};

export function TrialStatusBanner({ compact = false }: TrialStatusBannerProps) {
  const { status, trialDaysLeft, isLoading } = usePaywall();

  if (isLoading || status === 'active' || status === 'cancelled') {
    return null;
  }

  const isExpired = status === 'expired';

  return (
    <div
      className={`rounded-none border px-4 py-3 ${
        isExpired
          ? 'border-status-error/35 bg-status-error/10'
          : 'border-brand/35 bg-brand-muted'
      } ${compact ? 'text-xs' : 'text-sm'}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={isExpired ? 'text-status-error' : 'text-content-primary'}>
          {isExpired
            ? `Subscribe to continue using Urganize - ${formatCurrencyAmount(MONTHLY_PLAN_PRICE, 'NGN')}/month`
            : `3-day free trial - ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining`}
        </span>
        <span className={isExpired ? 'text-status-error/70' : 'text-content-secondary'}>&middot;</span>
        <Link
          href="/settings#billing"
          className={`font-semibold underline-offset-4 hover:underline ${
            isExpired ? 'text-status-error' : 'text-brand'
          }`}
        >
          Upgrade
        </Link>
      </div>
    </div>
  );
}
