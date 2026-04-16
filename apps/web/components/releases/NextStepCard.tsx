'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';
import type { ReadinessNextAction } from '@/lib/release-ops';

type NextStepCardProps = {
  nextStep: string;
  action: ReadinessNextAction;
  onAction: () => void;
  actionDisabled?: boolean;
};

export function NextStepCard({ nextStep, action, onAction, actionDisabled = false }: NextStepCardProps) {
  const helperText =
    action.type === 'copy_credit_link'
      ? 'Share the public credit link from this page.'
      : action.type === 'send_reminder'
        ? 'Keep collection moving from this page.'
      : action.type === 'view_metadata'
        ? 'Review structured credits before delivery.'
        : 'This release can move forward without any missing steps.';

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-brand/20 bg-brand-muted/35 p-5 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.36)] sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-brand/8 blur-3xl" />

      <div className="flex h-full flex-col justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand/20 bg-bg-surface/85 text-sm font-semibold text-content-primary">
              01
            </span>
            <div>
              <p className="text-sm font-medium text-content-primary">Next step</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-content-tertiary">
                Release directive
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusBadge
              label={action.type === 'none' ? 'Ready' : 'Action needed'}
              tone={action.type === 'none' ? 'success' : 'warning'}
              size="sm"
            />
          </div>

          <h2 className="mt-4 text-[clamp(1.95rem,3.2vw,2.6rem)] leading-[1.05] tracking-[-0.04em] text-content-primary">
            {nextStep}
          </h2>
          <p className="mt-4 max-w-[32rem] text-sm leading-6 text-content-secondary">{helperText}</p>
        </div>

        {action.type !== 'none' ? (
          <div className="rounded-[24px] border border-stroke-subtle bg-bg-surface/88 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Recommended action</p>
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="mt-4 w-full rounded-2xl bg-brand px-4 py-3.5 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {action.label}
            </button>
          </div>
        ) : (
          <div className="rounded-[24px] border border-status-success/30 bg-status-success/10 px-4 py-4 text-sm text-status-success">
            Your release is ready for distribution.
          </div>
        )}
      </div>
    </div>
  );
}
