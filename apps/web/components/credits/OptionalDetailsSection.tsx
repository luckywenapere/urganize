'use client';

import { ReactNode } from 'react';

type OptionalDetailsSectionProps = {
  open: boolean;
  hasValues?: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function OptionalDetailsSection({
  open,
  hasValues = false,
  onToggle,
  children,
}: OptionalDetailsSectionProps) {
  return (
    <div className="rounded-[26px] border border-dashed border-stroke-default/90 bg-bg-elevated/45 p-4 sm:p-5">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between gap-4 rounded-[20px] border border-stroke-subtle bg-bg-surface/75 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-content-primary">Additional details (optional)</p>
          <p className="mt-1 text-sm text-content-secondary">Only add these if they matter for this release.</p>
        </div>
        <span className="shrink-0 rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs font-medium text-content-secondary">
          {open ? 'Hide' : hasValues ? 'Added' : 'Show'}
        </span>
      </button>

      {open ? <div className="mt-4 space-y-4">{children}</div> : null}
    </div>
  );
}
