'use client';

import { formatTierPrice, getTier, type PricingTierId } from '@urganize/pricing';

/**
 * The pricing-v2 plan picker: pick a tier.
 *
 * ONE DIMENSION SINCE 2026-09-08. This asked twice until then — a tier says who
 * you are, an interval says how often you pay — and the interval half is gone
 * because every tier is billed once a year now. The radiogroup that used to sit
 * above these cards, and the "2 months free" badge under it, went with it.
 *
 * That is not only a simplification: the annual-only spec's acceptance bar is
 * that a monthly figure appears NOWHERE, and the surest way to hold that is for
 * the control to have no way to ask for one. `formatTierPrice` takes no interval
 * for the same reason.
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

type TierPlanPickerProps = {
  /** Which tiers to offer. Sales-led tiers do not belong here. */
  tiers: readonly PricingTierId[];
  selectedTier: PricingTierId;
  onSelectTier: (tier: PricingTierId) => void;
  disabled?: boolean;
};

export function TierPlanPicker({
  tiers,
  selectedTier,
  onSelectTier,
  disabled,
}: TierPlanPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">Choose a plan</legend>
      {tiers.map((tierId) => {
        const tier = getTier(tierId);
        const isActive = selectedTier === tierId;
        const price = formatTierPrice(tierId);
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
  );
}
