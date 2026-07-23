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
  /**
   * Layout variant.
   * - 'tile' (default): stacked card — full-width square cover banner above
   *   the meta block. Right for grids and rails where the card is ~180–280px
   *   wide and the square stays a modest thumbnail.
   * - 'focused': compact horizontal header — fixed-size square art beside the
   *   meta. Used for the centered focus card in WorkspaceDesktopFocused,
   *   whose column spans most of the viewport; a full-width square there
   *   ballooned into a huge empty banner (the art scales with card width),
   *   so the focused card pins the art to a thumbnail instead.
   */
  variant?: 'tile' | 'focused';
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

/**
 * Default cover art for releases with no artwork (founder call, 2026-07-23):
 * the Urganize "U" mark (the upside-down headphones), quietly centered on
 * the elevated panel. The PNG is white-on-transparent — correct on dark;
 * the shared `.app-wordmark` rule inverts it in light mode, so the mark
 * follows the theme like the rest of the chrome. Render-time only: nothing
 * is written to releases, so it covers every existing and future release
 * automatically, and real artwork takes over the moment it's uploaded.
 */
function DefaultCoverArt({ markClassName }: { markClassName: string }) {
  return (
    <div className="grid h-full w-full place-items-center bg-bg-elevated" aria-hidden="true">
      <Image
        src="/images/urganize-mark.png"
        alt=""
        width={161}
        height={173}
        className={`app-wordmark h-auto opacity-35 ${markClassName}`}
      />
    </div>
  );
}

export function WorkspaceReleaseCard({
  release,
  tasksDone,
  tasksTotal,
  selected,
  onSelect,
  coverArtUrl,
  variant = 'tile',
}: WorkspaceReleaseCardProps) {
  const progress = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const normalizedStatus = statusLabel[release.status] || release.status.replace(/_/g, ' ');

  // Shared meta block — identical content in both layouts; only the frame
  // around it changes.
  const meta = (
    <>
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
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-elevated px-2 py-1 text-[11px] font-medium capitalize text-content-secondary">
            {normalizedStatus}
            <span className="rounded-full bg-brand/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-brand">Beta</span>
          </span>
        ) : null}
      </div>

      <h3 className="mt-2 line-clamp-2 font-display text-base font-semibold leading-snug text-content-primary sm:text-lg">
        {release.title}
      </h3>

      <p className="mt-2 text-xs text-content-secondary">
        {formatReleaseDate(release.releaseDate)}
      </p>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-content-tertiary">Motion</span>
          <span className="font-mono font-semibold text-content-primary">
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
    </>
  );

  const frameClass = `group motion-focus block w-full overflow-hidden rounded-xl border bg-bg-surface text-left transition-colors ${
    selected
      ? 'border-brand bg-brand/8'
      : 'border-stroke-default hover:border-stroke-strong hover:bg-bg-hover'
  }`;

  if (variant === 'focused') {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(release.id)}
        className={frameClass}
      >
        {/* Horizontal header: fixed square art thumbnail beside the meta.
            The thumbnail matches the meta block's natural height (~9rem),
            so the card reads as a slim listing row instead of a banner. */}
        <div className="flex items-stretch">
          <div className="relative w-28 shrink-0 self-stretch overflow-hidden border-r border-stroke-subtle bg-bg-elevated sm:w-36">
            {coverArtUrl ? (
              <Image
                src={coverArtUrl}
                alt={`${release.title} cover art`}
                fill
                className="object-cover transition-transform duration-slow ease-out group-hover:scale-[1.02]"
                sizes="144px"
              />
            ) : (
              <DefaultCoverArt markClassName="w-10 sm:w-12" />
            )}
          </div>
          <div className="min-w-0 flex-1 px-4 py-4">{meta}</div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(release.id)}
      className={frameClass}
    >
      {/* Cover-art banner — same aspect-square + next/image pattern the
          previous grid ReleaseCard used. Releases without artwork show the
          Urganize "U" mark as default cover art (founder call, 2026-07-23 —
          replaces the earlier empty muted panel). */}
      <div className="aspect-square overflow-hidden border-b border-stroke-subtle bg-bg-elevated">
        {coverArtUrl ? (
          <Image
            src={coverArtUrl}
            alt={`${release.title} cover art`}
            width={720}
            height={720}
            className="h-full w-full object-cover transition-transform duration-slow ease-out group-hover:scale-[1.02]"
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
          />
        ) : (
          <DefaultCoverArt markClassName="w-14 sm:w-16" />
        )}
      </div>

      <div className="px-4 py-4">{meta}</div>
    </button>
  );
}
