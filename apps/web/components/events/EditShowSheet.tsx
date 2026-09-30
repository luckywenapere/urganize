'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from '@/components/icons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useEventsStore, type ShowPatch } from '@/stores/useEventsStore';
import {
  MAX_EVENT_NOTES_LENGTH,
  MAX_EVENT_TEXT_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
  MAX_SET_LENGTH_MINUTES,
  MIN_SET_LENGTH_MINUTES,
  localPartsInZone,
  toIsoInZone,
} from '@/lib/events';
import { TimezoneSelect } from './TimezoneSelect';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import type { ShowEvent } from '@/types/events';

type EditShowSheetProps = {
  event: ShowEvent;
  onClose: () => void;
  onSaved: (event: ShowEvent) => void;
  /** Present only for someone who may delete the show (the team owner). */
  onRequestDelete?: () => void;
};

/** The show's start as the venue's wall clock, ready for a date-and-time field. */
function wallClockOf(event: ShowEvent): string {
  const parts = localPartsInZone(event.setStartAt, event.timezone);
  return parts ? `${parts.date}T${parts.time}` : '';
}

/**
 * Edit a show. Every field the show carries, most of which had no input
 * anywhere before 2026-09-25 (venue, stage, promoter, country and notes could
 * be set at booking or never).
 *
 * Saves only what changed, like every Shows patch, so two people editing
 * different fields of the same show do not overwrite each other.
 *
 * THE TIME IS THE VENUE'S WALL CLOCK, and changing the zone keeps it: the
 * field shows 21:30, you pick London, it is 21:30 in London. Moving the time
 * moves the run of show and the DJ's link expiry with it (the server does
 * both), which is what rescheduling a night means.
 *
 * The artist is fixed: a show is booked for an artist, and moving it to
 * another would move its sets away from the songs they were built from.
 */
export function EditShowSheet({ event, onClose, onSaved, onRequestDelete }: EditShowSheetProps) {
  const update = useEventsStore((state) => state.update);
  const initialStart = useMemo(() => wallClockOf(event), [event]);

  const [title, setTitle] = useState(event.title);
  const [localStart, setLocalStart] = useState(initialStart);
  const [timezone, setTimezone] = useState(event.timezone);
  const [setLength, setSetLength] = useState(String(event.setLengthMinutes));
  const [venueName, setVenueName] = useState(event.venueName ?? '');
  const [city, setCity] = useState(event.city ?? '');
  const [country, setCountry] = useState(event.country ?? '');
  const [stage, setStage] = useState(event.stage ?? '');
  const [promoterName, setPromoterName] = useState(event.promoterName ?? '');
  const [promoterPhone, setPromoterPhone] = useState(event.promoterPhone ?? '');
  const [notes, setNotes] = useState(event.notes ?? '');
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null);
  // Focus moves in, Tab stays in, and focus returns to the opener on close.
  useDialogFocus(true, dialogRef);

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSaving, onClose]);

  useEffect(() => lockBodyScroll(), []);

  const minutes = /^\d+$/.test(setLength.trim()) ? Number.parseInt(setLength, 10) : null;
  const errors: Partial<Record<'title' | 'setLength', string>> = {};
  if (!title.trim()) errors.title = 'Give the show a name.';
  if (minutes === null || minutes < MIN_SET_LENGTH_MINUTES || minutes > MAX_SET_LENGTH_MINUTES) {
    errors.setLength = `Between ${MIN_SET_LENGTH_MINUTES} and ${MAX_SET_LENGTH_MINUTES} minutes.`;
  }

  // Opened by a tap, so this never renders on the server.
  if (typeof document === 'undefined') return null;

  /** Only the fields that changed, in the API's own names. */
  const buildPatch = (): ShowPatch => {
    const patch: ShowPatch = {};
    const text = (value: string) => value.trim() || null;
    if (title.trim() !== event.title) patch.title = title.trim();
    if (timezone !== event.timezone) patch.timezone = timezone;
    // A new wall clock, or the same wall clock in a new zone, is a new moment.
    if (localStart !== initialStart || timezone !== event.timezone) {
      patch.setStartAt = localStart ? toIsoInZone(localStart, timezone) : null;
    }
    if (minutes !== null && minutes !== event.setLengthMinutes) patch.setLengthMinutes = minutes;
    if (text(venueName) !== event.venueName) patch.venueName = text(venueName);
    if (text(city) !== event.city) patch.city = text(city);
    if (text(country) !== event.country) patch.country = text(country);
    if (text(stage) !== event.stage) patch.stage = text(stage);
    if (text(promoterName) !== event.promoterName) patch.promoterName = text(promoterName);
    if (text(promoterPhone) !== event.promoterPhone) patch.promoterPhone = text(promoterPhone);
    if (text(notes) !== event.notes) patch.notes = text(notes);
    return patch;
  };

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (isSaving) return;
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError('');
    const result = await update(event.id, patch);
    setIsSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSaved({ ...result.event, artistName: result.event.artistName || event.artistName });
  };

  const fieldClass =
    'w-full rounded-lg border border-stroke-default bg-bg-base px-3 py-2 text-content-primary outline-none transition-colors focus:border-brand';
  const labelClass = 'block text-xs font-semibold text-content-secondary';
  const groupClass = 'space-y-3 rounded-xl border border-stroke-subtle p-3';
  const errorText = (message?: string) =>
    showErrors && message ? <span role="alert" className="mt-1 block text-xs text-status-error">{message}</span> : null;

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
        aria-labelledby="edit-show-title"
        onSubmit={handleSubmit}
        noValidate
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-stroke-default bg-bg-surface sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stroke-subtle px-5 py-3">
          <button
            type="button"
            onClick={() => !isSaving && onClose()}
            className="motion-focus rounded-lg px-1 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            Cancel
          </button>
          <h2 id="edit-show-title" className="font-display text-base font-semibold text-content-primary">
            Edit show
          </h2>
          <button
            type="submit"
            disabled={isSaving}
            className="motion-focus inline-flex items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-brand hover:text-brand-hover disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {event.artistName ? (
            <p className="text-xs text-content-tertiary">
              A show for <span className="font-semibold text-content-secondary">{event.artistName}</span>
            </p>
          ) : null}

          <div className={groupClass}>
            <label className="block">
              <span className={labelClass}>Show name</span>
              <input
                value={title}
                maxLength={MAX_EVENT_TITLE_LENGTH}
                onChange={(changeEvent) => setTitle(changeEvent.target.value)}
                aria-invalid={showErrors && Boolean(errors.title)}
                className={`${fieldClass} mt-1`}
              />
              {errorText(errors.title)}
            </label>
          </div>

          <div className={groupClass}>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <label className="block min-w-0">
                <span className={labelClass}>Set starts</span>
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
            {localStart ? null : (
              <p className="text-xs text-content-tertiary">No time yet. The show reads “Date to confirm”.</p>
            )}
            <label className="block">
              <span className={labelClass}>Venue’s timezone</span>
              <TimezoneSelect value={timezone} onChange={setTimezone} className={`${fieldClass} mt-1 text-sm`} />
              <span className="mt-1 block text-xs text-content-tertiary">
                Changing this keeps the time as typed, on the new city’s clock.
              </span>
            </label>
          </div>

          <div className={groupClass}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Venue</span>
                <input
                  value={venueName}
                  maxLength={MAX_EVENT_TEXT_LENGTH}
                  onChange={(changeEvent) => setVenueName(changeEvent.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Stage</span>
                <input
                  value={stage}
                  maxLength={MAX_EVENT_TEXT_LENGTH}
                  onChange={(changeEvent) => setStage(changeEvent.target.value)}
                  placeholder="Main stage"
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className={labelClass}>City</span>
                <input
                  value={city}
                  maxLength={MAX_EVENT_TEXT_LENGTH}
                  onChange={(changeEvent) => setCity(changeEvent.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Country</span>
                <input
                  value={country}
                  maxLength={MAX_EVENT_TEXT_LENGTH}
                  onChange={(changeEvent) => setCountry(changeEvent.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>
            </div>
          </div>

          <div className={groupClass}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Promoter</span>
                <input
                  value={promoterName}
                  maxLength={MAX_EVENT_TEXT_LENGTH}
                  onChange={(changeEvent) => setPromoterName(changeEvent.target.value)}
                  autoComplete="off"
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Promoter’s phone</span>
                <input
                  type="tel"
                  value={promoterPhone}
                  maxLength={MAX_EVENT_TEXT_LENGTH}
                  onChange={(changeEvent) => setPromoterPhone(changeEvent.target.value)}
                  autoComplete="off"
                  className={`${fieldClass} mt-1`}
                />
              </label>
            </div>
            <label className="block">
              <span className={labelClass}>Notes</span>
              <textarea
                value={notes}
                maxLength={MAX_EVENT_NOTES_LENGTH}
                onChange={(changeEvent) => setNotes(changeEvent.target.value)}
                rows={3}
                placeholder="Parking, hospitality, who to ask for at the door"
                className={`${fieldClass} mt-1 resize-y`}
              />
            </label>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error"
            >
              {error}
            </p>
          ) : null}

          {onRequestDelete ? (
            <button
              type="button"
              onClick={onRequestDelete}
              disabled={isSaving}
              className="motion-focus w-full rounded-xl border border-stroke-subtle py-2.5 text-sm font-semibold text-status-error hover:bg-status-error/10 disabled:opacity-50"
            >
              Delete show
            </button>
          ) : null}
        </div>

      </form>
    </div>,
    document.body
  );
}
