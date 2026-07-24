'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { Button } from '@urganize/ui';
import { Input } from '@urganize/ui';
import { Card } from '@urganize/ui';
import { Logo } from '@urganize/ui';
import { LoadingScreen } from '@urganize/ui';
import { Mail, Lock } from 'lucide-react';
import { errorMessage } from "@/lib/errors";

// /auth is now login-only. Organic signup flows through /onboarding
// (Google + role parity); invited teammates flow through /invite/accept
// (token-based, no email-match dependency). The previous in-page mode
// toggle ('login' | 'role' | 'signup') has been removed; ?mode=signup
// is preserved as a query parameter only so we can redirect old
// bookmarks to the right entrance.
type LoginProviderHint = 'unknown' | 'google' | 'email';
const LAST_AUTH_EMAIL_KEY = 'urganize.last_auth_email';
const normalizeAuthEmail = (value: string) => value.trim().toLowerCase();

const resolveLoginProviderHint = async (normalizedEmail: string): Promise<LoginProviderHint> => {
  try {
    const response = await fetch('/api/auth/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    if (!response.ok) throw new Error('provider_lookup_failed');
    const payload = (await response.json()) as { hasGoogle?: boolean };
    return payload.hasGoogle ? 'google' : 'email';
  } catch {
    return 'unknown';
  }
};

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const nextPath = searchParams.get('next') || HOME_PATH;
  const inviteEmail = normalizeAuthEmail(searchParams.get('email') || '');
  // Old bookmarks / sent emails may still carry ?mode=signup. Send those
  // to /onboarding (the organic signup home) so the user has a path
  // forward — /auth itself no longer offers a signup form.
  const isLegacySignupMode = searchParams.get('mode') === 'signup';

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
    Boolean(inviteEmail) && searchParams.get('next') === '/dashboard/tasks';

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [providerHint, setProviderHint] = useState<LoginProviderHint>('unknown');
  const [providerHintEmail, setProviderHintEmail] = useState('');
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const providerLookupRequestIdRef = useRef(0);

  const normalizedLoginEmail = normalizeAuthEmail(email);
  const hasLookupEligibleEmail = showEmailLogin && normalizedLoginEmail.includes('@');
  // HINT, not a wall (founder bug report, 2026-07-23): the provider lookup
  // is a heuristic — when it was wrong it locked the password field away
  // entirely. Now it only surfaces a suggestion; email login always works.
  const showGoogleHint =
    showEmailLogin &&
    providerHint === 'google' &&
    providerHintEmail === normalizedLoginEmail;

  // Legacy ?mode=signup bookmarks: bounce to /onboarding immediately so
  // the user isn't stuck on a login form with no signup option. Runs
  // before the authenticated-redirect so we don't trap signed-in users
  // (rare, but possible if they clicked an old marketing link).
  useEffect(() => {
    if (isLegacySignupMode) {
      router.replace('/onboarding');
    }
  }, [isLegacySignupMode, router]);

  // Legacy invite link bounce. Fires once on mount when the URL matches
  // the pre-token invite signature. Resolves the email to a token
  // server-side and redirects to /invite/accept. If no pending invite
  // exists for the email (e.g., the user manually crafted the URL),
  // falls through to the normal login form — the email pre-fill
  // behaviour below still applies.
  useEffect(() => {
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
        // form. The user can still complete signup via the "Don't have
        // an account?" link to /onboarding; the email-link trigger
        // catches them post-signup.
      }
    };

    void upgrade();
    return () => {
      cancelled = true;
    };
  }, [isLegacyInviteLink, inviteEmail, router]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      router.replace(nextPath);
    }
  }, [authLoading, isAuthenticated, nextPath, router]);

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

  useEffect(() => {
    const requestId = ++providerLookupRequestIdRef.current;

    if (!showEmailLogin || !hasLookupEligibleEmail) {
      setProviderHint('unknown');
      setProviderHintEmail('');
      return;
    }

    const timer = window.setTimeout(async () => {
      const hint = await resolveLoginProviderHint(normalizedLoginEmail);
      if (providerLookupRequestIdRef.current !== requestId) return;

      setProviderHint(hint);
      setProviderHintEmail(normalizedLoginEmail);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasLookupEligibleEmail, normalizedLoginEmail, showEmailLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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

  // Returning users must never see the login form. While the persisted
  // session is still restoring (authLoading) — or once it's confirmed
  // (isAuthenticated), while the redirect effect above navigates into the
  // app — show a neutral loader instead of the form, exactly like the root
  // `/` page. Interactive submits are excluded (local isLoading /
  // isGoogleLoading) so the form keeps its inline "Signing in…" + error UX
  // during a login attempt. The auth-store's INITIAL_SESSION handler always
  // resolves authLoading, so this can't hang.
  if ((authLoading || isAuthenticated) && !isLoading && !isGoogleLoading) {
    return (
      <LoadingScreen
        variant="shell"
        title="Opening Urganize"
        description="Checking your session…"
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-base p-4">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-status-info/15 blur-3xl" />
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" priority />
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-content-tertiary">
            Welcome
          </p>
        </div>

        <Card padding="lg" className="rounded-3xl border border-stroke-default bg-bg-surface/95 backdrop-blur-sm shadow-[0_10px_40px_rgb(var(--shadow-ink)/calc(0.18*var(--shadow-alpha-scale)))]">
          {/* Login only — signup moved to /onboarding (organic) and
              /invite/accept (invited teammates). */}
          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-zinc-100 text-black font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGoogleLoading ? (
              <>
                <span aria-hidden="true" className="h-5 w-5 rounded-md bg-black/10 skeleton-shimmer" />
                <span aria-hidden="true" className="h-3 w-32 rounded-full bg-black/10 skeleton-shimmer" />
                <span className="sr-only">Loading Google sign-in</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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

              {!showEmailLogin ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full"
                  disabled={isLoading || isGoogleLoading}
                  onClick={() => {
                    setShowEmailLogin(true);
                    setPassword('');
                    setError('');
                  }}
                >
                  Sign in with email
                </Button>
              ) : (
                <>
                  {/* Divider */}
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-stroke-subtle" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-bg-surface text-content-tertiary">or</span>
                    </div>
                  </div>

                  {/* Email/Password Form */}
                  <form onSubmit={handleLogin} className="space-y-4">
                    <Input
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="you@example.com"
                      leftIcon={<Mail className="w-4 h-4" />}
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={isLoading || isGoogleLoading}
                      required
                    />

                    {showGoogleHint && (
                      <p className="text-center text-xs text-content-secondary">
                        This account was created with Google — you can use
                        &ldquo;Continue with Google&rdquo; above, or enter your
                        password below.
                      </p>
                    )}

                    {true && (
                      <>
                        <Input
                          label="Password"
                          type="password"
                          value={password}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setPassword(e.target.value);
                            if (error) setError('');
                          }}
                          placeholder="••••••••"
                          leftIcon={<Lock className="w-4 h-4" />}
                          autoComplete="current-password"
                          disabled={isLoading || isGoogleLoading}
                          required
                        />

                        <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                          {isLoading ? 'Signing in...' : 'Sign in'}
                        </Button>
                      </>
                    )}

                    {error && (
                      <p className="text-center text-sm text-status-error">{error}</p>
                    )}
                  </form>
                  <p className="mt-2 text-center text-sm text-content-tertiary">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailLogin(false);
                        setPassword('');
                        setError('');
                      }}
                      className="text-brand hover:underline"
                    >
                      Hide email sign-in
                    </button>
                  </p>
                </>
              )}

          {error && !showEmailLogin && (
            <p className="mt-4 text-center text-sm text-status-error">{error}</p>
          )}

          <p className="text-center text-sm text-content-tertiary mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/onboarding" className="text-brand hover:underline font-medium">
              Sign up
            </Link>
          </p>

          {showEmailLogin && (
            <p className="text-center text-sm text-content-tertiary mt-2">
              <Link href="/auth/forgot-password" className="text-brand hover:underline">
                Forgot password?
              </Link>
            </p>
          )}
        </Card>
      </div>
      </div>
    </div>
  );
}

