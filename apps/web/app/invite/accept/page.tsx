'use client';

// /invite/accept — token-based invite acceptance.
//
// This is the dedicated entry point for invited teammates. It's NOT the
// organic-signup path (/onboarding) because invitees are JOINING an
// existing workspace; running them through "tell us about your release"
// would create a phantom personal workspace and leave them disconnected
// from the one that invited them.
//
// Flow:
//   1. Read `?token=` from URL.
//   2. GET /api/invites/[token] to fetch workspace name + inviter name.
//      If the token is invalid / expired / already accepted, show that.
//   3. Render one of three sub-states:
//      a. Unauthed → signup form (Google + email/password); email pre-
//         filled from the invite row but editable so the user can sign
//         up with a different address.
//      b. Authed-different-account → "Sign in as X to accept" with a
//         "Switch account" option.
//      c. Authed → one-click "Accept and continue".
//   4. On success → POST /api/invites/[token] to link the user, then
//      redirect to /dashboard. The user now has access to the inviting
//      workspace via workspace_members.user_id.
//
// Google OAuth round-trip: the token is stashed in sessionStorage before
// the redirect and read-and-cleared on return. Same pattern as the
// /onboarding Google path.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input, Logo } from '@urganize/ui';
import { Mail, Lock, UserCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';

// Profile role for invited teammates. 'artist-team' positions them as a
// member of someone else's team — matches the standalone signup vocabulary
// without forcing the ArtistNameGate (which only fires for role='artist').
const INVITEE_PROFILE_ROLE = 'artist-team';

// sessionStorage marker to survive the Google OAuth round-trip. The page
// reads-and-clears on mount.
const RESUME_STORAGE_KEY = 'urganize.invite.resume_token';

type InviteStatus = 'valid' | 'expired' | 'accepted';

type InviteMetadata = {
  status: InviteStatus;
  workspaceName: string;
  inviterName: string | null;
  invitedEmail: string;
  role: string;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; metadata: InviteMetadata };

function readAndClearResumeToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(RESUME_STORAGE_KEY);
    return raw.trim() || null;
  } catch {
    return null;
  }
}

function writeResumeToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RESUME_STORAGE_KEY, token);
  } catch {
    // sessionStorage may be unavailable (private mode). The OAuth path
    // degrades — without the marker, the user lands back on this page
    // authenticated and joins with the one-click Accept button; if they
    // navigate away instead, the email-invite activation catches them
    // when their Google email matches the invited one, and reopening
    // the link (multi-use for link kinds) is one click. Note the
    // email/password path no longer depends on any of this: its token
    // rides auth.user_metadata and the server-side deferred claim
    // finishes the join regardless.
  }
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const { signup, loginWithGoogle, logout, user, isAuthenticated, isLoading: authLoading } =
    useAuthStore();

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Resume-after-OAuth guard. The accept POST is idempotent (returns
  // already_accepted) but the ref keeps us from firing the call multiple
  // times per mount.
  const resumeStartedRef = useRef(false);

  // 1. Load invite metadata
  useEffect(() => {
    if (!token) {
      setLoadState({ kind: 'invalid', message: 'Missing invite token.' });
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as
          | InviteMetadata
          | { error?: string };

        if (cancelled) return;
        if (!response.ok) {
          const message =
            (payload as { error?: string })?.error || 'This invite is no longer valid.';
          setLoadState({ kind: 'invalid', message });
          return;
        }

        const metadata = payload as InviteMetadata;
        setLoadState({ kind: 'ready', metadata });
        // Pre-fill the email field with the invited address. The user can
        // edit it before submit — token-based acceptance doesn't require
        // the signup email to match the invited one.
        setEmail((current) => current || metadata.invitedEmail || '');
      } catch (loadError) {
        if (cancelled) return;
        setLoadState({
          kind: 'invalid',
          message: errorMessage(loadError, 'Could not load invite details.'),
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2. Accept-invite helper. Authoritative; runs on both manual click +
  //    post-OAuth resume.
  const acceptInvite = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        return { ok: false, message: 'Sign in to accept this invite.' };
      }

      const response = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };
      if (!response.ok) {
        return { ok: false, message: payload.error || 'Could not accept invite.' };
      }
      return { ok: true };
    } catch (acceptError) {
      return { ok: false, message: errorMessage(acceptError, 'Could not accept invite.') };
    }
  }, [token]);

  // 3. Post-OAuth resume — if we set the marker before redirecting to
  //    Google and the user is now authenticated, accept the invite.
  useEffect(() => {
    if (loadState.kind !== 'ready') return;
    if (authLoading) return;
    if (!isAuthenticated) return;
    if (resumeStartedRef.current) return;

    const resumeToken = readAndClearResumeToken();
    if (!resumeToken || resumeToken !== token) {
      // No resume in progress — let the user click Accept manually.
      return;
    }

    resumeStartedRef.current = true;
    void (async () => {
      setError('');
      setIsSubmitting(true);
      const result = await acceptInvite();
      if (result.ok) {
        setSuccessMessage('Joined! Taking you to the workspace…');
        router.replace(HOME_PATH);
      } else {
        setError(result.message || 'Could not accept invite.');
        setIsSubmitting(false);
      }
    })();
  }, [acceptInvite, authLoading, isAuthenticated, loadState.kind, router, token]);

  // 4. Sub-flow handlers
  const handleEmailPasswordSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loadState.kind !== 'ready') return;

    setError('');
    setIsSubmitting(true);
    try {
      // Reuse the existing auth-store signup. INVITEE_PROFILE_ROLE keeps
      // the artist-name gate from firing. The auth-store handler triggers
      // the same supabase.auth.signUp the standalone /auth signup uses.
      //
      // pendingInviteToken makes the join durable: it lands in
      // auth.user_metadata, and the server-side deferred claim
      // (lib/invite-claims-server.ts) finishes the join on the user's first
      // authenticated request even if everything after this line fails — a
      // dropped connection here used to leave an account that belonged to no
      // workspace, with nothing that would ever retry.
      await signup(email.trim().toLowerCase(), password, name.trim(), INVITEE_PROFILE_ROLE, undefined, {
        pendingInviteToken: token,
      });

      // Email confirmation (when the Supabase project requires it) means
      // signUp returns NO session — the accept POST below cannot run yet.
      // That is fine now: the metadata claim joins them the moment they
      // confirm and sign in, so say so instead of surfacing a misleading
      // "sign in to accept" error.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setSuccessMessage(
          `Account created. Check your email to confirm it, then sign in — you'll join ${displayWorkspace} automatically.`
        );
        setIsSubmitting(false);
        return;
      }

      const result = await acceptInvite();
      if (!result.ok) {
        // The account exists and the metadata claim will finish the join on
        // their next request, so this is a delay, not a dead end — the copy
        // must not read like one.
        throw new Error(
          `${result.message || 'Could not finish joining.'} Your account was created — sign in and you'll join ${displayWorkspace} automatically.`
        );
      }
      setSuccessMessage('Joined! Taking you to the workspace…');
      router.replace(HOME_PATH);
    } catch (signupError) {
      setError(errorMessage(signupError, 'Could not finish signup.'));
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (loadState.kind !== 'ready') return;
    setError('');
    setIsGoogleRedirecting(true);
    try {
      writeResumeToken(token);
      // The Google round-trip lands on /auth/callback then back here via
      // `next=`. On return the resume effect (above) calls acceptInvite.
      await loginWithGoogle(`/invite/accept?token=${encodeURIComponent(token)}`);
    } catch (oauthError) {
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(RESUME_STORAGE_KEY);
        } catch {
          // Best-effort cleanup — a storage throw here must not skip the
          // error/loading-state resets below.
        }
      }
      setError(errorMessage(oauthError, 'Could not start Google sign-in.'));
      setIsGoogleRedirecting(false);
    }
  };

  const handleAcceptAsCurrentUser = async () => {
    setError('');
    setIsSubmitting(true);
    const result = await acceptInvite();
    if (result.ok) {
      setSuccessMessage('Joined! Taking you to the workspace…');
      router.replace(HOME_PATH);
    } else {
      setError(result.message || 'Could not accept invite.');
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await logout();
      // After logout, the unauthed branch renders. No navigation needed.
      setIsSubmitting(false);
    } catch (logoutError) {
      setError(errorMessage(logoutError, 'Could not sign out.'));
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const metadata = loadState.kind === 'ready' ? loadState.metadata : null;
  // Plain derivations, not useMemo: both are string fallbacks cheap enough to
  // recompute, and memoizing them tripped react-hooks/preserve-manual-
  // memoization once handleEmailPasswordSignup started reading them.
  const displayInviter = metadata?.inviterName || 'Your teammate';
  const displayWorkspace = metadata?.workspaceName || 'a workspace';
  const showSwitchAccountHelper = useMemo(() => {
    if (!isAuthenticated || !user?.email || !metadata?.invitedEmail) return false;
    return user.email.trim().toLowerCase() !== metadata.invitedEmail.trim().toLowerCase();
  }, [isAuthenticated, metadata, user?.email]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-base p-4">
      {/* Gold-thread ray fan (NEXT_PUBLIC_FEATURE_TEXTILE). Replaces the
          blurred brand blobs below, which the same flag hides. Inert off. */}
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-blob pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
      <div className="urg-blob pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-status-info/15 blur-3xl" />
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
        <div className="relative z-10 w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo size="lg" priority />
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-content-tertiary">
              Team invite
            </p>
          </div>

          <Card
            padding="lg"
            className="rounded-3xl border border-stroke-default bg-bg-surface/95 backdrop-blur-sm shadow-[0_10px_40px_rgb(var(--shadow-ink)/calc(0.18*var(--shadow-alpha-scale)))]"
          >
            {loadState.kind === 'loading' ? (
              <div className="py-6 text-center text-sm text-content-secondary">
                Loading invite…
              </div>
            ) : null}

            {loadState.kind === 'invalid' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-status-error/15 text-status-error">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold text-content-primary">
                  Invite unavailable
                </h1>
                <p className="text-sm text-content-secondary">{loadState.message}</p>
                <Link
                  href="/auth"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Go to sign in
                </Link>
              </div>
            ) : null}

            {loadState.kind === 'ready' && metadata?.status === 'accepted' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold text-content-primary">
                  This invite was already used
                </h1>
                <p className="text-sm text-content-secondary">
                  Sign in to continue to {displayWorkspace}.
                </p>
                <Link
                  href="/auth"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Go to sign in
                </Link>
              </div>
            ) : null}

            {loadState.kind === 'ready' && metadata?.status === 'expired' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-status-warning/15 text-status-warning">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold text-content-primary">
                  This invite has expired
                </h1>
                <p className="text-sm text-content-secondary">
                  Ask {displayInviter} to send a fresh invite link from their workspace
                  Settings → Teammates.
                </p>
              </div>
            ) : null}

            {loadState.kind === 'ready' && metadata?.status === 'valid' ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h1 className="text-xl font-semibold text-content-primary">
                    You&apos;re invited to {displayWorkspace}
                  </h1>
                  <p className="text-sm text-content-secondary">
                    {displayInviter} invited{' '}
                    <span className="text-content-primary">{metadata.invitedEmail}</span> to
                    join their workspace on Urganize.
                  </p>
                </div>

                {/* Authed sub-flow: one-click accept (or switch account). */}
                {isAuthenticated && user ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated px-3 py-3 text-sm text-content-secondary">
                      <UserCircle className="mt-0.5 h-5 w-5 shrink-0 text-content-tertiary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-content-primary">
                          Signed in as{' '}
                          <span className="font-medium">{user.email || 'your account'}</span>
                        </p>
                        {showSwitchAccountHelper ? (
                          <p className="mt-1 text-xs text-content-tertiary">
                            This invite was sent to {metadata.invitedEmail}. Token-based
                            acceptance works regardless — but you can switch if you meant a
                            different account.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      disabled={isSubmitting}
                      onClick={handleAcceptAsCurrentUser}
                    >
                      {isSubmitting ? 'Joining…' : `Accept and join ${displayWorkspace}`}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      disabled={isSubmitting}
                      onClick={handleSwitchAccount}
                    >
                      Switch account
                    </Button>
                  </div>
                ) : null}

                {/* Unauthed sub-flow: Google or email/password signup. */}
                {!isAuthenticated && !authLoading ? (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => void handleGoogleSignup()}
                      disabled={isGoogleRedirecting || isSubmitting}
                      className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-stroke-default bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isGoogleRedirecting ? (
                        'Redirecting…'
                      ) : (
                        <>
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
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
                          Continue with Google
                        </>
                      )}
                    </button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-stroke-subtle" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase tracking-[0.18em] text-content-tertiary">
                        <span className="bg-bg-surface px-2">Or with email</span>
                      </div>
                    </div>

                    <form onSubmit={handleEmailPasswordSignup} className="space-y-4">
                      <Input
                        label="Your name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        leftIcon={<UserCircle className="w-4 h-4" />}
                        disabled={isSubmitting || isGoogleRedirecting}
                        required
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        leftIcon={<Mail className="w-4 h-4" />}
                        disabled={isSubmitting || isGoogleRedirecting}
                        required
                      />
                      {/* Explicit about WHOSE password this is (2026-08-16).
                          Team logins are shared over WhatsApp, so the person
                          opening one may be expecting a password to have been
                          sent to them; saying they choose it here is what
                          stops them waiting for a message that never comes —
                          and no password ever travels through a chat. */}
                      <Input
                        label="Choose your password"
                        hint="You're setting this yourself — nobody else sees it. At least 6 characters."
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        leftIcon={<Lock className="w-4 h-4" />}
                        disabled={isSubmitting || isGoogleRedirecting}
                        minLength={6}
                        required
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting || isGoogleRedirecting}
                      >
                        {isSubmitting ? 'Joining…' : `Create account and join`}
                      </Button>
                    </form>

                    <p className="text-center text-xs text-content-tertiary">
                      Already have an account?{' '}
                      <Link
                        href={`/auth?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
                        className="text-brand hover:underline"
                      >
                        Sign in
                      </Link>
                    </p>
                  </div>
                ) : null}

                {error ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error"
                  >
                    {error}
                  </p>
                ) : null}
                {successMessage ? (
                  <p className="rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">
                    {successMessage}
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          <p className="mt-6 text-center text-xs text-content-tertiary">
            Need help?{' '}
            <a className="underline" href="mailto:contact@urganize.app">
              contact@urganize.app
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
