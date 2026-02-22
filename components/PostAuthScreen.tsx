'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

type RoleOption = 'manager' | 'artist-team' | 'artist';

export function PostAuthScreen() {
  const router = useRouter();
  const { updateRole, logout } = useAuthStore();
  const [step, setStep] = useState<'continue' | 'role'>('continue');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleRoleSelect = async (role: RoleOption) => {
    try {
      setIsSubmitting(true);
      setError('');
      await updateRole(role);
      router.push('/dashboard');
    } catch {
      setError('Failed to save role. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToAuth = async () => {
    await logout();
    router.push('/auth');
  };

  if (step === 'continue') {
    return (
      <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
        <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2">
          <svg
            viewBox="0 0 240 240"
            className="h-auto w-[clamp(128px,30vw,204px)]"
            aria-hidden="true"
          >
            <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <path
                d="M44 116c0-43.2 34.8-78 76-78s76 34.8 76 78"
                strokeWidth="18"
              />
              <rect x="54" y="64" width="48" height="96" rx="23" fill="currentColor" stroke="none" />
              <rect x="138" y="64" width="48" height="96" rx="23" fill="currentColor" stroke="none" />
              <path d="M44 116c0 45.6 32.8 82 76 82s76-36.4 76-82" strokeWidth="14" />
            </g>
          </svg>
        </div>

        <button
          type="button"
          onClick={() => setStep('role')}
          className="absolute left-1/2 top-[72%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(2.1rem,6.5vw,3.25rem)] font-normal leading-none tracking-tight text-white/95"
        >
          Continue..
        </button>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[900px] flex-col px-6 py-16 sm:px-12 sm:py-20">
        <button
          type="button"
          onClick={handleBackToAuth}
          className="w-fit text-[clamp(2rem,5.5vw,3.2rem)] leading-none tracking-tight text-white/90"
        >
          ...Back
        </button>

        <h1 className="mt-[22vh] text-[clamp(2.4rem,7vw,5rem)] font-normal leading-none tracking-tight text-white/95 sm:mt-[18vh]">
          Select Your Role.
        </h1>

        <div className="mt-24 w-full max-w-[640px] space-y-4 sm:mt-20">
          <button
            type="button"
            onClick={() => handleRoleSelect('manager')}
            disabled={isSubmitting}
            className="flex w-full items-center justify-between text-left text-[clamp(2rem,4.5vw,3.3rem)] leading-none tracking-tight text-white/95 disabled:opacity-60"
          >
            <span>Artist Manager</span>
            <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[#138f10] sm:border-y-[20px] sm:border-r-[38px]" />
          </button>

          <button
            type="button"
            onClick={() => handleRoleSelect('artist-team')}
            disabled={isSubmitting}
            className="flex w-full items-center justify-between text-left text-[clamp(2rem,4.5vw,3.3rem)] leading-none tracking-tight text-white/95 disabled:opacity-60"
          >
            <span>Artist Team</span>
            <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[#138f10] sm:border-y-[20px] sm:border-r-[38px]" />
          </button>

          <button
            type="button"
            onClick={() => handleRoleSelect('artist')}
            disabled={isSubmitting}
            className="flex w-full items-center justify-between text-left text-[clamp(2rem,4.5vw,3.3rem)] leading-none tracking-tight text-white/95 disabled:opacity-60"
          >
            <span>Artist</span>
            <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[#138f10] sm:border-y-[20px] sm:border-r-[38px]" />
          </button>
        </div>

        {error && (
          <p className="mt-8 text-base text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
