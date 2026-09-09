'use client';

// The OAuth consent screen (2026-08-25). The one place a human decides that an
// outside LLM may read — and change — their releases.
//
// WHY THE PARAMS ARE READ POST-MOUNT AND NOT VIA useSearchParams:
// this app has been bitten by that hook twice. In a statically prerendered
// client component it makes Next bail out to the nearest Suspense boundary, so
// the HTML served is loading.tsx and the page never renders on the server at
// all — the weak-connection dead end of 2026-08-13, and again on the curator
// invite page in 2026-08-14. The params here are read once, from
// window.location, in a pre-paint layout effect. They never change without a
// navigation, so there is nothing to subscribe to.
//
// WHY THE DECISION IS NOT SERVER-RENDERED: auth in this app is client-side
// localStorage Supabase, so the server cannot know whether anyone is signed in.
// What IS rendered immediately is the frame and the explanation; only the
// Allow/Deny pair waits on the session. An unsigned visitor is sent to /auth
// with a `next` that brings them straight back here.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { getAccessToken } from '@/components/settings/getAccessToken';


// Read inline at module scope rather than through lib/mcp/config's
// isMcpConnectEnabled: that module imports node:crypto for the founder key's
// constant-time compare, and pulling it into a client component drags a Node
// builtin into the browser bundle. Every other flag-gated component in this app
// reads its own one-liner for the same reason (see EpkSection, NotesPageClient).
const MCP_CONNECT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MCP_CONNECT === 'true';

type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  scope: string;
};

const EMPTY_PARAMS: AuthorizeParams = {
  clientId: '',
  redirectUri: '',
  state: '',
  codeChallenge: '',
  codeChallengeMethod: 'S256',
  resource: '',
  scope: '',
};

/**
 * Send the browser back to the client with an error, per RFC 6749 §4.1.2.1 —
 * but ONLY when we already know the redirect_uri is one the client registered.
 * Bouncing an error to an unvalidated URI would be the open redirect this whole
 * flow is careful to avoid, so an unknown target is rendered on this page
 * instead.
 */
function buildRedirect(base: string, params: Record<string, string>): string | null {
  try {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export default function AuthorizePageClient() {
  const [params, setParams] = useState<AuthorizeParams>(EMPTY_PARAMS);
  const [paramsReady, setParamsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const search = new URLSearchParams(window.location.search);
    setParams({
      clientId: search.get('client_id')?.trim() || '',
      redirectUri: search.get('redirect_uri')?.trim() || '',
      state: search.get('state')?.trim() || '',
      codeChallenge: search.get('code_challenge')?.trim() || '',
      codeChallengeMethod: search.get('code_challenge_method')?.trim() || 'S256',
      resource: search.get('resource')?.trim() || '',
      scope: search.get('scope')?.trim() || '',
    });
    setParamsReady(true);
  }, []);

  // Not signed in → /auth, carrying the full authorization URL so the client's
  // flow survives the detour.
  useEffect(() => {
    if (!paramsReady || authLoading || isAuthenticated) return;
    if (typeof window === 'undefined') return;
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/auth?next=${encodeURIComponent(next)}`);
  }, [paramsReady, authLoading, isAuthenticated]);

  const handleDeny = useCallback(() => {
    const target = params.redirectUri
      ? buildRedirect(params.redirectUri, {
          error: 'access_denied',
          error_description: 'The user declined the request.',
          state: params.state,
        })
      : null;
    if (target) {
      window.location.replace(target);
      return;
    }
    setError('Request declined. You can close this window.');
  }, [params.redirectUri, params.state]);

  const handleAllow = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Your session expired. Sign in again and reopen the link from your app.');
        return;
      }
      const response = await fetch('/api/oauth/authorize/grant', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          client_id: params.clientId,
          redirect_uri: params.redirectUri,
          code_challenge: params.codeChallenge,
          code_challenge_method: params.codeChallengeMethod,
          resource: params.resource,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error_description?: string;
        error?: string;
      };
      if (!response.ok || !payload.code) {
        setError(
          payload.error_description || payload.error || 'That connection request is not valid.'
        );
        return;
      }
      // The server validated redirect_uri against the registered set before
      // minting, so by this point the target is known-good.
      const target = buildRedirect(params.redirectUri, {
        code: payload.code,
        state: params.state,
      });
      if (!target) {
        setError('That app sent an address we cannot return to.');
        return;
      }
      window.location.replace(target);
    } catch {
      setError('Something went wrong connecting that app. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, params]);

  if (!MCP_CONNECT_ENABLED) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
        <h1 className="font-display text-2xl text-content-primary">Not available</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Connecting outside apps is not switched on for your team yet.
        </p>
      </main>
    );
  }

  const missingParams = paramsReady && (!params.clientId || !params.redirectUri);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="flex items-center gap-2 text-brand">
        <ShieldCheck className="h-5 w-5" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">Connect an app</span>
      </div>

      <h1 className="mt-4 font-display text-2xl leading-snug text-content-primary">
        Let this app read and update your releases?
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-content-secondary">
        It will be able to see your releases, your activities and your notes, and to add or change
        them. It cannot delete anything, and it cannot see another team&rsquo;s work.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-content-secondary">
        You can disconnect it any time in Settings.
      </p>

      {missingParams ? (
        <p className="mt-6 rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          That link is incomplete. Start the connection again from the app you are connecting.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error"
        >
          {error}
        </p>
      ) : null}

      {/* The frame above renders immediately; only the decision waits on the
          session, so a slow connection shows the explanation rather than a bare
          spinner. */}
      {!paramsReady || authLoading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-content-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking your account…
        </div>
      ) : isAuthenticated && !missingParams ? (
        <>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleAllow()}
              disabled={isSubmitting}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isSubmitting ? 'Connecting…' : 'Allow'}
            </button>
            <button
              type="button"
              onClick={handleDeny}
              disabled={isSubmitting}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-stroke-default bg-bg-elevated px-4 text-sm font-medium text-content-primary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Deny
            </button>
          </div>
          {user?.email ? (
            <p className="mt-4 text-xs text-content-tertiary">Signed in as {user.email}</p>
          ) : null}
        </>
      ) : null}

      <noscript>
        <p className="mt-8 text-sm text-status-warning">
          Connecting an app needs JavaScript switched on.
        </p>
      </noscript>
    </main>
  );
}
