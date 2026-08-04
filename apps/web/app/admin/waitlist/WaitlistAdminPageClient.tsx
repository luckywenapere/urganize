'use client';

// Waitlist dashboard, ported into the admin hub from
// apps/homepage/app/admin/waitlist (founder request, 2026-07-30): same
// stats / role breakdown / searchable table, but behind the normal account
// login (verifyAdmin on the API) instead of the homepage's shared-secret
// cookie, and rendered on apps/web's theme tokens. The GET doubles as the
// admin gate — non-admins bounce to /dashboard.
//
// 2026-08-04: added waitlist operations (founder request) — a one-tap
// "Mark contacted" counter + timestamp, an outcome status pipeline, inline
// notes, and filter chips by contact state. Row edits PATCH the same route
// and splice the returned row back into local state, so a click never
// forces a full-table refetch.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';

type Tally = { label: string | null; count: string };

type ContactStatus = 'new' | 'contacted' | 'responded' | 'converted' | 'not_interested';

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
  contactCount: number;
  lastContactedAt: string | null;
  contactStatus: ContactStatus;
  adminNotes: string | null;
};

type WaitlistResponse = {
  stats: { total: string; latest: string | null };
  roleCounts: Tally[];
  statusCounts: Tally[];
  contactCounts: { notContacted: string; contactedOnce: string; contactedTwicePlus: string };
  rows: WaitlistRow[];
};

type FilterValue =
  | 'all'
  | 'not_contacted'
  | 'contacted_once'
  | 'contacted_twice_plus'
  | 'responded'
  | 'converted'
  | 'not_interested';

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

const contactStatusLabels: Record<ContactStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  responded: 'Responded',
  converted: 'Converted',
  not_interested: 'Not interested',
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

function formatShortDate(value: string | null): string {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return '';
  }
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_contacted', label: 'Not contacted' },
  { value: 'contacted_once', label: 'Contacted 1x' },
  { value: 'contacted_twice_plus', label: 'Contacted 2x+' },
  { value: 'responded', label: 'Responded' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not interested' },
];

export default function WaitlistAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [data, setData] = useState<WaitlistResponse | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [busyRowId, setBusyRowId] = useState<number | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const loadWaitlist = useCallback(
    async (q: string, f: FilterValue, opts?: { asGate?: boolean }) => {
      try {
        const token = await getAccessToken();
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (f !== 'all') params.set('filter', f);
        const qs = params.toString();
        const response = await fetch(`/api/admin/waitlist${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
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
    void loadWaitlist('', 'all', { asGate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, router, user]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSearching(true);
    await loadWaitlist(query.trim(), filter);
    setIsSearching(false);
  };

  const handleFilterClick = async (value: FilterValue) => {
    setFilter(value);
    setIsSearching(true);
    await loadWaitlist(query.trim(), value);
    setIsSearching(false);
  };

  const patchRow = useCallback(
    async (id: number, body: Record<string, unknown>) => {
      setBusyRowId(id);
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/waitlist', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id, ...body }),
        });
        const payload = (await response.json().catch(() => ({}))) as
          | { row?: WaitlistRow; error?: string };
        if (!response.ok || !payload.row) {
          setError(payload.error || 'Could not save that change.');
          return;
        }
        setError('');
        setData((prev) =>
          prev
            ? { ...prev, rows: prev.rows.map((r) => (r.id === id ? (payload.row as WaitlistRow) : r)) }
            : prev
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that change.');
      } finally {
        setBusyRowId(null);
      }
    },
    []
  );

  const handleMarkContacted = (id: number) => patchRow(id, { action: 'contact' });
  const handleStatusChange = (id: number, status: ContactStatus) =>
    patchRow(id, { action: 'set_status', status });
  const handleSaveNotes = async (id: number) => {
    await patchRow(id, { action: 'set_notes', notes: notesDraft });
    setEditingNotesId(null);
    setNotesDraft('');
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
  const contactCounts = data?.contactCounts ?? {
    notContacted: '0',
    contactedOnce: '0',
    contactedTwicePlus: '0',
  };
  const statusCountsByLabel = new Map((data?.statusCounts ?? []).map((s) => [s.label, s.count]));

  const countFor = (value: FilterValue): string | null => {
    if (value === 'all') return null;
    if (value === 'not_contacted') return contactCounts.notContacted;
    if (value === 'contacted_once') return contactCounts.contactedOnce;
    if (value === 'contacted_twice_plus') return contactCounts.contactedTwicePlus;
    return statusCountsByLabel.get(value) ?? '0';
  };

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Waitlist</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Marketing-site waitlist signups, straight from the Neon database. Showing
        the 200 most recent{query.trim() || filter !== 'all' ? ' matches' : ''}.
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

      <div className="mt-6">
        <p className="text-sm font-medium text-content-primary">Contact state</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const count = countFor(opt.value);
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void handleFilterClick(opt.value)}
                className={`motion-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  isActive
                    ? 'border-brand bg-brand/8 text-content-primary'
                    : 'border-stroke-default bg-bg-elevated text-content-secondary hover:border-stroke-strong hover:text-content-primary'
                }`}
              >
                {opt.label}
                {count !== null ? (
                  <span className="font-mono font-semibold text-content-primary">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

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
        <table className="w-full min-w-[1280px] text-left text-sm">
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
              <th className="px-4 py-3 font-bold">Contacted</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-content-tertiary">
                  {query.trim() || filter !== 'all' ? 'No matches.' : 'No signups yet.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isBusy = busyRowId === row.id;
                const isEditingNotes = editingNotesId === row.id;
                return (
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
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary">
                          {row.contactCount > 0
                            ? `${row.contactCount}x${
                                row.lastContactedAt ? ` · ${formatShortDate(row.lastContactedAt)}` : ''
                              }`
                            : '—'}
                        </span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleMarkContacted(row.id)}
                          className="motion-focus inline-flex items-center gap-1 rounded-full border border-stroke-default bg-bg-elevated px-2.5 py-1 text-xs font-medium text-content-secondary hover:border-stroke-strong hover:text-content-primary disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                          Mark contacted
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <select
                        value={row.contactStatus}
                        disabled={isBusy}
                        onChange={(event) =>
                          void handleStatusChange(row.id, event.target.value as ContactStatus)
                        }
                        className="motion-focus h-8 rounded-md border border-stroke-default bg-bg-elevated px-2 text-xs text-content-primary hover:border-stroke-strong focus:border-brand disabled:opacity-60"
                      >
                        {Object.entries(contactStatusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-[220px] px-4 py-3">
                      {isEditingNotes ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={notesDraft}
                            onChange={(event) => setNotesDraft(event.target.value)}
                            rows={2}
                            className="motion-focus w-full min-w-[200px] rounded-md border border-stroke-default bg-bg-elevated px-2 py-1 text-xs text-content-primary focus:border-brand"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleSaveNotes(row.id)}
                              className="motion-focus rounded-md border border-brand bg-brand/8 px-2 py-1 text-xs font-medium text-content-primary disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNotesId(null);
                                setNotesDraft('');
                              }}
                              className="motion-focus rounded-md border border-stroke-default px-2 py-1 text-xs font-medium text-content-secondary hover:text-content-primary"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNotesId(row.id);
                            setNotesDraft(row.adminNotes ?? '');
                          }}
                          title={row.adminNotes ?? undefined}
                          className="motion-focus block max-w-[220px] truncate text-left text-xs text-content-secondary hover:text-content-primary"
                        >
                          {row.adminNotes || 'Add note'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
