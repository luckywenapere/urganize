// lib/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile, handleSupabaseError } from './supabase/client';
import { errorMessage } from "@/lib/errors";
import { installAccessRedirect } from './access-redirect';
import { isAllowlistedEmail } from './paywall-allowlist';

// Install the global 402 → /locked interceptor as soon as the auth store
// is loaded on the client. Idempotent.
if (typeof window !== 'undefined') {
  installAccessRedirect();
}

const SAFE_AUTH_PATHS = ['/locked', '/auth', '/onboarding'];

const isOnSafeAuthPath = (): boolean => {
  if (typeof window === 'undefined') return true;
  const pathname = window.location.pathname || '/';
  return SAFE_AUTH_PATHS.some(
    (safe) => pathname === safe || pathname.startsWith(`${safe}/`)
  );
};

const ensureActiveAccessOrRedirect = async (
  accessToken: string,
  email: string | null | undefined
): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (isOnSafeAuthPath()) return;
  // Fast path — allowlisted emails never see the locked page. The server
  // would also bypass them via /api/subscription-status, but checking here
  // saves a round-trip and works even if the snapshot endpoint is degraded.
  if (isAllowlistedEmail(email)) {
    console.log(`[paywall-allowlist] frontend bypass: ${email?.trim().toLowerCase()}`);
    return;
  }
  try {
    const response = await fetch('/api/subscription-status', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) return;
    const payload = (await response.json().catch(() => ({}))) as {
      hasAccess?: boolean;
      accountStatus?: string;
      trialUsed?: boolean;
    };
    if (payload.hasAccess) return;
    const reason =
      payload.accountStatus === 'expired'
        ? payload.trialUsed
          ? 'trial_expired'
          : 'expired'
        : 'unpaid';
    window.location.replace(`/locked?reason=${encodeURIComponent(reason)}`);
  } catch {
    // Network failure — leave the user where they are; the next API call
    // will trigger the 402 interceptor if access is actually missing.
  }
};

let authCheckInFlight: Promise<void> | null = null;
const shouldEnforceScheduledDeletion = process.env.NODE_ENV === 'production';
const LAST_AUTH_EMAIL_KEY = 'urganize.last_auth_email';

const persistLastAuthEmail = (email: string | null | undefined) => {
  if (typeof window === 'undefined') return;
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalized);
};

const buildFallbackProfile = (authUser: User): Omit<Profile, 'created_at' | 'updated_at'> => {
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
    onboarding_completed: false,
    onboarding_step: 1,
    onboarding_completed_at: null,
    onboarding_role: null,
    onboarding_persona: null,
    onboarding_release_process: null,
    onboarding_biggest_headache: null,
    onboarding_release_id: null,
    onboarding_task_id: null,
    is_subscribed: false,
  };
};

const buildRuntimeFallbackProfile = (authUser: User): Profile => {
  const base = buildFallbackProfile(authUser);
  const nowIso = new Date().toISOString();
  return {
    ...base,
    created_at: nowIso,
    updated_at: nowIso,
  };
};

const isNonFatalProfileAccessError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toLowerCase();
  const message = String(errorMessage(error, '')).toLowerCase();
  return (
    code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('not authorized') ||
    message.includes('forbidden')
  );
};

const getOrCreateProfile = async (authUser: User): Promise<Profile> => {
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

const getScheduledDeletion = (metadata: Record<string, unknown> | undefined | null): string | null => {
  const value = metadata?.scheduled_deletion_at;
  return typeof value === 'string' ? value : null;
};

const isScheduledDeletionActive = (metadata: Record<string, unknown> | undefined | null): boolean => {
  const scheduled = getScheduledDeletion(metadata);
  if (!scheduled) return false;
  const scheduledTime = new Date(scheduled).getTime();
  return Number.isFinite(scheduledTime) && scheduledTime > Date.now();
};

const isAbortError = (error: unknown): boolean => {
  const message = String(errorMessage(error, '')).toLowerCase();
  const name = String((error as { name?: string } | null)?.name || '').toLowerCase();
  return name === 'aborterror' || message.includes('aborted') || message.includes('operation was aborted');
};

const resolveNeedsOnboarding = (profile: Profile | null | undefined): boolean => {
  if (!profile) {
    return true;
  }

  return profile.onboarding_completed !== true;
};

interface AuthState {
  user: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsOnboarding: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (nextPath?: string) => Promise<void>;
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
            const currentState = get();
            // Only show loading if we don't have a user yet.
            // If we are already authenticated, do the check in the background without flickering the UI.
            const shouldShowLoading = !currentState.isAuthenticated || !currentState.user;
            if (shouldShowLoading) {
              set({ isLoading: true });
            }
            
            // getUser() is more reliable as it forces a check against the server
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            const { data: { session } } = await supabase.auth.getSession();
            
            if (userError) {
              // If getUser fails, we are definitely not authenticated
              set({ user: null, isAuthenticated: false, isLoading: false, needsOnboarding: true, error: null });
              return;
            }
            
            if (user && session) {
              if (shouldEnforceScheduledDeletion && isScheduledDeletionActive(user.user_metadata as Record<string, unknown>)) {
                const scheduledAt = getScheduledDeletion(user.user_metadata as Record<string, unknown>);
                await supabase.auth.signOut();
                set({
                  user: null,
                  isAuthenticated: false,
                  isLoading: false,
                  needsOnboarding: true,
                  error: `Account is scheduled for deletion on ${new Date(scheduledAt || '').toLocaleString()}. Contact contact@urganize.app to recover.`,
                });
                return;
              }

              const profile = await getOrCreateProfile(user);

              if (profile) {
                persistLastAuthEmail(profile.email || user.email);
                const needsOnboarding = resolveNeedsOnboarding(profile);

                set({
                  user: profile,
                  isAuthenticated: true,
                  isLoading: false,
                  needsOnboarding,
                  error: null
                });

                // Side-effect: if the user landed in the app without active
                // access (no paid sub, no live trial), bounce them to /locked.
                // The check is best-effort; it does not block checkAuth itself.
                void ensureActiveAccessOrRedirect(session.access_token, profile.email || user.email);
                return;
              }
            }
            
            set({ user: null, isAuthenticated: false, isLoading: false, needsOnboarding: true, error: null });
          } catch (error) {
            if (isAbortError(error)) {
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

          if (shouldEnforceScheduledDeletion && isScheduledDeletionActive(data.user.user_metadata as Record<string, unknown>)) {
            const scheduledAt = getScheduledDeletion(data.user.user_metadata as Record<string, unknown>);
            await supabase.auth.signOut();
            throw new Error(`Account is scheduled for deletion on ${new Date(scheduledAt || '').toLocaleString()}. Contact contact@urganize.app to recover.`);
          }

          const profile = await getOrCreateProfile(data.user);

          if (profile) {
            persistLastAuthEmail(profile.email || data.user.email);
            const needsOnboarding = resolveNeedsOnboarding(profile);
            set({ 
              user: profile, 
              isAuthenticated: true, 
              isLoading: false,
              needsOnboarding,
              error: null 
            });
          }
        } catch (error) {
          const errorMessage = handleSupabaseError(error);
          set({ isLoading: false, error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      loginWithGoogle: async (nextPath?: string) => {
        try {
          set({ isLoading: true, error: null });
          const normalizedNextPath = String(nextPath || '').trim();
          const redirectUrl =
            normalizedNextPath && normalizedNextPath.startsWith('/')
              ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(normalizedNextPath)}`
              : `${window.location.origin}/auth/callback`;
          
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
            },
          });

          if (error) throw error;
        } catch (error) {
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
        } catch (error) {
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
        } catch (error) {
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
        } catch (error) {
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
        } catch (error) {
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
    } else if (event === 'SIGNED_IN') {
      useAuthStore.getState().checkAuth();
    } else if (event === 'TOKEN_REFRESHED') {
      useAuthStore.setState((state) => ({
        isAuthenticated: state.isAuthenticated,
        isLoading: false,
        error: state.error,
        needsOnboarding: state.needsOnboarding,
        user: state.user,
      }));
    }
  });
}
