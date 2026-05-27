'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import {
  ARTIST_SCALE_OPTIONS,
  DISTRIBUTOR_TYPE_OPTIONS,
  MARKETING_BUDGET_OPTIONS,
  type ArtistScale,
  type DistributorType,
  type MarketingBudget,
  type ReleaseContext,
  type TailoringResponse,
} from '@/lib/release-tailoring';

type TailorResult = {
  tasks_removed: number;
  tasks_modified: number;
  ai_response: TailoringResponse;
};

type TailorPlanModalProps = {
  open: boolean;
  releaseId: string;
  initialContext: ReleaseContext | null;
  onClose: () => void;
  onTailored: (result: TailorResult, context: ReleaseContext) => void;
};

type View = 'form' | 'submitting' | 'result';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-content-primary">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`inline-flex h-9 items-center border px-3 text-sm font-medium transition-colors ${
                selected
                  ? 'border-brand bg-brand/15 text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-content-primary'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TailorPlanModal({
  open,
  releaseId,
  initialContext,
  onClose,
  onTailored,
}: TailorPlanModalProps) {
  const [artistScale, setArtistScale] = useState<ArtistScale>('emerging');
  const [marketingBudget, setMarketingBudget] = useState<MarketingBudget>('standard');
  const [distributorType, setDistributorType] = useState<DistributorType>('indie_distributor');
  const [targetAudience, setTargetAudience] = useState('');
  const [specialConsiderations, setSpecialConsiderations] = useState('');
  const [view, setView] = useState<View>('form');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TailorResult | null>(null);

  // Pre-fill from saved context whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setView('form');
    setError('');
    setResult(null);
    if (initialContext) {
      setArtistScale(initialContext.artist_scale);
      setMarketingBudget(initialContext.marketing_budget);
      setDistributorType(initialContext.distributor_type);
      setTargetAudience(initialContext.target_audience || '');
      setSpecialConsiderations(initialContext.special_considerations || '');
    }
  }, [open, initialContext]);

  if (!open) {
    return null;
  }

  const isSubmitting = view === 'submitting';

  const handleSubmit = async () => {
    setView('submitting');
    setError('');

    const context: ReleaseContext = {
      artist_scale: artistScale,
      marketing_budget: marketingBudget,
      distributor_type: distributorType,
      ...(targetAudience.trim() ? { target_audience: targetAudience.trim() } : {}),
      ...(specialConsiderations.trim() ? { special_considerations: specialConsiderations.trim() } : {}),
    };

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }
      const response = await fetch(`/api/releases/${releaseId}/tailor-plan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<TailorResult> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Tailoring failed.');
      }
      const tailorResult: TailorResult = {
        tasks_removed: payload.tasks_removed ?? 0,
        tasks_modified: payload.tasks_modified ?? 0,
        ai_response: payload.ai_response as TailoringResponse,
      };
      setResult(tailorResult);
      setView('result');
      onTailored(tailorResult, context);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tailoring failed.');
      setView('form');
    }
  };

  return (
    <div className="fixed inset-0 z-[220] overflow-y-auto bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8" role="presentation">
      <button
        type="button"
        aria-label="Close tailor plan modal"
        className="fixed inset-0 cursor-default"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tailor-plan-title"
        className="relative mx-auto flex min-h-full w-full max-w-2xl items-center"
      >
        <div className="relative w-full border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgba(0,0,0,0.76)]">
          <div className="flex items-start justify-between gap-4 border-b border-stroke-subtle p-4 sm:p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                <Sparkles className="h-3.5 w-3.5" />
                AI rollout planner
              </p>
              <h2 id="tailor-plan-title" className="mt-2 font-display text-2xl font-semibold text-content-primary">
                Tailor plan
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-content-secondary">
                Answer a few questions about this release. The planner trims tasks that don&apos;t apply
                and tunes content cadence. Your full plan stays intact until you confirm.
              </p>
            </div>
            <IconButton
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close modal"
              className="shrink-0 border-stroke-default bg-white/[0.02]"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          {view === 'result' && result ? (
            <div className="space-y-4 p-4 sm:p-5">
              <div className="border border-brand/25 bg-brand/10 p-4">
                <p className="text-sm font-semibold text-content-primary">
                  Plan tailored: {result.tasks_removed} task{result.tasks_removed === 1 ? '' : 's'} removed,{' '}
                  {result.tasks_modified} updated
                </p>
                {result.ai_response?.rationale ? (
                  <p className="mt-2 text-sm leading-6 text-content-secondary">{result.ai_response.rationale}</p>
                ) : null}
              </div>

              {result.ai_response?.modify_tasks?.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                    Updated descriptions
                  </p>
                  <ul className="mt-2 space-y-2">
                    {result.ai_response.modify_tasks.map((mod) => (
                      <li key={mod.id} className="border border-stroke-default bg-bg-elevated/50 p-3 text-sm text-content-secondary">
                        {mod.new_description}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-5 p-4 sm:p-5">
                <OptionGroup
                  label="Artist scale"
                  value={artistScale}
                  options={ARTIST_SCALE_OPTIONS}
                  onChange={setArtistScale}
                  disabled={isSubmitting}
                />
                <OptionGroup
                  label="Marketing budget"
                  value={marketingBudget}
                  options={MARKETING_BUDGET_OPTIONS}
                  onChange={setMarketingBudget}
                  disabled={isSubmitting}
                />
                <OptionGroup
                  label="Distributor type"
                  value={distributorType}
                  options={DISTRIBUTOR_TYPE_OPTIONS}
                  onChange={setDistributorType}
                  disabled={isSubmitting}
                />

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-content-primary">
                    Target audience <span className="text-content-tertiary">(optional)</span>
                  </span>
                  <textarea
                    value={targetAudience}
                    onChange={(event) => setTargetAudience(event.target.value)}
                    disabled={isSubmitting}
                    rows={2}
                    maxLength={400}
                    className="input min-h-16 resize-none rounded-none border-stroke-default bg-bg-elevated"
                    placeholder="Who is this release for? e.g. afrobeats fans in Lagos, 18-30"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-content-primary">
                    Special considerations <span className="text-content-tertiary">(optional)</span>
                  </span>
                  <textarea
                    value={specialConsiderations}
                    onChange={(event) => setSpecialConsiderations(event.target.value)}
                    disabled={isSubmitting}
                    rows={2}
                    maxLength={600}
                    className="input min-h-16 resize-none rounded-none border-stroke-default bg-bg-elevated"
                    placeholder="Anything unusual about this release we should know?"
                  />
                </label>
              </div>

              {error ? (
                <div className="mx-4 mb-4 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-end sm:p-5">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                  leftIcon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                >
                  {isSubmitting ? 'Tailoring…' : 'Tailor plan'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
