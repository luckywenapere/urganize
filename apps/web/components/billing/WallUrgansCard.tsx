'use client';

import Link from 'next/link';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { isCreditsEnabled, isCreditsPurchasable } from '@/lib/credits/config';

// "UrgAns is still yours" on the wall (2026-10-02).
//
// A team whose trial ended, or whose plan lapsed, can still use UrgAns and pay
// for it in credits, changes included. The rest of the app stays behind the wall,
// so this is the way in: one card on the wall that opens /locked/urgans, a page
// that sits outside the walled routes and holds the chat and the credit packs.
//
// It shows only while credits are switched on, and says nothing it cannot back up:
// the balance comes from the same endpoint the usage strip uses, and with none
// left the card points at buying more instead of at a chat that cannot answer.
// With none left and buying switched off there is nothing true to offer, so no card.

export const URGANS_HUB_PATH = '/locked/urgans';

const CREDITS_ENABLED = isCreditsEnabled();

export function WallUrgansCard({ hideBuyRow = false }: { hideBuyRow?: boolean } = {}) {
  const { balance: total } = useCreditBalance();

  // Credits off, or no balance to speak of (no team, or it could not be read).
  if (!CREDITS_ENABLED || total === null) return null;

  const left = Math.max(0, Math.floor(total));
  if (left === 0 && !isCreditsPurchasable()) return null;
  // With nothing left, the "Try the assistant" offer under the plans (#1243)
  // already sells the credits, so this row would only repeat it.
  if (left === 0 && hideBuyRow) return null;

  // A quiet row, not a card: the plan above is the one thing this page asks for,
  // and a second boxed card with its own filled button would compete with it.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-stroke-subtle pt-5">
      <p className="text-sm text-content-secondary">
        {left > 0
          ? `Or use AI on credits. You have ${left.toLocaleString('en-US')} left.`
          : 'Or use AI on credits, and pay as you go.'}
      </p>
      <Link
        href={URGANS_HUB_PATH}
        className="motion-focus inline-flex min-h-11 items-center font-semibold text-content-primary underline underline-offset-4 hover:text-brand"
      >
        {left > 0 ? 'Open AI' : 'Get credits'}
      </Link>
    </div>
  );
}
