'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { createPortal } from 'react-dom';
import { CalendarPlus, X } from '@/components/icons';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { scheduleRelease } from '@/lib/schedule-release-client';
import { getTemplateStats } from '@/lib/release-templates/loader';
import { DEFAULT_RELEASE_TITLE, isDefaultReleaseTitle, type DbReleaseType } from '@/types/releases';

const SWIPE_DISMISS_PX = 80;

const RELEASE_TYPE_LABELS: Record<DbReleaseType, string> = {
  single: 'single',
  ep: 'EP',
  album: 'album',
};

function formatYmdLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type ReleaseSetupSheetProps = {
  releaseId: string;
  /** Current title — decides whether the name field shows (only while the
   * release still carries the server default; someone who named it already
   * doesn't need the field). */
  releaseTitle: string;
  releaseType?: DbReleaseType;
  onDismiss: () => void;
  /** Fired on a clean save with the toast message; the parent closes the
   * sheet and shows the toast. */
  onSaved: (message: string) => void;
};

/**
 * The deferred "finish setting up" prompt for a type-first release
 * (NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE — founder call, 2026-09-01: tap the
 * type, land in the release, and only THEN get asked for the rest). Slides
 * up once per release after the user has explored a little — the trigger
 * logic lives in useReleaseSetupPrompt; this is just the sheet.
 *
 * Mechanics follow the TaskOutcomeSheet contract: z-[170], the shared
 * `task-outcome-sheet` entrance keyframe (never a second keyframe —
 * globals.css documents why), swipe-to-dismiss on the handle+header only,
 * backdrop/X dismissal, body scroll locked, and NO Escape handler on
 * purpose (the repo-wide rule: modal surfaces that own Escape already
 * exist, and a second window listener closes two things on one keypress).
 *
 * Unlike TaskOutcomeSheet this one portals to document.body: it is mounted
 * by WorkspaceView, which lives under AppShell's `lazy-fade` transform, and
 * any transformed ancestor turns `position: fixed` into "fixed relative to
 * that ancestor" (the DeleteReleaseDialog documented trap — TaskOutcomeSheet
 * only skips the portal because TaskUIProvider mounts outside that subtree).
 *
 * Dismissing is safe and quiet: the undismissable SetReleaseDateCard in the
 * activities panel remains the persistent route to the same two fields.
 */
export function ReleaseSetupSheet({
  releaseId,
  releaseTitle,
  releaseType = 'single',
  onDismiss,
  onSaved,
}: ReleaseSetupSheetProps) {
  // Never throws; falls back to the single playbook's numbers for a gated-off
  // type — which is also what would be instantiated.
  const { activityCount, spanWeeks } = useMemo(
    () => getTemplateStats(releaseType),
    [releaseType]
  );
  const [title, setTitle] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const isMounted = useRef(true);

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Anchored once per mount so the `min` attribute can't shift mid-interaction.
  const todayYmd = useMemo(() => formatYmdLocal(new Date()), []);

  // isDefaultReleaseTitle, not a bare === DEFAULT_RELEASE_TITLE — see the
  // identical fix in SetReleaseDateCard for why: a rollout titled "Untitled
  // release" (the pre-2026-09-09 default) is still unnamed and still needs
  // this field, and a strict comparison against only the current default
  // string was silently hiding it for every such row.
  const showNameField = isDefaultReleaseTitle(releaseTitle);
  const typeLabel = RELEASE_TYPE_LABELS[releaseType] ?? 'release';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!releaseDate || isSaving) return;

    setIsSaving(true);
    setError('');

    // Shared with SetReleaseDateCard — one 207 story, one toast copy, and
    // the forced store refresh that makes the plan appear.
    const outcome = await scheduleRelease(releaseId, {
      releaseDate,
      title: showNameField ? title : undefined,
    });
    if (!isMounted.current) return;

    if (outcome.kind === 'saved') {
      onSaved(outcome.message);
      return;
    }
    // 'partial' (the date IS saved, the plan build failed) and 'error' both
    // surface in place; the user can retry or dismiss.
    setError(outcome.message);
    setIsSaving(false);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
    setDragOffset(Math.max(0, delta));
  };

  const handleTouchEnd = () => {
    dragStartY.current = null;
    if (dragOffset > SWIPE_DISMISS_PX) {
      onDismiss();
      return;
    }
    setDragOffset(0);
  };

  const panelRef = useRef<HTMLFormElement>(null);
  useDialogFocus(true, panelRef);

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
        aria-label="Finish setting up this rollout"
        onSubmit={(event) => void handleSubmit(event)}
        className="task-outcome-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] sm:max-w-md sm:rounded-2xl sm:border"
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
            : { transform: 'translateY(0)', transition: 'transform 180ms var(--motion-out)' }
        }
      >
        {/* Drag region: the handle and header only, so swiping never fights
            the inputs' own interactions. */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 px-5 pt-3 sm:px-6"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Finish setting up
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
          <h2 className="font-display text-xl text-content-primary">
            {showNameField ? `Name your ${typeLabel} and pick the day` : 'Pick your release day'}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-content-secondary">
            Your rollout plan is ready to build. It has {activityCount} activities across ~
            {spanWeeks} weeks, all dated from your release day. Set the date and the whole
            plan appears.
          </p>

          {showNameField ? (
            <label className="mt-4 block">
              <span className="mb-1.5 flex items-baseline gap-2 text-xs font-medium text-content-primary">
                Title
                <span className="font-normal text-content-tertiary">Optional</span>
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isSaving}
                maxLength={140}
                placeholder={DEFAULT_RELEASE_TITLE}
                className="input h-10 rounded-lg border-stroke-default bg-bg-elevated"
              />
            </label>
          ) : null}

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-content-primary">
              Release date
            </span>
            <input
              type="date"
              min={todayYmd}
              value={releaseDate}
              onChange={(event) => setReleaseDate(event.target.value)}
              disabled={isSaving}
              aria-label="Release date"
              className="input h-10 rounded-lg border-stroke-default bg-bg-elevated"
            />
          </label>

          {error ? <p role="alert" className="mt-3 text-sm text-status-error">{error}</p> : null}

          <button
            type="submit"
            disabled={!releaseDate || isSaving}
            className="motion-focus motion-press mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-brand/25 bg-brand text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Building…' : 'Build my plan'}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            disabled={isSaving}
            className="motion-focus mt-3 block w-full text-center text-xs font-medium text-content-secondary underline decoration-content-tertiary underline-offset-4 transition-colors hover:text-content-primary"
          >
            I&apos;ll do this later
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
