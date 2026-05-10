'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Users2 } from 'lucide-react';
import { ProgressBar } from '@/components/shared/ProgressBar';

export type ReleaseDashboardItem = {
  id: string;
  title: string;
  artistName: string;
  releaseDate: string | null;
  coverArtUrl: string | null;
  status: 'draft' | 'in_progress' | 'ready' | string;
  progress: number;
  invitedCount: number;
  submittedCount: number;
  pendingCount: number;
};

type ReleaseCardProps = {
  release: ReleaseDashboardItem;
};

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  ready: 'Ready',
  released: 'Released',
  archived: 'Archived',
};

function formatReleaseDate(value: string | null): string {
  if (!value) {
    return 'Date not set';
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date not set';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function getInitials(title: string): string {
  const words = title
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return 'UR';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function ReleaseCard({ release }: ReleaseCardProps) {
  const progress = Math.max(0, Math.min(100, Math.round(Number(release.progress || 0))));
  const normalizedStatus = statusLabel[release.status] || release.status.replace(/_/g, ' ');

  return (
    <Link
      href={`/dashboard/releases/${release.id}`}
      className="group block overflow-hidden border border-stroke-default bg-bg-surface transition-colors hover:border-stroke-strong hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="aspect-square overflow-hidden border-b border-stroke-subtle bg-bg-elevated">
        {release.coverArtUrl ? (
          <Image
            src={release.coverArtUrl}
            alt={`${release.title} cover art`}
            width={720}
            height={720}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_top_left,rgba(62,207,142,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]">
            <span className="font-display text-4xl font-semibold text-content-primary/80">
              {getInitials(release.title)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              {release.artistName || 'Unassigned artist'}
            </p>
            <span className="shrink-0 border border-stroke-default bg-white/[0.03] px-2 py-1 text-[11px] font-medium capitalize text-content-secondary">
              {normalizedStatus}
            </span>
          </div>
          <h2 className="line-clamp-2 font-display text-xl font-semibold leading-tight text-content-primary">
            {release.title}
          </h2>
        </div>

        <div className="grid gap-2 text-sm text-content-secondary">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-content-tertiary" />
            <span>{formatReleaseDate(release.releaseDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-content-tertiary" />
            <span>
              {release.invitedCount} collaborator{release.invitedCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-content-secondary">Release readiness</span>
            <span className="font-semibold text-content-primary">{progress}%</span>
          </div>
          <ProgressBar value={progress} className="h-2 rounded-none" fillClassName="rounded-none" />
        </div>
      </div>
    </Link>
  );
}
