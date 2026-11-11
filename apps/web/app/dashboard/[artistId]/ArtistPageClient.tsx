'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronRight } from '@/components/icons';
import { useShellStore } from '@/stores/useShellStore';
import { useAuthStore } from '@/lib/auth-store';
// Back goes to the Artists tab, the list of artists (founder, 2026-10-14).
import { ARTISTS_HREF } from '@/lib/shell-nav';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { artistUpNext, bucketReleases, whatsNextFor, type ArtistUpNext } from '@/lib/artist-overview';
import { recordsStillInTheMaking } from '@/lib/artist-page-data';
import { formatCalendarDate, isArtistPageEnabled, recordHref, releaseHref } from '@/lib/artist-page';
import { RECORD_COVER_COLORS, lagosToday, type RecordSummary } from '@/lib/next-records';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { ProfilePhotoPicker } from '@/components/shared/ProfilePhotoPicker';
import { artistPhotoUrl, saveArtistPhoto } from '@/lib/profile-photo-client';
import { CoverThumbEditor } from '@/components/artists/CoverThumbEditor';
import { ArtistCatalogueCard } from '@/components/artists/ArtistCatalogueCard';
import { ArtistTasksCard } from '@/components/artists/ArtistTasksCard';
import type { CatalogueProfile } from '@/lib/artist-import/client';
import { RecordRows, isUntitledRecord, useArtistRecords } from '@/components/artists/ArtistRecordsCard';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ExecutionRelease } from '@/lib/execution-types';
import { displayReleaseTitle } from '@/types/releases';
import { SmartLinkBox, useReleaseSmartLink } from '@/components/releases/SmartLinkBox';
import { copyText } from '@/lib/share-file';
import { ARTIST_BRAND_ATTR, artistBrandCss, resolveArtistBrandTheme } from '@/lib/artist-brand-theme';
import { BRAND_COLORS_SETTINGS_HREF, isBrandColorsEnabled } from '@/lib/social-share-colors';

// The artist page, redesigned 2026-10-29 (#866, founder approved
// docs/mocks/artist-page/mock.html). Where the artist stands first (two chips
// under the name), then the one thing to do next, then all of their music on
// one line from In the making to Rolling out to Out now. The posting plan sits
// beside it on desktop and under it on a phone. "What UrgAns remembers" left
// the page; UrgAns still keeps and uses those facts.
//
// Desktop, 2026-11-10 (#1183, founder approved
// docs/mocks/artist-page-desktop/mock.html): from lg up the page is two
// columns in a 1120 width. Records on the left (Up next, then the three stages
// as cards), the artist's tasks and the one-time import on the right. One
// filled button, "New record". A record shows once, in the furthest stage it
// has reached (lib/artist-page-data.ts). Every desktop rule is an `lg:` class
// on the same markup, so a phone draws what it drew before.

const ARTIST_PAGE_ENABLED = isArtistPageEnabled();
const BRAND_COLORS_ENABLED = isBrandColorsEnabled();

const DAY_MS = 86_400_000;

// lg: the one filled button sits last, the quiet one before it (mock note 2).
const primaryButton =
  'motion-focus motion-press inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50 sm:flex-none lg:order-2 lg:min-h-9 lg:px-4 lg:text-[13px]';
const ghostButton =
  'motion-focus motion-press inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-stroke-strong px-5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover sm:flex-none lg:order-1 lg:min-h-9 lg:px-4 lg:text-[13px] lg:font-medium';
// "Copy link" on an Out now row, desktop only.
const copyLinkButton =
  'motion-focus motion-press hidden h-8 shrink-0 items-center gap-1.5 rounded-full border border-stroke-strong px-3.5 text-[13px] font-medium text-content-primary transition-colors hover:bg-bg-hover lg:inline-flex';
// The ::before box makes the tap area 44px tall without changing the line or
// where the focus ring draws.
const inlineLink =
  "motion-focus relative text-[13px] font-semibold text-brand underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline disabled:opacity-50";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "Fri 14 Nov" for Up next, read as a local date like formatCalendarDate. */
function shortDay(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(parsed);
}

/** "Out today", "Out yesterday", "Out 5 days ago". */
function outLabel(days: number | null): string {
  if (days === null || days >= 0) return 'Out today';
  if (days === -1) return 'Out yesterday';
  return `Out ${-days} days ago`;
}

/** "Copy link" on an Out now row (desktop): the long address stays off the row. */
function CopyLinkButton({ url, title, releaseId }: { url: string; title: string; releaseId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    captureAnalyticsEvent({ name: 'out_now_link_copied', properties: { release_id: releaseId } });
    if (await copyText(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <>
      <button type="button" onClick={() => void copy()} aria-label={`Copy the link to ${title}`} className={copyLinkButton}>
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            Copied
          </>
        ) : (
          'Copy link'
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  );
}

/** A song out in the last month: its row, and its smart link once there is one.
 *  On a phone the link is a box under the row; on desktop it is a "Copy link"
 *  button in the row (`row` is handed the button to place). */
function RecentOut({ release, row }: { release: ExecutionRelease; row: (copy: React.ReactNode) => React.ReactNode }) {
  const url = useReleaseSmartLink(release.id, true);
  const title = displayReleaseTitle(release.title);
  return (
    <li className="list-none">
      <ul>{row(url ? <CopyLinkButton url={url} title={title} releaseId={release.id} /> : null)}</ul>
      {url ? <SmartLinkBox url={url} title={title} releaseId={release.id} className="mb-1.5 ml-[52px] lg:hidden" /> : null}
    </li>
  );
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

/** Three faded sleeves: the records that will fill the Out now slot. Each
 *  sleeve is opaque (page colour under a faded tint), so the one in front
 *  covers the one behind and the 2px seam between them stays clean. */
function RecordStack() {
  return (
    <span className="flex shrink-0" aria-hidden="true">
      {RECORD_COVER_COLORS.slice(0, 3).map((color, index) => (
        <span
          key={color}
          className={`relative grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-bg-base ring-2 ring-bg-base ${index ? '-ml-3.5' : ''}`}
        >
          <span className="absolute inset-0" style={{ backgroundColor: color, opacity: 0.5 + index * 0.2 }} />
          <span className="relative h-4 w-4 rounded-full border border-white/40" />
        </span>
      ))}
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
    // lg: each stage is its own card; the rail that joins the stops is a phone thing.
    <li className="relative pl-7 lg:rounded-2xl lg:border lg:border-stroke-default lg:bg-bg-surface lg:px-5 lg:pb-3 lg:pl-11 lg:pt-[18px]">
      {last ? null : <span aria-hidden className="absolute bottom-0 left-[6px] top-[22px] w-[1.5px] bg-stroke-strong lg:hidden" />}
      <span
        aria-hidden
        className={`absolute left-0 top-[5px] h-[13px] w-[13px] rounded-full border-[1.5px] lg:left-5 lg:top-[19px] ${dot}`}
      />
      {/* font-sans: the global heading rule would set the display serif, which
          has one weight and goes smudgy in faux bold. */}
      <h3 className="font-sans text-[11px] font-bold uppercase tracking-[0.12em] text-content-secondary">
        {label}
        {count > 0 ? <span className="ml-1.5 font-normal text-content-tertiary">{count}</span> : null}
      </h3>
      <div className={`mt-2 lg:-ml-6 lg:mt-3 lg:border-t lg:border-stroke-default lg:pb-0 lg:pt-2 ${last ? '' : 'pb-6'}`}>{children}</div>
    </li>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-content-tertiary">{children}</p>;
}

function UpNextCard({
  next,
  artistId,
  artistName,
  whatsNext,
  starting,
  onStart,
  onPlan,
  onOpen,
}: {
  next: ArtistUpNext<ExecutionRelease, RecordSummary>;
  artistId: string;
  artistName: string;
  /** The What's next ask (whatsNextFor), shown in the start state only. */
  whatsNext: { releaseTitle: string; daysOut: number } | null;
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
  // What the desktop button on the card says (mock note 5).
  let cta = 'Open rollout';

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
    cta = 'Open record';
    if (record.status === 'idea') {
      // An idea nobody has started making (2026-11-04, mock screen 1). Checked
      // before the steps: songs still at Idea would otherwise read "Finish".
      title = `${isUntitledRecord(record.title) ? 'Untitled' : record.title} is still an idea`;
      line = 'Add the first song, or tell the AI what it is about.';
    } else if (next.step === 'finish') {
      title = `Finish ${recordName(record)}`;
      line = `${record.doneCount} of ${plural(record.songCount, 'song')} done. Plan its rollout when it's ready.`;
    } else if (next.step === 'plan') {
      title = `${isUntitledRecord(record.title) ? 'The record' : record.title} is ready`;
      line = 'Every song is done. Plan its rollout.';
      href = null;
      action = onPlan;
      cta = 'Plan a rollout';
    } else {
      title = 'Add the first song';
      line = isUntitledRecord(record.title) ? "Write down what's being made." : `To ${record.title}.`;
    }
  } else if (whatsNext) {
    // The ask that lived on Home (2026-10-27) moved here when Home went
    // (2026-11-04, #1074): a week after the newest release, ask what is next.
    title = `What's next for ${artistName}?`;
    line = `${displayReleaseTitle(whatsNext.releaseTitle)} has been out ${plural(whatsNext.daysOut, 'day')}. Start the next record.`;
    action = onStart;
    cta = 'New record';
  } else {
    title = 'Start the next record';
    line = 'Keep the songs, sessions and people in one place, not in your head.';
    action = onStart;
    cta = 'New record';
  }

  // shadcn/ui Card (components/ui/card.tsx, added with `shadcn add`; Oyin's
  // pick, #1071): a plain bordered card, no accent stripe, the countdown as the
  // big number on the left. The whole card is one link or button through a
  // stretched control over it, so the Card itself stays the registry's div.
  // The visible text is aria-hidden so a screen reader hears the card once,
  // through the control's name and description.
  const descriptionId = `up-next-${artistId}`;
  const days = countdown === 1 ? 'day' : 'days';
  const name = countdown !== null ? `${title}, ${countdown} ${days} to go` : title;
  const control = 'motion-focus absolute inset-0 rounded-xl lg:rounded-2xl';
  return (
    // lg: the dark card the Artists list uses for Next drop (same two colours),
    // with a button that says where the card goes.
    <Card
      className={cn(
        'artist-up-next relative flex flex-row items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent lg:gap-5 lg:rounded-2xl lg:border-0 lg:bg-[#1d2a21] lg:p-5 lg:text-[#f5f0e6] lg:hover:bg-[#1d2a21]',
        starting && 'opacity-60'
      )}
    >
      {countdown !== null ? (
        <div className="shrink-0 pr-1 text-center" aria-hidden>
          <span className="block font-display text-3xl leading-none text-primary lg:text-[40px] lg:text-[#f5f0e6] up-next-ink">{countdown}</span>
          <span className="text-xs text-muted-foreground lg:text-[#f5f0e6]/70 up-next-muted">{days}</span>
        </div>
      ) : null}
      <CardHeader className="min-w-0 flex-1 gap-0.5 space-y-0 p-0" aria-hidden>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-primary lg:text-[#f5f0e6]/70 up-next-muted">Up next</p>
        {/* leading-snug: a long record title wraps on a phone. */}
        <CardTitle className="leading-snug lg:text-[#f5f0e6] up-next-ink">{title}</CardTitle>
        <CardDescription className="lg:text-[#f5f0e6]/70 up-next-muted">{line}</CardDescription>
      </CardHeader>
      <span id={descriptionId} className="sr-only">
        {line}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
      {/* Drawn only: the stretched control below is what is clicked and read. */}
      <span
        aria-hidden
        className="hidden h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-[#f5f0e6] px-4 text-[13px] font-semibold text-[#1d2a21] lg:inline-flex up-next-cta"
      >
        {cta}
      </span>
      {href ? (
        <Link href={href} onClick={onOpen} aria-label={name} aria-describedby={descriptionId} className={control} />
      ) : (
        <button
          type="button"
          onClick={action ?? undefined}
          disabled={starting}
          aria-label={name}
          aria-describedby={descriptionId}
          className={cn(control, 'disabled:cursor-not-allowed')}
        />
      )}
    </Card>
  );
}

/** `artistId` and `home` are set when Home shows an artist their own page
 *  (lib/artist-home.ts): the id comes from the roster, not the URL, and there
 *  is no back arrow because there is no list behind it. */
export default function ArtistPageClient({ artistId: homeArtistId, home = false }: { artistId?: string; home?: boolean } = {}) {
  const router = useRouter();
  const params = useParams<{ artistId: string }>();
  const artistId = homeArtistId ?? (typeof params?.artistId === 'string' ? params.artistId : '');
  const authLoading = useAuthStore((state) => state.isLoading);

  const artists = useArtistRosterStore((state) => state.artists);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const setArtistPhoto = useArtistRosterStore((state) => state.setArtistPhoto);
  const releases = useReleaseStore((state) => state.releases);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const tasks = useTaskStore((state) => state.tasks);
  const openCreateForArtist = useShellStore((state) => state.openCreateForArtist);
  const { records: allRecords, starting, error: recordError, start: startRecord } = useArtistRecords(artistId);
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

  const artistReleases = useMemo(() => releases.filter((release) => release.artistId === artistId), [releases, artistId]);
  const buckets = useMemo(() => bucketReleases(artistReleases), [artistReleases]);
  // A record whose rollout is already on the page shows there, not here too (#1183).
  const records = useMemo(
    () => (allRecords ? recordsStillInTheMaking(allRecords, artistReleases.map((release) => release.id)) : null),
    [allRecords, artistReleases]
  );
  // What is already out through a rollout, so the streaming copy of the same
  // song is not listed again under Out now.
  const outRollouts = useMemo(() => [...buckets.live, ...buckets.past], [buckets]);
  const today = lagosToday();
  const upNext = useMemo(
    () => artistUpNext({ buckets, records: records ?? [], tasks, today }),
    [buckets, records, tasks, today]
  );
  const whatsNext = useMemo(() => whatsNextFor({ buckets, today }), [buckets, today]);
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

  // The artist's brand colors theme this page (#1209); null keeps the house look.
  const brandColors = artist?.brandColors ?? null;
  const brandTheme = useMemo(
    () => (BRAND_COLORS_ENABLED ? resolveArtistBrandTheme(brandColors) : null),
    [brandColors]
  );
  const brandCss = useMemo(() => (brandTheme ? artistBrandCss(brandTheme) : null), [brandTheme]);

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

  const backLink = home ? null : (
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
      <div className="mx-auto w-full max-w-3xl lg:max-w-[1120px]">
        {backLink}
        {waiting ? (
          <>
            <div className="mt-6 h-32 animate-pulse rounded-xl border border-stroke-default bg-bg-surface lg:hidden" aria-busy="true" />
            {/* Desktop: the shape of the page that is coming (header, two columns). */}
            <div className="mt-5 hidden lg:block" aria-busy="true">
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 animate-pulse rounded-2xl bg-bg-surface" />
                <div className="flex-1 space-y-3">
                  <div className="h-9 w-64 animate-pulse rounded-lg bg-bg-surface" />
                  <div className="h-4 w-40 animate-pulse rounded bg-bg-surface" />
                </div>
                <div className="h-9 w-28 animate-pulse rounded-full bg-bg-surface" />
                <div className="h-9 w-28 animate-pulse rounded-full bg-bg-surface" />
              </div>
              <div className="mt-6 grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
                <div className="space-y-4">
                  <div className="h-[88px] animate-pulse rounded-2xl bg-bg-surface" />
                  <div className="h-24 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
                  <div className="h-28 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
                  <div className="h-40 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
                </div>
                <div className="h-64 animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
              </div>
            </div>
          </>
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
    chips.push({
      label:
        upNext.record.status === 'idea'
          ? isUntitledRecord(upNext.record.title)
            ? 'An idea'
            : `${upNext.record.title} is an idea`
          : isUntitledRecord(upNext.record.title)
            ? 'Making a record'
            : `Making ${upNext.record.title}`,
      on: true,
    });
  if (buckets.planned.length === 0 && buckets.live.length === 0) chips.push({ label: 'No rollout yet', on: false });
  else if (records && records.length > 0) chips.push({ label: `${records.length} in the making`, on: false });

  // On release day a song leaves Rolling out for the top of Out now (#1092,
  // docs/mocks/out-now-placement); its rollout and after-release tasks are one tap away.
  const rolling = buckets.planned;
  const outCount = buckets.live.length + buckets.past.length + (catalogueCount ?? 0);

  // The cover sits outside the link so its pencil is its own button (#847).
  const releaseRow = (release: ExecutionRelease, rollingOut: boolean, recent = false, copy: React.ReactNode = null) => {
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
                {!rollingOut && !recent && release.releaseDate ? `, ${release.releaseDate.slice(0, 4)}` : ''}
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
            ) : recent && counts && counts.total > 0 && counts.done < counts.total ? (
              // Out, with after-release tasks still open (#1105): the count and
              // bar stay, so the team keeps tracking them.
              <>
                <p className="text-[13px] text-content-secondary">
                  {outLabel(days)} · {counts.done} of {plural(counts.total, 'task')} done
                </p>
                {/* lg: an Out now row is one quiet line; the bar is for what is still rolling out. */}
                <div className="mt-1.5 h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-[rgb(var(--color-stroke)/0.14)] lg:hidden">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((counts.done / counts.total) * 100)}%` }} />
                </div>
              </>
            ) : recent ? (
              <p className="text-[13px] text-content-secondary">{outLabel(days)}</p>
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
          <ChevronRight className={`h-4 w-4 shrink-0 text-content-tertiary ${copy ? 'lg:hidden' : ''}`} aria-hidden />
        </Link>
        {/* lg: Copy link sits between the words and the chevron, outside the link. */}
        {copy}
        {copy ? <ChevronRight className="hidden h-4 w-4 shrink-0 text-content-tertiary lg:block" aria-hidden /> : null}
      </li>
    );
  };

  const canImport = streamingProfile === null && catalogueCount === 0;

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-[1120px]" {...(brandTheme ? { [ARTIST_BRAND_ATTR]: '' } : {})}>
      {/* The artist's colors (#1209): a few CSS variables, scoped to this page,
          that arrive and leave with it. Built only from normalized hex values. */}
      {brandCss ? <style>{brandCss}</style> : null}
      {backLink}

      <header
        className={cn(
          'mt-5 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between',
          brandTheme && 'artist-brand-band rounded-2xl px-5 pb-7 pt-5 lg:px-6 lg:pb-8 lg:pt-6'
        )}
      >
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
            {/* lg: one status line under the name; the chips are the phone's. */}
            {chips.length > 0 ? (
              <p className={`mt-1.5 hidden text-xs font-semibold lg:block ${chips[0].on ? 'text-brand' : 'font-medium text-content-tertiary'}`}>
                {chips[0].label}
              </p>
            ) : null}
            {chips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5 lg:hidden">
                {chips.map((chip) => (
                  <Chip key={chip.label} on={chip.on}>
                    {chip.label}
                  </Chip>
                ))}
              </div>
            ) : null}
            {brandTheme ? (
              <Link
                href={BRAND_COLORS_SETTINGS_HREF}
                className="motion-focus mt-2 inline-flex min-h-6 items-center gap-1.5 rounded-full border border-[rgb(var(--color-stroke)/0.28)] px-2.5 font-mono text-[11px] text-content-secondary transition-colors hover:bg-bg-hover"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-[3px] border border-[rgb(var(--color-stroke)/0.4)]"
                  style={{ backgroundColor: brandTheme.band }}
                />
                <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: brandTheme.bandAccent }} />
                Brand colors
              </Link>
            ) : null}
          </div>
        </div>
        {/* New record first: between releases the next record is the work (founder, 2026-10-29).
            lg: it is the one filled button and sits last, after a quiet Plan a rollout. */}
        <div className="flex shrink-0 gap-2">
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

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {/* A known rollout wins Up next, so only wait for records without one. */}
          {records === null && rolling.length === 0 ? (
            <div className="h-[76px] animate-pulse rounded-2xl bg-bg-surface lg:h-[88px]" aria-busy="true" />
          ) : (
            <UpNextCard
              next={upNext}
              artistId={artist.id}
              artistName={artist.name}
              whatsNext={whatsNext}
              starting={starting}
              onStart={newRecord}
              onPlan={planRollout}
              onOpen={() => act('up_next')}
            />
          )}

          <section aria-labelledby="music-title" className="mt-8 lg:mt-4">
            {/* lg: the three stage cards say it; the heading stays for screen readers. */}
            <div className="flex items-baseline justify-between gap-3 lg:sr-only">
              <h2 id="music-title" className="font-display text-[22px] text-content-primary">
                Music
              </h2>
            </div>
            <ol className="mt-4 lg:mt-0 lg:space-y-4">
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
                {buckets.live.length + buckets.past.length > 0 ? (
                  <ul className="space-y-0.5">
                    {buckets.live.map((release) => (
                      <RecentOut key={release.id} release={release} row={(copy) => releaseRow(release, false, true, copy)} />
                    ))}
                    {buckets.past.map((release) => releaseRow(release, false))}
                  </ul>
                ) : null}
                <ArtistCatalogueCard
                  artistId={artist.id}
                  outRollouts={outRollouts}
                  onCount={setCatalogueCount}
                  onProfile={setStreamingProfile}
                />
                {/* lg: the import card lives in the right column, so say the stage is empty. */}
                {outCount === 0 ? <p className="hidden text-[13px] text-content-tertiary lg:block">Nothing out yet.</p> : null}
                {/* Songs out before Urganize come in once (#890, mock
                    docs/mocks/one-time-import). Nothing out yet: one card where
                    the music will be. Rollouts out but no older songs: one empty
                    slot the size of a song row. Once brought in (a profile is
                    saved) or any older songs are there, neither shows again. */}
                {canImport && buckets.past.length === 0 ? (
                  <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-2xl border border-dashed border-stroke-control p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5 lg:hidden">
                    <RecordStack />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug text-content-primary">Songs out before Urganize?</p>
                      <p className="mt-1 text-[13px] leading-snug text-content-secondary">
                        Bring in what {artist.name} already released. You only do this once.
                      </p>
                    </div>
                    {/* Under the words on a phone, beside them from sm up. */}
                    <button
                      type="button"
                      onClick={findOnStreaming}
                      className="motion-focus motion-press col-start-2 inline-flex min-h-10 items-center justify-self-start rounded-full bg-brand px-4 text-[13px] font-semibold text-content-inverse hover:bg-brand-hover sm:col-start-auto sm:min-h-9"
                    >
                      Bring them in
                    </button>
                  </div>
                ) : canImport ? (
                  <div className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 lg:hidden">
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
                      className="motion-focus motion-press inline-flex min-h-10 shrink-0 items-center rounded-full border border-stroke-strong px-3.5 text-[13px] font-semibold text-content-primary hover:bg-bg-hover sm:min-h-9"
                    >
                      Bring them in
                    </button>
                  </div>
                ) : null}
              </Stage>
            </ol>
          </section>
        </div>

        {/* The right column, desktop only (mock notes 1 and 6): this artist's
            tasks, then the one-time import while it is still to do. */}
        <aside className="hidden min-w-0 flex-col gap-4 lg:flex">
          <ArtistTasksCard tasks={tasks} releases={artistReleases} today={today} />
          {canImport ? (
            <section aria-labelledby="import-title" className="rounded-2xl border border-stroke-default bg-bg-surface px-5 pb-4 pt-1.5">
              <h2 id="import-title" className="pb-2 pt-3 font-display text-lg leading-6 text-content-primary">
                Songs out before Urganize?
              </h2>
              <p className="pb-3 text-sm text-content-secondary">
                Bring in what {artist.name} already released. You only do this once.
              </p>
              <button
                type="button"
                onClick={findOnStreaming}
                className="motion-focus motion-press inline-flex h-9 items-center rounded-full border border-stroke-strong px-4 text-[13px] font-medium text-content-primary transition-colors hover:bg-bg-hover"
              >
                Bring them in
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
