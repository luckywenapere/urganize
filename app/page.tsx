'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { LogoIcon } from '@/components/ui/Logo';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push(isAuthenticated ? '/dashboard' : '/auth');
    }, 600);
    return () => clearTimeout(timer);
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base relative">
      {/* Glow effect */}
      <div className="absolute w-64 h-64 bg-brand/10 rounded-full blur-[80px]" />
      
      <div className="relative flex flex-col items-center gap-4 animate-in">
        {/* Logo with spin */}
        <div className="relative">
          <LogoIcon size={48} className="text-content-primary" />
          <svg 
            className="absolute inset-0 w-16 h-16 -m-2 animate-spin" 
            style={{ animationDuration: '2s' }}
            viewBox="0 0 64 64"
          >
            <circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="120 60"
              className="text-brand/30"
            />
          </svg>
        </div>
        <p className="text-sm text-content-tertiary">Loading...</p>
      </div>
    </div>
  );
}
