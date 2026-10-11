'use client';

// Net Promoter Score answers (2026-10-11). The in-app ask on Home writes them
// (components/home/NpsPrompt.tsx, rules in lib/nps.ts); this page reads them.
// Access is gated server-side by ADMIN_EMAILS: the GET below doubles as the
// check and anyone else is sent to /dashboard, the onboarding page's pattern.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

type NpsSummary = {
  score: number | null;
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
};

type NpsRow = {
  userId: string;
  name: string;
  email: string;
  score: number;
  category: 'detractor' | 'passive' | 'promoter';
  reason: string;
  at: string;
};

type NpsAdminResponse = {
  overall: NpsSummary;
  last90Days: NpsSummary;
  peopleShown: number;
  peopleWhoClosed: number;
  rows: NpsRow[];
};

const CATEGORY_LABEL: Record<NpsRow['category'], string> = {
  promoter: 'Promoter',
  passive: 'Passive',
  detractor: 'Detractor',
};

const CATEGORY_CLASS: Record<NpsRow['category'], string> = {
  promoter: 'text-brand',
  passive: 'text-content-secondary',
  detractor: 'text-status-error',
};

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return value;
  }
}

function formatNps(value: number | null): string {
  if (value === null) return '—';
  return value > 0 ? `+${value}` : String(value);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-content-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-content-tertiary">{hint}</p> : null}
    </div>
  );
}

export default function NpsAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [data, setData] = useState<NpsAdminResponse | null>(null);

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
        const response = await fetch('/api/admin/nps', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as NpsAdminResponse | null;
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
        titleWidth="w-40"
        descriptionLines={2}
        statCards={{ count: 4, gridClassName: 'grid-cols-2 sm:grid-cols-4' }}
        table={{ columns: 4, rows: 6 }}
      />
    );
  }

  const { overall, last90Days, peopleShown, peopleWhoClosed, rows } = data;

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Admin</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Net Promoter Score</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        &ldquo;How likely are you to recommend Urganize to another artist, manager or music team?&rdquo; Asked on Home to
        people with an account at least 14 days old who have used Urganize on 5 or more days, then again every 90 days.
        The score counts each person once, by their latest answer. Our own accounts are left out.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="NPS" value={formatNps(overall.score)} hint={`${overall.responses} people answered`} />
        <StatCard
          label="NPS, last 90 days"
          value={formatNps(last90Days.score)}
          hint={`${last90Days.responses} people answered`}
        />
        <StatCard
          label="Promoters / passives / detractors"
          value={`${overall.promoters} / ${overall.passives} / ${overall.detractors}`}
          hint="9-10 / 7-8 / 0-6"
        />
        <StatCard label="Shown / closed" value={`${peopleShown} / ${peopleWhoClosed}`} hint="People, ever" />
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-stroke-default">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-stroke-default bg-bg-surface font-mono text-[11px] uppercase tracking-[0.1em] text-content-tertiary">
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Why</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-subtle">
            {rows.map((row) => (
              <tr key={`${row.userId}:${row.at}`} className="align-top hover:bg-bg-hover">
                <td className="px-4 py-3">
                  <p className="font-medium text-content-primary">{row.name || '—'}</p>
                  <p className="text-xs text-content-tertiary">{row.email || '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono font-semibold text-content-primary">{row.score}</span>{' '}
                  <span className={`text-xs ${CATEGORY_CLASS[row.category]}`}>{CATEGORY_LABEL[row.category]}</span>
                </td>
                <td className="max-w-md whitespace-pre-wrap px-4 py-3 text-content-secondary">
                  {row.reason || <span className="text-content-tertiary">No reason given</span>}
                </td>
                <td className="px-4 py-3 text-content-secondary">{formatDate(row.at)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-content-tertiary">
                  No answers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
