'use client';

import { X } from 'lucide-react';

type ScopePillProps = {
  release: { id: string; title: string; artistName: string } | null;
  onClear: () => void;
};

export function ScopePill({ release, onClear }: ScopePillProps) {
  if (!release) return null;

  return (
    <div className="inline-flex items-center gap-2 border border-brand/40 bg-brand/8 px-3 py-1.5 text-xs">
      <span className="font-semibold uppercase tracking-[0.12em] text-content-tertiary">
        Scoped to
      </span>
      <span className="truncate font-semibold text-content-primary">{release.title}</span>
      <span className="text-content-tertiary">•</span>
      <span className="truncate text-content-secondary">{release.artistName}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear release scope"
        className="ml-1 grid h-5 w-5 place-items-center text-content-tertiary transition-colors hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
