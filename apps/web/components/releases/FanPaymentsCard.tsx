'use client';

import { ExternalLink } from '@/components/icons';
import { openExternalUrl } from '@/lib/external-link';
import { FAN_PAYMENTS_PARTNER } from '@/lib/fan-payments';
import { PartnerLogo } from './PartnerLogo';

const SECONDARY_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center gap-2 border border-stroke-control px-4 text-sm font-semibold text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary';

/**
 * Fan payments: a second partner, beside distribution, never instead of it.
 * Logo, eyebrow and button only (founder, 2026-10-14: "just put their logos").
 * Fanlly is not a distributor, so this card does not depend on the check before
 * distribution and shows whatever that check says. The button opens our
 * referral link to their creator sign-up; see lib/fan-payments.ts. Nothing is
 * recorded and nothing is paid here.
 */
export function FanPaymentsCard() {
  return (
    <section
      aria-label={FAN_PAYMENTS_PARTNER.name}
      className="flex h-full flex-col border border-stroke-default bg-bg-surface p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
        Fan payments
      </p>
      <PartnerLogo src="/partners/fanlly.svg" alt={FAN_PAYMENTS_PARTNER.name} />
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
