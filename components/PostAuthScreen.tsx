'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaystackButton } from '@/components/PaystackButton';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

type RoleOption = 'manager' | 'artist-team' | 'artist';
type ProofType = 'screenshot' | 'link' | 'text';

const MIN_GENERATION_MS = 7000;
const PRICING_SHEET_MS = 2500;

export function PostAuthScreen() {
  const router = useRouter();
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
  const [selectedProof, setSelectedProof] = useState<ProofType>('screenshot');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofLink, setProofLink] = useState('');

  const [artistName, setArtistName] = useState('');
  const [genre, setGenre] = useState('');
  const [primaryPlatform, setPrimaryPlatform] = useState('');
  const [goalText, setGoalText] = useState('');
  const [stage, setStage] = useState('');
  const [audienceSize, setAudienceSize] = useState('');
  const [platforms, setPlatforms] = useState('');
  const [budget, setBudget] = useState('');
  const [timeline, setTimeline] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [whatHappened, setWhatHappened] = useState('');

  const [taskTitle, setTaskTitle] = useState('Single task');
  const [taskOutcome, setTaskOutcome] = useState('Expected outcome');

  const resetError = () => setError('');

  const parseCareerStage = (value: string): 'emerging' | 'growing' | 'established' => {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes('established')) return 'established';
    if (normalized.includes('grow')) return 'growing';
    return 'emerging';
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
    if (releaseId) return releaseId;

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
        setPlatforms((activeProfile.listener_interests || []).join(', '));
        setBudget(activeProfile.budget_naira ? String(activeProfile.budget_naira) : '');
        setTimeline(activeProfile.hard_deadline || activeProfile.deadline_reason || '');
        setStepsText(activeProfile.other_goals || '');

        const release = existingReleases.find((item) => item.id === activeProfile.release_id);
        if (release?.artist_name) setArtistName(release.artist_name);

        setStep(Math.max(activeProfile.setup_step || 2, 2));
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
      .select('id')
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
      });
    if (profileInsertError) throw profileInsertError;

    setReleaseId(release.id);
    return release.id;
  }, [artistName, releaseId, user]);

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

        if (user.role === 'artist-manager') {
          setStep(0);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load onboarding');
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, [artistName, ensureOnboardingRelease, loadCurrentTask, stage, user]);

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
    resetError();
    setIsBusy(true);
    try {
      const activeReleaseId = await ensureOnboardingRelease();
      await supabase
        .from('release_profiles')
        .update({ campaign_narrative: goalText || null })
        .eq('release_id', activeReleaseId);
      await setStepPersisted(4);
    } catch (err: any) {
      setError(err?.message || 'Failed to save goal');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveProfileInputs = async () => {
    resetError();
    setIsBusy(true);
    try {
      const activeReleaseId = await ensureOnboardingRelease();
      const maybeBudget = Number(budget);
      const listeners = platforms
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      await supabase
        .from('release_profiles')
        .update({
          song_stage: stage || null,
          target_audience_description: audienceSize || null,
          listener_interests: listeners,
          budget_naira: Number.isFinite(maybeBudget) && maybeBudget > 0 ? maybeBudget : null,
          deadline_reason: timeline || null,
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

  const handleToProofSelection = async () => {
    await setStepPersisted(9);
  };

  const handleProofSubmit = async () => {
    await setStepPersisted(10);
  };

  const uploadProofIfNeeded = async () => {
    if (!user || !releaseId || !taskId) return '';
    if (selectedProof !== 'screenshot' || !proofFile) return '';

    const extension = proofFile.name.split('.').pop() || 'png';
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

    setIsBusy(true);
    try {
      const fileUrl = await uploadProofIfNeeded();
      const proofPayload =
        selectedProof === 'link'
          ? proofLink
          : selectedProof === 'text'
            ? whatHappened
            : 'Screenshot proof uploaded';

      await supabase
        .from('ai_tasks')
        .update({
          status: 'completed',
          user_input: `${proofPayload}\n\n${whatHappened}`.trim(),
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

      setNeedsOnboarding(false);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit proof');
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
  const canContinueGoal = useMemo(() => !!goalText.trim(), [goalText]);
  const canContinueProof = useMemo(() => {
    if (selectedProof === 'screenshot') return !!proofFile;
    if (selectedProof === 'link') return !!proofLink.trim();
    return true;
  }, [proofFile, proofLink, selectedProof]);

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
        {step <= 10 && (
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
            Continue..
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
            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.2fr] md:items-center">
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Artist Name</label>
              <input className={fieldClass} value={artistName} onChange={(e) => setArtistName(e.target.value)} />
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Genre</label>
              <input className={fieldClass} value={genre} onChange={(e) => setGenre(e.target.value)} />
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Primary Platform</label>
              <input className={fieldClass} value={primaryPlatform} onChange={(e) => setPrimaryPlatform(e.target.value)} />
            </div>
            <button type="button" disabled={!canContinueArtist || isBusy} onClick={handleSaveAddArtist} className="mt-16 self-center text-[clamp(2.2rem,5vw,3.8rem)] disabled:opacity-40">
              Continue..
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
            />
            <button type="button" disabled={!canContinueGoal || isBusy} onClick={handleSaveGoal} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)] disabled:opacity-40">
              Next..
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <div className="mt-[17vh] grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.2fr] md:items-center">
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Stage</label>
              <input className={fieldClass} value={stage} onChange={(e) => setStage(e.target.value)} />
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Audience Size</label>
              <input className={fieldClass} value={audienceSize} onChange={(e) => setAudienceSize(e.target.value)} />
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Platforms</label>
              <input className={fieldClass} value={platforms} onChange={(e) => setPlatforms(e.target.value)} />
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Budget</label>
              <input className={fieldClass} value={budget} onChange={(e) => setBudget(e.target.value)} />
              <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Timeline</label>
              <input className={fieldClass} value={timeline} onChange={(e) => setTimeline(e.target.value)} />
            </div>
            <button type="button" disabled={isBusy} onClick={handleSaveProfileInputs} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)]">
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
            <button type="button" className="flex items-center gap-4 text-[clamp(2rem,4.6vw,3.4rem)]">
              <span className="inline-block h-12 w-12 border border-white/35 sm:h-14 sm:w-14" />
              <span>Mark Done</span>
            </button>
            <button type="button" onClick={handleToProofSelection} className="mt-12 text-[clamp(2rem,4.6vw,3.4rem)]">
              Upload Proof
            </button>
          </div>
        )}

        {step === 9 && (
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
            <div className="space-y-8">
              <div className="space-y-4 text-[clamp(2rem,4.6vw,3.4rem)]">
                <button type="button" onClick={() => setSelectedProof('screenshot')} className={selectedProof === 'screenshot' ? 'text-white' : 'text-white/60'}>Screenshot</button>
                <button type="button" onClick={() => setSelectedProof('link')} className={selectedProof === 'link' ? 'text-white' : 'text-white/60'}>Link</button>
                <button type="button" onClick={() => setSelectedProof('text')} className={selectedProof === 'text' ? 'text-white' : 'text-white/60'}>Text</button>
              </div>

              {selectedProof === 'screenshot' && (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  className="block w-full text-base text-white/80"
                />
              )}
              {selectedProof === 'link' && (
                <input
                  type="url"
                  className={fieldClass}
                  placeholder="https://"
                  value={proofLink}
                  onChange={(e) => setProofLink(e.target.value)}
                />
              )}
            </div>
            <button type="button" disabled={!canContinueProof} onClick={handleProofSubmit} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)] disabled:opacity-40">
              Submit..
            </button>
          </div>
        )}

        {step === 10 && (
          <>
            <h1 className="mt-[18vh] text-[clamp(2.4rem,5.6vw,4.4rem)] tracking-tight">What happened?</h1>
            <textarea
              className="mt-10 min-h-[230px] w-full border border-white/5 bg-[#02090d] p-4 text-xl outline-none"
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
            />
            <button type="button" disabled={isBusy} onClick={completeOnboarding} className="mt-12 self-center text-[clamp(2.1rem,4.5vw,3.5rem)]">
              Submit..
            </button>
          </>
        )}

        {error && (
          <p className="mt-6 text-base text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
