'use client';

// /curator/join/<code> — the only way into the playlist owner side.
//
// Flow:
//   1. GET /api/curator/join/<code> to see whether the link still works.
//   2. Sign up with Google or with an email address and password, or accept as
//      the account already signed in.
//   3. POST /api/curator/join/<code> to consume the link and become a curator.
//   4. Land on /curator.
//
// The Google round trip stashes the code in sessionStorage and passes
// next=/curator/join/<code>, so the callback returns here and the resume effect
// finishes the join. Same pattern as /invite/accept.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input, Logo } from '@urganize/ui';
import { AlertTriangle, CheckCircle2, ListMusic, Lock, Mail, UserCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { CURATOR_HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';
import type { CuratorInviteState } from '@/types/pitching';
import type { CuratorInviteLookup } from '@/lib/curator-invite-server';

const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

// Survives the Google round trip. Read and cleared on mount.
const RESUME_STORAGE_KEY = 'urganize.curator.join_code';

// The API (resolveCuratorInviteState in lib/curator-invites.ts) reports a good
// invite as 'active', not 'valid'. This used to redeclare its own local
// 'valid' state, which the server never sends, so every fresh invite fell
// through to the generic "no longer works" message below regardless of its
// real state. Fixed by using the type the server actually returns.
type InviteState = CuratorInviteState;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; state: InviteState };

/** The server's answer, mapped onto the state this component already renders.
 * 'loading' is now only ever reached when no server lookup was supplied. */
const toLoadState = (lookup: CuratorInviteLookup | undefined): LoadState => {
  if (!lookup) return { kind: 'loading' };
  return lookup.kind === 'ready'
    ? { kind: 'ready', state: lookup.state }
    : { kind: 'invalid', message: lookup.message };
};

function readAndClearResumeCode(): string | null {
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

function writeResumeCode(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RESUME_STORAGE_KEY, code);
  } catch {
    // Private mode can refuse storage. The user still lands back here signed
    // in, and the Accept button finishes the job by hand.
  }
}

const stateMessage = (state: InviteState): string => {
  if (state === 'used') return 'This link has already been used. Ask for a new one.';
  if (state === 'revoked') return 'This link was turned off. Ask for a new one.';
  if (state === 'expired') return 'This link has expired. Ask for a new one.';
  return 'This link no longer works. Ask for a new one.';
};

export function CuratorJoinPageClient({
  initialLookup,
}: {
  /** Resolved on the server by page.tsx, so the form (or the error) is in the
   * HTML and needs no JS to appear. Optional only so the component stays
   * renderable in isolation; the route always supplies it. */
  initialLookup?: CuratorInviteLookup;
}) {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = String(params?.code || '').trim();

  const { signup, loginWithGoogle, logout, user, isAuthenticated, isLoading: authLoading } =
    useAuthStore();

  const [loadState, setLoadState] = useState<LoadState>(() => toLoadState(initialLookup));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const resumeStartedRef = useRef(false);

  // Always false for the first paint so the server and the initial client render
  // agree, then the mount effect applies the real answer — the same pattern
  // WorkspaceIdentityPanel uses for its collapsed state. Needed here because the
  // auth store PERSISTS `isAuthenticated`, so without this a returning signed-in
  // visitor's first client render would pick the "Signed in as" branch while the
  // server had rendered the sign-up form: a hydration mismatch. An invited
  // stranger (the whole audience of this page) is unaffected either way.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Flag off: the whole feature is dark, so this page is not a real page.
  useEffect(() => {
    if (!PITCHING_ENABLED) {
      router.replace('/');
    }
  }, [router]);

  // 1. How does the link stand? Normally page.tsx has already answered this on
  // the server, and re-asking would spend a round trip to learn what is already
  // on screen — so this only runs when no server lookup was supplied (the
  // component rendered outside its route). Do NOT remove the guard to "keep it
  // fresh": that reinstates the client round trip this page was fixed to avoid,
  // and the invite is re-checked authoritatively by the POST anyway.
  useEffect(() => {
    if (!PITCHING_ENABLED) return;
    if (initialLookup) return;
    if (!code) {
      setLoadState({ kind: 'invalid', message: 'This link is missing its code.' });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/curator/join/${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as {
          status?: InviteState;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setLoadState({
            kind: 'invalid',
            message: payload.error || 'We could not find this link.',
          });
          return;
        }
        if (!payload.status) {
          // The server always sends `status` on a 200 (resolveCuratorInviteState
          // never returns nothing). A response without one is a broken
          // response, not a good invite — fail closed instead of assuming the
          // link works, which is what the old `|| 'valid'` fallback did.
          setLoadState({ kind: 'invalid', message: 'We could not check this link.' });
          return;
        }
        setLoadState({ kind: 'ready', state: payload.status });
      } catch (loadError) {
        if (cancelled) return;
        setLoadState({
          kind: 'invalid',
          message: errorMessage(loadError, 'We could not check this link.'),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, initialLookup]);

  // 2. Consume the invite. Used by every path into the join.
  const acceptInvite = useCallback(
    async (displayName?: string): Promise<{ ok: boolean; message?: string }> => {
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          return { ok: false, message: 'Sign in to use this link.' };
        }
        const response = await fetch(`/api/curator/join/${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(displayName ? { displayName } : {}),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          return { ok: false, message: payload.error || 'Could not use this link.' };
        }
        return { ok: true };
      } catch (acceptError) {
        return { ok: false, message: errorMessage(acceptError, 'Could not use this link.') };
      }
    },
    [code]
  );

  const finish = useCallback(async () => {
    // The account gained a curator profile server-side (and, for a brand-new
    // account, the curator-only role), so refresh before navigating. Without
    // this the shell still reads the pre-join account and bounces. An account
    // that already runs releases keeps its team role and simply becomes dual:
    // it lands here now, and its home is still the workspace.
    try {
      await useAuthStore.getState().checkAuth({ force: true });
    } catch {
      // A failed refresh is not fatal: /curator re-checks on mount.
    }
    setSuccessMessage('You are in. Opening your pitches.');
    router.replace(CURATOR_HOME_PATH);
  }, [router]);

  // 3. Post-Google resume.
  useEffect(() => {
    if (loadState.kind !== 'ready' || loadState.state !== 'active') return;
    if (authLoading || !isAuthenticated) return;
    if (resumeStartedRef.current) return;

    const resumeCode = readAndClearResumeCode();
    if (!resumeCode || resumeCode !== code) return;

    resumeStartedRef.current = true;
    void (async () => {
      setError('');
      setIsSubmitting(true);
      const result = await acceptInvite();
      if (result.ok) {
        await finish();
      } else {
        setError(result.message || 'Could not use this link.');
        setIsSubmitting(false);
      }
    })();
  }, [acceptInvite, authLoading, finish, isAuthenticated, loadState, code]);

  const handleEmailSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const trimmedName = name.trim();
      // 'curator' goes into auth metadata so the OAuth callback's fallback
      // profile upsert cannot write a team role over it.
      await signup(email.trim().toLowerCase(), password, trimmedName, 'curator');
      const result = await acceptInvite(trimmedName);
      if (!result.ok) throw new Error(result.message || 'Could not use this link.');
      await finish();
    } catch (signupError) {
      setError(errorMessage(signupError, 'Could not finish signing up.'));
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setIsGoogleRedirecting(true);
    try {
      writeResumeCode(code);
      await loginWithGoogle(`/curator/join/${encodeURIComponent(code)}`);
    } catch (oauthError) {
      try {
        window.sessionStorage.removeItem(RESUME_STORAGE_KEY);
      } catch {
        // Best-effort cleanup; the state resets below either way.
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
      await finish();
    } else {
      setError(result.message || 'Could not use this link.');
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await logout();
      setIsSubmitting(false);
    } catch (logoutError) {
      setError(errorMessage(logoutError, 'Could not sign out.'));
      setIsSubmitting(false);
    }
  };

  if (!PITCHING_ENABLED) return null;

  const isUsable = loadState.kind === 'ready' && loadState.state === 'active';
  const busy = isSubmitting || isGoogleRedirecting;

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-base p-4">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
        <div className="relative z-10 w-full">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo size="lg" priority />
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              Playlist owner invite
            </p>
          </div>

          {/* The form below is server-rendered but still needs JS to SUBMIT
              (supabase-js owns sign-up and the Google redirect), so a browser
              with scripting blocked has to be told rather than left tapping a
              dead button. Same notice /auth and /onboarding carry. */}
          <noscript>
            <p className="mb-4 rounded-lg border border-stroke-default bg-bg-surface p-3 text-sm text-content-secondary">
              JavaScript is switched off in this browser, so signing up will not
              work. Turn it on, or open this link in another browser.
            </p>
          </noscript>

          <Card
            padding="lg"
            className="rounded-2xl border border-stroke-default bg-bg-surface"
          >
            {loadState.kind === 'loading' ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-5 w-2/3 animate-pulse rounded bg-bg-elevated" />
                <div className="h-4 w-full animate-pulse rounded bg-bg-elevated" />
                <div className="h-11 w-full animate-pulse rounded-xl bg-bg-elevated" />
              </div>
            ) : null}

            {loadState.kind === 'invalid' ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-status-error/15 text-status-error">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold text-content-primary">Link not available</h1>
                <p className="text-sm text-content-secondary">{loadState.message}</p>
              </div>
            ) : null}

            {loadState.kind === 'ready' && !isUsable ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-status-warning/15 text-status-warning">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold text-content-primary">
                  This link is closed
                </h1>
                <p className="text-sm text-content-secondary">{stateMessage(loadState.state)}</p>
                {loadState.state === 'used' ? (
                  <Link
                    href="/auth"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                  >
                    Go to sign in
                  </Link>
                ) : null}
              </div>
            ) : null}

            {isUsable ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand">
                    <ListMusic className="h-5 w-5" />
                  </div>
                  <h1 className="text-xl font-semibold text-content-primary">
                    Get pitched, properly
                  </h1>
                  <p className="text-sm text-content-secondary">
                    Add your playlists. Artist teams send you songs with a link plus a short
                    note. You listen then mark each one added or passed. That is the whole job.
                  </p>
                </div>

                {hasMounted && isAuthenticated && user ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated px-3 py-3 text-sm">
                      <UserCircle className="mt-0.5 h-5 w-5 shrink-0 text-content-tertiary" />
                      <p className="min-w-0 flex-1 text-content-primary">
                        Signed in as{' '}
                        <span className="font-medium">{user.email || 'your account'}</span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={busy}
                      onClick={handleAcceptAsCurrentUser}
                    >
                      {isSubmitting ? 'Setting up…' : 'Use this link'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      disabled={busy}
                      onClick={handleSwitchAccount}
                    >
                      Use a different account
                    </Button>
                  </div>
                ) : null}

                {/* Deliberately NOT gated on `!authLoading`. That flag is true on
                    the very first render for everybody and is not persisted, so
                    including it meant the server rendered no form at all and an
                    invited stranger — who is essentially never signed in — got a
                    skeleton until ~1MB of JS had hydrated. Same removal, for the
                    same reason, that "The front door is server-rendered" made on
                    /auth. The rare already-signed-in visitor sees this form for
                    one frame before the branch above replaces it, which is a far
                    better trade than everyone seeing nothing. */}
                {!hasMounted || !isAuthenticated ? (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => void handleGoogleSignup()}
                      disabled={busy}
                      className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-stroke-default bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isGoogleRedirecting ? (
                        'Redirecting…'
                      ) : (
                        <>
                          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
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
                      <div className="relative flex justify-center text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
                        <span className="bg-bg-surface px-2">Or with email</span>
                      </div>
                    </div>

                    <form onSubmit={handleEmailSignup} className="space-y-4">
                      <Input
                        label="Your name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        leftIcon={<UserCircle className="h-4 w-4" />}
                        disabled={busy}
                        required
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        leftIcon={<Mail className="h-4 w-4" />}
                        disabled={busy}
                        required
                      />
                      <Input
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        leftIcon={<Lock className="h-4 w-4" />}
                        disabled={busy}
                        minLength={6}
                        required
                      />
                      <Button type="submit" className="w-full" disabled={busy}>
                        {isSubmitting ? 'Setting up…' : 'Create account'}
                      </Button>
                    </form>

                    <p className="text-center text-xs text-content-tertiary">
                      Already have an account?{' '}
                      <Link
                        href={`/auth?next=${encodeURIComponent(`/curator/join/${code}`)}`}
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
                  <p className="inline-flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">
                    <CheckCircle2 className="h-4 w-4" />
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
