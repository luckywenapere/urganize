'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

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
      </div>
    </main>
  );
}
