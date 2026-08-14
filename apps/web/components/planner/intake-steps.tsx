'use client';

import { useMemo } from 'react';

import {
  BUDGET_OPTIONS,
  GOAL_OPTIONS,
  MAX_EXTRA_NOTES_LENGTH,
  MAX_GOAL_TEXT_LENGTH,
  READY_TODAY_OPTIONS,
  RELEASE_TYPE_OPTIONS,
  type PlanBudget,
  type PlanGoal,
  type PlanReleaseType,
  type ReadyItem,
} from '@/lib/release-planning';
import type { PlannerIntakeDraft } from '@/lib/planner-intake-draft';
import {
  getTemplateStats,
  isEpAlbumTemplatesEnabled,
} from '@/lib/release-templates/loader';
import { PlannerCheckboxGroup, PlannerRadioGroup } from './PlannerOptionGroup';

/** Whether an EP or album plan really comes from its own playbook right now. */
const EP_ALBUM_PLAYBOOKS_LIVE = isEpAlbumTemplatesEnabled();

/**
 * The seven questions, one per screen.
 *
 * Split out of PlannerIntakeModal so the shell stays about the step machine and
 * these stay about the answers. Each body is presentational: it reads the draft
 * and calls `patch`, and knows nothing about navigation or submission.
 */

export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const TOTAL_STEPS = 7;

export const INTAKE_STEPS: Record<StepIndex, { title: string; kicker: string }> = {
  0: { title: 'What are you releasing?', kicker: `Question 1 of ${TOTAL_STEPS}` },
  1: { title: "Who's the artist?", kicker: `Question 2 of ${TOTAL_STEPS}` },
  2: { title: 'When does it drop?', kicker: `Question 3 of ${TOTAL_STEPS}` },
  3: { title: "What's already done?", kicker: `Question 4 of ${TOTAL_STEPS}` },
  4: { title: 'What matters most this time?', kicker: `Question 5 of ${TOTAL_STEPS}` },
  5: { title: "What's the promo budget?", kicker: `Question 6 of ${TOTAL_STEPS}` },
  6: {
    title: 'Anything else UrgAns should know?',
    kicker: `Question 7 of ${TOTAL_STEPS}`,
  },
};

const helperClass = 'mt-3 text-xs leading-5 text-content-secondary';
const inputClass =
  'w-full rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2.5 text-[16px] text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-brand';

function formatYmdLabel(ymd: string): string {
  const parsed = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

type StepBodyProps = {
  step: StepIndex;
  draft: PlannerIntakeDraft;
  patch: (changes: Partial<PlannerIntakeDraft>) => void;
  disabled?: boolean;
  knownArtistName: string;
  suggestedDate: string | null;
  leadTimeDays: number;
  fromNote: boolean;
};

export function StepBody(props: StepBodyProps) {
  const { step } = props;

  if (step === 0) return <ReleaseTypeStep {...props} />;
  if (step === 1) return <ArtistStep {...props} />;
  if (step === 2) return <DateStep {...props} />;
  if (step === 3) return <ReadyStep {...props} />;
  if (step === 4) return <GoalStep {...props} />;
  if (step === 5) return <BudgetStep {...props} />;
  return <ExtrasStep {...props} />;
}

function ReleaseTypeStep({ draft, patch, disabled }: StepBodyProps) {
  return (
    <>
      <PlannerRadioGroup<PlanReleaseType>
        name="planner-release-type"
        legend="What are you releasing?"
        options={RELEASE_TYPE_OPTIONS}
        value={draft.releaseType}
        onChange={(releaseType) => patch({ releaseType })}
        disabled={disabled}
      />
      {/* The helper text has to tell the truth about which playbook this plan
          will come from, and that depends on whether the EP/album playbooks are
          switched on. Same loader gate the planner route uses, so the copy and
          the plan cannot disagree. */}
      {draft.releaseType === 'ep' || draft.releaseType === 'album' ? (
        <p className={helperClass}>
          {EP_ALBUM_PLAYBOOKS_LIVE ? (
            draft.releaseType === 'ep' ? (
              <>
                The EP playbook plans {getTemplateStats('ep').spanWeeks} weeks around a lead single
                that drops ahead of the EP. UrgAns tailors it to your dates.
              </>
            ) : (
              <>
                The album playbook plans {getTemplateStats('album').spanWeeks} weeks around two
                staggered singles. UrgAns tailors it to your dates.
              </>
            )
          ) : (
            <>
              {draft.releaseType === 'ep' ? 'EPs' : 'Albums'} start from the single playbook for now.
              UrgAns stretches it to cover more tracks.
            </>
          )}
        </p>
      ) : null}
    </>
  );
}

function ArtistStep({ draft, patch, disabled, knownArtistName }: StepBodyProps) {
  const matchesKnown = Boolean(knownArtistName) && draft.artistName === knownArtistName;

  // A team that has never named an artist gets the plain input. Everyone else
  // gets a confirm, because the answer is almost always yes.
  if (!knownArtistName) {
    return (
      <>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-content-primary">Artist name</span>
          <input
            value={draft.artistName}
            onChange={(event) => patch({ artistName: event.target.value })}
            disabled={disabled}
            className={inputClass}
            placeholder="The artist this release is for"
            maxLength={120}
          />
        </label>
        <p className={helperClass}>UrgAns uses this in the plan and in status updates.</p>
      </>
    );
  }

  return (
    <>
      <p className="text-sm leading-6 text-content-secondary">
        You are planning for{' '}
        <span className="font-semibold text-content-primary">{knownArtistName}</span>.
      </p>

      <div className="mt-4 space-y-2">
        <PlannerRadioGroup
          name="planner-artist-confirm"
          legend="Is this the right artist?"
          options={[
            { value: 'yes', label: "That's right" },
            { value: 'other', label: 'Use a different name' },
          ]}
          value={matchesKnown ? 'yes' : 'other'}
          onChange={(choice) =>
            patch({ artistName: choice === 'yes' ? knownArtistName : '' })
          }
          disabled={disabled}
        />
      </div>

      {!matchesKnown ? (
        <label className="mt-3 block">
          <span className="mb-2 block text-sm font-medium text-content-primary">Artist name</span>
          <input
            value={draft.artistName}
            onChange={(event) => patch({ artistName: event.target.value })}
            disabled={disabled}
            className={inputClass}
            placeholder="Who is this release for?"
            maxLength={120}
            autoFocus
          />
        </label>
      ) : null}
    </>
  );
}

function DateStep({ draft, patch, disabled, suggestedDate, leadTimeDays }: StepBodyProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const daysOut = useMemo(() => {
    if (!draft.releaseDate) return null;
    const picked = Date.parse(`${draft.releaseDate}T00:00:00.000Z`);
    const now = Date.parse(`${today}T00:00:00.000Z`);
    if (Number.isNaN(picked) || Number.isNaN(now)) return null;
    return Math.round((picked - now) / 86_400_000);
  }, [draft.releaseDate, today]);

  const compressedWeeks =
    daysOut !== null && daysOut < leadTimeDays
      ? Math.max(1, Math.ceil((leadTimeDays - daysOut) / 7))
      : null;

  return (
    <>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-content-primary">Release date</span>
        <input
          type="date"
          min={today}
          value={draft.releaseDate}
          onChange={(event) => patch({ releaseDate: event.target.value, dateSuggested: false })}
          disabled={disabled}
          className={inputClass}
        />
      </label>

      {suggestedDate ? (
        <button
          type="button"
          onClick={() => patch({ releaseDate: suggestedDate, dateSuggested: true })}
          disabled={disabled}
          className="motion-focus motion-press mt-3 inline-flex h-9 items-center rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:border-brand/50 hover:bg-bg-hover disabled:opacity-60"
        >
          Help me pick
        </button>
      ) : null}

      {draft.dateSuggested && draft.releaseDate === suggestedDate ? (
        <p className={helperClass}>
          {formatYmdLabel(suggestedDate)} leaves you enough runway for the work that is left.
          Change it if you need to.
        </p>
      ) : compressedWeeks ? (
        <p className={helperClass}>
          That date compresses the first {compressedWeeks}{' '}
          {compressedWeeks === 1 ? 'week' : 'weeks'} of prep. UrgAns marks those as catch up so you
          can see them.
        </p>
      ) : (
        <p className={helperClass}>
          Every activity in the plan is dated from release day, so this is the anchor.
        </p>
      )}
    </>
  );
}

function ReadyStep({ draft, patch, disabled }: StepBodyProps) {
  const toggle = (item: ReadyItem) => {
    // "None of it yet" is an answer about everything else, so it clears the
    // rest and the rest clear it.
    if (item === 'none') {
      patch({ readyToday: draft.readyToday.includes('none') ? [] : ['none'] });
      return;
    }
    const withoutNone = draft.readyToday.filter((value) => value !== 'none');
    patch({
      readyToday: withoutNone.includes(item)
        ? withoutNone.filter((value) => value !== item)
        : [...withoutNone, item],
    });
  };

  return (
    <>
      <PlannerCheckboxGroup<ReadyItem>
        legend="What is already done?"
        options={READY_TODAY_OPTIONS}
        value={draft.readyToday}
        onToggle={toggle}
        disabled={disabled}
      />
      <p className={helperClass}>
        Pick as many as apply. Anything already finished shortens the runway UrgAns plans for.
      </p>
    </>
  );
}

function GoalStep({ draft, patch, disabled }: StepBodyProps) {
  return (
    <>
      <PlannerRadioGroup<PlanGoal>
        name="planner-goal"
        legend="What matters most this time?"
        options={GOAL_OPTIONS}
        value={draft.goal}
        onChange={(goal) => patch({ goal })}
        disabled={disabled}
      />
      <label className="mt-3 block">
        <span className="mb-2 block text-sm font-medium text-content-primary">
          Something else?
        </span>
        <input
          value={draft.goalText}
          onChange={(event) => patch({ goalText: event.target.value })}
          disabled={disabled}
          className={inputClass}
          placeholder="Say it in your own words"
          maxLength={MAX_GOAL_TEXT_LENGTH}
        />
      </label>
    </>
  );
}

function BudgetStep({ draft, patch, disabled }: StepBodyProps) {
  return (
    <>
      <PlannerRadioGroup<PlanBudget>
        name="planner-budget"
        legend="What is the promo budget?"
        options={BUDGET_OPTIONS}
        value={draft.budget}
        onChange={(budget) => patch({ budget })}
        disabled={disabled}
      />
      <p className={helperClass}>UrgAns sizes the promo work to match, and drops what you cannot fund.</p>
    </>
  );
}

function ExtrasStep({ draft, patch, disabled, fromNote }: StepBodyProps) {
  const remaining = MAX_EXTRA_NOTES_LENGTH - draft.extraNotes.length;

  return (
    <>
      <label className="block">
        <span className="sr-only">Anything else UrgAns should know?</span>
        <textarea
          value={draft.extraNotes}
          onChange={(event) => patch({ extraNotes: event.target.value.slice(0, MAX_EXTRA_NOTES_LENGTH) })}
          disabled={disabled}
          rows={6}
          className={`${inputClass} resize-y leading-6`}
          placeholder="Deadlines, collaborators, plans already in motion"
          maxLength={MAX_EXTRA_NOTES_LENGTH}
        />
      </label>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="text-xs leading-5 text-content-secondary">
          {fromNote
            ? 'Your note came along. Edit it or add more.'
            : 'Optional. Skip it if there is nothing to add.'}
        </p>
        {draft.extraNotes.length > 0 ? (
          <span className="shrink-0 font-mono text-[11px] text-content-tertiary">
            {remaining.toLocaleString()} left
          </span>
        ) : null}
      </div>
    </>
  );
}
