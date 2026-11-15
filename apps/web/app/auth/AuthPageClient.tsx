'use client';

import { describeCallbackError } from '@/lib/auth-callback-error';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SESSION_EXPIRED_NOTICE_KEY, useAuthStore } from '@/lib/auth-store';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { captureReferralFromSearch } from '@/lib/referral-intent';
import { HOME_PATH } from '@/lib/home-path';
import { openExternalUrl } from '@/lib/external-link';
// Deep imports (URG-314): the @urganize/ui barrel pulled every ui component
// (the audio player, the assistant's pieces, the genre picker) into the
// sign-in page.
import { Logo } from '@urganize/ui/Logo';
import { LoadingScreen } from '@urganize/ui/LoadingScreen';
import Image from 'next/image';
import { Smartphone } from '@/components/icons';
import { ANDROID_URL, AuthFooter, AuthPlans, AuthQuestions, PRIVACY_URL, TERMS_URL } from '@/components/auth/AuthPageSections';
import { errorMessage } from "@/lib/errors";
import { supabase } from '@/lib/supabase/client';
import { InviteOnlyNotice } from '@/components/access/InviteOnlyNotice';
import { checkEmailAccess, hasPendingAccessIntent, redeemPendingAccess } from '@/lib/access-intent';
import { isSafeNextPath, normalizeEmail, readPendingConfirmation } from '@/lib/email-confirmation';
import { CheckInbox } from '@/components/auth/EmailConfirmation';
import { useConfirmationPickup } from '@/components/auth/useConfirmationPickup';

// /auth is the single front door for BOTH sides of the account line. Since
// #1053 (mock approved 3 Nov 2026) it is laid out after a reference login
// page: a two-column hero (headline, a card with "Continue with Google" and
// the email field, a studio photo on the right), then plans, three questions
// and a footer (components/auth/AuthPageSections.tsx). The email path is
// identifier-first — the visitor enters only their
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
type EmailStage = 'collect' | 'password';
type EmailAccountLookup = 'none' | 'password' | 'google-only' | 'unknown';
// Same founder-support destination global-error.tsx and the footer use.
const SUPPORT_WHATSAPP_URL = 'https://wa.me/2347067367057';
const LAST_AUTH_EMAIL_KEY = 'urganize.last_auth_email';
// Written by the pre-hydration probe in app/layout.tsx, read by the CSS gate in
// app/globals.css, cleared here once Supabase confirms there is no session.
const SESSION_HINT_ATTRIBUTE = 'data-auth-session';
const normalizeAuthEmail = (value: string) => value.trim().toLowerCase();

// The card's controls: 44px on a phone, 38px from md, 8px corners, so every
// row of the card is the same height (#1053). From lg the form sits on the
// page with pill buttons and a 46px outlined field (#1229).
const googleButtonClass =
  'flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-bg-hover text-[15px] font-medium text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-active disabled:cursor-not-allowed disabled:opacity-50 md:h-[38px] md:text-[13px] lg:h-12 lg:rounded-full lg:border lg:border-stroke-control lg:bg-bg-surface lg:text-[14px] lg:font-semibold lg:hover:bg-bg-hover';
const primaryButtonClass =
  'flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[15px] font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 md:h-[38px] md:text-[13px] lg:mt-2 lg:h-12 lg:rounded-full lg:bg-content-primary lg:text-[14px] lg:text-bg-base lg:hover:bg-content-primary/90';
const fieldClass =
  'h-11 w-full rounded-lg border border-stroke-control/40 bg-bg-base px-3 text-base text-content-primary outline-none placeholder:text-content-tertiary focus:border-brand disabled:opacity-60 md:h-[38px] md:text-[13px] lg:h-[46px] lg:rounded-xl lg:border-content-tertiary lg:bg-bg-surface lg:px-3.5 lg:text-[14px] lg:focus:border-brand';

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
    // A partner's link may land here first; remember its ?ref= so the signup
    // that follows can report it (lib/referral-intent.ts).
    captureReferralFromSearch(window.location.search);
  }, []);

  // Only a path on this site: `?next=//evil.example` or `https://…` would make
  // router.push leave the app after sign-in (URG-386's safe next, applied here
  // too, not only on /auth/callback).
  const requestedNext = searchParams?.get('next');
  const nextPath = isSafeNextPath(requestedNext) ? requestedNext : HOME_PATH;
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
  // Set by /auth/callback when Google sign-in cannot finish (see lib/auth-callback-error).
  const callbackError = describeCallbackError(searchParams?.get('error'));
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
  const [emailStage, setEmailStage] = useState<EmailStage>('collect');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  // The exact normalized email the password stage was granted for. Editing
  // the email field to anything else drops back to the collect stage, since
  // the registered/unregistered branch was decided per-email.
  const [checkedEmail, setCheckedEmail] = useState('');
  const [accountHint, setAccountHint] = useState<'google-only' | 'unknown' | null>(null);
  // Closed sign-up (2026-10-15): an email with no account and no invite reads
  // "Urganize is invite-only for now" here instead of starting the wizard.
  const [inviteOnly, setInviteOnly] = useState(false);
  // URG-386: a password log-in before the email is confirmed reads Check your
  // inbox (with Resend), not a red error.
  const [unconfirmed, setUnconfirmed] = useState<{
    email: string;
    sentAt: number;
    firstName: string;
    releaseTitle: string;
  } | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // The email field is on screen from the first paint (#1053) and is never
  // focused on load, so a phone does not open its keyboard over the page. The
  // password field takes focus once the lookup opens it.
  useEffect(() => {
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
      // Closed sign-up: stop an invite-less email before the wizard. The real
      // gate is server-side after sign-up; this only saves a wasted wizard.
      // An invite this browser holds, a pending team invite or a founder
      // invite for this email all pass (POST /api/access/check).
      if (!(await checkEmailAccess(normalized))) {
        setIsCheckingEmail(false);
        setInviteOnly(true);
        return;
      }
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
      // Closed sign-up: an invite link opened before signing in is redeemed
      // for this account now (best-effort; the gate re-checks on its own).
      if (hasPendingAccessIntent()) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) await redeemPendingAccess(data.session.access_token);
      }
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
      router.replace(nextPath);
    } catch (loginError) {
      const message = errorMessage(loginError, 'Login failed. Please try again.');
      if (/verify your email|email not confirmed/i.test(message)) {
        const address = normalizeEmail(email);
        const pending = readPendingConfirmation();
        const same = pending && pending.email === address ? pending : null;
        setPassword('');
        setUnconfirmed({
          email: address,
          // Our own last send, when there was one, keeps its cooldown; otherwise
          // Resend is available straight away.
          sentAt: same?.sentAt ?? 0,
          firstName: same?.firstName || '',
          releaseTitle: same?.releaseTitle || '',
        });
        return;
      }
      setError(message);
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
  // Confirmed in another tab of this browser: go in from here.
  useConfirmationPickup(Boolean(unconfirmed), () => {
    router.replace(nextPath);
  });

  if (unconfirmed) {
    return (
      <CheckInbox
        email={unconfirmed.email}
        firstName={unconfirmed.firstName}
        releaseTitle={unconfirmed.releaseTitle}
        sentAt={unconfirmed.sentAt}
        onChangeEmail={() => {
          setUnconfirmed(null);
          setError('');
          setEmailStage('collect');
        }}
      />
    );
  }

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

      <main className="auth-form-shell relative min-h-screen pb-[env(safe-area-inset-bottom,0px)]">
        {/* Gold-thread ray fan (NEXT_PUBLIC_FEATURE_TEXTILE). Renders nothing
            unless <html> carries `urg-textile`, and is aria-hidden and
            pointer-events-none either way. Kept as a plain div with no client
            state: this page is `○ Static` and must stay that way. */}
        <div className="urg-ground-sunburst lg:hidden" aria-hidden="true" />
        {/* On a computer (#1229, mock docs/mocks/signin-onboarding-desktop,
            screen 1): two halves filling the window. The form on the left,
            one photo filling the right; the plans, questions and footer below
            are phone only. On a phone the photo drops under the form so
            signing in stays on the first screen. */}
        <div className="urg-above">
          <section className="lg:grid lg:min-h-screen lg:grid-cols-2">
            <div className="lg:flex lg:min-h-screen lg:flex-col lg:px-14 lg:pb-10 lg:pt-8">
              <header className="px-4 pt-5 lg:p-0">
                <Logo size="md" priority />
              </header>

            <div className="flex flex-col items-center px-4 pt-12 text-center lg:mx-auto lg:my-auto lg:w-full lg:max-w-[400px] lg:items-stretch lg:px-0 lg:py-12 lg:text-left">
              {/* DM Sans Bold: the font-display rule in globals.css sets the weight. */}
              <h1 className="text-balance font-display text-[34px] font-normal leading-10 tracking-[-0.012em] text-content-primary lg:text-[40px] lg:leading-[46px]">
                One plan. Every task has an owner.
              </h1>
              <p className="mt-3 text-base leading-[23px] text-content-secondary lg:mt-2 lg:text-[15px] lg:leading-[22px]">
                Tell it your goals. It makes the plan and reminds each person.
              </p>

              {/* Signing in needs JavaScript. Say so instead of leaving the user
                  tapping a button that silently does nothing. */}
              <noscript>
                <p className="mt-6 w-full max-w-[418px] rounded-lg border border-status-warning/40 bg-bg-surface px-4 py-3 text-left text-sm leading-relaxed text-content-secondary">
                  Signing in needs JavaScript switched on. If you are using a content
                  blocker or private-browsing restrictions, turn them off for
                  urganize.app and reload this page.
                </p>
              </noscript>

              {/* Not an error: the user did nothing wrong and their work is
                  intact. It exists so an unasked-for login screen is explained
                  rather than mysterious. */}
              {sessionExpired && (
                <p
                  role="status"
                  className="mt-6 w-full max-w-[418px] rounded-lg border border-stroke-default bg-bg-surface px-4 py-3 text-left text-sm leading-relaxed text-content-secondary"
                >
                  Your session ended, so you will need to log in again. Nothing has
                  been lost.
                </p>
              )}

              {/* A card on a phone; on a computer the form sits on the page. */}
              <div className="mt-7 w-full max-w-[418px] rounded-2xl border border-stroke-default bg-bg-surface p-5 text-left shadow-[0_1px_2px_rgba(26,22,17,0.04),0_8px_24px_rgba(26,22,17,0.06)] lg:max-w-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                {inviteOnly ? (
                  <InviteOnlyNotice
                    onSignIn={() => {
                      setInviteOnly(false);
                      setError('');
                      setEmailStage('collect');
                    }}
                  />
                ) : (
                  <>
                    <button type="button" onClick={handleGoogleLogin} disabled={busy} className={googleButtonClass}>
                      {isGoogleLoading ? (
                        <>
                          <span aria-hidden="true" className="h-4 w-4 rounded-md bg-content-primary/10 skeleton-shimmer" />
                          <span aria-hidden="true" className="h-3 w-32 rounded-full bg-content-primary/10 skeleton-shimmer" />
                          <span className="sr-only">Loading Google sign-in</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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

                    <p className="mt-3 text-center text-xs leading-[14px] text-content-tertiary lg:hidden">OR</p>
                    <div aria-hidden="true" className="my-[18px] hidden items-center gap-3 text-xs text-content-tertiary lg:flex">
                      <span className="h-px flex-1 bg-stroke-control" />
                      or
                      <span className="h-px flex-1 bg-stroke-control" />
                    </div>

                    {/* Identifier-first: the email alone, then the password
                        field opens under it once the lookup finds an account.
                        Google stays above so switching method never needs a
                        back step. */}
                    <form
                      onSubmit={emailStage === 'collect' ? handleEmailContinue : handleLogin}
                      className="mt-3 flex flex-col gap-3 lg:mt-0"
                    >
                      <label htmlFor="auth-email" className="sr-only lg:not-sr-only lg:-mb-1.5 lg:text-[13px] lg:font-semibold lg:text-content-primary">
                        Email
                      </label>
                      <input
                        id="auth-email"
                        ref={emailInputRef}
                        type="email"
                        value={email}
                        onChange={(e) => {
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
                        placeholder="Enter your email"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        // Locked during the lookup too: an edit mid-check would let
                        // the field drift from the email the branch was decided for.
                        disabled={isLoading || isGoogleLoading || isCheckingEmail}
                        required
                        className={fieldClass}
                      />

                      {emailStage === 'password' && accountHint === 'google-only' && (
                        <p className="text-center text-sm text-content-secondary">
                          This account was created with Google. You can use
                          &ldquo;Continue with Google&rdquo; above, or enter your
                          password below.
                        </p>
                      )}

                      {emailStage === 'password' && accountHint === 'unknown' && (
                        <p className="text-center text-sm text-content-secondary">
                          We couldn&apos;t check this email just now. New to Urganize?{' '}
                          <Link href={signupHref} className="text-brand underline underline-offset-2">
                            Create your account
                          </Link>{' '}
                          or, if you already have an account, enter your password below.
                        </p>
                      )}

                      {emailStage === 'password' && (
                        <>
                          <label htmlFor="auth-password" className="sr-only lg:not-sr-only lg:-mb-1.5 lg:text-[13px] lg:font-semibold lg:text-content-primary">
                            Password
                          </label>
                          <input
                            id="auth-password"
                            ref={passwordInputRef}
                            type="password"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              if (error) setError('');
                            }}
                            placeholder="Your password"
                            autoComplete="current-password"
                            disabled={isLoading || isGoogleLoading}
                            required
                            className={fieldClass}
                          />
                          <p className="-mt-1 text-right text-sm lg:text-[13px]">
                            <Link href="/auth/forgot-password" className="text-brand underline underline-offset-2">
                              Forgot password?
                            </Link>
                          </p>
                        </>
                      )}

                      <button type="submit" disabled={busy} className={primaryButtonClass}>
                        {emailStage === 'collect'
                          ? isCheckingEmail
                            ? 'Checking…'
                            : 'Continue with email'
                          : isLoading
                            ? 'Logging in…'
                            : 'Log in'}
                      </button>
                    </form>

                    {(error || callbackError) && (
                      <p role="alert" className="mt-3 text-center text-sm text-status-error">{error || callbackError}</p>
                    )}

                    <p className="mt-3.5 text-center text-xs leading-[17px] text-content-tertiary lg:mt-4">
                      By continuing, you agree to our{' '}
                      <a href={TERMS_URL} className="text-brand underline underline-offset-2">
                        Terms
                      </a>{' '}
                      and{' '}
                      <a href={PRIVACY_URL} className="text-brand underline underline-offset-2">
                        Privacy Policy
                      </a>
                      .
                    </p>
                  </>
                )}
              </div>

              {/* New to Urganize: a computer has no plans section below, so
                  the way to make an account sits under the form. */}
              {inviteOnly ? null : (
                <p className="mt-6 hidden text-center text-sm text-content-secondary lg:block">
                  New to Urganize?{' '}
                  <Link href={signupHref} className="font-semibold text-brand underline underline-offset-[3px]">
                    Create an account
                  </Link>
                </p>
              )}

              {/* Phones only: someone signing in on a laptop is not about to
                  install a phone app. */}
              <a
                href={ANDROID_URL}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-bg-hover px-4 text-sm font-medium text-content-primary transition-colors hover:bg-bg-active lg:hidden"
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                Get the Android app
              </a>

              {/* Through openExternalUrl so the Android app hands WhatsApp off
                  instead of loading it inside its own window. */}
              <p className="mt-6 text-sm text-content-secondary lg:hidden">
                Having trouble signing in?{' '}
                <button
                  type="button"
                  onClick={() => {
                    void openExternalUrl(SUPPORT_WHATSAPP_URL);
                  }}
                  className="font-semibold text-brand underline underline-offset-2"
                >
                  Contact us
                </button>
              </p>
            </div>

            <p className="hidden text-[13px] text-content-secondary lg:block">
              Trouble signing in?{' '}
              <button
                type="button"
                onClick={() => {
                  void openExternalUrl(SUPPORT_WHATSAPP_URL);
                }}
                className="font-semibold text-brand underline underline-offset-[3px]"
              >
                Contact us
              </button>
            </p>
            </div>

            {/* Photo: Dwayne Joe on Unsplash (unsplash.com/photos/C8VidHnIysM),
                Unsplash License, free for commercial use. On a computer it
                fills the right half and stays put while the left scrolls. */}
            <div className="px-4 pt-10 lg:p-4 lg:pl-0">
              <Image
                src="/images/auth-studio.webp"
                alt="Two people at work in a recording studio. Photo by Dwayne Joe on Unsplash."
                width={960}
                height={1200}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="h-[300px] w-full rounded-xl object-cover lg:sticky lg:top-4 lg:h-[calc(100vh-32px)] lg:min-h-[560px] lg:rounded-[20px] lg:grayscale"
              />
            </div>
          </section>

          <div className="lg:hidden">
            <AuthPlans />
            <AuthQuestions />
            <AuthFooter logo={<Logo size="md" />} />
          </div>
        </div>
      </main>
    </>
  );
}
