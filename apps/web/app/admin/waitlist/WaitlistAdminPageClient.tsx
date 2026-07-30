'use client';

// Waitlist dashboard, ported into the admin hub from
// apps/homepage/app/admin/waitlist (founder request, 2026-07-30): same
// stats / role breakdown / searchable table, but behind the normal account
// login (verifyAdmin on the API) instead of the homepage's shared-secret
// cookie, and rendered on apps/web's theme tokens. The GET doubles as the
// admin gate — non-admins bounce to /dashboard.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';

type Tally = { label: string | null; count: string };

type WaitlistRow = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string | null;
  teamSize: string | null;
  releaseVolume: string | null;
  primaryNeed: string | null;
  source: string | null;
  createdAt: string;
};

type WaitlistResponse = {
  stats: { total: string; latest: string | null };
  roleCounts: Tally[];
  rows: WaitlistRow[];
};

// Label maps carried over verbatim from the homepage page.
const roleLabels: Record<string, string> = {
  independent_artist: 'Independent Artist',
  artist_manager: 'Artist Manager',
  a_and_r: 'A&R',
  music_producer: 'Music Producer',
  label_manager_executive: 'Label Manager / Label Executive',
};

const teamSizeLabels: Record<string, string> = {
  solo: 'Just me',
  two_to_three: '2-3 people',
  four_to_six: '4-6 people',
  seven_plus: '7+ people',
};

const releaseVolumeLabels: Record<string, string> = {
  one: '1 release',
  two_to_four: '2-4 releases',
  five_plus: '5+ releases',
  not_sure: 'Still figuring it out',
};

const primaryNeedLabels: Record<string, string> = {
  release_playbook: 'A release playbook',
  collaborator_credits: 'Collecting credits',
  team_handoff: 'Team handoff and tasks',
  all_of_it: 'All of it',
};

const labelFor = (value: string | null, labels: Record<string, string>): string =>
  value ? labels[value] ?? value : 'Not answered';

function formatDate(value: string | null): string {
  if (!value) return 'None yet';
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
    );
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

export default function WaitlistAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [data, setData] = useState<WaitlistResponse | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const loadWaitlist = useCallback(
    async (q: string, opts?: { asGate?: boolean }) => {
      try {
        const token = await getAccessToken();
        const response = await fetch(
          `/api/admin/waitlist${q ? `?q=${encodeURIComponent(q)}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
        );
        if (!response.ok) {
          if (opts?.asGate && (response.status === 401 || response.status === 403)) {
            router.replace('/dashboard');
            return;
          }
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || 'Could not load the waitlist.');
          return;
        }
        const payload = (await response.json().catch(() => null)) as WaitlistResponse | null;
        if (payload) {
          setData(payload);
          setError('');
          setChecked(true);
        }
      } catch (err) {
        if (opts?.asGate) {
          router.replace('/dashboard');
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load the waitlist.');
      }
    },
    [router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadWaitlist('', { asGate: true });
  }, [authLoading, loadWaitlist, router, user]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSearching(true);
    await loadWaitlist(query.trim());
    setIsSearching(false);
  };

  if (authLoading || !user || !checked) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-content-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const stats = data?.stats ?? { total: '0', latest: null };
  const roleCounts = data?.roleCounts ?? [];
  const rows = data?.rows ?? [];

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Waitlist</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Marketing-site waitlist signups, straight from the Neon database. Showing
        the 200 most recent{query.trim() ? ' matches' : ''}.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Total signups
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-content-primary">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-stroke-default bg-bg-surface p-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Latest signup
          </p>
          <p className="mt-2 font-display text-lg font-semibold text-content-primary">
            {formatDate(stats.latest)}
          </p>
        </div>
      </div>

      {roleCounts.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-content-primary">By role</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {roleCounts.map((item) => (
              <span
                key={item.label ?? 'none'}
                className="inline-flex items-center gap-1.5 rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary"
              >
                {labelFor(item.label, roleLabels)}
                <span className="font-mono font-semibold text-content-primary">{item.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSearch} className="mt-6 flex max-w-md gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search email, name, phone, role…"
          className="motion-focus h-10 min-w-0 flex-1 rounded-lg border border-stroke-default bg-bg-elevated px-3 text-sm text-content-primary placeholder:text-content-tertiary hover:border-stroke-strong focus:border-brand"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="motion-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-stroke-default bg-bg-surface px-4 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Search
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
            <tr>
              <th className="px-4 py-3 font-bold">Signed up</th>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Email</th>
              <th className="px-4 py-3 font-bold">Phone</th>
              <th className="px-4 py-3 font-bold">Role</th>
              <th className="px-4 py-3 font-bold">Team</th>
              <th className="px-4 py-3 font-bold">Releases/yr</th>
              <th className="px-4 py-3 font-bold">Primary need</th>
              <th className="px-4 py-3 font-bold">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-content-tertiary">
                  {query.trim() ? 'No matches.' : 'No signups yet.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-content-tertiary">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-content-primary">{row.name || '—'}</td>
                  <td className="px-4 py-3 text-content-secondary">{row.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">{row.phone || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {labelFor(row.role, roleLabels)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {labelFor(row.teamSize, teamSizeLabels)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {labelFor(row.releaseVolume, releaseVolumeLabels)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">
                    {labelFor(row.primaryNeed, primaryNeedLabels)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-tertiary">{row.source || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
