'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { readTrackedEvents, type AnalyticsEvent } from '@/lib/analytics';

type AdminPaywallResponse = {
  enabled?: boolean;
  updatedAt?: string | null;
  error?: string;
  sql?: string;
};

const resolveAccessToken = async (): Promise<string> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshData.session?.access_token) {
    throw new Error('Session expired. Please sign in again.');
  }
  return refreshData.session.access_token;
};

export default function AdminPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [paywallEnabled, setPaywallEnabled] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);

  const refreshAnalytics = () => {
    setAnalyticsEvents(readTrackedEvents());
  };

  const analyticsSummary = useMemo(() => {
    const events = [...analyticsEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const counts: Record<string, number> = {};
    events.forEach((event) => {
      counts[event.name] = (counts[event.name] || 0) + 1;
    });

    const uniqueUsers = new Set(events.map((event) => event.userId).filter(Boolean));
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const events7d = events.filter((event) => new Date(event.timestamp).getTime() >= sevenDaysAgo);

    const signupCount = counts.signup_completed || 0;
    const releaseCount = counts.release_created || 0;
    const aiPlanCount = counts.ai_plan_generated || 0;
    const taskCompleteCount = counts.task_completed || 0;
    const trialStartCount = counts.trial_started || 0;
    const trialConvertCount = counts.trial_converted || 0;

    const safeRate = (numerator: number, denominator: number) =>
      denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : '0%';

    return {
      events,
      counts,
      totalEvents: events.length,
      usersTracked: uniqueUsers.size,
      eventsLast7Days: events7d.length,
      signupCount,
      releaseCount,
      aiPlanCount,
      taskCompleteCount,
      trialStartCount,
      trialConvertCount,
      releaseActivationRate: safeRate(releaseCount, signupCount),
      aiPlanRate: safeRate(aiPlanCount, releaseCount),
      taskCompletionRate: safeRate(taskCompleteCount, aiPlanCount),
      trialConversionRate: safeRate(trialConvertCount, trialStartCount),
    };
  }, [analyticsEvents]);

  const loadPaywallState = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const accessToken = await resolveAccessToken();

      const response = await fetch('/api/admin/paywall', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as AdminPaywallResponse;

      if (response.status === 403) {
        throw new Error('You are not allowed to access this page.');
      }
      if (!response.ok) {
        const helpText = payload.sql ? `\n\nSQL:\n${payload.sql}` : '';
        throw new Error((payload.error || 'Could not load paywall setting.') + helpText);
      }

      setPaywallEnabled(payload.enabled !== false);
      setUpdatedAt(payload.updatedAt || null);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load admin settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    loadPaywallState();
    refreshAnalytics();
  }, [authLoading, router, user]);

  const savePaywallState = async (nextEnabled: boolean) => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const accessToken = await resolveAccessToken();

      const response = await fetch('/api/admin/paywall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const payload = (await response.json().catch(() => ({}))) as AdminPaywallResponse;

      if (!response.ok) {
        const helpText = payload.sql ? `\n\nSQL:\n${payload.sql}` : '';
        throw new Error((payload.error || 'Could not update paywall setting.') + helpText);
      }

      setPaywallEnabled(nextEnabled);
      setUpdatedAt(payload.updatedAt || new Date().toISOString());
      setSuccess(nextEnabled ? 'Paywall is now ON for the whole app.' : 'Paywall is now OFF for the whole app.');
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save paywall setting.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[7%] top-[-180px] h-[320px] w-[320px] rounded-full bg-brand/10 blur-[130px]" />
          <div className="absolute bottom-[-210px] right-[8%] h-[360px] w-[360px] rounded-full bg-brand/8 blur-[140px]" />
        </div>
        <div className="relative mx-auto w-full max-w-4xl px-6 py-10">
          <p className="text-content-secondary">Loading admin...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[7%] top-[-180px] h-[320px] w-[320px] rounded-full bg-brand/10 blur-[130px]" />
        <div className="absolute bottom-[-210px] right-[8%] h-[360px] w-[360px] rounded-full bg-brand/8 blur-[140px]" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl tracking-tight sm:text-4xl">Admin</h1>
            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-content-tertiary">Release command settings</p>
            <p className="mt-2 text-sm text-content-secondary">Control global app access settings.</p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-stroke-default bg-bg-elevated/85 px-4 py-2 text-sm text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
          >
            Back to dashboard
          </Link>
        </div>

        {error && (
          <pre className="mb-5 whitespace-pre-wrap rounded-lg border border-status-error/40 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </pre>
        )}
        {success && (
          <p className="mb-5 rounded-lg border border-brand/35 bg-brand-muted px-4 py-3 text-sm text-brand">
            {success}
          </p>
        )}

        <section className="rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl">
          <h2 className="text-xl">Global Paywall</h2>
          <p className="mt-2 text-sm text-content-secondary">
            When ON, users need an active subscription to access plans. When OFF, subscription checks are bypassed app-wide.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                paywallEnabled
                  ? 'border-status-warning/50 bg-status-warning/20 text-status-warning'
                  : 'border-brand/45 bg-brand-muted text-brand'
              }`}
            >
              {paywallEnabled ? 'Paywall: ON' : 'Paywall: OFF'}
            </span>

            <button
              type="button"
              onClick={() => savePaywallState(!paywallEnabled)}
              disabled={saving || loading}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? 'Saving...' : paywallEnabled ? 'Turn OFF paywall' : 'Turn ON paywall'}
            </button>

            <button
              type="button"
              onClick={loadPaywallState}
              disabled={saving}
              className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-content-secondary">Loading paywall state...</p>
          ) : (
            <p className="mt-4 text-xs text-content-tertiary">
              Last updated: {updatedAt ? new Date(updatedAt).toLocaleString() : 'Unknown'}
            </p>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgba(0,0,0,0.62)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl">Funnel Analytics</h2>
              <p className="mt-2 text-sm text-content-secondary">Computed from locally tracked MVP events.</p>
            </div>
            <button
              type="button"
              onClick={refreshAnalytics}
              className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
            >
              Refresh analytics
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Tracked Users</p>
              <p className="mt-1 text-2xl font-semibold text-content-primary">{analyticsSummary.usersTracked}</p>
            </article>
            <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Total Events</p>
              <p className="mt-1 text-2xl font-semibold text-content-primary">{analyticsSummary.totalEvents}</p>
            </article>
            <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Events (7 Days)</p>
              <p className="mt-1 text-2xl font-semibold text-content-primary">{analyticsSummary.eventsLast7Days}</p>
            </article>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Signup to Release</p>
              <p className="mt-1 text-xl font-semibold text-content-primary">{analyticsSummary.releaseActivationRate}</p>
              <p className="mt-1 text-xs text-content-secondary">
                {analyticsSummary.releaseCount} / {analyticsSummary.signupCount}
              </p>
            </article>
            <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Release to AI Plan</p>
              <p className="mt-1 text-xl font-semibold text-content-primary">{analyticsSummary.aiPlanRate}</p>
              <p className="mt-1 text-xs text-content-secondary">
                {analyticsSummary.aiPlanCount} / {analyticsSummary.releaseCount}
              </p>
            </article>
            <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">AI Plan to Task Done</p>
              <p className="mt-1 text-xl font-semibold text-content-primary">{analyticsSummary.taskCompletionRate}</p>
              <p className="mt-1 text-xs text-content-secondary">
                {analyticsSummary.taskCompleteCount} / {analyticsSummary.aiPlanCount}
              </p>
            </article>
            <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Trial Conversion</p>
              <p className="mt-1 text-xl font-semibold text-content-primary">{analyticsSummary.trialConversionRate}</p>
              <p className="mt-1 text-xs text-content-secondary">
                {analyticsSummary.trialConvertCount} / {analyticsSummary.trialStartCount}
              </p>
            </article>
          </div>

          <div className="mt-5 rounded-lg border border-stroke-default bg-bg-elevated p-3">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Event Breakdown</p>
            {Object.keys(analyticsSummary.counts).length > 0 ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(analyticsSummary.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([eventName, count]) => (
                    <div key={eventName} className="rounded border border-stroke-subtle bg-bg-surface px-3 py-2">
                      <p className="text-xs text-content-secondary">{eventName}</p>
                      <p className="text-lg font-semibold text-content-primary">{count}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-content-secondary">No events tracked yet.</p>
            )}
          </div>

          <div className="mt-5 rounded-lg border border-stroke-default bg-bg-elevated p-3">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Recent Events</p>
            {analyticsSummary.events.length > 0 ? (
              <div className="mt-2 max-h-[280px] space-y-2 overflow-auto pr-1">
                {analyticsSummary.events.slice(0, 40).map((event) => (
                  <article key={event.id} className="rounded border border-stroke-subtle bg-bg-surface px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-content-primary">{event.name}</p>
                      <p className="text-[11px] text-content-tertiary">{new Date(event.timestamp).toLocaleString()}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-content-secondary">User: {event.userId || 'anonymous'}</p>
                    <p className="mt-1 break-all text-[11px] text-content-secondary">{JSON.stringify(event.payload || {})}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-content-secondary">No recent events yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
