'use client';

import {
  SELLABLE_INTERVALS,
  annualSavingCopy,
  formatTierPrice,
  getTier,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';

/**
 * The pricing-v2 plan picker: pick a tier, and how often you pay.
 *
 * TWO DIMENSIONS AGAIN SINCE 2026-09-10. It asked once between 2026-09-08 and
 * then, while everything was billed annually; monthly went back on sale, so the
 * interval radiogroup and the "2 months free" badge came back with it.
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
  annual: 'Yearly',
};

type TierPlanPickerProps = {
  /** Which tiers to offer. Sales-led tiers do not belong here. */
  tiers: readonly PricingTierId[];
  selectedTier: PricingTierId;
  onSelectTier: (tier: PricingTierId) => void;
  selectedInterval: BillingInterval;
  onSelectInterval: (interval: BillingInterval) => void;
  disabled?: boolean;
};

export function TierPlanPicker({
  tiers,
  selectedTier,
  onSelectTier,
  selectedInterval,
  onSelectInterval,
  disabled,
}: TierPlanPickerProps) {
  // Read off the first tier that HAS a price rather than a named one: a named
  // tier that later goes sales-led returns null and silently takes the badge off
  // the picker, which is exactly how the marketing page lost it once.
  const saving = tiers.map(annualSavingCopy).find(Boolean) ?? null;

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Choose a plan</legend>

      <div className="mb-2 flex flex-col items-center gap-2">
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
        {/* Phrased as months, never a percentage — the one wording the pricing
            package allows. Derived from ANNUAL_MONTHS_BILLED. */}
        {saving && selectedInterval === 'annual' ? (
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
            {saving}
          </p>
        ) : null}
      </div>
      {tiers.map((tierId) => {
        const tier = getTier(tierId);
        const isActive = selectedTier === tierId;
        const price = formatTierPrice(tierId, selectedInterval);
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
                {/* Its own line on a phone, inline from sm: beside the wider
                    ₦25,000 price at 390px the inline badge split into "Most /
                    Teams" once it moved to Manager (2026-10-17). */}
                {tier.recommended ? (
                  <span className="mt-1 block w-fit whitespace-nowrap rounded-full sm:ml-2 sm:mt-0 sm:inline-block bg-brand/12 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
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
  );
}
