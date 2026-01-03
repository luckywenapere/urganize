'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ArrowLeft, User, Users, Mail, Lock, UserCircle } from 'lucide-react';

type AuthMode = 'login' | 'role' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const { login, signup } = useAuthStore();
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [hasManager, setHasManager] = useState<boolean | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
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
      router.push('/dashboard');
    } catch {
      setError('Signup failed. Please try again.');
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

        {/* Auth Card */}
        <Card className="animate-in delay-1" padding="lg">
          {/* === LOGIN === */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-content-primary mb-1">
                  Welcome back
                </h2>
                <p className="text-sm text-content-tertiary">
                  Sign in to continue to your releases
                </p>
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

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Sign In
              </Button>

              <p className="text-center text-sm text-content-tertiary">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('role')}
                  className="text-brand hover:underline font-medium"
                >
                  Sign up
                </button>
              </p>
            </form>
          )}

          {/* === ROLE SELECTION === */}
          {mode === 'role' && (
            <div className="space-y-5">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-content-primary mb-1">
                  Get started
                </h2>
                <p className="text-sm text-content-tertiary">
                  First, tell us about yourself
                </p>
              </div>

              <p className="text-sm font-medium text-content-secondary text-center py-2">
                Do you currently have a manager?
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => { setHasManager(true); setMode('signup'); }}
                  className="w-full p-4 rounded-xl border border-stroke-default bg-bg-elevated hover:bg-bg-hover hover:border-stroke-strong transition-all duration-fast group text-left flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-fast">
                    <User className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-content-primary mb-0.5 group-hover:text-brand transition-colors">
                      Yes, I have a manager
                    </div>
                    <div className="text-sm text-content-tertiary">
                      Set up as an artist with collaboration access
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => { setHasManager(false); setMode('signup'); }}
                  className="w-full p-4 rounded-xl border border-stroke-default bg-bg-elevated hover:bg-bg-hover hover:border-stroke-strong transition-all duration-fast group text-left flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-fast">
                    <Users className="w-5 h-5 text-brand" />
                  </div>
                  <div>
                    <div className="font-semibold text-content-primary mb-0.5 group-hover:text-brand transition-colors">
                      No, I manage myself
                    </div>
                    <div className="text-sm text-content-tertiary">
                      Full access to all management features
                    </div>
                  </div>
                </button>
              </div>

              <p className="text-center text-sm text-content-tertiary">
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-brand hover:underline font-medium">
                  Sign in
                </button>
              </p>
            </div>
          )}

          {/* === SIGNUP === */}
          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-5">
              <div>
                <button
                  type="button"
                  onClick={() => setMode('role')}
                  className="inline-flex items-center gap-1.5 text-sm text-content-tertiary hover:text-content-primary transition-colors mb-4"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-content-primary mb-1">
                    Create your account
                  </h2>
                  <span className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full ${
                    hasManager 
                      ? 'bg-purple-500/15 text-purple-400' 
                      : 'bg-brand/15 text-brand'
                  }`}>
                    {hasManager ? 'Artist Account' : 'Manager Account'}
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Your Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                leftIcon={<UserCircle className="w-4 h-4" />}
                required
              />

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail className="w-4 h-4" />}
                required
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                hint="Minimum 8 characters"
                required
              />

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Create Account
              </Button>

              <p className="text-center text-sm text-content-tertiary">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-brand hover:underline font-medium"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}
        </Card>

        <p className="text-center text-xs text-content-quaternary mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
