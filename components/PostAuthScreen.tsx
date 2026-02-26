'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

type RoleOption = 'manager' | 'artist-team' | 'artist';
type ProofType = 'none' | 'screenshot' | 'video' | 'link' | 'text';
const PROOF_TYPE_OPTIONS: ProofType[] = ['none', 'screenshot', 'video', 'link', 'text'];

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

const MIN_GOAL_CHARS = 20;
const MIN_BUDGET = 100;
const MAX_BUDGET = 100000000;
const DEFAULT_PLAN_DURATION_DAYS = 30;
const MIN_FEEDBACK_CHARS = 20;

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

const MIN_GENERATION_MS = 7000;
const PRICING_SHEET_MS = 2500;
const PaystackButton = dynamic(
  () => import('@/components/PaystackButton').then((mod) => mod.PaystackButton),
  { ssr: false }
);

const FeedbackSubmitStep = dynamic(
  () => import('@/components/onboarding/FeedbackSubmitStep').then((mod) => mod.FeedbackSubmitStep),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto mt-16 w-full max-w-[820px] rounded-2xl border border-white/10 bg-[#02090d] p-6 sm:p-8">
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

  const feedbackDraftKey = useMemo(() => {
    if (!user?.id || !releaseId || !taskId) return '';
    return `urganize.feedbackDraft.${user.id}.${releaseId}.${taskId}`;
  }, [releaseId, taskId, user?.id]);

  const resetError = () => setError('');

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

  const setStepPersisted = useCallback(async (nextStep: number) => {
    setStep(nextStep);
    if (!releaseId) return;
    await supabase
      .from('release_profiles')
      .update({ setup_step: nextStep })
      .eq('release_id', releaseId);
  }, [releaseId]);

  const ensureOnboardingRelease = useCallback(async (): Promise<string> => {
    if (!user) throw new Error('User not found');

    const requestedPlanId = searchParams.get('planId');
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
        artist_name: artistName || user.name || 'Artist',
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

    setReleaseId(release.id);
    return release.id;
  }, [artistName, releaseId, searchParams, user]);

  const loadCurrentTask = useCallback(async (activeReleaseId: string) => {
    const { data: task, error: taskError } = await supabase
      .from('ai_tasks')
      .select('id, title, description')
      .eq('release_id', activeReleaseId)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (taskError) throw taskError;
    if (task) {
      setTaskId(task.id);
      setTaskTitle(task.title || 'Single task');
      setTaskOutcome(task.description || 'Expected outcome');
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      if (!user) return;

      try {
        const requestedStartStep = Number(searchParams.get('startOnboarding') || 0);
        const activeReleaseId = await ensureOnboardingRelease();
        await loadCurrentTask(activeReleaseId);

        const { data: artistProfile } = await supabase
          .from('artist_profiles')
          .select('artist_name, career_stage')
          .eq('user_id', user.id)
          .maybeSingle();

        if (artistProfile?.artist_name && !artistName) {
          setArtistName(artistProfile.artist_name);
        }
        if (artistProfile?.career_stage && !stage) {
          setStage(artistProfile.career_stage);
        }

        if (requestedStartStep >= 2) {
          setStep(2);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load onboarding');
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, [artistName, ensureOnboardingRelease, loadCurrentTask, searchParams, stage, user]);

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

  const handleSelectRole = async (role: RoleOption) => {
    resetError();
    setIsBusy(true);
    try {
      await updateRole(role);
      await ensureOnboardingRelease();
      await setStepPersisted(2);
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
      await supabase.from('releases').update({
        artist_name: artistName.trim(),
        title: `${artistName.trim()} Goal`,
      }).eq('id', activeReleaseId);

      await supabase
        .from('release_profiles')
        .update({
          genre: genre || null,
          primary_market: primaryPlatform || null,
        })
        .eq('release_id', activeReleaseId);

      await upsertArtistProfile();
      await setStepPersisted(3);
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
      await supabase
        .from('release_profiles')
        .update({ campaign_narrative: goalValue || null })
        .eq('release_id', activeReleaseId);
      await setStepPersisted(4);
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

      await supabase
        .from('release_profiles')
        .update({
          song_stage: stage || 'emerging',
          target_audience_description: audienceSize.trim() || null,
          listener_interests: listeners,
          budget_naira: maybeBudget,
          hard_deadline: deadlineDate || null,
          deadline_reason: timelineValue || null,
        })
        .eq('release_id', activeReleaseId);
      await upsertArtistProfile();
      await setStepPersisted(5);
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
      await supabase
        .from('release_profiles')
        .update({ other_goals: stepsText || null })
        .eq('release_id', activeReleaseId);
      await setStepPersisted(6);
    } catch (err: any) {
      setError(err?.message || 'Failed to save steps');
    } finally {
      setIsBusy(false);
    }
  };

  const createFallbackTask = useCallback(async (activeReleaseId: string) => {
    if (!user) return;

    const { data: existingTask } = await supabase
      .from('ai_tasks')
      .select('id, title, description')
      .eq('release_id', activeReleaseId)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingTask) {
      setTaskId(existingTask.id);
      setTaskTitle(existingTask.title || 'Single task');
      setTaskOutcome(existingTask.description || 'Expected outcome');
      return;
    }

    const { data: insertedTask, error: insertError } = await supabase
      .from('ai_tasks')
      .insert({
        release_id: activeReleaseId,
        user_id: user.id,
        title: 'Single task',
        description: goalText || 'Expected outcome',
        why_it_matters: 'This drives your campaign forward.',
        input_type: 'text',
        status: 'current',
        phase: 'pre-production',
        order_index: 0,
      })
      .select('id, title, description')
      .single();
    if (insertError || !insertedTask) throw insertError || new Error('Could not create task');

    setTaskId(insertedTask.id);
    setTaskTitle(insertedTask.title || 'Single task');
    setTaskOutcome(insertedTask.description || 'Expected outcome');
  }, [goalText, user]);

  useEffect(() => {
    if (step !== 6 || !releaseId) return;

    let pricingTimer: ReturnType<typeof setTimeout> | null = null;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const runGeneration = async () => {
      try {
        await supabase
          .from('release_profiles')
          .update({ setup_step: 6 })
          .eq('release_id', releaseId);

        pricingTimer = setTimeout(() => {
          if (!cancelled) setShowPricingSheet(true);
        }, PRICING_SHEET_MS);

        doneTimer = setTimeout(async () => {
          if (cancelled) return;
          await createFallbackTask(releaseId);
          await setStepPersisted(7);
        }, MIN_GENERATION_MS);
      } catch (err: any) {
        setError(err?.message || 'Task generation failed');
      }
    };

    runGeneration();

    return () => {
      cancelled = true;
      if (pricingTimer) clearTimeout(pricingTimer);
      if (doneTimer) clearTimeout(doneTimer);
    };
  }, [createFallbackTask, releaseId, setStepPersisted, step]);

  const handleMarkStarted = async () => {
    if (!taskId) return;
    setIsBusy(true);
    try {
      await supabase
        .from('ai_tasks')
        .update({
          status: 'current',
          started_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      await setStepPersisted(8);
    } finally {
      setIsBusy(false);
    }
  };

  const handleMarkDone = async () => {
    if (!taskId) return;
    setIsBusy(true);
    try {
      await supabase
        .from('ai_tasks')
        .update({
          status: 'pending',
        })
        .eq('id', taskId);
      await setStepPersisted(9);
    } catch (err: any) {
      setError(err?.message || 'Failed to mark task as done');
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoToDashboard = () => {
    if (releaseId) {
      router.push(`/dashboard/plans/${releaseId}`);
      return;
    }
    router.push('/dashboard');
  };

  const handleSeeTaskAgain = async () => {
    await setStepPersisted(7);
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
    if (resultsMode === 'tracked' && results.length < 3) {
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

      await supabase
        .from('ai_tasks')
        .update({
          status: 'completed',
          user_input: structuredFeedback,
          user_input_file_url: fileUrl || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      await supabase
        .from('release_profiles')
        .update({
          setup_step: 13,
          setup_completed: true,
          setup_completed_at: new Date().toISOString(),
        })
        .eq('release_id', releaseId);

      await supabase
        .from('releases')
        .update({ status: 'in-progress' })
        .eq('id', releaseId);

      if (feedbackDraftKey) {
        localStorage.removeItem(feedbackDraftKey);
      }

      setNeedsOnboarding(false);
      router.push(`/dashboard/plans/${releaseId}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit feedback');
    } finally {
      setIsBusy(false);
    }
  };

  const handleBack = async () => {
    if (step === 0 || step === 1) {
      await logout();
      router.push('/auth');
      return;
    }

    const previous = Math.max(0, step - 1);
    await setStepPersisted(previous);
  };

  const shellClass = 'relative min-h-screen w-full overflow-hidden bg-black text-white';
  const fieldClass =
    'w-full rounded-none border border-white/5 bg-[#02090d] px-3 py-2 text-lg text-white/90 outline-none placeholder:text-white/20';

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
    (resultsMode === 'not-tracked' || resultsMetrics.trim().length >= 3);
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

  if (isBootstrapping) {
    return (
      <main className={shellClass}>
        <div className="flex min-h-screen items-center justify-center text-[clamp(2rem,4vw,3rem)]">
          Loading...
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
            className="w-fit text-[clamp(1.8rem,4.5vw,3rem)] leading-none tracking-tight text-white/90"
          >
            ...Back
          </button>
        )}

        {step === 0 && (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-[44vh] self-center text-[clamp(2.2rem,5.5vw,3.8rem)] text-white/95"
          >
            Tap to Continue
          </button>
        )}

        {step === 1 && (
          <>
            <h1 className="mt-[20vh] text-[clamp(2.4rem,6.2vw,5rem)] tracking-tight">Select Your Role.</h1>
            <div className="mt-20 space-y-4">
              <button type="button" onClick={() => handleSelectRole('manager')} disabled={isBusy} className="flex w-full items-center justify-between text-left text-[clamp(2rem,4.5vw,3.3rem)]">
                <span>Artist Manager</span>
                <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[#138f10]" />
              </button>
              <button type="button" onClick={() => handleSelectRole('artist-team')} disabled={isBusy} className="flex w-full items-center justify-between text-left text-[clamp(2rem,4.5vw,3.3rem)]">
                <span>Artist Team</span>
                <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[#138f10]" />
              </button>
              <button type="button" onClick={() => handleSelectRole('artist')} disabled={isBusy} className="flex w-full items-center justify-between text-left text-[clamp(2rem,4.5vw,3.3rem)]">
                <span>Artist</span>
                <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[#138f10]" />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="mt-[18vh] text-[clamp(2.7rem,6.4vw,5rem)] tracking-tight">Add Artist</h1>
            <div className="mx-auto mt-10 grid w-full max-w-[720px] grid-cols-1 gap-5">
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Artist Name</label>
              <input
                className={fieldClass}
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="e.g. Tems"
                autoComplete="off"
              />
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Genre</label>
              <div>
                <input
                  className={fieldClass}
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  list="genre-options"
                  placeholder="Pick or type a genre (e.g. Afrobeats)"
                  autoComplete="off"
                />
                <datalist id="genre-options">
                  {GENRE_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Primary Platform</label>
              <div>
                <input
                  className={fieldClass}
                  value={primaryPlatform}
                  onChange={(e) => setPrimaryPlatform(e.target.value)}
                  onBlur={syncPrimaryPlatformToAudiencePlatforms}
                  list="primary-platform-options"
                  placeholder="Pick or type a channel (e.g. TikTok)"
                  autoComplete="off"
                />
                <datalist id="primary-platform-options">
                  {PRIMARY_PLATFORM_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
            </div>
            <button type="button" disabled={!canContinueArtist || isBusy} onClick={handleSaveAddArtist} className="mt-16 self-center text-[clamp(2.2rem,5vw,3.8rem)] disabled:opacity-40">
              Tap to Continue
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="mt-[18vh] text-[clamp(2.4rem,5.6vw,4.4rem)] tracking-tight">What do you want to achieve?</h1>
            <textarea
              className="mt-10 min-h-[230px] w-full border border-white/5 bg-[#02090d] p-4 text-xl outline-none"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="Example: Grow monthly listeners from 5k to 15k before my next single drops."
            />
            <p className={`mt-3 text-sm ${goalRemainingChars === 0 ? 'text-emerald-300/80' : 'text-white/65'}`}>
              {goalRemainingChars === 0
                ? 'Looks good. We can generate better tasks with this level of detail.'
                : `Add ${goalRemainingChars} more characters for a higher-quality plan.`}
            </p>
            <button type="button" disabled={!canContinueGoal || isBusy} onClick={handleSaveGoal} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)] disabled:opacity-40">
              Next..
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <div className="mx-auto mt-[17vh] grid w-full max-w-[720px] grid-cols-1 gap-5">
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Stage</label>
              <select
                className={fieldClass}
                value={stage || 'emerging'}
                onChange={(e) => setStage(e.target.value)}
              >
                {STAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Audience Size</label>
              <div>
                <input
                  className={fieldClass}
                  value={audienceSize}
                  onChange={(e) => setAudienceSize(e.target.value)}
                  list="audience-size-options"
                  placeholder="Combined audience (e.g. 5,001 - 20,000)"
                  autoComplete="off"
                />
                <datalist id="audience-size-options">
                  {AUDIENCE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <p className="mt-2 text-xs text-white/55">Use your estimated combined audience across all channels.</p>
              </div>
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Platforms</label>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {listenerPlatforms.map((platform) => (
                    <span
                      key={platform}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/90"
                    >
                      {platform}
                      <button
                        type="button"
                        onClick={() => removeListenerPlatform(platform)}
                        className="text-white/70 hover:text-white"
                        aria-label={`Remove ${platform}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                  {listenerPlatforms.length === 0 && (
                    <p className="text-sm text-white/55">No platforms added yet.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    className={fieldClass}
                    value={platformInput}
                    onChange={(e) => setPlatformInput(e.target.value)}
                    onBlur={commitPlatformInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        commitPlatformInput();
                      }
                    }}
                    list="listener-platform-options"
                    placeholder="Type platform and press Enter"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={commitPlatformInput}
                    className="rounded-none border border-white/20 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
                  >
                    Add
                  </button>
                </div>
                <datalist id="listener-platform-options">
                  {LISTENER_PLATFORM_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <p className="text-xs text-white/55">Pick from suggestions or type custom channels.</p>
              </div>
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Budget</label>
              <input
                className={fieldClass}
                type="number"
                min={0}
                step={1000}
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 100000"
              />
              <p className={`mt-2 text-xs ${budget.trim().length > 0 && !budgetIsValid ? 'text-red-400' : 'text-white/55'}`}>
                Enter a realistic budget between {MIN_BUDGET} and {MAX_BUDGET}.
              </p>
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Timeline</label>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    className={fieldClass}
                    type="date"
                    min={formatDateInput(new Date())}
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                  />
                  <input
                    className={fieldClass}
                    value={timeline}
                    onChange={(e) => setTimeline(e.target.value)}
                    list="timeline-options"
                    placeholder="Optional context (e.g. before summer campaign)"
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyTimelinePreset(14, 'ASAP (within 2 weeks)')}
                    className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/85 hover:bg-white/10"
                  >
                    2 weeks
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTimelinePreset(30, 'Within 1 month')}
                    className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/85 hover:bg-white/10"
                  >
                    30 days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTimelinePreset(90, 'In 2-3 months')}
                    className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/85 hover:bg-white/10"
                  >
                    90 days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTimelinePreset(null, 'No fixed deadline')}
                    className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/85 hover:bg-white/10"
                  >
                    No deadline
                  </button>
                </div>
                <datalist id="timeline-options">
                  {TIMELINE_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
            </div>
            {!profileFieldsReady && (
              <p className="mx-auto mt-4 w-full max-w-[720px] text-sm text-white/65">
                Complete audience size, platform list, budget, and timeline to continue.
              </p>
            )}
            <button type="button" disabled={isBusy || !profileFieldsReady} onClick={handleSaveProfileInputs} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)] disabled:opacity-40">
              Submit..
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="mt-[18vh] text-[clamp(2.4rem,5.6vw,4.4rem)] tracking-tight">Do you have steps?</h1>
            <textarea
              className="mt-10 min-h-[230px] w-full border border-white/5 bg-[#02090d] p-4 text-xl outline-none"
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder="Example: 1) Tease snippet for 7 days 2) Shoot 3 UGC clips 3) DM 20 micro-creators."
            />
            <button type="button" disabled={isBusy} onClick={handleSaveSteps} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)]">
              Skip..
            </button>
          </>
        )}

        {step === 6 && (
          <>
            <div className="flex flex-1 items-center justify-center text-[clamp(2.2rem,5.2vw,4rem)]">
              Generating task...
            </div>

            {showPricingSheet && (
              <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#03080c] p-6 sm:p-8">
                <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-6">
                  <div>
                    <p className="text-xl text-white/95">Unlock unlimited task generation</p>
                    <p className="text-sm text-white/60">Monthly plan starts now.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPricingSheet(false)}
                      className="text-lg text-white/70"
                    >
                      Close
                    </button>
                    <PaystackButton
                      email={user?.email || ''}
                      amount={8000}
                      plan="monthly"
                      className="rounded-none bg-white px-5 py-3 text-base font-medium text-black"
                    >
                      Subscribe
                    </PaystackButton>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {step === 7 && (
          <div className="mx-auto mt-[16vh] w-full max-w-[700px]">
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/auth');
              }}
              className="absolute right-6 top-8 text-[clamp(2rem,4vw,3rem)]"
            >
              Logout
            </button>
            <div className="space-y-12">
              <h2 className="text-[clamp(2.6rem,6.2vw,4.8rem)]">{taskTitle}</h2>
              <p className="text-[clamp(2rem,4.8vw,3.8rem)] text-white/85">{taskOutcome}</p>
              <button type="button" disabled={isBusy} onClick={handleMarkStarted} className="flex items-center gap-4 text-[clamp(2rem,4.6vw,3.4rem)]">
                <span className="inline-block h-12 w-12 border border-white/35 sm:h-14 sm:w-14" />
                <span>Mark Started</span>
              </button>
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="mx-auto mt-[20vh] w-full max-w-[700px]">
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/auth');
              }}
              className="absolute right-6 top-8 text-[clamp(2rem,4vw,3rem)]"
            >
              Logout
            </button>
            <button type="button" disabled={isBusy} onClick={handleMarkDone} className="flex items-center gap-4 text-[clamp(2rem,4.6vw,3.4rem)] disabled:opacity-40">
              <span className="inline-block h-12 w-12 border border-white/35 sm:h-14 sm:w-14" />
              <span>Mark Done</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleToProofSelection}
              className="mt-8 rounded-xl border border-emerald-400/35 bg-emerald-500/20 px-5 py-3 text-base font-semibold text-white transition hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Drop Feedback
            </button>
            <button
              type="button"
              onClick={handleGoToDashboard}
              className="mt-8 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Go to Dashboard
            </button>
          </div>
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
            onLogout={async () => {
              await logout();
              router.push('/auth');
            }}
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
          <p className="mt-6 text-base text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
