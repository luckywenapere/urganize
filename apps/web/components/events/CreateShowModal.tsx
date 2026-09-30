'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from '@/components/icons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useEventsStore } from '@/stores/useEventsStore';
import {
  DEFAULT_SET_LENGTH_MINUTES,
  DEFAULT_TIMEZONE,
  MAX_EVENT_TITLE_LENGTH,
  MAX_SERIES_DAYS,
  MAX_SERIES_SHOWS,
  MAX_SET_LENGTH_MINUTES,
  MIN_SET_LENGTH_MINUTES,
  isValidTimezone,
  shortTimezoneLabel,
  toIsoInZone,
} from '@/lib/events';
import { TimezoneSelect } from './TimezoneSelect';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';
import type { ShowEvent } from '@/types/events';

type RosterArtist = { id: string; name: string };

type CreateShowModalProps = {
  /** Only the artists this person may book for (GET /api/events says which). */
  artists: RosterArtist[];
  onClose: () => void;
  onCreated: (event: ShowEvent) => void;
  /** A festival lands on the list rather than on one show — there is no single
   *  show to open. Falls back to onCreated with the first member. */
  onCreatedSeries?: (events: ShowEvent[]) => void;
};

type BookingMode = 'single' | 'series';

/** The browser's own zone, so a manager at home does not have to pick it.
 *  Falls back to the founder's market. */
function guessTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const parseWhole = (raw: string): number | null => {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
};

/**
 * Book a show, or a festival.
 *
 * Only the name is required — "we got the Lagos show" should take one field to
 * record, and the venue and the exact time arrive over the following week.
 *
 * THE TIME IS ENTERED IN THE VENUE'S CLOCK. A date-and-time field has no zone
 * of its own, so what is typed is read in the zone shown under it (see
 * toIsoInZone) — otherwise a manager in Lagos booking a London show would
 * silently store the wrong moment. Changing the zone keeps the time as typed:
 * "21:30" stays 21:30, now in the new city.
 *
 * FESTIVAL: one show per artist per day, every set the same length and the
 * same time each day. The button says how many shows it will book, because
 * that number is the consequence of pressing it.
 */
export function CreateShowModal({ artists, onClose, onCreated, onCreatedSeries }: CreateShowModalProps) {
  const create = useEventsStore((state) => state.create);
  const createSeries = useEventsStore((state) => state.createSeries);

  const [mode, setMode] = useState<BookingMode>('single');
  const [artistId, setArtistId] = useState(artists[0]?.id ?? '');
  // A festival usually books the roster, so every artist starts ticked and
  // unticking is the cheaper move.
  const [seriesArtistIds, setSeriesArtistIds] = useState<string[]>(() => artists.map((artist) => artist.id));
  const [days, setDays] = useState('1');
  const [title, setTitle] = useState('');
  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('');
  const [localStart, setLocalStart] = useState('');
  const [setLength, setSetLength] = useState(String(DEFAULT_SET_LENGTH_MINUTES));
  const [timezone, setTimezone] = useState(guessTimezone);
  const [isChoosingZone, setIsChoosingZone] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null);
  // Focus moves in, Tab stays in, and focus returns to the opener on close.
  useDialogFocus(true, dialogRef);
  // When the sheet opened: close enough to "now" for a note about a past date.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSaving, onClose]);

  useEffect(() => lockBodyScroll(), []);

  const isSeries = mode === 'series';
  const showArtistPicker = artists.length > 1;

  const minutes = parseWhole(setLength);
  const dayCount = parseWhole(days);
  const pickedArtists = isSeries ? seriesArtistIds.length : artistId ? 1 : 0;
  const showCount = isSeries ? (dayCount ?? 0) * pickedArtists : 1;

  const errors = useMemo(() => {
    const found: Partial<Record<'title' | 'setLength' | 'days' | 'artists', string>> = {};
    if (!title.trim()) found.title = isSeries ? 'Give the festival a name.' : 'Give the show a name.';
    if (minutes === null || minutes < MIN_SET_LENGTH_MINUTES || minutes > MAX_SET_LENGTH_MINUTES) {
      found.setLength = `Between ${MIN_SET_LENGTH_MINUTES} and ${MAX_SET_LENGTH_MINUTES} minutes.`;
    }
    if (isSeries) {
      if (dayCount === null || dayCount < 1 || dayCount > MAX_SERIES_DAYS) {
        found.days = `Between 1 and ${MAX_SERIES_DAYS} days.`;
      } else if (pickedArtists > 0 && dayCount * pickedArtists > MAX_SERIES_SHOWS) {
        found.days = `That is ${dayCount * pickedArtists} shows. Keep it to ${MAX_SERIES_SHOWS} and book the rest separately.`;
      }
      if (pickedArtists === 0) found.artists = 'Pick at least one artist.';
    } else if (!artistId) {
      found.artists = 'Pick the artist.';
    }
    return found;
  }, [artistId, dayCount, isSeries, minutes, pickedArtists, title]);

  const hasErrors = Object.keys(errors).length > 0;

  // A gentle note, not a refusal: logging a show that already happened is a
  // real thing to do.
  const startsInPast = useMemo(() => {
    if (!localStart) return false;
    const iso = toIsoInZone(localStart, timezone);
    return iso ? Date.parse(iso) < openedAt : false;
  }, [localStart, openedAt, timezone]);

  // Opened by a tap, so this never renders on the server.
  if (typeof document === 'undefined') return null;

  const toggleSeriesArtist = (id: string) => {
    setSeriesArtistIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (isSaving) return;
    if (hasErrors) {
      setShowErrors(true);
      return;
    }

    setIsSaving(true);
    setError('');
    const setLengthMinutes = minutes ?? DEFAULT_SET_LENGTH_MINUTES;

    if (isSeries) {
      const result = await createSeries({
        seriesTitle: title.trim(),
        // Roster order, not tick order, so each day reads the way the roster does.
        artistIds: artists.map((artist) => artist.id).filter((id) => seriesArtistIds.includes(id)),
        days: dayCount ?? 1,
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
      if (onCreatedSeries) onCreatedSeries(result.events);
      else if (result.events[0]) onCreated(result.events[0]);
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
  const errorText = (message?: string) =>
    showErrors && message ? <span role="alert" className="mt-1 block text-xs text-status-error">{message}</span> : null;
  const segmentClass = (active: boolean) =>
    `motion-focus flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'bg-bg-surface text-content-primary shadow-sm' : 'text-content-secondary hover:text-content-primary'
    }`;

  const submitLabel = isSeries
    ? `Book ${showCount > 0 ? showCount : ''} ${showCount === 1 ? 'show' : 'shows'}`.replace(/\s+/g, ' ')
    : 'Book show';

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => !isSaving && onClose()}
        className="absolute inset-0 bg-black/50"
      />
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-show-title"
        onSubmit={handleSubmit}
        noValidate
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-stroke-default bg-bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="book-show-title" className="font-display text-lg font-semibold text-content-primary">
            {isSeries ? 'Book a festival' : 'Book a show'}
          </h2>
          <button
            type="button"
            onClick={() => !isSaving && onClose()}
            aria-label="Close"
            className="motion-focus -m-1 rounded-lg p-1 text-content-tertiary hover:text-content-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* A real radiogroup rather than tabs: it changes what is booked. */}
        <div
          role="radiogroup"
          aria-label="What are you booking?"
          onKeyDown={(keyEvent) =>
            onRadioGroupKeyDown(keyEvent, isSeries ? 1 : 0, (index) => setMode(index === 0 ? 'single' : 'series'))
          }
          className="mt-4 flex gap-1 rounded-lg border border-stroke-default bg-bg-base p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!isSeries}
            tabIndex={!isSeries ? 0 : -1}
            onClick={() => setMode('single')}
            className={segmentClass(!isSeries)}
          >
            One show
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isSeries}
            tabIndex={isSeries ? 0 : -1}
            onClick={() => setMode('series')}
            className={segmentClass(isSeries)}
          >
            Festival
          </button>
        </div>
        {isSeries ? (
          <p className="mt-2 text-xs text-content-tertiary">
            One show for each artist on each day, every one with its own set.
          </p>
        ) : null}

        <div className="mt-4 space-y-3.5">
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
              {errorText(errors.artists)}
            </label>
          ) : null}

          <label className="block">
            <span className={labelClass}>{isSeries ? 'Festival name' : 'Show name'}</span>
            <input
              value={title}
              maxLength={MAX_EVENT_TITLE_LENGTH}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              placeholder={isSeries ? 'Flytime Fest' : 'Eko Hotel, New Year’s Eve'}
              data-autofocus
              aria-invalid={showErrors && Boolean(errors.title)}
              className={`${fieldClass} mt-1`}
            />
            {errorText(errors.title)}
          </label>

          {isSeries && showArtistPicker ? (
            <fieldset>
              <legend className={labelClass}>Who’s playing</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {artists.map((artist) => {
                  const checked = seriesArtistIds.includes(artist.id);
                  return (
                    <label
                      key={artist.id}
                      className={`motion-focus inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand ${
                        checked
                          ? 'border-brand bg-brand/10 text-content-primary'
                          : 'border-stroke-default text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSeriesArtist(artist.id)}
                        className="sr-only"
                      />
                      {artist.name}
                    </label>
                  );
                })}
              </div>
              {errorText(errors.artists)}
            </fieldset>
          ) : null}

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="block min-w-0">
              <span className={labelClass}>{isSeries ? 'Day 1 set starts' : 'Set starts'}</span>
              <input
                type="datetime-local"
                value={localStart}
                onChange={(changeEvent) => setLocalStart(changeEvent.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="block w-28">
              <span className={labelClass}>Set length</span>
              <span className="relative mt-1 block">
                <input
                  type="text"
                  inputMode="numeric"
                  value={setLength}
                  onChange={(changeEvent) => setSetLength(changeEvent.target.value.replace(/[^\d]/g, ''))}
                  aria-invalid={showErrors && Boolean(errors.setLength)}
                  aria-label="Set length in minutes"
                  className={`${fieldClass} pr-11`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-content-tertiary">
                  min
                </span>
              </span>
            </label>
          </div>
          {errorText(errors.setLength)}

          {/* The zone as a sentence, not a field: most shows are in the zone the
              manager is sitting in, and "Change" is there for the rest. */}
          <div className="text-xs text-content-tertiary">
            {isChoosingZone ? (
              <label className="block">
                <span className={labelClass}>Venue’s timezone</span>
                <TimezoneSelect
                  value={timezone}
                  onChange={setTimezone}
                  className={`${fieldClass} mt-1 text-sm`}
                />
                <span className="mt-1 block">
                  Set times always show on the venue’s clock. Changing this keeps the time you typed.
                </span>
              </label>
            ) : (
              <p>
                Times are {shortTimezoneLabel(timezone)} time.{' '}
                <button
                  type="button"
                  onClick={() => setIsChoosingZone(true)}
                  className="motion-focus font-semibold text-content-secondary underline-offset-2 hover:text-content-primary hover:underline"
                >
                  Change
                </button>
              </p>
            )}
            {startsInPast ? <p className="mt-1 text-status-warning">That time has already passed.</p> : null}
          </div>

          {isSeries ? (
            <label className="block w-32">
              <span className={labelClass}>How many days</span>
              <input
                type="text"
                inputMode="numeric"
                value={days}
                onChange={(changeEvent) => setDays(changeEvent.target.value.replace(/[^\d]/g, ''))}
                aria-invalid={showErrors && Boolean(errors.days)}
                className={`${fieldClass} mt-1`}
              />
            </label>
          ) : null}
          {isSeries ? errorText(errors.days) : null}

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
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error"
          >
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
            disabled={isSaving}
            className="motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
