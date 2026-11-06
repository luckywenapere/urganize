'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronRight, Disc3, Plus } from '@/components/icons';
import { initialsFor } from '@/lib/swipe-nav';
import { useAuthStore } from '@/lib/auth-store';
import { artistsList, describeDaysToGo, type ArtistListRow, type ArtistStatus } from '@/lib/artists-list';
import { artistHref, isArtistPageEnabled, releaseHref } from '@/lib/artist-page';
import { lagosToday } from '@/lib/next-records';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import type { ExecutionRelease } from '@/lib/execution-types';
import { displayReleaseTitle } from '@/types/releases';
import { useTaskStore } from '@/stores/useTaskStore';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { DuplicateArtistsPrompt } from '@/components/artists/DuplicateArtistsPrompt';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { HomeBell } from '@/components/home/v2/HomeBell';
import { EMPTY_STATE_ACTION_CLASS } from '@/components/shared/EmptyState';
import { PlanLoopDemo } from '@/components/artists/PlanLoopDemo';
import { OutNowCards } from '@/components/home/OutNowCards';
import { StreamingLinkPrompt } from '@/components/artists/StreamingLinkPrompt';
import { useShellStore } from '@/stores/useShellStore';
import { useRoleViewViewer } from '@/components/shell/useShellAreas';
import { artistHomeId } from '@/lib/artist-home';
import ArtistPageClient from '@/app/dashboard/[artistId]/ArtistPageClient';

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

export default function ArtistsPageClient({
  swipe = false,
  active = true,
}: { swipe?: boolean; active?: boolean } = {}) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);

  const artists = useArtistRosterStore((state) => state.artists);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const setArtistPhoto = useArtistRosterStore((state) => state.setArtistPhoto);
  const releases = useReleaseStore((state) => state.releases);
  // The phone pager mounts every tab at once, so the duplicate-artist popup
  // waits until Artists is first opened, then stays mounted so closing it
  // holds until the next visit (#865).
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  useEffect(() => {
    // A direct link followed while the flag is off goes back to the catalogue.
    // The flag is inlined at build time, so there is no server-side gate.
    if (!ARTIST_PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadRoster();
    void loadCommandCenter();
  }, [loadRoster, loadCommandCenter, router]);

  const tasks = useTaskStore((state) => state.tasks);
  const today = lagosToday();
  const list = useMemo(
    () => artistsList({ artists, releases, tasks, today }),
    [artists, releases, tasks, today]
  );

  const viewer = useRoleViewViewer();
  const ownArtistId = rosterLoaded ? artistHomeId(viewer, artists) : null;

  if (!ARTIST_PAGE_ENABLED) return null;

  // The artist sees their own page as Home, not a list of one (2026-11-01).
  if (ownArtistId) {
    return (
      <>
        <ArtistPageClient artistId={ownArtistId} home />
        {opened ? <DuplicateArtistsPrompt /> : null}
      </>
    );
  }

  const loading = (authLoading || !rosterLoaded) && artists.length === 0;

  if (swipe) {
    return (
      <>
        <SwipeArtists loading={loading} list={list} />
        {opened ? <DuplicateArtistsPrompt /> : null}
        {opened ? <StreamingLinkPrompt /> : null}
      </>
    );
  }

  return (
    <div>
      <DuplicateArtistsPrompt />
      <StreamingLinkPrompt />
      {/* The section's content top: the same spacer CatalogueView draws, and
          nothing else above the list, so both tabs start 20px under the tab
          row (tab jump fix, Oct 18, 2026; lib/section-content-top-guard). */}
      <div className="pt-5 sm:pt-6" />

      {loading ? (
        // The list's own shape (tab jump fix, Oct 18, 2026): one card, three
        // 64px rows with the face and the name, so nothing moves when it lands.
        <div
          className="overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface"
          aria-busy="true"
        >
          <ul className="divide-y divide-stroke-subtle">
            {[0, 1, 2].map((key) => (
              <li key={key} className="flex h-16 items-center gap-4 pl-5 pr-5">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-hover" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-4 w-32 animate-pulse rounded bg-bg-hover" />
                  <span className="block h-3 w-16 animate-pulse rounded bg-bg-hover md:hidden" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : list.rows.length === 0 ? (
        <ArtistsEmpty />
      ) : (
        <div className="section-list-enter">
          {/* Songs out this week sit above everything (#1086). */}
          <OutNowCards className="mb-4" />
          {list.spotlight ? <Spotlight row={list.spotlight} /> : null}
          <div className={`${list.spotlight ? 'mt-4 ' : ''}overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface`}>
            {/* The tracklist (#878, mock docs/mocks/artists-list, B): who, what
                is next, when it drops, what needs doing. Header text lines up
                with the names and titles, not the faces and covers. */}
            <div className={`hidden ${ROW_GRID} border-b border-stroke-subtle py-3 pl-[4.75rem] pr-5 text-xs font-medium text-content-tertiary md:grid`}>
              <span>Artist</span>
              <span className="pl-14">Next rollout</span>
              <span>Drops</span>
              <span>Tasks</span>
              <span />
            </div>
            <ul className="divide-y divide-stroke-subtle">
              {list.rows.map((row) => (
                <ArtistRow key={row.artist.id} row={row} setArtistPhoto={setArtistPhoto} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** The first page a new team sees (#969): the one action that fills it, and
 *  beside it a short loop of what comes next, a release planned in UrgAns
 *  (#1007; it replaced the faded list here, which stays on other pages). */
function ArtistsEmpty() {
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  return (
    <section className="mx-auto grid max-w-xl items-center gap-8 py-6 sm:py-10 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12">
      <div className="text-center lg:text-left">
        <h2 className="text-balance font-display text-[24px] font-normal leading-[1.25] text-content-primary sm:text-[28px]">
          No artists yet.
        </h2>
        <p className="mt-2 text-pretty text-[14px] leading-normal text-content-secondary">
          Add the first and their rollouts show here.
        </p>
        <div className="mt-5 flex justify-center lg:justify-start">
          <button
            type="button"
            onClick={() => openAddArtist()}
            className={EMPTY_STATE_ACTION_CLASS}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add artist
          </button>
        </div>
      </div>
      <PlanLoopDemo className="mx-auto w-full max-w-[440px]" />
    </section>
  );
}

type RosterArtist = { id: string; name: string; photoUrl?: string | null };
type ListRow = ArtistListRow<RosterArtist, ExecutionRelease>;
type ArtistsListData = { rows: ListRow[]; spotlight: ListRow | null };

// Who, next rollout, drops, tasks, arrow (#878).
const ROW_GRID = 'grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_9.5rem_1rem] gap-4';

const STATUS_WORD: Record<ArtistStatus, string> = {
  rolling_out: 'Rolling out',
  out_now: 'Out now',
  quiet: 'Quiet',
};

const typeLabel = (release: ExecutionRelease) =>
  release.releaseType === 'ep' ? 'EP' : release.releaseType === 'album' ? 'Album' : 'Single';

/** "Fri 7 Nov", read as a local date like the artist page does. */
function shortDay(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(parsed)
    .replace(',', '');
}

const percent = (row: ListRow) => (row.total > 0 ? Math.round((row.done / row.total) * 100) : 0);

/** A rollout's cover; a flat tile with a disc when it has none (never a
 *  gradient); a dashed + when there is no rollout at all. `onInk` is the dark
 *  banner, where the page's own tile colour would glare. */
function Cover({
  release,
  size,
  onInk = false,
  className = '',
}: {
  release: ExecutionRelease | null;
  size: number;
  onInk?: boolean;
  className?: string;
}) {
  const src = release ? release.coverThumbUrl || release.coverArtUrl || null : null;
  const box = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={box} className={`shrink-0 rounded-md object-cover ${className}`} />;
  }
  if (!release) {
    return (
      <span
        style={box}
        className={`grid shrink-0 place-items-center rounded-md border border-dashed border-stroke-strong text-content-tertiary ${className}`}
        aria-hidden="true"
      >
        <Plus className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span
      style={box}
      className={`grid shrink-0 place-items-center rounded-md ${
        onInk ? 'bg-[#f5f0e6]/10 text-[#f5f0e6]/45' : 'bg-bg-hover text-content-tertiary'
      } ${className}`}
      aria-hidden="true"
    >
      <Disc3 style={{ width: Math.round(size * 0.36), height: Math.round(size * 0.36) }} />
    </span>
  );
}

/** Due this week and late as two small pills; nothing when both are zero. */
function TaskPills({ due, late }: { due: number; late: number }) {
  if (due === 0 && late === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {due > 0 ? (
        <span className="rounded-full bg-bg-hover px-2 text-xs font-medium leading-5 text-content-secondary">{due} due</span>
      ) : null}
      {late > 0 ? (
        <span className="rounded-full bg-status-error/10 px-2 text-xs font-semibold leading-5 text-status-error">{late} late</span>
      ) : null}
    </span>
  );
}

/** "21 of 34 tasks done · 3 due this week · 1 late" on the dark banner. */
function SpotlightFacts({ row, withDone }: { row: ListRow; withDone: boolean }) {
  const parts = [
    withDone && row.total > 0 ? `${row.done} of ${row.total} tasks done` : null,
    row.dueThisWeek > 0 ? `${row.dueThisWeek} due this week` : null,
  ].filter(Boolean);
  if (parts.length === 0 && row.late === 0) return null;
  return (
    <>
      {parts.join(' · ')}
      {row.late > 0 ? (
        <>
          {parts.length > 0 ? ' · ' : ''}
          <span className="font-semibold text-[#f2a7a0]">{row.late} late</span>
        </>
      ) : null}
    </>
  );
}

/**
 * The banner on top (#878): the dated rollout that drops soonest across the
 * roster. The eye lands on the cover, reads the title, then the countdown.
 * Dark green in both themes, like Spotify's artist banner.
 */
function Spotlight({ row, compact = false }: { row: ListRow; compact?: boolean }) {
  const release = row.next;
  if (!release || row.daysToGo === null) return null;
  const days = row.daysToGo;
  const bar =
    row.total > 0 ? (
      <span className="block h-1 w-full overflow-hidden rounded-full bg-[#f5f0e6]/15">
        <span className="block h-full rounded-full bg-[#7fd09c]" style={{ width: `${percent(row)}%` }} />
      </span>
    ) : null;

  return (
    <Link
      href={releaseHref(release.id)}
      onClick={() => captureAnalyticsEvent({ name: 'artists_list_action', properties: { artist_id: row.artist.id, action: 'spotlight' } })}
      className={`motion-focus motion-press grid items-center rounded-2xl bg-[#1d2a21] text-[#f5f0e6] ${
        compact ? 'grid-cols-[72px_minmax(0,1fr)_auto] gap-3 p-4' : 'grid-cols-[136px_minmax(0,1fr)_auto] gap-6 p-6'
      }`}
    >
      <Cover release={release} size={compact ? 72 : 136} onInk className="shadow-[0_8px_24px_rgba(0,0,0,0.25)]" />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-[#f5f0e6]/70">
          Next drop
        </span>
        <span className={`mt-1 block truncate font-display ${compact ? 'text-xl leading-[26px]' : 'text-[32px] leading-10'}`}>
          {displayReleaseTitle(release.title)}
        </span>
        <span className={`mt-1 flex min-w-0 items-center gap-2 text-[#f5f0e6]/70 ${compact ? 'text-[13px]' : 'text-sm'}`}>
          {compact ? null : row.artist.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.artist.photoUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
          ) : (
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f5f0e6]/15 text-[10px] font-semibold"
              aria-hidden="true"
            >
              {initialsFor(row.artist.name)}
            </span>
          )}
          <span className="truncate font-semibold text-[#f5f0e6]">{row.artist.name}</span>
          {compact ? null : <span className="shrink-0">· {typeLabel(release)}</span>}
        </span>
        {compact ? null : (
          <>
            {bar ? <span className="mt-4 block max-w-[280px]">{bar}</span> : null}
            <span className="mt-2 block text-[13px] leading-5 text-[#f5f0e6]/70">
              <SpotlightFacts row={row} withDone />
            </span>
          </>
        )}
      </span>
      <span className="flex flex-col items-end text-right">
        <span
          className={`font-semibold tabular-nums tracking-[-0.03em] ${compact ? 'text-4xl leading-9' : 'text-[56px] leading-[56px]'}`}
        >
          {days}
        </span>
        <span className={`text-[#f5f0e6]/70 ${compact ? 'text-xs' : 'text-[13px] leading-5'}`}>
          {days === 1 ? 'day' : 'days'}
          {compact ? '' : ` to go · ${shortDay(release.releaseDate) ?? ''}`}
        </span>
        {compact ? null : (
          <span className="mt-4 inline-flex h-9 items-center rounded-full bg-[#f5f0e6] px-4 text-[13px] font-semibold text-[#1d2a21]">
            Open rollout
          </span>
        )}
      </span>
      {compact && (bar || row.dueThisWeek > 0 || row.late > 0) ? (
        <span className="col-span-3">
          {bar}
          <span className="mt-1.5 block text-xs text-[#f5f0e6]/70">
            <SpotlightFacts row={row} withDone={false} />
          </span>
        </span>
      ) : null}
    </Link>
  );
}

/** One artist in the tracklist. The face is a sibling over the link, never
 *  inside it: a button inside an anchor is invalid markup and its tap would
 *  open the artist instead of the photo picker. */
function ArtistRow({
  row,
  setArtistPhoto,
}: {
  row: ListRow;
  setArtistPhoto: (artistId: string, url: string | null) => void;
}) {
  const { artist, next } = row;
  const day = next ? shortDay(next.releaseDate) : null;
  return (
    <li className="relative">
      <ProfilePhotoPicker
        name={artist.name}
        photoUrl={artist.photoUrl}
        size={44}
        signUrl={artistPhotoUrl(artist.id)}
        save={(path) => saveArtistPhoto(artist.id, path)}
        onChange={(url) => setArtistPhoto(artist.id, url)}
        surface="artist_photo"
        className="absolute left-5 top-3.5 z-10"
      />
      <Link
        href={artistHref(artist.id)}
        className={`motion-focus flex min-h-[72px] items-center gap-4 py-3 pl-[4.75rem] pr-5 transition-colors hover:bg-bg-hover/60 md:grid ${ROW_GRID}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[17px] leading-6 text-content-primary">{artist.name}</span>
          {/* Narrow screens: the one line carries the next rollout instead. */}
          <span className="block truncate text-xs leading-4 text-content-secondary md:hidden">
            {next ? `${displayReleaseTitle(next.title)}${day ? ` · ${day}` : ''}` : 'Nothing planned'}
          </span>
          <span
            className={`hidden text-xs leading-4 md:block ${
              row.status === 'rolling_out' ? 'font-semibold text-brand' : 'text-content-secondary'
            }`}
          >
            {STATUS_WORD[row.status]}
          </span>
        </span>
        <span className="hidden min-w-0 items-center gap-3 md:flex">
          <Cover release={next} size={44} />
          <span className="min-w-0">
            {next ? (
              <>
                <span className="block truncate text-sm font-semibold leading-5 text-content-primary">
                  {displayReleaseTitle(next.title)}
                </span>
                <span className="block text-xs leading-4 text-content-secondary">{typeLabel(next)}</span>
              </>
            ) : (
              <>
                <span className="block text-sm leading-5 text-content-secondary">Nothing planned</span>
                <span className="block text-xs font-semibold leading-4 text-brand">Start the next record</span>
              </>
            )}
          </span>
        </span>
        <span className="hidden md:block">
          {day ? (
            <>
              <span className="block text-sm font-medium leading-5 text-content-primary">{day}</span>
              {row.daysToGo !== null ? (
                <span className="block text-xs leading-4 text-content-secondary">{describeDaysToGo(row.daysToGo)}</span>
              ) : null}
            </>
          ) : (
            <span className="text-sm text-content-tertiary">Not set</span>
          )}
        </span>
        <span className="hidden flex-col gap-1.5 md:flex">
          {row.total > 0 ? (
            <span className="block h-1 w-[120px] overflow-hidden rounded-full bg-bg-hover">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${percent(row)}%` }} />
            </span>
          ) : null}
          <TaskPills due={row.dueThisWeek} late={row.late} />
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="md:hidden">
            <TaskPills due={0} late={row.late} />
          </span>
          <ArrowRight className="h-4 w-4 text-content-tertiary" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

/**
 * The Artists tab in the swipe navigation (URG-380, frame 5; spotlight #878):
 * the next drop's banner, then one row per artist with their next rollout,
 * when it drops, and its cover. The title, its + and the count line above
 * were removed on Oct 30, 2026 (founder).
 */
function SwipeArtists({ loading, list }: { loading: boolean; list: ArtistsListData }) {
  const { rows, spotlight } = list;

  return (
    <div className="pb-6">
      {/* No title, no add button and no count line (Oct 30, 2026, founder:
          "remove this entire section"). Artists are added from Settings. The
          phone's bell stays (moved here from Home, 2026-10-29, #876); it is
          phone only and hidden in the swipe nav, so this row is often empty. */}
      <div className="flex justify-end">
        <HomeBell />
      </div>
      {loading ? (
        <ul className="mt-[18px]" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <li key={key} className="flex h-[76px] items-center gap-3.5 border-b border-content-primary/[0.07] px-1.5">
              <span className="h-[42px] w-[42px] shrink-0 animate-pulse rounded-full bg-bg-hover" />
              <span className="h-4 w-32 animate-pulse rounded bg-bg-hover" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="mt-2">
          <ArtistsEmpty />
        </div>
      ) : (
        <>
          <OutNowCards className="mt-4" />
          {spotlight ? (
            <div className="mt-4">
              <Spotlight row={spotlight} compact />
            </div>
          ) : null}
          <ul className="section-list-enter mt-2">
            {rows.map(({ artist, next }) => {
              const day = next ? shortDay(next.releaseDate) : null;
              return (
                <li key={artist.id} className="border-b border-content-primary/[0.07] last:border-b-0">
                  <Link href={artistHref(artist.id)} className="motion-focus flex min-h-[76px] items-center gap-3.5 px-1.5 py-2">
                    {artist.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={artist.photoUrl} alt="" className="h-[42px] w-[42px] shrink-0 rounded-full object-cover" />
                    ) : (
                      <span
                        className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-bg-elevated text-[13.5px] font-semibold text-content-primary/80"
                        aria-hidden="true"
                      >
                        {initialsFor(artist.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16.5px] text-content-primary">{artist.name}</span>
                      <span className={`mt-0.5 block truncate text-sm ${next ? 'text-content-primary/75' : 'text-content-primary/40'}`}>
                        {next ? `${displayReleaseTitle(next.title)}${day ? ` · ${day}` : ''}` : 'Nothing planned'}
                      </span>
                    </span>
                    <Cover release={next} size={40} />
                    <ChevronRight className="h-[18px] w-[18px] shrink-0 text-content-primary/35" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
