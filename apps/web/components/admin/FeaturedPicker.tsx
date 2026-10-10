'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  DIRECTORY_ROLES,
  DIRECTORY_ROLE_LABELS,
  type DirectoryRole,
} from '@/lib/directory-roles';
import { FEATURED_NOTE_MAX_CHARS, SHELF_SIZE } from '@/lib/directory-featuring';
import type { AdminCandidate, AdminFeaturedEntry } from '@/lib/directory-featuring-server';

/**
 * Who is Featured in the directory, and who is On the rise this month (spec,
 * section 6). Featured is picked by hand and signed off here; On the rise is read
 * only, because it is earned from delivered work and refreshed by the daily
 * sweep, and nobody should be able to type their way onto it.
 *
 * Internal, like the page it sits on. The backing route answers verifyAdmin
 * first, so a person who is not an admin never sees a list of candidates.
 */

type RisingPayload = {
  month: string;
  people: { userId: string; displayName: string; role: DirectoryRole; rank: number }[];
};

type Payload = {
  featured: AdminFeaturedEntry[];
  candidates: AdminCandidate[];
  rising: RisingPayload;
  error?: string;
};

const controlClass =
  'h-11 w-full rounded-lg border border-stroke-control bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none';

export function FeaturedPicker() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<DirectoryRole | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  }, []);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch('/api/admin/directory/featured', { headers, cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as Partial<Payload> & {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error || 'Could not load the featured picks.');
        return;
      }
      setError('');
      setPayload({
        featured: body.featured || [],
        candidates: body.candidates || [],
        rising: body.rising || { month: '', people: [] },
        error: body.error,
      });
    } catch {
      setError('Could not load the featured picks.');
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = payload?.candidates.find((candidate) => candidate.userId === userId) ?? null;

  const choosePerson = (next: string) => {
    setUserId(next);
    const person = payload?.candidates.find((candidate) => candidate.userId === next);
    // Their own first role is the likeliest thing you meant. It is only a
    // starting point and the role is changeable.
    setRole(person?.roles[0] ?? '');
  };

  const add = async () => {
    if (!userId || !role) return;
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/directory/featured', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, role, note }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || 'Could not feature them.');
        return;
      }
      setUserId('');
      setRole('');
      setNote('');
      await load();
    } catch {
      setError('Could not feature them. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/directory/featured?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Could not remove that.');
        return;
      }
      await load();
    } catch {
      setError('Could not remove that. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const featured = payload?.featured ?? [];
  const rising = payload?.rising.people ?? [];

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-content-primary">Featured and on the rise</h2>
      <p className="mt-1 max-w-2xl text-sm text-content-secondary">
        Featured is your pick, for three months, up to {SHELF_SIZE} a role, and only people who
        have published a profile. On the rise is worked out from delivered work and set once a
        month. Nobody is ranked.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs text-content-tertiary">Person</span>
          <select
            value={userId}
            onChange={(event) => choosePerson(event.target.value)}
            className={controlClass}
          >
            <option value="">Pick someone published</option>
            {(payload?.candidates ?? []).map((candidate) => (
              <option key={candidate.userId} value={candidate.userId}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-content-tertiary">Featured as</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as DirectoryRole | '')}
            className={controlClass}
          >
            <option value="">Pick a role</option>
            {DIRECTORY_ROLES.map((value) => (
              <option key={value} value={value}>
                {DIRECTORY_ROLE_LABELS[value]}
                {pick && pick.roles.includes(value) ? ' (theirs)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-content-tertiary">
            Why ({FEATURED_NOTE_MAX_CHARS - note.length} left, only you see this)
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, FEATURED_NOTE_MAX_CHARS))}
            className={controlClass}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !userId || !role}
        onClick={() => void add()}
        className="motion-focus mt-3 h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse disabled:opacity-60"
      >
        Feature them
      </button>

      {featured.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {featured.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-default px-3 py-2"
            >
              <span className="min-w-0 text-sm text-content-primary">
                {entry.displayName}
                <span className="text-content-tertiary">
                  {' · '}
                  {DIRECTORY_ROLE_LABELS[entry.role]}
                  {' · '}
                  {entry.startsOn} to {entry.endsOn}
                </span>
                {entry.listed ? null : (
                  <span className="ml-2 text-xs text-status-warning">not published now</span>
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(entry.id)}
                className="motion-focus min-h-11 rounded-lg px-3 text-sm text-content-secondary underline underline-offset-2 hover:text-content-primary disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-content-tertiary">Nobody is featured yet.</p>
      )}

      <h3 className="mt-6 text-sm font-semibold text-content-primary">
        On the rise{payload?.rising.month ? ` · ${payload.rising.month.slice(0, 7)}` : ''}
      </h3>
      {rising.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {rising.map((entry) => (
            <li key={`${entry.role}-${entry.userId}`} className="text-sm text-content-secondary">
              {entry.displayName} · {DIRECTORY_ROLE_LABELS[entry.role]}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-content-tertiary">
          Nobody yet this month. It fills in once somebody has been on a rollout that came out in
          the last 90 days.
        </p>
      )}
    </section>
  );
}
