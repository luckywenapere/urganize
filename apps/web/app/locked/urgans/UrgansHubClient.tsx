'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { ArrowLeft } from '@/components/icons';
import { ChappiConversation } from '@/components/chappi/ChappiConversation';
import { BuyCredits } from '@/components/credits/BuyCredits';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { useAuthStore } from '@/lib/auth-store';
import { isCreditsEnabled } from '@/lib/credits/config';
import { isChappiEnabled } from '@/lib/chappi/config';

// UrgAns for a team that is behind the wall (2026-10-02).
//
// A team whose trial ended, or whose plan lapsed, can still use UrgAns and pay
// for it in credits, changes included. The dashboard routes are walled for that
// team, so UrgAns gets a home OUTSIDE them: under /locked, which the wall and the
// 402 redirect both leave alone. It holds what such a team needs and nothing
// else: its credits, the packs to buy more (the same BuyCredits the credits page
// uses, returning here after Paystack), and the assistant.
//
// WHAT RUNS HERE is the ordinary chat. The server decides what a credits-only
// team may do (it admits them past the paywall for UrgAns's own routes and lets
// the assistant act on their behalf; see app/api/_shared/urgans-access.ts), and
// it spends their credits like any other turn. Nothing on this page reaches
// further than that, so a link the assistant opens into the walled app simply
// lands back on the wall.
//
// A team that has access does not belong here: it is sent to the real page.

const CREDITS_ENABLED = isCreditsEnabled();
const CHAPPI_ENABLED = isChappiEnabled();

export default function UrgansHubClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const [ready, setReady] = useState(false);
  const { balance, account, refresh } = useCreditBalance();

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    // Both switches, or this page does not exist: nothing here works without them.
    if (!CREDITS_ENABLED || !CHAPPI_ENABLED) {
      router.replace('/locked');
      return;
    }
    setReady(true);
  }, [isAuthLoading, user, router]);

  if (!ready) return null;

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Logo />

        <header className="flex flex-col gap-2">
          <Link
            href="/locked"
            className="inline-flex w-fit items-center gap-2 text-sm text-content-secondary hover:text-content-primary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to plans
          </Link>
          <h1 className="font-display text-3xl font-semibold text-content-primary">AI</h1>
          <p className="max-w-2xl text-base leading-7 text-content-secondary">
            You can keep using AI without a plan. It runs on credits, and your rollouts are
            right where you left them.
          </p>
        </header>

        <section aria-labelledby="urgans-hub-balance" className="flex flex-col gap-4">
          <h2 id="urgans-hub-balance" className="text-base font-semibold text-content-primary">
            {balance === null
              ? 'Your AI credits'
              : `You have ${Math.max(0, Math.floor(balance))} AI ${Math.max(0, Math.floor(balance)) === 1 ? 'credit' : 'credits'}.`}
          </h2>
          <BuyCredits account={account} onPurchased={() => void refresh()} returnTo="/locked/urgans" />
        </section>

        {/* The conversation needs a definite height to scroll inside. */}
        <div className="flex h-[70dvh] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-stroke-default">
          <ChappiConversation onNewRelease={() => router.push('/locked')} />
        </div>
      </div>
    </main>
  );
}
