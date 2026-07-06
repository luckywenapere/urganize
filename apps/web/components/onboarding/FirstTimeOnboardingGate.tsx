'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import {
  deriveOnboardingRoleFromPersona,
  type OnboardingBiggestHeadache,
  type OnboardingPersona,
  type OnboardingReleaseProcess,
  normalizeOnboardingState,
  shouldShowOnboardingModal,
  type OnboardingApiError,
  type OnboardingApiResponse,
  type OnboardingState,
  type UpdateOnboardingBody,
} from '@/lib/onboarding';
import { supabase } from '@/lib/supabase/client';

type CreateReleaseResponse = {
  release?: {
    id: string;
    title: string;
  };
  releaseId?: string;
  error?: string;
};

const PUBLIC_ROUTE_PREFIXES = ['/auth', '/onboarding', '/invite'];
const EDUCATION_CARDS = [
  {
    headline: 'Every release gets a workspace.',
    copy: 'Tasks, tracks, timelines, and collaboration - all in one place.',
    label: 'Release Workspace',
  },
] as const;
const STEP_TWO_ANIMATION_STYLE = { animationDuration: '200ms' } as const;
const PERSONA_OPTIONS: Array<{ value: OnboardingPersona; label: string }> = [
  { value: 'independent_artist', label: 'Independent Artist' },
  { value: 'music_manager', label: 'Music Manager' },
  { value: 'label_ar', label: 'Label / A&R' },
  { value: 'producer_beatmaker', label: 'Producer / Beatmaker' },
  { value: 'other', label: 'Other' },
];
const RELEASE_PROCESS_OPTIONS: Array<{ value: OnboardingReleaseProcess; label: string }> = [
  { value: 'spreadsheets_or_notes', label: 'Spreadsheets or notes' },
  { value: 'group_chats_and_dms', label: 'Group chats and DMs' },
  { value: 'nothing_structured_yet', label: 'Nothing structured yet' },
  { value: 'another_tool', label: 'Another tool' },
];
const BIGGEST_HEADACHE_OPTIONS: Array<{ value: OnboardingBiggestHeadache; label: string }> = [
  { value: 'keeping_team_aligned', label: 'Keeping the team aligned' },
  { value: 'tracking_whats_done_and_whats_next', label: "Tracking what's done and what's next" },
  { value: 'collecting_credits_and_metadata', label: 'Collecting credits and metadata' },
  { value: 'managing_multiple_releases_at_once', label: 'Managing multiple releases at once' },
];
const STEP_FOUR_COMPARISON_ROWS = [
  {
    without: 'Scattered DMs and spreadsheets',
    with: 'One workspace per release',
  },
  {
    without: 'Chasing credits at the last minute',
    with: 'Credits collected automatically',
  },
  {
    without: "Team confusion about what's next",
    with: 'Everyone sees the same plan',
  },
  {
    without: 'Release chaos every single time',
    with: 'A repeatable process',
  },
] as const;
const _STEP_FIVE_FEATURES = [
  'Unlimited releases after your first',
  'Full task management and playbook',
  'Credits and metadata tools',
  'Track uploads and private share links',
  'Pre-save campaigns',
  'Team collaboration',
] as const;

const buildReleasePath = (releaseId: string) => `/dashboard/releases/${releaseId}`;

const getFirstName = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return 'there';
  }

  return trimmed.split(/\s+/)[0] || 'there';
};

const getStepThreePrompt = (persona: OnboardingPersona | null) => {
  if (persona === 'independent_artist') {
    return 'What are you working on right now?';
  }

  if (persona === 'music_manager') {
    return 'What release are you managing?';
  }

  if (persona === 'label_ar') {
    return 'What project is active right now?';
  }

  return "What's your first release?";
};

function EducationCardPreview({
  cardIndex,
  tick,
}: {
  cardIndex: number;
  tick: number;
}) {
  if (cardIndex === 0) {
    const activePhase = tick % 3;
    return (
      <div className="relative overflow-hidden rounded-[28px] border border-stroke-default bg-bg-surface/90 p-5 shadow-[0_26px_70px_-40px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
        <div className="pointer-events-none absolute inset-x-12 top-8 h-24 rounded-full bg-brand/12 blur-3xl" />
        <div className="relative space-y-3">
          {['Pre-Release', 'Release Week', 'Post-Release'].map((phase, index) => (
            <div
              key={phase}
              className={`rounded-[24px] border px-4 py-4 transition-all duration-500 ${
                index === activePhase
                  ? 'border-brand/35 bg-brand-muted shadow-[0_18px_36px_-30px_rgba(62,207,142,0.7)]'
                  : 'border-stroke-default bg-bg-elevated/85'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">{phase}</p>
                  <p className="mt-2 text-sm font-semibold text-content-primary">
                    {index === 0 ? 'Build the plan' : index === 1 ? 'Move every deadline' : 'Close the loop'}
                  </p>
                </div>
                <div
                  className={`h-3 w-3 rounded-full transition-all duration-500 ${
                    index === activePhase ? 'bg-brand shadow-[0_0_24px_rgba(62,207,142,0.8)]' : 'bg-content-quaternary'
                  }`}
                />
              </div>
              <div className="mt-4 h-2 rounded-full bg-bg-overlay">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-700"
                  style={{ width: `${index < activePhase ? 100 : index === activePhase ? 72 : 22}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, blockIndex) => (
                  <div
                    key={blockIndex}
                    className={`h-8 rounded-2xl border transition-all duration-500 ${
                      blockIndex <= index
                        ? 'border-brand/25 bg-brand/12'
                        : 'border-stroke-subtle bg-bg-base/55'
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function StepQuestion<TValue extends string>({
  prompt,
  options,
  selectedValue,
  onSelect,
  disabled,
}: {
  prompt: string;
  options: Array<{ value: TValue; label: string }>;
  selectedValue: TValue | null;
  onSelect: (value: TValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="animate-in space-y-3" style={STEP_TWO_ANIMATION_STYLE}>
      <h2 className="text-[clamp(1.9rem,4vw,2.8rem)] tracking-tight text-content-primary">{prompt}</h2>
      <div className="space-y-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`w-full rounded-[24px] border px-4 py-4 text-left text-base font-medium transition hover:-translate-y-[1px] hover:bg-bg-hover disabled:opacity-60 ${
              selectedValue === option.value
                ? 'border-brand/40 bg-brand-muted text-content-primary'
                : 'border-stroke-default bg-bg-surface/90 text-content-secondary'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FirstTimeOnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore();

  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [schemaSql, setSchemaSql] = useState('');
  const [educationIndex, setEducationIndex] = useState(0);
  const [demoTick, setDemoTick] = useState(0);
  const [showStepTwoClosingLine, setShowStepTwoClosingLine] = useState(false);
  const [isAdvancingFromStepTwo, setIsAdvancingFromStepTwo] = useState(false);
  const [releaseName, setReleaseName] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [workspaceCreationName, setWorkspaceCreationName] = useState('');
  const hasStartedStepOneAutoAdvance = useRef(false);
  const releaseInputRef = useRef<HTMLInputElement | null>(null);

  const shouldMountGate = useMemo(() => {
    if (!isAuthenticated || authLoading || !pathname) {
      return false;
    }

    return !PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  }, [authLoading, isAuthenticated, pathname]);

  const currentStep = onboarding?.onboardingStep ?? 1;
  const visibleStep = workspaceCreationName ? 3 : currentStep;
  const shouldShowGate = shouldShowOnboardingModal(onboarding);
  const canGoBack = (visibleStep === 1 && educationIndex > 0) || visibleStep === 2;
  const firstName = getFirstName(user?.name || user?.artist_name || user?.email);
  const hasCompletedStepTwoQuestions = Boolean(
    onboarding?.onboardingPersona &&
      onboarding?.onboardingReleaseProcess &&
      onboarding?.onboardingBiggestHeadache
  );
  const stepThreePrompt = getStepThreePrompt(onboarding?.onboardingPersona || null);
  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token || '';

    if (!accessToken) {
      throw new Error('Session expired. Please sign in again.');
    }

    return accessToken;
  };

  const loadOnboarding = async () => {
    if (!shouldMountGate) {
      setOnboarding(null);
      setIsBootstrapping(false);
      return;
    }

    try {
      setIsBootstrapping(true);
      setError('');

      const accessToken = await getAccessToken();
      const response = await fetch('/api/user/onboarding', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        OnboardingApiResponse & OnboardingApiError
      >;

      if (response.status === 501 && payload.sql) {
        setSchemaSql(payload.sql);
      }

      if (!response.ok || !payload.onboarding) {
        throw new Error(payload.error || 'Could not load onboarding state.');
      }

      setSchemaSql('');
      setOnboarding(
        normalizeOnboardingState({
          onboarding_completed: payload.onboarding.onboardingCompleted,
          onboarding_step: payload.onboarding.onboardingStep,
          onboarding_completed_at: payload.onboarding.onboardingCompletedAt,
          onboarding_role: payload.onboarding.onboardingRole,
          onboarding_persona: payload.onboarding.onboardingPersona,
          onboarding_release_process: payload.onboarding.onboardingReleaseProcess,
          onboarding_biggest_headache: payload.onboarding.onboardingBiggestHeadache,
          onboarding_release_id: payload.onboarding.releaseId,
          onboarding_task_id: payload.onboarding.taskId,
        })
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load onboarding state.');
    } finally {
      setIsBootstrapping(false);
    }
  };

  const patchOnboarding = async (body: UpdateOnboardingBody) => {
    const accessToken = await getAccessToken();
    const response = await fetch('/api/user/onboarding', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as Partial<
      OnboardingApiResponse & OnboardingApiError
    >;

    if (response.status === 501 && payload.sql) {
      setSchemaSql(payload.sql);
    }

    if (!response.ok || !payload.onboarding) {
      throw new Error(payload.error || 'Could not update onboarding state.');
    }

    const nextState = normalizeOnboardingState({
      onboarding_completed: payload.onboarding.onboardingCompleted,
      onboarding_step: payload.onboarding.onboardingStep,
      onboarding_completed_at: payload.onboarding.onboardingCompletedAt,
      onboarding_role: payload.onboarding.onboardingRole,
      onboarding_persona: payload.onboarding.onboardingPersona,
      onboarding_release_process: payload.onboarding.onboardingReleaseProcess,
      onboarding_biggest_headache: payload.onboarding.onboardingBiggestHeadache,
      onboarding_release_id: payload.onboarding.releaseId,
      onboarding_task_id: payload.onboarding.taskId,
    });

    setSchemaSql('');
    setOnboarding(nextState);
    return nextState;
  };

  useEffect(() => {
    void loadOnboarding();
    // Intentionally keyed only on shouldMountGate. loadOnboarding identity
    // changes each render; adding it would trigger refetch on every state
    // update inside this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldMountGate]);

  useEffect(() => {
    if (!shouldMountGate || !shouldShowGate) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldMountGate, shouldShowGate]);

  useEffect(() => {
    if (currentStep !== 1 || educationIndex >= EDUCATION_CARDS.length - 1) {
      hasStartedStepOneAutoAdvance.current = false;
      return;
    }

    if (hasStartedStepOneAutoAdvance.current) {
      return;
    }

    hasStartedStepOneAutoAdvance.current = true;
    const timeoutId = window.setTimeout(() => {
      setEducationIndex((currentIndex) => Math.min(currentIndex + 1, EDUCATION_CARDS.length - 1));
      hasStartedStepOneAutoAdvance.current = false;
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
      hasStartedStepOneAutoAdvance.current = false;
    };
  }, [currentStep, educationIndex]);

  useEffect(() => {
    if (currentStep !== 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setDemoTick((value) => value + 1);
    }, 950);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentStep]);

  useEffect(() => {
    if (visibleStep !== 3 || workspaceCreationName) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      releaseInputRef.current?.focus();
    }, 50);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visibleStep, workspaceCreationName]);

  useEffect(() => {
    if (currentStep !== 2 || !hasCompletedStepTwoQuestions) {
      setShowStepTwoClosingLine(false);
      setIsAdvancingFromStepTwo(false);
      return;
    }

    if (isAdvancingFromStepTwo) {
      return;
    }

    setShowStepTwoClosingLine(true);
    setIsAdvancingFromStepTwo(true);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          await patchOnboarding({
            onboardingStep: 3,
          });
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : 'Could not continue onboarding.');
          setIsAdvancingFromStepTwo(false);
        }
      })();
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // patchOnboarding closes over component state; adding it to deps would
    // cause the closing-line animation to retrigger on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, hasCompletedStepTwoQuestions, isAdvancingFromStepTwo]);

  const handleGoBack = async () => {
    if (currentStep === 1 && educationIndex > 0) {
      setEducationIndex((currentIndex) => Math.max(0, currentIndex - 1));
      return;
    }

    if (currentStep === 2) {
      try {
        setIsSaving(true);
        setError('');
        setEducationIndex(EDUCATION_CARDS.length - 1);
        await patchOnboarding({
          onboardingStep: 1,
        });
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Could not go back right now.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleAdvanceFromEducation = async () => {
    if (educationIndex < EDUCATION_CARDS.length - 1) {
      setEducationIndex((currentIndex) => Math.min(currentIndex + 1, EDUCATION_CARDS.length - 1));
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await patchOnboarding({
        onboardingStep: 2,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not continue onboarding.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectPersona = async (value: OnboardingPersona) => {
    try {
      setIsSaving(true);
      setError('');
      await patchOnboarding({
        onboardingStep: 2,
        onboardingPersona: value,
        onboardingRole: deriveOnboardingRoleFromPersona(value),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your answer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectReleaseProcess = async (value: OnboardingReleaseProcess) => {
    try {
      setIsSaving(true);
      setError('');
      await patchOnboarding({
        onboardingStep: 2,
        onboardingReleaseProcess: value,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your answer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectBiggestHeadache = async (value: OnboardingBiggestHeadache) => {
    try {
      setIsSaving(true);
      setError('');
      setShowStepTwoClosingLine(true);
      await patchOnboarding({
        onboardingStep: 2,
        onboardingBiggestHeadache: value,
      });
    } catch (saveError) {
      setShowStepTwoClosingLine(false);
      setError(saveError instanceof Error ? saveError.message : 'Could not save your answer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFirstRelease = async () => {
    const normalizedReleaseName = releaseName.trim();
    if (!normalizedReleaseName) {
      setError('Release name is required.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      const accessToken = await getAccessToken();
      const response = await fetch('/api/releases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: normalizedReleaseName,
          source: 'onboarding',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateReleaseResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create your first release.');
      }

      const nextReleaseId = String(payload.release?.id || payload.releaseId || '').trim();
      if (!nextReleaseId) {
        throw new Error('Release created, but the release id was missing.');
      }

      setWorkspaceCreationName(normalizedReleaseName);
      await patchOnboarding({
        onboardingStep: 4,
        releaseId: nextReleaseId,
      });

      window.setTimeout(() => {
        setWorkspaceCreationName('');
        setIsSaving(false);
      }, 600);
      return;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create your first release.');
    }

    setIsSaving(false);
  };

  const handleFinishOnboarding = async () => {
    try {
      setIsSaving(true);
      setError('');
      if (onboarding?.releaseId) {
        const accessToken = await getAccessToken();
        await fetch(`/api/releases/${onboarding.releaseId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title: releaseName,
            releaseDate: releaseDate || null,
          }),
        }).catch((err) => {
          console.error('Failed to save release date:', err);
        });
      }

      await patchOnboarding({
        onboardingCompleted: true,
        onboardingStep: 5,
      });
      await checkAuth();
      router.replace(onboarding?.releaseId ? buildReleasePath(onboarding.releaseId) : '/dashboard');
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : 'Could not finish onboarding.');
    }

    setIsSaving(false);
  };

  if (!shouldMountGate || isBootstrapping || !shouldShowGate || !onboarding) {
    return null;
  }

  const card = EDUCATION_CARDS[educationIndex];

  return (
    <div className="fixed inset-0 z-[9998] overflow-y-auto bg-bg-base/98 text-content-primary">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-12 h-56 w-56 rounded-full bg-brand/12 blur-[90px]" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-status-info/8 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-brand/8 blur-[120px]" />
      </div>

      <div className="relative flex min-h-screen flex-col px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface/90 text-sm font-semibold text-content-primary">
              U
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">New Workspace</p>
              <p className="brand-mark text-lg text-content-primary">Urganize</p>
            </div>
          </div>

          {canGoBack ? (
            <button
              type="button"
              onClick={() => void handleGoBack()}
              disabled={isSaving}
              className="inline-flex min-h-11 items-center rounded-full border border-stroke-default bg-bg-surface/90 px-4 text-sm font-medium text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
            >
              Back
            </button>
          ) : (
            <span className="rounded-full border border-stroke-default bg-bg-surface/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-content-secondary">
              Step {visibleStep} of 5
            </span>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                index + 1 <= visibleStep ? 'bg-brand' : 'bg-content-quaternary'
              }`}
            />
          ))}
        </div>

        {schemaSql ? (
          <div className="mt-5 rounded-[24px] border border-status-warning/35 bg-status-warning/10 px-4 py-3 text-sm text-status-warning">
            Onboarding profile columns still need to be added before this flow can run. See
            {' '}
            <span className="font-semibold">apps/web/docs/DB_MIGRATION_ONBOARDING.md</span>.
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-[24px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </div>
        ) : null}

        {visibleStep === 1 ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <div className="w-full max-w-5xl">
              <div className="mx-auto max-w-2xl text-center">
                <p className="saas-eyebrow">Step 1 of 5</p>
                <h1 className="mt-4 text-[clamp(2.4rem,7vw,5.2rem)] tracking-tight text-content-primary">
                  {card.headline}
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
                  {card.copy}
                </p>
              </div>

              <div className="mt-8">
                <EducationCardPreview cardIndex={educationIndex} tick={demoTick} />
              </div>

              <div className="mt-7 flex flex-col items-center gap-5">
                <div className="flex items-center gap-2">
                  {EDUCATION_CARDS.map((demoCard, index) => (
                    <span
                      key={demoCard.label}
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        index === educationIndex ? 'w-10 bg-brand' : 'w-2.5 bg-content-quaternary'
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void handleAdvanceFromEducation()}
                  disabled={isSaving}
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
                >
                  {isSaving
                    ? 'Loading...'
                    : educationIndex === EDUCATION_CARDS.length - 1
                      ? "That's what we do ->"
                      : 'Next'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {visibleStep === 2 ? (
          <div className="flex flex-1 items-center justify-center px-1 py-8">
            <div className="w-full max-w-3xl">
              <div className="mx-auto max-w-2xl text-center">
                <p className="saas-eyebrow">Step 2 of 5</p>
                <h1 className="mt-4 text-[clamp(2.2rem,6vw,4.4rem)] tracking-tight text-content-primary">
                  Let&apos;s make this feel like yours.
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
                  Answer a few quick questions so Urganize can meet you where you already are.
                </p>
              </div>

              <div className="mt-8 space-y-6">
                <StepQuestion
                  prompt={`Hey ${firstName}. What best describes you?`}
                  options={PERSONA_OPTIONS}
                  selectedValue={onboarding.onboardingPersona}
                  onSelect={(value) => {
                    void handleSelectPersona(value);
                  }}
                  disabled={isSaving}
                />

                {onboarding.onboardingPersona ? (
                  <StepQuestion
                    prompt="How are you handling releases right now?"
                    options={RELEASE_PROCESS_OPTIONS}
                    selectedValue={onboarding.onboardingReleaseProcess}
                    onSelect={(value) => {
                      void handleSelectReleaseProcess(value);
                    }}
                    disabled={isSaving}
                  />
                ) : null}

                {onboarding.onboardingReleaseProcess ? (
                  <StepQuestion
                    prompt="What&apos;s your biggest headache?"
                    options={BIGGEST_HEADACHE_OPTIONS}
                    selectedValue={onboarding.onboardingBiggestHeadache}
                    onSelect={(value) => {
                      void handleSelectBiggestHeadache(value);
                    }}
                    disabled={isSaving}
                  />
                ) : null}
              </div>

              {showStepTwoClosingLine ? (
                <div className="animate-in mt-10 text-center" style={STEP_TWO_ANIMATION_STYLE}>
                  <p className="text-[clamp(1.3rem,3vw,1.8rem)] text-content-primary">
                    Got it. Let&apos;s build your workspace.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {visibleStep === 3 ? (
          <div className="flex flex-1 items-center justify-center px-1 py-8">
            {workspaceCreationName ? (
              <div className="w-full max-w-2xl rounded-[32px] border border-stroke-default bg-bg-surface/95 p-6 text-center shadow-[0_28px_90px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-8">
                <p className="saas-eyebrow">Step 3 of 5</p>
                <h2 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] tracking-tight text-content-primary">
                  Your workspace is taking shape.
                </h2>
                <div className="mt-8 flex justify-center">
                  <div className="grid grid-cols-2 gap-2">
                    {['delay-1', 'delay-2', 'delay-3', 'delay-4'].map((delayClass, index) => (
                      <span
                        key={index}
                        className={`animate-scale-in block h-12 w-12 rounded-[16px] border border-brand/25 bg-brand/12 ${delayClass}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="animate-in delay-4 mt-8 rounded-[24px] border border-brand/25 bg-brand-muted px-4 py-4 text-left">
                  <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Workspace name</p>
                  <p className="mt-2 text-lg font-semibold text-content-primary">{workspaceCreationName}</p>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-2xl text-center">
                <p className="saas-eyebrow">Step 3 of 5</p>
                <h1 className="mt-4 text-[clamp(2.4rem,6vw,4.8rem)] tracking-tight text-content-primary">
                  {stepThreePrompt}
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
                  This becomes your first workspace.
                </p>

                <div className="mt-8 rounded-[32px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_28px_90px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
                  <label className="block text-left">
                    <span className="field-label">Release name</span>
                    <input
                      ref={releaseInputRef}
                      value={releaseName}
                      onChange={(event) => setReleaseName(event.target.value)}
                      placeholder="Release name"
                      className="input h-14 rounded-[22px] text-lg font-semibold"
                    />
                  </label>

                  <label className="mt-6 block text-left">
                    <span className="field-label">When do you want this out?</span>
                    <input
                      type="date"
                      value={releaseDate}
                      onChange={(e) => setReleaseDate(e.target.value)}
                      className="input h-14 rounded-[22px] text-lg font-semibold"
                    />
                    <p className="mt-2 text-xs text-content-tertiary">
                      Even a rough date helps us plan your rollout.
                    </p>
                  </label>

                  <p className="mt-4 text-left text-sm text-content-secondary">
                    This becomes your first workspace.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (releaseName.trim()) {
                        void handleCreateFirstRelease();
                        return;
                      }

                      setError('Release name is required.');
                    }}
                    disabled={isSaving}
                    className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
                  >
                    {isSaving ? 'Creating your workspace...' : 'Create My Workspace ->'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {visibleStep === 4 ? (
          <div className="flex flex-1 items-center justify-center px-1 py-8">
            <div className="w-full max-w-6xl">
              <div className="mx-auto max-w-2xl text-center">
                <p className="saas-eyebrow">Step 4 of 5</p>
                <h1 className="mt-4 text-[clamp(2.4rem,6vw,4.8rem)] tracking-tight text-content-primary">
                  Here&apos;s what changes.
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-content-secondary sm:text-base">
                  The release is real now. This is the difference between holding it together manually and running it with one shared system.
                </p>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <section className="rounded-[30px] border border-status-error/20 bg-status-error/[0.06] p-5 shadow-[0_24px_80px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error/75">Without</p>
                  <div className="mt-5 space-y-3">
                    {STEP_FOUR_COMPARISON_ROWS.map((row, index) => (
                      <div
                        key={row.without}
                        className="animate-in rounded-[22px] border border-status-error/15 bg-bg-surface/80 px-4 py-4"
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <p className="text-sm leading-6 text-[rgba(226,226,226,0.72)]">{row.without}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[30px] border border-brand/20 bg-brand-muted/65 p-5 shadow-[0_24px_80px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">With Urganize</p>
                  <div className="mt-5 space-y-3">
                    {STEP_FOUR_COMPARISON_ROWS.map((row, index) => (
                      <div
                        key={row.with}
                        className="animate-in rounded-[22px] border border-brand/20 bg-bg-surface/85 px-4 py-4"
                        style={{ animationDelay: `${index * 100 + 80}ms` }}
                      >
                        <p className="text-sm font-semibold leading-6 text-content-primary">{row.with}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="animate-in mt-6 rounded-[30px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_24px_80px_-46px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))] sm:p-6">
                <p className="text-sm font-semibold text-content-primary">
                  Artists using Urganize spend 70% less time on release admin.
                </p>
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                      <span>Without</span>
                      <span>Admin capacity</span>
                    </div>
                    <div className="h-3 rounded-full bg-bg-overlay">
                      <div className="animate-in h-full w-[32%] rounded-full bg-content-tertiary" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                      <span>With Urganize</span>
                      <span>More room to ship</span>
                    </div>
                    <div className="h-3 rounded-full bg-bg-overlay">
                      <div className="animate-in h-full w-[88%] rounded-full bg-brand" style={{ animationDelay: '120ms' }} />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsSaving(true);
                    setError('');
                    void patchOnboarding({ onboardingStep: 5 })
                      .catch((saveError) => {
                        setError(saveError instanceof Error ? saveError.message : 'Could not continue onboarding.');
                      })
                      .finally(() => {
                        setIsSaving(false);
                      });
                  }}
                  disabled={isSaving}
                  className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
                >
                  {isSaving ? 'Loading...' : "I'm ready to use this ->"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {visibleStep === 5 ? (
          <div className="flex flex-1 items-center justify-center px-1 py-8">
            <div className="w-full max-w-5xl">
              <div className="rounded-[34px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.82*var(--shadow-alpha-scale)))] sm:p-8">
                <div className="mx-auto max-w-2xl text-center">
                  <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                    Your workspace is ready.
                  </span>
                </div>

                <div className="mt-8 flex flex-col items-center">
                  <p className="text-[clamp(1.5rem,4vw,2.4rem)] font-medium tracking-tight text-content-primary">
                    Unlock your full potential
                  </p>
                  <p className="mt-4 max-w-lg text-center text-lg text-content-secondary">
                    You have full access to all Urganize Pro features. Start managing your releases with structured workflows and collaboration tools today.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void handleFinishOnboarding();
                  }}
                  disabled={isSaving}
                  className="mt-10 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:opacity-60"
                >
                  {isSaving ? 'Finishing setup...' : 'Go to Dashboard ->'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
