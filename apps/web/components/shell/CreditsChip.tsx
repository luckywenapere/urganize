'use client';

import Link from 'next/link';
import { Sparkles } from '@/components/icons';
import { useUrgansUsage } from '@/components/app/useUrgansUsage';

/**
 * The quiet credits chip (founder call, 2026-10-04): "N credits" beside the
 * avatar, detail one tap away on the credit history page. Money stays calm until
 * it matters: the chip only warms to a warning tone when the balance is low.
 *
 * Renders nothing while the balance is unknown or credits are switched off, so
 * an account that never sees credits never sees an empty chip either.
 */
export function CreditsChip() {
  const usage = useUrgansUsage();
  const credits = usage?.credits;
  if (!credits) return null;

  const total = Math.max(0, Math.floor(credits.total));
  const label = `${total.toLocaleString('en')} ${total === 1 ? 'credit' : 'credits'}`;

  return (
    <Link
      href="/dashboard/credits"
      aria-label={`${label} left. Open credit history`}
      title="Credit history"
      data-tour="shell-credits"
      className={`motion-focus motion-press hidden h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium tabular-nums sm:inline-flex ${
        credits.low
          ? 'border-status-warning/40 bg-status-warning/10 text-status-warning'
          : 'border-stroke-default bg-bg-surface/70 text-content-secondary hover:text-content-primary'
      }`}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="xl:hidden">{total.toLocaleString('en')}</span>
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}
