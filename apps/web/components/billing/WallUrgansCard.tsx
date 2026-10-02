'use client';

import Link from 'next/link';
import { Card } from '@urganize/ui';
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

export function WallUrgansCard() {
  const { balance: total } = useCreditBalance();

  // Credits off, or no balance to speak of (no team, or it could not be read).
  if (!CREDITS_ENABLED || total === null) return null;

  const left = Math.max(0, Math.floor(total));
  if (left === 0 && !isCreditsPurchasable()) return null;

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-content-primary">UrgAns is still here</h2>
        <p className="mt-1 text-sm text-content-secondary">
          {left > 0
            ? `You have ${left.toLocaleString('en-US')} ${left === 1 ? 'credit' : 'credits'}. Use UrgAns to run your rollouts, and pay as you go.`
            : 'You are out of credits. Buy more to use UrgAns, and pay as you go.'}
        </p>
      </div>
      <Link
        href={URGANS_HUB_PATH}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
      >
        {left > 0 ? 'Open UrgAns' : 'Get credits'}
      </Link>
    </Card>
  );
}
