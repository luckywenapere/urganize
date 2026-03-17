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

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Release Command Center</p>
          <StatusBadge label={release.status.replace('_', ' ')} tone={statusTone} />
        </div>
        <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.5rem)] tracking-tight text-content-primary">
          {release.title}
        </h1>
        <div className="mt-3 space-y-1 text-sm text-content-secondary">
          <p>
            <span className="font-medium text-content-primary">Artist:</span> {release.artistName}
          </p>
          <p>
            <span className="font-medium text-content-primary">Release date:</span>{' '}
            {release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : 'Not set'}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onAddCollaborator}
          className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          Add Collaborator
        </button>
        <Link
          href={`/dashboard/releases/${release.id}/metadata`}
          className="rounded-full border border-stroke-default bg-bg-surface px-5 py-3 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
        >
          View Metadata
        </Link>
      </div>
    </div>
  );
}
