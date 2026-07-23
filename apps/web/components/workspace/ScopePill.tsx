'use client';

import { X } from 'lucide-react';

type ScopePillProps = {
  release: { id: string; title: string; artistName: string } | null;
  onClear: () => void;
};

export function ScopePill({ release, onClear }: ScopePillProps) {
  if (!release) return null;

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-brand/40 bg-brand/8 px-3 py-1.5 text-xs">
      <span className="text-content-secondary">Showing activities for</span>
      <span className="truncate font-semibold text-content-primary">{release.title}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Show all activities"
        title="Show all activities"
        className="motion-focus ml-1 grid h-5 w-5 shrink-0 place-items-center text-content-tertiary transition-colors hover:text-content-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
