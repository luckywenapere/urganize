'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from '@/components/icons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useEventsStore } from '@/stores/useEventsStore';
import {
  DEFAULT_SET_LENGTH_MINUTES,
  DEFAULT_TIMEZONE,
  MAX_SERIES_DAYS,
  MAX_SET_LENGTH_MINUTES,
  MIN_SET_LENGTH_MINUTES,
  toIsoInZone,
} from '@/lib/events';
import type { ShowEvent } from '@/types/events';

type RosterArtist = { id: string; name: string };

type CreateShowModalProps = {
  artists: RosterArtist[];
  onClose: () => void;
  onCreated: (event: ShowEvent) => void;
  /** A series lands on the list rather than on one show — there is no single
   *  show to open. Optional so a caller that never offers the series mode
   *  (none today) need not handle it; falls back to onCreated with the first
   *  member. */
  onCreatedSeries?: (events: ShowEvent[]) => void;
};

/** One show, or several days and/or artists booked together as a series. */
type BookingMode = 'single' | 'series';

/** The browser's own guess, so a manager on tour does not have to hunt for
 *  their zone. Falls back to the founder's market. */
function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Book a show.
 *
 * Only the name is required — "we got the Lagos show" should take one field to
 * record, and the venue, the promoter and the exact set time arrive over the
 * following week. Everything else here is a convenience, not a gate.
 *
 * THE SET TIME IS ENTERED IN VENUE LOCAL TIME. A datetime-local input has no
 * zone of its own, so the string is combined with the chosen zone rather than
 * read as the browser's — otherwise a manager in Lagos booking a London show
 * would silently store the wrong instant. See toIsoInZone.
 *
 * SERIES MODE (design-partner ask, 2026-09-02): "several days or artists"
 * books a festival as one show per artist per day, every set the same length
 * ("7 days, 120 minutes each"), the same wall clock each day. The single-show
 * form is untouched by it — the mode only swaps the artist control for
 * checkboxes and adds a day count. See lib/events.ts "Series".
 */
export function CreateShowModal({ artists, onClose, onCreated, onCreatedSeries }: CreateShowModalProps) {
  const create = useEventsStore((state) => state.create);
  const createSeries = useEventsStore((state) => state.createSeries);

  const [mode, setMode] = useState<BookingMode>('single');
  const [artistId, setArtistId] = useState(artists[0]?.id ?? '');
  // Series mode's own selection. Seeded with every roster artist, because a
  // festival that books "the roster" is the common case and unticking is
  // cheaper than ticking.
  const [seriesArtistIds, setSeriesArtistIds] = useState<string[]>(() => artists.map((artist) => artist.id));
  const [days, setDays] = useState('1');
  const [title, setTitle] = useState('');
  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('');
  const [localStart, setLocalStart] = useState('');
  const [setLength, setSetLength] = useState(String(DEFAULT_SET_LENGTH_MINUTES));
  const [timezone, setTimezone] = useState(guessTimezone);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSaving, onClose]);

  useEffect(() => lockBodyScroll(), []);

  // Only offered when there is a genuine choice — the release-type picker's
  // rule. A one-artist team sees the form it would have seen anyway.
  const showArtistPicker = artists.length > 1;
  const isSeries = mode === 'series';

  const canSubmit = useMemo(() => {
    if (isSaving || title.trim().length === 0) return false;
    return isSeries ? seriesArtistIds.length > 0 : Boolean(artistId);
  }, [artistId, isSaving, isSeries, seriesArtistIds.length, title]);

  if (!isMounted) return null;

  const toggleSeriesArtist = (id: string) => {
    setSeriesArtistIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError('');

    const minutes = Number.parseInt(setLength, 10);
    const setLengthMinutes = Number.isFinite(minutes) ? minutes : DEFAULT_SET_LENGTH_MINUTES;

    if (isSeries) {
      const dayCount = Number.parseInt(days, 10);
      const result = await createSeries({
        seriesTitle: title.trim(),
        // Roster order, not tick order, so Day 1 reads the way the roster does.
        artistIds: artists.map((artist) => artist.id).filter((id) => seriesArtistIds.includes(id)),
        days: Number.isFinite(dayCount) ? dayCount : 1,
        firstDayLocalStart: localStart || null,
        venueName: venueName.trim() || undefined,
        city: city.trim() || undefined,
        timezone,
        setLengthMinutes,
      });
      setIsSaving(false);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      if (onCreatedSeries) {
        onCreatedSeries(result.events);
      } else if (result.events[0]) {
        onCreated(result.events[0]);
      }
      return;
    }

    const result = await create({
      artistId,
      title: title.trim(),
      venueName: venueName.trim() || undefined,
      city: city.trim() || undefined,
      timezone,
      setLengthMinutes,
      setStartAt: localStart ? toIsoInZone(localStart, timezone) : null,
    });

    setIsSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onCreated(result.event);
  };

  const fieldClass =
    'w-full rounded-lg border border-stroke-default bg-bg-base px-3 py-2 text-content-primary outline-none transition-colors focus:border-brand';
  const labelClass = 'block text-xs font-semibold text-content-secondary';
  const modeClass = (active: boolean) =>
    `motion-focus flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? 'bg-bg-surface text-content-primary shadow-sm'
        : 'text-content-secondary hover:text-content-primary'
    }`;

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !isSaving && onClose()}
        className="absolute inset-0 bg-black/50"
      />
      <form
        onSubmit={handleSubmit}
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-stroke-default bg-bg-surface p-5 sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-content-primary">
              {isSeries ? 'Book a festival' : 'Book a show'}
            </h2>
            <p className="mt-1 text-sm text-content-secondary">
              {isSeries
                ? 'One show per artist per day, each with its own set. Every set runs the same length.'
                : 'The name is enough for now. Fill the rest in as it firms up.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !isSaving && onClose()}
            aria-label="Close"
            className="motion-focus rounded-lg p-1 text-content-tertiary hover:text-content-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Mode switch. A real radiogroup rather than tabs: it changes what is
            booked, not which panel is shown. */}
        <div
          role="radiogroup"
          aria-label="What are you booking?"
          className="mt-4 flex gap-1 rounded-lg border border-stroke-default bg-bg-base p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!isSeries}
            onClick={() => setMode('single')}
            className={modeClass(!isSeries)}
          >
            One show
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isSeries}
            onClick={() => setMode('series')}
            className={modeClass(isSeries)}
          >
            Several days or artists
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {!isSeries && showArtistPicker ? (
            <label className="block">
              <span className={labelClass}>Artist</span>
              <select
                value={artistId}
                onChange={(changeEvent) => setArtistId(changeEvent.target.value)}
                className={`${fieldClass} mt-1`}
              >
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isSeries && showArtistPicker ? (
            <fieldset>
              <legend className={labelClass}>Artists playing</legend>
              <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                {artists.map((artist) => {
                  const checked = seriesArtistIds.includes(artist.id);
                  return (
                    <label
                      key={artist.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        checked
                          ? 'border-brand bg-brand/10 text-content-primary'
                          : 'border-stroke-default text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSeriesArtist(artist.id)}
                        className="h-4 w-4 accent-[rgb(var(--color-brand))]"
                      />
                      <span className="truncate">{artist.name}</span>
                    </label>
                  );
                })}
              </div>
              {seriesArtistIds.length === 0 ? (
                <span className="mt-1 block text-xs text-status-error">Pick at least one artist.</span>
              ) : null}
            </fieldset>
          ) : null}

          <label className="block">
            <span className={labelClass}>{isSeries ? 'Festival name' : 'Show name'}</span>
            <input
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              placeholder="Flytime Fest"
              autoFocus
              className={`${fieldClass} mt-1`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Venue</span>
              <input
                value={venueName}
                onChange={(changeEvent) => setVenueName(changeEvent.target.value)}
                placeholder="Eko Hotel"
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="block">
              <span className={labelClass}>City</span>
              <input
                value={city}
                onChange={(changeEvent) => setCity(changeEvent.target.value)}
                placeholder="Lagos"
                className={`${fieldClass} mt-1`}
              />
            </label>
          </div>

          {isSeries ? (
            <label className="block">
              <span className={labelClass}>How many days</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_SERIES_DAYS}
                value={days}
                onChange={(changeEvent) => setDays(changeEvent.target.value)}
                className={`${fieldClass} mt-1`}
              />
              <span className="mt-1 block text-xs text-content-tertiary">
                Each day is its own show, at the same time on the venue&rsquo;s clock.
              </span>
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>{isSeries ? 'Day 1 set starts' : 'Set starts'}</span>
              <input
                type="datetime-local"
                value={localStart}
                onChange={(changeEvent) => setLocalStart(changeEvent.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="block">
              <span className={labelClass}>How long, in minutes</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_SET_LENGTH_MINUTES}
                max={MAX_SET_LENGTH_MINUTES}
                value={setLength}
                onChange={(changeEvent) => setSetLength(changeEvent.target.value)}
                className={`${fieldClass} mt-1`}
              />
              {isSeries ? (
                <span className="mt-1 block text-xs text-content-tertiary">Every set, every day.</span>
              ) : null}
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Venue timezone</span>
            <input
              value={timezone}
              onChange={(changeEvent) => setTimezone(changeEvent.target.value)}
              placeholder="Africa/Lagos"
              className={`${fieldClass} mt-1`}
            />
            <span className="mt-1 block text-xs text-content-tertiary">
              Set times are always shown in the venue&rsquo;s clock, not yours.
            </span>
          </label>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !isSaving && onClose()}
            className="motion-focus h-10 rounded-lg px-4 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isSeries ? 'Book them' : 'Book it'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
