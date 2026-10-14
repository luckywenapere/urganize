'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH, resolveHomePath } from '@/lib/home-path';
import { ONBOARDING_SETUP_PATH, isCardTrialEnabled } from '@/lib/trial-card';
import type { Profile } from '@/lib/supabase/client';

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

export default function AuthCallbackPage() {
  const router = useRouter();
  const { checkAuth } = useAuthStore();
  const handledRef = useRef(false);

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
        const next = url.searchParams.get('next');
        const safeNext = next && next.startsWith('/') ? next : HOME_PATH;

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
          router.replace('/auth?error=callback_no_session');
          return;
        }

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
        const hasExplicitNext = Boolean(next && next.startsWith('/'));
        // /auth calls loginWithGoogle(searchParams.next || HOME_PATH), so a
        // plain Google sign-in ALWAYS arrives carrying next=/dashboard — the
        // default filler, not a destination anyone asked for. Treat only a
        // next that points somewhere ELSE as purposeful: the /onboarding OAuth
        // round trip, the curator join flow and the invite email link all
        // carry their own path and keep winning outright.
        const hasPurposefulNext = hasExplicitNext && safeNext !== HOME_PATH;
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
              : resolveHomePath(profile?.role);

        window.clearTimeout(timeout);
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

  return <LoadingScreen title="Finishing sign-in" />;
}
