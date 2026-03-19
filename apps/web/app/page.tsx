'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      router.replace(isAuthenticated ? '/dashboard' : '/auth');
    }, 600);
    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading, router]);

  return <LoadingScreen variant="shell" title="Opening Urganize" description="Checking your session and routing you to the right workspace." />;
}
