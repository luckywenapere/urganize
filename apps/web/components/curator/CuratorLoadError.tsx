'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Why a curator surface could not load, plus a way to try again.
 *
 * Exists because these pages used to fail silently: the store recorded a 403 in
 * a flag nothing read, so a failed load rendered an empty form with no message
 * and no retry. A playlist owner then has nothing to report but "it doesn't
 * work", which is exactly how this reached us.
 *
 * Two shapes, because the two situations are genuinely different:
 *  - `variant="blocking"` when there is nothing to show. This replaces the
 *    surface.
 *  - `variant="banner"` when stale or cached data IS on screen. The data stays
 *    usable and this sits above it, because hiding readable content behind an
 *    error is worse than showing it with a warning.
 */
export function CuratorLoadError({
  message,
  onRetry,
  isRetrying = false,
  variant = 'blocking',
}: {
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
  variant?: 'blocking' | 'banner';
}) {
  if (!message) return null;

  const isBanner = variant === 'banner';

  return (
    <div
      role="alert"
      className={`rounded-xl border p-4 ${
        isBanner
          ? 'border-status-warning/30 bg-status-warning/5'
          : 'border-status-error/30 bg-status-error/5'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            isBanner ? 'text-status-warning' : 'text-status-error'
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-content-primary">
            {isBanner ? 'This may be out of date.' : 'We could not load this.'}
          </p>
          <p className="mt-1 text-xs text-content-secondary">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="motion-focus motion-press mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-stroke-default bg-bg-elevated px-3.5 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isRetrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      </div>
    </div>
  );
}
