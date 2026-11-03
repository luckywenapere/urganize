'use client';

// Self-serve checkout (2026-10-22): the one-time welcome after paying. One
// clear next step (start the first rollout) and, for Manager and Label, a
// quiet offer of a 15-minute setup call. Shown once per account on this
// device; a second visit goes straight to Home.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo, LoadingMark } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { useShellStore } from '@/stores/useShellStore';
import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { HOME_PATH } from '@/lib/home-path';
import { offersSetupCall, setupCallUrl } from '@/lib/self-serve';
import { readStoredFlag, writeStoredFlag } from '@/lib/self-serve-client';

const STEPS = ['Add your release and its date', 'Get a week-by-week plan', 'Bring in the people doing the work'];

function firstNameOf(name: string | null | undefined): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export default function WelcomePageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const openCreate = useShellStore((state) => state.openCreate);
  const [plan, setPlan] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const reported = useRef(false);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/auth');
      return;
    }
    const key = `urganize.welcome-seen.${user.id}`;
    if (readStoredFlag(key)) {
      router.replace(HOME_PATH);
      return;
    }
    writeStoredFlag(key);
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const response = await fetch('/api/subscription-status', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          const payload = (await response.json().catch(() => ({}))) as { plan?: string | null };
          if (!cancelled) setPlan(typeof payload.plan === 'string' ? payload.plan : null);
        }
      } catch {
        // The call offer just stays hidden.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, router, user]);

  useEffect(() => {
    if (!ready || reported.current || !user) return;
    reported.current = true;
    captureAnalyticsEvent(createPostHogEvent('welcome_viewed', { path: 'self_serve', plan }), { userId: user.id });
  }, [plan, ready, user]);

  if (!ready || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingMark />
      </main>
    );
  }

  const callUrl = offersSetupCall(plan) ? setupCallUrl() : null;
  const firstName = firstNameOf(user.name);

  return (
    <main className="flex min-h-screen justify-center px-6 pb-12 pt-[8vh]">
      <div className="w-full max-w-md space-y-6">
        <Logo />
        <h1 className="font-display text-3xl leading-tight text-content-primary">
          {firstName ? `Welcome, ${firstName}. ` : 'Welcome. '}Let&apos;s plan your next release.
        </h1>
        <p className="text-content-secondary">
          Add the release you&apos;re working on. AI writes the plan in under a minute, and you change anything you
          like.
        </p>
        <ol className="divide-y divide-stroke-subtle rounded-2xl border border-stroke-default bg-bg-surface px-5">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3 py-3.5">
              <span className="font-mono text-brand">{String(index + 1).padStart(2, '0')}</span>
              <span className="text-content-primary">{step}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            openCreate('template');
            router.replace(HOME_PATH);
          }}
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-base font-semibold text-content-inverse hover:bg-brand-hover"
        >
          Start your first rollout
        </button>
        {callUrl ? (
          <a
            href={callUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              captureAnalyticsEvent(
                createPostHogEvent('setup_call_clicked', { path: 'self_serve', plan, source: 'welcome' }),
                { userId: user.id }
              )
            }
            className="flex min-h-12 w-full items-center justify-center rounded-full px-5 text-base font-semibold text-content-primary hover:bg-bg-hover"
          >
            Book a 15-minute setup call
          </a>
        ) : null}
      </div>
    </main>
  );
}
