'use client';

import dynamic from 'next/dynamic';
import { getIndividualPlanAmount } from '@/lib/billing';

const PaystackButton = dynamic(
  () => import('@/components/PaystackButton').then((mod) => mod.PaystackButton),
  { ssr: false }
);

type Step6GeneratingTaskProps = {
  showPricingSheet: boolean;
  userEmail: string;
  onClosePricingSheet: () => void;
};

export function Step6GeneratingTask({
  showPricingSheet,
  userEmail,
  onClosePricingSheet,
}: Step6GeneratingTaskProps) {
  const monthlyAmount = getIndividualPlanAmount('monthly');

  return (
    <>
      <div className="flex flex-1 items-center justify-center text-center text-[clamp(2rem,5vw,3.6rem)] text-content-primary">
        Generating task...
      </div>

      {showPricingSheet && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stroke-default bg-bg-surface/95 p-6 backdrop-blur sm:p-8">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-xl text-content-primary">Unlock unlimited task generation</p>
              <p className="text-sm text-content-secondary">Start Pro at NGN {monthlyAmount.toLocaleString()} per month.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClosePricingSheet}
                className="rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Skip for now
              </button>
              <PaystackButton
                email={userEmail}
                amount={monthlyAmount}
                plan="monthly"
                className="rounded-lg bg-brand px-5 py-3 text-base font-semibold text-content-inverse hover:bg-brand-hover"
              >
                Subscribe
              </PaystackButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
