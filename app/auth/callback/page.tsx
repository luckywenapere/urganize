'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { checkAuth } = useAuthStore();
  const handledRef = useRef(false);

  const isAbortError = (error: any) => {
    const name = String(error?.name || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return name === 'aborterror' || message.includes('aborted') || message.includes('operation was aborted');
  };

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const handleCallback = async () => {
      try {
        const next = searchParams.get('next');
        const safeNext = next && next.startsWith('/') ? next : '/dashboard';

        // Ensure session is hydrated from hash fragments (OAuth implicit callback).
        const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            console.error('Auth callback setSession error:', setSessionError);
          }
        }

        let session = (await supabase.auth.getSession()).data.session;
        if (!session && accessToken) {
          // One short retry for eventual consistency after OAuth hash handling.
          await new Promise((resolve) => setTimeout(resolve, 150));
          session = (await supabase.auth.getSession()).data.session;
        }

        if (!session) {
          router.replace('/auth?error=callback_no_session');
          return;
        }

        // Profile sync should not block login completion.
        const fallbackName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User';
        const fallbackRole = session.user.user_metadata?.role || 'artist-manager';
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: session.user.id,
              email: session.user.email,
              name: fallbackName,
              role: fallbackRole,
            },
            { onConflict: 'id' }
          );
        if (upsertError) {
          console.error('Profile upsert error:', upsertError);
        }

        try {
          await checkAuth();
        } catch (error) {
          if (!isAbortError(error)) {
            throw error;
          }
        }

        if (searchParams.get('reauth') === '1') {
          localStorage.setItem('urganize.reauth.ts', String(Date.now()));
        }

        router.replace(safeNext);
      } catch (error) {
        console.error('Auth callback fatal error:', error);
        if (isAbortError(error)) {
          // Retry once on aborted callbacks.
          setTimeout(() => {
            router.replace('/auth/callback');
          }, 120);
          return;
        }
        router.replace('/auth?error=callback_failed');
      }
    };

    handleCallback();
  }, [router, checkAuth, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white">Signing you in...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
