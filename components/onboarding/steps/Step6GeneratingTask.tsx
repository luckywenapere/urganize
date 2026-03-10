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
  isGenerating: boolean;
  generationError: string;
  onRetryGeneration: () => void;
};

export function Step6GeneratingTask({
  showPricingSheet,
  userEmail,
  onClosePricingSheet,
  isGenerating,
  generationError,
  onRetryGeneration,
}: Step6GeneratingTaskProps) {
  const monthlyAmount = getIndividualPlanAmount('monthly');

  return (
    <>
      <div className="mx-auto mt-[16vh] w-full max-w-[860px] rounded-3xl border border-stroke-default bg-bg-surface/95 p-8 text-center shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl">
        <p className="text-[clamp(2rem,5vw,3.6rem)] text-content-primary">
          {isGenerating ? 'Generating task...' : 'Task generation paused'}
        </p>
        {generationError && (
          <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-status-error/35 bg-status-error/10 px-5 py-4">
            <p className="text-sm text-status-error">{generationError}</p>
            <button
              type="button"
              onClick={onRetryGeneration}
              className="mt-3 rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm font-semibold text-content-primary hover:bg-bg-hover"
            >
              Generate again
            </button>
          </div>
        )}
      </div>

      {showPricingSheet && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stroke-default bg-bg-surface/95 p-6 shadow-[0_-20px_60px_-40px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-8">
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
