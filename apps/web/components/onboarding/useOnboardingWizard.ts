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

export const EDUCATION_CARDS = [
  {
    headline: 'Every release gets a workspace.',
    copy: 'Tasks, tracks, timelines, and collaboration - all in one place.',
    label: 'Release Workspace',
  },
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

export function useOnboardingWizard() {
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

  const handleAdvanceFromComparison = () => {
    setIsSaving(true);
    setError('');
    void patchOnboarding({ onboardingStep: 5 })
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : 'Could not continue onboarding.');
      })
      .finally(() => {
        setIsSaving(false);
      });
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

  return {
    // Gating: the gate renders nothing unless this is true.
    shouldRender: Boolean(shouldMountGate && !isBootstrapping && shouldShowGate && onboarding),
    onboarding,
    visibleStep,
    canGoBack,
    isSaving,
    error,
    schemaSql,
    educationIndex,
    demoTick,
    showStepTwoClosingLine,
    firstName,
    stepThreePrompt,
    releaseName,
    setReleaseName,
    releaseDate,
    setReleaseDate,
    workspaceCreationName,
    releaseInputRef,
    handleGoBack,
    handleAdvanceFromEducation,
    handleSelectPersona,
    handleSelectReleaseProcess,
    handleSelectBiggestHeadache,
    handleCreateFirstRelease,
    handleAdvanceFromComparison,
    handleFinishOnboarding,
  };
}
