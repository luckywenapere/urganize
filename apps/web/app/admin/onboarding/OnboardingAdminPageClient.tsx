'use client';

// Onboarding answers dashboard (URG-195): what users actually pick during
// /onboarding, finally visible somewhere. Reached at /admin/onboarding — no
// nav entry; access is gated server-side by ADMIN_EMAILS (the GET below
// 401/403s for anyone else, and this page bounces them to /dashboard), same
// shape as BroadcastPageClient. Layout mirrors
// apps/homepage/app/admin/waitlist: stat cards -> aggregate pill rows ->
// recent-signups table, translated to apps/web's theme tokens instead of
// that page's raw dark palette.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2 } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { CockpitSlot } from '@/components/admin/CockpitSlot';
import { PersonaSplitPanel } from '@/components/admin/PersonaSplitPanel';

type Tally = { label: string; count: number };

type OnboardingRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  releaseType: string;
  completed: boolean;
  completedAt: string | null;
  planningPreference: string | null;
  whereStuck: string[] | null;
  stage: string | null;
  persona: string | null;
  releaseProcess: string | null;
  biggestHeadache: string | null;
  createdAt: string;
};

type OnboardingAdminResponse = {
  summary: { total: number; truncated: boolean; completed: number; neverAskedWhereStuckOrStage: number };
  breakdowns: {
    role: Tally[];
    releaseType: Tally[];
    planningPreference: Tally[];
    whereStuck: Tally[];
    stage: Tally[];
    legacyPersona: Tally[];
    legacyReleaseProcess: Tally[];
    legacyBiggestHeadache: Tally[];
  };
  hasLegacyData: boolean;
  rows: OnboardingRow[];
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return value;
  }
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-content-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-content-tertiary">{hint}</p> : null}
    </div>
  );
}

function TallyRow({ title, tallies, emptyLabel }: { title: string; tallies: Tally[]; emptyLabel: string }) {
  if (tallies.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium text-content-primary">{title}</p>
        <p className="mt-2 text-sm text-content-tertiary">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-content-primary">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {tallies.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary"
          >
            {item.label}
            <span className="font-mono font-semibold text-content-primary">{item.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<OnboardingAdminResponse | null>(null);
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Admin gate: the GET below doubles as the access check — anyone not in
  // ADMIN_EMAILS gets 401/403 and is bounced home. Same pattern as
  // BroadcastPageClient.
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
        const response = await fetch('/api/admin/onboarding', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as OnboardingAdminResponse | null;
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

  // A plain <a href> can't carry the Authorization header the route
  // requires, so the export fetches the CSV as a blob and triggers the
  // download itself — the standard workaround for authenticated downloads.
  const handleExportCsv = async () => {
    setIsExporting(true);
    setError('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/onboarding?format=csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not export CSV.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'onboarding-answers.csv';
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
      <AdminPageSkeleton
        titleWidth="w-56"
        descriptionLines={2}
        statCards={{ count: 3, gridClassName: 'grid-cols-1 sm:grid-cols-3' }}
        tallyRows={[4, 5, 4, 6, 4]}
        table={{ columns: 8, rows: 6 }}
      />
    );
  }

  const { summary, breakdowns, hasLegacyData, rows } = data;

  // The page frame (outer <main>, padding, the AdminNav side menu) moved to
  // app/admin/layout.tsx when the admin hub landed (2026-07-30); this
  // component renders content only. The old "Back" button went with it —
  // the hub menu is the way around.
  return (
    <div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={isExporting || rows.length === 0}
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

        <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Onboarding answers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
          What signups pick during the setup wizard — where their process
          breaks, what stage they&apos;re at, and how they want releases
          planned.
          {summary.truncated ? ' Showing the 200 most recent signups.' : ''}
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total signups" value={summary.total} />
          <StatCard label="Completed onboarding" value={summary.completed} />
          <StatCard
            label="Pre-URG-192 accounts"
            value={summary.neverAskedWhereStuckOrStage}
            hint="Signed up before the where-stuck/stage questions were saved"
          />
        </div>

        <div className="mt-8 space-y-6 rounded-lg border border-stroke-default bg-bg-surface p-6">
          <TallyRow title="What they're working on" tallies={breakdowns.releaseType} emptyLabel="No rollouts created yet." />
          <TallyRow title="Role" tallies={breakdowns.role} emptyLabel="No signups yet." />
          <TallyRow title="How they want rollouts planned" tallies={breakdowns.planningPreference} emptyLabel="Not answered yet." />
          <TallyRow title="Where a rollout usually falls apart" tallies={breakdowns.whereStuck} emptyLabel="Not answered yet." />
          <TallyRow title="Where this rollout is in its lifecycle" tallies={breakdowns.stage} emptyLabel="Not answered yet." />
        </div>

        {hasLegacyData ? (
          <div className="mt-6 space-y-6 rounded-lg border border-stroke-default bg-bg-elevated p-6">
            <p className="text-xs text-content-tertiary">
              From the retired first-time dashboard gate (deleted 2026-07-29,
              URG-191) — no live writer, kept visible rather than hidden.
            </p>
            <TallyRow title="Persona" tallies={breakdowns.legacyPersona} emptyLabel="None." />
            <TallyRow title="Release process" tallies={breakdowns.legacyReleaseProcess} emptyLabel="None." />
            <TallyRow title="Biggest headache" tallies={breakdowns.legacyBiggestHeadache} emptyLabel="None." />
          </div>
        ) : null}

        <div className="mt-8 overflow-x-auto rounded-lg border border-stroke-default">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-stroke-default bg-bg-surface font-mono text-[11px] uppercase tracking-[0.1em] text-content-tertiary">
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Signed up</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Release type</th>
                <th className="px-4 py-3">Planning</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Where stuck</th>
                <th className="px-4 py-3">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-bg-hover">
                  <td className="px-4 py-3">
                    <p className="font-medium text-content-primary">{row.name || '—'}</p>
                    <p className="text-xs text-content-tertiary">{row.email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-content-secondary">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3 text-content-secondary">{row.role || '—'}</td>
                  <td className="px-4 py-3 text-content-secondary">{row.releaseType || '—'}</td>
                  <td className="px-4 py-3 text-content-secondary">{row.planningPreference || '—'}</td>
                  <td className="px-4 py-3 text-content-secondary">{row.stage || '—'}</td>
                  <td className="px-4 py-3 text-content-secondary">
                    {row.whereStuck === null ? (
                      <span className="text-content-tertiary">never asked</span>
                    ) : row.whereStuck.length === 0 ? (
                      <span className="text-content-tertiary">none picked</span>
                    ) : (
                      row.whereStuck.join(', ')
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.completed ? (
                      <span className="text-brand">Yes</span>
                    ) : (
                      <span className="text-content-tertiary">No</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-content-tertiary">
                    No signups yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

      {/* Moved from the Overview (URG-369): who our accounts say they are. */}
      <CockpitSlot label="the persona split" skeletonClassName="h-24">
        {(cockpit) => (cockpit.personas ? <PersonaSplitPanel split={cockpit.personas} /> : null)}
      </CockpitSlot>
    </div>
  );
}
