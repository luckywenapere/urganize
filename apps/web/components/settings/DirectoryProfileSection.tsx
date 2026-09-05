'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  PERSON_AVAILABILITIES,
  PERSON_AVAILABILITY_COPY,
  PERSON_BIO_MAX_CHARS,
  PERSON_ROLES_MAX,
  PERSON_VISIBILITIES,
  PERSON_VISIBILITY_COPY,
} from '@/lib/person-profile';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import type { PersonProfile, ProfileRole } from '@/types/directory';
import { panelClass } from './panelClass';

const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';

/**
 * Your record in the directory, and who is allowed to see it.
 *
 * Opting in is the whole first decision, so the section leads with it rather
 * than burying it under a form: somebody who does not want to be found should
 * be able to read one line, do nothing, and be right.
 *
 * WHAT YOU TYPE AND WHAT YOU HAVE DELIVERED ARE SHOWN APART, and that
 * separation is the feature rather than a layout choice. The roles you tick are
 * a claim; the counts underneath come from releases that actually came out and
 * cannot be edited from here or anywhere else. Blurring them would put the
 * whole record back at the mercy of self-reporting.
 *
 * Lives in Account rather than Workspace because a profile belongs to the
 * person: it follows them if they leave the team, which is exactly the point of
 * a record that outlives a job. It is also, like Report an issue and Admin
 * above it, only reachable on a phone from this tab.
 */
export function DirectoryProfileSection() {
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [roles, setRoles] = useState<ProfileRole[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  }, []);

  const apply = useCallback((body: { profile: PersonProfile | null; roles: ProfileRole[] }) => {
    setProfile(body.profile);
    setRoles(Array.isArray(body.roles) ? body.roles : []);
    if (body.profile) setName(body.profile.displayName);
  }, []);

  useEffect(() => {
    if (!DIRECTORY_ENABLED) return;
    let cancelled = false;

    const load = async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch('/api/directory/profile', { headers, cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) apply(body);
      } catch {
        // Silent: an unreadable profile is not worth an error box on a settings
        // page somebody opened to do something else. The save path reports.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [apply, authHeaders]);

  const save = async (patch: Record<string, unknown>) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/directory/profile', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not save that.');
        return;
      }
      apply(body);
    } catch {
      setError('Could not save that. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  if (!DIRECTORY_ENABLED) return null;

  const claimed = new Set(profile?.roles ?? []);
  const delivered = roles.filter((entry) => entry.delivered > 0);

  const toggleRole = (role: DirectoryRole) => {
    const next = new Set(claimed);
    if (next.has(role)) next.delete(role);
    else if (next.size >= PERSON_ROLES_MAX) return;
    else next.add(role);
    void save({ roles: [...next] });
  };

  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Your directory record
      </h2>
      <p className="mb-4 text-sm text-content-secondary">
        Managers use the directory to find people who have delivered the work a release needs. You
        are not listed until you say so.
      </p>

      {!loaded ? (
        <div className="h-24 animate-pulse rounded-lg bg-bg-elevated" aria-hidden />
      ) : !profile ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-content-tertiary">Your name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ada Obi"
              className="h-11 w-full rounded-lg border border-stroke-default bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void save({ displayName: name.trim(), visibility: 'directory' })}
            className="motion-focus inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            List me
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">Who can find you</span>
            <select
              value={profile.visibility}
              disabled={busy}
              onChange={(event) => void save({ visibility: event.target.value })}
              className="h-11 w-full rounded-lg border border-stroke-default bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
            >
              {PERSON_VISIBILITIES.map((value) => (
                <option key={value} value={value}>
                  {PERSON_VISIBILITY_COPY[value].label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-content-tertiary">
              {PERSON_VISIBILITY_COPY[profile.visibility].hint}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">Are you taking work</span>
            <select
              value={profile.availability}
              disabled={busy}
              onChange={(event) => void save({ availability: event.target.value })}
              className="h-11 w-full rounded-lg border border-stroke-default bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
            >
              {PERSON_AVAILABILITIES.map((value) => (
                <option key={value} value={value}>
                  {PERSON_AVAILABILITY_COPY[value].label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-content-tertiary">
              {PERSON_AVAILABILITY_COPY[profile.availability].hint}
            </span>
          </label>

          <div>
            <span className="mb-2 block text-xs text-content-tertiary">
              What you do. Pick up to {PERSON_ROLES_MAX}.
            </span>
            <div className="flex flex-wrap gap-2">
              {DIRECTORY_ROLES.map((role) => {
                const on = claimed.has(role);
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    onClick={() => toggleRole(role)}
                    className={`motion-focus rounded-full border px-3 py-1.5 text-sm disabled:opacity-60 ${
                      on
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-stroke-default text-content-secondary hover:border-brand'
                    }`}
                  >
                    {DIRECTORY_ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deliberately apart from the picker above. These are not a claim
              and nothing on this page can change them. */}
          <div>
            <span className="mb-2 block text-xs text-content-tertiary">What you have delivered</span>
            {delivered.length === 0 ? (
              <p className="text-sm text-content-secondary">
                Nothing yet. This fills in on its own once a release you worked on comes out.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {delivered.map((entry) => (
                  <li
                    key={entry.role}
                    className="rounded-full border border-stroke-default px-3 py-1.5 text-sm text-content-primary"
                  >
                    {DIRECTORY_ROLE_LABELS[entry.role]}
                    <span className="ml-1.5 text-content-tertiary">{entry.delivered} delivered</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">
              A line about you. Optional.
            </span>
            <textarea
              defaultValue={profile.bio ?? ''}
              disabled={busy}
              rows={3}
              maxLength={PERSON_BIO_MAX_CHARS}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next !== (profile.bio ?? '')) void save({ bio: next || null });
              }}
              className="w-full rounded-lg border border-stroke-default bg-bg-base px-3 py-2 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {(['city', 'country'] as const).map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-xs capitalize text-content-tertiary">{field}</span>
                <input
                  defaultValue={profile[field] ?? ''}
                  disabled={busy}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next !== (profile[field] ?? '')) void save({ [field]: next || null });
                  }}
                  className="h-11 w-full rounded-lg border border-stroke-default bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none disabled:opacity-60"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-status-error">{error}</p> : null}
    </section>
  );
}
