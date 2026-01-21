// lib/release-profile-store.ts
import { create } from 'zustand';
import { supabase } from './supabase/client';
import type {
  ReleaseProfile,
  SongIntakeFormData,
  AudioStatus,
  SetupStep,
} from '@/types';

// =============================================
// DATABASE MAPPERS
// =============================================

function dbToReleaseProfile(db: any): ReleaseProfile {
  return {
    id: db.id,
    releaseId: db.release_id,
    songStage: db.song_stage,
    isMastered: db.is_mastered,
    fileLocation: db.file_location,
    fileLocationOther: db.file_location_other,
    producer: db.producer,
    featuredArtists: db.featured_artists || [],
    mood: db.mood,
    genre: db.genre,
    subgenre: db.subgenre,
    isExplicit: db.is_explicit || false,
    hookTimestamp: db.hook_timestamp,
    songLength: db.song_length,
    hasSamples: db.has_samples || false,
    sampleDetails: db.sample_details,
    releaseConfidence: db.release_confidence,
    isArtworkReady: db.is_artwork_ready || false,
    songNotes: db.song_notes,
    managerNotes: db.manager_notes,
    primaryMarket: db.primary_market,
    targetAgeMin: db.target_age_min,
    targetAgeMax: db.target_age_max,
    targetAudienceDescription: db.target_audience_description,
    listenerInterests: db.listener_interests || [],
    budgetNaira: db.budget_naira,
    targetReleaseDate: db.target_release_date ? new Date(db.target_release_date) : undefined,
    hardDeadline: db.hard_deadline ? new Date(db.hard_deadline) : undefined,
    deadlineReason: db.deadline_reason,
    streamTargetRealistic: db.stream_target_realistic,
    streamTargetStretch: db.stream_target_stretch,
    playlistGoals: db.playlist_goals,
    socialGrowthGoals: db.social_growth_goals,
    otherGoals: db.other_goals,
    releaseStrategy: db.release_strategy,
    campaignNarrative: db.campaign_narrative,
    totalTasksEstimate: db.total_tasks_estimate,
    primaryAudioStatus: db.primary_audio_status || 'missing',
    setupStep: db.setup_step || 1,
    setupCompleted: db.setup_completed || false,
    setupCompletedAt: db.setup_completed_at ? new Date(db.setup_completed_at) : undefined,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function computeAudioStatus(profile: Partial<ReleaseProfile>): AudioStatus {
  if (!profile.songStage || profile.isMastered === undefined || !profile.fileLocation) {
    return 'missing';
  }
  if (profile.songStage === 'final' && profile.isMastered === true) {
    return 'ready';
  }
  return 'needs_changes';
}

// =============================================
// STORE TYPES
// =============================================

interface ReleaseProfileState {
  profile: ReleaseProfile | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  currentStep: SetupStep;
  
  // Actions
  fetchProfile: (releaseId: string) => Promise<ReleaseProfile | null>;
  createProfile: (releaseId: string) => Promise<ReleaseProfile>;
  
  // Step-by-step updates
  updateSongIntake: (releaseId: string, data: SongIntakeFormData) => Promise<void>;
  updateTargetAudience: (releaseId: string, data: {
    primaryMarket: string;
    targetAgeMin: number;
    targetAgeMax: number;
    targetAudienceDescription: string;
    listenerInterests: string[];
  }) => Promise<void>;
  updateBudgetTimeline: (releaseId: string, data: {
    budgetNaira: number;
    targetReleaseDate: string;
    hardDeadline?: string;
    deadlineReason?: string;
  }) => Promise<void>;
  updateGoals: (releaseId: string, data: {
    streamTargetRealistic: number;
    streamTargetStretch: number;
    playlistGoals: string;
    socialGrowthGoals: string;
    otherGoals?: string;
  }) => Promise<void>;
  
  // Setup completion
  completeSetup: (releaseId: string) => Promise<void>;
  setCurrentStep: (step: SetupStep) => void;
  
  // Utilities
  getAudioStatus: () => AudioStatus;
  clearError: () => void;
  reset: () => void;
}

// =============================================
// STORE IMPLEMENTATION
// =============================================

export const useReleaseProfileStore = create<ReleaseProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  isSaving: false,
  error: null,
  currentStep: 1,

  // Fetch release profile
  fetchProfile: async (releaseId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('release_profiles')
        .select('*')
        .eq('release_id', releaseId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const profile = dbToReleaseProfile(data);
        set({ 
          profile, 
          currentStep: profile.setupStep as SetupStep,
          isLoading: false 
        });
        return profile;
      }

      set({ profile: null, isLoading: false });
      return null;

    } catch (error: any) {
      console.error('Failed to fetch release profile:', error);
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  // Create new release profile
  createProfile: async (releaseId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('release_profiles')
        .insert([{ release_id: releaseId }])
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      const profile = dbToReleaseProfile(data);
      set({ profile, currentStep: 1, isLoading: false });
      return profile;

    } catch (error: any) {
      console.error('Failed to create release profile:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Update song intake (Step 2)
  updateSongIntake: async (releaseId: string, data: SongIntakeFormData) => {
    set({ isSaving: true, error: null });

    try {
      const audioStatus = computeAudioStatus(data);

      const updateData: any = {
        song_stage: data.songStage,
        is_mastered: data.isMastered,
        file_location: data.fileLocation,
        file_location_other: data.fileLocationOther,
        primary_audio_status: audioStatus,
        setup_step: 3,
      };

      // Add optional fields if provided
      if (data.producer !== undefined) updateData.producer = data.producer;
      if (data.featuredArtists) updateData.featured_artists = data.featuredArtists;
      if (data.mood !== undefined) updateData.mood = data.mood;
      if (data.genre !== undefined) updateData.genre = data.genre;
      if (data.subgenre !== undefined) updateData.subgenre = data.subgenre;
      if (data.isExplicit !== undefined) updateData.is_explicit = data.isExplicit;
      if (data.hookTimestamp !== undefined) updateData.hook_timestamp = data.hookTimestamp;
      if (data.songLength !== undefined) updateData.song_length = data.songLength;
      if (data.hasSamples !== undefined) updateData.has_samples = data.hasSamples;
      if (data.sampleDetails !== undefined) updateData.sample_details = data.sampleDetails;
      if (data.releaseConfidence !== undefined) updateData.release_confidence = data.releaseConfidence;
      if (data.isArtworkReady !== undefined) updateData.is_artwork_ready = data.isArtworkReady;
      if (data.songNotes !== undefined) updateData.song_notes = data.songNotes;
      if (data.managerNotes !== undefined) updateData.manager_notes = data.managerNotes;

      const { error } = await supabase
        .from('release_profiles')
        .update(updateData)
        .eq('release_id', releaseId);

      if (error) throw error;

      // Update local state
      const { profile } = get();
      if (profile) {
        set({
          profile: {
            ...profile,
            ...data,
            primaryAudioStatus: audioStatus,
            setupStep: 3,
          },
          currentStep: 3,
          isSaving: false,
        });
      }

    } catch (error: any) {
      console.error('Failed to update song intake:', error);
      set({ error: error.message, isSaving: false });
      throw error;
    }
  },

  // Update target audience (Step 3)
  updateTargetAudience: async (releaseId: string, data) => {
    set({ isSaving: true, error: null });

    try {
      const { error } = await supabase
        .from('release_profiles')
        .update({
          primary_market: data.primaryMarket,
          target_age_min: data.targetAgeMin,
          target_age_max: data.targetAgeMax,
          target_audience_description: data.targetAudienceDescription,
          listener_interests: data.listenerInterests,
          setup_step: 4,
        })
        .eq('release_id', releaseId);

      if (error) throw error;

      const { profile } = get();
      if (profile) {
        set({
          profile: {
            ...profile,
            primaryMarket: data.primaryMarket,
            targetAgeMin: data.targetAgeMin,
            targetAgeMax: data.targetAgeMax,
            targetAudienceDescription: data.targetAudienceDescription,
            listenerInterests: data.listenerInterests,
            setupStep: 4,
          },
          currentStep: 4,
          isSaving: false,
        });
      }

    } catch (error: any) {
      console.error('Failed to update target audience:', error);
      set({ error: error.message, isSaving: false });
      throw error;
    }
  },

  // Update budget & timeline (Step 4)
  updateBudgetTimeline: async (releaseId: string, data) => {
    set({ isSaving: true, error: null });

    try {
      const updateData: any = {
        budget_naira: data.budgetNaira,
        target_release_date: data.targetReleaseDate,
        setup_step: 5,
      };

      if (data.hardDeadline) updateData.hard_deadline = data.hardDeadline;
      if (data.deadlineReason) updateData.deadline_reason = data.deadlineReason;

      const { error } = await supabase
        .from('release_profiles')
        .update(updateData)
        .eq('release_id', releaseId);

      if (error) throw error;

      const { profile } = get();
      if (profile) {
        set({
          profile: {
            ...profile,
            budgetNaira: data.budgetNaira,
            targetReleaseDate: new Date(data.targetReleaseDate),
            hardDeadline: data.hardDeadline ? new Date(data.hardDeadline) : undefined,
            deadlineReason: data.deadlineReason,
            setupStep: 5,
          },
          currentStep: 5,
          isSaving: false,
        });
      }

    } catch (error: any) {
      console.error('Failed to update budget/timeline:', error);
      set({ error: error.message, isSaving: false });
      throw error;
    }
  },

  // Update goals (Step 5)
  updateGoals: async (releaseId: string, data) => {
    set({ isSaving: true, error: null });

    try {
      const { error } = await supabase
        .from('release_profiles')
        .update({
          stream_target_realistic: data.streamTargetRealistic,
          stream_target_stretch: data.streamTargetStretch,
          playlist_goals: data.playlistGoals,
          social_growth_goals: data.socialGrowthGoals,
          other_goals: data.otherGoals,
        })
        .eq('release_id', releaseId);

      if (error) throw error;

      const { profile } = get();
      if (profile) {
        set({
          profile: {
            ...profile,
            streamTargetRealistic: data.streamTargetRealistic,
            streamTargetStretch: data.streamTargetStretch,
            playlistGoals: data.playlistGoals,
            socialGrowthGoals: data.socialGrowthGoals,
            otherGoals: data.otherGoals,
          },
          isSaving: false,
        });
      }

    } catch (error: any) {
      console.error('Failed to update goals:', error);
      set({ error: error.message, isSaving: false });
      throw error;
    }
  },

  // Complete setup
  completeSetup: async (releaseId: string) => {
    set({ isSaving: true, error: null });

    try {
      const { error } = await supabase
        .from('release_profiles')
        .update({
          setup_completed: true,
          setup_completed_at: new Date().toISOString(),
        })
        .eq('release_id', releaseId);

      if (error) throw error;

      const { profile } = get();
      if (profile) {
        set({
          profile: {
            ...profile,
            setupCompleted: true,
            setupCompletedAt: new Date(),
          },
          isSaving: false,
        });
      }

    } catch (error: any) {
      console.error('Failed to complete setup:', error);
      set({ error: error.message, isSaving: false });
      throw error;
    }
  },

  // Set current step
  setCurrentStep: (step: SetupStep) => {
    set({ currentStep: step });
  },

  // Get computed audio status
  getAudioStatus: () => {
    const { profile } = get();
    if (!profile) return 'missing';
    return computeAudioStatus(profile);
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Reset store
  reset: () => set({
    profile: null,
    isLoading: false,
    isSaving: false,
    error: null,
    currentStep: 1,
  }),
}));
