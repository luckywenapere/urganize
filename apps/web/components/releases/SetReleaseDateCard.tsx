'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { CalendarPlus, Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';
import { scheduleRelease } from '@/lib/schedule-release-client';
import { getTemplateStats } from '@/lib/release-templates/loader';
import { DEFAULT_RELEASE_TITLE, isDefaultReleaseTitle, type DbReleaseType } from '@/types/releases';

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
   * so its activities have not been generated yet. Drives the card's weight:
   * plan-waiting gets the full explainer, everything else gets one compact
   * row. */
  templatePending: boolean;
  /** Which playbook this release follows, so the explainer quotes that
   * playbook's real numbers. An EP plans 13 weeks of runway where a single
   * plans 8, and this card is the screen for a plan-waiting release. */
  releaseType?: DbReleaseType;
  onSaved: (message: string) => void;
  /** Opens the activity quick-create for this release. Only used by the
   * plan-waiting variant, where the card fills an empty view and would
   * otherwise read as a prerequisite (URG-233). */
  onAddActivity: () => void;
};

/**
 * Sits at the top of the activities view for any release without a release
 * date (URG-230 — the date became optional at creation).
 *
 * Two weights, because the stakes differ:
 *   - `templatePending`: this release owes its whole rollout plan. The
 *     activities list below is empty, so this card IS the screen — it gets
 *     the headline, the explanation of what a date unlocks, and (when the
 *     release is still unnamed) a name field, since this is the only rename
 *     affordance in the app. It also carries an explicit "add one yourself"
 *     action (URG-233): setting a date was never a prerequisite for creating
 *     activities, but a full-width brand-tinted card whose only button is
 *     "Build my plan" reads exactly like one.
 *   - otherwise: the release already has activities, or the user chose a
 *     Blank release. A date is still useful (the calendar, the press kit,
 *     due-date math) but nothing is blocked, so it stays a single quiet row
 *     that doesn't shout over the list beneath it.
 *
 * Deliberately not dismissible. It isn't a nag — in the pending case it's the
 * only route to the plan, and dismissing it would strand the release with no
 * way back. It disappears on its own the moment a date exists.
 */
export function SetReleaseDateCard({
  releaseId,
  releaseTitle,
  templatePending,
  releaseType = 'single',
  onSaved,
  onAddActivity,
}: SetReleaseDateCardProps) {
  // Never throws, and falls back to the single playbook's numbers for a type
  // whose playbook is switched off — which is also what would be instantiated.
  const { activityCount, spanWeeks, leadWeeks } = useMemo(
    () => getTemplateStats(releaseType),
    [releaseType]
  );
  const [releaseDate, setReleaseDate] = useState('');
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Anchored once per mount so the `min` attribute can't shift mid-interaction.
  const todayYmd = useMemo(() => formatYmdLocal(new Date()), []);

  // Offer the rename only while the release still carries a server-applied
  // default — someone who named it already doesn't need the field, and
  // showing it would read as "we lost your title". isDefaultReleaseTitle
  // (not a bare === DEFAULT_RELEASE_TITLE) is what makes this fire for a row
  // created before the 2026-09-09 rename ("Untitled release"), not only the
  // current default ("Untitled rollout") — a strict comparison silently
  // stopped offering the rename to every pre-existing unnamed rollout.
  const isUnnamed = isDefaultReleaseTitle(releaseTitle);
  const showNameField = templatePending && isUnnamed;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!releaseDate || isSaving) return;

    setIsSaving(true);
    setError('');

    // Shared with ReleaseSetupSheet (lib/schedule-release-client.ts) so the
    // 207 handling and the toast copy cannot drift between the two surfaces.
    // The helper also runs the forced store refresh — which is what unmounts
    // this card once the store reports a date.
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

  const dateInput = (
    <input
      type="date"
      required
      min={todayYmd}
      value={releaseDate}
      onChange={(event) => setReleaseDate(event.target.value)}
      disabled={isSaving}
      aria-label="Release date"
      className="input h-10 rounded-lg border-stroke-default bg-bg-elevated sm:w-[11.5rem]"
    />
  );

  // ---- Compact variant: activities already exist, nothing is blocked. ----
  if (!templatePending) {
    return (
      <form
        onSubmit={handleSubmit}
        className="mb-4 rounded-xl border border-stroke-default bg-bg-surface p-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <CalendarPlus
              className="h-4 w-4 shrink-0 text-content-tertiary"
              aria-hidden="true"
            />
            <p className="min-w-0 text-sm text-content-secondary">
              <span className="font-medium text-content-primary">No release date yet.</span>{' '}
              Add one when it&apos;s confirmed.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dateInput}
            <Button type="submit" size="sm" disabled={!releaseDate || isSaving} isLoading={isSaving}>
              Save
            </Button>
          </div>
        </div>
        {error ? <p role="alert" className="mt-2 text-xs text-status-error">{error}</p> : null}
      </form>
    );
  }

  // ---- Plan-waiting variant: this card is the whole screen. ----
  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-xl border border-brand/30 bg-brand/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"
          aria-hidden="true"
        >
          <CalendarPlus className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-content-primary">
            Set your release date
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-content-secondary">
            Your rollout plan is ready to build. It has {activityCount} activities across ~
            {spanWeeks} weeks, starting {leadWeeks} weeks before release day. Every one of
            them is dated from your release date, so pick it and the whole plan appears.
          </p>
        </div>
      </div>

      {/* Inputs sit below the explainer, indented to the text column so the
          eye runs headline → reason → action in one straight line rather
          than jumping back out to the icon gutter. */}
      <div className="mt-4 sm:pl-12">
        {showNameField ? (
          <label className="mb-3 block">
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
              className="input h-10 rounded-lg border-stroke-default bg-bg-elevated sm:max-w-[22rem]"
            />
          </label>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {dateInput}
          <Button
            type="submit"
            disabled={!releaseDate || isSaving}
            isLoading={isSaving}
            leftIcon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            Build my plan
          </Button>
        </div>

        {error ? <p role="alert" className="mt-2.5 text-xs text-status-error">{error}</p> : null}

        {/* The escape hatch (URG-233). A hairline separates it from the
            primary action so it reads as "or, instead" rather than a second
            competing CTA, and it stays inside the same indented text column
            so the eye keeps running down one line: what this is -> the fast
            path -> the alternative. Plain text button, not a filled one —
            it must not compete with "Build my plan", which is still the
            recommended route. */}
        <div className="mt-5 border-t border-brand/20 pt-4">
          <p className="text-xs leading-6 text-content-secondary">
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
        </div>
      </div>
    </form>
  );
}
