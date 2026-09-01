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
  /** True for a test release (NEXT_PUBLIC_FEATURE_TEST_RELEASE) — renders a
   * small "Test" tag so a practice release never reads as real work in the
   * catalog. WorkspaceView derives it from the `test_release` metadata
   * marker with the flag folded in. */
  isTest?: boolean;
  /**
   * Layout variant.
   * - 'tile' (default): stacked card — full-width square cover banner above
   *   the meta block. Right for grids and rails where the card is ~180–280px
   *   wide and the square stays a modest thumbnail.
   * - 'focused': horizontal row — fixed-size square art beside the meta.
   *   Right wherever the card is WIDE, because pinning the art to a
   *   thumbnail stops it scaling with the card and ballooning into a huge
   *   empty banner. Two callers: the centered focus card in
   *   WorkspaceDesktopFocused (its column spans most of the viewport), and
   *   the whole mobile catalog in ReleasesColumn (2026-08-07 — rows replaced
   *   capped tiles there; see that file for the full rationale).
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

/**
 * Returns null — not a placeholder string — when a release has no date, so
 * the caller can drop the line entirely (founder call, 2026-08-09). A date
 * is optional since v0.41.0, so "Date not set" was printed on every release
 * created without one: a permanent label restating an absence the card
 * already communicates by having nothing there. Setting a date is prompted
 * where it can actually be acted on (SetReleaseDateCard, in the activity
 * list), not nagged from a card that can't edit it.
 */
function formatReleaseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
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
  isTest,
  variant = 'tile',
}: WorkspaceReleaseCardProps) {
  const progress = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const normalizedStatus = statusLabel[release.status] || release.status.replace(/_/g, ' ');
  const releaseDateLabel = formatReleaseDate(release.releaseDate);

  // Shared meta block — identical content in both layouts; only the frame
  // around it changes.
  const meta = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          {release.artistName || 'Unassigned artist'}
        </p>
        {/* "Test" first when both render (a test release normally stays
            draft, so in practice this is the row's only pill): what a
            release IS outranks where it sits in the pipeline. */}
        {isTest ? (
          <span className="inline-flex shrink-0 items-center rounded-full border border-brand/30 bg-brand/10 px-2 py-1 text-[11px] font-medium text-brand">
            Test
          </span>
        ) : null}
        {/* Status pill is hidden for 'draft' (the canonical
            RELEASE_STATUS_OPTIONS default — see types/releases.ts) since
            nearly every release lives there during planning, making the
            pill universal noise. Renders only when status has moved past
            draft, so the pill becomes a meaningful signal. */}
        {release.status !== 'draft' ? (
          <span className="inline-flex shrink-0 items-center rounded-full border border-stroke-default bg-bg-elevated px-2 py-1 text-[11px] font-medium capitalize text-content-secondary">
            {normalizedStatus}
          </span>
        ) : null}
      </div>

      {/* One size at every breakpoint (2026-08-07). This used to be
          `text-base sm:text-lg`, which gave the SMALLEST title to the
          NARROWEST screen — backwards. The phone row is now the widest text
          column a title ever gets; `line-clamp-2` handles the desktop grid's
          220-280px tracks. */}
      <h3 className="mt-2 line-clamp-2 font-display text-lg font-semibold leading-snug text-content-primary">
        {release.title}
      </h3>

      {releaseDateLabel ? (
        <p className="mt-2 text-xs text-content-secondary">{releaseDateLabel}</p>
      ) : null}

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-content-tertiary">Motion</span>
          <span className="font-mono font-semibold text-content-primary">
            {tasksDone} of {tasksTotal} done
          </span>
        </div>
        {/* Track uses stroke-strong + rounded-full, not the plain-rectangle
            bg-bg-elevated this card had (2026-08-04, founder contrast fix) —
            see WorkspaceView.tsx's mobile Motion tracker for the full
            rationale; standardized to match the other two Motion bars. */}
        <div className="h-1.5 w-full rounded-full bg-stroke-strong" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </>
  );

  // `motion-lift` is the utility globals.css reserves for cards/surfaces
  // (a 1px hover rise) — declared there but unused until now. `motion-press`
  // is deliberately NOT used: that same block documents it as buttons and
  // small controls only. Touch gets `active:bg-bg-hover` instead, which is
  // the press cue that reads correctly on a full-width row where a scale
  // transform would look like the whole list flinching.
  const frameClass = `group motion-focus motion-lift block w-full overflow-hidden rounded-xl border bg-bg-surface text-left transition-colors ${
    selected
      ? 'border-brand bg-brand/8'
      : 'border-stroke-default hover:border-stroke-strong hover:bg-bg-hover active:bg-bg-hover'
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
            // Tiles only render in the desktop grid now (auto-fit 220-280px
            // tracks) — mobile switched to the `focused` row in 2026-08-07.
            // The old value claimed 100vw below 768px and over-fetched on
            // every phone.
            sizes="280px"
          />
        ) : (
          <DefaultCoverArt markClassName="w-14 sm:w-16" />
        )}
      </div>

      <div className="px-4 py-4">{meta}</div>
    </button>
  );
}
