'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';
import { scheduleRelease } from '@/lib/schedule-release-client';
import { DEFAULT_RELEASE_TITLE, isDefaultReleaseTitle, type DbReleaseType } from '@/types/releases';
import { useHiddenNudge } from '@/lib/hidden-nudges';

function formatYmdLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type SetReleaseDateCardProps = {
  releaseId: string;
  releaseTitle: string;
  /** True when this release was created with the Rollout plan but has no date,
   * so its activities have not been generated yet. Setting the date is what
   * builds them, so the row says so and wears the brand tint. */
  templatePending: boolean;
  /** Which playbook this release follows. Kept on the props for the callers;
   * the row no longer quotes playbook numbers (2026-10-24). */
  releaseType?: DbReleaseType;
  onSaved: (message: string) => void;
  /** Opens the activity quick-create for this release. Only used by the
   * plan-waiting variant, where the row sits over an empty list and would
   * otherwise read as a prerequisite (URG-233). */
  onAddActivity: () => void;
};

/**
 * The release date as the rollout's FIRST ACTIVITY (2026-10-24, founder
 * approved mock "create-rollout-nodate"). The create modal no longer asks for
 * a date at all; instead any release without one gets this task-style row at
 * the top of its activities list: an open circle, "Set your release date",
 * one line on what it unlocks, and a "Pick date" button.
 *
 * It is a UI pseudo-task, not a task row in the database: it cannot be
 * assigned, dated or completed like one, and it disappears on its own the
 * moment the store reports a date (scheduleRelease runs the forced refresh).
 * Replaced the URG-230 banner card, which carried the same two weights:
 *   - `templatePending`: the whole rollout plan is waiting on this date, so the
 *     line reads "Builds the rest of your plan", the row is brand tinted, the
 *     picker offers a name while the release still has the default title (the
 *     card's rename affordance, kept), and a quiet "Add an activity yourself"
 *     line stays under it (URG-233: a date was never a prerequisite).
 *   - otherwise: nothing is blocked, so a quiet neutral row, "Unlocks calendar
 *     and due dates".
 *
 * Not dismissible in the pending case: it is the only route to the plan.
 * The quiet case has "Not now" (founder, Oct 31, 2026, #919): a date is
 * optional there, so it hides for this rollout in this browser.
 */
export function SetReleaseDateCard({
  releaseId,
  releaseTitle,
  templatePending,
  onSaved,
  onAddActivity,
}: SetReleaseDateCardProps) {
  const [isPicking, setIsPicking] = useState(false);
  const [notNow, hideRow] = useHiddenNudge(`set-release-date:${releaseId}`);
  const [releaseDate, setReleaseDate] = useState('');
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Anchored once per mount so the `min` attribute can't shift mid-interaction.
  const todayYmd = useMemo(() => formatYmdLocal(new Date()), []);

  // Offer the rename only while the release still carries a server-applied
  // default. isDefaultReleaseTitle (not a bare === DEFAULT_RELEASE_TITLE) also
  // catches rows created before the 2026-09-09 rename ("Untitled release").
  const showNameField = templatePending && isDefaultReleaseTitle(releaseTitle);

  // "Pick date" opens the picker: focus the field and, where the browser
  // allows it, open its native calendar straight away. showPicker throws when
  // the browser refuses (no user activation left, or unsupported), and the
  // focused field is still one tap from the calendar then.
  useEffect(() => {
    if (!isPicking) return;
    const input = dateInputRef.current;
    if (!input) return;
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // Focus alone is the fallback.
    }
  }, [isPicking]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!releaseDate || isSaving) return;

    setIsSaving(true);
    setError('');

    // Shared with ReleaseSetupSheet (lib/schedule-release-client.ts) so the
    // 207 handling and the toast copy cannot drift between the two surfaces.
    // The helper also runs the forced store refresh, which is what unmounts
    // this row once the store reports a date.
    const outcome = await scheduleRelease(releaseId, {
      releaseDate,
      title: showNameField ? title : undefined,
    });

    if (outcome.kind === 'saved') {
      onSaved(outcome.message);
    } else {
      // 'partial' (207: the date IS saved, the plan build failed) and 'error'
      // both surface in place rather than as a toast.
      setError(outcome.message);
    }
    setIsSaving(false);
  };

  if (notNow && !templatePending) return null;

  return (
    <div className="mb-4">
      <form
        onSubmit={handleSubmit}
        className={`rounded-xl border px-4 py-3.5 ${
          templatePending
            ? 'border-brand/40 bg-brand/[0.06]'
            : 'border-stroke-default bg-bg-surface'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 rounded-full border-2 ${
              templatePending ? 'border-brand/70' : 'border-stroke-control'
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-content-primary">Set your release date</p>
            <p
              className={`mt-0.5 text-xs ${
                templatePending ? 'text-brand' : 'text-content-tertiary'
              }`}
            >
              {templatePending ? 'Builds the rest of your plan' : 'Unlocks calendar and due dates'}
            </p>
          </div>
          {!isPicking ? (
            <Button
              type="button"
              size="sm"
              variant={templatePending ? 'primary' : 'secondary'}
              onClick={() => setIsPicking(true)}
              className="shrink-0"
            >
              Pick date
            </Button>
          ) : null}
          {!isPicking && !templatePending ? (
            <button
              type="button"
              onClick={hideRow}
              className="motion-focus -mr-2 inline-flex h-9 shrink-0 items-center rounded-lg px-2 text-xs font-medium text-content-secondary hover:text-content-primary"
            >
              Not now
            </button>
          ) : null}
        </div>

        {isPicking ? (
          // Indented to the text column so the eye runs title, then picker.
          <div className="mt-3 space-y-3 pl-[2.125rem]">
            {showNameField ? (
              <label className="block">
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
                  className="input h-10 rounded-lg border-stroke-control bg-bg-elevated sm:max-w-[22rem]"
                />
              </label>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                ref={dateInputRef}
                type="date"
                required
                min={todayYmd}
                value={releaseDate}
                onChange={(event) => setReleaseDate(event.target.value)}
                disabled={isSaving}
                aria-label="Release date"
                className="input h-10 rounded-lg border-stroke-control bg-bg-elevated sm:w-[11.5rem]"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!releaseDate || isSaving}
                  isLoading={isSaving}
                  leftIcon={isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
                >
                  {templatePending ? 'Build my plan' : 'Save'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isSaving}
                  onClick={() => {
                    setIsPicking(false);
                    setError('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2.5 pl-[2.125rem] text-xs text-status-error">
            {error}
          </p>
        ) : null}
      </form>

      {/* The escape hatch (URG-233), kept from the old card: plain text, so it
          reads as "or, instead" and never competes with the date. */}
      {templatePending ? (
        <p className="mt-3 px-1 text-xs leading-6 text-content-secondary">
          Don&apos;t need the full plan yet?{' '}
          <button
            type="button"
            onClick={onAddActivity}
            className="motion-focus rounded font-medium text-content-primary underline decoration-content-tertiary underline-offset-4 transition-colors hover:decoration-content-primary"
          >
            Add an activity yourself
          </button>
          . You don&apos;t need a release date for that.
        </p>
      ) : null}
    </div>
  );
}
