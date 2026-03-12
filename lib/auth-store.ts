// lib/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, type Profile, handleSupabaseError } from './supabase/client';

let authCheckInFlight: Promise<void> | null = null;
const shouldEnforceScheduledDeletion = process.env.NODE_ENV === 'production';
const LAST_AUTH_EMAIL_KEY = 'urganize.last_auth_email';

const persistLastAuthEmail = (email: string | null | undefined) => {
  if (typeof window === 'undefined') return;
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalized);
};

const buildFallbackProfile = (authUser: any): Omit<Profile, 'created_at' | 'updated_at'> => {
  const email = authUser?.email || '';
  const metadata = authUser?.user_metadata || {};
  const name =
    metadata.name ||
    metadata.full_name ||
    (email.includes('@') ? email.split('@')[0] : 'User');
  const role = metadata.role || 'artist-manager';
  const artistName = String(metadata.artist_name || '').trim();

  return {
    id: authUser.id,
    name,
    email,
    role,
    artist_name: artistName || null,
    is_subscribed: false,
  };
};

const buildRuntimeFallbackProfile = (authUser: any): Profile => {
  const base = buildFallbackProfile(authUser);
  const nowIso = new Date().toISOString();
  return {
    ...base,
    created_at: nowIso,
    updated_at: nowIso,
  };
};

const isNonFatalProfileAccessError = (error: any): boolean => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('not authorized') ||
    message.includes('forbidden')
  );
};

const getOrCreateProfile = async (authUser: any): Promise<Profile> => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (!profileError && profile) {
    return profile;
  }

  if (profileError && isNonFatalProfileAccessError(profileError)) {
    // Production auth should not be blocked by profile policy drift.
    return buildRuntimeFallbackProfile(authUser);
  }

  if (profileError?.code !== 'PGRST116') {
    throw profileError;
  }

  const fallbackProfile = buildFallbackProfile(authUser);
  const { error: insertError } = await supabase
    .from('profiles')
    .upsert(fallbackProfile, { onConflict: 'id' });

  if (insertError) {
    if (isNonFatalProfileAccessError(insertError)) {
      return buildRuntimeFallbackProfile(authUser);
    }
    throw insertError;
  }

  const { data: createdProfile, error: createdError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (createdError || !createdProfile) {
    if (isNonFatalProfileAccessError(createdError)) {
      return buildRuntimeFallbackProfile(authUser);
    }
    throw createdError || new Error('Could not load profile');
  }

  return createdProfile;
};

const getScheduledDeletion = (metadata: Record<string, any> | undefined | null): string | null => {
  const value = metadata?.scheduled_deletion_at;
  return typeof value === 'string' ? value : null;
};

const isScheduledDeletionActive = (metadata: Record<string, any> | undefined | null): boolean => {
  const scheduled = getScheduledDeletion(metadata);
  if (!scheduled) return false;
  const scheduledTime = new Date(scheduled).getTime();
  return Number.isFinite(scheduledTime) && scheduledTime > Date.now();
};

const isAbortError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return name === 'aborterror' || message.includes('aborted') || message.includes('operation was aborted');
};

const resolveNeedsOnboarding = async (userId: string): Promise<boolean> => {
  const { data: releases, error: releasesError } = await supabase
    .from('releases')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (releasesError || !releases || releases.length === 0) {
    return true;
  }

  const releaseIds = releases.map((release) => release.id);
  const { data: onboardingProfiles, error: onboardingError } = await supabase
    .from('release_profiles')
    .select('setup_completed, setup_step')
    .in('release_id', releaseIds)
    .order('updated_at', { ascending: false });

  if (onboardingError || !onboardingProfiles || onboardingProfiles.length === 0) {
    return true;
  }

  const hasInProgressOnboarding = onboardingProfiles.some((profile) => {
    if (profile.setup_completed === true) return false;
    const step = Number(profile.setup_step || 0);
    return step >= 2 && step < 13;
  });
  if (hasInProgressOnboarding) return true;

  const hasCompletedOnboarding = onboardingProfiles.some((profile) => profile.setup_completed === true);
  if (hasCompletedOnboarding) return false;

  return true;
};

interface AuthState {
  user: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsOnboarding: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (email: string, password: string, name: string, role: string, artistName?: string) => Promise<void>;
  updateArtistName: (artistName: string) => Promise<void>;
  updateRole: (role: Profile['role']) => Promise<void>;
  setNeedsOnboarding: (needsOnboarding: boolean) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      needsOnboarding: true,
      error: null,

      clearError: () => set({ error: null }),
      setNeedsOnboarding: (needsOnboarding: boolean) => set({ needsOnboarding }),

      checkAuth: async () => {
        if (authCheckInFlight) {
          return authCheckInFlight;
        }

        authCheckInFlight = (async () => {
          try {
          set({ isLoading: true });
          
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) throw sessionError;
          
          if (session?.user) {
            if (shouldEnforceScheduledDeletion && isScheduledDeletionActive(session.user.user_metadata as Record<string, any>)) {
              const scheduledAt = getScheduledDeletion(session.user.user_metadata as Record<string, any>);
              await supabase.auth.signOut();
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                needsOnboarding: true,
                error: `Account is scheduled for deletion on ${new Date(scheduledAt || '').toLocaleString()}. Contact theurganization@gmail.com to recover.`,
              });
              return;
            }

            const profile = await getOrCreateProfile(session.user);

            if (profile) {
              persistLastAuthEmail(profile.email || session.user.email);
              const needsOnboarding = await resolveNeedsOnboarding(session.user.id);

              set({ 
                user: profile, 
                isAuthenticated: true, 
                isLoading: false,
                needsOnboarding,
                error: null 
              });
              return;
            }
          }
          
          set({ user: null, isAuthenticated: false, isLoading: false, needsOnboarding: true, error: null });
          } catch (error: any) {
          if (isAbortError(error)) {
            // Parallel auth checks during OAuth callback can cancel each other.
            // Do not treat cancellation as an auth failure.
            set((state) => ({ isLoading: false, error: state.error }));
            return;
          }
          console.error('Auth check failed:', error);
          const errorMessage = handleSupabaseError(error);
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false,
            needsOnboarding: true,
            error: errorMessage 
          });
          } finally {
            authCheckInFlight = null;
          }
        })();

        return authCheckInFlight;
      },

      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });

          const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });

          if (signInError) throw signInError;

          if (!data.user) {
            throw new Error('Login failed - no user returned');
          }

          if (shouldEnforceScheduledDeletion && isScheduledDeletionActive(data.user.user_metadata as Record<string, any>)) {
            const scheduledAt = getScheduledDeletion(data.user.user_metadata as Record<string, any>);
            await supabase.auth.signOut();
            throw new Error(`Account is scheduled for deletion on ${new Date(scheduledAt || '').toLocaleString()}. Contact theurganization@gmail.com to recover.`);
          }

          const profile = await getOrCreateProfile(data.user);

          if (profile) {
            persistLastAuthEmail(profile.email || data.user.email);
            const needsOnboarding = await resolveNeedsOnboarding(data.user.id);
            set({ 
              user: profile, 
              isAuthenticated: true, 
              isLoading: false,
              needsOnboarding,
              error: null 
            });
          }
        } catch (error: any) {
          const errorMessage = handleSupabaseError(error);
          set({ isLoading: false, error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      loginWithGoogle: async () => {
        try {
          set({ isLoading: true, error: null });
          
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });

          if (error) throw error;
        } catch (error: any) {
          const errorMessage = handleSupabaseError(error);
          set({ isLoading: false, error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      signup: async (email: string, password: string, name: string, role: string, artistName?: string) => {
        try {
          set({ isLoading: true, error: null });
          const normalizedArtistName = String(artistName || '').trim();
          if (role === 'artist' && !normalizedArtistName) {
            throw new Error('Artist name is required for Artist accounts');
          }

          const { data, error: signUpError } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
              data: {
                name: name.trim(),
                role,
                artist_name: normalizedArtistName || undefined,
              },
            },
          });

          if (signUpError) throw signUpError;

          if (!data.user) {
            throw new Error('Signup failed - no user returned');
          }

          if (data.session) {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.user.id)
              .single();

            if (profileError) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const { data: retryProfile, error: retryError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();

              if (retryError) throw retryError;

              if (role === 'artist' && normalizedArtistName && !retryProfile?.artist_name) {
                const { data: artistUpdatedProfile, error: artistUpdateError } = await supabase
                  .from('profiles')
                  .update({ artist_name: normalizedArtistName, updated_at: new Date().toISOString() })
                  .eq('id', data.user.id)
                  .select('*')
                  .single();
                if (!artistUpdateError && artistUpdatedProfile) {
                  persistLastAuthEmail(artistUpdatedProfile.email || data.user.email);
                  set({
                    user: artistUpdatedProfile,
                    isAuthenticated: true,
                    isLoading: false,
                    needsOnboarding: true,
                    error: null,
                  });
                  return;
                }
              }

              if (retryProfile) {
                persistLastAuthEmail(retryProfile.email || data.user.email);
                set({ 
                  user: retryProfile, 
                  isAuthenticated: true, 
                  isLoading: false,
                  needsOnboarding: true,
                  error: null 
                });
              }
            } else if (profile) {
              if (role === 'artist' && normalizedArtistName && !profile.artist_name) {
                const { data: artistUpdatedProfile, error: artistUpdateError } = await supabase
                  .from('profiles')
                  .update({ artist_name: normalizedArtistName, updated_at: new Date().toISOString() })
                  .eq('id', data.user.id)
                  .select('*')
                  .single();
                if (!artistUpdateError && artistUpdatedProfile) {
                  persistLastAuthEmail(artistUpdatedProfile.email || data.user.email);
                  set({
                    user: artistUpdatedProfile,
                    isAuthenticated: true,
                    isLoading: false,
                    needsOnboarding: true,
                    error: null,
                  });
                  return;
                }
              }
              persistLastAuthEmail(profile.email || data.user.email);
              set({ 
                user: profile, 
                isAuthenticated: true, 
                isLoading: false,
                needsOnboarding: true,
                error: null 
              });
            }
          } else {
            set({ 
              isLoading: false,
              error: 'Please check your email to verify your account' 
            });
          }
        } catch (error: any) {
          const errorMessage = handleSupabaseError(error);
          set({ isLoading: false, error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      updateRole: async (role: Profile['role']) => {
        try {
          const currentUser = get().user;
          if (!currentUser) {
            throw new Error('User not found');
          }

          set({ isLoading: true, error: null });

          const { data: updatedProfile, error } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', currentUser.id)
            .select('*')
            .single();

          if (error) throw error;

        set({
          user: updatedProfile,
          isLoading: false,
          needsOnboarding: true,
          error: null,
        });
        } catch (error: any) {
          const errorMessage = handleSupabaseError(error);
          set({ isLoading: false, error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      updateArtistName: async (artistName: string) => {
        try {
          const currentUser = get().user;
          const normalizedArtistName = String(artistName || '').trim();
          if (!currentUser) throw new Error('User not found');
          if (currentUser.role !== 'artist') throw new Error('Only Artist accounts can set artist name');
          if (!normalizedArtistName) throw new Error('Artist name is required');

          set({ isLoading: true, error: null });

          const { data: updatedProfile, error } = await supabase
            .from('profiles')
            .update({ artist_name: normalizedArtistName, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id)
            .select('*')
            .single();

          if (error) throw error;

          set({
            user: updatedProfile,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          const errorMessage = handleSupabaseError(error);
          set({ isLoading: false, error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      logout: async () => {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false,
            needsOnboarding: true,
            error: null 
          });
        } catch (error: any) {
          const errorMessage = handleSupabaseError(error);
          console.error('Logout failed:', error);
          set({ error: errorMessage });
        }
      },
    }),
    {
      name: 'urganize-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        needsOnboarding: state.needsOnboarding,
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        needsOnboarding: true,
        error: null,
      });
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      useAuthStore.getState().checkAuth();
    }
  });
}
