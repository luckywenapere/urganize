'use client';

import { useState } from 'react';
import { AlertTriangle, Info, Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';
import { confirmationTone } from '@/lib/chappi/confirmation-tone';
import type { ChappiPendingConfirmation } from '@/lib/chappi/types';
import { DELETE_CONFIRM_WORD, matchesDeleteConfirmation } from '@/lib/rollout-trash';

type ChappiConfirmationCardProps = {
  pending: ChappiPendingConfirmation;
  /** `extraArgs` carries what the user typed, for cards that ask for it. */
  onApprove: (extraArgs?: Record<string, unknown>) => void;
  onCancel: () => void;
  isBusy: boolean;
};

/**
 * The permission gate, as the user sees it.
 *
 * Inline in the transcript rather than a modal on purpose: it belongs to the
 * conversation that produced it, it must survive alongside the messages above
 * it, and the assistant surfaces it lives in (dock at z-[130], side rail in
 * layout flow) sit deliberately BELOW the modal tier — a dialog here would
 * fight the modals the assistant itself can open.
 *
 * Nothing has run at the moment this renders. The proposal is inert until the
 * user clicks; see runner.ts for why the model can never skip this step.
 */
export function ChappiConfirmationCard({
  pending,
  onApprove,
  onCancel,
  isBusy,
}: ChappiConfirmationCardProps) {
  const danger = confirmationTone(pending.toolName) === 'danger';
  const typed = pending.typedConfirmation;
  const [confirmation, setConfirmation] = useState('');
  const confirmed = !typed || matchesDeleteConfirmation(confirmation, typed.phrase);

  return (
    <div
      role="group"
      aria-label="Confirm this action"
      className={`mt-4 border p-4 ${
        danger ? 'border-status-error/30 bg-status-error/5' : 'border-stroke-default bg-bg-elevated'
      }`}
    >
      <div className="flex items-start gap-3">
        {danger ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" aria-hidden="true" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold leading-snug text-content-primary">
            {pending.title}
          </p>
          {pending.detail ? (
            <p className="mt-1.5 text-sm leading-6 text-content-secondary">{pending.detail}</p>
          ) : null}
          {typed ? (
            <div className="mt-3">
              <label
                htmlFor="urgans-delete-confirmation"
                className="block text-[13px] leading-5 text-content-secondary"
              >
                Type <span className="font-mono font-bold text-content-primary">{typed.phrase}</span> or{' '}
                <span className="font-mono font-bold text-content-primary">{DELETE_CONFIRM_WORD}</span> to confirm
              </label>
              <input
                id="urgans-delete-confirmation"
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={isBusy}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={typed.phrase}
                className="mt-1.5 min-h-[44px] w-full border border-stroke-control bg-bg-base px-3 text-[15px] text-content-primary outline-none placeholder:text-content-tertiary focus:border-brand-primary"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isBusy}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={danger ? 'danger' : 'primary'}
          onClick={() => onApprove(typed ? { confirmation } : undefined)}
          disabled={isBusy || !confirmed}
          isLoading={isBusy}
          leftIcon={isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {pending.confirmLabel}
        </Button>
      </div>
    </div>
  );
}
