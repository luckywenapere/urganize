// lib/artist-profile-store.ts
import { create } from 'zustand';
import { supabase } from './supabase/client';
import type { ArtistProfile, ArtistProfileFormData } from '@/types';

// =============================================
// DATABASE MAPPERS
// =============================================

// Helper to convert DB format to app format
function dbToArtistProfile(db: any): ArtistProfile {
  return {
    id: db.id,
    userId: db.user_id,
    artistName: db.artist_name,
    brandAesthetic: db.brand_aesthetic,
    bio: db.bio,
    pastReleasesCount: db.past_releases_count || 0,
    bestStreamCount: db.best_stream_count || 0,
    careerStage: db.career_stage,
    referenceArtists: db.reference_artists || [],
    instagramHandle: db.instagram_handle,
    tiktokHandle: db.tiktok_handle,
    twitterHandle: db.twitter_handle,
    youtubeHandle: db.youtube_handle,
    spotifyUrl: db.spotify_url,
    appleMusicUrl: db.apple_music_url,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

// Helper to convert app format to DB format
function artistProfileToDb(profile: Partial<ArtistProfileFormData> & { userId?: string }): any {
  const db: any = {};
  
  if (profile.userId) db.user_id = profile.userId;
  if (profile.artistName) db.artist_name = profile.artistName;
  if (profile.brandAesthetic !== undefined) db.brand_aesthetic = profile.brandAesthetic;
  if (profile.bio !== undefined) db.bio = profile.bio;
  if (profile.pastReleasesCount !== undefined) db.past_releases_count = profile.pastReleasesCount;
  if (profile.bestStreamCount !== undefined) db.best_stream_count = profile.bestStreamCount;
  if (profile.careerStage) db.career_stage = profile.careerStage;
  if (profile.referenceArtists) db.reference_artists = profile.referenceArtists;
  if (profile.instagramHandle !== undefined) db.instagram_handle = profile.instagramHandle;
  if (profile.tiktokHandle !== undefined) db.tiktok_handle = profile.tiktokHandle;
  if (profile.twitterHandle !== undefined) db.twitter_handle = profile.twitterHandle;
  if (profile.youtubeHandle !== undefined) db.youtube_handle = profile.youtubeHandle;
  if (profile.spotifyUrl !== undefined) db.spotify_url = profile.spotifyUrl;
  if (profile.appleMusicUrl !== undefined) db.apple_music_url = profile.appleMusicUrl;
  
  return db;
}

// =============================================
// STORE TYPES
// =============================================

interface ArtistProfileState {
  profile: ArtistProfile | null;
  isLoading: boolean;
  error: string | null;
  hasProfile: boolean;
  
  // Actions
  fetchProfile: () => Promise<void>;
  createProfile: (data: ArtistProfileFormData, userId: string) => Promise<ArtistProfile>;
  updateProfile: (data: Partial<ArtistProfileFormData>) => Promise<void>;
  checkHasProfile: (userId: string) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

// =============================================
// STORE IMPLEMENTATION
// =============================================

export const useArtistProfileStore = create<ArtistProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  error: null,
  hasProfile: false,

  // Fetch current user's artist profile
  fetchProfile: async () => {
    set({ isLoading: true, error: null });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        set({ isLoading: false, profile: null, hasProfile: false });
        return;
      }

      const { data, error } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is okay
        throw error;
      }

      if (data) {
        const profile = dbToArtistProfile(data);
        set({ profile, hasProfile: true, isLoading: false });
      } else {
        set({ profile: null, hasProfile: false, isLoading: false });
      }
    } catch (error: any) {
      console.error('Failed to fetch artist profile:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  // Create new artist profile
  createProfile: async (data: ArtistProfileFormData, userId: string) => {
    set({ isLoading: true, error: null });

    try {
      const dbData = artistProfileToDb({ ...data, userId });

      const { data: inserted, error } = await supabase
        .from('artist_profiles')
        .insert([dbData])
        .select()
        .single();

      if (error) throw error;
      if (!inserted) throw new Error('No data returned from insert');

      const profile = dbToArtistProfile(inserted);
      set({ profile, hasProfile: true, isLoading: false });
      
      return profile;
    } catch (error: any) {
      console.error('Failed to create artist profile:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Update existing artist profile
  updateProfile: async (data: Partial<ArtistProfileFormData>) => {
    const { profile } = get();
    if (!profile) {
      set({ error: 'No profile to update' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const dbData = artistProfileToDb(data);
      dbData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('artist_profiles')
        .update(dbData)
        .eq('id', profile.id);

      if (error) throw error;

      // Update local state
      set({
        profile: {
          ...profile,
          ...data,
          updatedAt: new Date(),
        } as ArtistProfile,
        isLoading: false,
      });
    } catch (error: any) {
      console.error('Failed to update artist profile:', error);
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Check if user has an artist profile
  checkHasProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const hasProfile = !!data;
      set({ hasProfile });
      return hasProfile;
    } catch (error: any) {
      console.error('Failed to check artist profile:', error);
      return false;
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Reset store
  reset: () => set({
    profile: null,
    isLoading: false,
    error: null,
    hasProfile: false,
  }),
}));
