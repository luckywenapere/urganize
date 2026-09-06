'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  applyDirectoryFilters,
  availableCities,
  fallbackCounts,
  type DirectoryEntry,
  type DirectoryFilters,
} from '@/lib/directory-search';
import { DIRECTORY_ROLES, DIRECTORY_ROLE_LABELS, type DirectoryRole } from '@/lib/directory-roles';
import { PERSON_AVAILABILITIES, PERSON_AVAILABILITY_COPY } from '@/lib/person-profile';
import type { PersonAvailability } from '@/types/directory';
import { DirectoryEmptyState } from '@/components/directory/DirectoryEmptyState';

const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';

/**
 * Find somebody who has delivered the work a release needs.
 *
 * FILTERS IN THE BROWSER over a set fetched once. lib/directory-search.ts
 * carries the full reasoning; the short version is that the empty state has to
 * say how many people exist NEARBY, which is free with the set in hand and a
 * round trip per suggestion without it.
 *
 * A card links to /p/{slug} only for a PUBLIC profile. Somebody listed as
 * `directory` is findable here and their page is not open, so offering the link
 * would hand a manager a 404.
 */

type Person = DirectoryEntry & { slug: string | null; isPublic: boolean };

const NO_FILTERS: DirectoryFilters = { query: '', role: null, city: null, availability: null };

const controlClass =
  'h-11 rounded-lg border border-stroke-default bg-bg-base px-3 text-base text-content-primary focus:border-brand focus:outline-none';

export function DirectoryPageClient() {
  return (
    <Suspense fallback={<DirectoryFrame />}>
      <DirectoryBody />
    </Suspense>
  );
}

/** The header alone, so the Suspense boundary below shows something real
 *  rather than nothing while the params resolve. */
function DirectoryFrame() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-content-primary">Directory</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Find people who have delivered the work your release needs.
        </p>
      </header>
    </div>
  );
}

function DirectoryBody() {
  const router = useRouter();
  // Read ONCE, into the initial state, never mirrored. The role gaps panel
  // links here pre-filtered (?role=…&availability=open), and after that the
  // filters belong to whoever is typing — keeping them in sync with the URL
  // would make every keystroke fight a param nobody set.
  const searchParams = useSearchParams();
  const [people, setPeople] = useState<Person[]>([]);
  const [filters, setFilters] = useState<DirectoryFilters>(() => {
    const role = searchParams.get('role');
    const availability = searchParams.get('availability');
    return {
      ...NO_FILTERS,
      // Validated against the real vocabularies rather than trusted: a link
      // carrying a role that no longer exists must filter nothing rather than
      // filter everything out.
      role: role && (DIRECTORY_ROLES as readonly string[]).includes(role)
        ? (role as DirectoryRole)
        : null,
      availability:
        availability && (PERSON_AVAILABILITIES as readonly string[]).includes(availability)
          ? (availability as PersonAvailability)
          : null,
    };
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState('');
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!DIRECTORY_ENABLED) {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      try {
        const response = await fetch('/api/directory', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (response.status === 403 && body?.reason === 'plan_required') {
          setLocked(typeof body.error === 'string' ? body.error : 'Searching is on a higher plan.');
          return;
        }
        if (!response.ok) {
          setError(typeof body.error === 'string' ? body.error : 'Could not open the directory.');
          return;
        }

        setPeople(Array.isArray(body.people) ? body.people : []);
        setTruncated(Boolean(body.truncated));
      } catch {
        if (!cancelled) setError('Could not open the directory. Check your connection.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const results = useMemo(() => applyDirectoryFilters(people, filters), [people, filters]);
  const counts = useMemo(() => fallbackCounts(people, filters), [people, filters]);
  const cities = useMemo(() => availableCities(people), [people]);

  const patch = useCallback(
    (next: Partial<DirectoryFilters>) => setFilters((current) => ({ ...current, ...next })),
    []
  );

  if (!DIRECTORY_ENABLED) return null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-content-primary">Directory</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Find people who have delivered the work your release needs.
        </p>
      </header>

      {locked ? (
        <div className="rounded-xl border border-stroke-default p-6">
          <h2 className="text-base font-semibold text-content-primary">{locked}</h2>
          <p className="mt-2 text-sm text-content-secondary">
            Being listed stays free. You can add yourself in Settings whatever plan you are on.
          </p>
          <Link
            href="/locked?intent=upgrade"
            className="motion-focus mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse"
          >
            See plans
          </Link>
        </div>
      ) : !loaded ? (
        <div className="flex items-center gap-2 text-sm text-content-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Opening the directory
        </div>
      ) : error ? (
        <p className="text-sm text-status-error">{error}</p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
              placeholder="Search by name"
              aria-label="Search by name"
              className={`${controlClass} sm:col-span-2 lg:col-span-1`}
            />
            <select
              value={filters.role ?? ''}
              onChange={(event) => patch({ role: (event.target.value || null) as DirectoryRole | null })}
              aria-label="Filter by role"
              className={controlClass}
            >
              <option value="">Any role</option>
              {DIRECTORY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {DIRECTORY_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <select
              value={filters.city ?? ''}
              onChange={(event) => patch({ city: event.target.value || null })}
              aria-label="Filter by city"
              className={controlClass}
            >
              <option value="">Anywhere</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <select
              value={filters.availability ?? ''}
              onChange={(event) =>
                patch({ availability: (event.target.value || null) as PersonAvailability | null })
              }
              aria-label="Filter by availability"
              className={controlClass}
            >
              <option value="">Any availability</option>
              {PERSON_AVAILABILITIES.map((value) => (
                <option key={value} value={value}>
                  {PERSON_AVAILABILITY_COPY[value].label}
                </option>
              ))}
            </select>
          </div>

          {results.length === 0 ? (
            <DirectoryEmptyState
              nobodyListed={people.length === 0}
              counts={counts}
              role={filters.role}
              city={filters.city}
              hasQuery={filters.query.trim().length > 0}
              onClearQuery={() => patch({ query: '' })}
              onDropRole={() => patch({ role: null })}
              onDropCity={() => patch({ city: null })}
              onShowOpen={() => setFilters({ ...NO_FILTERS, availability: 'open' })}
              onListMe={() => router.push('/settings')}
            />
          ) : (
            <ul className="space-y-3">
              {results.map((person) => (
                <li key={person.userId}>
                  <PersonCard person={person} />
                </li>
              ))}
            </ul>
          )}

          {truncated ? (
            <p className="mt-4 text-xs text-content-tertiary">
              Showing the most recently updated profiles. Narrow the filters to see others.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function PersonCard({ person }: { person: Person }) {
  const delivered = person.roles.filter((entry) => entry.delivered > 0);
  const claimed = person.roles.filter((entry) => entry.delivered === 0);

  const body = (
    <div className="rounded-xl border border-stroke-default p-4 transition-colors hover:border-brand">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-content-primary">{person.displayName}</span>
        <span className="text-xs text-content-tertiary">
          {PERSON_AVAILABILITY_COPY[person.availability].label}
          {person.city ? ` · ${person.city}` : ''}
        </span>
      </div>

      {/* Delivered and claimed are kept apart here exactly as they are on the
          profile and in Settings. A count is something the product vouches for;
          a bare role is the person's own word. */}
      {delivered.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {delivered.map((entry) => (
            <li
              key={entry.role}
              className="rounded-full border border-stroke-default px-3 py-1 text-sm text-content-primary"
            >
              {DIRECTORY_ROLE_LABELS[entry.role]}
              <span className="ml-1.5 text-brand">{entry.delivered} delivered</span>
            </li>
          ))}
        </ul>
      ) : null}

      {claimed.length > 0 ? (
        <p className="mt-2 text-xs text-content-tertiary">
          Also works as {claimed.map((entry) => DIRECTORY_ROLE_LABELS[entry.role]).join(', ')}
        </p>
      ) : null}
    </div>
  );

  return person.isPublic && person.slug ? (
    <Link href={`/p/${person.slug}`} className="motion-focus block">
      {body}
    </Link>
  ) : (
    body
  );
}
