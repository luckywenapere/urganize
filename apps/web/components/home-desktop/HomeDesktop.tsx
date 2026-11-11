'use client';

// Home on a computer (#1182, founder approved mock docs/mocks/home-tighter).
// One content width (1120), and blocks the person can reorder and remove:
// Out now (one line), Next drop, My tasks, Delegated, Team, Artists
// and, from "Add to Home", the ask box. Phones keep their own Home: this is
// mounted only at lg and up by app/dashboard/artists/ArtistsPageClient.tsx.
//
// "See all" (decided here, using views that already exist): My tasks opens the
// Team page with your own panel open, which lists all your open tasks grouped
// Late / This week / Later. Delegated opens the Team page, where each person's
// card shows what they hold. There is no separate tasks page to send them to
// (/dashboard/tasks redirects to Home).

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUp, ChevronRight, Plus } from '@/components/icons';
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
import { useChappiStore } from '@/stores/useChappiStore';
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
  const available = useMemo<HomeBlockId[]>(
    () => layout.order.concat(layout.removed).filter((id) => id !== 'ask' || ASK_ENABLED),
    [layout]
  );

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
      case 'ask':
        return ASK_ENABLED ? <AskBlock /> : null;
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
 * The ask box, offered under "Add to Home". Home on a computer carries no
 * conversation (founder, 2026-10-27, lib/home-desktop-chat-guard.test.ts), so
 * this only takes the question: sending it opens the Assistant's drawer with
 * the question in its box, the same thing "Ask AI" in the search bar does.
 */
function AskBlock() {
  const setInput = useChappiStore((state) => state.setInput);
  const setRailOpen = useChappiStore((state) => state.setRailOpen);
  const [question, setQuestion] = useState('');
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    setInput(text);
    setRailOpen(true);
    setQuestion('');
  };
  return (
    <form
      onSubmit={send}
      data-home-block="ask"
      className="flex items-center gap-2 rounded-2xl border border-stroke-control bg-bg-surface py-2 pl-5 pr-2 focus-within:border-content-secondary"
    >
      <label htmlFor="home-ask" className="sr-only">
        Ask the Assistant
      </label>
      <input
        id="home-ask"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask the Assistant about a rollout, a task or a date"
        autoComplete="off"
        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-content-primary outline-none placeholder:text-content-tertiary"
      />
      <button
        type="submit"
        disabled={!question.trim()}
        aria-label="Ask the Assistant"
        className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-content-inverse disabled:opacity-40"
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}

/** Home's loading shape on a computer: the default blocks, so nothing jumps. */
export function HomeDesktopSkeleton() {
  const bar = 'animate-pulse rounded bg-bg-hover';
  return (
    <div className={`${HOME_DESKTOP_WIDTH} flex flex-col gap-4 pb-12`} aria-busy="true" data-home-layout="desktop">
      <div className="h-[184px] animate-pulse rounded-2xl bg-bg-hover" />
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((card) => (
          <div key={card} className="rounded-2xl border border-stroke-default bg-bg-surface px-5 pb-2 pt-1.5">
            <div className="pb-2 pt-3">
              <span className={`block h-5 w-28 ${bar}`} />
            </div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3 border-t border-stroke-subtle py-2.5">
                <span className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-bg-hover" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className={`block h-3.5 w-44 ${bar}`} />
                  <span className={`block h-3 w-28 ${bar}`} />
                </span>
                <span className={`h-3 w-14 ${bar}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <HomeTeamRowSkeleton />
      <div className="mt-2">
        <span className={`block h-6 w-36 ${bar}`} />
        <div className="mt-3 overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
          <ul className="divide-y divide-stroke-subtle">
            {[0, 1, 2].map((key) => (
              <li key={key} className="flex h-[68px] items-center gap-4 px-5">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-hover" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className={`block h-4 w-32 ${bar}`} />
                  <span className={`block h-3 w-16 ${bar}`} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
