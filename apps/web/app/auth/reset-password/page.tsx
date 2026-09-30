'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@urganize/ui';
import { Input } from '@urganize/ui';
import { Card } from '@urganize/ui';
import { Logo } from '@urganize/ui';
import { ArrowLeft, Lock, CheckCircle, AlertCircle } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from "@/lib/errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  // Check if user has a valid recovery session
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // User should have a session from clicking the reset link
      if (session) {
        setIsValidSession(true);
      } else {
        setIsValidSession(false);
      }
    };

    checkSession();

    // Listen for auth state changes (when user clicks reset link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, _session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;

      setIsSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/auth');
      }, 3000);
    } catch (err) {
      setError(errorMessage(err, 'Failed to reset password. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div role="main" className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-bg-base" />
        <div className="urg-blob absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-brand/3 rounded-full blur-[100px]" />
        
        <div className="w-full max-w-[420px] relative z-10 text-center">
          <Logo size="xl" className="justify-center mb-4" priority />
          <p className="text-sm uppercase tracking-[0.22em] text-content-tertiary">Password reset</p>
          <p className="mt-3 text-content-secondary">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  // Invalid or expired link
  if (isValidSession === false) {
    return (
      <div role="main" className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-bg-base" />
        <div className="urg-blob absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-brand/3 rounded-full blur-[100px]" />
        
        <div className="w-full max-w-[420px] relative z-10">
          <div className="text-center mb-8 animate-in">
            <Logo size="xl" className="justify-center mb-4" priority />
            <p className="text-sm uppercase tracking-[0.22em] text-content-tertiary">Password reset</p>
          </div>

          <Card
            className="animate-in delay-1 rounded-3xl border border-stroke-default bg-bg-surface/95 shadow-[0_20px_80px_-46px_rgb(var(--shadow-ink)/calc(0.62*var(--shadow-alpha-scale)))] backdrop-blur-xl"
            padding="lg"
          >
            <div className="text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-status-error/15 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-status-error" />
              </div>
              
              <div>
                <h1 className="text-xl font-semibold text-content-primary mb-1">
                  Invalid or expired link
                </h1>
                <p className="text-sm text-content-tertiary">
                  This reset link is invalid or expired. Request a new one.
                </p>
              </div>

              <Link href="/auth/forgot-password">
                <Button className="w-full">
                  Request new link
                </Button>
              </Link>

              <Link 
                href="/auth"
                className="inline-flex items-center justify-center gap-1.5 text-sm text-content-tertiary hover:text-content-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div role="main" className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-bg-base" />
      <div className="urg-blob absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-brand/3 rounded-full blur-[100px]" />
      
      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-in">
          <Logo size="xl" className="justify-center mb-4" priority />
          <p className="text-sm uppercase tracking-[0.22em] text-content-tertiary">Password reset</p>
        </div>

        {/* Reset Password Card */}
        <Card
          className="animate-in delay-1 rounded-3xl border border-stroke-default bg-bg-surface/95 shadow-[0_20px_80px_-46px_rgb(var(--shadow-ink)/calc(0.62*var(--shadow-alpha-scale)))] backdrop-blur-xl"
          padding="lg"
        >
          {!isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center mb-6">
                <h1 className="text-xl font-semibold text-content-primary mb-1">
                  Set new password
                </h1>
                <p className="text-sm text-content-tertiary">
                  Your new password must be at least 8 characters.
                </p>
              </div>

              {error && (
                <div role="alert" className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-sm animate-bounce-in">
                  {error}
                </div>
              )}

              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Reset password
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-brand/15 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-brand" />
              </div>
              
              <div>
                <h1 className="text-xl font-semibold text-content-primary mb-1">
                  Password reset successful
                </h1>
                <p className="text-sm text-content-tertiary">
                  Your password has been updated. Redirecting to login...
                </p>
              </div>

              <Link href="/auth">
                <Button variant="secondary" className="w-full">
                  Go to login
                </Button>
              </Link>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-content-tertiary mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}

