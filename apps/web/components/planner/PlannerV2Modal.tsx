'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronLeft, Loader2, RefreshCw, X } from '@/components/icons';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { useBackToClose } from '@/lib/use-back-to-close';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { captureAnalyticsEvent, captureFeatureDiscoveryByName, createPostHogEvent } from '@/lib/analytics';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedEstimateCredits } from '@/lib/credits/embedded';
import { FIRST_PLAN_FREE_LINE } from '@/lib/credits/first-plan';
import { invalidateUrgansUsage } from '@/components/app/useUrgansUsage';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { buildDraftDiscardPath } from '@/lib/release-draft-discard';
import type { PlanReleaseType } from '@/lib/release-planning';
import {
  BUDGET_BAND_OPTIONS,
  CHANNEL_OPTIONS,
  CITY_OPTIONS,
  EMPTY_V2_ANSWERS,
  MAX_NOTES,
  MAX_WIN_TEXT,
  OUT_WHEN_OPTIONS,
  READY_OPTIONS,
  STAGE_OPTIONS,
  TEAM_OPTIONS,
  WIN_OPTIONS,
  answerChips,
  budgetBandLabel,
  formatNaira,
  readyTodayFor,
  stageLabel,
  winsNeedCities,
  type PlannerV2Answers,
} from '@/lib/planner-v2/answers';
import { V2_OUT_DATE_TITLE, V2_STEP_TITLES, v2StepBlocker, visibleV2Steps, type V2Step } from '@/lib/planner-v2/steps';
import type { PlanV2, PlanV2Task } from '@/lib/planner-v2/plan';
import type { PlanV2FallbackReason, PlanV2Source } from '@/lib/planner-v2/write-plan';
import { relativeWhenLabel } from '@/lib/planner-v2/when';

/**
 * Plan with UrgAns v2 (2026-10-26, founder approved mock planner-mock.png).
 *
 * Five short questions (the date one is skipped when the rollout has a date),
 * then UrgAns writes the whole plan and shows it here first: "Built for you",
 * the answers as chips, where the Naira goes, the first three tasks. Use this
 * plan saves it as activities; Tweak and Try another angle ask again.
 *
 * Same chrome rules as the v1 intake: portal to body, `h-[100dvh]`, a body
 * that scrolls inside so the one primary button is always reachable.
 */

type View = 'steps' | 'writing' | 'preview' | 'tweak' | 'applying';

type Written = {
  plan: PlanV2;
  source: PlanV2Source;
  notice: string | null;
  fallbackReason: PlanV2FallbackReason | null;
  /** Null when the rollout has no date: tasks read "Now", "4 weeks before"… */
  releaseDate: string | null;
};

const STORAGE_KEY = 'urganize.planner.v2';
const TWEAK_CHIPS = ['Cheaper', 'Fewer tasks', 'More content', 'Add a show', 'No paid ads'];
const todayYmd = () => new Date().toISOString().slice(0, 10);

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function loadStored(releaseId: string): PlannerV2Answers | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { releaseId?: string; answers?: PlannerV2Answers };
    if (parsed.releaseId !== releaseId || !parsed.answers || parsed.answers.version !== 3) return null;
    return { ...EMPTY_V2_ANSWERS, ...parsed.answers };
  } catch {
    return null;
  }
}
function saveStored(releaseId: string, answers: PlannerV2Answers) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ releaseId, answers }));
  } catch {
    // Private mode: answers just do not survive a refresh.
  }
}
function clearStored() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** A date when the rollout has one; "Now", "4 weeks before"… when it does not. */
function whenLabel(releaseYmd: string | null, task: Pick<PlanV2Task, 'offset_days' | 'now'>): string {
  return releaseYmd ? dayLabel(releaseYmd, task.offset_days) : relativeWhenLabel(task.offset_days, task.now);
}
function dayLabel(releaseYmd: string, offset: number): string {
  const ms = Date.parse(`${releaseYmd}T00:00:00Z`) + offset * 86_400_000;
  return Number.isFinite(ms) ? DAY_LABEL.format(new Date(ms)) : '';
}

/** "paced 3 a week": the plan's own rhythm across the weeks it spans. */
function pacePerWeek(tasks: readonly PlanV2Task[]): number {
  if (tasks.length === 0) return 0;
  const offsets = tasks.map((task) => task.offset_days);
  const weeks = Math.max(1, Math.ceil((Math.max(...offsets) - Math.min(...offsets) + 1) / 7));
  return Math.max(1, Math.round(tasks.length / weeks));
}

// ── small parts ─────────────────────────────────────────────────────────────

const CARD =
  'motion-focus motion-press flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-[15px] transition-colors duration-base ease-standard disabled:opacity-60';
const CARD_OFF = 'border-stroke-default bg-[rgb(var(--color-stroke)/0.03)] text-content-primary hover:border-stroke-strong hover:bg-bg-hover';
const CARD_ON = 'border-brand/60 bg-brand/10 font-semibold text-content-primary';

function OptionList<T extends string>({
  label,
  options,
  value,
  onPick,
  multi = false,
  disabled,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: readonly T[];
  onPick: (value: T) => void;
  multi?: boolean;
  disabled?: boolean;
}) {
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={label} className="space-y-2.5">
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            disabled={disabled}
            onClick={() => onPick(option.value)}
            className={`${CARD} ${on ? CARD_ON : CARD_OFF}`}
          >
            <span className="min-w-0">{option.label}</span>
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors ${
                on ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-strong'
              }`}
            >
              {on ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onToggle,
  disabled,
  single = false,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: readonly T[];
  onToggle: (value: T) => void;
  disabled?: boolean;
  single?: boolean;
}) {
  return (
    <div role={single ? 'radiogroup' : 'group'} aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role={single ? 'radio' : 'checkbox'}
            aria-checked={on}
            disabled={disabled}
            onClick={() => onToggle(option.value)}
            className={`motion-focus motion-press inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-base ease-standard disabled:opacity-60 ${
              on
                ? 'border-brand/60 bg-brand/10 font-semibold text-content-primary'
                : 'border-stroke-default bg-[rgb(var(--color-stroke)/0.03)] text-content-secondary hover:border-stroke-strong hover:text-content-primary'
            }`}
          >
            {on ? <Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 mt-7 text-sm text-content-tertiary">{children}</p>;
}

const FIELD =
  'motion-focus h-12 w-full rounded-2xl border border-stroke-control bg-[rgb(var(--color-stroke)/0.03)] px-4 text-[15px] text-content-primary placeholder:text-content-tertiary focus:border-brand/60 disabled:opacity-60';

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

// ── the modal ───────────────────────────────────────────────────────────────

export function PlannerV2Modal() {
  const { firstPlanFree, refresh: refreshCredits } = useCreditBalance({ withFirstPlan: true });
  const router = useRouter();
  const intakePayload = usePlannerStore((state) => state.intake);
  const closeIntake = usePlannerStore((state) => state.closeIntake);
  const setLockedRefusal = usePlannerStore((state) => state.setLockedRefusal);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const profile = useAuthStore((state) => state.user);
  const identityArtist = useWorkspaceIdentityStore((state) => state.artist?.name);
  const releases = useReleaseStore((state) => state.releases);

  const [answers, setAnswers] = useState<PlannerV2Answers>(EMPTY_V2_ANSWERS);
  const [step, setStep] = useState<V2Step>('music');
  const [view, setView] = useState<View>('steps');
  const [error, setError] = useState<{ message: string; outOfCredits?: boolean } | null>(null);
  const [written, setWritten] = useState<Written | null>(null);
  const [releaseId, setReleaseId] = useState('');
  const [tweakText, setTweakText] = useState('');
  const [nudged, setNudged] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const open = Boolean(intakePayload);
  const busy = view === 'writing' || view === 'applying';
  const prefill = intakePayload?.prefill;
  const knownArtistName = prefill?.artistName?.trim() || identityArtist || profile?.artist_name || '';
  const typePrefilled = Boolean(prefill?.releaseType);
  const stageKnown = Boolean(prefill?.musicStage);

  useDialogFocus(open, panelRef, { initialFocus: 'none' });

  // The rollout's own date, wherever the planner was opened from: set on the
  // "Set your release date" row before planning, the plan is dated with it.
  // Music not out yet is never asked for a date (Oyin, 26 Oct 2026).
  const rowDate = useMemo(() => {
    const id = intakePayload?.releaseId;
    const found = id ? releases.find((release) => release.id === id)?.releaseDate : null;
    const ymd = (found ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
  }, [releases, intakePayload?.releaseId]);
  const knownDate = prefill?.releaseDate || rowDate || null;
  // Read by the open effect without re-running it (a catalog refresh mid-flow
  // must not reset the answers).
  const rowDateRef = useRef(rowDate);
  rowDateRef.current = rowDate;
  const steps = useMemo(
    () => visibleV2Steps({ stage: answers.stage, prefilledDate: knownDate, todayYmd: todayYmd(), stageKnown }),
    [answers.stage, knownDate, stageKnown]
  );
  const position = Math.max(0, steps.indexOf(step));
  const isLast = position === steps.length - 1;

  // Hydrate on open. The caller's presets win over anything stored.
  useEffect(() => {
    if (!open || !intakePayload) return;
    const target = intakePayload.releaseId || '';
    const stored = loadStored(target);
    const p = intakePayload.prefill || {};
    const ready = p.readyToday ?? [];
    const base: PlannerV2Answers = stored ?? {
      ...EMPTY_V2_ANSWERS,
      stage: ready.includes('none') ? 'making' : 'finished',
      ready: [
        ...(ready.includes('artwork') ? (['cover_art'] as const) : []),
        ...(ready.includes('visualizer') ? (['video'] as const) : []),
        ...(ready.includes('distributor') ? (['distributor'] as const) : []),
      ],
      budget: p.budget === 'none' ? 'zero' : p.budget === 'over_500k' ? '500k_2m' : p.budget ?? 'under_100k',
      notes: p.extraNotes ?? '',
    };
    setAnswers({
      ...base,
      artist_name: p.artistName?.trim() || base.artist_name || knownArtistName,
      ...(p.releaseType ? { release_type: p.releaseType } : {}),
      ...(p.musicStage ? { stage: p.musicStage, single_first: null } : {}),
      ...(p.releaseDate || rowDateRef.current
        ? { release_date: p.releaseDate || rowDateRef.current, date_mode: 'fixed' as const }
        : {}),
    });
    setReleaseId(target);
    // A record already said where the music is: start on the win.
    setStep(p.musicStage ? 'win' : 'music');
    setView('steps');
    setError(null);
    setWritten(null);
    setTweakText('');
    setHydrated(true);
    void refreshCredits();
    captureFeatureDiscoveryByName('release_planner');
    captureAnalyticsEvent(
      createPostHogEvent('planner_intake_opened', { source: intakePayload.source, has_release: Boolean(target) })
    );
  }, [open, intakePayload, knownArtistName, refreshCredits]);

  useEffect(() => {
    if (open && hydrated) saveStored(releaseId || intakePayload?.releaseId || '', answers);
  }, [answers, open, hydrated, releaseId, intakePayload?.releaseId]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, step, view]);

  useEffect(() => setNudged(false), [step, answers]);

  const dismiss = useCallback(() => {
    if (busy) return;
    captureAnalyticsEvent(createPostHogEvent('planner_intake_dismissed', { step: position }));
    const abandoned = intakePayload?.discardIfAbandoned && intakePayload.releaseId ? intakePayload.releaseId : null;
    const createdTitle = intakePayload?.createdTitle ?? null;
    closeIntake();
    if (abandoned) {
      void (async () => {
        try {
          const token = await getAccessToken();
          if (!token) return;
          const response = await fetch(buildDraftDiscardPath(abandoned, createdTitle), {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) return;
          clearStored();
          void loadCommandCenter({ force: true });
          if (new URLSearchParams(window.location.search).get('release') === abandoned) router.replace('/dashboard');
        } catch {
          // The rollout stays, as before.
        }
      })();
    }
  }, [busy, closeIntake, intakePayload, loadCommandCenter, position, router]);

  // The arrow over the bottom edge shows while more of the question is below.
  const measureScroll = useCallback(() => {
    const node = scrollerRef.current;
    setMoreBelow(Boolean(node && node.scrollHeight - node.scrollTop - node.clientHeight > 8));
  }, []);
  useEffect(() => {
    if (!open) return;
    measureScroll();
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureScroll);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [open, step, view, measureScroll]);

  // Skip the questions: keep the rollout as it is (never discard it, unlike the
  // close button on a rollout made only for this planner) and open it empty.
  // The workspace's plan card still offers the planner later.
  const skip = useCallback(() => {
    if (busy) return;
    captureAnalyticsEvent(createPostHogEvent('planner_intake_skipped', { step: position }));
    const target = intakePayload?.releaseId ?? null;
    closeIntake();
    clearStored();
    if (target) {
      void loadCommandCenter({ force: true });
      router.push(`/dashboard?release=${target}`);
    }
  }, [busy, closeIntake, intakePayload, loadCommandCenter, position, router]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismiss]);
  useBackToClose(open, dismiss);

  const patch = useCallback((changes: Partial<PlannerV2Answers>) => {
    setAnswers((current) => ({ ...current, ...changes }));
  }, []);

  const blocker = v2StepBlocker(step, answers, todayYmd());

  // ── server calls ──────────────────────────────────────────────────────────

  const ensureRelease = async (headers: Record<string, string>): Promise<string> => {
    if (releaseId) return releaseId;
    const created = await fetch('/api/releases', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        releaseDate: answers.stage !== 'out' ? answers.release_date || undefined : undefined,
        releaseType: answers.release_type,
        plan: 'blank',
        source: 'planner',
      }),
    });
    const payload = (await created.json().catch(() => ({}))) as { releaseId?: string; error?: string };
    if (!created.ok || !payload.releaseId) throw new Error(payload.error || 'Could not create the rollout.');
    setReleaseId(payload.releaseId);
    if (intakePayload?.noteId) {
      void fetch(`/api/notes/${intakePayload.noteId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ releaseId: payload.releaseId }),
      }).catch(() => undefined);
    }
    return payload.releaseId;
  };

  const preview = async (mode: 'generate' | 'reroll' | 'tweak', request?: string) => {
    const back: View = view === 'tweak' || view === 'preview' ? 'preview' : 'steps';
    setView('writing');
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const id = await ensureRelease(headers);
      const response = await fetch(`/api/releases/${encodeURIComponent(id)}/plan/v2`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'preview',
          answers,
          mode,
          ...(mode !== 'generate' && written ? { previous: written.plan } : {}),
          ...(request ? { request } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<Written> & { error?: string; code?: string };
      if (!response.ok || !payload.plan) {
        if (payload.code === 'plan_required') {
          closeIntake();
          setLockedRefusal({ releaseId: id, message: payload.error || '', actionType: 'release.draft_plan' });
          router.push(`/dashboard?release=${id}`);
          return;
        }
        setView(back);
        setError({
          message: payload.error || 'AI could not write the plan. Try again.',
          outOfCredits: payload.code === 'out_of_credits',
        });
        return;
      }
      setWritten(payload as Written);
      setTweakText('');
      setView('preview');
      captureAnalyticsEvent(
        createPostHogEvent('planner_v2_previewed', {
          mode,
          source: payload.source ?? null,
          fallback_reason: payload.fallbackReason ?? null,
          task_count: payload.plan.tasks.length,
          stage: answers.stage,
          budget: answers.budget,
        })
      );
    } catch (thrown) {
      setView(back);
      setError({ message: thrown instanceof Error ? thrown.message : 'Could not reach AI. Try again.' });
    } finally {
      invalidateUrgansUsage();
      void refreshCredits();
    }
  };

  const apply = async () => {
    if (!written) return;
    setView('applying');
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const id = await ensureRelease(headers);
      const response = await fetch(`/api/releases/${encodeURIComponent(id)}/plan/v2`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'apply', answers, plan: written.plan, source: written.source }),
      });
      const payload = (await response.json().catch(() => ({}))) as { tasksCreated?: number; error?: string; code?: string };
      if (!response.ok) {
        setView('preview');
        setError({ message: payload.error || 'Could not save the plan. Try again.' });
        return;
      }
      clearStored();
      captureAnalyticsEvent(
        createPostHogEvent('planner_plan_created', {
          source: intakePayload?.source ?? 'chip',
          release_type: answers.release_type,
          task_count: payload.tasksCreated ?? 0,
          tasks_removed: 0,
          exclusions_count: 0,
          ai_applied: written.source !== 'fallback',
        })
      );
      closeIntake();
      void loadCommandCenter({ force: true });
      router.push(`/dashboard?release=${id}`);
    } catch (thrown) {
      setView('preview');
      setError({ message: thrown instanceof Error ? thrown.message : 'Could not save the plan. Try again.' });
    }
  };

  const goNext = () => {
    if (busy) return;
    if (blocker) {
      setNudged(true);
      return;
    }
    setError(null);
    if (isLast) {
      void preview('generate');
      return;
    }
    setStep(steps[position + 1]);
  };
  const goBack = () => {
    if (busy) return;
    setError(null);
    if (view === 'preview') {
      setView('steps');
      return;
    }
    if (view === 'tweak') {
      setView('preview');
      return;
    }
    if (position > 0) setStep(steps[position - 1]);
  };

  if (!open || !intakePayload || typeof document === 'undefined') return null;

  // One short line (Oyin, 26 Oct 2026): no balance sentence here.
  const costLine = isCreditsEnabled()
    ? firstPlanFree === true
      ? FIRST_PLAN_FREE_LINE
      : `Uses about ${embeddedEstimateCredits('release.draft_plan')} credits`
    : '';
  const showBlockerHint = Boolean(blocker);

  // ── question bodies ───────────────────────────────────────────────────────

  const body = (() => {
    switch (step) {
      case 'music':
        return (
          <>
            {!typePrefilled ? (
              <div className="mb-6">
                <Chips<PlanReleaseType>
                  label="What are you releasing?"
                  single
                  options={[
                    { value: 'single', label: 'Single' },
                    { value: 'ep', label: 'EP' },
                    { value: 'album', label: 'Album' },
                  ]}
                  value={[answers.release_type]}
                  onToggle={(value) => patch({ release_type: value, single_first: null })}
                  disabled={busy}
                />
              </div>
            ) : null}
            <OptionList
              label="Where's the music right now?"
              options={STAGE_OPTIONS}
              value={[answers.stage]}
              onPick={(stage) => patch({ stage, ...(stage === 'out' ? { single_first: null } : {}) })}
              disabled={busy}
            />
            {answers.stage === 'finished' ? (
              <>
                <SubLabel>What else is ready?</SubLabel>
                <Chips
                  label="What else is ready?"
                  options={READY_OPTIONS}
                  value={answers.ready}
                  onToggle={(value) => patch({ ready: toggle(answers.ready, value) })}
                  disabled={busy}
                />
              </>
            ) : null}
            {answers.release_type !== 'single' && answers.stage !== 'out' ? (
              <>
                <SubLabel>Drop a single first?</SubLabel>
                <Chips<'yes' | 'no'>
                  label="Drop a single first?"
                  single
                  options={[
                    { value: 'yes', label: 'Yes (recommended)' },
                    { value: 'no', label: 'No' },
                  ]}
                  value={answers.single_first === null ? [] : [answers.single_first ? 'yes' : 'no']}
                  onToggle={(value) => patch({ single_first: value === 'yes' })}
                  disabled={busy}
                />
              </>
            ) : null}
          </>
        );
      case 'date':
        if (answers.stage === 'out') {
          return (
            <>
              <Chips
                label={V2_OUT_DATE_TITLE}
                single
                options={OUT_WHEN_OPTIONS}
                value={answers.out_when ? [answers.out_when] : []}
                onToggle={(value) => patch({ out_when: value, release_date: null })}
                disabled={busy}
              />
              <SubLabel>Know the exact day? (optional)</SubLabel>
              <input
                type="date"
                max={todayYmd()}
                value={answers.release_date ?? ''}
                onChange={(event) => patch({ release_date: event.target.value || null })}
                disabled={busy}
                className={FIELD}
                aria-label="The day it came out"
              />
            </>
          );
        }
        return null;
      case 'win':
        return (
          <>
            <OptionList
              label={V2_STEP_TITLES.win}
              options={WIN_OPTIONS}
              value={answers.wins}
              onPick={(value) => patch({ wins: [value], cities: winsNeedCities([value]) ? answers.cities : [] })}
              disabled={busy}
            />
            {winsNeedCities(answers.wins) ? (
              <>
                <SubLabel>Which cities?</SubLabel>
                <Chips
                  label="Which cities?"
                  options={CITY_OPTIONS}
                  value={answers.cities}
                  onToggle={(value) => patch({ cities: toggle(answers.cities, value) })}
                  disabled={busy}
                />
              </>
            ) : null}
            <SubLabel>Say it your way</SubLabel>
            <input
              type="text"
              value={answers.win_text}
              maxLength={MAX_WIN_TEXT}
              onChange={(event) => patch({ win_text: event.target.value })}
              placeholder="50k streams in 4 weeks"
              disabled={busy}
              className={FIELD}
              aria-label="Say it your way (optional)"
            />
          </>
        );
      case 'budget':
        return (
          <>
            <OptionList
              label={V2_STEP_TITLES.budget}
              options={BUDGET_BAND_OPTIONS}
              value={[answers.budget]}
              onPick={(budget) => patch({ budget, ...(budget === 'zero' ? { budget_exact: null } : {}) })}
              disabled={busy}
            />
            {answers.budget !== 'zero' ? (
              <>
                <SubLabel>Exact amount (optional)</SubLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-content-tertiary">
                    ₦
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={answers.budget_exact ? answers.budget_exact.toLocaleString('en-NG') : ''}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 9);
                      patch({ budget_exact: digits ? Number(digits) : null });
                    }}
                    placeholder="250,000"
                    disabled={busy}
                    className={`${FIELD} pl-8`}
                    aria-label="Exact promo budget in Naira (optional)"
                  />
                </div>
              </>
            ) : null}
          </>
        );
      case 'channels':
        return (
          <>
            <p className="-mt-1 mb-5 text-[15px] text-content-secondary">Pick all that fit.</p>
            <Chips
              label={V2_STEP_TITLES.channels}
              options={CHANNEL_OPTIONS}
              value={answers.channels}
              onToggle={(value) => patch({ channels: toggle(answers.channels, value) })}
              disabled={busy}
            />
            <SubLabel>From your answers</SubLabel>
            <dl className="divide-y divide-stroke-subtle rounded-2xl border border-stroke-default bg-[rgb(var(--color-stroke)/0.03)] px-4">
              {[
                ['Music', stageLabel(answers.stage)],
                ...(answers.release_date && answers.stage !== 'out'
                  ? [['Drops', dayLabel(answers.release_date, 0)]]
                  : []),
                ['Promo budget', answers.budget_exact ? formatNaira(answers.budget_exact) : budgetBandLabel(answers.budget)],
              ].map(([term, value]) => (
                <div key={term} className="flex items-center justify-between gap-3 py-3 text-[15px]">
                  <dt className="text-content-secondary">{term}</dt>
                  <dd className="font-semibold text-content-primary">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        );
      case 'team':
        return (
          <>
            <OptionList
              label={V2_STEP_TITLES.team}
              options={TEAM_OPTIONS}
              value={[answers.team]}
              onPick={(team) => patch({ team })}
              disabled={busy}
            />
            <SubLabel>Anything AI should know? (optional)</SubLabel>
            <textarea
              value={answers.notes}
              maxLength={MAX_NOTES}
              rows={3}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="A collab, merch, a show, a DJ on the project, no ads"
              disabled={busy}
              className={`${FIELD} h-auto resize-none py-3 leading-6`}
            />
          </>
        );
    }
  })();

  // ── preview ───────────────────────────────────────────────────────────────

  const previewBody = written
    ? (() => {
        const { plan } = written;
        const first = plan.tasks.filter((task) => task.first_up).slice(0, 3);
        const rest = plan.tasks.length - first.length;
        const spend = plan.budget.total_naira;
        const lines = plan.budget.lines.filter((line) => line.naira > 0);
        const shades = ['bg-brand', 'bg-brand/70', 'bg-brand/45', 'bg-brand/30', 'bg-brand/20'];
        const chips = answerChips(
          answers,
          answers.stage !== 'out' && written.releaseDate ? dayLabel(written.releaseDate, 0) : null
        );
        return (
          <>
            {written.notice ? (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-content-primary">
                <span>{written.notice}</span>
                <button
                  type="button"
                  onClick={() => void preview('generate')}
                  className="motion-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-stroke-default px-3 text-sm font-semibold hover:bg-bg-hover"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : null}

            <section className="relative overflow-hidden rounded-3xl border border-stroke-default bg-[rgb(var(--color-stroke)/0.04)] p-5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--color-stroke)/0.22)] to-transparent"
              />
              <p className="text-[17px] font-semibold leading-snug text-content-primary">{plan.built_for.summary}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex h-8 items-center rounded-full border border-stroke-default bg-bg-surface/60 px-3 text-[13px] text-content-secondary"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </section>

            <h3 className="mb-3 mt-7 text-sm text-content-tertiary">
              {spend > 0 ? `Where the ${formatNaira(spend)} goes` : 'No spend. Free moves only.'}
            </h3>
            {spend > 0 ? (
              <>
                <div className="flex h-1.5 gap-1" aria-hidden="true">
                  {lines.map((line, index) => (
                    <span
                      key={line.item}
                      className={`h-full rounded-full ${shades[Math.min(index, shades.length - 1)]}`}
                      style={{ flexGrow: line.naira }}
                    />
                  ))}
                </div>
                <ul className="mt-3 space-y-2">
                  {lines.map((line, index) => (
                    <li key={line.item} className="flex items-center gap-3 text-[15px]">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-sm ${shades[Math.min(index, shades.length - 1)]}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-content-primary">{line.item}</span>
                      <span className="font-semibold tabular-nums text-content-primary">{formatNaira(line.naira)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <h3 className="mb-3 mt-7 text-sm text-content-tertiary">First up</h3>
            <ul className="divide-y divide-stroke-subtle rounded-2xl border border-stroke-default bg-[rgb(var(--color-stroke)/0.03)] px-4">
              {first.map((task) => (
                <li key={task.key} className="flex items-start gap-3 py-3.5">
                  <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-stroke-strong" />
                  <div className="min-w-0">
                    <p className="text-[15px] leading-snug text-content-primary">{task.title}</p>
                    <p className="mt-0.5 text-[13px] text-content-tertiary">
                      {whenLabel(written.releaseDate, task)} · {task.cost_naira > 0 ? formatNaira(task.cost_naira) : 'Free'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {rest > 0 ? (
              <p className="mt-3 text-sm text-content-tertiary">
                + {rest} more, paced {pacePerWeek(plan.tasks)} a week
              </p>
            ) : null}
          </>
        );
      })()
    : null;

  const tweakBody = (
    <>
      <div className="flex flex-wrap gap-2">
        {TWEAK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setTweakText((current) => (current ? `${current}. ${chip}` : chip))}
            className="motion-focus motion-press inline-flex h-11 items-center rounded-full border border-stroke-default bg-[rgb(var(--color-stroke)/0.03)] px-4 text-sm text-content-secondary hover:border-stroke-strong hover:text-content-primary"
          >
            {chip}
          </button>
        ))}
      </div>
      <SubLabel>Or say it your way</SubLabel>
      <textarea
        value={tweakText}
        maxLength={300}
        rows={3}
        onChange={(event) => setTweakText(event.target.value)}
        placeholder="Add a show in Lagos"
        className={`${FIELD} h-auto resize-none py-3 leading-6`}
        aria-label="What should change?"
      />
    </>
  );

  // ── frame ─────────────────────────────────────────────────────────────────

  const eyebrow =
    view === 'steps' ? `Question ${position + 1} of ${steps.length}` : 'Plan with AI';
  const title =
    view === 'writing'
      ? 'Writing your plan'
      : view === 'applying'
        ? 'Saving your plan'
        : view === 'preview'
          ? 'Built for you'
          : view === 'tweak'
            ? 'What should change?'
            : step === 'date' && answers.stage === 'out'
              ? V2_OUT_DATE_TITLE
              : V2_STEP_TITLES[step];
  const canGoBack = view === 'preview' || view === 'tweak' || (view === 'steps' && position > 0);

  const modal = (
    <div
      ref={panelRef}
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-end justify-center sm:items-center sm:px-4 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planner-v2-heading"
      data-planner="v2"
    >
      <button
        type="button"
        aria-label="Close the planner"
        onClick={dismiss}
        className="absolute inset-0 h-full w-full cursor-default bg-black/72 backdrop-blur-sm"
        tabIndex={-1}
      />

      <div className="planner-v2-panel relative flex h-[100dvh] w-full max-w-[30rem] flex-col overflow-hidden border-stroke-strong bg-bg-surface/80 shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))] backdrop-blur-xl backdrop-saturate-150 sm:h-auto sm:max-h-[calc(100dvh-4rem)] sm:rounded-[28px] sm:border">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_100%_0%,rgb(var(--color-brand)/0.10),transparent_60%)]"
        />

        <div className="relative flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:pt-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              aria-label="Close the planner"
              className="motion-focus grid h-10 w-10 place-items-center rounded-full bg-[rgb(var(--color-stroke)/0.08)] text-content-secondary transition-colors hover:text-content-primary disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
            {canGoBack ? (
              <button
                type="button"
                onClick={goBack}
                disabled={busy}
                aria-label="Back"
                className="motion-focus grid h-10 w-10 place-items-center rounded-full text-content-secondary transition-colors hover:text-content-primary disabled:opacity-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          {view === 'steps' ? (
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {steps.map((name, index) => (
                <span
                  key={name}
                  className={`h-1 w-5 rounded-full transition-colors duration-base ease-standard ${
                    index <= position ? 'bg-brand' : 'bg-[rgb(var(--color-stroke)/0.18)]'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollerRef}
          onScroll={measureScroll}
          className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 sm:px-7"
        >
          <div key={`${view}-${step}`} className="planner-v2-step">
            <p className="text-sm font-medium text-brand">{eyebrow}</p>
            <h2
              id="planner-v2-heading"
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 font-display text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.01em] text-content-primary outline-none"
            >
              {title}
            </h2>

            <div className="mt-7">
              {view === 'steps' ? body : null}
              {view === 'steps' && position === 0 && prefill?.fromRecord ? (
                <p className="mt-5 text-sm text-brand">From your record: {prefill.fromRecord}</p>
              ) : null}
              {view === 'preview' ? previewBody : null}
              {view === 'tweak' ? tweakBody : null}
              {busy ? (
                <div className="space-y-3" role="status" aria-live="polite">
                  <p className="flex items-center gap-2 text-[15px] text-content-secondary">
                    <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
                    {view === 'writing' ? 'AI is building it around your answers. About half a minute.' : 'Adding the activities to your rollout.'}
                  </p>
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="h-16 rounded-2xl bg-[rgb(var(--color-stroke)/0.06)] motion-safe:animate-pulse" />
                  ))}
                </div>
              ) : null}
            </div>

            <p aria-live="polite" role="status" className="sr-only">{`${eyebrow}: ${title}`}</p>

            {error ? (
              <p role="alert" className="mt-5 rounded-2xl border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm leading-6 text-status-error">
                {error.message}
                {error.outOfCredits ? (
                  <>
                    {' '}
                    <Link href="/dashboard/credits" className="font-semibold underline underline-offset-2">
                      Get credits
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        {moreBelow ? (
          <button
            type="button"
            aria-label="Scroll down for more"
            onClick={() => scrollerRef.current?.scrollBy({ top: 200, behavior: 'smooth' })}
            className="motion-focus absolute bottom-2 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-stroke-strong bg-bg-surface text-content-secondary transition-colors hover:text-content-primary"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        </div>

        {!busy ? (
          <div className="relative shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:pb-6">
            {view === 'steps' ? (
              <>
                <button
                  type="button"
                  onClick={goNext}
                  aria-disabled={Boolean(blocker)}
                  aria-describedby={showBlockerHint ? 'planner-v2-blocker' : undefined}
                  className={`motion-focus motion-press h-14 w-full rounded-full text-base font-semibold transition-colors ${
                    blocker
                      ? 'cursor-not-allowed bg-[rgb(var(--color-stroke)/0.10)] text-content-tertiary'
                      : 'bg-brand text-content-inverse hover:bg-brand-hover'
                  }`}
                >
                  {isLast ? 'Build my plan' : 'Continue'}
                </button>
                <button
                  type="button"
                  onClick={skip}
                  className="motion-focus mt-3 block w-full text-center text-sm text-content-tertiary transition-colors hover:text-content-primary"
                >
                  Skip, I’ll plan it myself
                </button>
                {showBlockerHint ? (
                  <p
                    id="planner-v2-blocker"
                    className={`mt-2.5 text-center text-xs ${nudged ? 'font-semibold text-status-warning' : 'text-content-tertiary'}`}
                  >
                    {blocker}
                  </p>
                ) : isLast && costLine && !blocker ? (
                  <p className="mt-2.5 text-center text-xs text-content-tertiary">{costLine}</p>
                ) : null}
              </>
            ) : null}
            {view === 'preview' ? (
              <>
                <button
                  type="button"
                  onClick={() => void apply()}
                  className="motion-focus motion-press h-14 w-full rounded-full bg-brand text-base font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
                >
                  Use this plan
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setView('tweak');
                    }}
                    className="motion-focus h-11 rounded-full text-[15px] font-semibold text-content-primary hover:bg-bg-hover"
                  >
                    Tweak
                  </button>
                  <button
                    type="button"
                    onClick={() => void preview('reroll')}
                    className="motion-focus h-11 rounded-full text-[15px] font-semibold text-content-primary hover:bg-bg-hover"
                  >
                    Try another angle
                  </button>
                </div>
              </>
            ) : null}
            {view === 'tweak' ? (
              <button
                type="button"
                onClick={() => (tweakText.trim() ? void preview('tweak', tweakText.trim()) : undefined)}
                aria-disabled={!tweakText.trim()}
                className={`motion-focus motion-press h-14 w-full rounded-full text-base font-semibold transition-colors ${
                  tweakText.trim()
                    ? 'bg-brand text-content-inverse hover:bg-brand-hover'
                    : 'cursor-not-allowed bg-[rgb(var(--color-stroke)/0.10)] text-content-tertiary'
                }`}
              >
                Update plan
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
