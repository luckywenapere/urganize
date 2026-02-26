'use client';

import dynamic from 'next/dynamic';

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
  return (
    <>
      <div className="flex flex-1 items-center justify-center text-[clamp(2.2rem,5.2vw,4rem)]">
        Generating task...
      </div>

      {showPricingSheet && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#03080c] p-6 sm:p-8">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-6">
            <div>
              <p className="text-xl text-white/95">Unlock unlimited task generation</p>
              <p className="text-sm text-white/60">Monthly plan starts now.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClosePricingSheet}
                className="text-lg text-white/70"
              >
                Close
              </button>
              <PaystackButton
                email={userEmail}
                amount={8000}
                plan="monthly"
                className="rounded-none bg-white px-5 py-3 text-base font-medium text-black"
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
