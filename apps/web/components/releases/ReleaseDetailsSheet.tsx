'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, X } from '@/components/icons';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { scheduleRelease } from '@/lib/schedule-release-client';
import { useDialogFocus } from '@/lib/use-dialog-focus';

function formatYmdLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type ReleaseDetailsSheetProps = {
  releaseId: string;
  releaseTitle: string;
  /** The current release day, YYYY-MM-DD (any longer timestamp is cut to its date). */
  releaseDate: string | null;
  onDismiss: () => void;
  /** Fired on a clean save with the toast message. */
  onSaved: (message: string) => void;
};

/**
 * Edit a rollout's title and release day once it already has both. Until now
 * the only place to set a date was SetReleaseDateCard, which only shows while
 * the date is missing, so a rollout whose date needed to move had no way to.
 *
 * It saves through the same POST /schedule route as the setup card, and for
 * the same reason: that route is the one safe write for a sparse title + date
 * (the release PATCH is a full-row replace), and it re-dates every open
 * activity in the plan, so the pitch task and the rest move with the day.
 * Owner-only, like the route: the caller decides whether to offer it.
 *
 * Mechanics follow the other sheets: z-[170], portal to document.body (AppShell's
 * transform breaks position: fixed for descendants), body scroll locked, and no
 * Escape handler on purpose (modal surfaces that own Escape already exist).
 */
export function ReleaseDetailsSheet({
  releaseId,
  releaseTitle,
  releaseDate,
  onDismiss,
  onSaved,
}: ReleaseDetailsSheetProps) {
  const [title, setTitle] = useState(releaseTitle);
  const [date, setDate] = useState((releaseDate ?? '').slice(0, 10));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const isMounted = useRef(true);
  const panelRef = useRef<HTMLFormElement>(null);

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  useDialogFocus(true, panelRef);

  // Anchored once per mount so the `min` attribute can't shift mid-interaction.
  const todayYmd = useMemo(() => formatYmdLocal(new Date()), []);

  const trimmedTitle = title.trim();
  const titleChanged = trimmedTitle !== releaseTitle.trim();
  const dateChanged = date !== (releaseDate ?? '').slice(0, 10);
  const canSave = Boolean(date) && Boolean(trimmedTitle) && (titleChanged || dateChanged) && !isSaving;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setError('');
    const outcome = await scheduleRelease(releaseId, {
      releaseDate: date,
      title: titleChanged ? trimmedTitle : undefined,
    });
    if (!isMounted.current) return;
    if (outcome.kind === 'saved') {
      onSaved(outcome.message);
      return;
    }
    setError(outcome.message);
    setIsSaving(false);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <form
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        // TODO(copy): the briefs give no heading or button text for editing a rollout's title and date.
        aria-label="Rollout details"
        onSubmit={(event) => void handleSubmit(event)}
        className="task-outcome-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] focus-visible:outline-none sm:max-w-md sm:rounded-2xl sm:border"
      >
        <div className="shrink-0 px-5 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Rollout details
            </p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className="motion-focus motion-press grid h-9 w-9 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-content-primary">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isSaving}
              maxLength={140}
              className="input h-10 rounded-lg border-stroke-control bg-bg-elevated"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-content-primary">Release date</span>
            <input
              type="date"
              min={todayYmd}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={isSaving}
              aria-label="Release date"
              className="input h-10 rounded-lg border-stroke-control bg-bg-elevated"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-status-error">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSave}
            className="motion-focus motion-press mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-brand/25 bg-brand text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
