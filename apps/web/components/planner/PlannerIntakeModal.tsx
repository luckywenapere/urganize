'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, X } from '@/components/icons';
import { Button, IconButton } from '@urganize/ui';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { useBackToClose } from '@/lib/use-back-to-close';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import {
  captureAnalyticsEvent,
  captureFeatureDiscoveryByName,
  createPostHogEvent,
} from '@/lib/analytics';
import { getTemplateStats } from '@/lib/release-templates/loader';
import { suggestReleaseDate, type ReleasePlanIntake } from '@/lib/release-planning';
import { datedOtherRollouts } from '@/lib/release-date-options';
import { readTestRelease } from '@/lib/test-release';
import { createReleasePlan } from '@/lib/urgans-actions/client';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedCostLine } from '@/lib/credits/copy';
import { FIRST_PLAN_FREE_LINE } from '@/lib/credits/first-plan';
import { invalidateUrgansUsage } from '@/components/app/useUrgansUsage';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { buildDraftDiscardPath } from '@/lib/release-draft-discard';
import {
  EMPTY_PLANNER_INTAKE_DRAFT,
  clearPlannerIntakeDraft,
  loadPlannerIntakeDraft,
  savePlannerIntakeDraft,
  type PlannerIntakeDraft,
} from '@/lib/planner-intake-draft';
import { intakeStepBlocker } from '@/lib/planner-intake-validation';
import {
  INTAKE_STEPS,
  StepBody,
  getStepKicker,
  type StepIndex,
} from './intake-steps';
import {
  decideIntakeSkips,
  intakeStepPosition,
  nextIntakeStep,
  previousIntakeStep,
  readyPrefillAnswers,
  visibleIntakeSteps,
} from '@/lib/planner-intake-steps';
import { PlannerTemplatePreview } from './PlannerTemplatePreview';

/**
 * The guided intake: one question per screen, seven at most, then UrgAns
 * builds the plan straight into the rollout's activities.
 *
 * Mounted once by AppShell and opened through usePlannerStore, so the workspace
 * card, a note and an UrgAns chip all reach the same instance without a
 * callback threaded through six files.
 *
 * The chrome is CreateReleaseModal's, deliberately: portal to body (AppShell's
 * transform would otherwise break `position: fixed`), `h-[100dvh]` rather than
 * `inset-0` because iOS falls back to the layout viewport, a body that scrolls
 * internally so the footer is always reachable, and a footer that stacks with
 * the primary action on top below `sm`.
 *
 * On submit it does NOT wait for the model. It fires the build, marks the
 * release as generating in the store, and closes and navigates back to the
 * rollout, where PlanReleaseCard owns the waiting experience. A manager should
 * never watch a modal spin for up to half a minute. There is no draft and no
 * review step any more (founder call, 2026-09-15): finishing the questions
 * creates the activities.
 */

/** Lead time of the playbook this intake's release type will actually use.
 * Release type is question 1 and the date question comes later, so by the time
 * the suggestion is shown the answer is known. Falls back to the single
 * playbook's runway for a type whose playbook is switched off — which is also
 * the plan that would be generated. */
function leadTimeDaysFor(releaseType: PlannerIntakeDraft['releaseType']): number {
  return getTemplateStats(releaseType || 'single').leadWeeks * 7;
}

type View = 'steps' | 'starting' | 'error';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/**
 * Asks the server to discard a rollout the planner was opened on and left
 * before finishing. True only when it was actually deleted; the server refuses
 * (409) when anything was put in it, and that is not an error to show.
 */
async function discardAbandonedRollout(releaseId: string, createdTitle: string | null): Promise<boolean> {
  try {
    const token = await getAccessToken();
    if (!token) return false;
    const response = await fetch(buildDraftDiscardPath(releaseId, createdTitle), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    // The server records the delete as release_deleted with reason
    // planner_abandoned, so nothing is captured here as well.
    return response.ok;
  } catch {
    return false;
  }
}

const todayYmd = () => new Date().toISOString().slice(0, 10);

export function PlannerIntakeModal() {
  // withFirstPlan: the footer says "Your first plan is free." instead of the
  // cost when the server says this team has not had a plan yet.
  const { balance, firstPlanFree, refresh: refreshCredits } = useCreditBalance({ withFirstPlan: true });
  const router = useRouter();
  const intakePayload = usePlannerStore((state) => state.intake);
  const closeIntake = usePlannerStore((state) => state.closeIntake);
  const setGenerating = usePlannerStore((state) => state.setGenerating);
  const setLockedRefusal = usePlannerStore((state) => state.setLockedRefusal);
  const markBuilt = usePlannerStore((state) => state.markBuilt);
  const setBuildError = usePlannerStore((state) => state.setBuildError);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const profile = useAuthStore((state) => state.user);
  const identityArtist = useWorkspaceIdentityStore((state) => state.artist?.name);

  const [draft, setDraft] = useState<PlannerIntakeDraft>(EMPTY_PLANNER_INTAKE_DRAFT);
  const [step, setStep] = useState<StepIndex>(0);
  const [view, setView] = useState<View>('steps');
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = Boolean(intakePayload);
  const isBusy = view === 'starting';

  // Declared BEFORE the heading-focus effect below so the element that opened
  // the planner is remembered before the heading takes focus. 'none' because
  // this modal already moves focus to each question itself.
  useDialogFocus(open, panelRef, { initialFocus: 'none' });

  // Questions already answered are not asked again (lib/planner-intake-steps.ts).
  // A prefilled release type (the create picker, an UrgAns chip, onboarding)
  // skips question 1, as it always did: re-answering differently would
  // silently overwrite the row's type at generate time. Since 2026-10-11 a
  // usable future date and an artist name the caller vouches for (the scoped
  // rollout's own artist, or the one onboarding just typed) skip theirs too,
  // and (later the same day) a readiness answer onboarding already took
  // skips "What's already done?", so a first plan from onboarding asks only
  // the three questions nothing else has asked: what matters most, budget,
  // what to cover. Back, Continue and "Question N of M" all walk this one list.
  const prefill = intakePayload?.prefill;
  const visibleSteps = useMemo(
    () =>
      visibleIntakeSteps(
        decideIntakeSkips({
          prefilledReleaseType: prefill?.releaseType,
          prefilledReleaseDate: prefill?.releaseDate,
          prefilledArtistName: prefill?.artistName,
          // Onboarding asked "What's already done?" (2026-10-11): not again.
          prefilledReadyToday: prefill?.readyToday,
          todayYmd: todayYmd(),
        })
      ),
    [prefill?.releaseType, prefill?.releaseDate, prefill?.artistName, prefill?.readyToday]
  );
  const firstStep: StepIndex = visibleSteps[0] ?? 0;

  // The artist this release is for. The caller's own answer first (the scoped
  // rollout's artist), then the identity card, then the profile for a
  // workspace that has not named one yet.
  const knownArtistName =
    prefill?.artistName?.trim() || identityArtist || profile?.artist_name || '';

  // Hydrate on open, not in a state initializer, so server and client render
  // the same first frame. Presets from the caller win over anything stored:
  // tapping "Plan an EP rollout" must mean an EP even if the last abandoned
  // intake was a single.
  useEffect(() => {
    if (!open || !intakePayload) return;

    const stored = loadPlannerIntakeDraft();
    const targetReleaseId = intakePayload.releaseId || '';
    // Answers belong to one release. Anything stored for a different one is
    // residue, not a resume.
    const base =
      stored.releaseId === targetReleaseId ? stored : { ...EMPTY_PLANNER_INTAKE_DRAFT };

    const prefill = intakePayload.prefill || {};
    const prefilledArtist = prefill.artistName?.trim() || '';
    const next: PlannerIntakeDraft = {
      ...base,
      releaseId: targetReleaseId,
      // A vouched-for artist skips the question, so it must also be the answer.
      artistName: prefilledArtist || base.artistName || knownArtistName,
      ...(prefill.releaseType ? { releaseType: prefill.releaseType } : {}),
      ...(prefill.releaseDate
        ? { releaseDate: prefill.releaseDate, dateSuggested: false }
        : {}),
      // A skipped readiness question must also be the answer.
      ...(readyPrefillAnswers(prefill.readyToday).length
        ? { readyToday: readyPrefillAnswers(prefill.readyToday) }
        : {}),
      ...(prefill.budget ? { budget: prefill.budget } : {}),
      ...(prefill.extraNotes ? { extraNotes: prefill.extraNotes } : {}),
    };

    setDraft(next);
    // Start on the first question actually asked — see visibleSteps.
    setStep(firstStep);
    setView('steps');
    setError('');
    setHydrated(true);
    // The modal stays mounted between opens, so the balance and the
    // first-plan answer are re-read each time it opens.
    void refreshCredits();

    captureFeatureDiscoveryByName('release_planner');
    captureAnalyticsEvent(
      createPostHogEvent('planner_intake_opened', {
        source: intakePayload.source,
        has_release: Boolean(intakePayload.releaseId),
      })
    );
  }, [open, intakePayload, knownArtistName, firstStep, refreshCredits]);

  // Persist every answer change once hydrated, so a refresh resumes.
  useEffect(() => {
    if (!open || !hydrated) return;
    savePlannerIntakeDraft(draft);
  }, [draft, open, hydrated]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // Move focus to the new question so a keyboard or screen-reader user lands on
  // it rather than back at the top of the dialog.
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
  }, [open, step]);

  const dismiss = useCallback(() => {
    if (isBusy) return;
    captureAnalyticsEvent(createPostHogEvent('planner_intake_dismissed', { step }));
    const abandonedReleaseId =
      intakePayload?.discardIfAbandoned && intakePayload.releaseId ? intakePayload.releaseId : null;
    const createdTitle = intakePayload?.createdTitle ?? null;
    closeIntake();
    // The rollout was only made so the planner had something to plan. Leaving
    // before the plan is built discards it, so an abandoned try does not leave
    // an empty "Untitled rollout" behind. The server keeps it if anything was
    // put in it (lib/release-draft-discard.ts), and so does a failure here:
    // the worst case is the rollout staying, exactly as before.
    if (abandonedReleaseId && !usePlannerStore.getState().isGenerating(abandonedReleaseId)) {
      void discardAbandonedRollout(abandonedReleaseId, createdTitle).then((discarded) => {
        if (!discarded) return;
        clearPlannerIntakeDraft();
        void loadCommandCenter({ force: true });
        // Still on the discarded rollout: go back to the catalogue rather than
        // leave the page pointing at a rollout that no longer exists.
        if (
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('release') === abandonedReleaseId
        ) {
          router.replace('/dashboard');
        }
      });
    }
  }, [closeIntake, intakePayload, isBusy, loadCommandCenter, router, step]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismiss]);

  // The OS back-swipe closes the planner (declared here because dismiss is).
  useBackToClose(open, dismiss);

  const patch = useCallback((changes: Partial<PlannerIntakeDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  const leadTimeDays = useMemo(() => leadTimeDaysFor(draft.releaseType), [draft.releaseType]);

  const suggestedDate = useMemo(
    () => suggestReleaseDate(todayYmd(), draft.readyToday, leadTimeDays),
    [draft.readyToday, leadTimeDays]
  );

  // The team's other dated rollouts, so "Help me pick" can flag a Friday one of
  // them already lands in. Read from the catalog the app already holds; the
  // rollout being planned is left out.
  const releases = useReleaseStore((state) => state.releases);
  const otherRollouts = useMemo(
    () =>
      datedOtherRollouts(
        releases.map((release) => ({
          id: release.id,
          title: release.title,
          artistName: release.artistName,
          releaseDate: release.releaseDate,
          status: release.status,
          isTest: readTestRelease(release.metadata),
        })),
        intakePayload?.releaseId ?? null
      ),
    [releases, intakePayload?.releaseId]
  );

  // What this question still needs, as the sentence shown under Continue, or
  // null when it is ready (lib/planner-intake-validation.ts). One answer drives
  // both the button's disabled look and the sentence, so they cannot disagree.
  const blocker = useMemo(() => intakeStepBlocker(step, draft, todayYmd()), [draft, step]);
  const canAdvance = blocker === null;
  // Set when a tap lands on a Continue that cannot move yet, so the sentence
  // under it is emphasised instead of the tap doing nothing visible. Cleared
  // on every step change and every answer.
  const [nudged, setNudged] = useState(false);
  useEffect(() => {
    setNudged(false);
  }, [step, draft]);

  const goNext = () => {
    if (isBusy) return;
    if (!canAdvance) {
      setNudged(true);
      return;
    }
    setError('');
    const next = nextIntakeStep(visibleSteps, step);
    if (next !== null) {
      setStep(next);
      captureAnalyticsEvent(createPostHogEvent('planner_intake_step', { step: next }));
      return;
    }
    void submit();
  };

  const goBack = () => {
    if (isBusy) return;
    setError('');
    // Walks the visible list, so Back never reaches a skipped question.
    setStep((current) => previousIntakeStep(visibleSteps, current) ?? current);
  };

  const submit = async () => {
    if (!intakePayload) return;
    setView('starting');
    setError('');

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Your session expired. Sign in again.');

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // 1. The release. When the intake was opened from a note or a chip there
      //    is none yet, so it is created here — blank, so no activities appear
      //    before the plan has landed. An existing release with no date yet
      //    needs no separate scheduling call: createReleasePlan below writes
      //    it itself from the intake's own release_date.
      let releaseId = intakePayload.releaseId || '';
      if (!releaseId) {
        const created = await fetch('/api/releases', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            releaseDate: draft.releaseDate || undefined,
            releaseType: draft.releaseType || 'single',
            plan: 'blank',
            source: 'planner',
          }),
        });
        const payload = (await created.json().catch(() => ({}))) as {
          releaseId?: string;
          error?: string;
        };
        if (!created.ok || !payload.releaseId) {
          throw new Error(payload.error || 'Could not create the rollout.');
        }
        releaseId = payload.releaseId;

        // 2. Link the note that started this, so the thought and the release
        //    stay connected. Best effort: a failure here must not cost the plan.
        if (intakePayload.noteId) {
          void fetch(`/api/notes/${intakePayload.noteId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ releaseId }),
          }).catch(() => undefined);
        }
      }

      const intake: ReleasePlanIntake = {
        version: 2,
        release_type: draft.releaseType || 'single',
        artist_name: draft.artistName.trim() || knownArtistName || 'Unknown artist',
        date_mode: draft.dateSuggested ? 'suggested' : 'fixed',
        release_date: draft.releaseDate || null,
        ready_today: draft.readyToday,
        goal: draft.goal || 'new_listeners',
        ...(draft.goalText.trim() ? { goal_text: draft.goalText.trim() } : {}),
        budget: draft.budget || 'none',
        ...(draft.exclusions.length ? { exclusions: draft.exclusions } : {}),
        ...(draft.extraNotes.trim() ? { extra_notes: draft.extraNotes.trim() } : {}),
      };

      // 3. Fire the build and hand the wait to the workspace card.
      //    Deliberately not awaited: the model can take up to about half a
      //    minute and nobody should watch a modal for that. Goes through
      //    createReleasePlan (the gated action, falling back to this same
      //    POST /plan route when the flag is off) rather than a raw fetch, so
      //    this reaches the exact same entitlement gate every other entry
      //    point does — a manager cannot dodge the Solo refusal by taking the
      //    longer way in.
      setGenerating(releaseId, true);
      void createReleasePlan({ releaseId, intake })
        .then((result) => {
          if (result.ok) {
            clearPlannerIntakeDraft();
            captureAnalyticsEvent(
              createPostHogEvent('planner_plan_created', {
                source: intakePayload.source,
                release_type: intake.release_type,
                task_count: result.plan.tasksCreated,
                tasks_removed: result.plan.removed.length,
                exclusions_count: result.plan.appliedExclusions.length,
                ai_applied: result.plan.aiApplied,
              })
            );
            markBuilt(releaseId, result.plan);
            // Opened from a rollout's Ideas card (2026-10-26): tell the people
            // who chimed in that the plan is ready. Best effort; the server
            // checks the owner and that the rollout has ideas.
            if (intakePayload.source === 'ideas') {
              captureAnalyticsEvent(createPostHogEvent('ideas_plan_drafted', { via: 'ai' }));
              void fetch(`/api/releases/${encodeURIComponent(releaseId)}/ideas/plan-ready`, {
                method: 'POST',
                headers,
              }).catch(() => undefined);
            }
            return;
          }
          // The modal has already closed and navigated back to the rollout
          // by now (see below) — there is nothing local left to show an
          // error in. A plan_required refusal goes to the shared store so
          // WorkspaceView's one UrgansLockedSheet can render it regardless of
          // which entry point triggered it; tailoring_unavailable means
          // UrgAns could not read the typed notes and refused rather than
          // guess, so the card offers the questions again with the answers
          // still in sessionStorage; anything else just leaves the release
          // back at PlanReleaseCard's fresh state.
          if (result.reason === 'plan_required') {
            setLockedRefusal({ releaseId, message: result.error, actionType: 'release.draft_plan' });
          } else if (result.reason === 'tailoring_unavailable') {
            setBuildError({ releaseId, message: result.error });
          }
        })
        .finally(() => {
          setGenerating(releaseId, false);
          void loadCommandCenter({ force: true });
          // A build may have spent credits: the header pill and the strip
          // re-read now rather than showing the old balance.
          invalidateUrgansUsage();
        });

      closeIntake();
      router.push(`/dashboard?release=${releaseId}`);
    } catch (submitError) {
      setView('error');
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not start your plan. Your answers are safe. Try again.'
      );
    }
  };

  if (!open || !intakePayload) return null;
  if (typeof document === 'undefined') return null;

  const stepMeta = INTAKE_STEPS[step];
  const isLastStep = nextIntakeStep(visibleSteps, step) === null;
  const stepPosition = intakeStepPosition(visibleSteps, step);

  const modal = (
    <div
      ref={panelRef}
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center px-4 py-4 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planner-intake-heading"
    >
      <button
        type="button"
        aria-label="Close the planner"
        onClick={dismiss}
        className="absolute inset-0 h-full w-full cursor-default bg-bg-overlay"
        tabIndex={-1}
      />

      <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))] sm:max-h-[calc(100dvh-4rem)]">
        <div className="shrink-0 border-b border-stroke-subtle p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-brand">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                UrgAns planner
              </p>
              <p className="mt-1 font-mono text-[11px] text-content-tertiary">
                {getStepKicker(step, visibleSteps)}
              </p>
            </div>
            <IconButton
              type="button"
              onClick={dismiss}
              disabled={isBusy}
              aria-label="Close the planner"
              className="shrink-0 border-stroke-default bg-[rgb(var(--color-stroke)/0.02)]"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div
            className="mt-4 flex items-center gap-1.5"
            aria-label={getStepKicker(step, visibleSteps)}
          >
            {visibleSteps.map((visibleStep, index) => (
              <span
                key={visibleStep}
                aria-hidden="true"
                className={`h-1 flex-1 rounded-full transition-colors duration-base ease-standard ${
                  index < stepPosition ? 'bg-brand' : 'bg-stroke-strong'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <h2
            id="planner-intake-heading"
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-xl font-semibold leading-tight text-content-primary outline-none"
          >
            {stepMeta.title}
          </h2>

          <div className="mt-4">
            <StepBody
              step={step}
              draft={draft}
              patch={patch}
              disabled={isBusy}
              knownArtistName={knownArtistName}
              suggestedDate={suggestedDate}
              leadTimeDays={leadTimeDays}
              fromNote={intakePayload.source === 'note'}
              otherRollouts={otherRollouts}
            />
          </div>

          {/* The free preview (v1.92.0): what the plan starts from, read from
              the playbook in the browser, on the first question a person sees
              and only once the type is known. No request and no credits; the
              cost and the balance stay in the footer line below. */}
          {step === firstStep && draft.releaseType ? (
            <PlannerTemplatePreview releaseType={draft.releaseType} />
          ) : null}

          <p aria-live="polite" role="status" className="sr-only">
            {`${getStepKicker(step, visibleSteps)}: ${stepMeta.title}`}
          </p>

          {error ? (
            <p role="alert" className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs leading-5 text-status-error">
              {error}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-stroke-subtle p-4 sm:p-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {previousIntakeStep(visibleSteps, step) !== null ? (
              <button
                type="button"
                onClick={goBack}
                disabled={isBusy}
                className="motion-focus inline-flex h-11 items-center justify-center rounded-full px-3 text-sm font-medium text-content-secondary transition-colors hover:text-content-primary disabled:opacity-60 sm:h-9"
              >
                Back
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}

            {/* aria-disabled rather than disabled while an answer is missing:
                a disabled button swallows the tap with no feedback, which is
                the rage-click the replay showed. This one LOOKS disabled (grey,
                not a faded brand pill that still reads as live on a phone) and
                a tap on it points at the sentence below saying what is missing. */}
            <Button
              type="button"
              onClick={goNext}
              disabled={isBusy}
              aria-disabled={!canAdvance || isBusy}
              aria-describedby={blocker ? 'planner-intake-blocker' : undefined}
              className={`h-11 w-full justify-center sm:w-auto ${
                canAdvance || isBusy
                  ? ''
                  : '!cursor-not-allowed !border-stroke-default !bg-bg-hover !text-content-tertiary !shadow-none hover:!translate-y-0 hover:!bg-bg-hover'
              }`}
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Building your plan
                </>
              ) : isLastStep ? (
                'Build my plan'
              ) : (
                'Continue'
              )}
            </Button>
          </div>

          {blocker && !isBusy ? (
            <p
              id="planner-intake-blocker"
              role="status"
              aria-live="polite"
              className={`mt-3 text-center text-xs leading-5 sm:text-right ${
                nudged ? 'font-semibold text-status-warning' : 'text-content-secondary'
              }`}
            >
              {blocker}
            </p>
          ) : null}

          <p className="mt-3 text-center text-[11px] leading-5 text-content-tertiary sm:text-left">
            UrgAns builds the plan when you finish. You can change any activity after.
            {isCreditsEnabled()
              ? ` ${firstPlanFree === true ? FIRST_PLAN_FREE_LINE : embeddedCostLine('release.draft_plan', balance)}`
              : ''}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
