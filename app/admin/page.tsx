'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

type AdminPaywallResponse = {
  enabled?: boolean;
  updatedAt?: string | null;
  error?: string;
  sql?: string;
};

type PricingValidationAdminResponse = {
  summary?: {
    total: number;
    yes: number;
    maybe: number;
    no: number;
    onboarding: number;
    dashboard: number;
    research: number;
  };
  responses?: Array<{
    id: string;
    userId: string;
    name: string;
    role: string;
    artistName: string;
    willingness: 'yes' | 'maybe' | 'no' | null;
    priceBand: 'under-5000' | '5000-10000' | '10000-plus' | 'not-sure' | null;
    placement: 'onboarding' | 'dashboard' | 'research';
    notes: string;
    createdAt: string;
    updatedAt: string;
  }>;
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
  const [pricingSummary, setPricingSummary] = useState<PricingValidationAdminResponse['summary'] | null>(null);
  const [pricingResponses, setPricingResponses] = useState<NonNullable<PricingValidationAdminResponse['responses']>>([]);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [exportingPricing, setExportingPricing] = useState(false);
  const [pricingPlacementFilter, setPricingPlacementFilter] = useState<'all' | 'onboarding' | 'dashboard' | 'research'>('all');
  const [pricingWillingnessFilter, setPricingWillingnessFilter] = useState<'all' | 'yes' | 'maybe' | 'no'>('all');
  const [pricingDateWindow, setPricingDateWindow] = useState<'all' | '7d' | '30d' | '90d'>('all');

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

  const loadPricingValidation = async () => {
    setPricingLoading(true);
    try {
      const accessToken = await resolveAccessToken();
      const response = await fetch('/api/admin/pricing-validation', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as PricingValidationAdminResponse;

      if (!response.ok) {
        const helpText = payload.sql ? `\n\nSQL:\n${payload.sql}` : '';
        throw new Error((payload.error || 'Could not load pricing validation responses.') + helpText);
      }

      setPricingSummary(payload.summary || null);
      setPricingResponses(payload.responses || []);
    } catch (loadError: any) {
      setError((current) => current || loadError?.message || 'Could not load pricing validation responses.');
    } finally {
      setPricingLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    loadPaywallState();
    loadPricingValidation();
  }, [authLoading, router, user]);

  const exportPricingValidation = async () => {
    setExportingPricing(true);
    setError('');
    try {
      const accessToken = await resolveAccessToken();
      const response = await fetch('/api/admin/pricing-validation?format=csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as PricingValidationAdminResponse;
        throw new Error(payload.error || 'Could not export pricing validation responses.');
      }

      const csv = await response.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pricing-validation-responses.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError: any) {
      setError(exportError?.message || 'Could not export pricing validation responses.');
    } finally {
      setExportingPricing(false);
    }
  };

  const willingnessTone = useMemo(
    () => ({
      yes: 'border-brand/45 bg-brand-muted text-brand',
      maybe: 'border-status-warning/45 bg-status-warning/15 text-status-warning',
      no: 'border-stroke-default bg-bg-elevated text-content-secondary',
    }),
    []
  );

  const filteredPricingResponses = useMemo(() => {
    const now = Date.now();
    return pricingResponses.filter((row) => {
      if (pricingPlacementFilter !== 'all' && row.placement !== pricingPlacementFilter) return false;
      if (pricingWillingnessFilter !== 'all' && row.willingness !== pricingWillingnessFilter) return false;
      if (pricingDateWindow === 'all') return true;
      const updatedAt = new Date(row.updatedAt).getTime();
      if (!Number.isFinite(updatedAt)) return false;
      const ageMs = now - updatedAt;
      if (pricingDateWindow === '7d') return ageMs <= 7 * 24 * 60 * 60 * 1000;
      if (pricingDateWindow === '30d') return ageMs <= 30 * 24 * 60 * 60 * 1000;
      return ageMs <= 90 * 24 * 60 * 60 * 1000;
    });
  }, [pricingDateWindow, pricingPlacementFilter, pricingResponses, pricingWillingnessFilter]);

  const filteredPricingSummary = useMemo(() => {
    const total = filteredPricingResponses.length;
    const yes = filteredPricingResponses.filter((row) => row.willingness === 'yes').length;
    const maybe = filteredPricingResponses.filter((row) => row.willingness === 'maybe').length;
    const no = filteredPricingResponses.filter((row) => row.willingness === 'no').length;
    const conversionSignal = total > 0 ? Math.round(((yes + maybe) / total) * 100) : 0;

    return {
      total,
      yes,
      maybe,
      no,
      onboarding: filteredPricingResponses.filter((row) => row.placement === 'onboarding').length,
      dashboard: filteredPricingResponses.filter((row) => row.placement === 'dashboard').length,
      research: filteredPricingResponses.filter((row) => row.placement === 'research').length,
      conversionSignal,
    };
  }, [filteredPricingResponses]);

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

        <section className="saas-panel p-6">
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

        <section className="saas-panel mt-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="saas-eyebrow">Research</p>
              <h2 className="saas-title mt-2">Pricing validation responses</h2>
              <p className="mt-2 text-sm text-content-secondary">
                Review willingness-to-pay signals for the all-in-one mastering and release-workspace proposition.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadPricingValidation}
                disabled={pricingLoading || exportingPricing}
                className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-60"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={exportPricingValidation}
                disabled={pricingLoading || exportingPricing}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {exportingPricing ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>

          {pricingLoading ? (
            <p className="mt-5 text-sm text-content-secondary">Loading pricing validation data...</p>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                <div className="saas-panel-subtle p-4">
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">Total</p>
                  <p className="mt-1 text-2xl font-semibold text-content-primary">{filteredPricingSummary.total}</p>
                </div>
                <div className="saas-panel-subtle p-4">
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">Yes</p>
                  <p className="mt-1 text-2xl font-semibold text-brand">{filteredPricingSummary.yes}</p>
                </div>
                <div className="saas-panel-subtle p-4">
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">Maybe</p>
                  <p className="mt-1 text-2xl font-semibold text-status-warning">{filteredPricingSummary.maybe}</p>
                </div>
                <div className="saas-panel-subtle p-4">
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">No</p>
                  <p className="mt-1 text-2xl font-semibold text-content-primary">{filteredPricingSummary.no}</p>
                </div>
                <div className="saas-panel-subtle p-4">
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">Onboarding</p>
                  <p className="mt-1 text-2xl font-semibold text-content-primary">{filteredPricingSummary.onboarding}</p>
                </div>
                <div className="saas-panel-subtle p-4">
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">Dashboard</p>
                  <p className="mt-1 text-2xl font-semibold text-content-primary">{filteredPricingSummary.dashboard}</p>
                </div>
                <div className="saas-panel-subtle p-4">
                  <p className="text-xs uppercase tracking-wide text-content-tertiary">Conversion signal</p>
                  <p className="mt-1 text-2xl font-semibold text-content-primary">{filteredPricingSummary.conversionSignal}%</p>
                  <p className="mt-2 text-xs text-content-secondary">`yes + maybe` as a share of filtered responses</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Placement</span>
                  <select
                    value={pricingPlacementFilter}
                    onChange={(event) => setPricingPlacementFilter(event.target.value as typeof pricingPlacementFilter)}
                    className="w-full rounded-xl border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                  >
                    <option value="all">All placements</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="dashboard">Dashboard</option>
                    <option value="research">Research</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Willingness</span>
                  <select
                    value={pricingWillingnessFilter}
                    onChange={(event) => setPricingWillingnessFilter(event.target.value as typeof pricingWillingnessFilter)}
                    className="w-full rounded-xl border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                  >
                    <option value="all">All responses</option>
                    <option value="yes">Yes, monthly</option>
                    <option value="maybe">Maybe</option>
                    <option value="no">Not right now</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Date window</span>
                  <select
                    value={pricingDateWindow}
                    onChange={(event) => setPricingDateWindow(event.target.value as typeof pricingDateWindow)}
                    className="w-full rounded-xl border border-stroke-default bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                  >
                    <option value="all">All time</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-stroke-default">
                {filteredPricingResponses.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-stroke-default text-sm">
                      <thead className="bg-bg-elevated/85">
                        <tr className="text-left text-content-tertiary">
                          <th className="px-4 py-3 font-medium">User</th>
                          <th className="px-4 py-3 font-medium">Role</th>
                          <th className="px-4 py-3 font-medium">Artist</th>
                          <th className="px-4 py-3 font-medium">Intent</th>
                          <th className="px-4 py-3 font-medium">Price band</th>
                          <th className="px-4 py-3 font-medium">Source</th>
                          <th className="px-4 py-3 font-medium">Updated</th>
                          <th className="px-4 py-3 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stroke-default bg-bg-surface/90">
                        {filteredPricingResponses.map((row) => (
                          <tr key={row.id}>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-content-primary">{row.name || 'Unknown user'}</p>
                                <p className="text-xs text-content-tertiary">{row.userId}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-content-secondary">{row.role || 'Unknown'}</td>
                            <td className="px-4 py-3 text-content-secondary">{row.artistName || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${willingnessTone[(row.willingness || 'no') as 'yes' | 'maybe' | 'no']}`}>
                                {row.willingness === 'yes' ? 'Yes, monthly' : row.willingness === 'maybe' ? 'Maybe' : 'Not right now'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-content-secondary">{row.priceBand || '—'}</td>
                            <td className="px-4 py-3 text-content-secondary">{row.placement}</td>
                            <td className="px-4 py-3 text-content-secondary">{new Date(row.updatedAt).toLocaleString()}</td>
                            <td className="max-w-[320px] px-4 py-3 text-content-secondary">{row.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-4 py-8 text-sm text-content-secondary">No pricing validation responses match the current filters.</div>
                )}
              </div>

              {pricingSummary && (
                <p className="mt-4 text-xs text-content-tertiary">
                  Raw total in database: {pricingSummary.total}. Filters only change the admin view, not the stored responses.
                </p>
              )}
            </>
          )}
        </section>

      </div>
    </main>
  );
}
