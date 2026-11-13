'use client';

import { useState } from 'react';
import { Button } from '@urganize/ui';
import { Loader2, Lock, MessageCircle, Sparkles, X } from '@/components/icons';
import { Sheet } from '@/components/records/RecordParts';
import { startCreditsCheckout } from '@/lib/credits/checkout-client';
import { TOPUP_PACKS, creditsForPack, packPriceUsd, type TopupPack } from '@/lib/credits/packs';
import type { CreditAccount } from '@/lib/credits/allowance';

// "Not ready for a plan? Try the assistant for ₦1,500" on the plan wall (#1243,
// founder approved mocks docs/mocks/credits-on-wall). A second choice under the
// plans, with an outline button so the plan stays the one filled action. The
// button opens a sheet with the four packs and the smallest picked, then goes
// straight to payment; payment returns to /locked/urgans, where the assistant
// and the "credits were added" notice already live.
//
// Whether to show it at all is lib/credits/wall-offer.ts. Credits still open
// the assistant only (#1164), and the sheet says so before anyone pays.

const RETURN_TO = '/locked/urgans' as const;
/** A longer answer costs about 3 credits, a quick question 1 (credit pricing). */
const CREDITS_PER_LONGER_ANSWER = 3;

type Props = {
  account: CreditAccount | null;
  currency: 'NGN' | 'USD';
};

function priceLabel(pack: TopupPack, currency: 'NGN' | 'USD'): string {
  return currency === 'USD'
    ? `$${packPriceUsd(pack).toLocaleString('en')}`
    : `₦${pack.priceNaira.toLocaleString('en')}`;
}

export function WallCreditsOffer({ account, currency }: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number>(TOPUP_PACKS[0].priceNaira);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // No plan means the credits-only rate, and the server decides again at checkout.
  const rate: CreditAccount = account ?? 'credits_only';
  const smallest = TOPUP_PACKS[0];
  const smallestCredits = creditsForPack(rate, smallest.priceNaira) ?? 0;
  const pack = TOPUP_PACKS.find((p) => p.priceNaira === picked) ?? smallest;
  const credits = creditsForPack(rate, pack.priceNaira) ?? 0;

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const failure = await startCreditsCheckout(pack.priceNaira, RETURN_TO);
      if (failure) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-xs text-content-tertiary" aria-hidden="true">
          <span className="h-px flex-1 bg-stroke-default" />
          or
          <span className="h-px flex-1 bg-stroke-default" />
        </div>
        <section
          aria-labelledby="wall-credits-offer"
          className="flex gap-3 rounded-xl border border-stroke-default bg-bg-surface p-4"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-bg-elevated text-content-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="wall-credits-offer" className="text-[15px] font-semibold text-content-primary">
              Not ready for a plan?
            </h2>
            <p className="mt-0.5 text-sm leading-snug text-content-secondary">
              Try the assistant for {priceLabel(smallest, currency)}. You get {smallestCredits.toLocaleString('en')} credits.
              No subscription.
            </p>
            <Button
              variant="secondary"
              className="mt-3 min-h-11 w-full"
              onClick={() => {
                setPicked(smallest.priceNaira);
                setError('');
                setOpen(true);
              }}
            >
              Try it for {priceLabel(smallest, currency)}
            </Button>
          </div>
        </section>
      </div>

      {open ? (
        <Sheet label="Try the assistant" onClose={() => setOpen(false)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-content-primary">Try the assistant</h2>
              <p className="mt-0.5 text-sm text-content-secondary">One payment. No subscription.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="motion-focus -mr-3 grid size-11 place-items-center rounded-md text-content-tertiary hover:text-content-primary"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div role="radiogroup" aria-label="Pick a credit pack" className="mt-4 grid grid-cols-2 gap-2">
            {TOPUP_PACKS.map((option) => {
              const on = option.priceNaira === pack.priceNaira;
              return (
                <button
                  key={option.priceNaira}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(option.priceNaira)}
                  className={`motion-focus rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-brand bg-brand/[.07] ring-1 ring-brand' : 'border-stroke-default hover:border-stroke-strong'
                  }`}
                >
                  <span className="block text-[15px] font-semibold tabular-nums text-content-primary">
                    {priceLabel(option, currency)}
                  </span>
                  <span className="block text-xs text-content-secondary">
                    {(creditsForPack(rate, option.priceNaira) ?? 0).toLocaleString('en')} credits
                  </span>
                </button>
              );
            })}
          </div>

          <ul className="mt-4 flex flex-col gap-2 text-sm">
            <li className="flex items-start gap-2.5 text-content-primary">
              <MessageCircle className="mt-0.5 size-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              About {credits.toLocaleString('en')} quick questions, or about{' '}
              {Math.floor(credits / CREDITS_PER_LONGER_ANSWER).toLocaleString('en')} longer answers
            </li>
            <li className="flex items-start gap-2.5 text-content-secondary">
              <Lock className="mt-0.5 size-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              The assistant only. A plan opens rollouts and your team.
            </li>
          </ul>

          <Button variant="primary" className="mt-5 min-h-11 w-full" disabled={busy} onClick={() => void pay()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? 'Opening payment' : `Pay ${priceLabel(pack, currency)}${currency === 'NGN' ? ' with Paystack' : ''}`}
          </Button>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-status-error">
              {error}
            </p>
          ) : (
            <p className="mt-2 text-center text-xs text-content-tertiary">
              {currency === 'NGN' ? 'Card or bank transfer. ' : ''}Credits are added as soon as you pay.
            </p>
          )}
        </Sheet>
      ) : null}
    </>
  );
}
