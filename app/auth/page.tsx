'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ArrowLeft, User, Users, Mail, Lock, UserCircle } from 'lucide-react';

type AuthMode = 'login' | 'role' | 'signup';
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
  const { login, signup, loginWithGoogle, isAuthenticated, isLoading: authLoading } = useAuthStore();
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [hasManager, setHasManager] = useState<boolean | null>(null);
  const [providerHint, setProviderHint] = useState<LoginProviderHint>('unknown');
  const [providerHintEmail, setProviderHintEmail] = useState('');
  const [isCheckingProvider, setIsCheckingProvider] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [showEmailLoginForGoogle, setShowEmailLoginForGoogle] = useState(false);
  const providerLookupRequestIdRef = useRef(0);

  const normalizedLoginEmail = normalizeAuthEmail(email);
  const hasLookupEligibleEmail = mode === 'login' && showEmailLogin && normalizedLoginEmail.includes('@');
  const isProviderLookupPending =
    hasLookupEligibleEmail &&
    (isCheckingProvider || providerHintEmail !== normalizedLoginEmail);
  const shouldHideEmailLogin =
    mode === 'login' &&
    showEmailLogin &&
    providerHint === 'google' &&
    providerHintEmail === normalizedLoginEmail &&
    !showEmailLoginForGoogle;

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated && mode === 'login') {
      router.replace('/dashboard');
    }
  }, [authLoading, isAuthenticated, mode, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lastEmail = localStorage.getItem(LAST_AUTH_EMAIL_KEY) || '';
    if (lastEmail && !email) {
      setEmail(lastEmail);
    }
  }, [email]);

  useEffect(() => {
    const requestId = ++providerLookupRequestIdRef.current;

    if (mode !== 'login' || !showEmailLogin) {
      setProviderHint('unknown');
      setProviderHintEmail('');
      setIsCheckingProvider(false);
      return;
    }

    if (!hasLookupEligibleEmail) {
      setProviderHint('unknown');
      setProviderHintEmail('');
      setIsCheckingProvider(false);
      return;
    }

    setIsCheckingProvider(true);
    const timer = window.setTimeout(async () => {
      const hint = await resolveLoginProviderHint(normalizedLoginEmail);
      if (providerLookupRequestIdRef.current !== requestId) return;

      setProviderHint(hint);
      setProviderHintEmail(normalizedLoginEmail);
      setIsCheckingProvider(false);

      if (hint === 'google') {
        setShowEmailLoginForGoogle(false);
        setPassword('');
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasLookupEligibleEmail, mode, normalizedLoginEmail, showEmailLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProviderLookupPending) return;
    if (shouldHideEmailLogin) {
      setError('Use Google to continue, or click "Use email instead".');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalizedLoginEmail);
      }
      router.push('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const role = hasManager ? 'artist' : 'artist-manager';
      await signup(email, password, name, role);
      router.push('/dashboard?startOnboarding=0&flow=first-login');
    } catch {
      setError('Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsGoogleLoading(true);

    try {
      if (typeof window !== 'undefined' && email.trim()) {
        localStorage.setItem(LAST_AUTH_EMAIL_KEY, normalizedLoginEmail);
      }
      await loginWithGoogle();
    } catch {
      setError('Google sign-in failed. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg-base">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" priority />
          {mode !== 'login' && (
            <p className="text-content-secondary mt-2">
              Get started for free
            </p>
          )}
        </div>

        <Card padding="lg">
          {/* Login Mode */}
          {mode === 'login' && (
            <>
              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-zinc-100 text-black font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
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
                )}
                Continue with Google
              </button>

              {!showEmailLogin ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full"
                  disabled={isLoading || isGoogleLoading}
                  onClick={() => {
                    setShowEmailLogin(true);
                    setShowEmailLoginForGoogle(false);
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
                      onChange={(e) => {
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
                    {isProviderLookupPending ? (
                      <p className="text-center text-xs text-content-tertiary">
                        Checking sign-in options...
                      </p>
                    ) : shouldHideEmailLogin ? (
                      <>
                        <p className="text-center text-xs text-content-secondary">
                          This account uses Google sign-in.
                        </p>
                        <Button
                          type="button"
                          className="w-full"
                          disabled={isLoading || isGoogleLoading}
                          onClick={handleGoogleLogin}
                        >
                          Continue with Google
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          disabled={isLoading || isGoogleLoading}
                          onClick={() => {
                            setShowEmailLoginForGoogle(true);
                            setError('');
                            setPassword('');
                          }}
                        >
                          Use email instead
                        </Button>
                      </>
                    ) : (
                      <>
                        <Input
                          label="Password"
                          type="password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (error) setError('');
                          }}
                          placeholder="••••••••"
                          leftIcon={<Lock className="w-4 h-4" />}
                          autoComplete="current-password"
                          autoFocus={showEmailLoginForGoogle && providerHint === 'google'}
                          disabled={isLoading || isGoogleLoading}
                          required
                        />

                        <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                          {isLoading ? 'Signing in...' : 'Sign In'}
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
                        setShowEmailLoginForGoogle(false);
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
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setMode('role');
                    setShowEmailLogin(false);
                    setShowEmailLoginForGoogle(false);
                    setPassword('');
                    setError('');
                  }}
                  className="text-brand hover:underline font-medium"
                >
                  Sign up
                </button>
              </p>

              {showEmailLogin && !shouldHideEmailLogin && !isProviderLookupPending && (
                <p className="text-center text-sm text-content-tertiary mt-2">
                  <Link href="/auth/forgot-password" className="text-brand hover:underline">
                    Forgot password?
                  </Link>
                </p>
              )}
            </>
          )}

          {/* Role Selection Mode */}
          {mode === 'role' && (
            <>
              <button
                onClick={() => {
                  setMode('login');
                  setShowEmailLogin(false);
                  setShowEmailLoginForGoogle(false);
                  setPassword('');
                  setError('');
                }}
                className="inline-flex items-center gap-2 text-sm text-content-tertiary hover:text-content-primary transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </button>

              <h2 className="text-xl font-semibold text-content-primary mb-2">
                How do you work?
              </h2>
              <p className="text-content-secondary text-sm mb-6">
                This helps us customize your experience
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setHasManager(false);
                    setMode('signup');
                    setShowEmailLogin(false);
                    setShowEmailLoginForGoogle(false);
                    setPassword('');
                    setError('');
                  }}
                  className="w-full p-4 rounded-xl border border-stroke-default bg-bg-elevated hover:bg-bg-hover transition-colors text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-brand/10 flex items-center justify-center">
                      <Users className="w-6 h-6 text-brand" />
                    </div>
                    <div>
                      <p className="font-medium text-content-primary">I'm an Artist Manager</p>
                      <p className="text-sm text-content-tertiary">I manage one or more artists</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setHasManager(true);
                    setMode('signup');
                    setShowEmailLogin(false);
                    setShowEmailLoginForGoogle(false);
                    setPassword('');
                    setError('');
                  }}
                  className="w-full p-4 rounded-xl border border-stroke-default bg-bg-elevated hover:bg-bg-hover transition-colors text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-status-info/12 flex items-center justify-center">
                      <User className="w-6 h-6 text-status-info" />
                    </div>
                    <div>
                      <p className="font-medium text-content-primary">I'm an Artist</p>
                      <p className="text-sm text-content-tertiary">I have a manager who handles my releases</p>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Signup Mode */}
          {mode === 'signup' && (
            <>
              <button
                onClick={() => {
                  setMode('role');
                  setShowEmailLogin(false);
                  setShowEmailLoginForGoogle(false);
                  setPassword('');
                  setError('');
                }}
                className="inline-flex items-center gap-2 text-sm text-content-tertiary hover:text-content-primary transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <h2 className="text-xl font-semibold text-content-primary mb-6">
                Create your account
              </h2>

              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-zinc-100 text-black font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
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
                )}
                Continue with Google
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stroke-subtle" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-bg-surface text-content-tertiary">or</span>
                </div>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                <Input
                  label="Full Name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="John Doe"
                  leftIcon={<UserCircle className="w-4 h-4" />}
                  disabled={isLoading || isGoogleLoading}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => {
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
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-4 h-4" />}
                  autoComplete="new-password"
                  disabled={isLoading || isGoogleLoading}
                  required
                />

                {error && (
                  <p className="text-sm text-red-500 text-center">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>

              <p className="text-center text-sm text-content-tertiary mt-6">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setMode('login');
                    setShowEmailLogin(false);
                    setShowEmailLoginForGoogle(false);
                    setPassword('');
                    setError('');
                  }}
                  className="text-brand hover:underline font-medium"
                >
                  Sign in
                </button>
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
