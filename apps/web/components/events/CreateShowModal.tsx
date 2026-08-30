'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useEventsStore } from '@/stores/useEventsStore';
import {
  DEFAULT_SET_LENGTH_MINUTES,
  DEFAULT_TIMEZONE,
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
};

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
 */
export function CreateShowModal({ artists, onClose, onCreated }: CreateShowModalProps) {
  const create = useEventsStore((state) => state.create);

  const [artistId, setArtistId] = useState(artists[0]?.id ?? '');
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

  const canSubmit = useMemo(
    () => Boolean(artistId) && title.trim().length > 0 && !isSaving,
    [artistId, title, isSaving]
  );

  if (!isMounted) return null;

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError('');

    const minutes = Number.parseInt(setLength, 10);
    const result = await create({
      artistId,
      title: title.trim(),
      venueName: venueName.trim() || undefined,
      city: city.trim() || undefined,
      timezone,
      setLengthMinutes: Number.isFinite(minutes) ? minutes : DEFAULT_SET_LENGTH_MINUTES,
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
            <h2 className="font-display text-lg font-semibold text-content-primary">Book a show</h2>
            <p className="mt-1 text-sm text-content-secondary">
              The name is enough for now. Fill the rest in as it firms up.
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

        <div className="mt-4 space-y-3">
          {showArtistPicker ? (
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

          <label className="block">
            <span className={labelClass}>Show name</span>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Set starts</span>
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
            Book it
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
