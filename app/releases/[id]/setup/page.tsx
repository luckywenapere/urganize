// app/releases/[id]/setup/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/lib/release-store';
import { useArtistProfileStore } from '@/lib/artist-profile-store';
import { useReleaseProfileStore } from '@/lib/release-profile-store';
import { ArtistProfileForm } from '@/components/releases/ArtistProfileForm';
import { ReleaseSetupWizard, type SetupWizardData } from '@/components/releases/ReleaseSetupWizard';
import type { ArtistProfileFormData } from '@/types';

export default function ReleaseSetupPage() {
  const params = useParams();
  const router = useRouter();
  const releaseId = params.id as string;

  // Global state
  const { user, isAuthenticated } = useAuthStore();
  const { releases, fetchReleases } = useReleaseStore();
  const { 
    profile: artistProfile, 
    hasProfile,
    isLoading: artistLoading,
    fetchProfile: fetchArtistProfile,
    createProfile: createArtistProfile,
  } = useArtistProfileStore();
  const {
    profile: releaseProfile,
    isLoading: releaseProfileLoading,
    isSaving,
    fetchProfile: fetchReleaseProfile,
    createProfile: createReleaseProfile,
    updateSongIntake,
    updateTargetAudience,
    updateBudgetTimeline,
    updateGoals,
    completeSetup,
  } = useReleaseProfileStore();

  // Local state
  const [isInitializing, setIsInitializing] = useState(true);
  const [showArtistForm, setShowArtistForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get release data
  const release = releases.find(r => r.id === releaseId);

  // =============================================
  // INITIALIZATION
  // =============================================

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    const initialize = async () => {
      setIsInitializing(true);
      
      try {
        // Fetch releases if needed
        if (releases.length === 0) {
          await fetchReleases();
        }

        // Check if artist profile exists
        await fetchArtistProfile();

        // Check/create release profile
        let profile = await fetchReleaseProfile(releaseId);
        if (!profile) {
          profile = await createReleaseProfile(releaseId);
        }

        // If setup already complete, go to tasks
        if (profile?.setupCompleted) {
          router.push(`/releases/${releaseId}/tasks`);
          return;
        }

      } catch (err) {
        console.error('Setup initialization failed:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, [isAuthenticated, releaseId]);

  // =============================================
  // HANDLERS
  // =============================================

  // Handle artist profile creation
  const handleArtistProfileSubmit = async (data: ArtistProfileFormData) => {
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      await createArtistProfile(data, user.id);
      setShowArtistForm(false);
    } catch (err) {
      console.error('Failed to create artist profile:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle release setup completion
  const handleSetupComplete = async (data: SetupWizardData) => {
    setIsSubmitting(true);
    
    try {
      // Update song intake (Step 2)
      await updateSongIntake(releaseId, data.songIntake);
      
      // Update target audience (Step 3)
      await updateTargetAudience(releaseId, data.targetAudience);
      
      // Update budget & timeline (Step 4)
      await updateBudgetTimeline(releaseId, data.budgetTimeline);
      
      // Update goals (Step 5)
      await updateGoals(releaseId, data.goals);
      
      // Mark setup as complete
      await completeSetup(releaseId);
      
      // Navigate to tasks page
      router.push(`/releases/${releaseId}/tasks`);
      
    } catch (err) {
      console.error('Failed to complete setup:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // =============================================
  // LOADING STATE
  // =============================================

  if (isInitializing || artistLoading || releaseProfileLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto mb-4" />
          <p className="text-content-secondary">Loading setup...</p>
        </div>
      </div>
    );
  }

  // =============================================
  // ARTIST PROFILE FORM
  // =============================================

  // Show artist profile form if no profile exists
  if (!hasProfile || showArtistForm) {
    return (
      <ArtistProfileForm
        initialData={artistProfile ? {
          artistName: artistProfile.artistName,
          brandAesthetic: artistProfile.brandAesthetic || '',
          bio: artistProfile.bio || '',
          pastReleasesCount: artistProfile.pastReleasesCount,
          bestStreamCount: artistProfile.bestStreamCount,
          careerStage: artistProfile.careerStage || 'emerging',
          referenceArtists: artistProfile.referenceArtists || [],
          instagramHandle: artistProfile.instagramHandle || '',
          tiktokHandle: artistProfile.tiktokHandle || '',
          twitterHandle: artistProfile.twitterHandle || '',
          youtubeHandle: artistProfile.youtubeHandle || '',
          spotifyUrl: artistProfile.spotifyUrl || '',
          appleMusicUrl: artistProfile.appleMusicUrl || '',
        } : {
          // Pre-fill artist name from release
          artistName: release?.artistName || '',
        }}
        onSubmit={handleArtistProfileSubmit}
        isLoading={isSubmitting}
      />
    );
  }

  // =============================================
  // RELEASE SETUP WIZARD
  // =============================================

  return (
    <ReleaseSetupWizard
      releaseId={releaseId}
      releaseTitle={release?.title || 'New Release'}
      onComplete={handleSetupComplete}
      initialStep={releaseProfile?.setupStep as 1 | 2 | 3 | 4 | 5 || 2}
      isLoading={isSubmitting}
    />
  );
}
