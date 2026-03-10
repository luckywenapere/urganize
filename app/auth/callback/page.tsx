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

        const { data: existingProfile, error: existingProfileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();
        if (existingProfileError) {
          console.warn('Profile existence check warning:', existingProfileError.message);
        }
        const isFirstLogin = !existingProfile?.id;

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

        const hasExplicitNext = Boolean(next && next.startsWith('/'));
        const destination = isFirstLogin && !hasExplicitNext
          ? '/dashboard?startOnboarding=0&flow=first-login'
          : safeNext;

        window.clearTimeout(timeout);
        router.replace(destination);
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-base text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-190px] h-[340px] w-[340px] -translate-x-1/2 rounded-full bg-brand/12 blur-[135px]" />
      </div>
      <div className="relative w-full max-w-md rounded-3xl border border-stroke-default bg-bg-surface/95 p-8 text-center shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-content-primary border-t-transparent" />
        <p className="text-sm uppercase tracking-[0.22em] text-content-tertiary">Release command center</p>
        <p className="mt-3">Signing you in...</p>
      </div>
    </div>
  );
}
