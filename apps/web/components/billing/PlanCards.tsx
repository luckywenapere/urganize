'use client';

import {
  SELLABLE_INTERVALS,
  getChargePrice,
  getIntroPrice,
  getTier,
  getTierPrice,
  tierFeatures,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';
import { PlanPicture } from '@/components/billing/PlanPicture';
import { Check } from '@/components/icons';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';

/**
 * The wall's plans, laid out like X's paywall (founder approved, 2026-10-26,
 * mock docs/mocks/paywall-x-layout, phone layout B).
 *
 * The eye goes: switch, then two cards whose rows line up (name, price, the line
 * under it, the button, the list), so it reads across rather than zigzagging.
 * The recommended plan carries the only filled button and the green border.
 * On a phone the cards stack with the recommended one first, so nothing hides
 * behind a swipe.
 *
 * Each card has its own button, so picking and paying are one tap.
 */

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: 'Monthly',
  semiannual: '6 months',
  annual: 'Yearly',
};

const naira = (amount: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);

/** The big figure and the line under it. Yearly shows the monthly cost big and
 *  the yearly total small, as X does. */
export function planCardPrice(
  tierId: PricingTierId,
  interval: BillingInterval,
  introMonthsLeft: number
): { figure: string; sub: string | null; was?: string } | null {
  const charge = getChargePrice(tierId, interval, introMonthsLeft);
  if (!charge) return null;
  if (interval === 'annual') {
    return { figure: naira(Math.round(charge.amount / 12)), sub: `${naira(charge.amount)} billed once a year` };
  }
  if (interval !== 'monthly') return { figure: naira(charge.amount), sub: null };
  const intro = getIntroPrice(tierId);
  const full = getTierPrice(tierId, 'monthly');
  if (intro && full && introMonthsLeft > 0 && charge.amount === intro.amount) {
    const months = introMonthsLeft === 1 ? '1 month' : `${introMonthsLeft} months`;
    // The full price, struck through above the offer (founder, Nov 2, 2026).
    return { figure: naira(intro.amount), sub: `for ${months}, then ${naira(full.amount)}`, was: `${naira(full.amount)}/month` };
  }
  return { figure: naira(charge.amount), sub: null };
}

type PlanCardsProps = {
  tiers: readonly PricingTierId[];
  selectedInterval: BillingInterval;
  onSelectInterval: (interval: BillingInterval) => void;
  introMonthsLeft: number;
  /** Called with the plan whose button was tapped. */
  onChoose: (tier: PricingTierId) => void;
  /** The plan whose checkout is opening, if any. */
  busyTier: PricingTierId | null;
  disabled?: boolean;
  buttonLabel: (tier: PricingTierId) => string;
  /** The plan the team is already on, when moving up: its button says so and
   *  does nothing. */
  currentTier?: PricingTierId | null;
};

export function PlanCards({
  tiers,
  selectedInterval,
  onSelectInterval,
  introMonthsLeft,
  onChoose,
  busyTier,
  disabled,
  buttonLabel,
  currentTier = null,
}: PlanCardsProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <div
          role="radiogroup"
          aria-label="Choose how often you pay"
          onKeyDown={(event) =>
            onRadioGroupKeyDown(event, SELLABLE_INTERVALS.indexOf(selectedInterval), (index) =>
              onSelectInterval(SELLABLE_INTERVALS[index])
            )
          }
          className="inline-flex rounded-full bg-bg-overlay p-1"
        >
          {SELLABLE_INTERVALS.map((option) => {
            const isActive = selectedInterval === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                disabled={disabled}
                onClick={() => onSelectInterval(option)}
                className={`motion-focus min-h-9 rounded-full px-5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-bg-surface text-content-primary shadow-sm'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                {INTERVAL_LABEL[option]}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`grid gap-4 ${tiers.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {tiers.map((tierId) => {
          const tier = getTier(tierId);
          const price = planCardPrice(tierId, selectedInterval, introMonthsLeft);
          const features = tierFeatures(tierId);
          // Solo has no plan below it, so its list opens with who it is for.
          const lead = features.heading.startsWith('Everything in') ? features.heading : tier.audience;
          const recommended = Boolean(tier.recommended);
          const busy = busyTier === tierId;
          const current = currentTier === tierId;
          return (
            <section
              key={tierId}
              aria-label={tier.label}
              className={`flex flex-col rounded-3xl border p-6 ${
                recommended
                  ? 'order-first border-brand bg-bg-surface shadow-[inset_0_0_0_1px_rgb(var(--color-brand))] sm:order-none'
                  : 'border-stroke-default bg-bg-elevated'
              }`}
            >
              <h2 className="flex h-6 items-center gap-2 font-sans text-[15px] font-semibold text-content-primary">
                {tier.label}
                {recommended ? (
                  <span className="whitespace-nowrap rounded-full bg-brand-muted px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
                    Most teams
                  </span>
                ) : null}
              </h2>
              {price?.was ? (
                <p className="mt-3 text-sm text-content-tertiary line-through tabular-nums">{price.was}</p>
              ) : null}
              <p className={`${price?.was ? 'mt-1' : 'mt-3.5'} flex items-baseline gap-1`}>
                <span className="text-[40px] font-bold leading-none tracking-[-0.04em] text-content-primary tabular-nums">
                  {price?.figure ?? ''}
                </span>
                <span className="text-sm text-content-secondary">/month</span>
              </p>
              {/* Always takes its line, so the buttons line up across cards. */}
              <p className="mt-1.5 min-h-5 whitespace-nowrap text-[13px] leading-5 text-content-tertiary">
                {price?.sub ?? ''}
              </p>
              <button
                type="button"
                disabled={disabled || current}
                onClick={() => onChoose(tierId)}
                className={`motion-focus mt-4 flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  recommended
                    ? 'bg-brand text-content-inverse hover:bg-brand-hover'
                    : 'border border-stroke-control text-content-primary hover:bg-bg-hover'
                }`}
              >
                {busy ? 'Opening secure checkout' : current ? 'Your plan' : buttonLabel(tierId)}
              </button>
              <PlanPicture tierId={tierId} />
              <p className="mt-6 border-b border-stroke-default pb-2.5 text-[13px] text-content-secondary">{lead}</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {features.lines.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm leading-snug text-content-primary">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
