'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Layers, MapPin, Plus } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useEventsStore } from '@/stores/useEventsStore';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import {
  EVENT_STATUS_COPY,
  formatShowDateTime,
  groupShowsBySeries,
  shortTimezoneLabel,
  type ShowListEntry,
} from '@/lib/events';
import { CreateShowModal } from '@/components/events/CreateShowModal';
import type { ShowEvent } from '@/types/events';

// Same flag the API routes read. A direct link followed while the flag is off
// bounces to the workspace — the route has no server-side gate, since the flag
// is inlined at build time (the notes precedent).
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';

/** Draft and cancelled read as muted; a confirmed show is the one that matters
 *  on a schedule, so it carries the brand colour. */
const statusClass = (status: ShowEvent['status']): string => {
  if (status === 'confirmed') return 'border-brand/30 bg-brand/10 text-brand';
  if (status === 'cancelled') return 'border-status-error/30 bg-status-error/10 text-status-error';
  return 'border-stroke-default bg-bg-surface text-content-tertiary';
};

function ShowRow({ event }: { event: ShowEvent }) {
  const place = [event.venueName, event.city].filter(Boolean).join(', ');

  return (
    <Link
      href={`/dashboard/shows/${event.id}`}
      className="motion-focus block rounded-xl border border-stroke-default bg-bg-surface p-4 transition-colors hover:border-stroke-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {event.artistName ? (
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              {event.artistName}
            </p>
          ) : null}
          <h2 className="mt-1 truncate font-display text-base font-semibold text-content-primary">
            {event.title}
          </h2>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(
            event.status
          )}`}
        >
          {EVENT_STATUS_COPY[event.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-secondary">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {/* Venue local time, always — see formatShowDateTime. The zone is
              named beside it so nobody has to wonder whose clock this is. */}
          {formatShowDateTime(event.setStartAt, event.timezone)}
          {event.setStartAt ? (
            <span className="text-content-tertiary">{shortTimezoneLabel(event.timezone)}</span>
          ) : null}
        </span>
        {place ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {place}
          </span>
        ) : null}
        <span className="text-content-tertiary">{event.setLengthMinutes} min set</span>
      </div>
    </Link>
  );
}

/** A member of a series: the day and artist are the identity here, since the
 *  festival's name is already on the card above. */
function SeriesMemberRow({ event }: { event: ShowEvent }) {
  return (
    <Link
      href={`/dashboard/shows/${event.id}`}
      className="motion-focus flex items-center justify-between gap-3 rounded-lg border border-stroke-default bg-bg-base px-3 py-2.5 transition-colors hover:border-stroke-strong"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-content-primary">
          {event.seriesDay ? `Day ${event.seriesDay}` : event.title}
          {event.artistName ? (
            <span className="font-normal text-content-secondary"> · {event.artistName}</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-content-secondary">
          {formatShowDateTime(event.setStartAt, event.timezone)}
          <span className="text-content-tertiary"> · {event.setLengthMinutes} min set</span>
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(
          event.status
        )}`}
      >
        {EVENT_STATUS_COPY[event.status]}
      </span>
    </Link>
  );
}

/**
 * A festival: several single shows grouped by their series id. The card names
 * the run once; each member row below is a real show with its own page,
 * setlists and pack (see lib/events.ts "Series").
 */
function SeriesCard({ entry }: { entry: Extract<ShowListEntry<ShowEvent>, { kind: 'series' }> }) {
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
    entry.artistNames.length > 1
      ? `${entry.artistNames.length} artists`
      : entry.artistNames[0] || '';
  const summary = [entry.days > 1 ? `${entry.days} days` : null, who].filter(Boolean).join(' · ');

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            <Layers className="h-3 w-3" aria-hidden />
            Festival
          </p>
          <h2 className="mt-1 truncate font-display text-base font-semibold text-content-primary">
            {entry.title}
          </h2>
        </div>
        {summary ? (
          <span className="shrink-0 text-xs font-semibold text-content-secondary">{summary}</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-secondary">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {range}
        </span>
        {place ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {place}
          </span>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1.5">
        {entry.shows.map((show) => (
          <li key={show.id}>
            <SeriesMemberRow event={show} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ShowsPageClient() {
  const router = useRouter();
  const { isLoading: authLoading } = useAuthStore();
  const { events, isInitialLoading, error, load } = useEventsStore();
  const { artists, load: loadRoster } = useArtistRosterStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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

  if (!EVENTS_ENABLED) return null;

  const isLoading = authLoading || isInitialLoading;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
            Live
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Shows</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Every date, its running order, and the tracks the DJ needs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          disabled={artists.length === 0}
          className="motion-focus motion-press inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Book a show
        </button>
      </header>

      {error ? (
        <div className="mt-6 rounded-lg border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
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

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <>
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="h-[104px] animate-pulse rounded-xl border border-stroke-default bg-bg-surface"
              />
            ))}
          </>
        ) : events.length === 0 && !error ? (
          <div className="rounded-xl border border-dashed border-stroke-default p-8 text-center">
            <p className="text-sm font-semibold text-content-primary">No shows yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-content-secondary">
              {artists.length === 0
                ? 'Add an artist in Settings first, then book their first date.'
                : 'Book the next date and build the set against the slot you were given.'}
            </p>
          </div>
        ) : (
          groupShowsBySeries(events).map((entry) =>
            entry.kind === 'series' ? (
              <SeriesCard key={entry.seriesId} entry={entry} />
            ) : (
              <ShowRow key={entry.event.id} event={entry.event} />
            )
          )
        )}
      </div>

      {isCreateOpen ? (
        <CreateShowModal
          artists={artists}
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
