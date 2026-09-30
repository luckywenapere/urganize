'use client';

import { AlertTriangle, Info, Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';
import { confirmationTone } from '@/lib/chappi/confirmation-tone';
import type { ChappiPendingConfirmation } from '@/lib/chappi/types';

type ChappiConfirmationCardProps = {
  pending: ChappiPendingConfirmation;
  onApprove: () => void;
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
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isBusy}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={danger ? 'danger' : 'primary'}
          onClick={onApprove}
          disabled={isBusy}
          isLoading={isBusy}
          leftIcon={isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {pending.confirmLabel}
        </Button>
      </div>
    </div>
  );
}
