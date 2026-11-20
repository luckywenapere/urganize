'use client';

// Home on a computer (#1182, founder approved mock docs/mocks/home-tighter).
// One content width (1120), and blocks the person can reorder and remove:
// the chat card with the Next drop (#1295), Out now (one line), My tasks,
// Delegated, Team and Artists. Phones keep their own Home: this is
// mounted only at lg and up by app/dashboard/artists/ArtistsPageClient.tsx.
//
// Since #1305 (founder approved docs/mocks/home-wallpaper) nothing here sits
// in a card: each block is a heading with one thin line under it and thin
// lines between its rows, and every column of the artists list starts on the
// same left edge as its heading. The wallpaper behind it comes from the theme
// choice (lib/appearance.ts, #1320).
//
// "See all" (decided here, using views that already exist): My tasks opens the
// Team page with your own panel open, which lists all your open tasks grouped
// Late / This week / Later. Delegated opens the Team page, where each person's
// card shows what they hold. There is no separate tasks page to send them to
// (/dashboard/tasks redirects to Home).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { useAuthStore } from '@/lib/auth-store';
import { artistHref } from '@/lib/artist-page';
import { sortBySoonestDrop } from '@/lib/artists-list';
import { isChappiEnabled } from '@/lib/chappi/config';
import { dropCountdown } from '@/lib/home-desktop/countdown';
import { layoutRows, type HomeBlockId, type HomeLayout } from '@/lib/home-desktop/layout';
import {
  countDelegatedPeople,
  countRollouts,
  focusMyTasks,
  selectDelegated,
  selectMyTasks,
} from '@/lib/home-desktop/tasks';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';
import { TEAM_HREF } from '@/lib/team-page';
import { useHomeLayoutStore } from '@/stores/useHomeLayoutStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useShellStore } from '@/stores/useShellStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { displayReleaseTitle } from '@/types/releases';
import { OutNowCards } from '@/components/home/OutNowCards';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { useTeamPage } from '@/components/team/useTeamPage';
import {
  Cover,
  STATUS_WORD,
  Spotlight,
  percent,
  shortDay,
  typeLabel,
  type ArtistsListData,
  type ListRow,
} from '@/components/artists/ArtistListParts';
import { HomeChatCard, HomeChatCardSkeleton } from './HomeChatCard';
import { HomeCustomise } from './HomeCustomise';
import { DelegatedCard, MyTasksCard, type HomeTaskPerson, type HomeTaskPlace } from './HomeTaskCards';
import { HomeTeamRow, HomeTeamRowSkeleton, TEAM_INVITE_HREF, teamPersonHref } from './HomeTeamRow';
import { HOME_GHOST, HOME_ROW_RULE, HOME_RULE } from './home-style';

const ASK_ENABLED = isChappiEnabled();
/** One content width for Home on a computer. */
export const HOME_DESKTOP_WIDTH = 'mx-auto w-full max-w-[1120px]';

// Who, next rollout, when it drops, tasks, arrow. The Drops column is wide
// enough for "57 days · Wed 18 Nov" on one line.
const ROW_GRID =
  'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_10.75rem_8rem_1rem] items-center gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_11.5rem_12.5rem_1rem] xl:gap-6';

const GHOST = HOME_GHOST;

export function HomeDesktop({
  list,
  today,
  setArtistPhoto,
}: {
  list: ArtistsListData;
  today: string;
  setArtistPhoto: (artistId: string, url: string | null) => void;
}) {
  const viewerId = useAuthStore((state) => state.user?.id ?? '');
  const tasks = useTaskStore((state) => state.tasks);
  const releases = useReleaseStore((state) => state.releases);
  const layout = useHomeLayoutStore((state) => state.layout);
  const loadLayout = useHomeLayoutStore((state) => state.load);
  const saveLayout = useHomeLayoutStore((state) => state.save);
  const layoutLoaded = useHomeLayoutStore((state) => state.loaded);
  const { data: team, failed: teamFailed } = useTeamPage();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  const places = useMemo(() => {
    const map = new Map<string, HomeTaskPlace>();
    for (const release of releases) map.set(release.id, { title: release.title, artistName: release.artistName });
    return map;
  }, [releases]);
  const ownedReleaseIds = useMemo(
    () => new Set(releases.filter((release) => release.ownerUserId === viewerId).map((release) => release.id)),
    [releases, viewerId]
  );
  // A plan gives its owner every task it makes, so My tasks is held to each
  // rollout's short main list and skips leftovers of songs already out (#1206).
  const releaseDays = useMemo(() => new Map(releases.map((release) => [release.id, release.releaseDate ?? null])), [releases]);
  const myFocus = useMemo(() => focusMyTasks(tasks, viewerId, releaseDays, today), [tasks, viewerId, releaseDays, today]);
  const mine = useMemo(() => selectMyTasks(myFocus, viewerId, today), [myFocus, viewerId, today]);
  // The same numbers on your own tile, so Home never shows two counts for you.
  const myLoad = useMemo(() => ({ open: myFocus.length }), [myFocus]);
  const myRollouts = useMemo(() => countRollouts(myFocus), [myFocus]);
  const holders = useMemo(() => countDelegatedPeople(tasks, viewerId, ownedReleaseIds), [tasks, viewerId, ownedReleaseIds]);
  const delegated = useMemo(
    () => selectDelegated(tasks, viewerId, ownedReleaseIds, today),
    [tasks, viewerId, ownedReleaseIds, today]
  );
  const people = useMemo(() => {
    const map = new Map<string, HomeTaskPerson>();
    for (const person of team?.people ?? []) {
      if (person.userId) map.set(person.userId, { name: person.name, photoUrl: person.avatarUrl });
    }
    return map;
  }, [team]);
  const rows = useMemo(() => sortBySoonestDrop(list.rows), [list.rows]);

  const me = team?.people.find((person) => person.isCurrentUser) ?? null;
  const activeCount = team ? team.people.filter((person) => person.status === 'active').length : null;
  const available = useMemo<HomeBlockId[]>(() => layout.order.concat(layout.removed), [layout]);

  // One skeleton, then the person's own layout: never the default for a frame.
  if (!layoutLoaded) return <HomeDesktopSkeleton />;

  if (editing) {
    return (
      <div className={`${HOME_DESKTOP_WIDTH} pb-12`} data-home-layout="desktop">
        <HomeCustomise
          initial={layout}
          available={available}
          onDone={async (next: HomeLayout) => {
            const ok = await saveLayout(next);
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </div>
    );
  }

  const block = (id: HomeBlockId): ReactNode => {
    switch (id) {
      case 'out_now':
        return <OutNowCards variant="line" />;
      case 'next_drop':
        // The chat card (#1295). Without the Assistant it is the old banner.
        if (ASK_ENABLED) return <HomeChatCard rows={rows} spotlight={list.spotlight} today={today} />;
        return list.spotlight ? <Spotlight row={list.spotlight} /> : null;
      case 'my_tasks':
        return (
          <MyTasksCard
            pick={mine}
            today={today}
            places={places}
            rollouts={myRollouts}
            seeAllHref={me ? teamPersonHref(me.memberId) : TEAM_HREF}
          />
        );
      case 'delegated':
        return (
          <DelegatedCard
            pick={delegated}
            today={today}
            places={places}
            seeAllHref={TEAM_HREF}
            people={people}
            holders={holders}
            alone={activeCount === 1}
            inviteHref={team?.viewer.canManage ? TEAM_INVITE_HREF : null}
          />
        );
      case 'team':
        // A team that cannot be read draws nothing rather than a guess.
        return team ? <HomeTeamRow team={team} mine={myLoad} /> : teamFailed ? null : <HomeTeamRowSkeleton />;
      case 'artists':
        return <ArtistsBlock rows={rows} setArtistPhoto={setArtistPhoto} />;
    }
  };

  return (
    <div className={`${HOME_DESKTOP_WIDTH} section-list-enter flex flex-col gap-7 pb-12`} data-home-layout="desktop">
      {layoutRows(layout.order).map((row) => (
        <ErrorBoundary key={row.join('+')} name={`home-desktop-${row.join('-')}`} onError={reportBoundaryError}>
          {row.length === 2 ? (
            <div className="grid grid-cols-2 gap-10 xl:gap-14">
              {block(row[0])}
              {block(row[1])}
            </div>
          ) : (
            block(row[0])
          )}
        </ErrorBoundary>
      ))}
      <p className="mt-2 text-center">
        <button type="button" onClick={() => setEditing(true)} className={GHOST}>
          Customise Home
        </button>
      </p>
    </div>
  );
}

/** Every artist and their next rollout, soonest drop first (mock notes 2 to 6).
 *  No card: a heading, a thin line, the column names, then the rows. Each
 *  column's content starts on its heading's left edge (#1305, note 1). */
function ArtistsBlock({
  rows,
  setArtistPhoto,
}: {
  rows: ListRow[];
  setArtistPhoto: (artistId: string, url: string | null) => void;
}) {
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  return (
    <section data-home-block="artists" aria-label="Artists">
      <div className={`flex items-center justify-between gap-4 border-b ${HOME_RULE} pb-2.5`}>
        <h2 className="font-display text-[22px] font-normal leading-7 text-content-primary">
          Artists
          <span className="ml-2 font-sans text-sm font-medium tabular-nums text-content-secondary">{rows.length}</span>
        </h2>
        <button type="button" onClick={() => openAddArtist()} className={GHOST}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add artist
        </button>
      </div>
      <div className={`${ROW_GRID} pb-1.5 pt-3 text-xs font-semibold leading-4 text-content-secondary`}>
        <span>Artist</span>
        <span>Next rollout</span>
        <span>Drops</span>
        <span>Tasks</span>
        <span />
      </div>
      <ul>
        {rows.map((row) => (
          <ArtistRow key={row.artist.id} row={row} setArtistPhoto={setArtistPhoto} />
        ))}
      </ul>
    </section>
  );
}

/** One artist. The face is a sibling over the link, never inside it: a button
 *  inside an anchor is invalid markup and its click would open the artist. */
function ArtistRow({
  row,
  setArtistPhoto,
}: {
  row: ListRow;
  setArtistPhoto: (artistId: string, url: string | null) => void;
}) {
  const { artist, next } = row;
  const drop = next ? dropCountdown(row.daysToGo, shortDay(next.releaseDate)) : null;
  return (
    <li className={`relative border-t ${HOME_ROW_RULE}`}>
      <ProfilePhotoPicker
        name={artist.name}
        photoUrl={artist.photoUrl}
        size={40}
        signUrl={artistPhotoUrl(artist.id)}
        save={(path) => saveArtistPhoto(artist.id, path)}
        onChange={(url) => setArtistPhoto(artist.id, url)}
        surface="artist_photo"
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2"
      />
      <Link
        href={artistHref(artist.id)}
        className={`motion-focus ${ROW_GRID} -mx-3 min-h-[72px] w-[calc(100%+1.5rem)] rounded-2xl px-3 py-4 transition-colors hover:bg-bg-hover/60`}
      >
        <span className="min-w-0 pl-[3.25rem]">
          <span className="block truncate font-display text-[17px] leading-[22px] text-content-primary">{artist.name}</span>
          {/* An artist with a rollout in flight needs no label; one with nothing planned says so. */}
          {row.status !== 'rolling_out' ? (
            <span className="block text-xs font-medium leading-4 text-content-tertiary">{STATUS_WORD[row.status]}</span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-3">
          <Cover release={next} size={44} className="!rounded-xl" />
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
                <span className="block text-xs leading-4 text-content-secondary">Nothing planned</span>
                <span className="block text-[13px] font-semibold leading-5 text-brand underline underline-offset-[3px]">
                  Start the next record
                </span>
              </>
            )}
          </span>
        </span>
        <span className="min-w-0">
          {drop ? (
            <span className="flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
              {drop.number ? (
                <span className="min-w-9 font-display text-[26px] leading-7 text-content-primary">{drop.number}</span>
              ) : null}
              <span className="text-[13px] font-medium leading-5 text-content-secondary">{drop.rest}</span>
            </span>
          ) : next ? (
            <span className="block text-xs leading-4 text-content-secondary">No date yet</span>
          ) : null}
        </span>
        <span className="min-w-0">
          {row.total > 0 ? (
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-bg-hover">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${percent(row)}%` }} />
            </span>
          ) : null}
          {/* What is due, not a late count: a late task says so on its own row. */}
          {row.dueThisWeek > 0 ? (
            <span className="mt-1.5 block text-xs leading-4 tabular-nums text-content-secondary">{row.dueThisWeek} due</span>
          ) : null}
        </span>
        <ChevronRight className="h-4 w-4 text-content-tertiary" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Home's loading shape on a computer: the default blocks with the live line
 * boxes (#1297), and no cards (#1305), so nothing jumps when Home lands. The
 * chat block, then the two task lists at their full five rows
 * (HOME_TASK_LIMIT), the team row, and the artists list with its heading,
 * column names and "Add an artist" row.
 */
export function HomeDesktopSkeleton() {
  const bar = 'animate-pulse rounded-full bg-bg-hover';
  // One line box: the live text's line height, with a bar inside it.
  const line = (height: string, width: string, size: string) => (
    <span className={`flex ${height} items-center`}>
      <span className={`block ${size} ${width} ${bar}`} />
    </span>
  );
  return (
    <div className={`${HOME_DESKTOP_WIDTH} flex flex-col gap-7 pb-12`} aria-busy="true" data-home-layout="desktop">
      {ASK_ENABLED ? <HomeChatCardSkeleton /> : <div className="h-[184px] animate-pulse rounded-2xl bg-bg-hover" />}
      <div className="grid grid-cols-2 gap-10 xl:gap-14">
        {(['mine', 'delegated'] as const).map((card) => (
          <div key={card} className="min-w-0">
            {/* Head: the count, the title over its small line, and See all. */}
            <div className={`flex min-h-[54px] items-center justify-between gap-3 border-b ${HOME_RULE} pb-2.5`}>
              <span className="flex items-center gap-3">
                <span className={`block h-9 w-7 ${bar} !rounded-xl`} />
                <span>
                  {line('h-6', 'w-24', 'h-4')}
                  {line('h-[18px]', 'w-32', 'h-3')}
                </span>
              </span>
              {line('h-5', 'w-14', 'h-3')}
            </div>
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className={`flex min-w-0 items-center gap-3 border-t ${HOME_ROW_RULE} py-3 first:border-t-0`}>
                {card === 'mine' ? (
                  <span className="h-[22px] w-[22px] shrink-0 animate-pulse rounded-full bg-bg-hover" />
                ) : (
                  <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-bg-hover" />
                )}
                <span className="min-w-0 flex-1">
                  {line('h-5', row % 2 ? 'w-40' : 'w-48', 'h-3.5')}
                  {line('h-4', 'w-28', 'h-3')}
                </span>
                <span className={`h-3 w-14 shrink-0 ${bar}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <HomeTeamRowSkeleton />
      <div>
        {/* Head: "Artists n" (leading-7) and the Add artist pill (h-10). */}
        <div className={`flex items-center justify-between gap-4 border-b ${HOME_RULE} pb-2.5`}>
          {line('h-7', 'w-36', 'h-5')}
          <span className="h-10 w-28 animate-pulse rounded-full bg-bg-hover" />
        </div>
        {/* The column names: text-xs over pt-3 pb-1.5, on the row grid. */}
        <div className={`${ROW_GRID} pb-1.5 pt-3`}>
          {['w-10', 'w-20', 'w-10', 'w-10'].map((width, index) => (
            <span key={index}>{line('h-4', width, 'h-2.5')}</span>
          ))}
          <span />
        </div>
        <ul>
          {[0, 1, 2].map((key) => (
            <li key={key} className={`${ROW_GRID} min-h-[72px] border-t ${HOME_ROW_RULE} py-4`}>
              <span className="flex min-w-0 items-center gap-3">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-hover" />
                {line('h-[22px]', 'w-32', 'h-4')}
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <span className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-bg-hover" />
                <span>
                  {line('h-5', 'w-28', 'h-3.5')}
                  {line('h-4', 'w-12', 'h-3')}
                </span>
              </span>
              {line('h-7', 'w-28', 'h-4')}
              <span className={`block h-1.5 w-full ${bar}`} />
              <span />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
