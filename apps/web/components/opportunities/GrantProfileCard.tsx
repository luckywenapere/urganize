'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  APPLICANT_LABEL,
  APPLICANT_TYPES,
  EMPTY_GRANT_PROFILE,
  GRANT_PROFILE_COPY,
  GRANT_PROFILE_COUNTRIES,
  MAX_PROFILE_GENRES,
  MAX_PROFILE_NEEDS,
  type GrantProfile,
} from '@/lib/grants/grant-profile';
import { GRANT_GENRES, GRANT_NEEDS, GRANT_STAGES, titleCase } from '@/lib/grants/query-builder';

// The team's grant profile, on Opportunities. Suggested grants match on it.
// Rendered only when NEXT_PUBLIC_FEATURE_GRANT_SUGGESTIONS is on (the page decides).
// Memory only: the profile is reloaded on each visit, never kept in localStorage.

const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary hover:border-content-secondary';

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

function toggle<T>(list: T[], item: T, max: number): T[] {
  if (list.includes(item)) return list.filter((value) => value !== item);
  return list.length >= max ? list : [...list, item];
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`motion-focus rounded-full border px-3 py-1.5 text-sm font-semibold ${
        on ? 'border-brand bg-brand/10 text-content-primary' : 'border-stroke-control text-content-secondary hover:border-content-secondary'
      }`}
    >
      {label}
    </button>
  );
}

export function GrantProfileCard() {
  const [profile, setProfile] = useState<GrantProfile>(EMPTY_GRANT_PROFILE);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch('/api/opportunities/grant-profile', { headers, cache: 'no-store' });
        if (!response.ok || !live) return;
        const body = (await response.json()) as { profile: GrantProfile; saved: boolean };
        if (!live) return;
        setProfile(body.profile);
        setSaved(body.saved);
        setOpen(!body.saved);
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    if (busy) return;
    if (!profile.country) {
      setError(GRANT_PROFILE_COPY.missingCountry);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setError('You are signed out. Sign in and try again.');
        return;
      }
      const response = await fetch('/api/opportunities/grant-profile', {
        method: 'PUT',
        headers,
        body: JSON.stringify(profile),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Could not save your grant profile.');
        return;
      }
      setProfile(body.profile);
      setSaved(true);
      setOpen(false);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  if (!open) {
    const parts = [profile.country ? titleCase(profile.country) : null, profile.stage].filter(Boolean);
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface px-4 py-3">
        <p className="text-sm text-content-secondary">
          <span className="font-semibold text-content-primary">{GRANT_PROFILE_COPY.title}</span>
          {saved && parts.length > 0 ? ` · ${parts.join(' · ')}` : null}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="motion-focus rounded-lg px-3 py-1.5 text-sm font-semibold text-content-secondary hover:text-content-primary"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <section aria-label={GRANT_PROFILE_COPY.title} className="mb-6 space-y-4 rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-content-primary">{GRANT_PROFILE_COPY.title}</h2>
        <p className="mt-1 text-sm text-content-secondary">{GRANT_PROFILE_COPY.description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-content-secondary">
          Based in
          <select
            className={`${FIELD} mt-1`}
            value={profile.country ?? ''}
            onChange={(event) => setProfile({ ...profile, country: (event.target.value || null) as GrantProfile['country'] })}
          >
            <option value="">Pick a country</option>
            {GRANT_PROFILE_COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {titleCase(country)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-content-secondary">
          Career stage
          <select
            className={`${FIELD} mt-1`}
            value={profile.stage ?? ''}
            onChange={(event) => setProfile({ ...profile, stage: (event.target.value || null) as GrantProfile['stage'] })}
          >
            <option value="">Not sure</option>
            {GRANT_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage.charAt(0).toUpperCase() + stage.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-xs font-semibold text-content-secondary">Who applies</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {APPLICANT_TYPES.map((type) => (
            <Chip
              key={type}
              on={profile.applicantTypes.includes(type)}
              label={APPLICANT_LABEL[type]}
              onClick={() => {
                const next = toggle(profile.applicantTypes, type, APPLICANT_TYPES.length);
                if (next.length > 0) setProfile({ ...profile, applicantTypes: next });
              }}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xs font-semibold text-content-secondary">Genres (up to {MAX_PROFILE_GENRES})</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {GRANT_GENRES.map((genre) => (
            <Chip
              key={genre}
              on={profile.genres.includes(genre)}
              label={titleCase(genre)}
              onClick={() => setProfile({ ...profile, genres: toggle(profile.genres, genre, MAX_PROFILE_GENRES) })}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xs font-semibold text-content-secondary">Money for (up to {MAX_PROFILE_NEEDS})</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {GRANT_NEEDS.map((need) => (
            <Chip
              key={need}
              on={profile.needs.includes(need)}
              label={need.charAt(0).toUpperCase() + need.slice(1)}
              onClick={() => setProfile({ ...profile, needs: toggle(profile.needs, need, MAX_PROFILE_NEEDS) })}
            />
          ))}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {saved ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="motion-focus rounded-lg px-3 py-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="motion-focus rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand/90 disabled:opacity-50"
        >
          {busy ? 'Saving' : GRANT_PROFILE_COPY.save}
        </button>
      </div>
    </section>
  );
}
