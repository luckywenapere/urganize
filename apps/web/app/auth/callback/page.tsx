'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH, resolveHomePath } from '@/lib/home-path';

// Roles a signup may carry in auth metadata. 'curator' is here so a playlist
// owner signing in with Google keeps their role through this fallback upsert
// instead of being written back to 'artist-manager'.
const ALLOWED_ROLES = new Set(['artist', 'manager', 'artist-team', 'artist-manager', 'curator']);

export default function AuthCallbackPage() {
  const router = useRouter();
  const { checkAuth } = useAuthStore();
  const handledRef = useRef(false);

  const isAbortError = (error: unknown) => {
    const name = String((error as { name?: string } | null)?.name || '').toLowerCase();
    const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
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
        const safeNext = next && next.startsWith('/') ? next : HOME_PATH;

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
          // PostgrestError from supabase-js exposes code/details/hint directly.
          console.warn('Profile sync warning:', {
            message: upsertError.message,
            code: upsertError.code,
            details: upsertError.details,
            hint: upsertError.hint,
          });
        }

        try {
          await checkAuth({ force: true });
        } catch (error) {
          if (!isAbortError(error)) {
            throw error;
          }
        }

        if (url.searchParams.get('reauth') === '1') {
          // Best-effort only — a restricted storage context (some embedded
          // webviews) throwing here must not fail a sign-in that otherwise
          // succeeded; the outer catch below would wrongly redirect to
          // /auth?error=callback_failed for what is just a missed timestamp.
          try {
            localStorage.setItem('urganize.reauth.ts', String(Date.now()));
          } catch {
            // Ignore — nothing downstream depends on this succeeding.
          }
        }

        // Role-aware landing: a curator cannot open any dashboard route, so
        // HOME_PATH would bounce them straight back out. checkAuth above has
        // already hydrated the profile, so the store is the freshest read here.
        // An explicit `next` still wins — that is how the curator join flow
        // returns to its own page after the OAuth round trip.
        const hasExplicitNext = Boolean(next && next.startsWith('/'));
        const destination = hasExplicitNext
          ? safeNext
          : resolveHomePath(useAuthStore.getState().user?.role);

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

  return <LoadingScreen title="Finishing sign-in" />;
}
