'use client';

import {
  annualSavingCopy,
  formatTierCyclePrice,
  getTier,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';

/**
 * The pricing-v2 plan picker: pick an interval, then pick a tier.
 *
 * TWO DIMENSIONS, NOT ONE, and that is the whole reason this exists beside the
 * legacy picker rather than replacing it in place. Under the legacy plans the id
 * WAS the interval ('monthly' / 'annual'), so one radio group covered both
 * choices. A tier says who you are and the interval says how often you pay, so
 * the control has to ask twice.
 *
 * NGN only, with no currency toggle. The tier prices carry no USD figure, the
 * Paystack account offers NGN alone in plan creation, and CLAUDE.md records the
 * old toggle advertising two amounts that were not the same offer. Showing one
 * honest price beats showing a choice we cannot honour.
 *
 * A11Y: real `<input type="radio">` inside a `<label>`, the PlannerRadioGroup
 * approach, rather than the `<button role="radio">` the billing pickers have
 * used until now. Arrow-key groups, screen readers and the 44px hit target all
 * come for free, and the focus ring the hand-rolled version was missing comes
 * with the native input.
 *
 * Deliberately takes the tier list as a prop. The wall offers only the two
 * self-serve tiers, because it already carries a full-weight "Talk to us" card
 * for the sales-led one and a third radio that cannot check out would be a dead
 * end sitting next to the real path.
 */

type TierPlanPickerProps = {
  /** Which tiers to offer. Sales-led tiers do not belong here. */
  tiers: readonly PricingTierId[];
  selectedTier: PricingTierId;
  onSelectTier: (tier: PricingTierId) => void;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  disabled?: boolean;
};

const INTERVALS: readonly BillingInterval[] = ['monthly', 'annual'] as const;

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: 'Monthly',
  annual: 'Annual',
};

export function TierPlanPicker({
  tiers,
  selectedTier,
  onSelectTier,
  interval,
  onIntervalChange,
  disabled,
}: TierPlanPickerProps) {
  // Derived rather than written, so a change to ANNUAL_MONTHS_BILLED moves this
  // badge with it. Any tier with an annual price answers the same, so the first
  // one offered is enough to ask.
  const savingCopy = annualSavingCopy(tiers[0] ?? 'label');

  return (
    <div className="flex flex-col gap-4">
      {/* Interval first: it reprices every card below it, so choosing it after
          the tier would make the numbers move under the user's cursor. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.16em] text-content-tertiary">
          Billing
        </span>
        <div
          role="radiogroup"
          aria-label="Choose how often you pay"
          className="inline-flex overflow-hidden rounded-full border border-stroke-default"
        >
          {INTERVALS.map((option) => {
            const isActive = interval === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={disabled}
                onClick={() => onIntervalChange(option)}
                className={`px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  isActive
                    ? 'bg-brand text-content-inverse'
                    : 'bg-transparent text-content-secondary hover:text-content-primary'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {INTERVAL_LABEL[option]}
              </button>
            );
          })}
        </div>
      </div>

      {savingCopy && interval === 'annual' ? (
        <p className="-mt-2 text-right text-xs text-brand">{savingCopy}</p>
      ) : null}

      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="sr-only">Choose a plan</legend>
        {tiers.map((tierId) => {
          const tier = getTier(tierId);
          const isActive = selectedTier === tierId;
          const price = formatTierCyclePrice(tierId, interval);
          return (
            <label
              key={tierId}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
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
                <span className="block text-sm font-semibold text-content-primary">
                  {tier.label}
                  {tier.recommended ? (
                    <span className="ml-2 rounded-full bg-brand/12 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
                      Most teams
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-content-tertiary">{tier.audience}</span>
              </span>
              {/* Null only for a sales-led tier, which is never offered here. */}
              {price ? (
                <span className="shrink-0 text-sm font-semibold text-content-primary">
                  {price}
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
