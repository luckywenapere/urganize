'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EMPTY_PRICING_VALIDATION_RESPONSE,
  PRICING_BAND_OPTIONS,
  PRICING_VALIDATION_COPY,
  PRICING_WILLINGNESS_OPTIONS,
  type PricingBand,
  type PricingPromptPlacement,
  type PricingValidationResponse,
  type StoredPricingValidationResponse,
} from '@/lib/pricing-validation';

type PricingValidationPromptProps = {
  placement: PricingPromptPlacement;
  variant?: 'onboarding' | 'dashboard';
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  response?: StoredPricingValidationResponse | null;
  isBusy?: boolean;
  onSkip?: () => void;
  onSubmit: (payload: PricingValidationResponse) => Promise<void> | void;
};

const getBandContextLabel = (band: PricingBand | null) => {
  if (!band) return 'No price range yet';
  return PRICING_BAND_OPTIONS.find((option) => option.value === band)?.label || 'No price range yet';
};

export function PricingValidationPrompt({
  placement,
  variant = 'dashboard',
  title,
  subtitle,
  submitLabel = 'Save response',
  response,
  isBusy = false,
  onSkip,
  onSubmit,
}: PricingValidationPromptProps) {
  const [willingness, setWillingness] = useState<PricingValidationResponse['willingness']>(response?.willingness || null);
  const [priceBand, setPriceBand] = useState<PricingBand | null>(response?.priceBand || null);
  const [notes, setNotes] = useState(response?.notes || '');

  useEffect(() => {
    setWillingness(response?.willingness || null);
    setPriceBand(response?.priceBand || null);
    setNotes(response?.notes || '');
  }, [response?.id, response?.notes, response?.priceBand, response?.willingness]);

  const copyOptions = useMemo(() => PRICING_VALIDATION_COPY.variations[placement], [placement]);
  const isCompact = variant === 'dashboard';
  const helperText =
    subtitle ||
    (placement === 'onboarding'
      ? 'You have already seen the plan value. This is the cleanest moment to test willingness to pay without interrupting sign-up.'
      : 'This helps validate monthly subscription demand without taking users out of their working context.');

  const handleSubmit = async () => {
    await onSubmit({
      ...EMPTY_PRICING_VALIDATION_RESPONSE,
      willingness,
      priceBand,
      notes,
      placement,
    });
  };

  return (
    <section className={`saas-panel ${isCompact ? 'p-5' : 'p-6 sm:p-7'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="saas-eyebrow">Pricing validation</p>
          <h3 className="saas-title mt-2">{title || 'Would you pay monthly if Urganize solved the full release stack?'}</h3>
          <p className="saas-copy mt-2">{PRICING_VALIDATION_COPY.primaryPrompt}</p>
          <p className="mt-3 text-sm text-content-secondary">{helperText}</p>
        </div>
        {response && (
          <div className="rounded-full border border-stroke-default bg-bg-elevated/85 px-3 py-1.5 text-xs font-medium text-content-secondary">
            Last updated {new Date(response.updatedAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className={`mt-5 grid gap-3 ${isCompact ? 'md:grid-cols-3' : 'md:grid-cols-3'}`}>
        {PRICING_WILLINGNESS_OPTIONS.map((option) => {
          const isSelected = willingness === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setWillingness(option.value)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                isSelected
                  ? 'border-brand/50 bg-brand-muted text-content-primary shadow-[0_16px_40px_-24px_rgba(62,207,142,0.34)]'
                  : 'border-stroke-default bg-bg-elevated/70 text-content-primary hover:border-stroke-strong hover:bg-bg-hover/70'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold">{option.label}</span>
                <span
                  className={`mt-0.5 h-4 w-4 rounded-full border ${isSelected ? 'border-brand bg-brand' : 'border-stroke-default bg-transparent'}`}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-2 text-sm text-content-secondary">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className={`mt-5 grid gap-5 ${isCompact ? 'lg:grid-cols-[1.1fr_0.9fr]' : 'lg:grid-cols-[1fr_0.95fr]'}`}>
        <div className="rounded-2xl border border-stroke-default bg-bg-elevated/55 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">What value they are reacting to</p>
          <ul className="mt-3 space-y-2 text-sm text-content-secondary">
            {PRICING_VALIDATION_COPY.supportingPoints.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand/70" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-stroke-default bg-bg-elevated/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Likely monthly price comfort</p>
              <span className="text-xs text-content-tertiary">{getBandContextLabel(priceBand)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRICING_BAND_OPTIONS.map((option) => {
                const isSelected = priceBand === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPriceBand(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      isSelected
                        ? 'border-brand/45 bg-brand-muted text-content-primary'
                        : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              What would make the product worth paying for?
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional: tell us what would make the monthly subscription feel justified."
              className="min-h-[110px] w-full rounded-2xl border border-stroke-default bg-bg-elevated/70 px-4 py-3 text-sm text-content-primary outline-none transition placeholder:text-content-quaternary focus:border-brand"
            />
          </label>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-stroke-default bg-bg-elevated/45 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Copy variations in use</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {copyOptions.map((item) => (
            <div key={item} className="rounded-2xl border border-stroke-default bg-bg-surface/80 px-4 py-3 text-sm text-content-secondary">
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isBusy || !willingness}
          className="rounded-xl border border-brand/45 bg-brand-muted px-4 py-2.5 text-sm font-semibold text-content-primary transition hover:bg-brand/20 disabled:opacity-50"
        >
          {isBusy ? 'Saving...' : submitLabel}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={isBusy}
            className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
          >
            Not now
          </button>
        )}
      </div>
    </section>
  );
}
