'use client';

import {
  SELLABLE_INTERVALS,
  formatMoney,
  formatTierPrice,
  getChargePrice,
  getTierPriceUsd,
  getIntroPrice,
  getTier,
  getTierPrice,
  TIER_GROUP_LABEL,
  tierFeatures,
  tierGroupOf,
  type BillingInterval,
  type PricingCurrencyCode,
  type PricingTierId,
} from '@urganize/pricing';
import { Check } from '@/components/icons';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';

/**
 * The pricing-v2 plan picker: pick a tier, and how often you pay.
 *
 * TWO DIMENSIONS AGAIN SINCE 2026-09-10. It asked once between 2026-09-08 and
 * then, while everything was billed annually; monthly went back on sale, so the
 * interval radiogroup came back with it. No saving badge since 2026-10-26: the
 * starting price is shown as the price itself, with the full price after it.
 *
 * The interval sits ABOVE the tier cards because it reprices every one of them,
 * and asking for it afterwards would move the numbers under the reader's cursor
 * — the same ordering the marketing pricing page uses, for the same reason.
 *
 * NGN only, with no currency toggle. The tier prices carry no USD figure, the
 * Paystack account offers NGN alone in plan creation, and CLAUDE.md records the
 * old currency toggle advertising two amounts that were not the same offer.
 * Showing one honest price beats showing a choice we cannot honour.
 *
 * A11Y: real `<input type="radio">` inside a `<label>`, the PlannerRadioGroup
 * approach, rather than the `<button role="radio">` the billing pickers used
 * before. Arrow-key groups, screen readers and the 44px hit target all come for
 * free, along with the focus ring the hand-rolled version was missing.
 *
 * Deliberately takes the tier list as a prop. The wall offers only the tiers
 * this deployment can actually charge, because a radio that ends in a 500 is
 * worse than a tier the visitor never saw.
 */

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: 'Monthly',
  semiannual: '6 months',
  annual: 'Yearly',
};

const naira = (amount: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);

/** The two lines on a plan row: the price this team pays, and what follows it. */
export function planPriceLines(
  tierId: PricingTierId,
  interval: BillingInterval,
  introMonthsLeft: number,
  currency: PricingCurrencyCode = 'NGN'
): { price: string | null; sub: string | null } {
  // Dollars outside Nigeria (#1120): one fixed price, no starting price.
  if (currency === 'USD') {
    const usd = getTierPriceUsd(tierId, interval);
    if (!usd) return { price: null, sub: null };
    if (interval === 'annual') {
      return { price: formatTierPrice(tierId, 'annual', 'USD'), sub: `${formatMoney(Math.round(usd.amount / 12), 'USD')} a month` };
    }
    return { price: formatTierPrice(tierId, interval, 'USD'), sub: null };
  }
  const charge = getChargePrice(tierId, interval, introMonthsLeft);
  if (!charge) return { price: null, sub: null };
  if (interval === 'annual') {
    return { price: formatTierPrice(tierId, 'annual'), sub: `${naira(Math.round(charge.amount / 12))} a month` };
  }
  if (interval !== 'monthly') return { price: formatTierPrice(tierId, interval), sub: null };
  const intro = getIntroPrice(tierId);
  const full = getTierPrice(tierId, 'monthly');
  if (intro && full && introMonthsLeft > 0 && charge.amount === intro.amount) {
    return {
      price: `${naira(intro.amount)}/month`,
      sub: introMonthsLeft === 1 ? `first month, then ${naira(full.amount)}` : `then ${naira(full.amount)} from month ${introMonthsLeft + 1}`,
    };
  }
  return { price: `${naira(charge.amount)}/month`, sub: null };
}

/** The line under the pay button: what is charged today and after. */
export function planChargeNote(
  tierId: PricingTierId,
  interval: BillingInterval,
  introMonthsLeft: number,
  currency: PricingCurrencyCode = 'NGN'
): string | null {
  // A dollar payment covers one period and does not renew by itself yet, so
  // the note says so rather than promising a monthly charge (#1120).
  if (currency === 'USD') {
    const usd = getTierPriceUsd(tierId, interval);
    if (!usd) return null;
    const span = interval === 'annual' ? 'one year' : interval === 'monthly' ? 'one month' : '6 months';
    return `${formatMoney(usd.amount, 'USD')} for ${span}. We remind you before it ends.`;
  }
  const charge = getChargePrice(tierId, interval, introMonthsLeft);
  if (!charge) return null;
  if (interval === 'annual') return `${naira(charge.amount)} today, then once a year. Cancel any time.`;
  if (interval !== 'monthly') return null;
  const intro = getIntroPrice(tierId);
  const full = getTierPrice(tierId, 'monthly');
  if (intro && full && introMonthsLeft > 0 && charge.amount === intro.amount) {
    if (introMonthsLeft === 1) return `${naira(charge.amount)} today, then ${naira(full.amount)} every month. Cancel any time.`;
    return `${naira(charge.amount)} today, then every month. ${naira(full.amount)} a month from month ${introMonthsLeft + 1}. Cancel any time.`;
  }
  return `${naira(charge.amount)} today, then every month. Cancel any time.`;
}

type TierPlanPickerProps = {
  tiers: readonly PricingTierId[];
  selectedTier: PricingTierId;
  onSelectTier: (tier: PricingTierId) => void;
  selectedInterval: BillingInterval;
  onSelectInterval: (interval: BillingInterval) => void;
  /** Starting-price months the paying owner has left; 0 shows full prices. */
  introMonthsLeft: number;
  /** Dollars outside Nigeria (#1120). Naira when absent. */
  currency?: PricingCurrencyCode;
  disabled?: boolean;
};

export function TierPlanPicker({
  tiers,
  selectedTier,
  onSelectTier,
  selectedInterval,
  onSelectInterval,
  introMonthsLeft,
  currency = 'NGN',
  disabled,
}: TierPlanPickerProps) {
  const selected = getTier(selectedTier);
  const features = tierFeatures(selectedTier, currency, selectedInterval);
  // "Manager includes everything in Solo, and:" / "Solo includes:".
  const lead =
    features.heading === 'What you get:'
      ? `${selected.label} includes:`
      : `${selected.label} includes ${features.heading.charAt(0).toLowerCase()}${features.heading.slice(1)}`;

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Choose a plan</legend>

      <div className="mb-2 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Choose how often you pay"
          onKeyDown={(event) =>
            onRadioGroupKeyDown(event, SELLABLE_INTERVALS.indexOf(selectedInterval), (index) =>
              onSelectInterval(SELLABLE_INTERVALS[index])
            )
          }
          className="inline-flex overflow-hidden rounded-full border border-stroke-default bg-bg-elevated p-1"
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
                className={`min-h-9 rounded-full px-4 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand text-content-inverse'
                    : 'text-content-secondary hover:text-content-primary'
                } ${disabled ? 'cursor-not-allowed' : ''}`}
              >
                {INTERVAL_LABEL[option]}
              </button>
            );
          })}
        </div>
      </div>
      {tiers.map((tierId, index) => {
        const tier = getTier(tierId);
        const isActive = selectedTier === tierId;
        const { price, sub } = planPriceLines(tierId, selectedInterval, introMonthsLeft, currency);
        // Pricing v4 (2026-11-08): plans come in two groups, "Just you" and
        // "Your team", the same as the pricing page. A heading opens each group,
        // only when the list holds plans from both.
        const group = tierGroupOf(tierId);
        const showsBothGroups = new Set(tiers.map(tierGroupOf)).size > 1;
        const opensGroup = showsBothGroups && (index === 0 || tierGroupOf(tiers[index - 1]) !== group);
        return (
          <div key={tierId} className="contents">
          {opensGroup ? (
            <p className={`text-xs font-semibold text-content-secondary ${index === 0 ? '' : 'mt-2'}`}>
              {TIER_GROUP_LABEL[group]}
            </p>
          ) : null}
          <label
            className={`flex min-h-11 cursor-pointer flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg border p-4 text-left transition-colors sm:flex-nowrap ${
              isActive
                ? 'border-brand bg-brand/8'
                : 'border-stroke-default bg-bg-elevated hover:border-stroke-strong'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="tier"
              value={tierId}
              checked={isActive}
              disabled={disabled}
              onChange={() => onSelectTier(tierId)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-content-primary">
                {tier.label}
                {tier.recommended ? (
                  <span className="whitespace-nowrap rounded-full bg-brand/12 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
                    Most popular
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-xs text-content-tertiary">{tier.audience}</span>
            </span>
            {/* Under the name on a phone (where beside it the badge and the
                audience squeezed into three lines), on the right from sm. Null
                only for a sales-led tier, which is never offered here. */}
            {price ? (
              <span className="basis-full pl-7 sm:basis-auto sm:shrink-0 sm:pl-0 sm:text-right">
                <span className="block whitespace-nowrap text-sm font-semibold text-content-primary">{price}</span>
                {sub ? <span className="mt-0.5 block whitespace-nowrap text-xs text-content-tertiary">{sub}</span> : null}
              </span>
            ) : null}
          </label>
          </div>
        );
      })}

      {/* What the selected plan includes, like the pricing page's cards. */}
      <div className="mt-3 border-t border-stroke-default pt-4">
        <p className="mb-2.5 text-xs text-content-secondary">{lead}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {features.lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-content-primary">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </fieldset>
  );
}
