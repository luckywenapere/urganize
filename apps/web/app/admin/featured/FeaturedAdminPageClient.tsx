'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import type { AdminFeaturedPayload } from '@/lib/featured-shelves-server';

// /admin/featured: the hand-picked shelf above the directory.
//
// Urganize signs off every name. Up to six people per role, one quarter at a
// time, and only a claimed, listed profile can be picked. There is no price and
// no way to pay for a place: this is editorial.
//
// Follows the /admin/directory gate and load pattern (the backing GET's
// 401/403 is the real gate).

const fieldClass =
  'h-11 rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none';

type QuarterKey = 'current' | 'next';

export default function FeaturedAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<AdminFeaturedPayload | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [quarter, setQuarter] = useState<QuarterKey>('current');
  const [role, setRole] = useState<DirectoryRole>('producer');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (init: RequestInit = {}, query = '') => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return null;
      return fetch(`/api/admin/featured${query}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        cache: 'no-store',
      });
    },
    []
  );

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      try {
        const response = await call();
        if (!response) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        if (response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<AdminFeaturedPayload> & {
          error?: string;
        };
        if (!response.ok) {
          setError(body.error || 'Could not load the shelf.');
          return;
        }
        setPayload({
          quarters: body.quarters || [],
          featured: body.featured || [],
          candidates: body.candidates || [],
          perRole: body.perRole ?? 6,
        });
        setChecked(true);
      } catch {
        setError('Could not load the shelf.');
      }
    },
    [call, router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, user, router, load]);

  const chosenQuarter = payload?.quarters.find((entry) => entry.key === quarter);

  const inQuarter = useMemo(
    () => (payload?.featured || []).filter((row) => row.startsAt === chosenQuarter?.startsAt),
    [payload, chosenQuarter]
  );

  const featuredRoleIds = useMemo(
    () => new Set(inQuarter.filter((row) => row.role === role).map((row) => row.profileId)),
    [inQuarter, role]
  );

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (payload?.candidates || [])
      .filter((person) => person.roles.includes(role))
      .filter((person) => !featuredRoleIds.has(person.profileId))
      .filter((person) => !needle || person.displayName.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [payload, role, search, featuredRoleIds]);

  const roleCount = inQuarter.filter((row) => row.role === role).length;
  const roleFull = roleCount >= (payload?.perRole ?? 6);

  async function add(profileId: string) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await call({
        method: 'POST',
        body: JSON.stringify({ profileId, role, quarter }),
      });
      const body = (await response?.json().catch(() => ({}))) as { error?: string };
      if (!response || !response.ok) {
        setError(body?.error || 'Could not add them.');
        return;
      }
      setNotice('Added.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await call({ method: 'DELETE' }, `?id=${encodeURIComponent(id)}`);
      if (!response || !response.ok) {
        setError('Could not remove them.');
        return;
      }
      setNotice('Removed.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !checked) {
    return <AdminPageSkeleton titleWidth="w-40" descriptionLines={2} table={{ columns: 4, rows: 5 }} />;
  }

  const rolesWithPeople = DIRECTORY_ROLES.filter((value) => inQuarter.some((row) => row.role === value));

  return (
    <div>
      <h1 className="mt-2 font-display text-2xl text-content-primary">Featured</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        The people shown first in the directory. Up to {payload?.perRole ?? 6} per role, one quarter
        at a time. Only a claimed, listed profile can be picked, and nobody can pay for a place.
      </p>

      <div role="status" aria-live="polite">
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error"
          >
            {error}
          </p>
        ) : null}
        {notice ? <p className="mt-4 text-sm text-content-secondary">{notice}</p> : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="radiogroup" aria-label="Quarter">
        {(payload?.quarters || []).map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="radio"
            aria-checked={quarter === entry.key}
            onClick={() => setQuarter(entry.key)}
            className={`motion-focus min-h-11 rounded-full border px-4 text-sm ${
              quarter === entry.key
                ? 'border-brand bg-brand/10 text-content-primary'
                : 'border-stroke-control text-content-secondary hover:border-content-secondary'
            }`}
          >
            {entry.label}
            {entry.key === 'current' ? ' (now)' : ' (next)'}
          </button>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">Add someone</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-content-tertiary">Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as DirectoryRole)}
              className={`${fieldClass} field-native mt-1 w-full`}
            >
              {DIRECTORY_ROLES.map((value) => (
                <option key={value} value={value}>
                  {DIRECTORY_ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-content-tertiary">Search by name</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${fieldClass} mt-1 w-full`}
              placeholder="Start typing"
            />
          </label>
        </div>
        <p className="mt-2 text-sm text-content-tertiary">
          {roleCount} of {payload?.perRole ?? 6} taken for {DIRECTORY_ROLE_LABELS[role]} this quarter.
        </p>
        {matches.length === 0 ? (
          <p className="mt-3 text-sm text-content-tertiary">
            Nobody listed holds this role yet, or everyone who does is already picked.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {matches.map((person) => (
              <li
                key={person.profileId}
                className="flex items-center justify-between gap-3 rounded-lg border border-stroke-default px-3 py-2"
              >
                <span className="text-sm text-content-primary">{person.displayName}</span>
                <button
                  type="button"
                  disabled={busy || roleFull}
                  onClick={() => void add(person.profileId)}
                  className="motion-focus min-h-11 rounded-lg border border-stroke-control px-4 text-sm font-medium text-content-primary hover:border-brand disabled:opacity-50"
                >
                  {roleFull ? 'Role is full' : 'Feature'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-content-primary">
          Featured in {chosenQuarter?.label}
        </h2>
        {rolesWithPeople.length === 0 ? (
          <p className="mt-3 text-sm text-content-tertiary">Nobody is featured for this quarter yet.</p>
        ) : (
          <div className="mt-3 space-y-5">
            {rolesWithPeople.map((value) => (
              <div key={value}>
                <h3 className="text-sm font-medium text-content-secondary">{DIRECTORY_ROLE_LABELS[value]}</h3>
                <ul className="mt-2 space-y-2">
                  {inQuarter
                    .filter((row) => row.role === value)
                    .map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-stroke-default px-3 py-2"
                      >
                        <span className="text-sm text-content-primary">
                          {row.displayName}
                          {!row.published ? (
                            <span className="ml-2 text-xs text-status-warning">Not listed now, hidden from the shelf</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(row.id)}
                          className="motion-focus min-h-11 rounded-lg border border-stroke-control px-4 text-sm text-content-secondary hover:border-status-error hover:text-status-error disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
