'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Disc3 } from '@/components/icons';
import { useShellStore } from '@/stores/useShellStore';
import { useAuthStore } from '@/lib/auth-store';
// Back goes to the Artists tab, the list of artists (founder, 2026-10-14).
import { ARTISTS_HREF } from '@/lib/shell-nav';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { artistUpNext, bucketReleases, type ArtistUpNext } from '@/lib/artist-overview';
import { formatCalendarDate, isArtistPageEnabled, recordHref, releaseHref } from '@/lib/artist-page';
import { lagosToday, type RecordSummary } from '@/lib/next-records';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';
import { CoverThumbEditor } from '@/components/artists/CoverThumbEditor';
import { ArtistCatalogueCard } from '@/components/artists/ArtistCatalogueCard';
import type { CatalogueProfile } from '@/lib/artist-import/client';
import { RecordRows, isUntitledRecord, useArtistRecords } from '@/components/artists/ArtistRecordsCard';
import type { ExecutionRelease } from '@/lib/execution-types';
import { displayReleaseTitle } from '@/types/releases';

// The artist page, redesigned 2026-10-29 (#866, founder approved
// docs/mocks/artist-page/mock.html). Where the artist stands first (two chips
// under the name), then the one thing to do next, then all of their music on
// one line from In the making to Rolling out to Out now. The posting plan sits
// beside it on desktop and under it on a phone. "What UrgAns remembers" left
// the page; UrgAns still keeps and uses those facts.

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();

const DAY_MS = 86_400_000;

const primaryButton =
  'motion-focus motion-press inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50 sm:flex-none';
const ghostButton =
  'motion-focus motion-press inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-stroke-strong px-5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover sm:flex-none';
const inlineLink = 'motion-focus text-[13px] font-semibold text-brand hover:underline underline-offset-2 disabled:opacity-50';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "Fri 14 Nov" for Up next, read as a local date like formatCalendarDate. */
function shortDay(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(parsed);
}

/** Whole days from today (Lagos) to a release date; negative once it is out. */
function daysFrom(today: string, value: string | null): number | null {
  if (!value) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : null;
}

const recordName = (record: RecordSummary) => (isUntitledRecord(record.title) ? 'the untitled record' : record.title);

function Chip({ children, on = false }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${
        on ? 'bg-brand-subtle font-semibold text-brand' : 'bg-bg-hover text-content-secondary'
      }`}
    >
      {on ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
      {children}
    </span>
  );
}

/** One stop on the Music line. The lit stop is where the artist is now. */
function Stage({
  label,
  count,
  tone,
  last = false,
  children,
}: {
  label: string;
  count: number;
  tone: 'lit' | 'done' | 'idle';
  last?: boolean;
  children: React.ReactNode;
}) {
  const dot =
    tone === 'lit'
      ? 'border-brand bg-brand ring-4 ring-brand/10'
      : tone === 'done'
        ? 'border-content-primary bg-content-primary'
        : 'border-content-tertiary bg-bg-base';
  return (
    <li className="relative pl-7">
      {last ? null : <span aria-hidden className="absolute bottom-0 left-[6px] top-[22px] w-[1.5px] bg-stroke-strong" />}
      <span aria-hidden className={`absolute left-0 top-[5px] h-[13px] w-[13px] rounded-full border-[1.5px] ${dot}`} />
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-content-secondary">
        {label}
        {count > 0 ? <span className="ml-1.5 font-normal text-content-tertiary">{count}</span> : null}
      </h3>
      <div className={`mt-2 ${last ? '' : 'pb-6'}`}>{children}</div>
    </li>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-content-tertiary">{children}</p>;
}

function UpNextCard({
  next,
  artistId,
  starting,
  onStart,
  onPlan,
  onOpen,
}: {
  next: ArtistUpNext<ExecutionRelease, RecordSummary>;
  artistId: string;
  starting: boolean;
  onStart: () => void;
  onPlan: () => void;
  onOpen: () => void;
}) {
  let title: string;
  let line: string;
  let countdown: number | null = null;
  let href: string | null = null;
  let action: (() => void) | null = null;

  if (next.kind === 'rollout') {
    const name = displayReleaseTitle(next.release.title);
    const day = shortDay(next.release.releaseDate);
    title = day ? `${name} drops ${day}` : `Pick a release day for ${name}`;
    line = [
      next.dueThisWeek > 0 ? `${plural(next.dueThisWeek, 'task')} due this week` : 'Nothing due this week',
      next.late > 0 ? `${next.late} late` : null,
    ]
      .filter(Boolean)
      .join(', ');
    countdown = next.daysToGo !== null && next.daysToGo >= 0 ? next.daysToGo : null;
    href = releaseHref(next.release.id);
  } else if (next.kind === 'out') {
    title = `${displayReleaseTitle(next.release.title)} is out`;
    line = `${plural(next.openTasks, 'task')} left${next.late > 0 ? `, ${next.late} late` : ''}`;
    href = releaseHref(next.release.id);
  } else if (next.kind === 'record') {
    const { record } = next;
    href = recordHref(artistId, record.id);
    if (next.step === 'finish') {
      title = `Finish ${recordName(record)}`;
      line = `${record.doneCount} of ${plural(record.songCount, 'song')} done. Plan its rollout when it's ready.`;
    } else if (next.step === 'plan') {
      title = `${isUntitledRecord(record.title) ? 'The record' : record.title} is ready`;
      line = 'Every song is done. Plan its rollout.';
      href = null;
      action = onPlan;
    } else {
      title = 'Add the first song';
      line = isUntitledRecord(record.title) ? "Write down what's being made." : `To ${record.title}.`;
    }
  } else {
    title = 'Start the next record';
    line = 'Keep the songs, sessions and people in one place, not in your head.';
    action = onStart;
  }

  const body = (
    <>
      {countdown !== null ? (
        <span className="shrink-0 pr-1 text-center">
          <span className="block font-display text-3xl leading-none text-brand">{countdown}</span>
          <span className="text-[11px] text-content-tertiary">{countdown === 1 ? 'day' : 'days'}</span>
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand">Up next</span>
        <span className="mt-0.5 block text-[15px] font-semibold text-content-primary">{title}</span>
        <span className="block text-[13px] text-content-secondary">{line}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
    </>
  );
  const shell =
    'motion-focus flex w-full items-center gap-4 rounded-2xl border border-l-[3px] border-stroke-default border-l-brand bg-bg-surface px-4 py-3.5 text-left transition-colors hover:bg-bg-hover disabled:opacity-60';

  return href ? (
    <Link href={href} onClick={onOpen} className={shell}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={action ?? undefined} disabled={starting} className={shell}>
      {body}
    </button>
  );
}

export default function ArtistPageClient() {
  const router = useRouter();
  const params = useParams<{ artistId: string }>();
  const artistId = typeof params?.artistId === 'string' ? params.artistId : '';
  const authLoading = useAuthStore((state) => state.isLoading);

  const artists = useArtistRosterStore((state) => state.artists);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const setArtistPhoto = useArtistRosterStore((state) => state.setArtistPhoto);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const tasks = useTaskStore((state) => state.tasks);
  const openCreateForArtist = useShellStore((state) => state.openCreateForArtist);
  const { records, starting, error: recordError, start: startRecord } = useArtistRecords(artistId);
  const [catalogueCount, setCatalogueCount] = useState<number | null>(null);
  // undefined until the catalogue's first read answers; null = no profile linked.
  const [streamingProfile, setStreamingProfile] = useState<CatalogueProfile | null | undefined>(undefined);
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  // One quiet line under Rolling out for what a cover upload did (this page has no toasts).
  const [coverNotice, setCoverNotice] = useState<{ message: string; tone: 'success' | 'error' | 'warning' } | null>(null);
  const onCoverToast = useCallback(
    (message: string, tone: 'success' | 'error' | 'warning') => setCoverNotice({ message, tone }),
    []
  );

  useEffect(() => {
    if (!ARTIST_PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void loadRoster();
    void loadCommandCenter();
  }, [loadRoster, loadCommandCenter, router]);

  const artist = artists.find((entry) => entry.id === artistId) ?? null;

  const buckets = useMemo(
    () => bucketReleases(releases.filter((release) => release.artistId === artistId)),
    [releases, artistId]
  );
  const today = lagosToday();
  const upNext = useMemo(
    () => artistUpNext({ buckets, records: records ?? [], tasks, today }),
    [buckets, records, tasks, today]
  );
  const taskCounts = useMemo(() => {
    const counts = new Map<string, { done: number; total: number }>();
    for (const task of tasks) {
      if (!task.releaseId) continue;
      const entry = counts.get(task.releaseId) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (task.status === 'done') entry.done += 1;
      counts.set(task.releaseId, entry);
    }
    return counts;
  }, [tasks]);

  const releaseCount = buckets.planned.length + buckets.live.length + buckets.past.length;
  const viewed = artist !== null;
  useEffect(() => {
    if (!viewed) return;
    captureAnalyticsEvent({
      name: 'artist_page_viewed',
      properties: {
        artist_id: artistId,
        releases: releaseCount,
      },
    });
    // Once per artist opened; the counts are context, not a reason to re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewed, artistId]);

  if (!ARTIST_PAGE_ENABLED) return null;

  const act = (action: 'open_release' | 'new_rollout' | 'up_next' | 'new_record') =>
    captureAnalyticsEvent({ name: 'artist_page_action', properties: { artist_id: artistId, action } });

  const backLink = (
    <Link
      href={ARTISTS_HREF}
      aria-label="Artists"
      title="Artists"
      className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
    </Link>
  );

  if (!artist) {
    const waiting = authLoading || !rosterLoaded;
    return (
      <div className="mx-auto w-full max-w-3xl">
        {backLink}
        {waiting ? (
          <div className="mt-6 h-32 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" aria-busy="true" />
        ) : (
          <p className="mt-6 text-sm text-content-secondary">We could not find that artist on your team.</p>
        )}
      </div>
    );
  }

  const newRecord = () => {
    act('new_record');
    void startRecord();
  };
  const findOnStreaming = () => openAddArtist({ query: artist.name, artistId: artist.id, artistName: artist.name });
  const planRollout = () => {
    act('new_rollout');
    openCreateForArtist(artist.id);
  };

  // Where the artist stands, in two chips: the lit one is what is happening.
  const chips: { label: string; on: boolean }[] = [];
  if (upNext.kind === 'rollout') chips.push({ label: `Rolling out ${displayReleaseTitle(upNext.release.title)}`, on: true });
  else if (upNext.kind === 'out') chips.push({ label: `${displayReleaseTitle(upNext.release.title)} is out`, on: true });
  else if (upNext.kind === 'record')
    chips.push({ label: isUntitledRecord(upNext.record.title) ? 'Making a record' : `Making ${upNext.record.title}`, on: true });
  if (buckets.planned.length === 0 && buckets.live.length === 0) chips.push({ label: 'No rollout yet', on: false });
  else if (records && records.length > 0) chips.push({ label: `${records.length} in the making`, on: false });

  const rolling = [...buckets.planned, ...buckets.live];
  const outCount = buckets.past.length + (catalogueCount ?? 0);

  // The cover sits outside the link so its pencil is its own button (#847).
  const releaseRow = (release: ExecutionRelease, rollingOut: boolean) => {
    const counts = taskCounts.get(release.id);
    const days = daysFrom(today, release.releaseDate);
    const typeLabel = release.releaseType === 'ep' ? 'EP' : release.releaseType === 'album' ? 'Album' : 'Single';
    return (
      <li key={release.id} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-bg-hover">
        <CoverThumbEditor
          releaseId={release.id}
          title={displayReleaseTitle(release.title)}
          coverUrl={release.coverArtUrl}
          coverThumbUrl={release.coverThumbUrl}
          onToast={onCoverToast}
        />
        <Link
          href={releaseHref(release.id)}
          onClick={() => act('open_release')}
          className="motion-focus flex min-w-0 flex-1 items-center gap-3 rounded-lg"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-content-primary">
              {displayReleaseTitle(release.title)}
              <span className="font-normal text-content-secondary">
                {' · '}
                {typeLabel}
                {!rollingOut && release.releaseDate ? `, ${release.releaseDate.slice(0, 4)}` : ''}
              </span>
            </p>
            {rollingOut && counts && counts.total > 0 ? (
              <>
                <p className="text-[13px] text-content-secondary">
                  {counts.done} of {plural(counts.total, 'task')} done
                </p>
                <div className="mt-1.5 h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-[rgb(var(--color-stroke)/0.14)]">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((counts.done / counts.total) * 100)}%` }} />
                </div>
              </>
            ) : !rollingOut ? null : (
              <p className="text-[13px] text-content-secondary">{release.releaseDate ? 'No tasks yet' : 'No release day yet'}</p>
            )}
          </div>
          {rollingOut && release.releaseDate ? (
            <span className="shrink-0 text-right">
              <span className="block font-mono text-xs uppercase text-content-primary">
                {formatCalendarDate(release.releaseDate)?.replace(/, \d{4}$/, '')}
              </span>
              <span className="text-xs text-content-secondary">
                {days === null ? '' : days > 0 ? `in ${plural(days, 'day')}` : days === 0 ? 'today' : 'out now'}
              </span>
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden />
        </Link>
      </li>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {backLink}

      <header className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <ProfilePhotoPicker
            name={artist.name}
            photoUrl={artist.photoUrl}
            size={80}
            square
            signUrl={artistPhotoUrl(artist.id)}
            save={(path) => saveArtistPhoto(artist.id, path)}
            onChange={(url) => setArtistPhoto(artist.id, url)}
            surface="artist_photo"
            overlayRemove
            quietBadge
          />
          <div className="min-w-0">
            <h1 className="line-clamp-2 break-words font-display text-[32px] leading-[1.05] text-content-primary sm:text-[40px]">
              {artist.name}
            </h1>
            {chips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <Chip key={chip.label} on={chip.on}>
                    {chip.label}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {/* New record first: between releases the next record is the work (founder, 2026-10-29). */}
        <div className="flex gap-2">
          <button type="button" onClick={newRecord} disabled={starting} className={primaryButton}>
            {starting ? 'Starting…' : 'New record'}
          </button>
          <button type="button" onClick={planRollout} className={ghostButton}>
            Plan a rollout
          </button>
        </div>
      </header>
      {recordError ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {recordError}
        </p>
      ) : null}

      <div className="mt-6">
        <div className="min-w-0">
          {/* A known rollout wins Up next, so only wait for records without one. */}
          {records === null && rolling.length === 0 ? (
            <div className="h-[76px] animate-pulse rounded-2xl bg-bg-surface" aria-busy="true" />
          ) : (
            <UpNextCard
              next={upNext}
              artistId={artist.id}
              starting={starting}
              onStart={newRecord}
              onPlan={planRollout}
              onOpen={() => act('up_next')}
            />
          )}

          <section aria-labelledby="music-title" className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="music-title" className="font-display text-[22px] text-content-primary">
                Music
              </h2>
            </div>
            <ol className="mt-4">
              <Stage
                label="In the making"
                count={records?.length ?? 0}
                tone={rolling.length === 0 && records && records.length > 0 ? 'lit' : 'idle'}
              >
                {records === null ? (
                  <div className="h-14 animate-pulse rounded-xl bg-bg-surface" aria-busy="true" />
                ) : records.length === 0 ? (
                  <Quiet>
                    Nothing in the making.
                    <button type="button" onClick={newRecord} disabled={starting} className={inlineLink}>
                      New record
                    </button>
                  </Quiet>
                ) : (
                  <RecordRows artistId={artist.id} records={records} />
                )}
              </Stage>

              <Stage label="Rolling out" count={rolling.length} tone={rolling.length > 0 ? 'lit' : 'idle'}>
                {rolling.length === 0 ? (
                  <Quiet>
                    Nothing rolling out.
                    <button type="button" onClick={planRollout} className={inlineLink}>
                      Plan one
                    </button>
                  </Quiet>
                ) : (
                  <ul className="space-y-0.5">{rolling.map((release) => releaseRow(release, true))}</ul>
                )}
                {coverNotice ? (
                  <p
                    role="status"
                    className={`mt-2 text-xs ${coverNotice.tone === 'error' ? 'text-status-error' : 'text-content-secondary'}`}
                  >
                    {coverNotice.message}
                  </p>
                ) : null}
              </Stage>

              <Stage label="Out now" count={outCount} tone={outCount > 0 ? 'done' : 'idle'} last>
                {buckets.past.length > 0 ? (
                  <ul className="space-y-0.5">{buckets.past.map((release) => releaseRow(release, false))}</ul>
                ) : null}
                <ArtistCatalogueCard artistId={artist.id} onCount={setCatalogueCount} onProfile={setStreamingProfile} />
                {/* Songs out before Urganize come in once (#890, mock
                    docs/mocks/one-time-import). Nothing out yet: one card where
                    the music will be. Rollouts out but no older songs: one empty
                    slot the size of a song row. Once brought in (a profile is
                    saved) or any older songs are there, neither shows again. */}
                {streamingProfile === null && catalogueCount === 0 && buckets.past.length === 0 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-stroke-control p-4 sm:p-5">
                    <span className="flex shrink-0" aria-hidden="true">
                      {[0.45, 0.7, 1].map((opacity, index) => (
                        <span
                          key={opacity}
                          className={`grid h-11 w-11 place-items-center rounded-lg border border-stroke-strong bg-bg-surface text-content-tertiary shadow-sm ${index ? '-ml-3.5' : ''}`}
                          style={{ opacity }}
                        >
                          {index === 2 ? <Disc3 className="h-4 w-4" /> : null}
                        </span>
                      ))}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-content-primary">Songs out before Urganize?</p>
                      <p className="mt-0.5 text-[13px] text-content-secondary">Bring in what {artist.name} already released, once.</p>
                    </div>
                    <button
                      type="button"
                      onClick={findOnStreaming}
                      className="motion-focus motion-press inline-flex min-h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse hover:bg-brand-hover"
                    >
                      Bring them in
                    </button>
                  </div>
                ) : streamingProfile === null && catalogueCount === 0 ? (
                  <div className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-md border-[1.5px] border-dashed border-stroke-control text-brand"
                      aria-hidden="true"
                    >
                      {/* A plain plus: the icon set's Plus draws a sparkle. */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-content-primary">Older songs</p>
                      <p className="text-xs text-content-secondary">From before Urganize</p>
                    </div>
                    <button
                      type="button"
                      onClick={findOnStreaming}
                      className="motion-focus motion-press inline-flex min-h-9 shrink-0 items-center rounded-full border border-stroke-strong px-3.5 text-[13px] font-semibold text-content-primary hover:bg-bg-hover"
                    >
                      Bring them in
                    </button>
                  </div>
                ) : null}
              </Stage>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
