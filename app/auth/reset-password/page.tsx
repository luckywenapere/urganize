'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ArrowLeft, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-bg-base" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-brand/3 rounded-full blur-[100px]" />
        
        <div className="w-full max-w-[400px] relative z-10 text-center">
          <Logo size="xl" className="justify-center mb-4" />
          <p className="text-content-secondary">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  // Invalid or expired link
  if (isValidSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-bg-base" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-brand/3 rounded-full blur-[100px]" />
        
        <div className="w-full max-w-[400px] relative z-10">
          <div className="text-center mb-8 animate-in">
            <Logo size="xl" className="justify-center mb-4" />
            <p className="text-content-secondary">
              The operating system for music careers
            </p>
          </div>

          <Card className="animate-in delay-1" padding="lg">
            <div className="text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-status-error/15 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-status-error" />
              </div>
              
              <div>
                <h2 className="text-xl font-semibold text-content-primary mb-1">
                  Invalid or expired link
                </h2>
                <p className="text-sm text-content-tertiary">
                  This password reset link is invalid or has expired. Please request a new one.
                </p>
              </div>

              <Link href="/auth/forgot-password">
                <Button className="w-full">
                  Request New Link
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-bg-base" />
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-brand/3 rounded-full blur-[100px]" />
      
      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-in">
          <Logo size="xl" className="justify-center mb-4" />
          <p className="text-content-secondary">
            The operating system for music careers
          </p>
        </div>

        {/* Reset Password Card */}
        <Card className="animate-in delay-1" padding="lg">
          {!isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-content-primary mb-1">
                  Set new password
                </h2>
                <p className="text-sm text-content-tertiary">
                  Your new password must be at least 8 characters.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-sm animate-bounce-in">
                  {error}
                </div>
              )}

              <Input
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              <Input
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Reset Password
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-brand/15 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-brand" />
              </div>
              
              <div>
                <h2 className="text-xl font-semibold text-content-primary mb-1">
                  Password reset successful
                </h2>
                <p className="text-sm text-content-tertiary">
                  Your password has been updated. Redirecting you to login...
                </p>
              </div>

              <Link href="/auth">
                <Button variant="secondary" className="w-full">
                  Go to Login
                </Button>
              </Link>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-content-quaternary mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}