'use client';

// "While you wait: how did you hear about Urganize?" (#854, spec S5). Moved
// off the account form to the 10 to 40 seconds the first plan takes to build,
// above that build so it is seen during the wait it fills. One tap, "Thanks.",
// then gone for good. Same options and storage as before (lib/heard-from.ts,
// saved to user metadata by PATCH /api/user/onboarding).

import { useEffect, useState } from 'react';
import { HEARD_FROM_OPTIONS, type HeardFromSource } from '@/lib/heard-from';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { readOnboardingLanding, updateOnboardingLanding } from '@/lib/onboarding-landing';

export function OnboardingHeardFromRow({ releaseId }: { releaseId: string }) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [state, setState] = useState<'hidden' | 'asking' | 'thanks'>('hidden');

  useEffect(() => {
    const landing = readOnboardingLanding(userId);
    setState(landing?.askHeardFrom && landing.releaseId === releaseId ? 'asking' : 'hidden');
  }, [userId, releaseId]);

  useEffect(() => {
    if (state !== 'thanks') return;
    const timer = window.setTimeout(() => setState('hidden'), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state === 'hidden') return null;

  const answer = async (source: HeardFromSource) => {
    setState('thanks');
    updateOnboardingLanding({ askHeardFrom: false });
    captureAnalyticsEvent({ name: 'onboarding_heard_from', properties: { source } });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ heardFrom: source }),
      });
    } catch {
      // Optional, and never worth an error on the rollout page.
    }
  };

  return (
    <div className="mb-3 rounded-2xl border border-stroke-control bg-bg-surface p-4" role="region" aria-label="How did you hear about Urganize?">
      {state === 'thanks' ? (
        <p className="animate-fade-in text-sm text-content-secondary">Thanks.</p>
      ) : (
        <>
          <p className="mb-2.5 text-sm text-content-primary">While you wait: how did you hear about Urganize?</p>
          <div className="flex flex-wrap gap-2">
            {HEARD_FROM_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => void answer(option.value)}
                className="motion-press inline-flex min-h-10 items-center rounded-full border border-stroke-control bg-bg-base px-3.5 text-sm text-content-primary transition-colors hover:bg-bg-hover"
              >
                {option.value === 'x' ? 'X' : option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
