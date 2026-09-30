'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { settingsDeepLink } from '@/lib/settings-nav';
import { useSettingsLinkClick } from '@/components/settings/useOpenSettings';
import { Check, ChevronDown, Layers, Plus } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useEventsStore } from '@/stores/useEventsStore';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import {
  formatShowDateTime,
  partitionShowList,
  relativeShowDay,
  shortTimezoneLabel,
  showDateTile,
  showStatusBadge,
  type ShowListEntry,
} from '@/lib/events';
import { CreateShowModal } from '@/components/events/CreateShowModal';
import { EmptyState } from '@/components/shared/EmptyState';
import type { ShowEvent } from '@/types/events';

// Same flag the API routes read. A direct link followed while the flag is off
// bounces to the workspace — the route has no server-side gate, since the flag
// is inlined at build time (the notes precedent).
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';

/** A festival card lists its first few shows and folds the rest behind one
 *  button, so a 28-show run does not push everything else off the screen. */
const SERIES_ROWS_SHOWN = 6;

type SeriesEntry = Extract<ShowListEntry<ShowEvent>, { kind: 'series' }>;

/** "Today", the time, the venue's zone — the line under a show's name. */
function whenLine(event: ShowEvent): string {
  if (!event.setStartAt) return 'Date to confirm';
  const relative = relativeShowDay(event.setStartAt, event.timezone);
  const time = formatShowDateTime(event.setStartAt, event.timezone, { includeDate: false });
  const zone = shortTimezoneLabel(event.timezone);
  return [relative, zone ? `${time} ${zone}` : time].filter(Boolean).join(' · ');
}

function StatusBadge({ event }: { event: ShowEvent }) {
  const label = showStatusBadge(event.status);
  if (!label) return null;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        event.status === 'cancelled'
          ? 'border-status-error/30 bg-status-error/10 text-status-error'
          : 'border-stroke-strong text-content-secondary'
      }`}
    >
      {label}
    </span>
  );
}

/** The calendar tile at the head of a row. The date is read in the VENUE'S
 *  zone, like every set time on this surface. */
function DateTile({ event }: { event: ShowEvent }) {
  const tile = showDateTile(event.setStartAt, event.timezone);
  if (!tile) {
    return (
      <div
        aria-hidden
        className="grid h-14 w-12 shrink-0 place-items-center rounded-lg border border-dashed border-stroke-strong text-[11px] font-semibold text-content-tertiary"
      >
        TBC
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-stroke-default bg-bg-base leading-none"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">
        {tile.month}
      </span>
      <span className="mt-1 font-display text-lg font-semibold text-content-primary">{tile.day}</span>
      <span className="mt-0.5 text-[10px] text-content-tertiary">{tile.year ?? tile.weekday}</span>
    </div>
  );
}

function ShowRow({ event }: { event: ShowEvent }) {
  const place = [event.venueName, event.city].filter(Boolean).join(', ');
  const cancelled = event.status === 'cancelled';
  const dateForReaders = event.setStartAt
    ? formatShowDateTime(event.setStartAt, event.timezone)
    : 'Date to confirm';

  return (
    <Link
      href={`/dashboard/shows/${event.id}`}
      aria-label={`${event.title}, ${dateForReaders}${cancelled ? ', cancelled' : ''}`}
      className={`motion-focus flex items-center gap-4 rounded-xl border border-stroke-default bg-bg-surface p-3 transition-colors hover:border-stroke-strong ${
        cancelled ? 'opacity-70' : ''
      }`}
    >
      <DateTile event={event} />
      <div className="min-w-0 flex-1">
        {event.artistName ? (
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            {event.artistName}
          </p>
        ) : null}
        <p
          className={`truncate font-display text-base font-semibold text-content-primary ${
            cancelled ? 'line-through decoration-content-tertiary' : ''
          }`}
        >
          {event.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-content-secondary">
          {[whenLine(event), place, `${event.setLengthMinutes} min`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <StatusBadge event={event} />
    </Link>
  );
}

/** One show inside a festival: the day and the artist are its identity here,
 *  since the festival's name is already on the card. */
function SeriesMemberRow({ event, played }: { event: ShowEvent; played: boolean }) {
  const identity = [event.seriesDay ? `Day ${event.seriesDay}` : event.title, event.artistName]
    .filter(Boolean)
    .join(' · ');
  const when = event.setStartAt ? formatShowDateTime(event.setStartAt, event.timezone) : 'Date to confirm';

  return (
    <Link
      href={`/dashboard/shows/${event.id}`}
      className={`motion-focus flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-base ${
        played ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-content-primary">{identity}</p>
        <p className="mt-0.5 truncate text-xs text-content-secondary">{when}</p>
      </div>
      <StatusBadge event={event} />
    </Link>
  );
}

function SeriesCard({ entry, now }: { entry: SeriesEntry; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const first = entry.shows[0];
  const dated = entry.shows.filter((show) => show.setStartAt);
  const firstDated = dated[0];
  const lastDated = dated[dated.length - 1];
  const place = first ? [first.venueName, first.city].filter(Boolean).join(', ') : '';
  const range = firstDated
    ? entry.days > 1 && lastDated && lastDated.id !== firstDated.id
      ? `${formatShowDateTime(firstDated.setStartAt, firstDated.timezone, { includeTime: false })} to ${formatShowDateTime(
          lastDated.setStartAt,
          lastDated.timezone,
          { includeTime: false }
        )}`
      : formatShowDateTime(firstDated.setStartAt, firstDated.timezone)
    : 'Dates to confirm';
  const who =
    entry.artistNames.length > 1 ? `${entry.artistNames.length} artists` : entry.artistNames[0] || '';
  const summary = [entry.days > 1 ? `${entry.days} days` : null, who].filter(Boolean).join(' · ');
  const shown = expanded ? entry.shows : entry.shows.slice(0, SERIES_ROWS_SHOWN);
  const hidden = entry.shows.length - shown.length;

  const playedAt = (show: ShowEvent) => {
    if (!show.setStartAt) return false;
    const start = Date.parse(show.setStartAt);
    return !Number.isNaN(start) && start + show.setLengthMinutes * 60_000 < now;
  };

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-3">
      <div className="flex items-start justify-between gap-3 px-1 pt-1">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            <Layers className="h-3 w-3" aria-hidden />
            Festival
          </p>
          <h3 className="mt-1 truncate font-display text-base font-semibold text-content-primary">
            {entry.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-content-secondary">
            {[range, place].filter(Boolean).join(' · ')}
          </p>
        </div>
        {summary ? (
          <span className="shrink-0 pt-4 text-xs font-semibold text-content-secondary">{summary}</span>
        ) : null}
      </div>

      <ul className="mt-2">
        {shown.map((show) => (
          <li key={show.id}>
            <SeriesMemberRow event={show} played={playedAt(show)} />
          </li>
        ))}
      </ul>

      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="motion-focus mt-1 w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-content-secondary hover:bg-bg-base hover:text-content-primary"
        >
          {expanded ? 'Show fewer' : `Show all ${entry.shows.length} shows`}
        </button>
      ) : null}
    </section>
  );
}

function EntryList({ entries, now }: { entries: ShowListEntry<ShowEvent>[]; now: number }) {
  return (
    <div className="space-y-2.5">
      {entries.map((entry) =>
        entry.kind === 'series' ? (
          <SeriesCard key={entry.seriesId} entry={entry} now={now} />
        ) : (
          <ShowRow key={entry.event.id} event={entry.event} />
        )
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="flex items-center gap-4 rounded-xl border border-stroke-default bg-bg-surface p-3"
        >
          <div className="h-14 w-12 shrink-0 animate-pulse rounded-lg bg-bg-base" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-2.5 w-20 animate-pulse rounded bg-bg-base" />
            <div className="h-4 w-44 animate-pulse rounded bg-bg-base" />
            <div className="h-3 w-56 max-w-full animate-pulse rounded bg-bg-base" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ShowsPageClient() {
  const router = useRouter();
  // "Add an artist" opens Settings over this page rather than leaving it.
  const openSettingsOnClick = useSettingsLinkClick({ segment: 'artists', section: 'artists' });
  const { isLoading: authLoading } = useAuthStore();
  const { events, bookableArtistIds, isInitialLoading, error, load } = useEventsStore();
  const { artists, loaded: rosterLoaded, load: loadRoster } = useArtistRosterStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [artistFilter, setArtistFilter] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  // Read once per render pass rather than per row, so every row agrees on
  // what "now" is.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!EVENTS_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    // Fire immediately rather than behind authLoading — the stores read their
    // own token from getSession() (local), so waiting on the auth store's
    // GoTrue round trip only delays real data (the notes page pattern).
    void load();
    void loadRoster();
  }, [load, loadRoster, router]);

  // Only artists that actually have shows are worth filtering by.
  const artistsWithShows = useMemo(() => {
    const seen = new Map<string, string>();
    for (const event of events) {
      if (event.artistId && !seen.has(event.artistId)) seen.set(event.artistId, event.artistName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name: name || 'Artist' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  const activeFilter =
    artistFilter && artistsWithShows.some((artist) => artist.id === artistFilter) ? artistFilter : null;

  const { upcoming, past } = useMemo(() => {
    const visible = activeFilter ? events.filter((event) => event.artistId === activeFilter) : events;
    return partitionShowList(visible, new Date(now));
  }, [activeFilter, events, now]);

  if (!EVENTS_ENABLED) return null;

  const bookableArtists = artists.filter((artist) => bookableArtistIds?.includes(artist.id));
  const canBook = bookableArtists.length > 0;
  const isLoading = authLoading || isInitialLoading || !rosterLoaded;
  const filterName = artistsWithShows.find((artist) => artist.id === activeFilter)?.name;

  const bookButton = canBook ? (
    <button
      type="button"
      onClick={() => setIsCreateOpen(true)}
      className="motion-focus motion-press inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
    >
      <Plus className="h-4 w-4" aria-hidden />
      Book a show
    </button>
  ) : null;

  const pastCount = past.reduce(
    (total, entry) => total + (entry.kind === 'series' ? entry.shows.length : 1),
    0
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-content-primary">Shows</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Every date, its running order and the tracks the DJ needs.
          </p>
        </div>
        {!isLoading && events.length > 0 ? bookButton : null}
      </header>

      {error ? (
        <div role="alert" className="mt-6 rounded-lg border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            className="motion-focus mt-2 text-sm font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!isLoading && artistsWithShows.length > 1 ? (
        <div role="group" aria-label="Show shows for" className="mt-5 flex flex-wrap gap-1.5">
          {[{ id: null as string | null, name: 'All artists' }, ...artistsWithShows].map((artist) => {
            const active = activeFilter === artist.id;
            return (
              <button
                key={artist.id ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setArtistFilter(artist.id)}
                className={`motion-focus inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-stroke-default text-content-secondary hover:text-content-primary'
                }`}
              >
                {active ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                {artist.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <ListSkeleton />
        ) : events.length === 0 && !error ? (
          artists.length === 0 ? (
            <EmptyState
              title="Add an artist first"
              description="Every show belongs to an artist. Add one in Settings, then book their first date."
              action={
                <Link
                  href={settingsDeepLink({ segment: 'artists', section: 'artists' })}
                  onClick={openSettingsOnClick}
                  className="motion-focus motion-press inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Add an artist
                </Link>
              }
            />
          ) : canBook ? (
            <EmptyState
              title="No shows yet"
              description="Book the next date, build the set against the slot you were given and send the DJ the tracks."
              action={bookButton}
            />
          ) : (
            <EmptyState
              title="No shows yet"
              description="When your team books a date, it will show up here."
            />
          )
        ) : (
          <>
            {upcoming.length > 0 ? (
              <EntryList entries={upcoming} now={now} />
            ) : (
              <p className="rounded-xl border border-dashed border-stroke-default p-5 text-center text-sm text-content-secondary">
                {filterName ? `Nothing coming up for ${filterName}.` : 'Nothing coming up.'}
              </p>
            )}

            {past.length > 0 ? (
              <section className="mt-8">
                <button
                  type="button"
                  onClick={() => setShowPast((open) => !open)}
                  aria-expanded={showPast}
                  aria-controls="past-shows"
                  className="motion-focus inline-flex items-center gap-1.5 text-sm font-semibold text-content-secondary hover:text-content-primary"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showPast ? '' : '-rotate-90'}`}
                    aria-hidden
                  />
                  Past shows ({pastCount})
                </button>
                {showPast ? (
                  <div id="past-shows" className="mt-3">
                    <EntryList entries={past} now={now} />
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </div>

      {isCreateOpen ? (
        <CreateShowModal
          artists={bookableArtists}
          onClose={() => setIsCreateOpen(false)}
          onCreated={(event) => {
            setIsCreateOpen(false);
            router.push(`/dashboard/shows/${event.id}`);
          }}
          // A festival has no single show to open; the grouped list is the
          // right landing, and the store has already refreshed it.
          onCreatedSeries={() => setIsCreateOpen(false)}
        />
      ) : null}
    </div>
  );
}
