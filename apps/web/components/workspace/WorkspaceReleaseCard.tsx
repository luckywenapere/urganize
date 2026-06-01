'use client';

import type { Release } from '@/types/releases';

type WorkspaceReleaseCardProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'status' | 'releaseDate'>;
  tasksDone: number;
  tasksTotal: number;
  selected: boolean;
  onSelect: (releaseId: string) => void;
};

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  planning: 'Planning',
  in_progress: 'In progress',
  ready: 'Ready',
  released: 'Released',
  archived: 'Archived',
};

function formatReleaseDate(value: string | null): string {
  if (!value) return 'Date not set';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Date not set';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function WorkspaceReleaseCard({
  release,
  tasksDone,
  tasksTotal,
  selected,
  onSelect,
}: WorkspaceReleaseCardProps) {
  const progress = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const normalizedStatus = statusLabel[release.status] || release.status.replace(/_/g, ' ');

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(release.id)}
      className={`block w-full border bg-bg-surface px-4 py-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        selected
          ? 'border-brand bg-brand/8'
          : 'border-stroke-default hover:border-stroke-strong hover:bg-bg-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          {release.artistName || 'Unassigned artist'}
        </p>
        <span className="shrink-0 border border-stroke-default bg-white/[0.03] px-2 py-1 text-[11px] font-medium capitalize text-content-secondary">
          {normalizedStatus}
        </span>
      </div>

      <h3 className="mt-2 line-clamp-2 font-display text-lg font-semibold leading-snug text-content-primary">
        {release.title}
      </h3>

      <p className="mt-2 text-xs text-content-secondary">{formatReleaseDate(release.releaseDate)}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-content-tertiary">Progress</span>
          <span className="font-semibold text-content-primary">
            {tasksDone} of {tasksTotal} done
          </span>
        </div>
        <div className="h-1 w-full bg-bg-elevated" aria-hidden="true">
          <div
            className="h-full bg-brand transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </button>
  );
}
