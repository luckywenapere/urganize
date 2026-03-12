'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { getRolePermissions } from '@/lib/role-permissions';
import { trackEvent } from '@/lib/analytics';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';

type RoleOption = 'manager' | 'artist-team' | 'artist';
type ProofType = 'none' | 'screenshot' | 'video' | 'link' | 'text';
const PROOF_TYPE_OPTIONS: ProofType[] = ['none', 'screenshot', 'video', 'link', 'text'];
type AiTaskGenerationPayload = {
  title: string;
  description: string;
  why_it_matters: string;
  measurable_outcome: string;
};

const GENRE_OPTIONS = [
  'Afrobeats',
  'Afro-fusion',
  'Amapiano',
  'Hip-Hop/Rap',
  'R&B',
  'Pop',
  'Alternative',
  'Gospel',
  'Dancehall',
  'Reggae',
  'House',
  'EDM',
  'Indie',
  'Highlife',
  'Fuji',
  'Folk/Acoustic',
];

const PRIMARY_PLATFORM_OPTIONS = [
  'TikTok',
  'Instagram Reels',
  'YouTube Shorts',
  'YouTube',
  'Spotify',
  'Apple Music',
  'Audiomack',
  'Boomplay',
  'SoundCloud',
  'X (Twitter)',
  'Facebook',
];

const AUDIENCE_SIZE_OPTIONS = [
  'Under 1,000 (combined)',
  '1,000 - 5,000 (combined)',
  '5,001 - 20,000 (combined)',
  '20,001 - 100,000 (combined)',
  '100,000+ (combined)',
  'Not sure yet',
];

const LISTENER_PLATFORM_OPTIONS = [
  'All Streaming Platforms',
  'TikTok',
  'Instagram',
  'YouTube',
  'Spotify',
  'Apple Music',
  'Audiomack',
  'Boomplay',
  'SoundCloud',
  'WhatsApp',
  'X (Twitter)',
  'Facebook',
];

const TIMELINE_OPTIONS = [
  'ASAP (within 2 weeks)',
  'Within 1 month',
  'In 2-3 months',
  'In 4-6 months',
  'This quarter',
  'No fixed deadline',
];

const STAGE_OPTIONS: Array<{ value: 'emerging' | 'growing' | 'established'; label: string }> = [
  { value: 'emerging', label: 'Emerging' },
  { value: 'growing', label: 'Growing' },
  { value: 'established', label: 'Established' },
];
const CAREER_STAGE_VALUES = new Set(['emerging', 'growing', 'established']);
const SONG_STAGE_FALLBACK_CANDIDATES = [
  'pre-production',
  'production',
  'promotion',
  'distribution',
  'draft',
  'idea',
  'planning',
  'recording',
  'mixing',
  'mastering',
  'ready',
  'released',
];

const MIN_GOAL_CHARS = 20;
const MIN_BUDGET = 100;
const MAX_BUDGET = 100000000;
const DEFAULT_PLAN_DURATION_DAYS = 30;
const MIN_FEEDBACK_CHARS = 1;
const CREATE_PLAN_DRAFT_TTL_MS = 10 * 60 * 1000;

const formatDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseStoredDate = (value: string | null | undefined): string => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDateInput(parsed);
};

const normalizeLabel = (value: string): string => value.trim().replace(/\s+/g, ' ');
const addDaysISO = (base: string | Date, days: number): string => {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const isSongStageConstraintError = (error: unknown): boolean => {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return message.includes('release_profiles_song_stage_check');
};

const MIN_GENERATION_MS = 7000;
const PRICING_SHEET_MS = 2500;
const NEXT_CYCLE_TRANSITION_MS = 1800;
const CYCLE_TIMELINE = [
  { step: 3, label: 'Objective', description: 'Define the exact outcome for this cycle in one clear statement.' },
  { step: 4, label: 'Context', description: 'Set audience, budget, and timing constraints that shape the plan.' },
  { step: 5, label: 'Current Steps', description: 'List what already exists so the next task builds on real progress.' },
  { step: 6, label: 'AI Task', description: 'Generate one focused manager-style task with measurable outcome.' },
] as const;

const Step0Intro = dynamic(() => import('@/components/onboarding/steps/Step0Intro').then((mod) => mod.Step0Intro), {
  ssr: false,
});
const Step1Role = dynamic(() => import('@/components/onboarding/steps/Step1Role').then((mod) => mod.Step1Role), {
  ssr: false,
});
const Step2ArtistDetails = dynamic(
  () => import('@/components/onboarding/steps/Step2ArtistDetails').then((mod) => mod.Step2ArtistDetails),
  {
    ssr: false,
  }
);
const Step3Goal = dynamic(() => import('@/components/onboarding/steps/Step3Goal').then((mod) => mod.Step3Goal), {
  ssr: false,
});
const Step4ProfileInputs = dynamic(
  () => import('@/components/onboarding/steps/Step4ProfileInputs').then((mod) => mod.Step4ProfileInputs),
  {
    ssr: false,
  }
);
const Step5ExistingSteps = dynamic(
  () => import('@/components/onboarding/steps/Step5ExistingSteps').then((mod) => mod.Step5ExistingSteps),
  {
    ssr: false,
  }
);
const Step6GeneratingTask = dynamic(
  () => import('@/components/onboarding/steps/Step6GeneratingTask').then((mod) => mod.Step6GeneratingTask),
  {
    ssr: false,
  }
);
const Step7TaskStart = dynamic(
  () => import('@/components/onboarding/steps/Step7TaskStart').then((mod) => mod.Step7TaskStart),
  {
    ssr: false,
  }
);
const Step8TaskDone = dynamic(
  () => import('@/components/onboarding/steps/Step8TaskDone').then((mod) => mod.Step8TaskDone),
  {
    ssr: false,
  }
);

const FeedbackSubmitStep = dynamic(
  () => import('@/components/onboarding/FeedbackSubmitStep').then((mod) => mod.FeedbackSubmitStep),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto mt-16 w-full max-w-[860px] rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl sm:p-8">
        <div className="h-8 w-32 rounded-lg skeleton-shimmer" />
        <div className="mt-4 space-y-3">
          <div className="h-10 rounded-lg skeleton-shimmer" />
          <div className="h-28 rounded-lg skeleton-shimmer" />
          <div className="h-28 rounded-lg skeleton-shimmer" />
        </div>
      </div>
    ),
  }
);

export function PostAuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlanId = searchParams.get('planId');
  const requestedStartStep = Number(searchParams.get('startOnboarding') || 0);
  const flow = searchParams.get('flow');
  const {
    user,
    updateRole,
    logout,
    setNeedsOnboarding,
  } = useAuthStore();

  const [step, setStep] = useState(0);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [generationAttemptKey, setGenerationAttemptKey] = useState(0);
  const [isCycleTransitioning, setIsCycleTransitioning] = useState(false);
  const [cycleNumber, setCycleNumber] = useState(1);
  const [activeTimelineStep, setActiveTimelineStep] = useState<number | null>(null);
  const [hasSubscriptionAccess, setHasSubscriptionAccess] = useState(true);

  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const [showPricingSheet, setShowPricingSheet] = useState(false);
  const [selectedProof, setSelectedProof] = useState<ProofType>('none');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofLink, setProofLink] = useState('');
  const [proofText, setProofText] = useState('');

  const [artistName, setArtistName] = useState('');
  const [genre, setGenre] = useState('');
  const [primaryPlatform, setPrimaryPlatform] = useState('');
  const [goalText, setGoalText] = useState('');
  const [stage, setStage] = useState('');
  const [audienceSize, setAudienceSize] = useState('');
  const [listenerPlatforms, setListenerPlatforms] = useState<string[]>([]);
  const [platformInput, setPlatformInput] = useState('');
  const [budget, setBudget] = useState('');
  const [timeline, setTimeline] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [whatYouTried, setWhatYouTried] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [resultsMode, setResultsMode] = useState<'tracked' | 'not-tracked'>('tracked');
  const [resultsMetrics, setResultsMetrics] = useState('');
  const [blockersNext, setBlockersNext] = useState('');
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<number | null>(null);

  const [taskTitle, setTaskTitle] = useState('Single task');
  const [taskOutcome, setTaskOutcome] = useState('Expected outcome');
  const feedbackDraftLoadedRef = useRef<string>('');
  const onboardingDraftLoadedRef = useRef<string>('');
  const bootstrappedTargetRef = useRef<string>('');
  const nextCycleClearedRef = useRef<string>('');
  const artistDefaultsKey = useMemo(() => (user?.id ? `urganize.artistDefaults.${user.id}` : ''), [user?.id]);
  const hasArtistDefaults = Boolean(artistName.trim() && genre.trim() && primaryPlatform.trim());

  const feedbackDraftKey = useMemo(() => {
    if (!user?.id || !releaseId || !taskId) return '';
    return `urganize.feedbackDraft.${user.id}.${releaseId}.${taskId}`;
  }, [releaseId, taskId, user?.id]);

  const onboardingDraftKey = useMemo(() => {
    if (!user?.id) return '';
    const scope = releaseId || requestedPlanId || (flow === 'create-plan' ? 'new-plan' : '');
    if (!scope) return '';
    return `urganize.onboardingDraft.${user.id}.${scope}`;
  }, [flow, releaseId, requestedPlanId, user?.id]);

  const resetError = () => setError('');
  const isCreatePlanFlow = flow === 'create-plan' && !requestedPlanId;
  const isNextCycleFlow = flow === 'next-cycle';
  const isPlanSetupFlow =
    flow === 'create-plan' ||
    flow === 'resume-plan' ||
    flow === 'next-cycle' ||
    requestedStartStep >= 2 ||
    Boolean(requestedPlanId);

  const resetCycleInputs = useCallback(() => {
    setGoalText('');
    setAudienceSize('');
    setListenerPlatforms([]);
    setPlatformInput('');
    setBudget('');
    setTimeline('');
    setDeadlineDate('');
    setStepsText('');
  }, []);

  const refreshCycleNumber = useCallback(async (activeReleaseId: string) => {
    const { count, error: countError } = await supabase
      .from('ai_tasks')
      .select('id', { head: true, count: 'exact' })
      .eq('release_id', activeReleaseId)
      .eq('status', 'completed');
    if (countError) throw countError;
    setCycleNumber((count || 0) + 1);
  }, []);

  useEffect(() => {
    if (!feedbackDraftKey) {
      feedbackDraftLoadedRef.current = '';
      return;
    }
    if (feedbackDraftLoadedRef.current === feedbackDraftKey) return;
    feedbackDraftLoadedRef.current = feedbackDraftKey;

    const rawDraft = localStorage.getItem(feedbackDraftKey);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Record<string, unknown>;
      if (typeof draft.selectedProof === 'string' && PROOF_TYPE_OPTIONS.includes(draft.selectedProof as ProofType)) {
        setSelectedProof(draft.selectedProof as ProofType);
      }
      if (typeof draft.proofLink === 'string') setProofLink(draft.proofLink);
      if (typeof draft.proofText === 'string') setProofText(draft.proofText);
      if (typeof draft.whatYouTried === 'string') setWhatYouTried(draft.whatYouTried);
      if (typeof draft.whatHappened === 'string') setWhatHappened(draft.whatHappened);
      if (draft.resultsMode === 'tracked' || draft.resultsMode === 'not-tracked') {
        setResultsMode(draft.resultsMode);
      }
      if (typeof draft.resultsMetrics === 'string') setResultsMetrics(draft.resultsMetrics);
      if (typeof draft.blockersNext === 'string') setBlockersNext(draft.blockersNext);
      if (typeof draft.savedAt === 'number' && Number.isFinite(draft.savedAt)) {
        setLastDraftSavedAt(draft.savedAt);
      }
    } catch {
      // Ignore malformed local draft payloads.
    }
  }, [feedbackDraftKey]);

  useEffect(() => {
    if (!feedbackDraftKey) return;
    const savedAt = Date.now();
    const draft = {
      selectedProof,
      proofLink,
      proofText,
      whatYouTried,
      whatHappened,
      resultsMode,
      resultsMetrics,
      blockersNext,
      savedAt,
    };
    localStorage.setItem(feedbackDraftKey, JSON.stringify(draft));
    setLastDraftSavedAt(savedAt);
  }, [
    feedbackDraftKey,
    selectedProof,
    proofLink,
    proofText,
    whatYouTried,
    whatHappened,
    resultsMode,
    resultsMetrics,
    blockersNext,
  ]);

  useEffect(() => {
    if (!onboardingDraftKey) {
      onboardingDraftLoadedRef.current = '';
      return;
    }
    if (onboardingDraftLoadedRef.current === onboardingDraftKey) return;
    onboardingDraftLoadedRef.current = onboardingDraftKey;
    if (isNextCycleFlow) {
      localStorage.removeItem(onboardingDraftKey);
      return;
    }

    const rawDraft = localStorage.getItem(onboardingDraftKey);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Record<string, unknown>;
      const savedAt = typeof draft.savedAt === 'number' ? draft.savedAt : 0;
      const started = !!draft.started;
      if (isCreatePlanFlow) {
        if (!started) {
          localStorage.removeItem(onboardingDraftKey);
          return;
        }
        if (!savedAt || Date.now() - savedAt > CREATE_PLAN_DRAFT_TTL_MS) {
          localStorage.removeItem(onboardingDraftKey);
          return;
        }
      }
      if (typeof draft.artistName === 'string' && !artistName.trim()) setArtistName(draft.artistName);
      if (typeof draft.genre === 'string' && !genre.trim()) setGenre(draft.genre);
      if (typeof draft.primaryPlatform === 'string' && !primaryPlatform.trim()) setPrimaryPlatform(draft.primaryPlatform);
      if (typeof draft.goalText === 'string' && !goalText.trim()) setGoalText(draft.goalText);
      if (typeof draft.stage === 'string' && !stage.trim()) setStage(draft.stage);
      if (typeof draft.audienceSize === 'string' && !audienceSize.trim()) setAudienceSize(draft.audienceSize);
      if (Array.isArray(draft.listenerPlatforms) && listenerPlatforms.length === 0) {
        setListenerPlatforms(draft.listenerPlatforms.filter((item: unknown): item is string => typeof item === 'string'));
      }
      if (typeof draft.platformInput === 'string' && !platformInput.trim()) setPlatformInput(draft.platformInput);
      if (typeof draft.budget === 'string' && !budget.trim()) setBudget(draft.budget);
      if (typeof draft.timeline === 'string' && !timeline.trim()) setTimeline(draft.timeline);
      if (typeof draft.deadlineDate === 'string' && !deadlineDate.trim()) setDeadlineDate(draft.deadlineDate);
      if (typeof draft.stepsText === 'string' && !stepsText.trim()) setStepsText(draft.stepsText);
      if (typeof draft.step === 'number' && Number.isFinite(draft.step)) {
        setStep(Math.max(2, Math.min(9, draft.step)));
      }
    } catch {
      // Ignore malformed local draft payloads.
    }
  }, [
    artistName,
    audienceSize,
    budget,
    deadlineDate,
    genre,
    goalText,
    listenerPlatforms.length,
    onboardingDraftKey,
    platformInput,
    primaryPlatform,
    stage,
    stepsText,
    timeline,
    isCreatePlanFlow,
    isNextCycleFlow,
  ]);

  const hasStartedOnboardingInput =
    artistName.trim().length > 0 ||
    genre.trim().length > 0 ||
    primaryPlatform.trim().length > 0 ||
    goalText.trim().length > 0 ||
    stage.trim().length > 0 ||
    audienceSize.trim().length > 0 ||
    listenerPlatforms.length > 0 ||
    platformInput.trim().length > 0 ||
    budget.trim().length > 0 ||
    timeline.trim().length > 0 ||
    deadlineDate.trim().length > 0 ||
    stepsText.trim().length > 0;

  useEffect(() => {
    if (!onboardingDraftKey) return;
    if (isCreatePlanFlow && !hasStartedOnboardingInput) {
      localStorage.removeItem(onboardingDraftKey);
      return;
    }
    const draft = {
      artistName,
      genre,
      primaryPlatform,
      goalText,
      stage,
      audienceSize,
      listenerPlatforms,
      platformInput,
      budget,
      timeline,
      deadlineDate,
      stepsText,
      step,
      started: hasStartedOnboardingInput,
      savedAt: Date.now(),
    };
    localStorage.setItem(onboardingDraftKey, JSON.stringify(draft));
  }, [
    artistName,
    audienceSize,
    budget,
    deadlineDate,
    genre,
    goalText,
    listenerPlatforms,
    onboardingDraftKey,
    platformInput,
    primaryPlatform,
    stage,
    step,
    stepsText,
    timeline,
    isCreatePlanFlow,
    hasStartedOnboardingInput,
  ]);

  useEffect(() => {
    return () => {
      if (!onboardingDraftKey || !isCreatePlanFlow) return;
      if (!hasStartedOnboardingInput) {
        localStorage.removeItem(onboardingDraftKey);
      }
    };
  }, [hasStartedOnboardingInput, isCreatePlanFlow, onboardingDraftKey]);

  const parseCareerStage = (value: string): 'emerging' | 'growing' | 'established' => {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes('established')) return 'established';
    if (normalized.includes('grow')) return 'growing';
    return 'emerging';
  };

  const mergePlatforms = useCallback((current: string[], incoming: string[]) => {
    const next = [...current];
    const seen = new Set(current.map((item) => item.toLowerCase()));
    incoming.forEach((value) => {
      const normalized = normalizeLabel(value);
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) return;
      seen.add(key);
      next.push(normalized);
    });
    return next;
  }, []);

  const commitPlatformInput = useCallback(() => {
    const values = platformInput
      .split(',')
      .map((item) => normalizeLabel(item))
      .filter(Boolean);
    if (values.length === 0) return;
    setListenerPlatforms((current) => mergePlatforms(current, values));
    setPlatformInput('');
  }, [mergePlatforms, platformInput]);

  const removeListenerPlatform = (value: string) => {
    const normalized = value.toLowerCase();
    setListenerPlatforms((current) => current.filter((item) => item.toLowerCase() !== normalized));
  };

  const syncPrimaryPlatformToAudiencePlatforms = useCallback(() => {
    const normalizedPrimary = normalizeLabel(primaryPlatform);
    if (!normalizedPrimary) return;
    setListenerPlatforms((current) => mergePlatforms(current, [normalizedPrimary]));
  }, [mergePlatforms, primaryPlatform]);

  const applyTimelinePreset = (days: number | null, label: string) => {
    if (days === null) {
      setDeadlineDate('');
      setTimeline(label);
      return;
    }
    const target = new Date();
    target.setDate(target.getDate() + days);
    setDeadlineDate(formatDateInput(target));
    setTimeline(label);
  };

  const setStepPersisted = useCallback(async (nextStep: number, targetReleaseId?: string) => {
    setStep(nextStep);
    const releaseTarget = targetReleaseId || releaseId;
    if (!releaseTarget) return;
    const { error: updateError } = await supabase
      .from('release_profiles')
      .update({ setup_step: nextStep })
      .eq('release_id', releaseTarget);
    if (updateError) throw updateError;
  }, [releaseId]);

  const ensureOnboardingRelease = useCallback(async (): Promise<string> => {
    if (!user) throw new Error('User not found');
    const shouldForceCreatePlan = flow === 'create-plan' && !requestedPlanId;

    if (requestedPlanId && releaseId === requestedPlanId) return releaseId;
    if (!requestedPlanId && releaseId) return releaseId;

    if (requestedPlanId) {
      const { data: requestedRelease, error: requestedReleaseError } = await supabase
        .from('releases')
        .select('id, artist_name, created_at')
        .eq('id', requestedPlanId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (requestedReleaseError) throw requestedReleaseError;
      if (!requestedRelease) throw new Error('Plan not found');

      setReleaseId(requestedRelease.id);
      if (requestedRelease.artist_name) setArtistName(requestedRelease.artist_name);

      const { data: requestedProfile, error: requestedProfileError } = await supabase
        .from('release_profiles')
        .select('setup_step, setup_completed, genre, primary_market, campaign_narrative, target_audience_description, listener_interests, budget_naira, hard_deadline, deadline_reason, other_goals')
        .eq('release_id', requestedRelease.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (requestedProfileError) throw requestedProfileError;

      if (requestedProfile) {
        setGenre(requestedProfile.genre || '');
        setPrimaryPlatform(requestedProfile.primary_market || '');
        setGoalText(requestedProfile.campaign_narrative || '');
        setAudienceSize(requestedProfile.target_audience_description || '');
        setListenerPlatforms(
          Array.isArray(requestedProfile.listener_interests)
            ? requestedProfile.listener_interests.filter((item: unknown): item is string => typeof item === 'string')
            : []
        );
        setBudget(requestedProfile.budget_naira ? String(requestedProfile.budget_naira) : '');
        setDeadlineDate(parseStoredDate(requestedProfile.hard_deadline));
        setTimeline(requestedProfile.deadline_reason || '');
        setStepsText(requestedProfile.other_goals || '');
        setStep(Math.min(9, Math.max(requestedProfile.setup_step || 2, 2)));
        return requestedRelease.id;
      }

      const autoDeadline = addDaysISO(requestedRelease.created_at || new Date(), DEFAULT_PLAN_DURATION_DAYS);
      const { error: requestedProfileInsertError } = await supabase
        .from('release_profiles')
        .insert({
          release_id: requestedRelease.id,
          setup_step: 2,
          setup_completed: false,
          hard_deadline: autoDeadline,
        });
      if (requestedProfileInsertError) throw requestedProfileInsertError;
      setDeadlineDate(parseStoredDate(autoDeadline));
      setStep(2);
      return requestedRelease.id;
    }

    if (shouldForceCreatePlan) {
      const resolvedArtistName = artistName.trim() || user.name || 'Artist';
      const resolvedGenre = genre.trim();
      const resolvedPrimaryPlatform = primaryPlatform.trim();
      const shouldSkipArtistDetails = Boolean(resolvedArtistName && resolvedGenre && resolvedPrimaryPlatform);
      const { data: release, error: releaseInsertError } = await supabase
        .from('releases')
        .insert({
          user_id: user.id,
          title: `${resolvedArtistName} Goal`,
          artist_name: resolvedArtistName,
          type: 'single',
          status: 'draft',
        })
        .select('id, created_at')
        .single();
      if (releaseInsertError || !release) {
        throw releaseInsertError || new Error('Could not create release');
      }

      const { error: profileInsertError } = await supabase
        .from('release_profiles')
        .insert({
          release_id: release.id,
          setup_step: shouldSkipArtistDetails ? 3 : 2,
          setup_completed: false,
          genre: resolvedGenre || null,
          primary_market: resolvedPrimaryPlatform || null,
          hard_deadline: addDaysISO(release.created_at || new Date(), DEFAULT_PLAN_DURATION_DAYS),
        });
      if (profileInsertError) throw profileInsertError;
      trackEvent('release_created', {
        userId: user.id,
        payload: { releaseId: release.id, source: 'create-plan-flow', artistName: resolvedArtistName },
      });

      if (typeof window !== 'undefined') {
        localStorage.removeItem(`urganize.onboardingDraft.${user.id}.new-plan`);
      }

      setReleaseId(release.id);
      return release.id;
    }

    const { data: existingReleases, error: releaseFetchError } = await supabase
      .from('releases')
      .select('id, artist_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (releaseFetchError) throw releaseFetchError;

    if (existingReleases && existingReleases.length > 0) {
      const ids = existingReleases.map((item) => item.id);
      const { data: profiles, error: profileError } = await supabase
        .from('release_profiles')
        .select('release_id, setup_step, setup_completed, genre, primary_market, campaign_narrative, target_audience_description, listener_interests, budget_naira, hard_deadline, deadline_reason, other_goals')
        .in('release_id', ids)
        .order('updated_at', { ascending: false });
      if (profileError) throw profileError;

      const activeProfile = (profiles || []).find((item) => !item.setup_completed);
      if (activeProfile) {
        setReleaseId(activeProfile.release_id);
        setGenre(activeProfile.genre || '');
        setPrimaryPlatform(activeProfile.primary_market || '');
        setGoalText(activeProfile.campaign_narrative || '');
        setAudienceSize(activeProfile.target_audience_description || '');
        setListenerPlatforms(
          Array.isArray(activeProfile.listener_interests)
            ? activeProfile.listener_interests.filter((item: unknown): item is string => typeof item === 'string')
            : []
        );
        setBudget(activeProfile.budget_naira ? String(activeProfile.budget_naira) : '');
        setDeadlineDate(parseStoredDate(activeProfile.hard_deadline));
        setTimeline(activeProfile.deadline_reason || '');
        setStepsText(activeProfile.other_goals || '');

        const release = existingReleases.find((item) => item.id === activeProfile.release_id);
        if (release?.artist_name) setArtistName(release.artist_name);

        setStep(Math.min(9, Math.max(activeProfile.setup_step || 2, 2)));
        return activeProfile.release_id;
      }
    }

    const { data: release, error: releaseInsertError } = await supabase
      .from('releases')
      .insert({
        user_id: user.id,
        title: 'Onboarding Goal',
        artist_name: user.name || 'Artist',
        type: 'single',
        status: 'draft',
      })
      .select('id, created_at')
      .single();
    if (releaseInsertError || !release) {
      throw releaseInsertError || new Error('Could not create release');
    }

    const { error: profileInsertError } = await supabase
      .from('release_profiles')
      .insert({
        release_id: release.id,
        setup_step: 2,
        setup_completed: false,
        hard_deadline: addDaysISO(release.created_at || new Date(), DEFAULT_PLAN_DURATION_DAYS),
      });
    if (profileInsertError) throw profileInsertError;
    trackEvent('release_created', {
      userId: user.id,
      payload: { releaseId: release.id, source: 'auto-onboarding', artistName: user.name || 'Artist' },
    });

    setReleaseId(release.id);
    return release.id;
  }, [artistName, flow, genre, primaryPlatform, releaseId, requestedPlanId, user]);

  const loadCurrentTask = useCallback(async (activeReleaseId: string) => {
    const { data: task, error: taskError } = await supabase
      .from('ai_tasks')
      .select('id, title, description')
      .eq('release_id', activeReleaseId)
      .in('status', ['current', 'pending'])
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (taskError) throw taskError;
    if (task) {
      setTaskId(task.id);
      setTaskTitle(task.title || 'Single task');
      setTaskOutcome(task.description || 'Expected outcome');
      return task;
    }
    setTaskId(null);
    return null;
  }, []);

  const bootstrapTargetKey = `${user?.id || 'anon'}:${requestedPlanId || 'auto'}:${Number.isFinite(requestedStartStep) ? requestedStartStep : 0}`;

  useEffect(() => {
    if (!user) return;
    if (bootstrappedTargetRef.current === bootstrapTargetKey) return;
    bootstrappedTargetRef.current = bootstrapTargetKey;
    setIsBootstrapping(true);

    const bootstrap = async () => {
      try {
        const entitlement = await getSubscriptionAccess(user.id);
        if (!entitlement.hasAccess) {
          setHasSubscriptionAccess(false);
          return;
        }
        setHasSubscriptionAccess(true);

        let resolvedArtistName = '';
        let resolvedGenre = '';
        let resolvedPrimaryPlatform = '';

        if (artistDefaultsKey) {
          const rawDefaults = localStorage.getItem(artistDefaultsKey);
          if (rawDefaults) {
            try {
              const parsed = JSON.parse(rawDefaults) as Record<string, unknown>;
              resolvedArtistName = typeof parsed.artistName === 'string' ? parsed.artistName.trim() : '';
              resolvedGenre = typeof parsed.genre === 'string' ? parsed.genre.trim() : '';
              resolvedPrimaryPlatform = typeof parsed.primaryPlatform === 'string' ? parsed.primaryPlatform.trim() : '';
            } catch {
              // Ignore malformed local defaults.
            }
          }
        }

        if (!resolvedGenre || !resolvedPrimaryPlatform) {
          const { data: recentReleases } = await supabase
            .from('releases')
            .select('id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

          const recentReleaseIds = (recentReleases || []).map((item) => item.id);
          if (recentReleaseIds.length > 0) {
            const { data: recentProfiles } = await supabase
              .from('release_profiles')
              .select('genre,primary_market,updated_at')
              .in('release_id', recentReleaseIds)
              .order('updated_at', { ascending: false })
              .limit(20);

            const bestProfile = (recentProfiles || []).find(
              (item) => !!String(item.genre || '').trim() && !!String(item.primary_market || '').trim()
            );
            if (bestProfile) {
              resolvedGenre = resolvedGenre || String(bestProfile.genre || '').trim();
              resolvedPrimaryPlatform = resolvedPrimaryPlatform || String(bestProfile.primary_market || '').trim();
            }
          }
        }

        const shouldSkipAutoCreate = flow === 'create-plan' && !requestedPlanId;
        let activeReleaseIdForCycle: string | null = null;
        if (!shouldSkipAutoCreate) {
          const activeReleaseId = await ensureOnboardingRelease();
          activeReleaseIdForCycle = activeReleaseId;
          await loadCurrentTask(activeReleaseId);
          await refreshCycleNumber(activeReleaseId);
        }

        const { data: artistProfile } = await supabase
          .from('artist_profiles')
          .select('artist_name, career_stage')
          .eq('user_id', user.id)
          .maybeSingle();

        if (artistProfile?.artist_name) {
          resolvedArtistName = resolvedArtistName || String(artistProfile.artist_name || '').trim();
        }
        if (artistProfile?.career_stage) {
          setStage((current) => current || artistProfile.career_stage || '');
        }

        if (resolvedArtistName) setArtistName((current) => current || resolvedArtistName);
        if (resolvedGenre) setGenre((current) => current || resolvedGenre);
        if (resolvedPrimaryPlatform) setPrimaryPlatform((current) => current || resolvedPrimaryPlatform);

        const canSkipArtistStep = Boolean(resolvedArtistName && resolvedGenre && resolvedPrimaryPlatform);
        if (canSkipArtistStep && artistDefaultsKey) {
          localStorage.setItem(
            artistDefaultsKey,
            JSON.stringify({
              artistName: resolvedArtistName,
              genre: resolvedGenre,
              primaryPlatform: resolvedPrimaryPlatform,
              savedAt: Date.now(),
            })
          );
        }

        if (isNextCycleFlow && activeReleaseIdForCycle && nextCycleClearedRef.current !== activeReleaseIdForCycle) {
          nextCycleClearedRef.current = activeReleaseIdForCycle;
          resetCycleInputs();
          setTaskId(null);
          setTaskTitle('Single task');
          setTaskOutcome('Expected outcome');
          if (user?.id) {
            localStorage.removeItem(`urganize.onboardingDraft.${user.id}.${activeReleaseIdForCycle}`);
          }
          try {
            await supabase
              .from('release_profiles')
              .update({
                setup_step: 3,
                setup_completed: false,
              })
              .eq('release_id', activeReleaseIdForCycle);
          } catch {
            // Non-fatal; UI still proceeds with cycle reset.
          }
          setStep(3);
        } else if (flow === 'first-login' && requestedStartStep === 0 && !requestedPlanId) {
          const permissions = getRolePermissions(user.role);
          if (permissions.role === 'viewer') {
            setNeedsOnboarding(false);
            router.replace('/dashboard');
            return;
          }
          setStep(canSkipArtistStep ? 3 : 2);
        } else if (requestedStartStep >= 2) {
          setStep((current) => Math.max(current, canSkipArtistStep ? 3 : 2));
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load onboarding');
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, [
    artistDefaultsKey,
    bootstrapTargetKey,
    ensureOnboardingRelease,
    flow,
    isNextCycleFlow,
    isPlanSetupFlow,
    loadCurrentTask,
    refreshCycleNumber,
    requestedPlanId,
    requestedStartStep,
    router,
    resetCycleInputs,
    setNeedsOnboarding,
    user,
  ]);

  const upsertArtistProfile = useCallback(async () => {
    if (!user) throw new Error('User not found');
    const { data: existing } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from('artist_profiles')
        .update({
          artist_name: artistName || user.name || 'Artist',
          career_stage: parseCareerStage(stage),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase
      .from('artist_profiles')
      .insert({
        user_id: user.id,
        artist_name: artistName || user.name || 'Artist',
        career_stage: parseCareerStage(stage || 'emerging'),
      });
    if (insertError) throw insertError;
  }, [artistName, stage, user]);

  const persistArtistDefaults = useCallback(() => {
    if (!artistDefaultsKey) return;
    const payload = {
      artistName: artistName.trim(),
      genre: genre.trim(),
      primaryPlatform: primaryPlatform.trim(),
      savedAt: Date.now(),
    };
    if (!payload.artistName || !payload.genre || !payload.primaryPlatform) return;
    localStorage.setItem(artistDefaultsKey, JSON.stringify(payload));
  }, [artistDefaultsKey, artistName, genre, primaryPlatform]);

  const tryRepairLegacySongStage = useCallback(
    async (activeReleaseId: string): Promise<boolean> => {
      if (!user) return false;

      const { data: releases, error: releasesError } = await supabase
        .from('releases')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (releasesError || !releases || releases.length === 0) {
        return false;
      }

      const releaseIds = releases.map((release) => release.id);
      const { data: profiles } = await supabase
        .from('release_profiles')
        .select('release_id, song_stage')
        .in('release_id', releaseIds)
        .order('updated_at', { ascending: false });

      const inferredCandidates = (profiles || [])
        .map((profile) => String((profile as { song_stage?: string | null }).song_stage || '').trim())
        .filter((value) => value && !CAREER_STAGE_VALUES.has(value));

      const uniqueCandidates = Array.from(new Set([...inferredCandidates, ...SONG_STAGE_FALLBACK_CANDIDATES]));

      const clearAttempt = await supabase
        .from('release_profiles')
        .update({ song_stage: null })
        .eq('release_id', activeReleaseId);

      if (!clearAttempt.error) {
        return true;
      }

      for (const candidate of uniqueCandidates) {
        const { error } = await supabase
          .from('release_profiles')
          .update({ song_stage: candidate })
          .eq('release_id', activeReleaseId);

        if (!error) {
          return true;
        }
      }

      return false;
    },
    [user]
  );

  const handleSelectRole = async (role: RoleOption) => {
    resetError();
    setIsBusy(true);
    try {
      await updateRole(role);
      const activeReleaseId = await ensureOnboardingRelease();
      await setStepPersisted(hasArtistDefaults ? 3 : 2, activeReleaseId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save role');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveAddArtist = async () => {
    if (!artistName.trim()) {
      setError('Artist name is required');
      return;
    }

    resetError();
    setIsBusy(true);
    try {
      syncPrimaryPlatformToAudiencePlatforms();
      const activeReleaseId = await ensureOnboardingRelease();
      const { error: releaseUpdateError } = await supabase
        .from('releases')
        .update({
          artist_name: artistName.trim(),
          title: `${artistName.trim()} Goal`,
        })
        .eq('id', activeReleaseId);
      if (releaseUpdateError) throw releaseUpdateError;

      const { error: profileUpdateError } = await supabase
        .from('release_profiles')
        .update({
          genre: genre || null,
          primary_market: primaryPlatform || null,
        })
        .eq('release_id', activeReleaseId);
      if (profileUpdateError) throw profileUpdateError;

      await upsertArtistProfile();
      persistArtistDefaults();
      trackEvent('artist_created', {
        userId: user?.id || null,
        payload: {
          releaseId: activeReleaseId,
          artistName: artistName.trim(),
          genre: genre.trim() || null,
          primaryPlatform: primaryPlatform.trim() || null,
        },
      });
      await setStepPersisted(3, activeReleaseId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save artist details');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveGoal = async () => {
    const goalValue = goalText.trim();
    if (goalValue.length < MIN_GOAL_CHARS) {
      setError(`Add at least ${MIN_GOAL_CHARS} characters so we can generate better tasks.`);
      return;
    }

    resetError();
    setIsBusy(true);
    try {
      const activeReleaseId = await ensureOnboardingRelease();
      const { error: goalUpdateError } = await supabase
        .from('release_profiles')
        .update({ campaign_narrative: goalValue || null })
        .eq('release_id', activeReleaseId);
      if (goalUpdateError) throw goalUpdateError;
      await setStepPersisted(4, activeReleaseId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save goal');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveProfileInputs = async () => {
    const pendingPlatforms = platformInput
      .split(',')
      .map((item) => normalizeLabel(item))
      .filter(Boolean);
    const listeners = mergePlatforms(listenerPlatforms, pendingPlatforms);
    const maybeBudget = Number(budget);
    const hasDeadline = Boolean(deadlineDate);
    const timelineValue = timeline.trim();

    if (!audienceSize.trim()) {
      setError('Select or type your combined audience size.');
      return;
    }

    if (listeners.length === 0) {
      setError('Add at least one audience platform.');
      return;
    }

    if (!budget.trim()) {
      setError('Enter your estimated budget.');
      return;
    }

    if (!Number.isFinite(maybeBudget) || maybeBudget < MIN_BUDGET || maybeBudget > MAX_BUDGET) {
      setError(`Budget should be between ${MIN_BUDGET} and ${MAX_BUDGET}.`);
      return;
    }

    if (!hasDeadline && !timelineValue) {
      setError('Add a target date or timeline hint.');
      return;
    }

    resetError();
    setIsBusy(true);
    try {
      const activeReleaseId = await ensureOnboardingRelease();
      if (pendingPlatforms.length > 0) {
        setListenerPlatforms(listeners);
        setPlatformInput('');
      }

      const profileUpdatePayload = {
        target_audience_description: audienceSize.trim() || null,
        listener_interests: listeners,
        budget_naira: maybeBudget,
        hard_deadline: deadlineDate || null,
        deadline_reason: timelineValue || null,
      };

      let { error: profileUpdateError } = await supabase
        .from('release_profiles')
        .update(profileUpdatePayload)
        .eq('release_id', activeReleaseId);

      if (profileUpdateError && isSongStageConstraintError(profileUpdateError)) {
        const repaired = await tryRepairLegacySongStage(activeReleaseId);
        if (repaired) {
          const retry = await supabase
            .from('release_profiles')
            .update(profileUpdatePayload)
            .eq('release_id', activeReleaseId);
          profileUpdateError = retry.error;
        }
      }

      if (profileUpdateError) throw profileUpdateError;
      await upsertArtistProfile();
      await setStepPersisted(5, activeReleaseId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save profile');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveSteps = async () => {
    resetError();
    setIsBusy(true);
    try {
      const activeReleaseId = await ensureOnboardingRelease();
      const { error: stepsUpdateError } = await supabase
        .from('release_profiles')
        .update({ other_goals: stepsText || null })
        .eq('release_id', activeReleaseId);
      if (stepsUpdateError) throw stepsUpdateError;
      await setStepPersisted(6, activeReleaseId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save steps');
    } finally {
      setIsBusy(false);
    }
  };

  const generateOnboardingTask = useCallback(async (activeReleaseId: string) => {
    if (!user) throw new Error('User not found');

    const existingTask = await loadCurrentTask(activeReleaseId);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Session expired. Sign in again and retry.');
    }

    const generateResponse = await fetch('/api/ai/generate-task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        mode: 'onboarding',
        releaseId: activeReleaseId,
        onboardingInputs: {
          role: user.role || '',
          artist_name: artistName.trim(),
          genre: genre.trim(),
          primary_platform: primaryPlatform.trim(),
          campaign_goal: goalText.trim(),
          career_stage: stage.trim(),
          audience_size: audienceSize.trim(),
          listener_platforms: listenerPlatforms,
          listener_platform_input: platformInput.trim(),
          budget_naira: budget.trim(),
          timeline: timeline.trim(),
          hard_deadline: deadlineDate.trim(),
          existing_steps: stepsText.trim(),
        },
      }),
    });

    const generatedPayload = (await generateResponse.json().catch(() => ({}))) as
      | Partial<AiTaskGenerationPayload>
      | { error?: string; detail?: string };

    if (!generateResponse.ok) {
      const failurePayload = generatedPayload as { error?: string; detail?: string };
      throw new Error(
        String(
          `${failurePayload.error || 'Task generation failed after retries. Please generate again.'}${
            failurePayload.detail ? ` (${failurePayload.detail})` : ''
          }`
        )
      );
    }

    const title = String((generatedPayload as Partial<AiTaskGenerationPayload>).title || '').trim();
    const description = String((generatedPayload as Partial<AiTaskGenerationPayload>).description || '').trim();
    const whyItMatters = String((generatedPayload as Partial<AiTaskGenerationPayload>).why_it_matters || '').trim();
    const measurableOutcome = String((generatedPayload as Partial<AiTaskGenerationPayload>).measurable_outcome || '').trim();

    if (!title || !description || !whyItMatters || !measurableOutcome) {
      throw new Error('AI returned an invalid task format. Please generate again.');
    }

    const nextDescription = `${description}\n\nMeasurable outcome: ${measurableOutcome}`;
    const nextWhy = `${whyItMatters}\nMeasurable outcome: ${measurableOutcome}`;

    if (existingTask?.id) {
      const { data: updatedTask, error: updateTaskError } = await supabase
        .from('ai_tasks')
        .update({
          title,
          description: nextDescription,
          why_it_matters: nextWhy,
          status: 'current',
          input_type: 'text',
          phase: 'pre-production',
        })
        .eq('id', existingTask.id)
        .select('id, title, description')
        .single();
      if (updateTaskError || !updatedTask) throw updateTaskError || new Error('Could not update task');
      setTaskId(updatedTask.id);
      setTaskTitle(updatedTask.title || 'Single task');
      setTaskOutcome(updatedTask.description || 'Expected outcome');
      trackEvent('ai_plan_generated', {
        userId: user.id,
        payload: { releaseId: activeReleaseId, taskId: updatedTask.id, mode: 'onboarding-update' },
      });
      return;
    }

    const { data: lastTask, error: lastTaskError } = await supabase
      .from('ai_tasks')
      .select('order_index')
      .eq('release_id', activeReleaseId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastTaskError) throw lastTaskError;
    const nextOrderIndex = (lastTask?.order_index ?? -1) + 1;

    const { data: insertedTask, error: insertError } = await supabase
      .from('ai_tasks')
      .insert({
        release_id: activeReleaseId,
        user_id: user.id,
        title,
        description: nextDescription,
        why_it_matters: nextWhy,
        input_type: 'text',
        status: 'current',
        phase: 'pre-production',
        order_index: nextOrderIndex,
      })
      .select('id, title, description')
      .single();
    if (insertError || !insertedTask) throw insertError || new Error('Could not create task');

    setTaskId(insertedTask.id);
    setTaskTitle(insertedTask.title || 'Single task');
    setTaskOutcome(insertedTask.description || 'Expected outcome');
    trackEvent('ai_plan_generated', {
      userId: user.id,
      payload: { releaseId: activeReleaseId, taskId: insertedTask.id, mode: 'onboarding-create' },
    });
  }, [
    artistName,
    audienceSize,
    budget,
    deadlineDate,
    genre,
    goalText,
    listenerPlatforms,
    loadCurrentTask,
    platformInput,
    primaryPlatform,
    stage,
    stepsText,
    timeline,
    user,
  ]);

  useEffect(() => {
    if (step !== 6 || !releaseId) return;
    setGenerationAttemptKey((current) => current + 1);
  }, [releaseId, step]);

  useEffect(() => {
    if (step !== 6 || !releaseId || generationAttemptKey === 0) return;

    let pricingTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const runGeneration = async () => {
      setGenerationError('');
      setIsBusy(true);
      try {
        const { error: setupStepError } = await supabase
          .from('release_profiles')
          .update({ setup_step: 6 })
          .eq('release_id', releaseId);
        if (setupStepError) throw setupStepError;

        pricingTimer = setTimeout(() => {
          if (!cancelled) setShowPricingSheet(true);
        }, PRICING_SHEET_MS);

        const startedAt = Date.now();
        await generateOnboardingTask(releaseId);
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_GENERATION_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_GENERATION_MS - elapsed));
        }
        if (cancelled) return;
        await setStepPersisted(7);
      } catch (err: any) {
        if (!cancelled) {
          setShowPricingSheet(false);
          setGenerationError(err?.message || 'Task generation failed after retries. Please generate again.');
        }
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    };

    runGeneration();

    return () => {
      cancelled = true;
      if (pricingTimer) clearTimeout(pricingTimer);
    };
  }, [generateOnboardingTask, generationAttemptKey, releaseId, setStepPersisted, step]);

  useEffect(() => {
    if (step === 6 || !generationError) return;
    setGenerationError('');
  }, [generationError, step]);

  useEffect(() => {
    if (step < 3 || step > 6) {
      setActiveTimelineStep(null);
    }
  }, [step]);

  const handleMarkStarted = async () => {
    if (!taskId) return;
    setIsBusy(true);
    try {
      const { error: startError } = await supabase
        .from('ai_tasks')
        .update({
          status: 'current',
          started_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      if (startError) throw startError;
      await setStepPersisted(8);
    } catch (err: any) {
      setError(err?.message || 'Failed to mark task as started');
    } finally {
      setIsBusy(false);
    }
  };

  const handleMarkDone = async () => {
    if (!taskId) return;
    setIsBusy(true);
    try {
      const { error: doneError } = await supabase
        .from('ai_tasks')
        .update({
          status: 'pending',
        })
        .eq('id', taskId);
      if (doneError) throw doneError;
      await setStepPersisted(9);
    } catch (err: any) {
      setError(err?.message || 'Failed to mark task as done');
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoToDashboard = () => {
    setNeedsOnboarding(false);
    router.push('/dashboard');
  };

  const handleLogoutToAuth = async () => {
    await logout();
    router.push('/auth');
  };

  const handleSeeTaskAgain = async () => {
    await setStepPersisted(7);
  };

  const handleRetryGeneration = () => {
    if (step !== 6 || !releaseId || isBusy) return;
    setGenerationAttemptKey((current) => current + 1);
  };

  const handleSelectProof = (proofType: ProofType) => {
    setSelectedProof(proofType);
    setProofFile(null);
  };

  const handleToProofSelection = async () => {
    await handleMarkDone();
  };

  const uploadProofIfNeeded = async () => {
    if (!user || !releaseId || !taskId) return '';
    if ((selectedProof !== 'screenshot' && selectedProof !== 'video') || !proofFile) return '';

    if (selectedProof === 'screenshot' && !proofFile.type.startsWith('image/')) {
      throw new Error('Upload an image file for screenshot proof.');
    }
    if (selectedProof === 'video' && !proofFile.type.startsWith('video/')) {
      throw new Error('Upload a video file for video proof.');
    }

    const extension = proofFile.name.split('.').pop() || (selectedProof === 'video' ? 'mp4' : 'png');
    const filePath = `${user.id}/${releaseId}/${taskId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('proofs')
      .upload(filePath, proofFile, { upsert: true });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('proofs').getPublicUrl(filePath);
    return data.publicUrl || '';
  };

  const completeOnboarding = async () => {
    if (!releaseId || !taskId) return;

    const attempted = whatYouTried.trim();
    const happened = whatHappened.trim();
    const results = resultsMetrics.trim();
    const blockers = blockersNext.trim();
    const proofLinkValue = proofLink.trim();
    const proofTextValue = proofText.trim();

    if (attempted.length < MIN_FEEDBACK_CHARS) {
      setError(`Tell us what you tried in at least ${MIN_FEEDBACK_CHARS} characters.`);
      return;
    }
    if (happened.length < MIN_FEEDBACK_CHARS) {
      setError(`Tell us what happened in at least ${MIN_FEEDBACK_CHARS} characters.`);
      return;
    }
    if (resultsMode === 'tracked' && results.length < 1) {
      setError('Add at least one measurable result, or choose "Not tracked".');
      return;
    }
    if (blockers.length < MIN_FEEDBACK_CHARS) {
      setError(`Share blockers/next steps in at least ${MIN_FEEDBACK_CHARS} characters.`);
      return;
    }
    if (selectedProof === 'link' && !proofLinkValue) {
      setError('Add a proof link or switch proof type to "No proof".');
      return;
    }
    if (selectedProof === 'text' && proofTextValue.length < MIN_FEEDBACK_CHARS) {
      setError(`Add proof notes in at least ${MIN_FEEDBACK_CHARS} characters, or choose a different proof type.`);
      return;
    }
    if ((selectedProof === 'screenshot' || selectedProof === 'video') && !proofFile) {
      setError('Upload the selected proof file, or switch proof type to "No proof".');
      return;
    }

    setIsBusy(true);
    try {
      const fileUrl = await uploadProofIfNeeded();
      const proofPayload =
        selectedProof === 'none'
          ? 'No proof provided'
          : selectedProof === 'link'
            ? `Proof link: ${proofLinkValue}`
            : selectedProof === 'text'
              ? `Proof notes: ${proofTextValue}`
              : selectedProof === 'video'
                ? 'Video proof uploaded'
                : 'Screenshot proof uploaded';

      const resultsSummary = resultsMode === 'not-tracked' ? 'Not tracked' : results;
      const structuredFeedback = [
        `What you tried:\n${attempted}`,
        `What happened:\n${happened}`,
        `Results/metrics:\n${resultsSummary}`,
        `What blocked you / improve next:\n${blockers}`,
        `Proof:\n${proofPayload}`,
      ].join('\n\n');

      const { error: taskUpdateError } = await supabase
        .from('ai_tasks')
        .update({
          status: 'completed',
          user_input: structuredFeedback,
          user_input_file_url: fileUrl || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      if (taskUpdateError) throw taskUpdateError;
      trackEvent('task_completed', {
        userId: user?.id || null,
        payload: { releaseId, taskId, source: 'onboarding-feedback' },
      });

      const { error: profileCompletionError } = await supabase
        .from('release_profiles')
        .update({
          setup_step: 3,
          setup_completed: false,
        })
        .eq('release_id', releaseId);
      if (profileCompletionError) throw profileCompletionError;

      const { error: releaseStatusError } = await supabase
        .from('releases')
        .update({ status: 'in-progress' })
        .eq('id', releaseId);
      if (releaseStatusError) throw releaseStatusError;

      if (feedbackDraftKey) {
        localStorage.removeItem(feedbackDraftKey);
      }
      if (onboardingDraftKey) {
        localStorage.removeItem(onboardingDraftKey);
      }
      if (user?.id) {
        localStorage.removeItem(`urganize.onboardingDraft.${user.id}.${releaseId}`);
      }

      resetCycleInputs();
      setTaskId(null);
      setTaskTitle('Single task');
      setTaskOutcome('Expected outcome');
      setNeedsOnboarding(true);
      setIsCycleTransitioning(true);
      await new Promise((resolve) => setTimeout(resolve, NEXT_CYCLE_TRANSITION_MS));
      router.push(`/dashboard?startOnboarding=3&planId=${releaseId}&flow=next-cycle`);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit feedback');
    } finally {
      setIsBusy(false);
      setIsCycleTransitioning(false);
    }
  };

  const handleBack = async () => {
    if (isPlanSetupFlow) {
      handleGoToDashboard();
      return;
    }

    if (step === 0 || step === 1) {
      await handleLogoutToAuth();
      return;
    }

    const previous = step === 3 && hasArtistDefaults ? 1 : Math.max(0, step - 1);
    try {
      await setStepPersisted(previous);
    } catch (err: any) {
      setError(err?.message || 'Could not move back right now');
    }
  };

  useEffect(() => {
    if (step !== 2 || !hasArtistDefaults) return;
    setStep(3);
  }, [hasArtistDefaults, step]);

  const shellClass = 'relative min-h-screen w-full overflow-hidden bg-bg-base text-content-primary';
  const fieldClass =
    'w-full rounded-2xl border border-stroke-subtle bg-bg-elevated/70 px-4 py-3 text-lg text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand';

  const canContinueArtist = useMemo(() => !!artistName.trim(), [artistName]);
  const canContinueGoal = useMemo(() => goalText.trim().length >= MIN_GOAL_CHARS, [goalText]);
  const goalRemainingChars = useMemo(() => Math.max(0, MIN_GOAL_CHARS - goalText.trim().length), [goalText]);
  const budgetValue = Number(budget);
  const budgetIsValid =
    budget.trim().length > 0 &&
    Number.isFinite(budgetValue) &&
    budgetValue >= MIN_BUDGET &&
    budgetValue <= MAX_BUDGET;
  const profileFieldsReady =
    audienceSize.trim().length > 0 &&
    listenerPlatforms.length > 0 &&
    budgetIsValid &&
    (deadlineDate.length > 0 || timeline.trim().length > 0);
  const feedbackCoreReady =
    whatYouTried.trim().length >= MIN_FEEDBACK_CHARS &&
    whatHappened.trim().length >= MIN_FEEDBACK_CHARS &&
    blockersNext.trim().length >= MIN_FEEDBACK_CHARS &&
    (resultsMode === 'not-tracked' || resultsMetrics.trim().length >= 1);
  const proofSelectionReady =
    selectedProof === 'none' ||
    (selectedProof === 'link' && proofLink.trim().length > 0) ||
    (selectedProof === 'text' && proofText.trim().length >= MIN_FEEDBACK_CHARS) ||
    ((selectedProof === 'screenshot' || selectedProof === 'video') && !!proofFile);
  const canSubmitFeedback = feedbackCoreReady && proofSelectionReady;
  const hasFeedbackDraftContent =
    selectedProof !== 'none' ||
    proofLink.trim().length > 0 ||
    proofText.trim().length > 0 ||
    whatYouTried.trim().length > 0 ||
    whatHappened.trim().length > 0 ||
    resultsMetrics.trim().length > 0 ||
    blockersNext.trim().length > 0 ||
    resultsMode === 'not-tracked';
  const draftSavedTimeLabel = useMemo(() => {
    if (!lastDraftSavedAt) return '';
    return new Date(lastDraftSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [lastDraftSavedAt]);
  const showCycleTimeline = step >= 3 && step <= 6;
  const roleEntryContext = useMemo(() => {
    const permissions = getRolePermissions(user?.role);
    if (flow !== 'first-login' || requestedStartStep !== 0) return null;
    if (permissions.role === 'manager') {
      return {
        title: 'Manager onboarding path',
        description: 'Set artist and campaign inputs, then generate the first execution task.',
      };
    }
    if (permissions.role === 'artist' || permissions.role === 'team-member') {
      return {
        title: 'Contributor onboarding path',
        description: 'Provide the core release context so your team can execute in one shared workspace.',
      };
    }
    return null;
  }, [flow, requestedStartStep, user?.role]);

  if (isBootstrapping) {
    return (
      <main className={shellClass}>
        <div className="flex min-h-screen items-center justify-center text-[clamp(2rem,4vw,3rem)]">
          Loading...
        </div>
      </main>
    );
  }

  if (!hasSubscriptionAccess) {
    return (
      <main className={shellClass}>
        <div className="mx-auto flex min-h-screen w-full max-w-[760px] items-center px-6 py-12 sm:px-10">
          <SubscriptionPaywall title="Start your 30-day trial to continue" />
        </div>
      </main>
    );
  }

  if (isCycleTransitioning) {
    return (
      <main className={shellClass}>
        <div className="mx-auto flex min-h-screen w-full max-w-[760px] flex-col items-center justify-center px-6 text-center">
          <p className="text-[clamp(2rem,4.8vw,3.4rem)] tracking-tight text-content-primary">Review saved.</p>
          <p className="mt-3 text-lg text-content-secondary">Building your next cycle...</p>
          <div className="mt-8 h-2 w-full max-w-[420px] overflow-hidden rounded-full bg-bg-elevated">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-brand" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <div className="mx-auto flex min-h-screen w-full max-w-[980px] flex-col px-6 py-12 sm:px-12">
        {step > 0 && step <= 9 && (
          <button
            type="button"
            onClick={handleBack}
            className="w-fit text-[clamp(1.8rem,4.5vw,3rem)] leading-none tracking-tight text-content-primary/90"
          >
            {isPlanSetupFlow ? 'Back to Dashboard' : '...Back'}
          </button>
        )}

        {roleEntryContext && step >= 2 && step <= 4 && (
          <section className="mt-5 rounded-xl border border-stroke-default bg-bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">{roleEntryContext.title}</p>
            <p className="mt-1 text-sm text-content-secondary">{roleEntryContext.description}</p>
          </section>
        )}

        {showCycleTimeline && (
          <section className="mt-6 rounded-xl border border-stroke-default bg-bg-surface px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Execution Cycle</p>
              <span className="rounded-full border border-brand/35 bg-brand-muted px-2.5 py-1 text-xs font-medium text-brand">
                Cycle {cycleNumber}
              </span>
            </div>
            <div className="relative">
              <div className="absolute left-0 right-0 top-[17px] h-px bg-stroke-default" />
              <div className="relative grid grid-cols-4 gap-2">
                {CYCLE_TIMELINE.map((item) => {
                  const isDone = step > item.step;
                  const isCurrent = step === item.step;
                  const isActive = activeTimelineStep === item.step;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setActiveTimelineStep((current) => (current === item.step ? null : item.step))}
                      onMouseEnter={() => setActiveTimelineStep(item.step)}
                      onMouseLeave={() => setActiveTimelineStep((current) => (current === item.step ? null : current))}
                      onFocus={() => setActiveTimelineStep(item.step)}
                      onBlur={() => setActiveTimelineStep((current) => (current === item.step ? null : current))}
                      className="group relative flex flex-col items-center text-center"
                    >
                      <span
                        className={`relative z-10 h-[14px] w-[14px] rounded-full border ${
                          isCurrent || isDone ? 'border-brand bg-brand' : 'border-stroke-subtle bg-bg-surface'
                        }`}
                      />
                      <span className={`mt-3 text-xs sm:text-sm ${isCurrent ? 'text-content-primary' : 'text-content-secondary'}`}>{item.label}</span>
                      <span
                        className={`pointer-events-none absolute left-1/2 top-[64px] z-30 w-52 -translate-x-1/2 rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-left text-xs text-content-secondary shadow-lg transition ${
                          isActive ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'
                        }`}
                      >
                        {item.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {step === 0 && <Step0Intro onContinue={() => setStep(1)} />}

        {step === 1 && (
          <Step1Role
            isBusy={isBusy}
            onSelectRole={handleSelectRole}
          />
        )}

        {step === 2 && (
          <Step2ArtistDetails
            fieldClass={fieldClass}
            artistName={artistName}
            genre={genre}
            primaryPlatform={primaryPlatform}
            genreOptions={GENRE_OPTIONS}
            primaryPlatformOptions={PRIMARY_PLATFORM_OPTIONS}
            isBusy={isBusy}
            canContinueArtist={canContinueArtist}
            onArtistNameChange={setArtistName}
            onGenreChange={setGenre}
            onPrimaryPlatformChange={setPrimaryPlatform}
            onPrimaryPlatformBlur={syncPrimaryPlatformToAudiencePlatforms}
            onContinue={handleSaveAddArtist}
          />
        )}

        {step === 3 && (
          <Step3Goal
            heading={isNextCycleFlow ? 'Set your next objective' : undefined}
            goalText={goalText}
            goalRemainingChars={goalRemainingChars}
            canContinueGoal={canContinueGoal}
            isBusy={isBusy}
            onGoalTextChange={setGoalText}
            onContinue={handleSaveGoal}
          />
        )}

        {step === 4 && (
          <Step4ProfileInputs
            fieldClass={fieldClass}
            stage={stage}
            stageOptions={STAGE_OPTIONS}
            audienceSize={audienceSize}
            audienceSizeOptions={AUDIENCE_SIZE_OPTIONS}
            listenerPlatforms={listenerPlatforms}
            platformInput={platformInput}
            listenerPlatformOptions={LISTENER_PLATFORM_OPTIONS}
            budget={budget}
            budgetIsValid={budgetIsValid}
            minBudget={MIN_BUDGET}
            maxBudget={MAX_BUDGET}
            deadlineDate={deadlineDate}
            timeline={timeline}
            timelineOptions={TIMELINE_OPTIONS}
            minDate={formatDateInput(new Date())}
            profileFieldsReady={profileFieldsReady}
            isBusy={isBusy}
            onStageChange={setStage}
            onAudienceSizeChange={setAudienceSize}
            onRemoveListenerPlatform={removeListenerPlatform}
            onPlatformInputChange={setPlatformInput}
            onCommitPlatformInput={commitPlatformInput}
            onBudgetChange={setBudget}
            onDeadlineDateChange={setDeadlineDate}
            onTimelineChange={setTimeline}
            onApplyTimelinePreset={applyTimelinePreset}
            onSubmit={handleSaveProfileInputs}
          />
        )}

        {step === 5 && (
          <Step5ExistingSteps
            stepsText={stepsText}
            isBusy={isBusy}
            onStepsTextChange={setStepsText}
            onSkip={handleSaveSteps}
          />
        )}

        {step === 6 && (
          <Step6GeneratingTask
            showPricingSheet={showPricingSheet}
            userEmail={user?.email || ''}
            onClosePricingSheet={() => setShowPricingSheet(false)}
            isGenerating={isBusy}
            generationError={generationError}
            onRetryGeneration={handleRetryGeneration}
          />
        )}

        {step === 7 && (
          <Step7TaskStart
            isBusy={isBusy}
            taskTitle={taskTitle}
            taskOutcome={taskOutcome}
            onLogout={handleLogoutToAuth}
            onMarkStarted={handleMarkStarted}
            onGoToDashboard={handleGoToDashboard}
          />
        )}

        {step === 8 && (
          <Step8TaskDone
            isBusy={isBusy}
            onLogout={handleLogoutToAuth}
            onMarkDone={handleMarkDone}
            onDropFeedback={handleToProofSelection}
            onGoToDashboard={handleGoToDashboard}
          />
        )}

        {step === 9 && (
          <FeedbackSubmitStep
            isBusy={isBusy}
            canSubmitFeedback={canSubmitFeedback}
            hasFeedbackDraftContent={hasFeedbackDraftContent}
            draftSavedTimeLabel={draftSavedTimeLabel}
            selectedProof={selectedProof}
            proofLink={proofLink}
            proofText={proofText}
            whatYouTried={whatYouTried}
            whatHappened={whatHappened}
            resultsMode={resultsMode}
            resultsMetrics={resultsMetrics}
            blockersNext={blockersNext}
            taskTitle={taskTitle}
            taskOutcome={taskOutcome}
            onLogout={handleLogoutToAuth}
            onSeeTaskAgain={handleSeeTaskAgain}
            onSelectProof={handleSelectProof}
            onProofFileChange={setProofFile}
            onProofLinkChange={setProofLink}
            onProofTextChange={setProofText}
            onWhatYouTriedChange={setWhatYouTried}
            onWhatHappenedChange={setWhatHappened}
            onResultsModeChange={setResultsMode}
            onResultsMetricsChange={setResultsMetrics}
            onBlockersNextChange={setBlockersNext}
            onSubmit={completeOnboarding}
            onGoToDashboard={handleGoToDashboard}
          />
        )}

        {error && (
          <p className="mt-6 rounded-lg border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">{error}</p>
        )}
      </div>
    </main>
  );
}
