'use client';

import type { ReadinessNextAction } from '@/lib/release-ops';

type NextStepCardProps = {
  nextStep: string;
  action: ReadinessNextAction;
  onAction: () => void;
  actionDisabled?: boolean;
};

export function NextStepCard({ nextStep, action, onAction, actionDisabled = false }: NextStepCardProps) {
  return (
    <div className="flex h-full flex-col justify-between rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.35)] sm:p-6">
      <div>
        <p className="text-sm font-medium text-content-primary">Next step</p>
        <h2 className="mt-2 text-2xl tracking-tight text-content-primary">{nextStep}</h2>
        <p className="mt-3 text-sm text-content-secondary">
          Urganize updates this directive automatically from collaborator submissions and metadata review.
        </p>
      </div>

      {action.type !== 'none' ? (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className="mt-6 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {action.label}
        </button>
      ) : (
        <div className="mt-6 rounded-[20px] border border-status-success/35 bg-status-success/10 px-4 py-4 text-sm text-status-success">
          Everything needed for this release is complete.
        </div>
      )}
    </div>
  );
}
