'use client';

// Home on a computer (#1182, founder approved mock docs/mocks/home-tighter).
// One content width (1120), and blocks the person can reorder and remove:
// the chat card with the Next drop (#1295), Out now (one line), My tasks,
// Delegated, Team and Artists. Phones keep their own Home: this is
// mounted only at lg and up by app/dashboard/artists/ArtistsPageClient.tsx.
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
import { describeDaysToGo, sortBySoonestDrop } from '@/lib/artists-list';
import { isChappiEnabled } from '@/lib/chappi/config';
import { layoutRows, type HomeBlockId, type HomeLayout } from '@/lib/home-desktop/layout';
import { focusMyTasks, selectDelegated, selectMyTasks } from '@/lib/home-desktop/tasks';
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

const ASK_ENABLED = isChappiEnabled();
/** One content width for Home on a computer. */
export const HOME_DESKTOP_WIDTH = 'mx-auto w-full max-w-[1120px]';

// Who, next rollout, when it drops, tasks, arrow. The columns sit close so the
// eye does not cross empty space (mock notes 2 and 4).
const ROW_GRID =
  'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8.5rem_10rem_1rem] items-center gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_9.25rem_13.75rem_1rem] xl:gap-6';

const GHOST =
  'motion-focus motion-press inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-control px-4 text-[13px] font-medium text-content-primary hover:bg-bg-hover';

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
  const myLoad = useMemo(
    () => ({
      open: myFocus.length,
      late: myFocus.filter((task) => Boolean(task.dueDate && task.dueDate.slice(0, 10) < today)).length,
    }),
    [myFocus, today]
  );
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
          <MyTasksCard pick={mine} today={today} places={places} seeAllHref={me ? teamPersonHref(me.memberId) : TEAM_HREF} />
        );
      case 'delegated':
        return (
          <DelegatedCard
            pick={delegated}
            today={today}
            places={places}
            seeAllHref={TEAM_HREF}
            people={people}
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
    <div className={`${HOME_DESKTOP_WIDTH} section-list-enter flex flex-col gap-4 pb-12`} data-home-layout="desktop">
      {layoutRows(layout.order).map((row) => (
        <ErrorBoundary key={row.join('+')} name={`home-desktop-${row.join('-')}`} onError={reportBoundaryError}>
          {row.length === 2 ? (
            <div className="grid grid-cols-2 gap-4">
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

/** Every artist and their next rollout, soonest drop first (mock notes 2 to 6). */
function ArtistsBlock({
  rows,
  setArtistPhoto,
}: {
  rows: ListRow[];
  setArtistPhoto: (artistId: string, url: string | null) => void;
}) {
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  return (
    <section data-home-block="artists" aria-label="Artists" className="mt-2">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-[22px] font-normal leading-7 text-content-primary">
          Artists
          <span className="font-sans text-sm font-medium text-content-secondary"> · {rows.length}</span>
        </h2>
        <button type="button" onClick={() => openAddArtist()} className={GHOST}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add artist
        </button>
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
        {/* Header text lines up with the names and titles, not the faces (#878). */}
        <div className={`${ROW_GRID} border-b border-stroke-subtle py-2.5 pl-[4.75rem] pr-5 text-xs font-semibold text-content-secondary`}>
          <span>Artist</span>
          <span className="pl-[3.25rem]">Next rollout</span>
          <span>Drops</span>
          <span>Tasks</span>
          <span />
        </div>
        <ul className="divide-y divide-stroke-subtle">
          {rows.map((row) => (
            <ArtistRow key={row.artist.id} row={row} setArtistPhoto={setArtistPhoto} />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => openAddArtist()}
          className="motion-focus flex w-full items-center gap-3 border-t border-stroke-subtle px-5 py-3.5 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-bg-hover/60 hover:text-content-primary"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-stroke-control text-content-tertiary"
            aria-hidden="true"
          >
            <Plus className="h-4 w-4" />
          </span>
          Add an artist
        </button>
      </div>
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
  const day = next ? shortDay(next.releaseDate) : null;
  return (
    <li className="relative">
      <ProfilePhotoPicker
        name={artist.name}
        photoUrl={artist.photoUrl}
        size={40}
        signUrl={artistPhotoUrl(artist.id)}
        save={(path) => saveArtistPhoto(artist.id, path)}
        onChange={(url) => setArtistPhoto(artist.id, url)}
        surface="artist_photo"
        className="absolute left-5 top-1/2 z-10 -translate-y-1/2"
      />
      <Link
        href={artistHref(artist.id)}
        className={`motion-focus ${ROW_GRID} min-h-[68px] py-3 pl-[4.75rem] pr-5 transition-colors hover:bg-bg-hover/60`}
      >
        <span className="min-w-0">
          <span className="block truncate font-display text-[17px] leading-[22px] text-content-primary">{artist.name}</span>
          <span
            className={`block text-xs leading-4 ${
              row.status === 'quiet' ? 'font-medium text-content-tertiary' : 'font-semibold text-brand'
            }`}
          >
            {STATUS_WORD[row.status]}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-3">
          <Cover release={next} size={40} />
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
          {next && day && row.daysToGo !== null ? (
            <>
              <span className="block text-sm font-semibold leading-5 text-content-primary">{day}</span>
              <span className="block text-xs leading-4 text-content-secondary">{describeDaysToGo(row.daysToGo)}</span>
            </>
          ) : next ? (
            <span className="block text-xs leading-4 text-content-secondary">No date yet</span>
          ) : null}
        </span>
        <span className="min-w-0">
          {row.total > 0 ? (
            <span className="block h-1 w-full overflow-hidden rounded-full bg-bg-hover">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${percent(row)}%` }} />
            </span>
          ) : null}
          {row.dueThisWeek > 0 || row.late > 0 ? (
            <span className="mt-1.5 flex gap-2.5 text-xs leading-4 text-content-secondary">
              {row.dueThisWeek > 0 ? <span>{row.dueThisWeek} due</span> : null}
              {/* One red number, not a red pill on every row (mock note 5). */}
              {row.late > 0 ? <span className="font-semibold text-status-error">{row.late} late</span> : null}
            </span>
          ) : null}
        </span>
        <ChevronRight className="h-4 w-4 text-content-tertiary" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Home's loading shape on a computer: the default blocks with the live line
 * boxes (#1297), so nothing jumps when Home lands. The chat card, then the two
 * task cards at their full five rows (HOME_TASK_LIMIT), the team row, and the
 * artists list with its heading, column header and "Add an artist" row.
 */
export function HomeDesktopSkeleton() {
  const bar = 'animate-pulse rounded bg-bg-hover';
  // One line box: the live text's line height, with a bar inside it.
  const line = (height: string, width: string, size: string) => (
    <span className={`flex ${height} items-center`}>
      <span className={`block ${size} ${width} ${bar}`} />
    </span>
  );
  return (
    <div className={`${HOME_DESKTOP_WIDTH} flex flex-col gap-4 pb-12`} aria-busy="true" data-home-layout="desktop">
      {ASK_ENABLED ? <HomeChatCardSkeleton /> : <div className="h-[184px] animate-pulse rounded-2xl bg-bg-hover" />}
      <div className="grid grid-cols-2 gap-4">
        {(['mine', 'delegated'] as const).map((card) => (
          <div key={card} className="min-w-0 rounded-2xl border border-stroke-default bg-bg-surface px-5 pb-2 pt-1.5">
            {/* Head: the serif title (leading-6) and See all. */}
            <div className="flex items-center justify-between gap-3 pb-2 pt-3">
              {line('h-6', 'w-36', 'h-4')}
              {line('h-5', 'w-12', 'h-3')}
            </div>
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex min-w-0 items-center gap-3 border-t border-stroke-subtle py-2.5">
                {card === 'mine' ? (
                  <span className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-bg-hover" />
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
      <div className="mt-2">
        {/* Head: "Artists · n" (leading-7) and the Add artist pill (h-9). */}
        <div className="flex items-end justify-between gap-4">
          {line('h-7', 'w-32', 'h-5')}
          <span className="h-9 w-28 animate-pulse rounded-full bg-bg-hover" />
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
          {/* The column header: text-xs over py-2.5. */}
          <div className="flex items-center gap-5 border-b border-stroke-subtle py-2.5 pl-[4.75rem] pr-5">
            {['w-10', 'w-20', 'w-10', 'w-10'].map((width, index) => (
              <span key={index}>{line('h-4', width, 'h-2.5')}</span>
            ))}
          </div>
          <ul className="divide-y divide-stroke-subtle">
            {[0, 1, 2].map((key) => (
              <li key={key} className="flex min-h-[68px] items-center gap-4 px-5 py-3">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-hover" />
                <span className="min-w-0 flex-1">
                  {line('h-[22px]', 'w-32', 'h-4')}
                  {line('h-4', 'w-16', 'h-3')}
                </span>
              </li>
            ))}
          </ul>
          {/* "Add an artist": py-3.5 around a 40px circle. */}
          <div className="flex items-center gap-3 border-t border-stroke-subtle px-5 py-3.5">
            <span className="h-10 w-10 shrink-0 rounded-full border-[1.5px] border-dashed border-stroke-control" />
            {line('h-5', 'w-24', 'h-3.5')}
          </div>
        </div>
      </div>
    </div>
  );
}
