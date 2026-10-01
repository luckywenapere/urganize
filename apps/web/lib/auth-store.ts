// lib/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TAB_MEMORY_STORAGE_KEYS } from '@/lib/tab-memory';
import { ROSTER_CACHE_KEY } from '@/lib/roster-cache';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile, handleSupabaseError } from './supabase/client';
import { errorMessage } from "@/lib/errors";
import { installAccessRedirect } from './access-redirect';
import { isAllowlistedEmail } from './paywall-allowlist';
import { isCardTrialEnabled, resolveCardTrialDestination } from './trial-card';
import { isHardPaywallEnabled } from './hard-paywall-flag';
import { isNativePlatform } from './platform';
import { request as nativeRequest } from './native-bridge';
import { oauthRedirectToPath } from '@urganize/native-bridge';
// Per-account stores register their own sign-out resets (lib/sign-out-resets.ts)
// instead of being imported here, so a page that never loads a store never
// ships it (URG-314). Browser-storage copies are cleared by key below either way.
import { runSignOutResets } from '@/lib/sign-out-resets';
import { SCENE_CACHE_KEY } from '@/lib/scene-cache';
import { clearChatCache } from '@/lib/chappi/conversation-cache-clear';
import {
  canSignInWithApple,
  formatAppleName,
  generateRawNonce,
  linkAppleAccount,
  sha256Hex,
} from './apple-sign-in';
import { resetSceneMemory } from '@/lib/scene-memory';
import { resetCatalogIntent } from '@/lib/catalog-intent';
import { clearDeferredFirstShare, clearFirstSession } from '@/lib/first-run-storage';
import { clearLoginCookie, setLoginCookie } from '@/lib/login-cookie';
import {
  classifyAuthFailure,
  isProfileReadTransientError,
  shouldClearPersistedSession,
  type AuthFailureKind,
} from '@/lib/auth-failure';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { clearAppCaches } from '@/lib/offline/register';
import { isRecentSignupCooldown } from '@/lib/signup-cooldown';
import { wallpaperUpdate, type HomeWallpaper } from '@/lib/home-desktop/wallpaper';

// Custom URL scheme registered by the Expo shell (apps/mobile/app.config.ts,
// `scheme`) — see docs/mobile/auth-setup.md. Google
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
  '/add-card',
  // Self-serve checkout (2026-10-22): paying is how a held account gets in.
  '/checkout',
  // Closed sign-up's invite link page (/start/<code>), 2026-10-15.
  '/start',
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
  // No early return on the three switches any more: closed sign-up
  // (2026-10-15) is always on, so every login asks the server whether this
  // account has been let in.
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
      accessApproved?: boolean;
    };

    // Closed sign-up first: an account nobody has let in is held, whatever its
    // billing state. Only an explicit false bounces (a stale server omits it).
    if (payload.accessApproved === false) {
      window.location.replace('/locked?reason=not_approved');
      return;
    }

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

/**
 * The profile row read. With an access token it sends that token itself, so
 * it skips supabase.auth.getSession() and its lock (lib/supabase/client.ts):
 * checkAuth starts it alongside getUser() instead of after it (URG-314).
 */
const readProfileRow = (userId: string, accessToken?: string) => {
  const query = supabase.from('profiles').select('*').eq('id', userId);
  if (accessToken) query.setHeader('Authorization', `Bearer ${accessToken}`);
  return query.single();
};
type ProfileRowRead = Awaited<ReturnType<typeof readProfileRow>>;

/** Start a profile read now (PostgREST builders are lazy until awaited). */
const startProfileRead = (userId: string, accessToken: string): Promise<ProfileRowRead> => {
  const started = Promise.resolve(readProfileRow(userId, accessToken));
  // Whoever uses it awaits it; this only keeps an unused one quiet.
  started.catch(() => undefined);
  return started;
};

const getOrCreateProfile = async (
  authUser: User,
  firstRead?: Promise<ProfileRowRead>
): Promise<Profile> => {
  const { data: profile, error: profileError } = await (firstRead ?? readProfileRow(authUser.id));

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

/**
 * What signup() did. `confirmation_sent` means the project requires email
 * confirmation: there is an account but no session yet, and the caller shows
 * Check your inbox instead of carrying on (URG-386). An address that already
 * has an account answers the same way, so the screen never reveals it.
 */
export type SignupResult = { status: 'signed_in' } | { status: 'confirmation_sent'; email: string };

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
  /** Resolves true when signed in (the page is then navigating on), false
   * when the person closed Apple's sheet. */
  loginWithApple: (nextPath?: string) => Promise<boolean>;
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
      /** Extra user_metadata for the resume after the confirmation email
       * (URG-386): onboarding_draft, curator_join_code,
       * pending_access_code, pending_welcome_token. */
      metadata?: Record<string, unknown>;
    }
  ) => Promise<SignupResult>;
  updateArtistName: (artistName: string) => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  updateAskAfterTasks: (enabled: boolean) => Promise<void>;
  updateAiConsent: (agreed: boolean) => Promise<void>;
  updateMotivationalNudges: (enabled: boolean) => Promise<void>;
  /** The morning brief's off switch (#1207). */
  updateMorningBrief: (enabled: boolean) => Promise<void>;
  updateHomeWallpaper: (wallpaper: HomeWallpaper) => Promise<void>;
  /** URG-260: the Settings view override; null goes back to automatic. */
  updateRoleView: (view: Profile['role_view']) => Promise<void>;
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

            // A reload with this same account saved on the device: open the
            // gate now so the saved rollouts and artists paint at once instead
            // of waiting for the two network checks below (founder, Nov 2,
            // 2026: "users don't have to wait"). Only for the SAME account the
            // live session belongs to, never another's; the checks below still
            // run and can still sign out (a revoked session, a scheduled
            // deletion), which clears everything.
            {
              const saved = get();
              if (saved.isLoading && saved.isAuthenticated && saved.user && saved.user.id === session.user.id) {
                set({ isLoading: false });
              }
            }

            // The profile read needs only the user id and token already on
            // the session, so it starts now and overlaps the getUser() round
            // trip below instead of queueing behind it (URG-314). It is a
            // plain read with its own token header, so it takes no auth lock
            // (see the SEQUENTIAL note above). Anything that WRITES — creating
            // a missing profile — still waits for getUser() inside
            // getOrCreateProfile, and the read is only used if getUser()
            // confirms the same user.
            const profileRead = startProfileRead(session.user.id, session.access_token);

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
                profile = await getOrCreateProfile(
                  user,
                  user.id === session.user.id ? profileRead : undefined
                );
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
            // current (webview) window at all; the shell opens the authorize
            // URL in an auth session (expo-web-browser) and hands back the
            // URL it was redirected to.
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${NATIVE_OAUTH_SCHEME}auth/callback${nextQuery}`,
                skipBrowserRedirect: true,
              },
            });
            if (error) throw error;
            if (!data?.url) throw new Error('Could not start Google sign-in.');

            // The consent screen waits on a person, so the ceiling is long.
            const result = await nativeRequest(
              'oauth',
              { url: data.url, redirectPrefix: NATIVE_OAUTH_SCHEME },
              { timeoutMs: 600_000 }
            );
            if (result.outcome === 'cancelled') {
              set({ isLoading: false });
              return;
            }
            // Hand the redirect to the existing /auth/callback page, which
            // already does the PKCE and hash-token exchange — the code verifier
            // it needs is in this webview's storage.
            const path = oauthRedirectToPath(result.redirectUrl, NATIVE_OAUTH_SCHEME);
            if (!path) throw new Error('Google sign-in returned somewhere unexpected.');
            window.location.href = path;
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

      // Sign in with Apple (Apple rule 4.8). Inside the iPhone app only: the
      // shell shows Apple's own sheet and hands back an identity token, which
      // Supabase verifies against the raw nonce kept here. Then it joins the
      // same path every other sign-in takes, /auth/callback, which creates the
      // profile and decides where to land.
      loginWithApple: async (nextPath = '/dashboard') => {
        try {
          if (!isNativePlatform() || !canSignInWithApple()) {
            throw new Error('Sign in with Apple is only available in the iPhone app.');
          }
          set({ isLoading: true, error: null });

          const rawNonce = generateRawNonce();
          const hashedNonce = await sha256Hex(rawNonce);
          const result = await nativeRequest(
            'appleSignIn',
            { hashedNonce },
            { timeoutMs: 600_000 }
          );
          if (result.outcome === 'cancelled') {
            set({ isLoading: false });
            return false;
          }

          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: result.identityToken,
            nonce: rawNonce,
          });
          if (error) throw error;

          // Apple gives the name only on the very first sign-in, so it is saved
          // now; /auth/callback builds the profile from this. Best effort: a
          // missing name falls back to the email, it never blocks sign-in.
          const fullName = formatAppleName(result);
          if (fullName) {
            await supabase.auth
              .updateUser({ data: { full_name: fullName, name: fullName } })
              .catch(() => undefined);
          }
          if (result.authorizationCode && data.session?.access_token) {
            void linkAppleAccount(data.session.access_token, result.authorizationCode);
          }

          const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
          window.location.href = `/auth/callback${nextQuery}`;
          return true;
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
        options?: { pendingInviteToken?: string; metadata?: Record<string, unknown> }
      ): Promise<SignupResult> => {
        try {
          set({ isLoading: true, error: null });
          const normalizedArtistName = String(artistName || '').trim();
          if (role === 'artist' && !normalizedArtistName) {
            throw new Error('Artist name is required for Artist accounts');
          }

          const normalizedEmail = email.trim().toLowerCase();
          const { data, error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              // Where the confirmation link lands when the project requires
              // one (URG-386). Ignored while autoconfirm is on.
              ...(typeof window !== 'undefined'
                ? { emailRedirectTo: `${window.location.origin}/auth/callback` }
                : {}),
              data: {
                ...(options?.metadata || {}),
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

          if (signUpError) {
            // A second tap within Supabase's per-address cooldown ("For security
            // purposes, you can only request this after 4 seconds.") means a
            // confirmation link for this address went out seconds ago: the
            // person's next step is their inbox, not a raw error.
            if (isRecentSignupCooldown(signUpError)) {
              persistLastAuthEmail(normalizedEmail);
              set({ isLoading: false, error: null });
              return { status: 'confirmation_sent', email: normalizedEmail };
            }
            throw signUpError;
          }

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
                  return { status: 'signed_in' };
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
                  return { status: 'signed_in' };
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
            // Email confirmation is on: an account exists, no session yet.
            // Not an error (it used to be a red "Please check your email to
            // verify your account" that callers carried on past). The caller
            // shows Check your inbox. Supabase answers an address that already
            // has an account the same way (identities: []), so that case
            // reads identically and never leaks that the account exists.
            persistLastAuthEmail(normalizedEmail);
            set({ isLoading: false, error: null });
            return { status: 'confirmation_sent', email: normalizedEmail };
          }
          return { status: 'signed_in' };
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

      // AI permission (Apple 5.1.2(i)): stamps the moment this person agreed to
      // send their words to our AI partners, or clears it when they withdraw.
      // Same direct own-row update as updateAskAfterTasks.
      updateAiConsent: async (agreed: boolean) => {
        const currentUser = get().user;
        if (!currentUser) throw new Error('User not found');

        const now = new Date().toISOString();
        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ ai_consent_at: agreed ? now : null, updated_at: now })
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

      // The morning brief's off switch (#1207). Same shape as above.
      updateMorningBrief: async (enabled: boolean) => {
        const currentUser = get().user;
        if (!currentUser) throw new Error('User not found');

        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ morning_brief: enabled, updated_at: new Date().toISOString() })
          .eq('id', currentUser.id)
          .select('*')
          .single();

        if (error) {
          throw new Error(handleSupabaseError(error));
        }

        set({ user: updatedProfile, error: null });
      },

      // Home wallpaper (#1305): the person's own pick, on their own row. The
      // pick shows at once and is put back if the save fails.
      updateHomeWallpaper: async (wallpaper: HomeWallpaper) => {
        const currentUser = get().user;
        if (!currentUser) throw new Error('User not found');

        const now = new Date().toISOString();
        const change = wallpaperUpdate(wallpaper, currentUser, now);
        set({ user: { ...currentUser, ...change } });

        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ ...change, updated_at: now })
          .eq('id', currentUser.id)
          .select('*')
          .single();

        if (error) {
          // Only undo our own change: another save may have landed meanwhile.
          const latest = get().user;
          if (latest && latest.id === currentUser.id) {
            set({
              user: {
                ...latest,
                home_wallpaper: currentUser.home_wallpaper,
                home_wallpaper_set_at: currentUser.home_wallpaper_set_at,
              },
            });
          }
          throw new Error(handleSupabaseError(error));
        }

        set({ user: updatedProfile, error: null });
      },

      // Role-based views (URG-260): the per-user override Settings saves, on
      // the user's own profiles row. Same direct-update shape as
      // updateAskAfterTasks (user-writable under the existing profiles RLS).
      updateRoleView: async (view: Profile['role_view']) => {
        const currentUser = get().user;
        if (!currentUser) throw new Error('User not found');

        const { data: updatedProfile, error } = await supabase
          .from('profiles')
          .update({ role_view: view ?? null, updated_at: new Date().toISOString() })
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
        // The marketing site's signed-in hint goes with it.
        clearLoginCookie();
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
      // A live session: tell the marketing site. This is also what gives
      // everyone already signed in the cookie, with no re-login.
      setLoginCookie();
      const { isAuthenticated, user } = useAuthStore.getState();
      if (isAuthenticated && user) {
        // Persisted auth confirmed by a live session — release the gate now;
        // checkAuth below reconciles with the server without flickering the
        // UI (it only shows loading when there is no user yet).
        useAuthStore.setState({ isLoading: false });
      }
      void useAuthStore.getState().checkAuth();
    } else if (event === 'SIGNED_OUT') {
      // Nothing one account's session cached may survive into the next
      // account's on this device (2026-10-15, URG-314): the service worker's
      // page caches go with the session, whoever initiated the sign-out.
      void clearAppCaches();
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
      // The marketing site must stop treating this browser as signed in.
      clearLoginCookie();
      invalidateAuthRecency();
      // Every per-account store that loaded in this tab forgets its data
      // (lib/sign-out-resets.ts lists them and the order they run in). A store
      // that never loaded holds nothing in memory, so it has nothing to reset.
      //
      // Why each one matters: account B signing in on the same tab must never
      // see a frame of account A's data. Release scenes (metadata, files), the
      // press kit roster and single-kit payloads (artist names, photos, bios),
      // shows, the artist roster, relationships, opportunities, spend access,
      // the UrgAns transcript and its saved chats (history first: it would
      // otherwise read the transcript reset as leaving a chat and save it
      // again under the account signing out), the catalog, its tasks and
      // activity feed (and their recency clocks, so the next load is real),
      // and Home's role, state and brief. All are module-level stores that a
      // client-side navigation to /auth never tears down (the UrgAns class of
      // bug, found 2026-09-25).
      runSignOutResets();
      // What lives in browser storage outlives the tab, so it is cleared by
      // key on every sign-out whether or not its store loaded here.
      // Cached release-scene data (the disk copy of the scene store above).
      try {
        window.localStorage.removeItem(SCENE_CACHE_KEY);
      } catch {
        // Blocked storage: memory is already cleared, which is what matters.
      }
      // Where Home was left and which rollout chat was open (Nov 2, 2026):
      // cleared by key, since their stores may never have loaded here (a
      // computer has no swipe shell). Codex review on #1029.
      try {
        for (const key of TAB_MEMORY_STORAGE_KEYS) window.sessionStorage.removeItem(key);
      } catch {
        // Blocked storage: nothing was kept.
      }
      // The saved artist roster (Nov 2, 2026), whether or not its store loaded.
      try {
        window.localStorage.removeItem(ROSTER_CACHE_KEY);
      } catch {
        // Blocked storage: nothing was kept.
      }
      // The browser copy of account A's UrgAns chats. Deliberately
      // unconditional (not behind the history flag): a copy left behind by a
      // session when the flag was on must still go.
      clearChatCache();
      // Which scene each release was last showing (lib/scene-memory.ts):
      // logging out and back in must always start every release at
      // Activities, never resume whatever was open in the session that ended.
      resetSceneMemory();
      // Same rule, one level up: a same-tab logout then login is a new
      // arrival, so it gets its one lone-release auto-scope back rather than
      // inheriting "the catalog was asked for" from the session that ended.
      resetCatalogIntent();
      // A first-rollout share offer still waiting for the next visit (share
      // to socials) names account A's rollout. It is keyed to A, so B would
      // never see it, but another person may use this browser next.
      clearDeferredFirstShare();
      // Same for the first-session record onboarding leaves (lib/first-session.ts):
      // it names account A's rollout and holds A's deferred share offer.
      clearFirstSession();
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        needsOnboarding: true,
        hasCuratorProfile: null,
        error: null,
      });
    } else if (event === 'SIGNED_IN') {
      setLoginCookie();
      // Always a real verification: a sign-in switches identity, and
      // checkAuth is what runs the access/paywall side-effect.
      useAuthStore.getState().checkAuth({ force: true });
    } else if (event === 'TOKEN_REFRESHED') {
      // Renews the cookie's max-age so it outlives an active session.
      setLoginCookie();
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
