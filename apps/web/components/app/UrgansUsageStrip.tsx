'use client';

import Link from 'next/link';
import { creditsLeftLine, creditsNextLine } from '@/lib/credits/copy';
import { isCreditsPurchasable } from '@/lib/credits/config';
import { useUrgansUsage } from './useUrgansUsage';

// The assistant-usage indicator. One calm line above the topbar once a team has
// spent 80% of its monthly UrgAns actions, or once its credits run low, and
// nothing at all before that. The number comes from useUrgansUsage, which the
// credits line under the chat box shares, so the two never disagree.
//
// SAME CONTRACT AS TeamTrialStrip, deliberately, because it occupies the same
// slot and the reasoning transfers wholesale: above the topbar rather than in it
// (the right cluster's width budget already overflows a 375px phone), calm (it
// states a number and does not escalate, redden or carry a warning icon), and
// NOT dismissible (dismissing hides the one thing that stops the ceiling being a
// surprise, which is the entire purpose).

export function UrgansUsageStrip() {
  const usage = useUrgansUsage();


  // Credits replace the action count. Calm, like the line below: it says how many
  // are left and, for a subscriber, when the next monthly credits arrive (credits
  // never expire, so nothing "comes back"), and it stays quiet until they run low.
  if (usage?.credits) {
    if (!usage.credits.low) return null;
    const credits = Math.max(0, usage.credits.total);
    return (
      <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
        <p className="text-sm text-content-secondary">
          <span className="font-medium text-content-primary">{creditsLeftLine(credits)}</span>{' '}
          {creditsNextLine(credits, { account: usage.credits.account, nextGrantAt: usage.credits.nextGrantAt })}
        </p>
        <Link
          href="/dashboard/credits"
          className="shrink-0 text-sm font-medium text-content-secondary underline-offset-4 hover:underline"
        >
          {isCreditsPurchasable() ? 'Buy credits' : 'History'}
        </Link>
        <Link
          href="/locked?intent=upgrade&need=urgans_monthly_actions"
          className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          See plans
        </Link>
      </div>
    );
  }

  if (!usage || usage.limit === null || !usage.approaching) return null;

  const left = Math.max(0, usage.limit - usage.used);
  const atCeiling = left === 0;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center">
      <p className="text-sm text-content-secondary">
        <span className="font-medium text-content-primary">
          {atCeiling
            ? 'You have used this month’s AI actions.'
            : `AI: ${left} ${left === 1 ? 'action' : 'actions'} left this month.`}
        </span>{' '}
        {atCeiling
          ? 'Quick commands still work, and your actions reset on your billing day.'
          : 'They reset on your billing day.'}
      </p>
      <Link
        href="/locked?intent=upgrade&need=urgans_monthly_actions"
        className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        See plans
      </Link>
    </div>
  );
}
