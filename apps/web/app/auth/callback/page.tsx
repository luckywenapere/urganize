'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { accessIntentFromToken, hasPendingAccessIntent, redeemPendingAccess } from '@/lib/access-intent';
import { CURATOR_HOME_PATH, HOME_PATH, isDefaultLandingPath } from '@/lib/home-path';
import { defaultSignInPath } from '@/lib/music-host';
import {
  EMAIL_CONFIRMED_FLAG_KEY,
  EMAIL_CONFIRMED_PARAM,
  amrMethodsFromAccessToken,
  clearPendingConfirmation,
  firstNameOf,
  fromMetadataDraft,
  isDeadLinkError,
  isEmailLinkSignIn,
  normalizeEmail,
  readAuthRedirectError,
  isSafeNextPath,
  readPendingConfirmation,
  writePendingConfirmation,
  type PendingConfirmation,
} from '@/lib/email-confirmation';
import { emailResumeClaimedHere } from '@/lib/email-confirmation-client';
import { CheckInbox, LinkExpired, YoureIn } from '@/components/auth/EmailConfirmation';
import { ONBOARDING_SETUP_PATH, isCardTrialEnabled } from '@/lib/trial-card';
import type { Profile } from '@/lib/supabase/client';
import { PENDING_CHECKOUT_METADATA_KEY, checkoutPath, readPendingCheckout } from '@/lib/self-serve';

const CARD_TRIAL_ENABLED = isCardTrialEnabled();

/**
 * Should this just-signed-in account be sent through the onboarding wizard
 * before the app? Only for an account that has genuinely never finished it AND
 * that the server says still owes the card step — the server read is what
 * keeps pre-cutoff accounts, invited teammates and curators out of the wizard,
 * since only it can evaluate TRIAL_CARD_SIGNUP_CUTOFF (a server-only env var)
 * and workspace membership.
 *
 * Skips the request entirely for the common case (already onboarded), so a
 * returning user's sign-in pays nothing for this. Any failure — non-OK, a
 * throw, or the 2.5s abort — returns false and lands them in the app, where
 * CardTrialGate consults the same endpoint without a deadline. Falling through
 * to the app is the safe direction: the gate still routes them correctly, they
 * just see the app for a moment first.
 */
async function shouldSendToOnboardingSetup(profile: Profile | null): Promise<boolean> {
  // No longer gated on the card trial (Oct 14, 2026): a brand-new Google
  // sign-up from /auth must still get onboarding v2. The server decides via
  // onboardingSetupRequired (fresh profile, not onboarded, not a teammate or
  // curator), so established accounts never get pulled into the wizard.
  if (profile?.onboarding_completed !== false) return false;
  if (String(profile?.role || '').toLowerCase() === 'curator') return false;

  const controller = new AbortController();
  // Bounded well inside the 7s callback watchdog above: this must never be
  // what turns a successful sign-in into ?error=callback_timeout.
  const abortTimer = window.setTimeout(() => controller.abort(), 2500);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    const response = await fetch('/api/subscription-status?onboardingCheck=1', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const payload = (await response.json().catch(() => ({}))) as {
      cardTrialRequired?: boolean;
      onboardingSetupRequired?: boolean;
    };
    return (CARD_TRIAL_ENABLED && payload.cardTrialRequired === true) || payload.onboardingSetupRequired === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(abortTimer);
  }
}

// Roles a signup may carry in auth metadata. 'curator' is here so a playlist
// owner signing in with Google keeps their role through this fallback upsert
// instead of being written back to 'artist-manager'.
const ALLOWED_ROLES = new Set(['artist', 'manager', 'artist-team', 'artist-manager', 'curator']);

// "You're in" stays up at least this long so it reads (v2 mock 3).
const YOURE_IN_HOLD_MS = 1200;

const LAST_AUTH_EMAIL_KEY = 'urganize.last_auth_email';

function readLastAuthEmail(): string {
  try {
    return normalizeEmail(window.localStorage.getItem(LAST_AUTH_EMAIL_KEY));
  } catch {
    return '';
  }
}

type CallbackView =
  | { kind: 'working' }
  | { kind: 'youre-in'; firstName: string }
  | { kind: 'expired'; pending: PendingConfirmation | null; email: string }
  | { kind: 'check-inbox'; email: string; sentAt: number; firstName: string; releaseTitle: string };

/**
 * Email confirmation (URG-386): a confirmed email/password sign-up finishes
 * what its sign-up started. The answers ride in user_metadata, so this works
 * on any device: a team invite or a curator link is redeemed here, and an
 * onboarding sign-up goes to /onboarding to build its rollout. Null when the
 * account has nothing waiting.
 */
async function finishConfirmedSignup(
  accessToken: string,
  metadata: Record<string, unknown>
): Promise<string | null> {
  const curatorCode = typeof metadata.curator_join_code === 'string' ? metadata.curator_join_code.trim() : '';
  if (curatorCode) {
    try {
      const displayName = typeof metadata.name === 'string' ? metadata.name.trim() : '';
      const response = await fetch(`/api/curator/join/${encodeURIComponent(curatorCode)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(displayName ? { displayName } : {}),
      });
      if (response.ok) {
        try {
          await useAuthStore.getState().checkAuth({ force: true });
        } catch {
          // /curator re-checks on mount.
        }
        return CURATOR_HOME_PATH;
      }
    } catch {
      // Fall through to the join page, where the signed-in account can use the link.
    }
    return `/curator/join/${encodeURIComponent(curatorCode)}`;
  }

  const inviteToken =
    typeof metadata.pending_invite_token === 'string' ? metadata.pending_invite_token.trim() : '';
  if (inviteToken) {
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(inviteToken)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) return HOME_PATH;
    } catch {
      // The deferred claim (lib/invite-claims-server.ts) still finishes the join.
    }
    return `/invite/accept?token=${encodeURIComponent(inviteToken)}`;
  }
  return null;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { checkAuth } = useAuthStore();
  const handledRef = useRef(false);
  const [view, setView] = useState<CallbackView>({ kind: 'working' });

  const isAbortError = (error: unknown) => {
    const name = String((error as { name?: string } | null)?.name || '').toLowerCase();
    const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
    return name === 'aborterror' || message.includes('aborted') || message.includes('operation was aborted');
  };

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const handleCallback = async () => {
      const timeout = window.setTimeout(() => {
        router.replace('/auth?error=callback_timeout');
      }, 7000);

      try {
        const url = new URL(window.location.href);
        // Read before anything else: auth-js clears the hash once it stores a
        // session. An error (expired or used link) is never cleared.
        const redirectError = readAuthRedirectError(window.location.href);
        const hashType = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type');
        const next = url.searchParams.get('next');
        // Same-origin paths only: "//evil.example" and "/\\evil.example" start
        // with "/" but leave the site (open redirect), so they fall back home.
        const safeNext = isSafeNextPath(next) ? next : HOME_PATH;

        // Handle PKCE/code flow if present.
        const code = url.searchParams.get('code');
        if (code) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) {
            console.error('Auth callback exchangeCodeForSession error:', codeError);
          }
        }

        // Handle hash token flow if present.
        const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            console.error('Auth callback setSession error:', setSessionError);
          }
        }

        let session = (await supabase.auth.getSession()).data.session;
        if (!session && accessToken) {
          // One short retry for eventual consistency after OAuth hash handling.
          await new Promise((resolve) => setTimeout(resolve, 150));
          session = (await supabase.auth.getSession()).data.session;
        }

        if (!session) {
          // An expired or already-used confirmation link (URG-386). It used to
          // fall through to "Google sign-in did not finish". A used link in a
          // browser that is already signed in has a session and carries on.
          if (isDeadLinkError(redirectError)) {
            window.clearTimeout(timeout);
            const pending = readPendingConfirmation();
            setView({ kind: 'expired', pending, email: pending?.email || readLastAuthEmail() });
            return;
          }
          router.replace('/auth?error=callback_no_session');
          return;
        }

        const metadata = (session.user.user_metadata || {}) as Record<string, unknown>;
        // A confirmation link that just worked: no redirect error (a reused
        // link in an already signed-in browser carries one and routes as a
        // plain sign-in), an email-link session, and an address confirmed in
        // the last day (so a later magic link never replays the sign-up).
        const confirmedAtMs = Date.parse(String(session.user.email_confirmed_at || session.user.confirmed_at || ''));
        const confirmedByEmail =
          !redirectError &&
          Number.isFinite(confirmedAtMs) &&
          Date.now() - confirmedAtMs < 24 * 60 * 60 * 1000 &&
          isEmailLinkSignIn({
            hashType,
            provider: typeof session.user.app_metadata?.provider === 'string' ? session.user.app_metadata.provider : null,
            amrMethods: amrMethodsFromAccessToken(session.access_token),
          });
        const youreInSince = confirmedByEmail ? Date.now() : 0;
        if (confirmedByEmail) {
          // Signed in now; nothing below may turn this into a timeout error.
          window.clearTimeout(timeout);
          const pendingForName = readPendingConfirmation();
          setView({
            kind: 'youre-in',
            firstName: pendingForName?.firstName || firstNameOf(typeof metadata.name === 'string' ? metadata.name : ''),
          });
        }
        const holdYoureIn = async () => {
          if (!youreInSince) return;
          const left = YOURE_IN_HOLD_MS - (Date.now() - youreInSince);
          if (left > 0) await new Promise((resolve) => window.setTimeout(resolve, left));
        };

        // Profile sync should not block login completion.
        const fallbackName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User';
        const roleFromMetadata = session.user.user_metadata?.role;
        const fallbackRole =
          typeof roleFromMetadata === 'string' && ALLOWED_ROLES.has(roleFromMetadata)
            ? roleFromMetadata
            : 'artist-manager';
        const profilePayload = {
          id: session.user.id,
          name: fallbackName,
          role: fallbackRole,
          ...(session.user.email ? { email: session.user.email } : {}),
        };
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'id', ignoreDuplicates: true });
        if (upsertError) {
          // PostgrestError from supabase-js exposes code/details/hint directly.
          console.warn('Profile sync warning:', {
            message: upsertError.message,
            code: upsertError.code,
            details: upsertError.details,
            hint: upsertError.hint,
          });
        }

        try {
          await checkAuth({ force: true });
        } catch (error) {
          if (!isAbortError(error)) {
            throw error;
          }
        }

        // Closed sign-up (2026-10-15): a /start/<code> invite or a founder
        // /welcome link this browser kept across the Google round trip is
        // redeemed now, before anything asks the server for access. Nothing
        // routes on the answer here: an invited teammate is let in by the
        // invite accept that runs next, and a held account is taken to the
        // "You're on the list" screen by the gate itself.
        const tokenIntent = accessIntentFromToken(session.access_token);
        if (hasPendingAccessIntent() || (confirmedByEmail && (tokenIntent.code || tokenIntent.welcomeToken))) {
          await redeemPendingAccess(session.access_token);
        }

        if (url.searchParams.get('reauth') === '1') {
          // Best-effort only — a restricted storage context (some embedded
          // webviews) throwing here must not fail a sign-in that otherwise
          // succeeded; the outer catch below would wrongly redirect to
          // /auth?error=callback_failed for what is just a missed timestamp.
          try {
            localStorage.setItem('urganize.reauth.ts', String(Date.now()));
          } catch {
            // Ignore — nothing downstream depends on this succeeding.
          }
        }

        // Role-aware landing: a curator cannot open any dashboard route, so
        // HOME_PATH would bounce them straight back out. checkAuth above has
        // already hydrated the profile, so the store is the freshest read here.
        // An explicit `next` still wins — that is how the curator join flow
        // returns to its own page after the OAuth round trip.
        if (confirmedByEmail) {
          // What the sign-up was for, finished now that the email is confirmed.
          // Self-serve checkout (2026-10-22): someone who picked a plan and
          // signed up with email comes straight back to pay for it, on any
          // device (the plan is in their account metadata).
          const pendingCheckout = readPendingCheckout({
            [PENDING_CHECKOUT_METADATA_KEY]: metadata[PENDING_CHECKOUT_METADATA_KEY],
          });
          if (pendingCheckout) {
            clearPendingConfirmation();
            await holdYoureIn();
            router.replace(checkoutPath(pendingCheckout));
            return;
          }
          const finished = await finishConfirmedSignup(session.access_token, metadata);
          if (finished) {
            clearPendingConfirmation();
            await holdYoureIn();
            router.replace(finished);
            return;
          }
          // An onboarding sign-up builds its rollout on /onboarding, which
          // keeps showing "You're in" while it does (mock 3). Same browser:
          // the answers are in localStorage; any other device: in metadata.
          const pending = readPendingConfirmation();
          const localResume =
            pending?.onboarding && pending.email === normalizeEmail(session.user.email) ? pending.onboarding : null;
          const metadataResume = fromMetadataDraft(metadata.onboarding_draft);
          const onboardingDone = useAuthStore.getState().user?.onboarding_completed === true;
          if (!onboardingDone && (localResume || metadataResume) && !emailResumeClaimedHere(session.user.id)) {
            try {
              window.sessionStorage.setItem(EMAIL_CONFIRMED_FLAG_KEY, '1');
            } catch {
              // The ?confirmed=1 below carries the same signal.
            }
            router.replace(`/onboarding?${EMAIL_CONFIRMED_PARAM}=1`);
            return;
          }
          if (pending && pending.kind !== 'onboarding') clearPendingConfirmation();
        }

        const hasExplicitNext = isSafeNextPath(next);
        // /auth calls loginWithGoogle(searchParams.next || HOME_PATH), so a
        // plain Google sign-in ALWAYS arrives carrying next=/dashboard — the
        // default filler, not a destination anyone asked for. Treat only a
        // next that points somewhere ELSE as purposeful: the /onboarding OAuth
        // round trip, the curator join flow and the invite email link all
        // carry their own path and keep winning outright.
        const hasPurposefulNext = hasExplicitNext && !isDefaultLandingPath(safeNext);
        const profile = useAuthStore.getState().user;
        // Card-before-trial: a Google sign-in straight from /auth has an
        // account but has never been through onboarding — nothing routes it
        // there, unlike the email funnel, which starts there. Send it to the
        // wizard so it gets its first release and plan before billing, instead
        // of landing in the app (where the card gate would wall it cold) or on
        // /start-trial (paying before seeing anything).
        //
        // This is a SHORTCUT, not the gate: CardTrialGate would reach the same
        // wizard from /dashboard anyway, but only after a flash of the app and
        // its create-release modal. Skipping that flash is the whole point of
        // deciding here.
        //
        // A purposeful `next` always wins (see hasPurposefulNext above), so
        // the /onboarding OAuth round trip and the curator join flow are
        // untouched — both arrive carrying their own path.
        const destination = hasPurposefulNext
          ? safeNext
          : (await shouldSendToOnboardingSetup(profile))
            ? ONBOARDING_SETUP_PATH
            : hasExplicitNext
              ? safeNext
              : defaultSignInPath(window.location.host);

        window.clearTimeout(timeout);
        await holdYoureIn();
        router.replace(destination);
      } catch (error) {
        console.error('Auth callback fatal error:', error);
        if (isAbortError(error)) {
          // Retry once on aborted callbacks.
          setTimeout(() => {
            router.replace('/auth/callback');
          }, 120);
          return;
        }
        window.clearTimeout(timeout);
        router.replace('/auth?error=callback_failed');
      }
    };

    handleCallback();
  }, [router, checkAuth]);

  if (view.kind === 'youre-in') {
    return <YoureIn firstName={view.firstName} subline={null} />;
  }
  if (view.kind === 'expired') {
    const pending = view.pending;
    return (
      <LinkExpired
        email={view.email || null}
        releaseTitle={pending?.releaseTitle}
        onSent={(email, sentAt) => {
          const firstName = pending?.email === email ? pending.firstName || '' : '';
          const releaseTitle = pending?.email === email ? pending.releaseTitle || '' : '';
          if (!pending || pending.email !== email) {
            writePendingConfirmation({ email, sentAt, kind: 'login' });
          }
          setView({ kind: 'check-inbox', email, sentAt, firstName, releaseTitle });
        }}
        onChangeEmail={() => {
          router.replace(
            pending?.kind === 'onboarding'
              ? `/onboarding?email=${encodeURIComponent(view.email)}&change=1`
              : `/auth?email=${encodeURIComponent(view.email)}`
          );
        }}
      />
    );
  }
  if (view.kind === 'check-inbox') {
    return (
      <CheckInbox
        email={view.email}
        firstName={view.firstName}
        releaseTitle={view.releaseTitle}
        sentAt={view.sentAt}
        onChangeEmail={() => {
          const pending = readPendingConfirmation();
          router.replace(
            pending?.kind === 'onboarding'
              ? `/onboarding?email=${encodeURIComponent(view.email)}&change=1`
              : `/auth?email=${encodeURIComponent(view.email)}`
          );
        }}
      />
    );
  }
  return <LoadingScreen title="Finishing sign-in" />;
}
