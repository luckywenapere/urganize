'use client';

// Self-serve checkout (2026-10-22). Three things the founder does or reads:
//  - the cohort card: self-serve against concierge teams, by plan and by how
//    they paid (sign-ups, paid, week-2 active, median founder minutes);
//  - "Record transfer": money that came straight to the company account;
//  - founder minutes per team, which feed the card.
// The GET doubles as the ADMIN_EMAILS check; anyone else goes to /dashboard.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import type { CohortCell, CohortRow, CohortSummary } from '@/lib/admin-self-serve-cohort';

type TeamRow = {
  workspaceId: string;
  name: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  acquisitionPath: string | null;
  paymentMethod: string | null;
  plan: string | null;
  paid: boolean;
  founderMinutes: number;
};

type Payload = { windowDays: number; summary: CohortSummary; teams: TeamRow[] };

const PATH_LABEL: Record<string, string> = { self_serve: 'Self-serve', concierge: 'Concierge' };
const METHOD_LABEL: Record<string, string> = { card: 'Card', transfer: 'Bank transfer', direct_transfer: 'Recorded transfer' };

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function CellView({ cell }: { cell: CohortCell }) {
  return (
    <div className="space-y-0.5 text-sm">
      <p className="text-content-primary">
        {cell.signUps} sign-ups · {cell.paid} paid ({percent(cell.paidRate)})
      </p>
      <p className="text-content-secondary">
        Week 2 active: {cell.week2Eligible ? `${cell.week2Active} of ${cell.week2Eligible} (${percent(cell.week2Rate)})` : '—'}
      </p>
      <p className="text-content-secondary">
        Founder minutes per paying team: {cell.medianFounderMinutes === null ? '—' : cell.medianFounderMinutes}
      </p>
    </div>
  );
}

function CohortTable({ title, rows }: { title: string; rows: CohortRow[] }) {
  return (
    <div className="mt-6">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">{title}</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-stroke-default">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-bg-surface text-xs text-content-tertiary">
            <tr>
              <th className="px-4 py-2 font-medium" />
              <th className="px-4 py-2 font-medium">Self-serve</th>
              <th className="px-4 py-2 font-medium">Concierge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-subtle">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-3 align-top text-sm font-semibold text-content-primary">{row.label}</td>
                <td className="px-4 py-3 align-top">
                  <CellView cell={row.selfServe} />
                </td>
                <td className="px-4 py-3 align-top">
                  <CellView cell={row.concierge} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FIELD = 'mt-1 w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-content-primary focus:border-brand focus:outline-none';

function RecordTransferForm({ onDone }: { onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    ownerEmail: '',
    amountNaira: '',
    receivedAt: today,
    bankReference: '',
    plan: 'manager',
    period: 'monthly',
    periodEnd: '',
    note: '',
  });
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch('/api/admin/self-serve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_transfer', ...form, periodEnd: form.periodEnd || null }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; periodEnd?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not record that transfer.');
      const end = payload.periodEnd ? new Date(payload.periodEnd).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '';
      setStatus({ tone: 'ok', text: `Recorded. Paid until ${end}.` });
      setForm((current) => ({ ...current, ownerEmail: '', amountNaira: '', bankReference: '', periodEnd: '', note: '' }));
      onDone();
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Could not record that transfer.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10 rounded-lg border border-stroke-default bg-bg-surface p-5">
      <h2 className="font-display text-xl font-semibold text-content-primary">Record transfer</h2>
      <p className="mt-1 text-sm text-content-secondary">
        Money paid straight to the company account. It sets the paid period, counts for the partner ledger and lets
        the person in if they were waiting.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-content-secondary">
          Team owner email
          <input type="email" value={form.ownerEmail} onChange={set('ownerEmail')} className={FIELD} />
        </label>
        <label className="block text-sm text-content-secondary">
          Amount received (₦)
          <input inputMode="numeric" value={form.amountNaira} onChange={set('amountNaira')} className={FIELD} />
        </label>
        <label className="block text-sm text-content-secondary">
          Date it arrived
          <input type="date" value={form.receivedAt} onChange={set('receivedAt')} className={FIELD} />
        </label>
        <label className="block text-sm text-content-secondary">
          Bank reference
          <input value={form.bankReference} onChange={set('bankReference')} className={FIELD} />
        </label>
        <label className="block text-sm text-content-secondary">
          Plan
          <select value={form.plan} onChange={set('plan')} className={FIELD}>
            <option value="solo">Solo</option>
            <option value="manager">Manager</option>
            <option value="label">Label</option>
          </select>
        </label>
        <label className="block text-sm text-content-secondary">
          Period
          <select value={form.period} onChange={set('period')} className={FIELD}>
            <option value="monthly">Monthly</option>
            <option value="semiannual">6 months</option>
            <option value="annual">Yearly</option>
          </select>
        </label>
        <label className="block text-sm text-content-secondary">
          Paid until (optional)
          <input type="date" value={form.periodEnd} onChange={set('periodEnd')} className={FIELD} />
        </label>
        <label className="block text-sm text-content-secondary">
          Note (optional)
          <input value={form.note} onChange={set('note')} className={FIELD} />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse disabled:opacity-60"
        >
          {saving ? 'Recording…' : 'Record transfer'}
        </button>
        <p role="status" aria-live="polite" className={status?.tone === 'error' ? 'text-sm text-status-error' : 'text-sm text-content-secondary'}>
          {status?.text ?? ''}
        </p>
      </div>
      <p className="mt-2 text-xs text-content-tertiary">Leave "Paid until" empty to add the period to any time they have left.</p>
    </section>
  );
}

function MinutesInput({ team }: { team: TeamRow }) {
  const [value, setValue] = useState(String(team.founderMinutes));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const save = async () => {
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes === team.founderMinutes) return;
    setState('saving');
    const response = await fetch('/api/admin/self-serve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'founder_minutes', workspaceId: team.workspaceId, minutes }),
    }).catch(() => null);
    setState(response?.ok ? 'saved' : 'error');
  };
  return (
    <span className="flex items-center gap-2">
      <input
        inputMode="numeric"
        aria-label={`Founder minutes for ${team.name ?? 'this team'}`}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setState('idle');
        }}
        onBlur={() => void save()}
        className="w-20 rounded-lg border border-stroke-control bg-bg-base px-2 py-1.5 text-content-primary focus:border-brand focus:outline-none"
      />
      <span className="text-xs text-content-tertiary">
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved' : ''}
      </span>
    </span>
  );
}

export default function SelfServeAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [data, setData] = useState<Payload | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/self-serve', {
        headers: { Authorization: `Bearer ${await token()}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        router.replace('/dashboard');
        return;
      }
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (payload) setData(payload);
    } catch {
      router.replace('/dashboard');
    }
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load();
  }, [authLoading, user, router, load]);

  if (authLoading || !user || !data) {
    return (
      <AdminPageSkeleton titleWidth="w-40" descriptionLines={2} table={{ columns: 3, rows: 4 }} />
    );
  }

  return (
    <div>
      <h1 className="mt-2 font-display text-3xl font-semibold">Self-serve</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Teams that paid at checkout against teams you let in, from the last {data.windowDays} days. Week 2 active means
        someone on the team did a task on days 8 to 14. Our own accounts are left out.
      </p>

      <CohortTable title="All" rows={[data.summary.all]} />
      <CohortTable title="By plan" rows={data.summary.byPlan} />
      <CohortTable title="By how they paid" rows={data.summary.byMethod} />

      <RecordTransferForm onDone={() => void load()} />

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-content-primary">Founder minutes</h2>
        <p className="mt-1 text-sm text-content-secondary">Time you spent helping each team. Saves when you leave the box.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-stroke-default">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-bg-surface text-xs text-content-tertiary">
              <tr>
                <th className="px-4 py-2 font-medium">Team</th>
                <th className="px-4 py-2 font-medium">Path</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Paid by</th>
                <th className="px-4 py-2 font-medium">Minutes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle">
              {data.teams.map((team) => (
                <tr key={team.workspaceId}>
                  <td className="px-4 py-2.5">
                    <p className="text-content-primary">{team.name || 'Unnamed team'}</p>
                    <p className="text-xs text-content-tertiary">{team.ownerEmail ?? ''}</p>
                  </td>
                  <td className="px-4 py-2.5 text-content-secondary">{PATH_LABEL[team.acquisitionPath ?? ''] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-content-secondary">{team.plan ?? (team.paid ? 'Lapsed' : '—')}</td>
                  <td className="px-4 py-2.5 text-content-secondary">{METHOD_LABEL[team.paymentMethod ?? ''] ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <MinutesInput team={team} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
