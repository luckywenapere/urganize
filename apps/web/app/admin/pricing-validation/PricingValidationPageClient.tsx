'use client';

// First UI for the pricing-validation survey responses (the
// /api/admin/pricing-validation endpoint existed with no page anywhere —
// founder request, 2026-07-30, as part of the admin hub). Summary cards →
// table → CSV export, the OnboardingAdminPageClient shape. The GET doubles
// as the admin gate — non-admins bounce to /dashboard.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';

type PricingResponse = {
  id: string;
  userId: string;
  name: string;
  role: string;
  artistName: string;
  willingness: 'yes' | 'maybe' | 'no' | null;
  priceBand: string | null;
  notes: string;
  placement: string;
  createdAt: string;
  updatedAt: string;
};

type PricingValidationData = {
  summary: {
    total: number;
    yes: number;
    maybe: number;
    no: number;
    onboarding: number;
    dashboard: number;
    research: number;
  };
  responses: PricingResponse[];
};

const priceBandLabels: Record<string, string> = {
  'under-5000': 'Under ₦5,000',
  '5000-10000': '₦5,000 – ₦10,000',
  '10000-plus': '₦10,000+',
  'not-sure': 'Not sure',
};

const willingnessTone: Record<string, string> = {
  yes: 'text-status-success',
  maybe: 'text-status-warning',
  no: 'text-status-error',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return value;
  }
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-content-primary">{value}</p>
    </div>
  );
}

export default function PricingValidationPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<PricingValidationData | null>(null);
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/pricing-validation', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as PricingValidationData | null;
        if (!cancelled && payload) {
          setData(payload);
          setChecked(true);
        }
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    setError('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/pricing-validation?format=csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not export CSV.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pricing-validation-responses.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  if (authLoading || !user || !checked || !data) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-content-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const { summary, responses } = data;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Admin
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Pricing validation</h1>
        </div>
        <button
          type="button"
          onClick={() => void handleExportCsv()}
          disabled={isExporting || responses.length === 0}
          className="motion-focus motion-press inline-flex items-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Export CSV
        </button>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Willingness-to-pay survey responses, newest first (200 most recent).
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={summary.total} />
        <StatCard label="Yes" value={summary.yes} />
        <StatCard label="Maybe" value={summary.maybe} />
        <StatCard label="No" value={summary.no} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ['Onboarding', summary.onboarding],
            ['Dashboard', summary.dashboard],
            ['Research', summary.research],
          ] as const
        ).map(([label, count]) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary"
          >
            Asked via {label}
            <span className="font-mono font-semibold text-content-primary">{count}</span>
          </span>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
            <tr>
              <th className="px-4 py-3 font-bold">Updated</th>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Role</th>
              <th className="px-4 py-3 font-bold">Would pay?</th>
              <th className="px-4 py-3 font-bold">Price band</th>
              <th className="px-4 py-3 font-bold">Placement</th>
              <th className="px-4 py-3 font-bold">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
            {responses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-content-tertiary">
                  No responses yet.
                </td>
              </tr>
            ) : (
              responses.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-content-tertiary">
                    {formatDate(row.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-content-primary">
                    {row.name || row.artistName || row.userId.slice(0, 8)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">{row.role || '—'}</td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-medium capitalize ${
                      row.willingness ? willingnessTone[row.willingness] : 'text-content-tertiary'
                    }`}
                  >
                    {row.willingness || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {row.priceBand ? priceBandLabels[row.priceBand] ?? row.priceBand : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 capitalize text-content-secondary">
                    {row.placement}
                  </td>
                  <td className="max-w-[280px] px-4 py-3 text-content-secondary">
                    <span className="line-clamp-2">{row.notes || '—'}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
