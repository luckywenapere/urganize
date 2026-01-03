'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function AuthPage() {
  const router = useRouter();
  const { login, signup } = useAuthStore();
  
  const [mode, setMode] = useState<'login' | 'signup' | 'role'>('login');
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
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleSelection = (hasManagerValue: boolean) => {
    setHasManager(hasManagerValue);
    setMode('signup');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const role = hasManager ? 'artist' : 'artist-manager';
      await signup(email, password, name, role);
      router.push('/dashboard');
    } catch (err) {
      setError('Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 via-transparent to-blue-600/10 blur-3xl" />
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold font-display tracking-tight mb-2">
            Urganize
          </h1>
          <p className="text-slate-400">Where music careers stop being chaotic</p>
        </div>

        <Card className="p-8">
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Welcome back</h2>
                <p className="text-slate-400 text-sm">Sign in to continue to your releases</p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
              >
                Sign In
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setMode('role')}
                  className="text-sm text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  Don't have an account? <span className="font-semibold">Sign up</span>
                </button>
              </div>
            </form>
          )}

          {mode === 'role' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Get started</h2>
                <p className="text-slate-400 text-sm">First, let us know your situation</p>
              </div>

              <div className="space-y-4">
                <div className="text-center font-medium mb-4">
                  Do you currently have a manager?
                </div>

                <button
                  onClick={() => handleRoleSelection(true)}
                  className="w-full p-6 rounded-xl border-2 border-slate-700 hover:border-emerald-500 bg-slate-800/50 hover:bg-slate-800 transition-all group text-left"
                >
                  <div className="font-semibold text-lg mb-1 group-hover:text-emerald-400 transition-colors">
                    Yes, I have a manager
                  </div>
                  <div className="text-sm text-slate-400">
                    You'll be set up as an artist with collaboration access
                  </div>
                </button>

                <button
                  onClick={() => handleRoleSelection(false)}
                  className="w-full p-6 rounded-xl border-2 border-slate-700 hover:border-emerald-500 bg-slate-800/50 hover:bg-slate-800 transition-all group text-left"
                >
                  <div className="font-semibold text-lg mb-1 group-hover:text-emerald-400 transition-colors">
                    No, I manage myself
                  </div>
                  <div className="text-sm text-slate-400">
                    You'll get full access to all management features
                  </div>
                </button>
              </div>

              <div className="text-center">
                <button
                  onClick={() => setMode('login')}
                  className="text-sm text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  Already have an account? <span className="font-semibold">Sign in</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-6">
              <div>
                <button
                  type="button"
                  onClick={() => setMode('role')}
                  className="text-sm text-slate-400 hover:text-emerald-400 transition-colors mb-4 flex items-center gap-1"
                >
                  ← Back
                </button>
                <h2 className="text-2xl font-bold mb-2">Create your account</h2>
                <p className="text-slate-400 text-sm">
                  {hasManager ? 'Artist account' : 'Artist-Manager account'}
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                helperText="Minimum 8 characters"
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
              >
                Create Account
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-sm text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  Already have an account? <span className="font-semibold">Sign in</span>
                </button>
              </div>
            </form>
          )}
        </Card>

        <div className="mt-6 text-center text-sm text-slate-500">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </div>
      </div>
    </div>
  );
}
