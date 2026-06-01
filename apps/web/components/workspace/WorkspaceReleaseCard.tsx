'use client';

import Image from 'next/image';
import type { Release } from '@/types/releases';

type WorkspaceReleaseCardProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'status' | 'releaseDate'>;
  tasksDone: number;
  tasksTotal: number;
  selected: boolean;
  onSelect: (releaseId: string) => void;
  /** Signed URL for the cover art (Phase 3 source of truth, resolved server-side
   * via lib/cover-art.ts). Null/undefined → neutral placeholder. */
  coverArtUrl?: string | null;
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
  coverArtUrl,
}: WorkspaceReleaseCardProps) {
  const progress = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const normalizedStatus = statusLabel[release.status] || release.status.replace(/_/g, ' ');

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(release.id)}
      className={`group block w-full overflow-hidden border bg-bg-surface text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        selected
          ? 'border-brand bg-brand/8'
          : 'border-stroke-default hover:border-stroke-strong hover:bg-bg-hover'
      }`}
    >
      {/* Cover-art banner — same aspect-square + next/image pattern the
          previous grid ReleaseCard used. Neutral placeholder when null
          (per spec: muted surface-toned panel, no letter monogram). */}
      <div className="aspect-square overflow-hidden border-b border-stroke-subtle bg-bg-elevated">
        {coverArtUrl ? (
          <Image
            src={coverArtUrl}
            alt={`${release.title} cover art`}
            width={720}
            height={720}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
          />
        ) : (
          <div className="h-full w-full bg-bg-elevated" aria-hidden="true" />
        )}
      </div>

      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {release.artistName || 'Unassigned artist'}
          </p>
          {/* Status pill is hidden for 'draft' (the canonical
              RELEASE_STATUS_OPTIONS default — see types/releases.ts) since
              nearly every release lives there during planning, making the
              pill universal noise. Renders only when status has moved past
              draft, so the pill becomes a meaningful signal. */}
          {release.status !== 'draft' ? (
            <span className="shrink-0 border border-stroke-default bg-white/[0.03] px-2 py-1 text-[11px] font-medium capitalize text-content-secondary">
              {normalizedStatus}
            </span>
          ) : null}
        </div>

        <h3 className="mt-2 line-clamp-2 font-display text-lg font-semibold leading-snug text-content-primary">
          {release.title}
        </h3>

        <p className="mt-2 text-xs text-content-secondary">
          {formatReleaseDate(release.releaseDate)}
        </p>

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
      </div>
    </button>
  );
}
