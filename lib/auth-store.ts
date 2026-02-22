// lib/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, type Profile, handleSupabaseError } from './supabase/client';

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
        try {
          set({ isLoading: true });
          
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) throw sessionError;
          
          if (session?.user) {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profileError) throw profileError;

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
          console.error('Auth check failed:', error);
          const errorMessage = handleSupabaseError(error);
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false,
            needsOnboarding: true,
            error: errorMessage 
          });
        }
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

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (profileError) throw profileError;

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

supabase.auth.onAuthStateChange((event, session) => {
  const store = useAuthStore.getState();
  
  if (event === 'SIGNED_OUT') {
    store.logout();
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    store.checkAuth();
  }
});
