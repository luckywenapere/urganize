'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (resetError) throw resetError;

      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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

        {/* Forgot Password Card */}
        <Card className="animate-in delay-1" padding="lg">
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Link 
                  href="/auth"
                  className="inline-flex items-center gap-1.5 text-sm text-content-tertiary hover:text-content-primary transition-colors mb-4"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </Link>
                
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-content-primary mb-1">
                    Forgot your password?
                  </h2>
                  <p className="text-sm text-content-tertiary">
                    No worries, we'll send you reset instructions.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-sm animate-bounce-in">
                  {error}
                </div>
              )}

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail className="w-4 h-4" />}
                required
              />

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Send Reset Link
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-5">
              <div className="w-12 h-12 rounded-full bg-brand/15 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-brand" />
              </div>
              
              <div>
                <h2 className="text-xl font-semibold text-content-primary mb-1">
                  Check your email
                </h2>
                <p className="text-sm text-content-tertiary">
                  We sent a password reset link to
                </p>
                <p className="text-sm font-medium text-content-primary mt-1">
                  {email}
                </p>
              </div>

              <p className="text-sm text-content-tertiary">
                Didn't receive the email?{' '}
                <button
                  type="button"
                  onClick={() => setIsSubmitted(false)}
                  className="text-brand hover:underline font-medium"
                >
                  Click to resend
                </button>
              </p>

              <Link 
                href="/auth"
                className="inline-flex items-center justify-center gap-1.5 text-sm text-content-tertiary hover:text-content-primary transition-colors mt-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
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