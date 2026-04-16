'use client';

type AiRecoveryActionsProps = {
  message: string;
  onRetry?: () => void;
  onBack?: () => void;
  onSaveDraft?: () => void;
  retryLabel?: string;
  backLabel?: string;
  saveDraftLabel?: string;
  saveDraftBusy?: boolean;
  helperText?: string;
  className?: string;
};

export function AiRecoveryActions({
  message,
  onRetry,
  onBack,
  onSaveDraft,
  retryLabel = 'Try again',
  backLabel = 'Back to inputs',
  saveDraftLabel = 'Save draft',
  saveDraftBusy = false,
  helperText = '',
  className = '',
}: AiRecoveryActionsProps) {
  return (
    <div className={`rounded-xl border border-status-error/40 bg-status-error/10 px-4 py-3 ${className}`.trim()}>
      <p className="text-sm text-status-error">{message}</p>
      {helperText ? <p className="mt-2 text-xs text-content-secondary">{helperText}</p> : null}
      {(onRetry || onBack || onSaveDraft) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl border border-stroke-default bg-bg-elevated px-4 py-2 text-sm font-semibold text-content-primary hover:bg-bg-hover"
            >
              {retryLabel}
            </button>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              {backLabel}
            </button>
          ) : null}
          {onSaveDraft ? (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={saveDraftBusy}
              className="rounded-xl border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
            >
              {saveDraftBusy ? 'Saving...' : saveDraftLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
