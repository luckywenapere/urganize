'use client';

import { Loader2 } from 'lucide-react';

// Variant / asPage / eyebrow are retained for backwards compatibility with
// existing call sites — the new minimal render ignores them. Linear-style
// restraint: a single spinner + the title line, no mock layout decoys.
type LoadingScreenVariant = 'shell' | 'dashboard' | 'detail' | 'form';

type LoadingScreenProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  variant?: LoadingScreenVariant;
  asPage?: boolean;
};

export function LoadingScreen({
  title = 'Loading',
  description,
  asPage = true,
}: LoadingScreenProps) {
  const content = (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2
          className="h-5 w-5 animate-spin text-content-tertiary"
          aria-hidden="true"
        />
        <p className="text-sm text-content-secondary">{title}</p>
        {description ? (
          <p className="max-w-xs text-xs text-content-tertiary">{description}</p>
        ) : null}
      </div>
    </div>
  );

  if (asPage) {
    return <main className="bg-bg-base text-content-primary">{content}</main>;
  }
  return <div className="bg-bg-base text-content-primary">{content}</div>;
}
