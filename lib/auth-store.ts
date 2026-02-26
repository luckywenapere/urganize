// lib/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, type Profile, handleSupabaseError } from './supabase/client';

let authCheckInFlight: Promise<void> | null = null;
const shouldEnforceScheduledDeletion = process.env.NODE_ENV === 'production';

const buildFallbackProfile = (authUser: any): Omit<Profile, 'created_at' | 'updated_at'> => {
  const email = authUser?.email || '';
  const metadata = authUser?.user_metadata || {};
  const name =
    metadata.name ||
    metadata.full_name ||
    (email.includes('@') ? email.split('@')[0] : 'User');
  const role = metadata.role || 'artist-manager';

  return {
    id: authUser.id,
    name,
    email,
    role,
    is_subscribed: false,
  };
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

  if (profileError?.code !== 'PGRST116') {
    throw profileError;
  }

  const fallbackProfile = buildFallbackProfile(authUser);
  const { error: insertError } = await supabase
    .from('profiles')
    .upsert(fallbackProfile, { onConflict: 'id' });

  if (insertError) throw insertError;

  const { data: createdProfile, error: createdError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (createdError || !createdProfile) {
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

interface AuthState {
  user: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsOnboarding: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (email: string, password: string, name: string, role: string) => Promise<void>;
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
              let needsOnboarding = true;

              const { data: releases, error: releasesError } = await supabase
                .from('releases')
                .select('id')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(20);

              if (!releasesError && releases && releases.length > 0) {
                const releaseIds = releases.map((release) => release.id);

                const { data: onboardingProfiles, error: onboardingError } = await supabase
                  .from('release_profiles')
                  .select('setup_completed')
                  .in('release_id', releaseIds)
                  .order('updated_at', { ascending: false });

                if (!onboardingError && onboardingProfiles && onboardingProfiles.length > 0) {
                  needsOnboarding = !onboardingProfiles.some((item) => item.setup_completed);
                }
              }

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
            set({ 
              user: profile, 
              isAuthenticated: true, 
              isLoading: false,
              needsOnboarding: true,
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

      signup: async (email: string, password: string, name: string, role: string) => {
        try {
          set({ isLoading: true, error: null });

          const { data, error: signUpError } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
              data: {
                name: name.trim(),
                role,
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

              if (retryProfile) {
                set({ 
                  user: retryProfile, 
                  isAuthenticated: true, 
                  isLoading: false,
                  needsOnboarding: true,
                  error: null 
                });
              }
            } else if (profile) {
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
