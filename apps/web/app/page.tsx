'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { LoadingScreen } from '@urganize/ui';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // Redirect the moment auth state is known — an earlier version parked
    // here for a fixed 600ms first, pure added latency on the app's entry.
    if (isLoading) return;
    router.replace(isAuthenticated ? '/dashboard' : '/auth');
  }, [isAuthenticated, isLoading, router]);

  return <LoadingScreen variant="shell" title="Opening Urganize" description="Checking your session and routing you to the right workspace." />;
}

