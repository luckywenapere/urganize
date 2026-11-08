'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, X } from '@/components/icons';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import type { PlanDateTask } from '@/lib/plan-dates';
import { describeDateChange, earliestPickableDay } from '@/lib/release-date-change';
import { scheduleRelease } from '@/lib/schedule-release-client';
import { useDialogFocus } from '@/lib/use-dialog-focus';

/** "Friday 12 Dec", read as a calendar day (no time zone shift). */
function formatDropDay(ymd: string): string {
  const parsed = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

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
  /** The plan on screen, for the "what moves" line before saving. Optional:
   *  without it the sheet just saves, and the toast says what moved. */
  tasks?: readonly PlanDateTask[];
  onDismiss: () => void;
  /** Fired on a clean save with the toast message. */
  onSaved: (message: string) => void;
};

/**
 * Change release date (#1128, founder approved mock, Nov 8, 2026): the date
 * comes first, the sheet says what will move before you save (same rule the
 * save uses, lib/release-date-change.ts), and the name sits behind a small
 * Rename link. Opened from the Rollout menu, the phone's date line, the
 * Spotify pitch banner and the Distribute checklist.
 *
 * History: edit a rollout's title and release day once it already has both. Until now
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
  tasks,
  onDismiss,
  onSaved,
}: ReleaseDetailsSheetProps) {
  const [title, setTitle] = useState(releaseTitle);
  const [date, setDate] = useState((releaseDate ?? '').slice(0, 10));
  const [isRenaming, setIsRenaming] = useState(false);
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
  useDialogFocus(true, panelRef, { onBackClose: onDismiss });

  // Anchored once per mount so the `min` attribute can't shift mid-interaction.
  const todayYmd = useMemo(() => formatYmdLocal(new Date()), []);
  const currentYmd = (releaseDate ?? '').slice(0, 10);
  const minYmd = earliestPickableDay(currentYmd, todayYmd);

  const trimmedTitle = title.trim();
  const titleChanged = trimmedTitle !== releaseTitle.trim();
  const dateChanged = date !== currentYmd;
  const preview = useMemo(
    () => (tasks && dateChanged ? describeDateChange(tasks, currentYmd, date) : null),
    [tasks, dateChanged, currentYmd, date]
  );
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
        aria-labelledby="release-date-sheet-title"
        onSubmit={(event) => void handleSubmit(event)}
        className="task-outcome-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] focus-visible:outline-none sm:max-w-md sm:rounded-2xl sm:border"
      >
        <div className="shrink-0 px-5 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{releaseTitle}</span>
            </p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className="hit-44 relative motion-focus motion-press grid h-9 w-9 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <h2 id="release-date-sheet-title" className="mt-2 font-display text-xl font-semibold text-content-primary">
            Change release date
          </h2>
          {currentYmd ? (
            <p className="mt-1 text-sm text-content-secondary">
              {currentYmd < todayYmd ? 'Dropped' : 'Now dropping'} {formatDropDay(currentYmd)}.
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-content-primary">New release date</span>
            <input
              type="date"
              min={minYmd ?? undefined}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={isSaving}
              aria-label="New release date"
              className="input h-11 rounded-lg border-stroke-control bg-bg-elevated"
            />
          </label>

          {preview ? (
            <p aria-live="polite" className="mt-3 rounded-xl bg-brand/10 px-3 py-2.5 text-sm text-content-primary">
              <span className="font-semibold">{preview.headline}</span>
              {preview.detail ? (
                <>
                  <br />
                  <span className="text-content-secondary">{preview.detail}</span>
                </>
              ) : null}
            </p>
          ) : currentYmd && tasks && tasks.length > 0 ? (
            <p className="mt-3 text-sm text-content-tertiary">Pick a day and we&apos;ll show what moves with it.</p>
          ) : null}

          <div className="mt-4 border-t border-stroke-subtle pt-3">
            {isRenaming ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-content-primary">Name</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isSaving}
                  maxLength={140}
                  autoFocus
                  className="input h-10 rounded-lg border-stroke-control bg-bg-elevated"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-content-secondary">Name: {releaseTitle}</span>
                <button
                  type="button"
                  onClick={() => setIsRenaming(true)}
                  disabled={isSaving}
                  className="motion-focus shrink-0 rounded-md px-1 font-medium text-brand hover:underline"
                >
                  Rename
                </button>
              </div>
            )}
          </div>

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
            {isSaving ? 'Saving…' : dateChanged || !titleChanged ? 'Move release date' : 'Save name'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
