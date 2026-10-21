'use client';

import { useMemo, useState } from 'react';

import {
  BUDGET_OPTIONS,
  GOAL_OPTIONS,
  MAX_EXTRA_NOTES_LENGTH,
  MAX_GOAL_TEXT_LENGTH,
  PLAN_SCOPE_OPTIONS,
  READY_TODAY_OPTIONS,
  RELEASE_TYPE_OPTIONS,
  type PlanBudget,
  type PlanGoal,
  type PlanReleaseType,
  type PlanScope,
  type ReadyItem,
} from '@/lib/release-planning';
import type { PlannerIntakeDraft } from '@/lib/planner-intake-draft';
import {
  coveredScopes,
  intakeStepKicker,
  toggleCoveredScope,
  type StepIndex,
} from '@/lib/planner-intake-steps';
import {
  getTemplateStats,
  isEpAlbumTemplatesEnabled,
} from '@/lib/release-templates/loader';
import {
  DATE_OPTIONS_LIMIT_NOTE,
  buildReleaseDateOptions,
  describeClash,
  rolloutsSameWeek,
  type DateOptionRollout,
} from '@/lib/release-date-options';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';
import { AlertTriangle, Check } from '@/components/icons';
import { InfoTip } from '@/components/shared/HelpTip';
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

export type { StepIndex };

export const TOTAL_STEPS = 7;

export const INTAKE_STEPS: Record<StepIndex, { title: string }> = {
  0: { title: 'What are you releasing?' },
  1: { title: "Who's the artist?" },
  2: { title: 'When does it drop?' },
  3: { title: "What's already done?" },
  4: { title: 'What matters most this time?' },
  5: { title: "What's the promo budget?" },
  6: { title: 'What should the plan cover?' },
};

/**
 * "Question N of M", counted over the questions this intake actually asks.
 * A prefilled type, a vouched-for artist and a usable prefilled date each
 * remove their question (lib/planner-intake-steps.ts), so the numbering is
 * computed from the visible list rather than baked into INTAKE_STEPS.
 */
export function getStepKicker(step: StepIndex, visibleSteps: readonly StepIndex[]): string {
  return intakeStepKicker(visibleSteps, step);
}

const helperClass = 'mt-3 text-xs leading-5 text-content-secondary';
const inputClass =
  'w-full rounded-lg border border-stroke-control bg-bg-elevated px-3 py-2.5 text-[16px] text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-brand';

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
  /** The team's other dated rollouts, for the date question's clash check
   *  (lib/release-date-options.ts: `datedOtherRollouts`). */
  otherRollouts: readonly DateOptionRollout[];
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
  // The choice is held here, not derived from the name. Derived, typing a name
  // that happened to equal the known one flipped the radio back to "That's
  // right" and unmounted the input mid-word.
  const [choice, setChoice] = useState<'yes' | 'other'>(() =>
    Boolean(knownArtistName) && draft.artistName === knownArtistName ? 'yes' : 'other'
  );
  const matchesKnown = choice === 'yes';

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
            placeholder="The artist this rollout is for"
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
          value={choice}
          onChange={(next) => {
            setChoice(next);
            patch({ artistName: next === 'yes' ? knownArtistName : '' });
          }}
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
            placeholder="Who is this rollout for?"
            maxLength={120}
            autoFocus
          />
        </label>
      ) : null}
    </>
  );
}

function DateStep({ draft, patch, disabled, leadTimeDays, otherRollouts }: StepBodyProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  // "Help me pick" opens a short list of Fridays, each checked against what
  // Urganize knows (lib/release-date-options.ts). It used to fill in one date
  // with no reason beyond runway; a prospect asked for something he could
  // decide with, such as not landing on top of another release.
  const [showOptions, setShowOptions] = useState(false);

  const options = useMemo(
    () =>
      buildReleaseDateOptions({
        todayYmd: today,
        ready: draft.readyToday,
        leadTimeDays,
        others: otherRollouts,
      }),
    [today, draft.readyToday, leadTimeDays, otherRollouts]
  );

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

  // A date typed by hand gets the same clash check the options show.
  const typedClashes = useMemo(
    () => (draft.releaseDate ? rolloutsSameWeek(draft.releaseDate, otherRollouts) : []),
    [draft.releaseDate, otherRollouts]
  );
  const pickedIndex = options.findIndex((option) => option.date === draft.releaseDate);
  const panelOpen = showOptions && options.length > 0;
  const showTypedClash = typedClashes.length > 0 && !(panelOpen && pickedIndex >= 0);

  const pick = (date: string) => patch({ releaseDate: date, dateSuggested: true });

  const toggleOptions = () => {
    if (showOptions) {
      setShowOptions(false);
      return;
    }
    setShowOptions(true);
    // Nothing chosen yet: start on the best fit, or the earliest Friday.
    if (!draft.releaseDate && options.length > 0) {
      pick((options.find((option) => option.best) ?? options[0]).date);
    }
  };

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

      {options.length > 0 ? (
        <button
          type="button"
          onClick={toggleOptions}
          disabled={disabled}
          aria-expanded={panelOpen}
          aria-controls="planner-date-options"
          className="motion-focus motion-press mt-3 inline-flex h-11 touch-manipulation items-center rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary transition-colors hover:border-brand/50 hover:bg-bg-hover disabled:opacity-60"
        >
          {panelOpen ? 'Hide suggestions' : 'Help me pick'}
        </button>
      ) : null}

      {panelOpen ? (
        <div id="planner-date-options" className="mt-4">
          <div className="mb-2 flex items-center gap-1.5">
            <p id="planner-date-options-label" className="text-sm font-medium text-content-primary">
              Fridays that work
            </p>
            <InfoTip label="this list" text={DATE_OPTIONS_LIMIT_NOTE} />
          </div>
          <div
            role="radiogroup"
            aria-labelledby="planner-date-options-label"
            onKeyDown={(event) =>
              onRadioGroupKeyDown(event, Math.max(pickedIndex, 0), (index) =>
                pick(options[index].date)
              )
            }
            className="space-y-2"
          >
            {options.map((option, index) => {
              const selected = index === pickedIndex;
              const focusable = selected || (pickedIndex < 0 && index === 0);
              return (
                <button
                  key={option.date}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={focusable ? 0 : -1}
                  disabled={disabled}
                  onClick={() => pick(option.date)}
                  className={`motion-focus w-full touch-manipulation rounded-lg border px-4 py-3 text-left text-sm transition-colors disabled:opacity-60 ${
                    selected
                      ? 'border-brand bg-brand/10 text-content-primary'
                      : 'border-stroke-default bg-bg-elevated text-content-secondary hover:border-stroke-strong hover:bg-bg-hover hover:text-content-primary'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-content-primary">
                      {formatYmdLabel(option.date)}
                    </span>
                    {option.best ? (
                      <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-content-primary">
                        Best fit
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 block space-y-1">
                    {option.checks.map((check) => (
                      <span key={check.key} className="flex items-start gap-2 text-xs leading-5">
                        {check.ok ? (
                          <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                        ) : (
                          <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning"
                          />
                        )}
                        <span className={check.ok ? 'text-content-secondary' : 'text-content-primary'}>
                          {check.label}
                        </span>
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showTypedClash ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-content-primary">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
          <span>{describeClash(typedClashes)}. You can still pick it.</span>
        </p>
      ) : null}

      {panelOpen ? null : draft.dateSuggested && draft.releaseDate ? (
        <p className={helperClass}>
          {formatYmdLabel(draft.releaseDate)} leaves you enough runway for the work that is left.
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
        legend="What's already done?"
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
        legend="What's the promo budget?"
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

  // Asked the other way round since 2026-10-11: every scope starts ticked
  // and unticking one leaves it out. The draft still holds exclusions (the
  // unticked scopes), so nothing downstream changed.
  const covered = coveredScopes(draft.exclusions);
  const toggleCovered = (scope: PlanScope) => {
    patch({ exclusions: toggleCoveredScope(draft.exclusions, scope) });
  };

  return (
    <>
      <PlannerCheckboxGroup<PlanScope>
        legend="What should the plan cover?"
        options={PLAN_SCOPE_OPTIONS}
        value={covered}
        onToggle={toggleCovered}
        disabled={disabled}
      />
      <p className={helperClass}>
        Everything is in to start. Untick anything you do not want, and UrgAns
        leaves that kind of work out. Release day and getting it to stores stay
        either way.
      </p>

      <label className="mt-5 block">
        <span className="mb-2 block text-sm font-medium text-content-primary">
          Anything else UrgAns should know?
        </span>
        <textarea
          value={draft.extraNotes}
          onChange={(event) => patch({ extraNotes: event.target.value.slice(0, MAX_EXTRA_NOTES_LENGTH) })}
          disabled={disabled}
          rows={5}
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
