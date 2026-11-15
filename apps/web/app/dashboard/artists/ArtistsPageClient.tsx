'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronRight, Plus } from '@/components/icons';
import { initialsFor } from '@/lib/swipe-nav';
import { useAuthStore } from '@/lib/auth-store';
import { artistsList } from '@/lib/artists-list';
import { artistHref, isArtistPageEnabled } from '@/lib/artist-page';
import { lagosToday } from '@/lib/next-records';
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
import { FirstArtistDesk, readFirstArtistLater } from '@/components/artists/FirstArtistDesk';
import { OutNowCards } from '@/components/home/OutNowCards';
import { StreamingLinkPrompt } from '@/components/artists/StreamingLinkPrompt';
import { useShellStore } from '@/stores/useShellStore';
import { useRoleViewViewer } from '@/components/shell/useShellAreas';
import { artistHomeId } from '@/lib/artist-home';
import ArtistPageClient from '@/app/dashboard/[artistId]/ArtistPageClient';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { HomeDesktop, HomeDesktopSkeleton } from '@/components/home-desktop/HomeDesktop';
import { HomeWallpaperLayer } from '@/components/home-desktop/HomeWallpaper';
import {
  Cover,
  STATUS_WORD,
  Spotlight,
  shortDay,
  typeLabel,
  percent,
  type ArtistsListData,
  type ListRow,
} from '@/components/artists/ArtistListParts';

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

export default function ArtistsPageClient({
  swipe = false,
  active = true,
}: { swipe?: boolean; active?: boolean } = {}) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);
  const userId = useAuthStore((state) => state.user?.id ?? null);

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
  // Home on a computer has its own layout (#1182). Phones and narrow windows
  // keep the list below exactly as it was ("mobile design is another logic").
  const isDesktop = useIsDesktopViewport();
  // Tasks and rollouts load once before the first paint. Later reloads flip
  // the same flag for a team with no rollouts yet, and must not swap Home for
  // its skeleton again (that would also drop an open Customise mode).
  const commandCenterLoading = useReleaseStore((state) => state.isInitialLoading);
  const [commandCenterSettled, setCommandCenterSettled] = useState(!commandCenterLoading);
  if (!commandCenterLoading && !commandCenterSettled) setCommandCenterSettled(true);
  const ownArtistId = rosterLoaded ? artistHomeId(viewer, artists) : null;
  // The first artist step on a computer (#1229) until they add one or pick
  // "Do this later". Read once per user; the click sets it for this visit.
  const [laterFor, setLaterFor] = useState<string | null>(null);
  const firstArtistLater = Boolean(userId) && (laterFor === userId || readFirstArtistLater(userId));

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

  if (isDesktop && (loading || list.rows.length > 0)) {
    return (
      <div>
        <DuplicateArtistsPrompt />
        <StreamingLinkPrompt />
        {/* The person's wallpaper, from the first paint (#1305). Computers only. */}
        <HomeWallpaperLayer />
        <div className="pt-5 sm:pt-6" />
        {loading || !commandCenterSettled ? (
          <HomeDesktopSkeleton />
        ) : (
          <HomeDesktop list={list} today={today} setArtistPhoto={setArtistPhoto} />
        )}
      </div>
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
        isDesktop && !firstArtistLater ? (
          <FirstArtistDesk userId={userId} onLater={() => setLaterFor(userId)} />
        ) : (
          <ArtistsEmpty demo={!isDesktop} />
        )
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
 *  (#1007; it replaced the faded list here, which stays on other pages).
 *  On a computer the loop is left out (#1229): the first visit is the first
 *  artist step, and after "Do this later" Home is just the action. */
function ArtistsEmpty({ demo = true }: { demo?: boolean }) {
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  return (
    <section
      className={`mx-auto grid max-w-xl items-center gap-8 py-6 sm:py-10 ${
        demo ? 'lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12' : ''
      }`}
    >
      <div className={`text-center ${demo ? 'lg:text-left' : ''}`}>
        <h2 className="text-balance font-display text-[24px] font-normal leading-[1.25] text-content-primary sm:text-[28px]">
          No artists yet.
        </h2>
        <p className="mt-2 text-pretty text-[14px] leading-normal text-content-secondary">
          Add the first and their rollouts show here.
        </p>
        <div className={`mt-5 flex justify-center ${demo ? 'lg:justify-start' : ''}`}>
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
      {demo ? <PlanLoopDemo className="mx-auto w-full max-w-[440px]" /> : null}
    </section>
  );
}


// Who, next rollout, tasks, arrow (#878; the Drops column left Home, Nov 6, 2026).
const ROW_GRID = 'grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_9.5rem_1rem] gap-4';


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
