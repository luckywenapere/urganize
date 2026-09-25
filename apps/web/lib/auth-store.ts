// lib/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile, handleSupabaseError } from './supabase/client';
import { errorMessage } from "@/lib/errors";
import { installAccessRedirect } from './access-redirect';
import { isAllowlistedEmail } from './paywall-allowlist';
import { isCardTrialEnabled, resolveCardTrialDestination } from './trial-card';
import { isHardPaywallEnabled } from './team-billing';
import { isNativePlatform } from './platform';
import { resetSceneData } from '@/stores/useSceneDataStore';
import { resetSceneMemory } from '@/lib/scene-memory';
import { resetCatalogIntent } from '@/lib/catalog-intent';
import { resetPressKitsStore } from '@/stores/usePressKitsStore';
import { resetEventsStore } from '@/stores/useEventsStore';
import { resetArtistRosterStore } from '@/stores/useArtistRosterStore';
import { clearKitDetailCache } from '@/lib/press-kit-detail-cache';
import { useChappiStore } from '@/stores/useChappiStore';
import { resetChappiHistory } from '@/stores/useChappiHistoryStore';
import { clearPendingFirstShare } from '@/lib/social-share-offer';
import {
  classifyAuthFailure,
  isProfileReadTransientError,
  shouldClearPersistedSession,
  type AuthFailureKind,
} from '@/lib/auth-failure';
import { captureAnalyticsEvent } from '@/lib/analytics/client';

// Custom URL scheme registered in the native shell's Info.plist /
// AndroidManifest.xml (apps/mobile) — see docs/mobile/auth-setup.md. Google
// blocks its OAuth consent screen inside embedded/non-system webviews, so on
// native the flow opens in the system browser and returns via this scheme
// instead of a plain https redirect back into the webview.
const NATIVE_OAUTH_SCHEME = 'com.urganize.app://';

// Install the global 402 → /locked interceptor as soon as the auth store
// is loaded on the client. Idempotent.
if (typeof window !== 'undefined') {
  installAccessRedirect();
}

// /payment is here because /payment/callback polls while the Paystack webhook
// may still be in flight — bouncing a user off it mid-poll would eat their
// confirmation screen. /redeem matches access-redirect.ts's SAFE_PATHS (the
// two lists used to differ by that one entry). /start-trial is the
// card-before-trial page itself.
const SAFE_AUTH_PATHS = [
  '/locked',
  '/auth',
  '/onboarding',
  '/invite',
  '/redeem',
  '/payment',
  '/start-trial',
];

const isOnSafeAuthPath = (): boolean => {
  if (typeof window === 'undefined') return true;
  const pathname = window.location.pathname || '/';
  return SAFE_AUTH_PATHS.some(
    (safe) => pathname === safe || pathname.startsWith(`${safe}/`)
  );
};

// PAYWALL OFF (2026-07-23): the app is free while the founders onboard
// teams personally — nobody gets bounced to /locked on login. Mirrors the
// server-side early return in app/api/_shared/paywall.ts
// (requireActiveAccount); flip this back to true alongside removing that
// return to restore the paywall.
const PAYWALL_LOGIN_BOUNCE_ENABLED: boolean = false;

// Card-before-trial (NEXT_PUBLIC_FEATURE_CARD_TRIAL): independent of the
// paywall bounce above. When on, a NEW signup (post-cutoff, unpaid, trial
// never used, not a curator, not an invited teammate — the server computes
// all of that as `cardTrialRequired`, see /api/subscription-status) is sent
// to /start-trial instead of the app. Existing accounts are untouched.
const CARD_TRIAL_BOUNCE_ENABLED = isCardTrialEnabled();

// Team trial + hard paywall (NEXT_PUBLIC_FEATURE_HARD_PAYWALL). When on, a
// walled team is bounced to /locked at login. Independent of the two switches
// above: this is the team-level successor to PAYWALL_LOGIN_BOUNCE_ENABLED, and
// the answer comes from the server as `teamAccess` (see
// lib/team-billing-server.ts), never re-derived here.
const HARD_PAYWALL_BOUNCE_ENABLED = isHardPaywallEnabled();

const ensureActiveAccessOrRedirect = async (
  accessToken: string,
  email: string | null | undefined
): Promise<void> => {
  if (
    !PAYWALL_LOGIN_BOUNCE_ENABLED &&
    !CARD_TRIAL_BOUNCE_ENABLED &&
    !HARD_PAYWALL_BOUNCE_ENABLED
  ) {
    return;
  }
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
      cardTrialRequired?: boolean;
      onboardingCompleted?: boolean | null;
      teamAccess?: { hasAccess?: boolean } | null;
    };

    // Card gate first — it targets exactly the accounts the /locked bounce
    // would call 'unpaid', and /start-trial (not /locked) is where a
    // never-trialed new signup belongs. The predicate is entirely
    // server-derived and fails open (see lib/trial-card.ts). An account that
    // never finished onboarding goes through the wizard first: it has no
    // release and has seen no plan yet, so billing-first would wall it before
    // it ever saw what it is paying for.
    if (CARD_TRIAL_BOUNCE_ENABLED && payload.cardTrialRequired === true) {
      window.location.replace(resolveCardTrialDestination(payload.onboardingCompleted));
      return;
    }

    // Team wall. The server already decided (owner's subscription + the team's
    // trial/comp state, with every uncertainty failing open); a missing
    // teamAccess object means the flag is off server-side, so nothing happens.
    if (HARD_PAYWALL_BOUNCE_ENABLED && payload.teamAccess) {
      if (payload.teamAccess.hasAccess === false) {
        window.location.replace('/locked?reason=team_trial_expired');
      }
      return;
    }

    // Everything below is the original paywall bounce, still off.
    if (!PAYWALL_LOGIN_BOUNCE_ENABLED) return;
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
// Recency guard, same shape as the stores' (useReleaseStore,
// useWorkspaceIdentityStore). checkAuth fires from AppShell's mount effect AND
// from onAuthStateChange's INITIAL_SESSION and SIGNED_IN handlers, so a single
// page load used to run the getUser → getSession → profile chain up to three
// times over. Once verified, re-verifying seconds later buys nothing.
let authCheckedAt = 0;
const AUTH_FRESH_MS = 30_000;
/** Called on logout / SIGNED_OUT so the next check is never short-circuited. */
const invalidateAuthRecency = () => {
  authCheckedAt = 0;
};
const shouldEnforceScheduledDeletion = process.env.NODE_ENV === 'production';
const LAST_AUTH_EMAIL_KEY = 'urganize.last_auth_email';

const persistLastAuthEmail = (email: string | null | undefined) => {
  if (typeof window === 'undefined') return;
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalized);
};

// Explicit logout should forget the remembered email so /auth comes back
// to a clean slate — otherwise the next visitor sees the previous account's
// address pre-filled (and the "this account uses Google sign-in" hint that
// follows from it). The prefill still helps users who just leave and return
// without logging out.
const clearLastAuthEmail = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LAST_AUTH_EMAIL_KEY);
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

const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

/**
 * Is this account also a playlist owner? The answer is the existence of a
 * curator_profiles row, never profiles.role — role='curator' means only
 * "curator-only, team side never activated", so a dual account reads as a
 * normal team account there while still owning an inbox.
 *
 * Read through the user's own session (the "Curators view their profile" policy
 * covers it), and only when the feature is on, so every other account pays
 * nothing. On failure we fall back to the role, which is right for the accounts
 * that predate dual capability.
 */
const loadCuratorCapability = async (authUser: User, profile: Profile): Promise<boolean> => {
  if (!PITCHING_ENABLED) return false;
  const { data, error } = await supabase
    .from('curator_profiles')
    .select('user_id')
    .eq('user_id', authUser.id)
    .maybeSingle();
  if (error) return profile.role === 'curator';
  return Boolean(data?.user_id);
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

/**
 * `navigator.onLine` where it exists, for classifyAuthFailure's `opts.online`.
 * Optimistic off-browser: a missing Navigator must not be read as "offline".
 */
const isBrowserOnline = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * The last auth failure we chose to ride out, kept only so that if the session
 * dies moments later we can say in telemetry whether we had just seen the
 * network misbehaving. Not state — never rendered, never persisted.
 */
let lastAuthFailure: { kind: AuthFailureKind; at: number } | null = null;

const rememberAuthFailure = (error: unknown): void => {
  lastAuthFailure = { kind: classifyAuthFailure(error, { online: isBrowserOnline() }), at: Date.now() };
};

/** Only a failure in the last two minutes is plausibly related to a sign-out. */
const RECENT_AUTH_FAILURE_MS = 120_000;

/**
 * Did WE ask for the sign-out we are about to hear about?
 *
 * supabase-js emits SIGNED_OUT on its own initiative whenever it gives up on a
 * session — most often a refresh that failed non-retryably. That is a real
 * logout and we still honour it (by then the token is already deleted, so
 * pretending otherwise would leave the app running as `anon`, which under RLS
 * returns empty results rather than errors — a blank dashboard with no way
 * out). But it is worth telling apart from a sign-out this app asked for, so
 * we can explain it on /auth and count it in telemetry.
 *
 * 'deliberate' covers every signOut() WE call: the user clicking Log out, and
 * scheduled-deletion enforcement (which sets its own, far more specific
 * message and must not be papered over with a generic one). The default is
 * 'unexpected', so a SIGNED_OUT nobody here initiated is reported as one.
 */
type SignOutOrigin = 'deliberate' | 'unexpected';
let pendingSignOutOrigin: SignOutOrigin = 'unexpected';

/** A signOut() we asked for, so the SIGNED_OUT it emits is not counted as a loss. */
const runDeliberateSignOut = async (): Promise<void> => {
  pendingSignOutOrigin = 'deliberate';
  try {
    await supabase.auth.signOut();
  } finally {
    pendingSignOutOrigin = 'unexpected';
  }
};

/**
 * One-shot, deliberately in sessionStorage rather than the persisted store
 * slice: an explanation for the current visit must never become sticky.
 * Read and cleared by app/auth/AuthPageClient.tsx.
 */
export const SESSION_EXPIRED_NOTICE_KEY = 'urganize.auth.session-expired';

const markSessionExpiredNotice = (): void => {
  try {
    window.sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, '1');
  } catch {
    // Storage can throw in a restricted webview. The notice is a courtesy.
  }
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
  /** Whether this account also owns a playlist-curator profile. `null` while
   * unknown — the probe runs inside checkAuth, so consumers must treat null as
   * "still loading" and not as "no". Never persisted: it is cheap to re-read and
   * a stale `true` would show a nav entry that 403s. */
  hasCuratorProfile: boolean | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (nextPath?: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    name: string,
    role: string,
    artistName?: string,
    options?: {
      /** Invite token stashed into auth.user_metadata at signup so the
       * server-side deferred claim (lib/invite-claims-server.ts) can finish
       * the workspace join even when the accept POST after signup never
       * completes — the account-created-but-never-joined dead end. */
      pendingInviteToken?: string;
    }
  ) => Promise<void>;
  updateArtistName: (artistName: string) => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  updateAskAfterTasks: (enabled: boolean) => Promise<void>;
  updateMotivationalNudges: (enabled: boolean) => Promise<void>;
  updateRole: (role: Profile['role']) => Promise<void>;
  setNeedsOnboarding: (needsOnboarding: boolean) => void;
  logout: () => Promise<void>;
  /** `force: true` skips the 30s recency guard — pass it after anything that
   * changes the account's server-side state (onboarding, payment, promo
   * redemption, OAuth callback) so the refetch actually happens. */
  checkAuth: (options?: { force?: boolean }) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      needsOnboarding: true,
      hasCuratorProfile: null,
      error: null,

      clearError: () => set({ error: null }),
      setNeedsOnboarding: (needsOnboarding: boolean) => set({ needsOnboarding }),

      checkAuth: async (options?: { force?: boolean }) => {
        if (authCheckInFlight) {
          return authCheckInFlight;
        }
        if (!options?.force) {
          const state = get();
          if (
            state.isAuthenticated &&
            state.user &&
            Date.now() - authCheckedAt < AUTH_FRESH_MS
          ) {
            return;
          }
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
            
            // SEQUENTIAL, and getSession() first. Do not restore the old
            // Promise.all here: getUser() and getSession() both take the same
            // navigator lock (auth-js _acquireLock), and its re-entrancy fast
            // path only applies once the lock is ALREADY held — which it is
            // not when both are started at once. So they queue, and at
            // lockAcquireTimeout (5s by default) the waiter STEALS the lock and
            // the holder is thrown NavigatorLockAcquireTimeoutError. That throw
            // comes from the lock wrapper, outside _getUser's try/catch, so
            // getUser() rejects rather than returning an { error } result. The
            // net effect was that any /auth/v1/user round trip slower than five
            // seconds logged the user out — durably, because the catch below
            // persists isAuthenticated.
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (!session) {
              if (sessionError && !shouldClearPersistedSession(sessionError, { online: isBrowserOnline() })) {
                // We could not read the session, which is not the same as
                // there not being one. Keep whatever is persisted and just
                // release the gate.
                console.warn('[auth] could not read session; keeping persisted state', sessionError);
                rememberAuthFailure(sessionError);
                set({ isLoading: false });
                return;
              }
              // No token and no excuse: genuinely signed out. This is the leg
              // that keeps the app signoutable.
              set({ user: null, isAuthenticated: false, isLoading: false, needsOnboarding: true, hasCuratorProfile: null, error: null });
              return;
            }

            // Advisory only. Its one unique contribution is the server-fresh
            // scheduled-deletion check below; everything else we need is
            // already on the signed, unexpired JWT payload in session.user. So
            // when the network is down we degrade to the local user rather
            // than treating an unanswered request as a logout.
            const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();

            if (userError && shouldClearPersistedSession(userError, { online: isBrowserOnline() })) {
              set({ user: null, isAuthenticated: false, isLoading: false, needsOnboarding: true, hasCuratorProfile: null, error: null });
              return;
            }
            if (userError) {
              console.warn('[auth] could not verify session with the server; continuing with the local one', userError);
              rememberAuthFailure(userError);
            }

            const user = verifiedUser ?? session.user;

            if (user && session) {
              if (shouldEnforceScheduledDeletion && isScheduledDeletionActive(user.user_metadata as Record<string, unknown>)) {
                const scheduledAt = getScheduledDeletion(user.user_metadata as Record<string, unknown>);
                await runDeliberateSignOut();
                set({
                  user: null,
                  isAuthenticated: false,
                  isLoading: false,
                  needsOnboarding: true,
                  error: `Account is scheduled for deletion on ${new Date(scheduledAt || '').toLocaleString()}. Contact contact@urganize.app to recover.`,
                });
                return;
              }

              // A profiles row is application data; authentication is whether
              // Supabase Auth recognises this JWT. Conflating them meant a
              // Postgres restart, an RLS deploy, or one slow request logged out
              // everyone who reloaded during it.
              let profile: Profile;
              try {
                profile = await getOrCreateProfile(user);
              } catch (profileError) {
                const cached = get().user;
                // The id check is essential: never hand account A's cached
                // profile to account B.
                if (cached && cached.id === user.id) {
                  // Keep the last known-good row rather than signing out or
                  // fabricating a fallback — buildFallbackProfile sets
                  // onboarding_completed: false, which would shove an
                  // established user back into the onboarding wizard.
                  console.warn('[auth] profile read failed; using the cached profile', profileError);
                  persistLastAuthEmail(cached.email || user.email);
                  set({ isAuthenticated: true, isLoading: false, error: null });
                  void ensureActiveAccessOrRedirect(session.access_token, cached.email || user.email);
                  return;
                }
                if (isProfileReadTransientError(profileError)) {
                  // Nothing cached (first load on this device, offline). Do not
                  // invent a profile, and do not call this a logout.
                  console.warn('[auth] profile read failed with nothing cached', profileError);
                  set({ isLoading: false });
                  return;
                }
                throw profileError;
              }

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
                authCheckedAt = Date.now();

                // Best-effort, off the critical path: nothing waits on knowing
                // whether this account also owns playlists.
                void loadCuratorCapability(user, profile).then((hasCuratorProfile) => {
                  set({ hasCuratorProfile });
                });

                // Side-effect: if the user landed in the app without active
                // access (no paid sub, no live trial), bounce them to /locked.
                // The check is best-effort; it does not block checkAuth itself.
                void ensureActiveAccessOrRedirect(session.access_token, profile.email || user.email);
                return;
              }
            }
            
            set({ user: null, isAuthenticated: false, isLoading: false, needsOnboarding: true, hasCuratorProfile: null, error: null });
          } catch (error) {
            if (!shouldClearPersistedSession(error, { online: isBrowserOnline() })) {
              // Could not reach the server, or the lock was stolen out from
              // under us. Neither is evidence about the session, so keep the
              // persisted identity and release the gate. Deliberately no
              // `error` set: a signed-in user should not get a red banner over
              // a network blip. authCheckedAt is deliberately NOT stamped, so
              // the 30s recency guard does not suppress the next attempt.
              console.warn('[auth] session check failed transiently; keeping persisted state', error);
              rememberAuthFailure(error);
              set({ isLoading: false });
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
            await runDeliberateSignOut();
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
          const nextQuery =
            normalizedNextPath && normalizedNextPath.startsWith('/')
              ? `?next=${encodeURIComponent(normalizedNextPath)}`
              : '';

          if (isNativePlatform()) {
            // Redirect to the custom scheme, not the https origin — a plain
            // https redirect would land back in the SYSTEM browser (where we
            // just opened the consent screen), not back inside the app.
            // skipBrowserRedirect keeps supabase-js from navigating the
            // current (webview) window at all; we open the returned
            // authorize URL in the system browser ourselves instead.
            const { Browser } = await import('@capacitor/browser');
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${NATIVE_OAUTH_SCHEME}auth/callback${nextQuery}`,
                skipBrowserRedirect: true,
              },
            });
            if (error) throw error;
            if (data?.url) {
              await Browser.open({ url: data.url });
            }
            return;
          }

          const redirectUrl = `${window.location.origin}/auth/callback${nextQuery}`;
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

      signup: async (
        email: string,
        password: string,
        name: string,
        role: string,
        artistName?: string,
        options?: { pendingInviteToken?: string }
      ) => {
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
                // Durable record of a not-yet-claimed workspace invite. The
                // deferred claim in loadWorkspaceAccessContext reads and
                // clears it — see lib/invite-claims-server.ts.
                pending_invite_token: options?.pendingInviteToken?.trim() || undefined,
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

      // Same "patch the store directly from the update's returned row, no
      // checkAuth() re-fetch needed" shape as updateArtistName above -- but
      // deliberately does NOT toggle the shared `isLoading` flag the way
      // updateArtistName does. That flag also gates whether SettingsPage
      // renders its full-page skeleton, so toggling it mid-save would flash
      // the whole page back to the skeleton for the ~1 request this takes.
      // Callers use their own local isSaving state instead.
      updateProfileName: async (name: string) => {
        const currentUser = get().user;
        const normalized = String(name || '').trim();
        if (!currentUser) throw new Error('User not found');
        if (!normalized) throw new Error('Name is required');

        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ name: normalized, updated_at: new Date().toISOString() })
          .eq('id', currentUser.id)
          .select('*')
          .single();

        if (error) {
          throw new Error(handleSupabaseError(error));
        }

        set({ user: updatedProfile, error: null });
      },

      // "Ask me after tasks": whether completing a task opens the UrgAns
      // check-in sheet. Same direct-update shape as updateProfileName, and
      // for the same reason it stays off the shared isLoading flag.
      updateAskAfterTasks: async (enabled: boolean) => {
        const currentUser = get().user;
        if (!currentUser) throw new Error('User not found');

        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ ask_after_tasks: enabled, updated_at: new Date().toISOString() })
          .eq('id', currentUser.id)
          .select('*')
          .single();

        if (error) {
          throw new Error(handleSupabaseError(error));
        }

        set({ user: updatedProfile, error: null });
      },

      // "Send me motivational nudges" — gates the weekly motivational push
      // (lib/motivation-server.ts). Same direct-update shape as
      // updateAskAfterTasks.
      updateMotivationalNudges: async (enabled: boolean) => {
        const currentUser = get().user;
        if (!currentUser) throw new Error('User not found');

        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ motivational_nudges: enabled, updated_at: new Date().toISOString() })
          .eq('id', currentUser.id)
          .select('*')
          .single();

        if (error) {
          throw new Error(handleSupabaseError(error));
        }

        set({ user: updatedProfile, error: null });
      },

      logout: async () => {
        try {
          // Claim the SIGNED_OUT this is about to emit, so the handler does
          // not mistake a deliberate sign-out for a session we lost.
          pendingSignOutOrigin = 'deliberate';
          const { error } = await supabase.auth.signOut();
          if (error) throw error;

          clearLastAuthEmail();
          invalidateAuthRecency();

          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            needsOnboarding: true,
            hasCuratorProfile: null,
            error: null
          });
        } catch (error) {
          const errorMessage = handleSupabaseError(error);
          console.error('Logout failed:', error);
          set({ error: errorMessage });
        } finally {
          pendingSignOutOrigin = 'unexpected';
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
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') {
      // Fires exactly once when supabase-js finishes restoring the persisted
      // session (with `session: null` when there is none). It is the only
      // event a returning user with a still-fresh token receives, and the
      // store boots with isLoading: true (not persisted) — so this handler
      // must always resolve the loading gate or the '/' redirect never fires.
      if (!session) {
        // No Supabase session: any persisted isAuthenticated is stale.
        invalidateAuthRecency();
        useAuthStore.setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          needsOnboarding: true,
          hasCuratorProfile: null,
          error: null,
        });
        return;
      }
      const { isAuthenticated, user } = useAuthStore.getState();
      if (isAuthenticated && user) {
        // Persisted auth confirmed by a live session — release the gate now;
        // checkAuth below reconciles with the server without flickering the
        // UI (it only shows loading when there is no user yet).
        useAuthStore.setState({ isLoading: false });
      }
      void useAuthStore.getState().checkAuth();
    } else if (event === 'SIGNED_OUT') {
      // Still an unconditional wipe, even when supabase-js decided this on its
      // own: by the time we hear about it _removeSession() has already deleted
      // the token, so keeping isAuthenticated would leave every query running
      // as `anon` — and under RLS that returns empty result sets rather than
      // errors, i.e. a silently blank app with no way out. A login screen is
      // the better failure. What we DO add is an explanation and a count.
      if (pendingSignOutOrigin === 'unexpected') {
        const { isAuthenticated: wasAuthenticated } = useAuthStore.getState();
        const recent =
          lastAuthFailure && Date.now() - lastAuthFailure.at < RECENT_AUTH_FAILURE_MS
            ? lastAuthFailure
            : null;
        if (wasAuthenticated) {
          markSessionExpiredNotice();
        }
        captureAnalyticsEvent({
          name: 'auth_session_lost_unexpectedly',
          properties: {
            was_authenticated: wasAuthenticated,
            ...(recent
              ? { last_failure_kind: recent.kind, last_failure_age_ms: Date.now() - recent.at }
              : {}),
          },
        });
      }
      lastAuthFailure = null;
      invalidateAuthRecency();
      // Cached release-scene data is per-account. Clearing it here (memory AND
      // disk) is what stops account B, signing in on the same device, from
      // seeing a frame of account A's metadata or files.
      resetSceneData();
      // Which scene each release was last showing (lib/scene-memory.ts) is
      // separate from the cached scene DATA above, but the same rule
      // applies: logging out and back in — even in the same tab, same or
      // different account — must always start every release at Activities,
      // never resume whatever was open in the session that just ended.
      resetSceneMemory();
      // Same rule, one level up: a same-tab logout then login is a new
      // arrival, so it gets its one lone-release auto-scope back rather than
      // inheriting "the catalog was asked for" from the session that ended.
      resetCatalogIntent();
      // The cached press kit roster is artist NAMES, so the resetSceneData
      // reasoning above applies to it verbatim: its disk copy is keyed by user
      // id and would miss, but the in-memory copy would survive a same-tab
      // account switch and show account B a frame of account A's roster.
      resetPressKitsStore();
      // And the single-kit payloads behind it — one account's photos and bios,
      // held in memory, which would otherwise survive a same-tab account
      // switch exactly as the roster would.
      clearKitDetailCache();
      // Shows and the artist roster are the same exposure: account A's
      // schedule and artist names in module-level stores that survive a
      // same-tab switch (found 2026-09-25, the UrgAns class of bug).
      resetEventsStore();
      resetArtistRosterStore();
      // The UrgAns conversation is the same exposure in its sharpest form: a
      // whole transcript of account A's questions and answers, kept in a
      // module-level store that a client-side navigation to /auth never
      // tears down. Before this, signing in as account B in the same tab
      // showed account A's chat. Resetting also bumps the store's epoch, so a
      // reply still in flight for account A is dropped when it lands.
      //
      // Chat history goes FIRST, and the order matters: the history store
      // subscribes to the transcript, and would read the reset below as
      // "leaving a chat" and save it again under the account that is signing
      // out. It also wipes the browser copy of account A's chats. Deliberately
      // unconditional (not behind the history flag): a copy left behind by a
      // session when the flag was on must still go.
      resetChappiHistory();
      useChappiStore.getState().resetForSignOut();
      // A first-rollout share offer still waiting (share to socials) names
      // account A's rollout but not account A. Left behind, it would open for
      // account B on the next load, on a rollout B cannot see, and spend B's
      // once-only offer on an error.
      clearPendingFirstShare();
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        needsOnboarding: true,
        hasCuratorProfile: null,
        error: null,
      });
    } else if (event === 'SIGNED_IN') {
      // Always a real verification: a sign-in switches identity, and
      // checkAuth is what runs the access/paywall side-effect.
      useAuthStore.getState().checkAuth({ force: true });
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
