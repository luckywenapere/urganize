'use client';

import { Suspense, type ReactNode, useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { identifyAnalyticsUser, resetAnalyticsUser } from '@/lib/analytics';
import { PostHogPageView } from '@/components/providers/PostHogPageView';
import { loadClarity } from '@/lib/analytics/clarity';

type PostHogProviderProps = {
  children: ReactNode;
};

export function PostHogProvider({ children }: PostHogProviderProps) {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    loadClarity();
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      identifyAnalyticsUser(user);
      return;
    }

    resetAnalyticsUser();
  }, [isAuthenticated, user]);

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
    </>
  );
}
