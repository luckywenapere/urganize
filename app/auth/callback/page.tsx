'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

const ALLOWED_ROLES = new Set(['artist', 'manager', 'artist-team', 'artist-manager']);

export default function AuthCallbackPage() {
  const router = useRouter();
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
      const timeout = window.setTimeout(() => {
        router.replace('/auth?error=callback_timeout');
      }, 7000);

      try {
        const url = new URL(window.location.href);
        const next = url.searchParams.get('next');
        const safeNext = next && next.startsWith('/') ? next : '/dashboard';

        // Handle PKCE/code flow if present.
        const code = url.searchParams.get('code');
        if (code) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) {
            console.error('Auth callback exchangeCodeForSession error:', codeError);
          }
        }

        // Handle hash token flow if present.
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
        const roleFromMetadata = session.user.user_metadata?.role;
        const fallbackRole =
          typeof roleFromMetadata === 'string' && ALLOWED_ROLES.has(roleFromMetadata)
            ? roleFromMetadata
            : 'artist-manager';
        const profilePayload = {
          id: session.user.id,
          name: fallbackName,
          role: fallbackRole,
          ...(session.user.email ? { email: session.user.email } : {}),
        };
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'id', ignoreDuplicates: true });
        if (upsertError) {
          console.warn('Profile sync warning:', {
            message: upsertError.message,
            code: (upsertError as any).code,
            details: (upsertError as any).details,
            hint: (upsertError as any).hint,
          });
        }

        try {
          await checkAuth();
        } catch (error) {
          if (!isAbortError(error)) {
            throw error;
          }
        }

        if (url.searchParams.get('reauth') === '1') {
          localStorage.setItem('urganize.reauth.ts', String(Date.now()));
        }

        window.clearTimeout(timeout);
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
        window.clearTimeout(timeout);
        router.replace('/auth?error=callback_failed');
      }
    };

    handleCallback();
  }, [router, checkAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base text-content-primary">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-content-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p>Signing you in...</p>
      </div>
    </div>
  );
}
