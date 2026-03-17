'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/shared/StatusBadge';

type ReleaseHeaderProps = {
  release: {
    id: string;
    title: string;
    artistName: string;
    releaseDate: string;
    status: string;
  };
  onAddCollaborator: () => void;
};

export function ReleaseHeader({ release, onAddCollaborator }: ReleaseHeaderProps) {
  const statusTone = release.status === 'ready' ? 'success' : release.status === 'in_progress' ? 'warning' : 'neutral';
  const releaseDateLabel = release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : 'Not set';

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Release Command Center</p>
          <StatusBadge label={release.status.replace('_', ' ')} tone={statusTone} />
        </div>
        <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.5rem)] tracking-tight text-content-primary">
          {release.title}
        </h1>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Artist</p>
            <p className="mt-2 text-base font-semibold text-content-primary">{release.artistName || 'Not set'}</p>
          </div>
          <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Release date</p>
            <p className="mt-2 text-base font-semibold text-content-primary">{releaseDateLabel}</p>
          </div>
        </div>
      </div>

      <div className="w-full shrink-0 rounded-[24px] border border-stroke-subtle bg-bg-elevated/65 p-4 lg:w-[240px]">
        <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Actions</p>
        <div className="mt-3 flex flex-col gap-3">
          <button
            type="button"
            onClick={onAddCollaborator}
            className="min-h-11 w-full rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Add Collaborator
          </button>
          <Link
            href={`/dashboard/releases/${release.id}/metadata`}
            className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
          >
            View Metadata
          </Link>
        </div>
      </div>
    </div>
  );
}
