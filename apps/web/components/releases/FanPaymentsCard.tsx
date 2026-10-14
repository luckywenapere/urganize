'use client';

import { ExternalLink } from '@/components/icons';
import { openExternalUrl } from '@/lib/external-link';
import { FAN_PAYMENTS_PARTNER } from '@/lib/fan-payments';

const SECONDARY_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center gap-2 border border-stroke-control px-4 text-sm font-semibold text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary';

/**
 * Fan payments: a second partner, beside distribution, never instead of it.
 * Fanlly is not a distributor, so this card does not depend on the check before
 * distribution and shows whatever that check says. The button opens our
 * referral link to their creator sign-up; see lib/fan-payments.ts. Nothing is
 * recorded and nothing is paid here.
 */
export function FanPaymentsCard() {
  return (
    <section
      aria-labelledby="fan-payments-heading"
      className="flex h-full flex-col border border-stroke-default bg-bg-surface p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
        Fan payments
      </p>
      <h3 id="fan-payments-heading" className="mt-1 text-base font-semibold text-content-primary">
        Get paid by fans directly
      </h3>
      <p className="mt-2 text-sm text-content-secondary">
        With {FAN_PAYMENTS_PARTNER.name}, upload a track and share one link. Fans tip you by bank
        transfer or card, with no account needed. You get paid in naira and keep{' '}
        {FAN_PAYMENTS_PARTNER.creatorSharePercent}% of every tip. It does not put your music in
        stores, so use it alongside your distributor.
      </p>
      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => void openExternalUrl(FAN_PAYMENTS_PARTNER.signupUrl)}
          className={SECONDARY_BUTTON}
        >
          Sign up with {FAN_PAYMENTS_PARTNER.name}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
