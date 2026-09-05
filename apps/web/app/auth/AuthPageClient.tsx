'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SESSION_EXPIRED_NOTICE_KEY, useAuthStore } from '@/lib/auth-store';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { HOME_PATH } from '@/lib/home-path';
import { openExternalUrl } from '@/lib/external-link';
import { Input } from '@urganize/ui';
import { LogoIcon } from '@urganize/ui';
import { LoadingScreen } from '@urganize/ui';
import { Mail, Lock } from 'lucide-react';
import { errorMessage } from "@/lib/errors";

// /auth is the single front door for BOTH sides of the account line, in the
// stacked-pill layout: logo, heading, "Continue with Google", "Continue with
// Email". The email path is identifier-first — the visitor enters only their
// email and clicks Continue; /api/auth/providers then says whether that email
// has an account. Registered → the password field appears under the email
// field. Not registered → we hand the email to /onboarding (the organic
// signup home) so they never retype it. Invited teammates still flow through
// /invite/accept (token-based, no email-match dependency), and ?mode=signup
// is preserved as a query parameter only so old bookmarks land somewhere.
//
// The lookup is a ROUTER here, not a wall (founder bug report, 2026-07-23:
// when the old provider hint was wrong it locked the password field away
// entirely). Two consequences: a lookup failure fails OPEN — password field
// shown, plus a signup link so a genuinely-new person still has a path — and
// a "created with Google" answer only adds a suggestion above a password
// field that stays usable.
type EmailStage = 'hidden' | 'collect' | 'password';
type EmailAccountLookup = 'none' | 'password' | 'google-only' | 'unknown';
const LAST_AUTH_EMAIL_KEY = 'urganize.last_auth_email';
// Written by the pre-hydration probe in app/layout.tsx, read by the CSS gate in
// app/globals.css, cleared here once Supabase confirms there is no session.
const SESSION_HINT_ATTRIBUTE = 'data-auth-session';
// Same founder-support destination global-error.tsx and the support pill use.
const SUPPORT_WHATSAPP_URL = 'https://wa.me/2347067367057';
const normalizeAuthEmail = (value: string) => value.trim().toLowerCase();

// Both entrance pills share one look so Google and email read as equals, the
// reference layout's whole point. Surface + border rather than a filled brand
// pill because in light mode bg-surface is byte-identical to the page ground —
// the border is what makes the pill exist there.
const entrancePillClass =
  'flex w-full items-center justify-center gap-3 rounded-full border border-stroke-default bg-bg-surface px-5 py-3.5 text-lg font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50';
const primaryPillClass =
  'flex w-full items-center justify-center rounded-full bg-brand px-5 py-3.5 text-lg font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50';

const lookupEmailAccount = async (normalizedEmail: string): Promise<EmailAccountLookup> => {
  try {
    const response = await fetch('/api/auth/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    if (!response.ok) throw new Error('account_lookup_failed');
    const payload = (await response.json()) as {
      exists?: boolean;
      hasGoogle?: boolean;
      hasEmailProvider?: boolean;
    };

    // Only an EXPLICIT "no account" routes to signup — anything short of that
    // certainty falls open to the password field. `exists` missing means a
    // stale server bundle mid-deploy; derive what the legacy shape can prove
    // and treat the rest as unknown rather than bouncing a real user into
    // signup.
    if (payload.exists === false) return 'none';
    if (payload.exists === true) {
      return payload.hasGoogle && !payload.hasEmailProvider ? 'google-only' : 'password';
    }
    if (payload.hasGoogle) return payload.hasEmailProvider ? 'password' : 'google-only';
    if (payload.hasEmailProvider) return 'password';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

export default function AuthPage() {
  const router = useRouter();
  const { login, loginWithGoogle, isAuthenticated, isLoading: authLoading } = useAuthStore();

  // Query string is read after mount rather than through useSearchParams(),
  // which is what previously kept this page off the server entirely: reading it
  // in a statically prerendered client component makes Next bail out to the
  // nearest Suspense fallback, so the HTML Vercel served for /auth was
  // app/auth/loading.tsx — a spinner — and the login form only ever existed
  // once the client bundle hydrated. Making the route dynamic instead would
  // fix the bailout but trade a CDN hit for a server round trip on every
  // visit, which is the wrong way round for the slow-connection users this is
  // for. Every consumer of these params runs after mount (the two legacy
  // bounces, the email prefill, and the post-login redirect), so a first
  // render with the defaults below changes nothing they observe. The read is
  // pre-paint, and `paramsReady` holds the redirect effects until it lands so
  // none of them can act on a default `next` and drop a real one.
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(null);
  const paramsReady = searchParams !== null;

  useIsomorphicLayoutEffect(() => {
    setSearchParams(new URLSearchParams(window.location.search));
  }, []);

  const nextPath = searchParams?.get('next') || HOME_PATH;
  const inviteEmail = normalizeAuthEmail(searchParams?.get('email') || '');
  // Old bookmarks / sent emails may still carry ?mode=signup. Send those
  // to /onboarding (the organic signup home) so the user has a path
  // forward — /auth itself no longer offers a signup form.
  const isLegacySignupMode = searchParams?.get('mode') === 'signup';

  // Legacy invite signature. The pre-token buildInviteUrl emitted
  // `/auth?next=/dashboard/tasks&email=…` (see git blame on
  // apps/web/lib/tasks-server.ts:buildInviteUrl, replaced 2026-06-05).
  // Recipients of those emails are joining an existing workspace, NOT
  // starting their own release — funneling them through /onboarding
  // would create a phantom personal workspace. We detect the exact
  // pattern, resolve the pending invite to a fresh token, and bounce
  // them to /invite/accept instead. The email-link trigger from
  // 20260605010000_invite_linkage_trigger.sql is the safety net if this
  // round-trip fails (the user signs up via /onboarding and the trigger
  // still links them by email).
  const isLegacyInviteLink =
    Boolean(inviteEmail) && searchParams?.get('next') === '/dashboard/tasks';

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  // False on the server AND on the client's first render, so both render the
  // same thing (the form) and hydration matches. Flipped pre-paint, which is
  // what lets the session check below hide the form without the user ever
  // seeing a painted frame of it. See the session gate near the bottom.
  const [hasMounted, setHasMounted] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setHasMounted(true);
  }, []);

  // The pre-hydration probe in app/layout.tsx may have hidden the form on the
  // strength of a persisted flag, which can be stale — a session that expired
  // while the app was closed. Once Supabase has actually answered, this is what
  // hands the page back: clearing the attribute reveals the form. Only the
  // negative case is acted on; a confirmed session is the early-returned
  // loader below, and while the answer is still unknown the hint stands so a
  // returning user is not shown a form we are about to take away.
  useIsomorphicLayoutEffect(() => {
    if (authLoading || isAuthenticated) return;
    document.documentElement.removeAttribute(SESSION_HINT_ATTRIBUTE);
  }, [authLoading, isAuthenticated]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailStage, setEmailStage] = useState<EmailStage>('hidden');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  // The exact normalized email the password stage was granted for. Editing
  // the email field to anything else drops back to the collect stage, since
  // the registered/unregistered branch was decided per-email.
  const [checkedEmail, setCheckedEmail] = useState('');
  const [accountHint, setAccountHint] = useState<'google-only' | 'unknown' | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  // Focus the email field only when the stage was opened by the user's own
  // tap — an auto-open (invite prefill) must not pop the mobile keyboard on
  // page load.
  const focusEmailOnOpenRef = useRef(false);

  useEffect(() => {
    if (emailStage === 'collect' && focusEmailOnOpenRef.current) {
      focusEmailOnOpenRef.current = false;
      emailInputRef.current?.focus();
      return;
    }
    if (emailStage === 'password') {
      passwordInputRef.current?.focus();
    }
  }, [emailStage]);

  const normalizedLoginEmail = normalizeAuthEmail(email);
  const signupHref = checkedEmail
    ? `/onboarding?email=${encodeURIComponent(checkedEmail)}`
    : '/onboarding';

  // Legacy ?mode=signup bookmarks: bounce to /onboarding immediately so
  // the user isn't stuck on a login form with no signup option. Runs
  // before the authenticated-redirect so we don't trap signed-in users
  // (rare, but possible if they clicked an old marketing link).
  useEffect(() => {
    if (!paramsReady) return;
    if (isLegacySignupMode) {
      router.replace('/onboarding');
    }
  }, [paramsReady, isLegacySignupMode, router]);

  // Legacy invite link bounce. Fires once on mount when the URL matches
  // the pre-token invite signature. Resolves the email to a token
  // server-side and redirects to /invite/accept. If no pending invite
  // exists for the email (e.g., the user manually crafted the URL),
  // falls through to the normal login form — the email pre-fill
  // behaviour below still applies.
  useEffect(() => {
    if (!paramsReady) return;
    if (!isLegacyInviteLink) return;
    let cancelled = false;

    const upgrade = async () => {
      try {
        const response = await fetch('/api/invites/resolve-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inviteEmail }),
        });
        if (!response.ok) return;
        // Server always returns { token: string } — empty string when
        // there is no pending invite (or the lookup couldn't complete).
        // Uniform shape on purpose; the content is what the client
        // branches on. See route.ts for the threat model write-up.
        const payload = (await response.json().catch(() => ({}))) as { token?: string };
        if (cancelled) return;
        const token = typeof payload.token === 'string' ? payload.token.trim() : '';
        if (token) {
          router.replace(`/invite/accept?token=${encodeURIComponent(token)}`);
        }
      } catch {
        // Network or server error — silently fall through to the login
        // form. The user can still reach signup through the email flow
        // itself; the email-link trigger catches them post-signup.
      }
    };

    void upgrade();
    return () => {
      cancelled = true;
    };
  }, [paramsReady, isLegacyInviteLink, inviteEmail, router]);

  useEffect(() => {
    if (!paramsReady) return;
    if (authLoading) return;
    if (isAuthenticated) {
      router.replace(nextPath);
    }
  }, [paramsReady, authLoading, isAuthenticated, nextPath, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (inviteEmail && !email) {
      setEmail(inviteEmail);
      // An invite link arrives with intent to use this email — open the
      // email step so it isn't hidden behind the pill (no keyboard focus,
      // per the ref note above).
      setEmailStage((stage) => (stage === 'hidden' ? 'collect' : stage));
      return;
    }
    // A throw here (restricted storage context) must not crash the whole
    // auth page — it's just a convenience prefill.
    let lastEmail = '';
    try {
      lastEmail = localStorage.getItem(LAST_AUTH_EMAIL_KEY) || '';
    } catch {
      // Ignore.
    }
    if (lastEmail && !email) {
      setEmail(lastEmail);
    }
  }, [email, inviteEmail]);

  // Was this visit caused by a session we lost rather than a sign-out the user
  // asked for? lib/auth-store.ts leaves a one-shot marker when supabase-js
  // drops a session on its own — usually a refresh it could not complete.
  // Consumed on read, so a later visit in the same tab does not repeat it.
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY)) {
        window.sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
        setSessionExpired(true);
      }
    } catch {
      // Restricted storage context — the notice is a courtesy, not a gate.
    }
  }, []);

  const openEmailStage = () => {
    setError('');
    focusEmailOnOpenRef.current = true;
    setEmailStage('collect');
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button does not stop Enter-in-a-field from firing the
    // form again — guard re-entry here.
    if (isCheckingEmail || isLoading || isGoogleLoading) return;
    const normalized = normalizeAuthEmail(email);
    if (!normalized.includes('@')) {
      setError('Enter your email address.');
      return;
    }
    setError('');
    setIsCheckingEmail(true);

    const account = await lookupEmailAccount(normalized);

    if (account === 'none') {
      // Best-effort convenience write — must not block the hand-off if
      // storage throws (restricted webview context).
      try {
        localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalized);
      } catch {
        // Ignore.
      }
      // Deliberately NOT resetting isCheckingEmail: the button stays in its
      // busy state through the navigation instead of flashing back to
      // "Continue".
      router.push(`/onboarding?email=${encodeURIComponent(normalized)}`);
      return;
    }

    setIsCheckingEmail(false);
    setCheckedEmail(normalized);
    setAccountHint(account === 'google-only' ? 'google-only' : account === 'unknown' ? 'unknown' : null);
    setPassword('');
    setEmailStage('password');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isGoogleLoading || isCheckingEmail) return;
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      // Best-effort convenience write — must not turn a successful login
      // into a reported failure if storage throws (restricted webview
      // context).
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalizedLoginEmail);
        } catch {
          // Ignore.
        }
      }
      router.push(nextPath);
    } catch (loginError) {
      setError(errorMessage(loginError, 'Login failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsGoogleLoading(true);

    try {
      if (typeof window !== 'undefined' && email.trim()) {
        try {
          localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalizedLoginEmail);
        } catch {
          // Ignore — must not block the actual Google sign-in below.
        }
      }
      await loginWithGoogle(nextPath);
    } catch {
      setError('Google sign-in failed. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  const busy = isLoading || isGoogleLoading || isCheckingEmail;

  // Returning users must never see the login form — still true, and still the
  // point of this gate. What changed (2026-08-12) is WHEN the decision is
  // made. It used to be made during render and keyed on `authLoading`, which
  // is true on the very first render for everybody; that made the form
  // unreachable until the client bundle hydrated, so a dropped chunk on a
  // weak connection left the user on this spinner with no way to sign in. The
  // check now waits for `hasMounted`, which flips before the first paint:
  // hydration still renders the same form the server sent (no mismatch), and a
  // visitor who already has a session has it swapped for this loader before
  // that frame is ever painted. `isAuthenticated` is rehydrated from storage
  // synchronously by the auth store's persist middleware, so it is already
  // correct at that point.
  //
  // `authLoading` is deliberately no longer part of the condition: waiting on
  // it meant an anonymous visitor — the only person who needs this page — sat
  // behind a spinner for a session check that was always going to come back
  // empty. Interactive submits stay excluded (local isLoading /
  // isGoogleLoading) so the form keeps its inline "Signing in…" + error UX
  // during a login attempt.
  if (hasMounted && isAuthenticated && !isLoading && !isGoogleLoading) {
    return (
      <LoadingScreen variant="shell" title="Opening Urganize" />
    );
  }

  return (
    <>
      {/* Shown INSTEAD of the form, by CSS alone, when the pre-hydration probe
          found a persisted session — so a returning user's first painted frame
          is this and not the form. Hidden by default for everyone else; React
          swaps in its own identical loader once it takes over. Both halves of
          the swap are the same component, so they cannot drift apart. */}
      <div className="auth-session-loader">
        <LoadingScreen variant="shell" title="Opening Urganize" asPage={false} />
      </div>

      <div className="auth-form-shell relative flex min-h-screen flex-col bg-bg-base px-6 pt-10 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        {/* Gold-thread ray fan (NEXT_PUBLIC_FEATURE_TEXTILE). Renders nothing
            unless <html> carries `urg-textile`, and is aria-hidden and
            pointer-events-none either way, so the entrance is unchanged for
            assistive tech and for the flag-off build. Kept as a plain div with
            no client state — this page is `○ Static` and must stay that way. */}
        <div className="urg-ground-sunburst" aria-hidden="true" />
        <div className="urg-above mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center">
          <LogoIcon size={64} priority />

          {/* One h1, two renderings: phones read the reference layout's
              "Log into Urganize"; desktop says what the identifier-first flow
              actually does — sign up or log in, decided by the email.
              (Founder call, 2026-08-21.) */}
          <h1 className="mt-10 text-center font-display text-2xl font-bold uppercase tracking-[0.06em] text-content-primary">
            <span className="lg:hidden">Log into Urganize</span>
            <span className="hidden lg:inline">Sign up or log in</span>
          </h1>

          {/* Signing in needs JavaScript. Say so instead of leaving the user
              tapping a button that silently does nothing. */}
          <noscript>
            <p className="mt-6 w-full border border-status-warning/40 bg-bg-surface px-4 py-3 text-sm leading-relaxed text-content-secondary">
              Signing in needs JavaScript switched on. If you are using a content
              blocker or private-browsing restrictions, turn them off for
              urganize.app and reload this page.
            </p>
          </noscript>

          {/* Not an error — the user did nothing wrong and their work is
              intact. It exists so an unasked-for login screen is explained
              rather than mysterious. */}
          {sessionExpired && (
            <p
              role="status"
              className="mt-6 w-full border border-stroke-default bg-bg-surface px-4 py-3 text-sm leading-relaxed text-content-secondary"
            >
              Your session ended, so you will need to log in again. Nothing has
              been lost.
            </p>
          )}

          <div className="mt-16 w-full space-y-4">
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={busy}
              className={entrancePillClass}
            >
              {isGoogleLoading ? (
                <>
                  <span aria-hidden="true" className="h-5 w-5 rounded-md bg-content-primary/10 skeleton-shimmer" />
                  <span aria-hidden="true" className="h-3 w-32 rounded-full bg-content-primary/10 skeleton-shimmer" />
                  <span className="sr-only">Loading Google sign-in</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {/* Email — a pill until tapped, then the identifier-first form in
                its place. Google stays visible above so switching method
                mid-way never needs a back step. */}
            {emailStage === 'hidden' ? (
              <button
                type="button"
                onClick={openEmailStage}
                disabled={busy}
                className={entrancePillClass}
              >
                <Mail className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <span>Continue with Email</span>
              </button>
            ) : (
              <form
                onSubmit={emailStage === 'collect' ? handleEmailContinue : handleLogin}
                className="space-y-4 pt-2"
              >
                <Input
                  ref={emailInputRef}
                  type="email"
                  aria-label="Email"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const value = e.target.value;
                    setEmail(value);
                    if (error) setError('');
                    // The password stage was granted for one specific email;
                    // typing a different one sends the flow back to Continue
                    // so the branch is re-decided, never reused stale.
                    if (emailStage === 'password' && normalizeAuthEmail(value) !== checkedEmail) {
                      setEmailStage('collect');
                      setPassword('');
                      setAccountHint(null);
                    }
                  }}
                  placeholder="you@example.com"
                  leftIcon={<Mail className="h-4 w-4" />}
                  inputClassName="text-lg"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  // Locked during the lookup too: an edit mid-check would let
                  // the field drift from the email the branch was decided for.
                  disabled={isLoading || isGoogleLoading || isCheckingEmail}
                  required
                />

                {emailStage === 'password' && accountHint === 'google-only' && (
                  <p className="text-center text-sm text-content-secondary">
                    This account was created with Google — you can use
                    &ldquo;Continue with Google&rdquo; above, or enter your
                    password below.
                  </p>
                )}

                {emailStage === 'password' && accountHint === 'unknown' && (
                  <p className="text-center text-sm text-content-secondary">
                    We couldn&apos;t check this email just now. New to Urganize?{' '}
                    <Link href={signupHref} className="text-brand hover:underline">
                      Create your account
                    </Link>{' '}
                    — otherwise enter your password below.
                  </p>
                )}

                {emailStage === 'password' && (
                  <>
                    <Input
                      ref={passwordInputRef}
                      type="password"
                      aria-label="Password"
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setPassword(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="Your password"
                      leftIcon={<Lock className="h-4 w-4" />}
                      inputClassName="text-lg"
                      autoComplete="current-password"
                      disabled={isLoading || isGoogleLoading}
                      required
                    />
                    <p className="text-right text-sm">
                      <Link href="/auth/forgot-password" className="text-brand hover:underline">
                        Forgot password?
                      </Link>
                    </p>
                  </>
                )}

                <button type="submit" disabled={busy} className={primaryPillClass}>
                  {emailStage === 'collect'
                    ? isCheckingEmail
                      ? 'Checking…'
                      : 'Continue'
                    : isLoading
                      ? 'Logging in…'
                      : 'Log in'}
                </button>
              </form>
            )}

            {error && (
              <p className="text-center text-sm text-status-error">{error}</p>
            )}
          </div>
        </div>

        <p className="pt-10 text-center text-base text-content-secondary">
          Having trouble signing in?{' '}
          <button
            type="button"
            onClick={() => {
              void openExternalUrl(SUPPORT_WHATSAPP_URL);
            }}
            className="font-semibold text-brand hover:underline"
          >
            Contact us
          </button>
        </p>
      </div>
    </>
  );
}
