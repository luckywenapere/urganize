'use client';

// The profile growth funnel (2026-10-11): credits, claim, public page, sign-up.
// Counts and rules come from GET /api/admin/profile-funnel
// (lib/admin-profile-funnel.ts). Access is gated server-side by ADMIN_EMAILS:
// the GET doubles as the check and anyone else is sent to /dashboard, the
// /admin/nps pattern.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { stepRatioLabel, type ProfileFunnel } from '@/lib/admin-profile-funnel';

type FunnelResponse = ProfileFunnel & {
  notRead: Record<string, boolean>;
};

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return value;
  }
}

export default function ProfileFunnelAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [data, setData] = useState<FunnelResponse | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch('/api/admin/profile-funnel', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as FunnelResponse | null;
        if (!cancelled && payload) setData(payload);
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  if (authLoading || !user || !data) {
    return (
      <AdminPageSkeleton
        titleWidth="w-48"
        descriptionLines={2}
        statCards={{ count: 4, gridClassName: 'grid-cols-2 sm:grid-cols-4' }}
        table={{ columns: 3, rows: 8 }}
      />
    );
  }

  return (
    <div>
      <h1 className="mt-2 font-display text-3xl font-semibold">Profile funnel</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        The loop from a credit to a sign-up, in the last {data.windowDays} days (since {formatDate(data.since)}). Each
        step is counted on its own, not as one group of people, so a step can be bigger than the one before it. Our own
        accounts are left out.
      </p>

      <ol className="mt-6 space-y-2">
        {data.steps.map((step, index) => {
          const previous = index > 0 ? data.steps[index - 1].count : null;
          const ratio = index > 0 ? stepRatioLabel(previous, step.count) : null;
          return (
            <li
              key={step.key}
              className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-stroke-default bg-bg-surface px-5 py-4"
            >
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
                  {index + 1}. {step.label}
                </p>
                {step.aside ? (
                  <p className="mt-1 text-xs text-content-tertiary">
                    {step.aside.label}: {step.aside.count}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="font-display text-3xl font-semibold text-content-primary">
                  {step.count === null ? 'Not tracked' : step.count}
                </p>
                {ratio ? <p className="mt-1 text-xs text-content-tertiary">{ratio}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {data.notRead.growthEvents ? (
        <p className="mt-4 max-w-2xl text-xs text-content-tertiary">
          Views, taps and sign-ups are not tracked yet. Apply the profile_growth_events migration to start counting.
        </p>
      ) : null}
      <p className="mt-4 max-w-2xl text-xs text-content-tertiary">
        Views leave out link previews and prefetches. PostHog has the same steps as events (credit_link_opened through
        signup_from_profile) for anything deeper.
      </p>
    </div>
  );
}
